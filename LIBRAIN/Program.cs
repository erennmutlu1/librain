using LIBRAIN.Agents;
using LIBRAIN.Embeddings;
using LIBRAIN.Endpoints;
using LIBRAIN.Models;
using LIBRAIN.Reading;
using LIBRAIN.Storage;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Options;
using Qdrant.Client;
using Scalar.AspNetCore;

const long maxUploadBytes = 50_000_000; // 50MB cap on PDF uploads (largest data/papers/ paper is ~9MB)

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(options =>
{
    options.Limits.MaxRequestBodySize = maxUploadBytes;
});

builder.Services.Configure<FormOptions>(options =>
{
    options.MultipartBodyLengthLimit = maxUploadBytes;
});

var applicationInsightsConnectionString = builder.Configuration["ApplicationInsights:ConnectionString"];
if (!string.IsNullOrWhiteSpace(applicationInsightsConnectionString))
{
    builder.Services.AddApplicationInsightsTelemetry();
}

builder.Services.AddOpenApi();

builder.Services.Configure<AnthropicOptions>(
    builder.Configuration.GetSection(AnthropicOptions.SectionName));
// Fail fast with an actionable message instead of a 502 on the first request.
// Anthropic:ApiKey is deliberately not required here: the OpenAI-only experiments
// (fabrication-delta, provider=openai) run without it; AnthropicChatClient reports
// a missing key when it is first used.
builder.Services.AddOptions<OpenAIOptions>()
    .Bind(builder.Configuration.GetSection(OpenAIOptions.SectionName))
    .Validate(o => !string.IsNullOrWhiteSpace(o.ApiKey),
        "OpenAI:ApiKey is not configured (needed for embeddings). Set it with: dotnet user-secrets set \"OpenAI:ApiKey\" \"sk-...\" --project LIBRAIN")
    .ValidateOnStart();
builder.Services.AddOptions<QdrantOptions>()
    .Bind(builder.Configuration.GetSection(QdrantOptions.SectionName))
    .Validate(o => !string.IsNullOrWhiteSpace(o.Host),
        "Qdrant:Host is not configured. For local Docker use: dotnet user-secrets set \"Qdrant:Host\" \"localhost\" --project LIBRAIN")
    .ValidateOnStart();
builder.Services.Configure<ModelOptions>(
    builder.Configuration.GetSection(ModelOptions.SectionName));

// Qdrant.Client uses gRPC (port 6334), not REST (6333). Cloud clusters require https + apiKey;
// local Docker dev uses neither. Empty ApiKey selects local mode automatically.
builder.Services.AddSingleton<QdrantClient>(sp =>
{
    var options = sp.GetRequiredService<IOptions<QdrantOptions>>().Value;
    return string.IsNullOrWhiteSpace(options.ApiKey)
        ? new QdrantClient(options.Host, options.Port)
        : new QdrantClient(
            host: options.Host,
            port: options.Port,
            https: options.UseHttps,
            apiKey: options.ApiKey);
});

builder.Services.AddSingleton<AnthropicChatClient>();
builder.Services.AddSingleton<LIBRAIN.Llm.ILlmClient>(sp => sp.GetRequiredService<AnthropicChatClient>());
builder.Services.AddScoped<IEmbeddingClient, OpenAIEmbeddingClient>();
builder.Services.AddScoped<LIBRAIN.Generation.OpenAIChatClient>();
builder.Services.AddScoped<LIBRAIN.Generation.OpenAiDiscoveryAgent>();
// Singleton: stateless apart from its one-time collection setup, which used to race
// when two first requests each ran it from their own scoped instance.
builder.Services.AddSingleton<IPaperStore, QdrantPaperRepository>();
builder.Services.AddScoped<LIBRAIN.Retrieval.TopicRetriever>();
builder.Services.Configure<LIBRAIN.Runs.RunStoreOptions>(builder.Configuration.GetSection(LIBRAIN.Runs.RunStoreOptions.SectionName));
builder.Services.AddSingleton<LIBRAIN.Runs.IRunStore>(sp =>
{
    var path = sp.GetRequiredService<IOptions<LIBRAIN.Runs.RunStoreOptions>>().Value.DatabasePath;
    return new LIBRAIN.Runs.SqliteRunStore(Path.IsPathRooted(path) ? path : Path.Combine(builder.Environment.ContentRootPath, path));
});
builder.Services.AddSingleton<LIBRAIN.Runs.RunRecorder>();
builder.Services.AddScoped<LIBRAIN.Pipelines.QueryPipeline>();

// CORS for the web UI. Configure Cors:AllowedOrigins for a deployed frontend; in
// Development the Vite dev server and preview ports are allowed by default.
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];
if (allowedOrigins.Length == 0 && builder.Environment.IsDevelopment())
{
    allowedOrigins = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"];
}
builder.Services.AddLibrainGuards(builder.Configuration);
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()
        // Lets a separately hosted UI read when to retry after a 429.
        .WithExposedHeaders("Retry-After")));
builder.Services.AddScoped<PdfTextExtractor>();
builder.Services.AddScoped<RecursiveChunker>();
builder.Services.AddScoped<ReaderAgent>();
builder.Services.AddHttpClient<LIBRAIN.Ingestion.ArxivClient>(LIBRAIN.Ingestion.ArxivClient.Configure);
builder.Services.AddScoped<SynthesisAgent>();
builder.Services.AddScoped<EvaluatorAgent>();
builder.Services.AddScoped<DiscoveryAgent>();
builder.Services.AddScoped<DiscoveryEvaluatorAgent>();
builder.Services.AddScoped<ClaimValidatorAgent>();
builder.Services.AddScoped<NoveltyScorer>();
builder.Services.AddScoped<SingleLlmAgent>();
builder.Services.AddScoped<NaiveRagAgent>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();
app.UseCors();
app.UseApiKeyGuard();
app.UseRateLimiter();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapPaperEndpoints();
app.MapRunEndpoints();
app.MapStreamingEndpoints();
app.MapCompareEndpoints();
app.MapQueryEndpoints();
app.MapDiscoveryEndpoints();
app.MapBaselineEndpoints();
app.MapFabricationProbeEndpoints();
app.MapScoreEndpoints();

app.Run();
