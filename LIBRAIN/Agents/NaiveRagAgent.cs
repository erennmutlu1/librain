using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Anthropic.SDK.Common;
using Anthropic.SDK.Messaging;
using LIBRAIN.Embeddings;
using LIBRAIN.Endpoints;
using LIBRAIN.Models;
using LIBRAIN.Storage;
using Microsoft.Extensions.Options;
using AnthropicTool = Anthropic.SDK.Common.Tool;

namespace LIBRAIN.Agents;

public sealed record ClaimedCitation(string PaperId, int ChunkIndex, bool IsResolved);

// Resolves claimed citations against the retrieved-chunk set and counts fabrications.
// Pulled out of NaiveRagAgent so the RQ3 measurement surface (fabrication count) is
// testable without spinning up the full agent.
public static partial class NaiveRagCitations
{
    public static (IReadOnlyList<ClaimedCitation> Resolved, int FabricatedCount) Resolve(
        IEnumerable<(string PaperId, int ChunkIndex)> claimed,
        ISet<(string PaperId, int ChunkIndex)> retrievedKeys)
    {
        var resolved = new List<ClaimedCitation>();
        int fabricated = 0;
        foreach (var (paperId, chunkIndex) in claimed)
        {
            var isResolved = retrievedKeys.Contains((paperId, chunkIndex));
            if (!isResolved) fabricated++;
            resolved.Add(new ClaimedCitation(paperId, chunkIndex, isResolved));
        }
        return (resolved, fabricated);
    }

    // Free-text citation mode (RQ3 fabrication-delta experiment). Extracts inline
    // bracket citations from hypothesis prose, e.g. "[2005.11401]", "[2005.11401:4]",
    // or "[graphcast, pangu-weather:2]". A token is treated as a citation candidate
    // only if it contains a letter or a '.', so arXiv ids (2005.11401) and kebab
    // stems (graphcast) are captured while bare list markers like "[3]" are ignored.
    [GeneratedRegex(@"\[([^\[\]]+)\]")]
    private static partial Regex BracketContents();

