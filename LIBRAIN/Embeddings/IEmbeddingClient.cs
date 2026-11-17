namespace LIBRAIN.Embeddings;

public interface IEmbeddingClient
{
    // One vector per input, in input order.
    Task<IReadOnlyList<float[]>> GenerateAsync(IReadOnlyList<string> inputs, CancellationToken ct = default);
}
