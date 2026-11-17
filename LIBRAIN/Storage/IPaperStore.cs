namespace LIBRAIN.Storage;

public interface IPaperStore
{
    Task PersistAsync(IReadOnlyList<ChunkRecord> chunks, CancellationToken ct = default);

    Task<IReadOnlyList<SearchHit>> VectorSearchAsync(float[] queryEmbedding, int topK, CancellationToken ct = default);

    Task<IReadOnlyList<PaperSummary>> ListPapersAsync(CancellationToken ct = default);

    // Removes every chunk of the paper. Returns the number of chunks removed (0 = unknown paper).
    Task<int> DeletePaperAsync(string paperId, CancellationToken ct = default);
}
