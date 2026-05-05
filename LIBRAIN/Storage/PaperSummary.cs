namespace LIBRAIN.Storage;

public sealed record PaperSummary(
    string PaperId,
    string? Title,
    int ChunkCount,
    DateTime? FirstIngestedAt);
