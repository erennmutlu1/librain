using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LIBRAIN.Runs;
using LIBRAIN.Tests.Api;
using LIBRAIN.Tests.Fixtures;
using Microsoft.Data.Sqlite;

namespace LIBRAIN.Tests.Runs;

public sealed class SqliteRunStoreTests : IDisposable
{
    private readonly string _db = Path.Combine(Path.GetTempPath(), $"librain-runstore-{Guid.NewGuid():N}.db");
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        if (File.Exists(_db)) File.Delete(_db);
    }

    // A real committed Discovery output (experiments/discovery-openai/pair-01.json).
    private static JsonElement CommittedDiscovery() =>
        JsonDocument.Parse(File.ReadAllText(RealData.RepoFile("experiments", "discovery-openai", "pair-01.json"))).RootElement.Clone();

    [Fact]
    public async Task SaveGetListDelete_RoundTripsRealResultExactly()
    {
        var store = new SqliteRunStore(_db);
        var response = CommittedDiscovery();
        var id = response.GetProperty("correlationId").GetGuid();
        var request = JsonSerializer.SerializeToElement(new { topicA = "drug discovery", topicB = "LLMs", topK = 5 });

        await store.SaveAsync(new RunRecord(id, RunKinds.Discover, "drug discovery × LLMs", DateTime.UtcNow, 0.42947832f, request, response), Ct);

        var got = await store.GetAsync(id, Ct);
        Assert.NotNull(got);
        Assert.Equal(response.GetRawText(), got!.Response.GetRawText());
        Assert.Equal(0.42947832f, got.Quality);
        Assert.Equal(RunKinds.Discover, (await store.ListAsync(null, 10, Ct)).Single().Kind);

        Assert.True(await store.DeleteAsync(id, Ct));
        Assert.Null(await store.GetAsync(id, Ct));
        Assert.False(await store.DeleteAsync(id, Ct));
    }

    [Fact]
    public async Task List_NewestFirst_FiltersByKind_RespectsLimit()
    {
        var store = new SqliteRunStore(_db);
        var empty = JsonSerializer.SerializeToElement(new { });
        var t0 = new DateTime(2026, 11, 18, 10, 0, 0, DateTimeKind.Utc);
        for (var i = 0; i < 5; i++)
        {
            var kind = i % 2 == 0 ? RunKinds.Query : RunKinds.Discover;
            await store.SaveAsync(new RunRecord(Guid.NewGuid(), kind, $"run {i}", t0.AddMinutes(i), null, empty, empty), Ct);
        }

        var all = await store.ListAsync(null, 10, Ct);
        Assert.Equal(new[] { "run 4", "run 3", "run 2", "run 1", "run 0" }, all.Select(r => r.Title));
        Assert.All(await store.ListAsync(RunKinds.Discover, 10, Ct), r => Assert.Equal(RunKinds.Discover, r.Kind));
        Assert.Equal(2, (await store.ListAsync(null, 2, Ct)).Count);
        Assert.Null(all[0].Quality);
    }
}

public sealed class RunEndpointTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task DiscoverRun_IsSaved_AndRetrievableByCorrelationId()
    {
        await using var factory = new LibrainApiFactory();
        var http = factory.CreateClient();

        var res = await http.PostAsJsonAsync("/api/discover",
            new { topicA = "weather forecasting", topicB = "protein folding", topK = 2 }, Ct);
        var discovered = await res.Content.ReadFromJsonAsync<JsonElement>(Ct);
        var id = discovered.GetProperty("correlationId").GetGuid();

        var list = await http.GetFromJsonAsync<JsonElement>("/api/runs", Ct);
        var summary = list.EnumerateArray().Single();
        Assert.Equal(id, summary.GetProperty("id").GetGuid());
        Assert.Equal("discover", summary.GetProperty("kind").GetString());
        Assert.Equal("weather forecasting × protein folding", summary.GetProperty("title").GetString());

        var run = await http.GetFromJsonAsync<JsonElement>($"/api/runs/{id}", Ct);
        Assert.Equal(discovered.GetProperty("hypothesis").GetString(),
            run.GetProperty("response").GetProperty("hypothesis").GetString());
        Assert.Equal(2, run.GetProperty("request").GetProperty("topK").GetInt32());

        Assert.Equal(HttpStatusCode.NoContent, (await http.DeleteAsync($"/api/runs/{id}", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await http.GetAsync($"/api/runs/{id}", Ct)).StatusCode);
    }

    [Fact]
    public async Task FailedRun_IsNotSaved()
    {
        await using var factory = new LibrainApiFactory();
        factory.Llm.OnTool("submit_discovery_evaluation", """{"structural_coherence": 0.9}""");
        var http = factory.CreateClient();

        await http.PostAsJsonAsync("/api/discover", new { topicA = "a", topicB = "b", topK = 2 }, Ct);

        Assert.Equal(0, (await http.GetFromJsonAsync<JsonElement>("/api/runs", Ct)).GetArrayLength());
    }

    [Fact]
    public async Task UnknownKind_Returns400()
    {
        await using var factory = new LibrainApiFactory();
        var res = await factory.CreateClient().GetAsync("/api/runs?kind=bogus", Ct);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
