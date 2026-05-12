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
    float AggregateRisk);

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
