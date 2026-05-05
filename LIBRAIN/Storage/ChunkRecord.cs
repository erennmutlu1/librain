namespace LIBRAIN.Storage;

// Title/Authors/Year are paper-level facts repeated on every chunk of the same
// paper. The duplication is intentional for MVP: vector-search hits carry full
// paper context without a join, and the storage cost (~120 bytes per chunk) is
// negligible at our scale.
public sealed record ChunkRecord(
    string PaperId,
    int ChunkIndex,
    string Content,
    float[] Embedding,
    string? Title,
    IReadOnlyList<string>? Authors,
    int? Year,
    string? Section,
    int? PageNumber,
    DateTime IngestedAt);
