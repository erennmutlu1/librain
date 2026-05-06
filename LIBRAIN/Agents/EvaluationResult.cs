namespace LIBRAIN.Agents;

public sealed record EvaluationResult(
    float QualityScore,
    float GroundednessScore,
    float RelevanceScore,
    float CompletenessScore,
    string Critique,
    IReadOnlyList<string> UnsupportedClaims,
    IReadOnlyList<string> MissingEvidence,
    Guid CorrelationId);
