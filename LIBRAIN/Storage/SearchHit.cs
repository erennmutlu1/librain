namespace LIBRAIN.Storage;

public sealed record SearchHit(
    string PaperId,
    int ChunkIndex,
    string Content,
    float Score,
    string? Section,
    int? PageNumber);
