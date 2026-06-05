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
builder.Services.Configure<OpenAIOptions>(
    builder.Configuration.GetSection(OpenAIOptions.SectionName));
builder.Services.Configure<QdrantOptions>(
    builder.Configuration.GetSection(QdrantOptions.SectionName));
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
builder.Services.AddScoped<OpenAIEmbeddingClient>();
builder.Services.AddScoped<QdrantPaperRepository>();
builder.Services.AddScoped<PdfTextExtractor>();
builder.Services.AddScoped<RecursiveChunker>();
builder.Services.AddScoped<ReaderAgent>();
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

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapPost("/api/papers/ingest", async (IFormFile file, ReaderAgent reader, CancellationToken ct) =>
{
    if (file is null || file.Length == 0)
    {
        return Results.BadRequest(new { error = "file is required" });
    }
    var paperId = Path.GetFileNameWithoutExtension(file.FileName);
    if (string.IsNullOrWhiteSpace(paperId))
    {
        return Results.BadRequest(new { error = "filename must include a non-empty stem" });
    }
    using var stream = file.OpenReadStream();
    var result = await reader.IngestAsync(stream, paperId, ct);
    return Results.Ok(result);
}).DisableAntiforgery();

app.MapGet("/api/papers", async (QdrantPaperRepository repo, CancellationToken ct) =>
{
    var papers = await repo.ListPapersAsync(ct);
    return Results.Ok(papers);
});

app.MapQueryEndpoints();
app.MapDiscoveryEndpoints();
app.MapBaselineEndpoints();

app.Run();
