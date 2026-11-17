using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using LIBRAIN.Llm;
using LIBRAIN.Models;
using LIBRAIN.Storage;
using Microsoft.Extensions.Options;

namespace LIBRAIN.Agents;

public sealed class SynthesisAgent(
    ILogger<SynthesisAgent> logger,
    ILlmClient llm,
    IOptions<ModelOptions> modelOptions)
{
    private readonly ILogger<SynthesisAgent> _logger = logger;
    private readonly ILlmClient _llm = llm;
    private readonly string _synthesisModel = ModelSelection.SynthesisModel(modelOptions.Value);

    private const string SystemPromptText = """
        You are a research synthesis assistant for a literature-review system. You are given
        a user query and a numbered list of source excerpts retrieved from academic papers.

        Form a single, conservative hypothesis grounded ONLY in the provided sources. Cite by
        source number. List any claim in your hypothesis that is NOT directly supported by a
        cited source in `unsupported_claims`; if all claims are supported, return an empty array.

        If the sources are insufficient to form any defensible hypothesis: set `confidence`
        below 0.3, populate `unsupported_claims` with what's missing, and write a hypothesis
        stating the limitation explicitly (e.g., "The provided sources do not address X").

        Always call the `submit_hypothesis` tool. Do not respond in plain text.
        """;

    // Schema is raw JSON because Anthropic.SDK.Messaging.Property in 5.10 has no Items field;
    // it can't express array<integer> via the typed builder. Function's (string, string, JsonNode)
    // ctor accepts a parsed schema directly.
    private const string ToolSchemaJson = """
        {
          "type": "object",
          "properties": {
            "hypothesis":         { "type": "string",  "description": "A single conservative claim grounded only in the provided sources." },
            "citation_indices":   { "type": "array",   "items": { "type": "integer" }, "description": "1-based indices into the SOURCES block, ordered by relevance." },
            "confidence":         { "type": "number",  "description": "Self-reported 0.0-1.0; lower if sources are sparse or contradictory." },
            "unsupported_claims": { "type": "array",   "items": { "type": "string" },  "description": "Substrings of the hypothesis that are NOT directly supported by the cited sources. Empty array if all claims are supported." }
          },
          "required": ["hypothesis", "citation_indices", "confidence", "unsupported_claims"]
        }
        """;

    private static readonly LlmTool SubmitHypothesisTool =
        LlmTool.FromJsonSchema("submit_hypothesis", "Submit a citation-grounded hypothesis.", ToolSchemaJson);

    public async Task<SynthesisResult> SynthesizeAsync(
        string query,
        IReadOnlyList<SearchHit> chunks,
        Guid? correlationId = null,
        CancellationToken ct = default)
    {
        var corrId = correlationId ?? Guid.NewGuid();
        using var scope = _logger.BeginScope(new Dictionary<string, object>
        {
            ["correlationId"] = corrId,
            ["chunkCount"] = chunks.Count,
        });

        if (chunks.Count == 0 || chunks.All(c => string.IsNullOrWhiteSpace(c.Content)))
        {
            _logger.LogWarning("Synthesis skipped: no usable source chunks");
            return new SynthesisResult(
                Hypothesis: "Insufficient sources to form a hypothesis.",
                Citations: Array.Empty<SynthesisCitation>(),
                Confidence: null,
                UnsupportedClaims: Array.Empty<string>(),
                CorrelationId: corrId);
        }

        var sw = Stopwatch.StartNew();
        var request = new LlmRequest(
            Model: _synthesisModel,
            SystemPrompt: SystemPromptText,
            UserPrompt: BuildUserPrompt(query, chunks),
            Temperature: 0.2m);

        var res = await _llm.CallToolAsync(request, SubmitHypothesisTool, ct).ConfigureAwait(false);

        var input = res.Input;

        var hypothesis = LlmJson.GetString(input["hypothesis"])
            ?? throw new InvalidOperationException($"Missing 'hypothesis' (correlationId={corrId})");

        var indexArray = LlmJson.GetArray(input["citation_indices"])
            ?? throw new InvalidOperationException($"Missing 'citation_indices' (correlationId={corrId})");
        // Non-integer entries map to 0, which SynthesisCitations.Validate already
        // rejects as out of range (indices are 1-based), so they count as dropped.
        var rawIndices = indexArray.Select(n => LlmJson.GetInt(n) ?? 0).ToArray();

        var validated = SynthesisCitations.Validate(rawIndices, chunks);

        float? confidence = LlmJson.GetDouble(input["confidence"]) is double conf
            ? (float)conf
            : null;

        var unsupported = LlmJson.GetArray(input["unsupported_claims"])?
            .Select(n => LlmJson.GetString(n) ?? string.Empty)
            .Where(s => !string.IsNullOrEmpty(s))
            .ToArray() ?? Array.Empty<string>();

        if (validated.Count < rawIndices.Length)
        {
            _logger.LogInformation(
                "Dropped {DroppedCount} invalid citation index(es) of {RequestedCount}",
                rawIndices.Length - validated.Count,
                rawIndices.Length);
        }

        if (validated.Count == 0)
        {
            _logger.LogWarning("All citation indices invalid; returning hypothesis without citations");
        }

        _logger.LogInformation(
            "Generated hypothesis ({CitationCount} valid of {RequestedCount} cited; input={InputTokens} output={OutputTokens} cacheRead={CacheRead} cacheCreate={CacheCreate} tokens) in {ElapsedMs}ms",
            validated.Count,
            rawIndices.Length,
            res.Usage.InputTokens,
            res.Usage.OutputTokens,
            res.Usage.CacheReadTokens,
            res.Usage.CacheCreationTokens,
            sw.ElapsedMilliseconds);

        return new SynthesisResult(hypothesis, validated, confidence, unsupported, corrId);
    }

    private static string BuildUserPrompt(string query, IReadOnlyList<SearchHit> chunks)
    {
        var sb = new StringBuilder();
        sb.Append("QUERY: ").AppendLine(query);
        sb.AppendLine();
        sb.AppendLine("SOURCES:");
        for (int i = 0; i < chunks.Count; i++)
        {
            var c = chunks[i];
            sb.Append('[').Append(i + 1).Append("] ").Append(c.PaperId);
            if (c.Section is not null) sb.Append(" | ").Append(c.Section);
            if (c.PageNumber is not null) sb.Append(" | p.").Append(c.PageNumber);
            sb.AppendLine();
            sb.AppendLine(c.Content);
            sb.AppendLine();
        }
        return sb.ToString();
    }
}

public static class SynthesisCitations
{
    public static IReadOnlyList<SynthesisCitation> Validate(
        IReadOnlyList<int> toolIndices,
        IReadOnlyList<SearchHit> hits)
    {
        if (toolIndices.Count == 0 || hits.Count == 0)
        {
            return Array.Empty<SynthesisCitation>();
        }

        var seen = new HashSet<int>();
        var result = new List<SynthesisCitation>(toolIndices.Count);
        foreach (var idx in toolIndices)
        {
            if (idx < 1 || idx > hits.Count) continue;
            if (!seen.Add(idx)) continue;
            var hit = hits[idx - 1];
            result.Add(new SynthesisCitation(
                Index: idx,
                PaperId: hit.PaperId,
                ChunkIndex: hit.ChunkIndex,
                Section: hit.Section,
                PageNumber: hit.PageNumber));
        }
        return result;
    }
}
