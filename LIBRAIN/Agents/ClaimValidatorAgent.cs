using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using Anthropic.SDK.Common;
using Anthropic.SDK.Constants;
using Anthropic.SDK.Messaging;
using LIBRAIN.Storage;
using AnthropicTool = Anthropic.SDK.Common.Tool;

namespace LIBRAIN.Agents;

// Stage 2 of the claim-level hallucination mitigation (RQ4 prototype, paper §7.7.4).
// After DiscoveryAgent produces novelClaim + extrapolation_basis, this agent runs a
// secondary Haiku-backed pass that scores each sentence of novel_claim against the
// retrieved chunks and classifies it as GROUNDED, EXTRAPOLATED, or RISKY using the
// paper §6.7 hallucination definition. The aggregate risk is C#-computed as the max
// of per-sentence probabilities to keep the score halo-resistant (mirroring the
// Phase 2 Evaluator pattern).
public sealed class ClaimValidatorAgent(
    ILogger<ClaimValidatorAgent> logger,
    AnthropicChatClient claude)
{
    private readonly ILogger<ClaimValidatorAgent> _logger = logger;
    private readonly AnthropicChatClient _claude = claude;

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

    private static readonly AnthropicTool SubmitClaimValidationTool =
        new Function(
            "submit_claim_validation",
            "Submit a per-sentence factuality validation of novel_claim against retrieved evidence.",
            JsonNode.Parse(ToolSchemaJson)!);

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

        var parameters = new MessageParameters
        {
            Messages = new List<Message> { new Message(RoleType.User, BuildUserPrompt(novelClaim, retrievedChunks)) },
            System = new List<SystemMessage> { new SystemMessage(SystemPromptText) },
            Tools = new List<AnthropicTool> { SubmitClaimValidationTool },
            ToolChoice = new ToolChoice { Type = ToolChoiceType.Tool, Name = "submit_claim_validation" },
            MaxTokens = 1024,
            Model = AnthropicModels.Claude45Haiku,
            Temperature = 0.0m,
            Stream = false,
            PromptCaching = PromptCacheType.AutomaticToolsAndSystem,
        };

        var res = await _claude.ChatAsync(parameters, ct).ConfigureAwait(false);

        var toolUse = res.Content.OfType<ToolUseContent>().FirstOrDefault();
        if (toolUse is null)
        {
            _logger.LogError(
                "Claim validator: forced tool call did not fire (stopReason={StopReason})",
                res.StopReason);
            throw new InvalidOperationException(
                $"Claude did not emit a tool_use block for claim validation (stopReason={res.StopReason})");
        }

        var input = toolUse.Input ?? throw new InvalidOperationException(
            "Claim validator tool use block had null input.");

        var rawClaims = input["claims"]?.AsArray() ?? new JsonArray();
        var retrievedKeys = new HashSet<string>(
            retrievedChunks.Select(c => $"{c.PaperId}:{c.ChunkIndex}"));

        var parsedEntries = new List<ClaimValidationEntry>(rawClaims.Count);
        var probabilities = new List<float>(rawClaims.Count);
        int dropped = 0;
        int filteredChunkRefs = 0;
        int riskyCount = 0;
        int extrapolatedCount = 0;
        int groundedCount = 0;

        foreach (var node in rawClaims)
        {
            if (node is null) { dropped++; continue; }
            var sentence = node["sentence"]?.GetValue<string>();
            var rationale = node["rationale"]?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(sentence) || string.IsNullOrWhiteSpace(rationale))
            {
                dropped++;
                continue;
            }

            var rawStatus = node["factuality_status"]?.GetValue<string>();
            var status = ClaimValidationScoring.ParseStatus(rawStatus);

            var rawProb = node["factual_hallucination_probability"]?.GetValue<double?>();
            var probability = ClaimValidationScoring.ClampProbability(rawProb);

            var rawChunks = node["supporting_chunks"]?.AsArray() ?? new JsonArray();
            var claimedChunkIds = new List<string>(rawChunks.Count);
            foreach (var chunkNode in rawChunks)
            {
                var chunkId = chunkNode?.GetValue<string>();
                if (!string.IsNullOrWhiteSpace(chunkId)) claimedChunkIds.Add(chunkId);
            }
            var validChunks = ClaimValidationScoring.FilterSupportingChunks(claimedChunkIds, retrievedKeys);
            filteredChunkRefs += claimedChunkIds.Count - validChunks.Count;

            parsedEntries.Add(new ClaimValidationEntry(
                Sentence: sentence,
                Status: status,
                SupportingChunks: validChunks,
                FactualHallucinationProbability: probability,
                Rationale: rationale));
            probabilities.Add(probability);

            switch (status)
            {
                case ClaimFactualityStatus.Grounded: groundedCount++; break;
                case ClaimFactualityStatus.Extrapolated: extrapolatedCount++; break;
                case ClaimFactualityStatus.Risky: riskyCount++; break;
            }
        }

        var aggregateRisk = ClaimValidationScoring.AggregateRisk(probabilities);

        if (dropped > 0 || filteredChunkRefs > 0)
        {
            _logger.LogWarning(
                "Claim validator: dropped {DroppedCount} invalid claim entry(ies) of {RequestedCount}; filtered {FilteredChunks} out-of-set supporting chunk reference(s)",
                dropped, rawClaims.Count, filteredChunkRefs);
        }

        _logger.LogInformation(
            "Claim validation: claims={ClaimCount} (grounded={Grounded} extrapolated={Extrapolated} risky={Risky}); aggregateRisk={AggregateRisk:F3} (input={InputTokens} output={OutputTokens} cacheRead={CacheRead} cacheCreate={CacheCreate} tokens) in {ElapsedMs}ms",
            parsedEntries.Count, groundedCount, extrapolatedCount, riskyCount,
            aggregateRisk,
            res.Usage.InputTokens, res.Usage.OutputTokens,
            res.Usage.CacheReadInputTokens, res.Usage.CacheCreationInputTokens,
            sw.ElapsedMilliseconds);

        return new ClaimValidationResult(parsedEntries, aggregateRisk);
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
