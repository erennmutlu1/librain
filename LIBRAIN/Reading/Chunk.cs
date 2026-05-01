namespace LIBRAIN.Reading;

public sealed record Chunk(
    string Content,
    int StartOffset,
    int Length,
    int ChunkIndex,
    int? PageNumber,
    string? Section);
