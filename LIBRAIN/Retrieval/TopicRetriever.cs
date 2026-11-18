using LIBRAIN.Embeddings;
using LIBRAIN.Storage;

namespace LIBRAIN.Retrieval;

public sealed record TopicRetrieval(
    IReadOnlyList<SearchHit> HitsA,
    IReadOnlyList<SearchHit> HitsB,
    // First-seen union: every hit of topic A in rank order, then topic B's hits that
    // were not already present. The determinism checks in the experiments rely on
    // this stable ordering, so it must not change.
    IReadOnlyList<SearchHit> Union,
    IReadOnlySet<(string PaperId, int ChunkIndex)> Keys);

// The "embed topics → search per topic → first-seen dedup" step shared by Discovery,
// Naive-RAG, the OpenAI port and the research endpoints. It used to be copied into
// each of them. The two per-topic searches now run concurrently; the union order is
// unchanged because it is built after both complete.
public sealed class TopicRetriever(IEmbeddingClient embeddings, IPaperStore store)
{
    private readonly IEmbeddingClient _embeddings = embeddings;
    private readonly IPaperStore _store = store;

    public async Task<TopicRetrieval> RetrieveAsync(string topicA, string? topicB, int topK, CancellationToken ct = default)
    {
        var texts = topicB is null ? new[] { topicA } : new[] { topicA, topicB };
        var vectors = await _embeddings.GenerateAsync(texts, ct).ConfigureAwait(false);

        var searchA = _store.VectorSearchAsync(vectors[0], topK, ct);
        var searchB = topicB is null
            ? Task.FromResult<IReadOnlyList<SearchHit>>(Array.Empty<SearchHit>())
            : _store.VectorSearchAsync(vectors[1], topK, ct);
        await Task.WhenAll(searchA, searchB).ConfigureAwait(false);

        return Merge(searchA.Result, searchB.Result);
    }

    public static TopicRetrieval Merge(IReadOnlyList<SearchHit> hitsA, IReadOnlyList<SearchHit> hitsB)
    {
        var keys = new HashSet<(string PaperId, int ChunkIndex)>();
        var union = new List<SearchHit>(hitsA.Count + hitsB.Count);
        foreach (var hit in hitsA) if (keys.Add((hit.PaperId, hit.ChunkIndex))) union.Add(hit);
        foreach (var hit in hitsB) if (keys.Add((hit.PaperId, hit.ChunkIndex))) union.Add(hit);
        return new TopicRetrieval(hitsA, hitsB, union, keys);
    }
}
