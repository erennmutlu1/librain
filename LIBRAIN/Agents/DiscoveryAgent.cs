using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using LIBRAIN.Embeddings;
using LIBRAIN.Endpoints;
using LIBRAIN.Llm;
using LIBRAIN.Models;
using LIBRAIN.Retrieval;
using LIBRAIN.Storage;
using Microsoft.Extensions.Options;

namespace LIBRAIN.Agents;

public sealed class DiscoveryAgent(
    ILogger<DiscoveryAgent> logger,
    ILlmClient llm,
    TopicRetriever retriever,
    NoveltyScorer noveltyScorer,
    DiscoveryEvaluatorAgent evaluator,
    ClaimValidatorAgent claimValidator,
    IOptions<ModelOptions> modelOptions)
{
    private readonly ILogger<DiscoveryAgent> _logger = logger;
    private readonly ILlmClient _llm = llm;
    private readonly TopicRetriever _retriever = retriever;
    private readonly NoveltyScorer _noveltyScorer = noveltyScorer;
    private readonly DiscoveryEvaluatorAgent _evaluator = evaluator;
    private readonly ClaimValidatorAgent _claimValidator = claimValidator;
    private readonly string _synthesisModel = ModelSelection.SynthesisModel(modelOptions.Value);

    private const string SystemPrompt = """
        You are a discovery agent for a literature-cross-reference system. You are given
        one or two topics and a numbered list of source excerpts retrieved from academic
        papers covering each topic.

        Your job is the OPPOSITE of grounded synthesis: propose a hypothesis that goes
        BEYOND what the cited sources directly state. Connect ideas across the retrieved
        chunks into a claim that requires inferential extrapolation. The unsupported
        part is the discovery, and flagging it explicitly is the contract.

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
          content as established fact. If a sentence is speculative, mark it
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

    private static readonly LlmTool SubmitDiscoveryTool =
        LlmTool.FromJsonSchema("submit_discovery", "Submit a discovery hypothesis with supporting evidence and a flagged novel claim.", ToolSchemaJson);

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

        var retrieval = await _retriever.RetrieveAsync(topicA, topicB, topK, ct).ConfigureAwait(false);
        var hitsA = retrieval.HitsA;
        var hitsB = retrieval.HitsB;
        var seenKeys = retrieval.Keys;
        var dedup = retrieval.Union;

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
        var request = new LlmRequest(
            Model: _synthesisModel,
            SystemPrompt: SystemPrompt,
            UserPrompt: userPrompt,
            Temperature: 0.2m);
        var res = await _llm.CallToolAsync(request, SubmitDiscoveryTool, ct).ConfigureAwait(false);
        var synthElapsedMs = sw.ElapsedMilliseconds;

        var input = res.Input;

        var hypothesis = LlmJson.GetString(input["hypothesis"])
            ?? throw new InvalidOperationException($"Missing 'hypothesis' (correlationId={corrId})");

        var novelClaim = LlmJson.GetString(input["novel_claim"]) ?? string.Empty;
        if (string.IsNullOrWhiteSpace(novelClaim))
        {
            _logger.LogError(
                "Discovery contract violation: empty novel_claim (correlationId={CorrelationId})",
                corrId);
            throw new InvalidOperationException(
                $"Discovery contract violation: empty novel_claim (correlationId={corrId})");
        }

        var reasoning = LlmJson.GetString(input["reasoning"]) ?? string.Empty;

        var evidenceCheck = DiscoveryContract.ValidateEvidence(LlmJson.GetArray(input["supporting_evidence"]), dedup);
        var validatedEvidence = evidenceCheck.Evidence;
        var citedHits = evidenceCheck.CitedHits;
        var dropped = evidenceCheck.Dropped;
        var rawEvidenceCount = evidenceCheck.Claimed;

        if (dropped > 0)
        {
            _logger.LogWarning(
                "Discovery: dropped {DroppedCount} invalid supporting_evidence entry(ies) of {RequestedCount}",
                dropped, rawEvidenceCount);
        }

        // Stage 1 hallucination guard: extrapolation_basis is the per-sentence
        // self-annotation that forces the model to label speculation explicitly.
        // Empty, or all entries invalid → contract violation (throws).
        var basisCheck = DiscoveryContract.ValidateBasisOrThrow(
            LlmJson.GetArray(input["extrapolation_basis"]), seenKeys, corrId);
        var validatedBasis = basisCheck.Basis;
        var pureSpeculationCount = basisCheck.PureSpeculation;

        if (basisCheck.Dropped > 0 || basisCheck.Normalized > 0)
        {
            _logger.LogWarning(
                "Discovery: extrapolation_basis cleanup - dropped {DroppedCount}, normalized {NormalizedCount} entries (of {RequestedCount})",
                basisCheck.Dropped, basisCheck.Normalized, basisCheck.Requested);
        }

        _logger.LogInformation(
            "Discovery synthesis: input={InputTokens} output={OutputTokens} cacheRead={CacheRead} cacheCreate={CacheCreate} tokens; evidence={EvidenceCount}/{RequestedCount}; novelClaimChars={NovelClaimChars}; basis={BasisCount} (pureSpec={PureSpec}) in {ElapsedMs}ms",
            res.Usage.InputTokens, res.Usage.OutputTokens,
            res.Usage.CacheReadTokens, res.Usage.CacheCreationTokens,
            validatedEvidence.Count, rawEvidenceCount, novelClaim.Length, validatedBasis.Count, pureSpeculationCount, synthElapsedMs);

        // Three scoring passes (novelty via deterministic embedding, claim-level
        // factuality validation via Haiku, and four-axis evaluation via Haiku) all
        // depend on the same novel_claim + retrieved chunks and not on each other's
        // output. Run them concurrently to collapse the scoring stage from three
        // sequential round-trips into one effective slowest-task round-trip. Each
        // task keeps its own audit logging; the aggregate timing below covers the
        // parallel stage as a whole.
        sw.Restart();
        using var scoringCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var noveltyTask = _noveltyScorer.ScoreAsync(novelClaim, scoringCts.Token);
        var claimValidationTask = _claimValidator.ValidateAsync(novelClaim, dedup, scoringCts.Token);
        var evaluationTask = _evaluator.EvaluateAsync(hypothesis, novelClaim, citedHits, scoringCts.Token);

        await ParallelScoring.WhenAllCancelOnFault(scoringCts, noveltyTask, claimValidationTask, evaluationTask).ConfigureAwait(false);

        var noveltyScore = noveltyTask.Result;
        var claimValidation = claimValidationTask.Result;
        var (plausibility, structuralCoherence, _) = evaluationTask.Result;
        var scoringElapsedMs = sw.ElapsedMilliseconds;

        _logger.LogInformation(
            "Discovery scoring (parallel): novelty={NoveltyScore:F4} claims={ClaimCount} aggregateRisk={AggregateRisk:F3} plausibility={Plausibility:F2} structuralCoherence={StructuralCoherence:F2} in {ElapsedMs}ms",
            noveltyScore, claimValidation.Claims.Count, claimValidation.AggregateRisk,
            plausibility, structuralCoherence, scoringElapsedMs);

        var evaluation = DiscoveryScoring.Aggregate(noveltyScore, plausibility, structuralCoherence);

        return new DiscoverResponse(
            CorrelationId: corrId,
            Hypothesis: hypothesis,
            SupportingEvidence: validatedEvidence,
            NovelClaim: novelClaim,
            ExtrapolationBasis: validatedBasis,
            ClaimValidation: claimValidation,
            Reasoning: reasoning,
            Evaluation: evaluation,
            ClaimedEvidenceCount: rawEvidenceCount,
            DroppedEvidenceCount: dropped);
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
