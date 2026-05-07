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

    public Task<float> ScoreAsync(string novelClaim, CancellationToken ct = default)
    {
        _logger.LogInformation(
            "NoveltyScorer stub invoked (claimChars={Length})",
            novelClaim?.Length ?? 0);
        return Task.FromResult(0f);
    }
}
