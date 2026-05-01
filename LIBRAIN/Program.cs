using LIBRAIN.Agents;
using LIBRAIN.Embeddings;
using LIBRAIN.Models;
using LIBRAIN.Reading;
using LIBRAIN.Storage;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

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
builder.Services.Configure<CosmosOptions>(
    builder.Configuration.GetSection(CosmosOptions.SectionName));

builder.Services.AddScoped<AnthropicChatClient>();
builder.Services.AddScoped<OpenAIEmbeddingClient>();
builder.Services.AddScoped<CosmosPaperRepository>();
builder.Services.AddScoped<PdfTextExtractor>();
builder.Services.AddScoped<RecursiveChunker>();
builder.Services.AddScoped<ReaderAgent>();
builder.Services.AddScoped<SynthesisAgent>();
builder.Services.AddScoped<EvaluatorAgent>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run();