    public static IReadOnlyList<(string PaperId, int? ChunkIndex)> ParseFreeTextCitations(string text)
    {
        var result = new List<(string, int?)>();
        if (string.IsNullOrWhiteSpace(text)) return result;

        foreach (Match m in BracketContents().Matches(text))
        {
            var inner = m.Groups[1].Value;
            foreach (var rawToken in inner.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            {
                var token = rawToken.Trim();
                if (token.Length == 0) continue;

                string paperId = token;
                int? chunkIndex = null;
                var colon = token.LastIndexOf(':');
                if (colon > 0 && colon < token.Length - 1
                    && int.TryParse(token[(colon + 1)..].Trim(), out var idx))
                {
                    paperId = token[..colon].Trim();
                    chunkIndex = idx;
                }

                // Citation candidate only if it looks like a paper id (has a letter or a dot).
                if (!paperId.Any(char.IsLetter) && !paperId.Contains('.')) continue;
                result.Add((paperId, chunkIndex));
            }
        }
        return result;
    }

    // Resolve free-text citations: a cite is fabricated when its paper_id is not in the
    // retrieved set, OR when it names a chunk_index that was not retrieved for that paper.
    // A chunk-less cite resolves on paper_id membership alone.
    public static (IReadOnlyList<ClaimedCitation> Resolved, int FabricatedCount) ResolveFreeText(
        IEnumerable<(string PaperId, int? ChunkIndex)> claimed,
        ISet<(string PaperId, int ChunkIndex)> retrievedKeys,
        ISet<string> retrievedPaperIds)
    {
        var resolved = new List<ClaimedCitation>();
        int fabricated = 0;
        foreach (var (paperId, chunkIndex) in claimed)
        {
            var isResolved = chunkIndex is int ci
                ? retrievedKeys.Contains((paperId, ci))
                : retrievedPaperIds.Contains(paperId);
            if (!isResolved) fabricated++;
            resolved.Add(new ClaimedCitation(paperId, chunkIndex ?? -1, isResolved));
        }
        return (resolved, fabricated);
    }
}

public sealed record NaiveRagResult(
    Guid CorrelationId,
    string Hypothesis,
    int RetrievedChunkCount,
    IReadOnlyList<ClaimedCitation> ClaimedCitations,
    int FabricatedCitationCount,
    DiscoveryEvaluation Evaluation,
    long TotalElapsedMs,
    int InputTokens,
    int OutputTokens);

// Baseline #2: retrieve + single Claude call with structured output, BUT no citation
// validation contract and no novelClaim fence. Claimed citations are recorded verbatim
// from the model and resolved against the retrieved set post-hoc to measure fabrication
// rate, providing the comparison data ("does the validation contract reduce
// hallucination?"). The hypothesis is treated as a single block for evaluation; the model
// is not asked to separate grounded vs. speculative claims.
public sealed class NaiveRagAgent(
    ILogger<NaiveRagAgent> logger,
    AnthropicChatClient claude,
    OpenAIEmbeddingClient embeddings,
    QdrantPaperRepository repo,
    NoveltyScorer noveltyScorer,
    DiscoveryEvaluatorAgent evaluator,
    IOptions<ModelOptions> modelOptions)
{
    private readonly ILogger<NaiveRagAgent> _logger = logger;
    private readonly AnthropicChatClient _claude = claude;
    private readonly OpenAIEmbeddingClient _embeddings = embeddings;
    private readonly QdrantPaperRepository _repo = repo;
    private readonly NoveltyScorer _noveltyScorer = noveltyScorer;
    private readonly DiscoveryEvaluatorAgent _evaluator = evaluator;
    private readonly string _synthesisModel = ModelSelection.SynthesisModel(modelOptions.Value);

    private const string SystemPrompt = """
        You are a scientific research assistant. You are given one or two topics and a
        numbered list of source excerpts retrieved from academic papers. Propose a single
        hypothesis (1–3 sentences) based on the provided sources. Cite the chunks that
        support your hypothesis by paper_id and chunk_index.

        Always call the `submit_hypothesis` tool. Do not respond in plain text.
        """;

    // Deliberately simpler schema than LIBRAIN's DiscoveryAgent: no novel_claim field,
    // no support_type distinction. Single hypothesis + flat list of cited chunks.
    private const string ToolSchemaJson = """
        {
          "type": "object",
          "properties": {
            "hypothesis": {
              "type": "string",
              "description": "1-3 sentence hypothesis grounded in the provided sources."
            },
            "claimed_citations": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "paper_id":    { "type": "string",  "description": "paper_id of the cited chunk." },
                  "chunk_index": { "type": "integer", "description": "chunk_index of the cited chunk." }
                },
                "required": ["paper_id", "chunk_index"]
              },
              "description": "Chunks the model claims support the hypothesis. NOT validated against the retrieved set."
            }
          },
          "required": ["hypothesis", "claimed_citations"]
        }
        """;

    private static readonly AnthropicTool SubmitHypothesisTool =
        new Function(
            "submit_hypothesis",
            "Submit a hypothesis with claimed supporting citations.",
            JsonNode.Parse(ToolSchemaJson)!);

    // Free-text citation mode (RQ3 fabrication-delta). The model cites inline in prose
    // rather than via a structured array — the regime where LLMs actually invent cites.
    private const string FreeTextSystemPrompt = """
        You are a scientific research assistant. You are given one or two topics and a
        numbered list of source excerpts retrieved from academic papers. Propose a single
        hypothesis (1–3 sentences) based on the provided sources. Cite your sources INLINE
        in the hypothesis text using square brackets with the paper_id, optionally with a
        chunk index, e.g. "[2005.11401]" or "[2005.11401:4]". Support every claim with a
        citation.

        Always call the `submit_hypothesis` tool with the hypothesis text (including the
        inline bracket citations). Do not respond in plain text.
        """;

    private const string FreeTextToolSchemaJson = """
        {
          "type": "object",
          "properties": {
            "hypothesis": {
              "type": "string",
              "description": "1-3 sentence hypothesis with inline bracket citations like [paper_id] or [paper_id:chunk_index]."
            }
          },
          "required": ["hypothesis"]
        }
        """;

    private static readonly AnthropicTool SubmitHypothesisFreeTextTool =
        new Function(
            "submit_hypothesis",
            "Submit a hypothesis with inline bracket citations in the text.",
            JsonNode.Parse(FreeTextToolSchemaJson)!);

    public async Task<NaiveRagResult> RunAsync(
        string topicA,
        string? topicB,
        int topK,
        string? citationMode = null,
        CancellationToken ct = default)
    {
        var freeText = string.Equals(citationMode, "free-text", StringComparison.OrdinalIgnoreCase);
        var corrId = Guid.NewGuid();
        using var scope = _logger.BeginScope(new Dictionary<string, object>
        {
            ["correlationId"] = corrId,
            ["pipeline"] = "naive-rag",
        });

        var totalSw = Stopwatch.StartNew();
        topicA = topicA.Trim();
        topicB = string.IsNullOrWhiteSpace(topicB) ? null : topicB!.Trim();

        // Retrieval, identical to DiscoveryAgent so the comparison is on pipeline,
        // not on retrieval differences. Same dedup + ordering.
        var topicTexts = topicB is null ? new[] { topicA } : new[] { topicA, topicB };
        var topicEmbeddings = await _embeddings.GenerateAsync(topicTexts, ct).ConfigureAwait(false);

        var hitsA = await _repo.VectorSearchAsync(topicEmbeddings[0], topK, ct).ConfigureAwait(false);
        var hitsB = topicB is null
            ? Array.Empty<SearchHit>()
            : await _repo.VectorSearchAsync(topicEmbeddings[1], topK, ct).ConfigureAwait(false);

        var seenKeys = new HashSet<(string PaperId, int ChunkIndex)>();
        var dedup = new List<SearchHit>(hitsA.Count + hitsB.Count);
        foreach (var hit in hitsA)
        {
            if (seenKeys.Add((hit.PaperId, hit.ChunkIndex))) dedup.Add(hit);
        }
        foreach (var hit in hitsB)
        {
            if (seenKeys.Add((hit.PaperId, hit.ChunkIndex))) dedup.Add(hit);
        }

        if (dedup.Count == 0)
        {
            throw new InvalidOperationException(
                $"Naive-RAG: no sources retrieved for topicA='{topicA}'{(topicB is null ? "" : $", topicB='{topicB}'")} (correlationId={corrId}).");
        }

        var chunkIdList = string.Join(",", dedup.Select(h => $"{h.PaperId}:{h.ChunkIndex}"));
        _logger.LogInformation(
            "Naive-RAG retrieval: topicA='{TopicA}' topicB='{TopicB}' topK={TopK} → {DedupCount} unique chunk(s) [{ChunkIds}]",
            topicA, topicB ?? "(none)", topK, dedup.Count, chunkIdList);

        var userPrompt = BuildUserPrompt(topicA, topicB, dedup);

        var sw = Stopwatch.StartNew();
        var parameters = new MessageParameters
        {
            Messages = new List<Message> { new Message(RoleType.User, userPrompt) },
            System = new List<SystemMessage> { new SystemMessage(freeText ? FreeTextSystemPrompt : SystemPrompt) },
            Tools = new List<AnthropicTool> { freeText ? SubmitHypothesisFreeTextTool : SubmitHypothesisTool },
            ToolChoice = new ToolChoice { Type = ToolChoiceType.Tool, Name = "submit_hypothesis" },
            MaxTokens = 1024,
            Model = _synthesisModel,
            Temperature = 0.2m,
            Stream = false,
            PromptCaching = PromptCacheType.AutomaticToolsAndSystem,
        };
        var res = await _claude.ChatAsync(parameters, ct).ConfigureAwait(false);
        var synthElapsedMs = sw.ElapsedMilliseconds;

        var toolUse = res.Content.OfType<ToolUseContent>().FirstOrDefault();
        if (toolUse is null)
        {
            throw new InvalidOperationException(
                $"Naive-RAG: forced tool call did not fire (correlationId={corrId}, stopReason={res.StopReason})");
        }

        var input = toolUse.Input ?? throw new InvalidOperationException(
            $"Naive-RAG: tool use block had null input (correlationId={corrId})");

        var hypothesis = input["hypothesis"]?.GetValue<string>()
            ?? throw new InvalidOperationException($"Naive-RAG: missing 'hypothesis' (correlationId={corrId})");

        // Parse claimed citations and resolve against the retrieved set post-hoc.
        // CRITICAL: unlike LIBRAIN, we do NOT drop unresolved claims; we record them
        // as fabrications. This is the RQ3 measurement surface.
        IReadOnlyList<ClaimedCitation> claimed;
        int fabricated;
        if (freeText)
        {
            // Citations live inline in the hypothesis prose; parse + resolve them.
            var retrievedPaperIds = new HashSet<string>(dedup.Select(h => h.PaperId));
            var parsedFree = NaiveRagCitations.ParseFreeTextCitations(hypothesis);
            (claimed, fabricated) = NaiveRagCitations.ResolveFreeText(parsedFree, seenKeys, retrievedPaperIds);
        }
        else
        {
            var rawCitations = input["claimed_citations"]?.AsArray() ?? new JsonArray();
            var parsed = new List<(string PaperId, int ChunkIndex)>(rawCitations.Count);
            foreach (var node in rawCitations)
            {
                if (node is null) continue;
                var paperId = node["paper_id"]?.GetValue<string>();
                var chunkIndex = node["chunk_index"]?.GetValue<int>();
                if (paperId is null || chunkIndex is null) continue;
                parsed.Add((paperId, chunkIndex.Value));
            }
            (claimed, fabricated) = NaiveRagCitations.Resolve(parsed, seenKeys);
        }

        _logger.LogInformation(
            "Naive-RAG synthesis ({CitationMode}): input={InputTokens} output={OutputTokens} cacheRead={CacheRead} cacheCreate={CacheCreate} tokens; claimed={ClaimedCount} resolved={ResolvedCount} fabricated={FabricatedCount} in {ElapsedMs}ms",
            freeText ? "free-text" : "structured",
            res.Usage.InputTokens, res.Usage.OutputTokens,
            res.Usage.CacheReadInputTokens, res.Usage.CacheCreationInputTokens,
            claimed.Count, claimed.Count - fabricated, fabricated, synthElapsedMs);

        // Score: treat the whole hypothesis as the speculative claim (no novelClaim fence).
        // Evaluator sees all retrieved chunks regardless of which the model cited; this
        // mirrors LIBRAIN's evaluator behavior (judging against retrieved evidence as a
        // whole) and isolates the pipeline-structure difference rather than introducing
        // a second confound.
        sw.Restart();
        var noveltyScore = await _noveltyScorer.ScoreAsync(hypothesis, ct).ConfigureAwait(false);
        var noveltyElapsedMs = sw.ElapsedMilliseconds;

        sw.Restart();
        var (plausibility, structuralCoherence, _) =
            await _evaluator.EvaluateAsync(hypothesis, hypothesis, dedup, ct).ConfigureAwait(false);
        var evalElapsedMs = sw.ElapsedMilliseconds;

        var evaluation = DiscoveryScoring.Aggregate(noveltyScore, plausibility, structuralCoherence);

        _logger.LogInformation(
            "Naive-RAG scoring: novelty={Novelty:F4} plausibility={Plausibility:F2} structuralCoherence={StructuralCoherence:F2} quality={Quality:F4} (novelty+{NoveltyMs}ms eval+{EvalMs}ms)",
            evaluation.NoveltyScore, evaluation.PlausibilityScore, evaluation.StructuralCoherenceScore, evaluation.QualityScore, noveltyElapsedMs, evalElapsedMs);

        return new NaiveRagResult(
            CorrelationId: corrId,
            Hypothesis: hypothesis,
            RetrievedChunkCount: dedup.Count,
            ClaimedCitations: claimed,
            FabricatedCitationCount: fabricated,
            Evaluation: evaluation,
            TotalElapsedMs: totalSw.ElapsedMilliseconds,
            InputTokens: res.Usage.InputTokens,
            OutputTokens: res.Usage.OutputTokens);
    }

    private static string BuildUserPrompt(string topicA, string? topicB, IReadOnlyList<SearchHit> chunks)
    {
        var sb = new StringBuilder();
        sb.Append("TOPIC A: ").AppendLine(topicA);
        if (topicB is not null)
        {
            sb.Append("TOPIC B: ").AppendLine(topicB);
        }
        sb.AppendLine();
        sb.AppendLine("SOURCES (cite by paper_id + chunk_index):");
        foreach (var c in chunks)
        {
            sb.Append("[paper_id=").Append(c.PaperId)
              .Append(" chunk_index=").Append(c.ChunkIndex);
            if (c.Section is not null) sb.Append(" | ").Append(c.Section);
            if (c.PageNumber is not null) sb.Append(" | p.").Append(c.PageNumber);
            sb.AppendLine("]");
            sb.AppendLine(c.Content);
            sb.AppendLine();
        }
        return sb.ToString();
    }
}
