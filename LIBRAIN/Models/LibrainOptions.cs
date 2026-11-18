namespace LIBRAIN.Models;

public sealed record AnthropicOptions
{
    public const string SectionName = "Anthropic";
    public string ApiKey { get; init; } = string.Empty;

    // Cap on simultaneous Claude requests from this process. A Discovery run makes up
    // to three at once; the cap keeps several concurrent users (or an experiment batch)
    // from bursting into rate-limit errors.
    public int MaxConcurrentRequests { get; init; } = 4;
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

    // Collection the repository reads/writes. Empty selects the default
    // ("librain_chunks"). Set to e.g. "librain_chunks_noisy" to run the RQ3
    // fabrication-delta experiment against the noisy corpus without code changes.
    public string CollectionName { get; init; } = string.Empty;
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

public sealed record SecurityOptions
{
    public const string SectionName = "Security";

    // When set, every /api request must send this value in the X-Api-Key header.
    // Leave empty for local use; set it before exposing the API publicly so nobody
    // else can spend the LLM credit.
    public string ApiKey { get; init; } = string.Empty;
}

public sealed record PublicModeOptions
{
    public const string SectionName = "Public";

    // The public deployment behind librain.erenmutlu.me. When true:
    //   - every LLM and embedding call uses the visitor's own keys (X-Anthropic-Key,
    //     X-OpenAI-Key headers) and never the configured ones (see LIBRAIN.Llm.ProviderKeys);
    //   - the corpus is read-only (no ingest or delete), and run history, the OpenAI port
    //     and the fabrication probe are switched off;
    //   - nothing about a visitor's run is stored on the server.
    public bool Enabled { get; init; }
}

public sealed record RateLimitingOptions
{
    public const string SectionName = "RateLimiting";

    // Paid requests (anything that calls an LLM or the embedding API) allowed per client
    // IP per hour. 0 disables the limiter (default, for local use).
    public int PaidRequestsPerHour { get; init; }
}
