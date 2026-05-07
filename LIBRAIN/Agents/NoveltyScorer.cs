using LIBRAIN.Embeddings;
using LIBRAIN.Storage;

namespace LIBRAIN.Agents;

public sealed class NoveltyScorer(
    ILogger<NoveltyScorer> logger,
    OpenAIEmbeddingClient embeddings,
    QdrantPaperRepository repo)
{
    private readonly ILogger<NoveltyScorer> _logger = logger;
    private readonly OpenAIEmbeddingClient _embeddings = embeddings;
    private readonly QdrantPaperRepository _repo = repo;

    public async Task<float> ScoreAsync(string novelClaim, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(novelClaim))
        {
            throw new ArgumentException(
                "novelClaim must be a non-empty, non-whitespace string.",
                nameof(novelClaim));
        }

        var generated = await _embeddings.GenerateAsync(new[] { novelClaim }, ct).ConfigureAwait(false);
        var queryVector = generated[0];

        var hits = await _repo.VectorSearchAsync(queryVector, topK: 1, ct).ConfigureAwait(false);
        if (hits.Count == 0)
        {
            _logger.LogDebug(
                "NoveltyScorer: empty corpus, returning 1.0 (claimChars={Length})",
                novelClaim.Length);
            return 1f;
        }

        var hit = hits[0];
        var novelty = NoveltyScoring.FromSimilarity(hit.Score);

        _logger.LogDebug(
            "NoveltyScorer: claimChars={Length} nearest={PaperId}/c{ChunkIndex} similarity={Similarity:F4} novelty={Novelty:F4}",
            novelClaim.Length, hit.PaperId, hit.ChunkIndex, hit.Score, novelty);

        return novelty;
    }
}

public static class NoveltyScoring
{
    public static float FromSimilarity(float similarity)
    {
        if (float.IsNaN(similarity)) return 0f;
        var novelty = 1f - similarity;
        if (novelty < 0f) return 0f;
        if (novelty > 1f) return 1f;
        return novelty;
    }
}
