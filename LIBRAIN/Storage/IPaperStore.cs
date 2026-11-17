namespace LIBRAIN.Storage;

public interface IPaperStore
{
    Task PersistAsync(IReadOnlyList<ChunkRecord> chunks, CancellationToken ct = default);

    Task<IReadOnlyList<SearchHit>> VectorSearchAsync(float[] queryEmbedding, int topK, CancellationToken ct = default);

    Task<IReadOnlyList<PaperSummary>> ListPapersAsync(CancellationToken ct = default);
}
