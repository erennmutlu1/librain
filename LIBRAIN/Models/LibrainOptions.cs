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

public sealed record ModelOptions
{
    public const string SectionName = "Models";

    // Synthesis-side model (Synthesis, Discovery, Naive-RAG, Single-LLM agents).
    // Empty selects the pinned default (Claude Sonnet 4.6) via ModelSelection.
    // Set to a model id (e.g. Claude Haiku 4.5) to drive the FIX-JAIR.5 R2
    // model-substitution robustness run without editing source. Evaluators and
    // ClaimValidator stay pinned to Haiku 4.5 and do not read this option.
    public string SynthesisModel { get; init; } = string.Empty;
}
