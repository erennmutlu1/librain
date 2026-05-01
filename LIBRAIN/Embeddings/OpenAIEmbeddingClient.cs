namespace LIBRAIN.Embeddings;

public sealed class OpenAIEmbeddingClient(ILogger<OpenAIEmbeddingClient> logger)
{
    private readonly ILogger<OpenAIEmbeddingClient> _logger = logger;
}
