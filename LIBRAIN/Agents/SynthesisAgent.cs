using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using Anthropic.SDK.Common;
using Anthropic.SDK.Constants;
using Anthropic.SDK.Messaging;
using LIBRAIN.Storage;
using AnthropicTool = Anthropic.SDK.Common.Tool;

namespace LIBRAIN.Agents;

public sealed class SynthesisAgent(
    ILogger<SynthesisAgent> logger,
    AnthropicChatClient claude)
{
    private readonly ILogger<SynthesisAgent> _logger = logger;
    private readonly AnthropicChatClient _claude = claude;

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

    private static readonly AnthropicTool SubmitHypothesisTool =
        new Function("submit_hypothesis", "Submit a citation-grounded hypothesis.", JsonNode.Parse(ToolSchemaJson)!);

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
        var parameters = new MessageParameters
        {
            Messages = new List<Message> { new Message(RoleType.User, BuildUserPrompt(query, chunks)) },
            System = new List<SystemMessage> { new SystemMessage(SystemPromptText) },
            Tools = new List<AnthropicTool> { SubmitHypothesisTool },
            ToolChoice = new ToolChoice { Type = ToolChoiceType.Tool, Name = "submit_hypothesis" },
            MaxTokens = 1024,
            Model = AnthropicModels.Claude46Sonnet,
            Temperature = 0.2m,
            Stream = false,
            PromptCaching = PromptCacheType.AutomaticToolsAndSystem,
        };

        var res = await _claude.ChatAsync(parameters, ct).ConfigureAwait(false);

        var toolUse = res.Content.OfType<ToolUseContent>().FirstOrDefault();
        if (toolUse is null)
        {
            _logger.LogWarning("Forced tool call did not fire (stopReason={StopReason})", res.StopReason);
            throw new InvalidOperationException(
                $"Claude did not emit a tool_use block (correlationId={corrId}, stopReason={res.StopReason})");
        }

        var input = toolUse.Input ?? throw new InvalidOperationException(
            $"Tool use block had null input (correlationId={corrId})");

        var hypothesis = input["hypothesis"]?.GetValue<string>()
            ?? throw new InvalidOperationException($"Missing 'hypothesis' (correlationId={corrId})");

        var rawIndices = input["citation_indices"]?.AsArray()
            .Select(n => n!.GetValue<int>()).ToArray()
            ?? throw new InvalidOperationException($"Missing 'citation_indices' (correlationId={corrId})");

        var validated = SynthesisCitations.Validate(rawIndices, chunks);

        float? confidence = input["confidence"] is JsonNode confNode
            ? (float)confNode.GetValue<double>()
            : null;

        var unsupported = input["unsupported_claims"]?.AsArray()
            .Select(n => n?.GetValue<string>() ?? string.Empty)
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
            res.Usage.CacheReadInputTokens,
            res.Usage.CacheCreationInputTokens,
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
