using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LIBRAIN.Embeddings;
using LIBRAIN.Llm;
using LIBRAIN.Storage;
using LIBRAIN.Tests.Fixtures;
using LIBRAIN.Tests.Pipeline;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace LIBRAIN.Tests.Api;

// Boots the real ASP.NET Core app in memory with the LLM, embeddings and vector store
// replaced by fakes. No network, no API keys, no Qdrant. Pins the HTTP contract the
// web UI depends on (routes, status codes, camelCase JSON, error shapes).
// Any public type from the LIBRAIN assembly identifies the app to boot. `Program` is
// ambiguous here because LIBRAIN.Experiments has one too.
public sealed class LibrainApiFactory : WebApplicationFactory<LIBRAIN.Agents.DiscoveryAgent>
{
    // Extra configuration, e.g. new LibrainApiFactory { Settings = { ["Security:ApiKey"] = "x" } }.
    // (A property, not a constructor parameter: xUnit fixtures need one public constructor.)
    public Dictionary<string, string> Settings { get; init; } = new();

    public FakeLlmClient Llm { get; } = new FakeLlmClient()
        .OnTool("submit_discovery", DiscoveryPipelineFixtures.Discovery)
        .OnTool("submit_claim_validation", DiscoveryPipelineFixtures.Claims)
        .OnTool("submit_discovery_evaluation", DiscoveryPipelineFixtures.Judge)
        // Synthesis (/api/query) and Naive-RAG share the tool name "submit_hypothesis";
        // each reads only its own fields from this reply. Naive-RAG claims one retrieved
        // chunk and one that was never retrieved (a fabrication it must surface).
        .OnTool("submit_hypothesis", """
            {
              "hypothesis": "Graph message passing explains GraphCast's skill at medium-range forecasting [1][2].",
              "citation_indices": [1, 2, 9],
              "confidence": 0.8,
              "unsupported_claims": [],
              "claimed_citations": [
                {"paper_id": "graphcast", "chunk_index": 1},
                {"paper_id": "pangu-weather", "chunk_index": 4}
              ]
            }
            """)
        .OnTool("submit_evaluation", """
            {"groundedness_score": 0.9, "relevance_score": 0.85, "completeness_score": 0.6,
             "critique": "Grounded in both cited passages.", "unsupported_claims": [], "missing_evidence": ["No error metrics cited."]}
            """);

    public FakePaperStore Store { get; } = new(DiscoveryPipelineFixtures.HitsA, DiscoveryPipelineFixtures.HitsB);
    public FakeArxivHandler Arxiv { get; } = new();

    // Per-factory throwaway run database, never inside the repo.
    public string RunsDb { get; } = Path.Combine(Path.GetTempPath(), $"librain-runs-{Guid.NewGuid():N}.db");

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        foreach (var f in new[] { RunsDb, RunsDb + "-shm", RunsDb + "-wal" }) if (File.Exists(f)) File.Delete(f);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseSetting("OpenAI:ApiKey", "test-not-used");
        builder.UseSetting("Qdrant:Host", "localhost");
        builder.UseSetting("Runs:DatabasePath", RunsDb);
        foreach (var (key, value) in Settings) builder.UseSetting(key, value);
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<ILlmClient>();
            services.RemoveAll<IEmbeddingClient>();
            services.RemoveAll<IPaperStore>();
            services.AddSingleton<ILlmClient>(Llm);
            services.AddSingleton<IEmbeddingClient, FakeEmbeddings>();
            services.AddSingleton<IPaperStore>(Store);
            services.AddHttpClient<LIBRAIN.Ingestion.ArxivClient>().ConfigurePrimaryHttpMessageHandler(() => Arxiv);
        });
    }
}

public sealed class ApiEndpointTests(LibrainApiFactory factory) : IClassFixture<LibrainApiFactory>
{
    private readonly HttpClient _http = factory.CreateClient();
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task Health_IsOk()
    {
        var res = await _http.GetAsync("/health", Ct);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task Papers_ReturnsJsonArray()
    {
        var json = await _http.GetFromJsonAsync<JsonElement>("/api/papers", Ct);
        Assert.Equal(JsonValueKind.Array, json.ValueKind);
    }

    [Theory]
    [InlineData("/api/query", """{"query": "  "}""")]
    [InlineData("/api/query", """{"query": "q", "topK": 0}""")]
    [InlineData("/api/discover", """{"topicA": ""}""")]
    [InlineData("/api/discover", """{"topicA": "a", "topK": 21}""")]
    public async Task InvalidInput_Returns400ProblemDetails(string route, string body)
    {
        var res = await _http.PostAsync(route, new StringContent(body, System.Text.Encoding.UTF8, "application/json"), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("application/problem+json", res.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Discover_ReturnsContractShapedCamelCaseJson()
    {
        var res = await _http.PostAsJsonAsync("/api/discover",
            new { topicA = "weather forecasting", topicB = "protein folding", topK = 2 }, Ct);
        res.EnsureSuccessStatusCode();
        var json = await res.Content.ReadFromJsonAsync<JsonElement>(Ct);

        Assert.False(string.IsNullOrWhiteSpace(json.GetProperty("hypothesis").GetString()));
        Assert.Equal(3, json.GetProperty("claimedEvidenceCount").GetInt32());
        Assert.Equal(1, json.GetProperty("droppedEvidenceCount").GetInt32());
        Assert.Equal(2, json.GetProperty("supportingEvidence").GetArrayLength());
        var validation = json.GetProperty("claimValidation");
        Assert.False(validation.GetProperty("validationFailed").GetBoolean());
        Assert.Equal(JsonValueKind.Number, validation.GetProperty("aggregateRisk").ValueKind);
        // No JsonStringEnumConverter is configured: statuses go out as numbers
        // (Grounded=0, Extrapolated=1, Risky=2). The web UI relies on this.
        Assert.Equal(1, validation.GetProperty("claims")[0].GetProperty("status").GetInt32());
        Assert.Equal(JsonValueKind.Number, json.GetProperty("evaluation").GetProperty("qualityScore").ValueKind);
    }

    [Fact]
    public async Task Ingest_WithoutFile_Returns400()
    {
        using var form = new MultipartFormDataContent { { new StringContent("x"), "notAFile" } };
        var res = await _http.PostAsync("/api/papers/ingest", form, Ct);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}

public sealed class ApiFailureTests
{
    [Fact]
    public async Task Discover_JudgeOmitsScore_Returns502ProblemNotAZeroScore()
    {
        await using var factory = new LibrainApiFactory();
        factory.Llm.OnTool("submit_discovery_evaluation", """{"structural_coherence": 0.9}""");
        var http = factory.CreateClient();

        var res = await http.PostAsJsonAsync("/api/discover",
            new { topicA = "weather forecasting", topicB = "protein folding", topK = 2 }, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadGateway, res.StatusCode);
        Assert.Equal("application/problem+json", res.Content.Headers.ContentType?.MediaType);
        // The failed run is traceable in the server logs by this id.
        var problem = await res.Content.ReadFromJsonAsync<JsonElement>(TestContext.Current.CancellationToken);
        Assert.NotEqual(Guid.Empty, problem.GetProperty("correlationId").GetGuid());
    }
}
