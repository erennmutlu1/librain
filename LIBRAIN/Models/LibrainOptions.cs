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

public sealed record CosmosOptions
{
    public const string SectionName = "Cosmos";
    public string Endpoint { get; init; } = string.Empty;
    public string Key { get; init; } = string.Empty;
}
