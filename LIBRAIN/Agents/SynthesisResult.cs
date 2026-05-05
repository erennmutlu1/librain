namespace LIBRAIN.Agents;

public sealed record SynthesisCitation(
    int Index,
    string PaperId,
    int ChunkIndex,
    string? Section,
    int? PageNumber);

public sealed record SynthesisResult(
    string Hypothesis,
    IReadOnlyList<SynthesisCitation> Citations,
    float? Confidence,
    IReadOnlyList<string> UnsupportedClaims,
    Guid CorrelationId);
