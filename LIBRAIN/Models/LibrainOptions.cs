namespace LIBRAIN.Models;

public sealed record AnthropicOptions
{
    public const string SectionName = "Anthropic";
    public string ApiKey { get; init; } = string.Empty;
}

public sealed record OpenAIOptions
{
    public const string SectionName = "OpenAI";
    public string ApiKey { get; init; } = string.Empty;
}

public sealed record QdrantOptions
{
    public const string SectionName = "Qdrant";
    public string Host { get; init; } = string.Empty;
    public int Port { get; init; } = 6334;
    public string? ApiKey { get; init; }
    public bool UseHttps { get; init; }
}
