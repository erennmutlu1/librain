using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using LIBRAIN.Llm;
using LIBRAIN.Storage;

namespace LIBRAIN.Agents;

// Stage 2 of the claim-level hallucination mitigation prototype. After
// DiscoveryAgent produces novelClaim + extrapolation_basis, this agent runs a
// secondary Haiku-backed pass that scores each sentence of novel_claim against the
// retrieved chunks and classifies it as GROUNDED, EXTRAPOLATED, or RISKY using the
// rubric's hallucination definition. The aggregate risk is C#-computed as the max
// of per-sentence probabilities to keep the score halo-resistant (mirroring the
// Phase 2 Evaluator pattern).
public sealed class ClaimValidatorAgent(
    ILogger<ClaimValidatorAgent> logger,
    ILlmClient llm)
{
    private readonly ILogger<ClaimValidatorAgent> _logger = logger;
    private readonly ILlmClient _llm = llm;

    private const string SystemPromptText = """
        You are a claim-level factuality validator. You are given the novel_claim
        portion of a discovery hypothesis and the retrieved source chunks that were
        available to the synthesizer. Your job is to split novel_claim into its
        constituent sentences and classify each sentence under three statuses:

        - GROUNDED: the sentence is directly supported by at least one retrieved
          chunk. Cite the chunk(s) in supporting_chunks as "paper_id:chunk_index".
        - EXTRAPOLATED: the sentence is speculative or hypothesis-framed. It goes
          beyond the retrieved evidence but does NOT assert a specific factual claim
          as established. Examples: "X could enable Y", "this suggests Y", "future
          work may show Y". Speculation framed as hypothesis is EXTRAPOLATED, not
          RISKY.
        - RISKY: the sentence states a SPECIFIC FACTUAL CLAIM (a mechanism, a
          quantity, a named entity, a date, an attribution, or a process detail) as
          if it were established knowledge, AND that claim is not supported by any
          retrieved chunk. The hallucination signature is confident factual framing
          without retrieval support. Examples that ARE risky:
            * "EEG biomarkers determine drug-target binding in real time" (specific
              mechanism stated as fact, no retrieval support)
            * "GraphCast achieves 98% accuracy on protein folding" (fabricated stat)
            * "PharmAgents was released by DeepMind in 2024" (wrong attribution)
          Examples that are NOT risky (these are EXTRAPOLATED):
            * "Weather forecasting algorithms could plausibly transfer to protein
              folding via shared mathematical structure"
            * "Real-time biomarker integration may eventually inform drug discovery"
        Hedging language ("could", "may", "suggests", "is hypothesized") is the
        marker that distinguishes EXTRAPOLATED from RISKY. Confident factual framing
        of an unsupported specific claim is the marker that distinguishes RISKY.

        For each sentence also return factual_hallucination_probability in [0, 1].
        GROUNDED ≈ 0.0, EXTRAPOLATED ≈ 0.1–0.3, RISKY ≈ 0.6–1.0. Use the full
        continuous range; do not snap to round numbers.

        Provide a one-sentence rationale per claim describing why you chose the
        status. Also return an aggregate_risk in [0, 1] (the application will
        recompute the canonical aggregate in code; your aggregate is a sanity
        check).

        Always call the `submit_claim_validation` tool. Do not respond in plain
        text.
        """;

    private const string ToolSchemaJson = """
        {
          "type": "object",
          "properties": {
            "claims": {
              "type": "array",
              "minItems": 1,
              "items": {
                "type": "object",
                "properties": {
                  "sentence":           { "type": "string", "description": "Exact sentence from novel_claim." },
                  "factuality_status":  { "type": "string", "enum": ["GROUNDED", "EXTRAPOLATED", "RISKY"] },
                  "supporting_chunks":  { "type": "array",  "items": { "type": "string" }, "description": "List of 'paper_id:chunk_index' references for GROUNDED claims. Empty array for EXTRAPOLATED/RISKY." },
                  "factual_hallucination_probability": { "type": "number", "description": "0.0 to 1.0. GROUNDED ≈ 0, EXTRAPOLATED ≈ 0.1-0.3, RISKY ≈ 0.6-1.0." },
                  "rationale":          { "type": "string", "description": "One-sentence justification of the status." }
                },
                "required": ["sentence", "factuality_status", "factual_hallucination_probability", "rationale"]
              }
            },
            "aggregate_risk": { "type": "number", "description": "0.0 to 1.0 model sanity check; the application recomputes the canonical aggregate." }
          },
          "required": ["claims", "aggregate_risk"]
        }
        """;

    private static readonly LlmTool SubmitClaimValidationTool =
        LlmTool.FromJsonSchema("submit_claim_validation", "Submit a per-sentence factuality validation of novel_claim against retrieved evidence.", ToolSchemaJson);

    public async Task<ClaimValidationResult> ValidateAsync(
        string novelClaim,
        IReadOnlyList<SearchHit> retrievedChunks,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();

        if (string.IsNullOrWhiteSpace(novelClaim))
        {
            // No claim text to validate. Surface as empty result with zero risk.
            return new ClaimValidationResult(Array.Empty<ClaimValidationEntry>(), 0f);
        }

        var request = new LlmRequest(
            Model: ModelSelection.JudgeModel,
            SystemPrompt: SystemPromptText,
            UserPrompt: BuildUserPrompt(novelClaim, retrievedChunks),
            Temperature: 0.0m);

        var res = await _llm.CallToolAsync(request, SubmitClaimValidationTool, ct).ConfigureAwait(false);

        var input = res.Input;

        var retrievedKeys = new HashSet<string>(
            retrievedChunks.Select(c => $"{c.PaperId}:{c.ChunkIndex}"));
        var (result, stats) = ClaimValidationScoring.BuildResult(
            LlmJson.GetArray(input["claims"]), retrievedKeys);

        if (stats.Dropped > 0 || stats.FilteredChunkRefs > 0)
        {
            _logger.LogWarning(
                "Claim validator: dropped {DroppedCount} invalid claim entry(ies) of {RequestedCount}; filtered {FilteredChunks} out-of-set supporting chunk reference(s)",
                stats.Dropped, stats.Requested, stats.FilteredChunkRefs);
        }

        if (result.ValidationFailed)
        {
            _logger.LogError(
                "Claim validator returned no usable claim entries ({RequestedCount} requested); marking validation failed with aggregateRisk=1.0 (fail closed)",
                stats.Requested);
        }

        _logger.LogInformation(
            "Claim validation: claims={ClaimCount} (grounded={Grounded} extrapolated={Extrapolated} risky={Risky}); aggregateRisk={AggregateRisk:F3} validationFailed={ValidationFailed} (input={InputTokens} output={OutputTokens} cacheRead={CacheRead} cacheCreate={CacheCreate} tokens) in {ElapsedMs}ms",
            result.Claims.Count, stats.Grounded, stats.Extrapolated, stats.Risky,
            result.AggregateRisk, result.ValidationFailed,
            res.Usage.InputTokens, res.Usage.OutputTokens,
            res.Usage.CacheReadTokens, res.Usage.CacheCreationTokens,
            sw.ElapsedMilliseconds);

        return result;
    }

    private static string BuildUserPrompt(string novelClaim, IReadOnlyList<SearchHit> retrievedChunks)
    {
        var sb = new StringBuilder();
        sb.AppendLine("NOVEL CLAIM (split into sentences and classify each):");
        sb.AppendLine(novelClaim);
        sb.AppendLine();
        sb.AppendLine("RETRIEVED CHUNKS (cite by 'paper_id:chunk_index' for GROUNDED claims):");
        foreach (var c in retrievedChunks)
        {
            sb.Append('[').Append(c.PaperId).Append(':').Append(c.ChunkIndex).Append(']');
            if (c.Section is not null) sb.Append(" | ").Append(c.Section);
            if (c.PageNumber is not null) sb.Append(" | p.").Append(c.PageNumber);
            sb.AppendLine();
            sb.AppendLine(c.Content);
            sb.AppendLine();
        }
        return sb.ToString();
    }
}
