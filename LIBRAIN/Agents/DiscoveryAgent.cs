using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using Anthropic.SDK.Common;
using Anthropic.SDK.Constants;
using Anthropic.SDK.Messaging;
using LIBRAIN.Embeddings;
using LIBRAIN.Endpoints;
using LIBRAIN.Storage;
using AnthropicTool = Anthropic.SDK.Common.Tool;

namespace LIBRAIN.Agents;

public sealed class DiscoveryAgent(
    ILogger<DiscoveryAgent> logger,
    AnthropicChatClient claude,
    OpenAIEmbeddingClient embeddings,
    QdrantPaperRepository repo,
    NoveltyScorer noveltyScorer)
{
    private readonly ILogger<DiscoveryAgent> _logger = logger;
    private readonly AnthropicChatClient _claude = claude;
    private readonly OpenAIEmbeddingClient _embeddings = embeddings;
    private readonly QdrantPaperRepository _repo = repo;
    private readonly NoveltyScorer _noveltyScorer = noveltyScorer;

    private const string SystemPrompt = """
        You are a discovery agent for a literature-cross-reference system. You are given
        one or two topics and a numbered list of source excerpts retrieved from academic
        papers covering each topic.

        Your job is the OPPOSITE of grounded synthesis: propose a hypothesis that goes
        BEYOND what the cited sources directly state. Connect ideas across the retrieved
        chunks into a claim that requires inferential extrapolation. The unsupported
        part is the discovery — flagging it explicitly is the contract.

        Return:
        - `hypothesis`: a 1–3 sentence claim. Combines evidence-grounded parts with the
          novel extrapolation.
        - `supporting_evidence`: chunks whose content supports parts of the hypothesis.
          Each entry has `paper_id` and `chunk_index` taken EXACTLY from a SOURCES
          entry, plus `support_type` = "direct" (the chunk states this part) or
          "analogous" (the chunk supports an analogous mechanism in a related domain).
        - `novel_claim`: the substring of `hypothesis` NOT directly supported by any
          retrieved chunk. This is the discovery. It MUST be non-empty. If the topics
          are well-covered by the corpus and the hypothesis is mostly grounded, extract
          the most extrapolative sentence as `novel_claim` and explain in `reasoning`
          that novelty is low.
        - `reasoning`: 1–2 sentences connecting the supporting evidence to the novel
          claim.

        Do not invent paper IDs or chunk indices. Always call the `submit_discovery`
        tool. Do not respond in plain text.
        """;

    private const string ToolSchemaJson = """
        {
          "type": "object",
          "properties": {
            "hypothesis": {
              "type": "string",
              "description": "1-3 sentence claim. Combines evidence-grounded parts with the novel extrapolation."
            },
            "supporting_evidence": {
              "type": "array",
              "items": {
                "type": "object",
                "properties": {
                  "paper_id":    { "type": "string",  "description": "Exact paper_id from a SOURCES entry (e.g. '2005.11401')." },
                  "chunk_index": { "type": "integer", "description": "Exact chunk_index from a SOURCES entry." },
                  "support_type": {
                    "type": "string",
                    "enum": ["direct", "analogous"],
                    "description": "'direct' = the chunk states this part of the hypothesis. 'analogous' = the chunk supports an analogous mechanism in a related domain."
                  }
                },
                "required": ["paper_id", "chunk_index", "support_type"]
              },
              "description": "Chunks supporting parts of the hypothesis. Each entry MUST cite a chunk that appears in the SOURCES list."
            },
            "novel_claim": {
              "type": "string",
              "description": "Substring of `hypothesis` not directly supported by any retrieved chunk. MUST be non-empty. If the hypothesis is fully grounded, return the most extrapolative sentence."
            },
            "reasoning": {
              "type": "string",
              "description": "1-2 sentences connecting supporting evidence to the novel claim."
            }
          },
          "required": ["hypothesis", "supporting_evidence", "novel_claim", "reasoning"]
        }
        """;

    private static readonly AnthropicTool SubmitDiscoveryTool =
        new Function(
            "submit_discovery",
            "Submit a discovery hypothesis with supporting evidence and a flagged novel claim.",
            JsonNode.Parse(ToolSchemaJson)!);

    public async Task<DiscoverResponse> DiscoverAsync(DiscoverRequest req, CancellationToken ct = default)
    {
        var corrId = Guid.NewGuid();
        using var scope = _logger.BeginScope(new Dictionary<string, object>
        {
            ["correlationId"] = corrId,
        });

        var topicA = req.TopicA.Trim();
        var topicB = string.IsNullOrWhiteSpace(req.TopicB) ? null : req.TopicB!.Trim();
        var topK = req.TopK ?? 5;

        if (topicB is not null && string.Equals(topicA, topicB, StringComparison.Ordinal))
        {
            throw new ArgumentException(
                "topicA and topicB must differ after trimming; cross-context bridge requires distinct topics.",
                nameof(req));
        }

        var sw = Stopwatch.StartNew();

        var topicTexts = topicB is null ? new[] { topicA } : new[] { topicA, topicB };
        var topicEmbeddings = await _embeddings.GenerateAsync(topicTexts, ct).ConfigureAwait(false);

        var hitsA = await _repo.VectorSearchAsync(topicEmbeddings[0], topK, ct).ConfigureAwait(false);
        var hitsB = topicB is null
            ? Array.Empty<SearchHit>()
            : await _repo.VectorSearchAsync(topicEmbeddings[1], topK, ct).ConfigureAwait(false);

        // First-seen dedup: iterate hitsA then hitsB, preserving insertion order. The
        // validation protocol's determinism check relies on this stable union ordering
        // across runs sharing the same (topicA, topicB, topK).
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
                $"No sources retrieved for topicA='{topicA}'{(topicB is null ? "" : $", topicB='{topicB}'")} (correlationId={corrId}).");
        }

        var retrievalElapsedMs = sw.ElapsedMilliseconds;
        var chunkIdList = string.Join(",", dedup.Select(h => $"{h.PaperId}:{h.ChunkIndex}"));
        _logger.LogInformation(
            "Discovery retrieval: topicA='{TopicA}' topicB='{TopicB}' topK={TopK} → {DedupCount} unique chunk(s) [{ChunkIds}] ({ACount}+{BCount} pre-dedup) in {ElapsedMs}ms",
            topicA, topicB ?? "(none)", topK, dedup.Count, chunkIdList, hitsA.Count, hitsB.Count, retrievalElapsedMs);

        var userPrompt = BuildUserPrompt(topicA, topicB, dedup);

        sw.Restart();
        var parameters = new MessageParameters
        {
            Messages = new List<Message> { new Message(RoleType.User, userPrompt) },
            System = new List<SystemMessage> { new SystemMessage(SystemPrompt) },
            Tools = new List<AnthropicTool> { SubmitDiscoveryTool },
            ToolChoice = new ToolChoice { Type = ToolChoiceType.Tool, Name = "submit_discovery" },
            MaxTokens = 1024,
            Model = AnthropicModels.Claude46Sonnet,
            Temperature = 0.2m,
            Stream = false,
        };
        var res = await _claude.ChatAsync(parameters, ct).ConfigureAwait(false);
        var synthElapsedMs = sw.ElapsedMilliseconds;

        var toolUse = res.Content.OfType<ToolUseContent>().FirstOrDefault();
        if (toolUse is null)
        {
            _logger.LogError(
                "Discovery: forced tool call did not fire (stopReason={StopReason})",
                res.StopReason);
            throw new InvalidOperationException(
                $"Claude did not emit a tool_use block (correlationId={corrId}, stopReason={res.StopReason})");
        }

        var input = toolUse.Input ?? throw new InvalidOperationException(
            $"Tool use block had null input (correlationId={corrId})");

        var hypothesis = input["hypothesis"]?.GetValue<string>()
            ?? throw new InvalidOperationException($"Missing 'hypothesis' (correlationId={corrId})");

        var novelClaim = input["novel_claim"]?.GetValue<string>() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(novelClaim))
        {
            _logger.LogError(
                "Discovery contract violation: empty novel_claim (correlationId={CorrelationId})",
                corrId);
            throw new InvalidOperationException(
                $"Discovery contract violation: empty novel_claim (correlationId={corrId})");
        }

        var reasoning = input["reasoning"]?.GetValue<string>() ?? string.Empty;

        var rawEvidence = input["supporting_evidence"]?.AsArray() ?? new JsonArray();
        var validatedEvidence = new List<SupportingEvidence>(rawEvidence.Count);
        int dropped = 0;
        foreach (var node in rawEvidence)
        {
            if (node is null) { dropped++; continue; }
            var paperId = node["paper_id"]?.GetValue<string>();
            var chunkIndex = node["chunk_index"]?.GetValue<int>();
            var supportType = node["support_type"]?.GetValue<string>();
            if (paperId is null || chunkIndex is null || supportType is null)
            {
                dropped++;
                continue;
            }
            if (!seenKeys.Contains((paperId, chunkIndex.Value)))
            {
                dropped++;
                continue;
            }
            var hit = dedup.First(h => h.PaperId == paperId && h.ChunkIndex == chunkIndex.Value);
            validatedEvidence.Add(new SupportingEvidence(
                PaperId: paperId,
                ChunkIndex: chunkIndex.Value,
                Section: hit.Section,
                PageNumber: hit.PageNumber,
                SupportType: supportType));
        }

        if (dropped > 0)
        {
            _logger.LogWarning(
                "Discovery: dropped {DroppedCount} invalid supporting_evidence entry(ies) of {RequestedCount}",
                dropped, rawEvidence.Count);
        }

        _logger.LogInformation(
            "Discovery synthesis: input={InputTokens} output={OutputTokens} tokens; evidence={EvidenceCount}/{RequestedCount}; novelClaimChars={NovelClaimChars} in {ElapsedMs}ms",
            res.Usage.InputTokens, res.Usage.OutputTokens, validatedEvidence.Count, rawEvidence.Count, novelClaim.Length, synthElapsedMs);

        sw.Restart();
        var noveltyScore = await _noveltyScorer.ScoreAsync(novelClaim, ct).ConfigureAwait(false);
        var noveltyElapsedMs = sw.ElapsedMilliseconds;

        _logger.LogInformation(
            "Discovery novelty: noveltyScore={NoveltyScore:F4} in {ElapsedMs}ms",
            noveltyScore, noveltyElapsedMs);

        return new DiscoverResponse(
            CorrelationId: corrId,
            Hypothesis: hypothesis,
            SupportingEvidence: validatedEvidence,
            NovelClaim: novelClaim,
            Reasoning: reasoning,
            Evaluation: new DiscoveryEvaluation(
                NoveltyScore: noveltyScore,
                PlausibilityScore: 0f,
                StructuralCoherenceScore: 0f,
                QualityScore: 0f));
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
