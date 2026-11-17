namespace LIBRAIN.Agents;

public sealed record SynthesisCitation(
    int Index,
    string PaperId,
    int ChunkIndex,
    string? Section,
    int? PageNumber,
    // The cited passage, so a reader (or the UI) can check the claim against its source.
    string? Content = null);

public sealed record SynthesisResult(
    string Hypothesis,
    IReadOnlyList<SynthesisCitation> Citations,
    float? Confidence,
    IReadOnlyList<string> UnsupportedClaims,
    Guid CorrelationId);
