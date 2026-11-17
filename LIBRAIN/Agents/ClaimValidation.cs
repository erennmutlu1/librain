using System.Text.Json.Nodes;

namespace LIBRAIN.Agents;

// Per-sentence factuality verdict produced by ClaimValidatorAgent.
public enum ClaimFactualityStatus
{
    // Sentence is directly supported by at least one retrieved chunk.
    Grounded,
    // Sentence extrapolates from retrieved evidence; speculative but framed as hypothesis.
    Extrapolated,
    // Sentence states a specific factual claim (mechanism, quantity, named entity,
    // attribution) not supported by retrieved evidence. This is the hallucination target.
    Risky,
}

public sealed record ClaimValidationEntry(
    string Sentence,
    ClaimFactualityStatus Status,
    IReadOnlyList<string> SupportingChunks,
    float FactualHallucinationProbability,
    string Rationale);

public sealed record ClaimValidationResult(
    IReadOnlyList<ClaimValidationEntry> Claims,
    float AggregateRisk,
    // True when the validator returned no usable per-sentence verdict for a non-empty
    // novel_claim. AggregateRisk is then 1.0 (fail closed): an unvalidated claim must
    // never read as "no risk". Exclude flagged results when computing statistics.
    bool ValidationFailed = false);

public sealed record ClaimValidationParseStats(
    int Requested,
    int Dropped,
    int FilteredChunkRefs,
    int Grounded,
    int Extrapolated,
    int Risky);

// Pure parsing + scoring helpers for ClaimValidatorAgent. Extracted so the load-bearing
// math (max-aggregate, probability clamping, status parsing) is testable without the
// Anthropic call. Mirrors the EvaluationScoring / NoveltyScoring pattern.
public static class ClaimValidationScoring
{
    public static ClaimFactualityStatus ParseStatus(string? raw)
    {
        return raw?.Trim().ToUpperInvariant() switch
        {
            "GROUNDED" => ClaimFactualityStatus.Grounded,
            "RISKY" => ClaimFactualityStatus.Risky,
            "EXTRAPOLATED" => ClaimFactualityStatus.Extrapolated,
            // Missing/invalid → Extrapolated (middle status). RISKY would over-flag on
            // model parse failures; Grounded would under-flag. Extrapolated is the
            // safest default for a degraded response.
            _ => ClaimFactualityStatus.Extrapolated,
        };
    }

    public static float ClampProbability(double? raw)
    {
        if (raw is null || double.IsNaN(raw.Value)) return 0f;
        return Math.Clamp((float)raw.Value, 0f, 1f);
    }

    // A missing probability falls back to the rubric band for the returned status
    // (GROUNDED ~0, EXTRAPOLATED 0.1-0.3, RISKY 0.6-1.0) instead of 0, so a RISKY
    // verdict without a number can no longer disappear from the max-aggregate.
    public static float ClampProbability(double? raw, ClaimFactualityStatus status)
    {
        if (raw is null || double.IsNaN(raw.Value))
        {
            return status switch
            {
                ClaimFactualityStatus.Risky => 0.6f,
                ClaimFactualityStatus.Extrapolated => 0.2f,
                _ => 0f,
            };
        }
        return ClampProbability(raw);
    }

    public static ClaimValidationResult Failed() =>
        new(Array.Empty<ClaimValidationEntry>(), 1f, ValidationFailed: true);

    // Shared by the Anthropic (ClaimValidatorAgent) and OpenAI (OpenAiDiscoveryAgent)
    // paths so both apply exactly the same parsing, defaults and fail-closed rule.
    public static (ClaimValidationResult Result, ClaimValidationParseStats Stats) BuildResult(
        JsonArray? rawClaims,
        ISet<string> retrievedKeys)
    {
        var claims = rawClaims ?? new JsonArray();
        var entries = new List<ClaimValidationEntry>(claims.Count);
        var probabilities = new List<float>(claims.Count);
        int dropped = 0, filteredChunkRefs = 0, grounded = 0, extrapolated = 0, risky = 0;

        foreach (var node in claims)
        {
            var sentence = LlmJson.GetString(node?["sentence"]);
            var rationale = LlmJson.GetString(node?["rationale"]);
            if (string.IsNullOrWhiteSpace(sentence) || string.IsNullOrWhiteSpace(rationale))
            {
                dropped++;
                continue;
            }

            var status = ParseStatus(LlmJson.GetString(node?["factuality_status"]));
            var probability = ClampProbability(LlmJson.GetDouble(node?["factual_hallucination_probability"]), status);

            var claimedChunkIds = new List<string>();
            foreach (var chunkNode in LlmJson.GetArray(node?["supporting_chunks"]) ?? new JsonArray())
            {
                var chunkId = LlmJson.GetString(chunkNode);
                if (!string.IsNullOrWhiteSpace(chunkId)) claimedChunkIds.Add(chunkId);
            }
            var validChunks = FilterSupportingChunks(claimedChunkIds, retrievedKeys);
            filteredChunkRefs += claimedChunkIds.Count - validChunks.Count;

            entries.Add(new ClaimValidationEntry(sentence, status, validChunks, probability, rationale));
            probabilities.Add(probability);
            switch (status)
            {
                case ClaimFactualityStatus.Grounded: grounded++; break;
                case ClaimFactualityStatus.Extrapolated: extrapolated++; break;
                case ClaimFactualityStatus.Risky: risky++; break;
            }
        }

        var stats = new ClaimValidationParseStats(claims.Count, dropped, filteredChunkRefs, grounded, extrapolated, risky);
        var result = entries.Count == 0
            ? Failed()
            : new ClaimValidationResult(entries, AggregateRisk(probabilities));
        return (result, stats);
    }

    // Halo-resistant: take the max of per-sentence probabilities in C#, ignoring any
    // aggregate_risk the model returned. A single high-risk sentence should dominate
    // the aggregate; averaging would let one false-fact claim hide behind benign ones.
    public static float AggregateRisk(IEnumerable<float> perSentenceProbabilities)
    {
        float maxValue = 0f;
        bool any = false;
        foreach (var p in perSentenceProbabilities)
        {
            any = true;
            if (p > maxValue) maxValue = p;
        }
        return any ? Math.Clamp(maxValue, 0f, 1f) : 0f;
    }

    // Drops claimed supporting_chunks that are not in the retrieved set. The validator
    // can hallucinate chunk references just like the synthesis path; this is the
    // mirror of NaiveRagCitations.Resolve for the validator's outputs.
    public static IReadOnlyList<string> FilterSupportingChunks(
        IEnumerable<string> claimed,
        ISet<string> retrievedKeys)
    {
        var result = new List<string>();
        foreach (var key in claimed)
        {
            if (retrievedKeys.Contains(key)) result.Add(key);
        }
        return result;
    }
}
