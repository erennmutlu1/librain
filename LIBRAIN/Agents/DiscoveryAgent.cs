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
    NoveltyScorer noveltyScorer,
    DiscoveryEvaluatorAgent evaluator,
    ClaimValidatorAgent claimValidator)
{
    private readonly ILogger<DiscoveryAgent> _logger = logger;
    private readonly AnthropicChatClient _claude = claude;
    private readonly OpenAIEmbeddingClient _embeddings = embeddings;
    private readonly QdrantPaperRepository _repo = repo;
    private readonly NoveltyScorer _noveltyScorer = noveltyScorer;
    private readonly DiscoveryEvaluatorAgent _evaluator = evaluator;
    private readonly ClaimValidatorAgent _claimValidator = claimValidator;

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
        - `extrapolation_basis`: an array with ONE entry per sentence in `novel_claim`.
          Each entry justifies how that sentence relates to the retrieved evidence:
            * `claim_sentence`: the exact sentence from `novel_claim`.
            * `basis_type`: "generalization" (extends a retrieved finding to a new
              case), "analogy" (transfers a mechanism from a related domain), or
              "pure_speculation" (not derivable from retrieved chunks).
            * `grounded_in_chunk_id`: "paper_id:chunk_index" of the supporting chunk
              when basis_type is "generalization" or "analogy"; null when
              "pure_speculation".
            * `rationale`: one sentence (max ~240 chars) explaining the link.
          Speculation is welcomed, but it must be labeled. Do NOT state speculative
          content as established fact — if a sentence is speculative, mark it
          "pure_speculation" rather than asserting it as if it were retrieved evidence.
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
            "extrapolation_basis": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "properties": {
                  "claim_sentence": { "type": "string", "description": "Exact sentence from `novel_claim`." },
                  "basis_type": {
                    "type": "string",
                    "enum": ["generalization", "analogy", "pure_speculation"],
                    "description": "How the sentence relates to retrieved evidence. Use 'pure_speculation' for any sentence not derivable from a retrieved chunk."
                  },
                  "grounded_in_chunk_id": {
                    "type": ["string", "null"],
                    "description": "'paper_id:chunk_index' of the supporting chunk for generalization/analogy. MUST be null when basis_type is 'pure_speculation'."
                  },
                  "rationale": {
                    "type": "string",
                    "maxLength": 240,
                    "description": "One-sentence justification of the link (or labeling, for pure_speculation)."
                  }
                },
                "required": ["claim_sentence", "basis_type", "rationale"]
              },
              "description": "Per-sentence self-annotation for `novel_claim`. One entry per sentence. Forces explicit labeling of speculation to reduce false-fact framing."
            },
            "reasoning": {
              "type": "string",
              "description": "1-2 sentences connecting supporting evidence to the novel claim."
            }
          },
          "required": ["hypothesis", "supporting_evidence", "novel_claim", "extrapolation_basis", "reasoning"]
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
        var citedHits = new List<SearchHit>(rawEvidence.Count);
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
            citedHits.Add(hit);
        }

        if (dropped > 0)
        {
            _logger.LogWarning(
                "Discovery: dropped {DroppedCount} invalid supporting_evidence entry(ies) of {RequestedCount}",
                dropped, rawEvidence.Count);
        }

        // Stage 1 hallucination guard: extrapolation_basis is the per-sentence
        // self-annotation that forces the model to label speculation explicitly.
        // Empty array → contract violation (mirrors the novel_claim non-empty check).
        var rawBasis = input["extrapolation_basis"]?.AsArray();
        if (rawBasis is null || rawBasis.Count == 0)
        {
            _logger.LogError(
                "Discovery contract violation: empty extrapolation_basis (correlationId={CorrelationId})",
                corrId);
            throw new InvalidOperationException(
                $"Discovery contract violation: empty extrapolation_basis (correlationId={corrId})");
        }

        var validatedBasis = new List<ExtrapolationBasis>(rawBasis.Count);
        int basisDropped = 0;
        int basisNormalized = 0;
        int pureSpeculationCount = 0;
        foreach (var node in rawBasis)
        {
            if (node is null) { basisDropped++; continue; }
            var claimSentence = node["claim_sentence"]?.GetValue<string>();
            var basisType = node["basis_type"]?.GetValue<string>();
            var rationale = node["rationale"]?.GetValue<string>();
            var groundedInChunkId = node["grounded_in_chunk_id"]?.GetValue<string?>();
            if (string.IsNullOrWhiteSpace(claimSentence) ||
                string.IsNullOrWhiteSpace(basisType) ||
                string.IsNullOrWhiteSpace(rationale))
            {
                basisDropped++;
                continue;
            }
            basisType = basisType.Trim().ToLowerInvariant();
            if (basisType is not ("generalization" or "analogy" or "pure_speculation"))
            {
                basisDropped++;
                continue;
            }
            if (basisType == "pure_speculation")
            {
                if (!string.IsNullOrWhiteSpace(groundedInChunkId))
                {
                    // Model violated the schema contract; pure_speculation MUST be
                    // null-grounded. Normalize rather than drop — the speculative
                    // label is the load-bearing bit.
                    basisNormalized++;
                    groundedInChunkId = null;
                }
                pureSpeculationCount++;
            }
            else
            {
                // generalization / analogy require a valid chunk reference. Drop
                // entries that cite outside the retrieved set or are null.
                if (string.IsNullOrWhiteSpace(groundedInChunkId))
                {
                    basisDropped++;
                    continue;
                }
                var parts = groundedInChunkId.Split(':');
                if (parts.Length != 2 || !int.TryParse(parts[1], out var basisChunkIndex)
                    || !seenKeys.Contains((parts[0], basisChunkIndex)))
                {
                    basisDropped++;
                    continue;
                }
            }
            validatedBasis.Add(new ExtrapolationBasis(
                ClaimSentence: claimSentence,
                BasisType: basisType,
                GroundedInChunkId: groundedInChunkId,
                Rationale: rationale));
        }

        if (basisDropped > 0 || basisNormalized > 0)
        {
            _logger.LogWarning(
                "Discovery: extrapolation_basis cleanup — dropped {DroppedCount}, normalized {NormalizedCount} entries (of {RequestedCount})",
                basisDropped, basisNormalized, rawBasis.Count);
        }

        if (validatedBasis.Count == 0)
        {
            _logger.LogError(
                "Discovery contract violation: extrapolation_basis was non-empty but all entries failed validation (correlationId={CorrelationId})",
                corrId);
            throw new InvalidOperationException(
                $"Discovery contract violation: all extrapolation_basis entries failed validation (correlationId={corrId})");
        }

        _logger.LogInformation(
            "Discovery synthesis: input={InputTokens} output={OutputTokens} tokens; evidence={EvidenceCount}/{RequestedCount}; novelClaimChars={NovelClaimChars}; basis={BasisCount} (pureSpec={PureSpec}) in {ElapsedMs}ms",
            res.Usage.InputTokens, res.Usage.OutputTokens, validatedEvidence.Count, rawEvidence.Count, novelClaim.Length, validatedBasis.Count, pureSpeculationCount, synthElapsedMs);

        sw.Restart();
        var noveltyScore = await _noveltyScorer.ScoreAsync(novelClaim, ct).ConfigureAwait(false);
        var noveltyElapsedMs = sw.ElapsedMilliseconds;

        _logger.LogInformation(
            "Discovery novelty: noveltyScore={NoveltyScore:F4} in {ElapsedMs}ms",
            noveltyScore, noveltyElapsedMs);

        // Stage 2 hallucination guard: claim-level factuality validation. Sequential
        // for now; Faz E2 will parallelize this with the Discovery Evaluator since
        // both depend on the same novel_claim + retrieved chunks and not on each
        // other's output.
        sw.Restart();
        var claimValidation = await _claimValidator.ValidateAsync(novelClaim, dedup, ct).ConfigureAwait(false);
        var claimValidationElapsedMs = sw.ElapsedMilliseconds;

        _logger.LogInformation(
            "Discovery claim validation: claims={ClaimCount} aggregateRisk={AggregateRisk:F3} in {ElapsedMs}ms",
            claimValidation.Claims.Count, claimValidation.AggregateRisk, claimValidationElapsedMs);

        sw.Restart();
        var (plausibility, structuralCoherence, _) =
            await _evaluator.EvaluateAsync(hypothesis, novelClaim, citedHits, ct).ConfigureAwait(false);
        var evalElapsedMs = sw.ElapsedMilliseconds;

        _logger.LogInformation(
            "Discovery evaluation total: plausibility={Plausibility:F2} structuralCoherence={StructuralCoherence:F2} in {ElapsedMs}ms",
            plausibility, structuralCoherence, evalElapsedMs);

        var evaluation = DiscoveryScoring.Aggregate(noveltyScore, plausibility, structuralCoherence);

        return new DiscoverResponse(
            CorrelationId: corrId,
            Hypothesis: hypothesis,
            SupportingEvidence: validatedEvidence,
            NovelClaim: novelClaim,
            ExtrapolationBasis: validatedBasis,
            ClaimValidation: claimValidation,
            Reasoning: reasoning,
            Evaluation: evaluation);
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
