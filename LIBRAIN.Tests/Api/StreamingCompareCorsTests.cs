using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace LIBRAIN.Tests.Api;

public sealed class StreamingCompareCorsTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private sealed record SseEvent(string Type, JsonElement Data);

    private static async Task<List<SseEvent>> ReadSse(HttpResponseMessage res)
    {
        Assert.Equal("text/event-stream", res.Content.Headers.ContentType?.MediaType);
        var text = await res.Content.ReadAsStringAsync(Ct);
        var events = new List<SseEvent>();
        foreach (var block in text.Replace("\r\n", "\n").Split("\n\n", StringSplitOptions.RemoveEmptyEntries))
        {
            string? type = null; var data = new StringBuilder();
            foreach (var line in block.Split('\n'))
            {
                if (line.StartsWith("event:", StringComparison.Ordinal)) type = line[6..].Trim();
                else if (line.StartsWith("data:", StringComparison.Ordinal)) data.Append(line[5..].TrimStart());
            }
            if (type is not null) events.Add(new SseEvent(type, JsonDocument.Parse(data.ToString()).RootElement.Clone()));
        }
        return events;
    }

    [Fact]
    public async Task DiscoverStream_EmitsOrderedProgressThenResult_AndSavesTheRun()
    {
        await using var factory = new LibrainApiFactory();
        var http = factory.CreateClient();

        var res = await http.PostAsJsonAsync("/api/discover/stream",
            new { topicA = "weather forecasting", topicB = "protein folding", topK = 2 }, Ct);
        var events = await ReadSse(res);

        Assert.Equal(
            new[] { "retrieving", "retrieved", "generating", "validated", "scoring" },
            events.Where(e => e.Type == "progress").Select(e => e.Data.GetProperty("stage").GetString()));
        Assert.Equal(3, events.Single(e => e.Data.TryGetProperty("stage", out var s) && s.GetString() == "retrieved")
            .Data.GetProperty("count").GetInt32());

        var result = events.Last();
        Assert.Equal("result", result.Type);
        Assert.Equal(1, result.Data.GetProperty("droppedEvidenceCount").GetInt32());   // camelCase, same shape as /api/discover
        Assert.False(string.IsNullOrEmpty(result.Data.GetProperty("supportingEvidence")[0].GetProperty("content").GetString()));

        var id = result.Data.GetProperty("correlationId").GetGuid();
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync($"/api/runs/{id}", Ct)).StatusCode);
    }

    [Fact]
    public async Task DiscoverStream_JudgeFailure_EndsWithErrorEvent_NoResult()
    {
        await using var factory = new LibrainApiFactory();
        factory.Llm.OnTool("submit_discovery_evaluation", """{"structural_coherence": 0.9}""");

        var events = await ReadSse(await factory.CreateClient().PostAsJsonAsync("/api/discover/stream",
            new { topicA = "weather forecasting", topicB = "protein folding", topK = 2 }, Ct));

        Assert.Equal("error", events.Last().Type);
        Assert.DoesNotContain(events, e => e.Type == "result");
    }

    [Fact]
    public async Task DiscoverStream_InvalidInput_IsAPlain400()
    {
        await using var factory = new LibrainApiFactory();
        var res = await factory.CreateClient().PostAsJsonAsync("/api/discover/stream", new { topicA = "x", topicB = "x" }, Ct);
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task QueryStream_EmitsProgress_ThenGroundedAnswerWithPassageText()
    {
        await using var factory = new LibrainApiFactory();

        var events = await ReadSse(await factory.CreateClient().PostAsJsonAsync("/api/query/stream",
            new { query = "Why does GraphCast forecast well?", topK = 2 }, Ct));

        Assert.Equal(
            new[] { "retrieving", "retrieved", "generating", "validated", "evaluating" },
            events.Where(e => e.Type == "progress").Select(e => e.Data.GetProperty("stage").GetString()));
        var answer = events.Last().Data;
        var citations = answer.GetProperty("citations");
        Assert.Equal(2, citations.GetArrayLength());                 // index 9 was not retrieved: dropped by the contract
        Assert.Equal("GraphCast forecasts weather with graph neural networks.", citations[0].GetProperty("content").GetString());
        Assert.Equal(0.6f, answer.GetProperty("evaluation").GetProperty("completenessScore").GetSingle(), precision: 4);
    }

    [Fact]
    public async Task Compare_RunsAllThreeSystems_AndSurfacesNaiveRagFabrication()
    {
        await using var factory = new LibrainApiFactory();
        var http = factory.CreateClient();

        var res = await http.PostAsJsonAsync("/api/compare", new { topicA = "weather forecasting", topicB = "protein folding", topK = 2 }, Ct);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal(1, body.GetProperty("librain").GetProperty("result").GetProperty("droppedEvidenceCount").GetInt32());
        var naive = body.GetProperty("naiveRag").GetProperty("result");
        Assert.Equal(1, naive.GetProperty("fabricatedCitationCount").GetInt32());   // pangu-weather:4 was never retrieved
        Assert.False(naive.GetProperty("claimedCitations")[1].GetProperty("isResolved").GetBoolean());
        Assert.Equal("A plain-text hypothesis.", body.GetProperty("singleLlm").GetProperty("result").GetProperty("hypothesis").GetString());

        var runs = await http.GetFromJsonAsync<JsonElement>("/api/runs?kind=compare", Ct);
        Assert.Equal(body.GetProperty("correlationId").GetGuid(), runs[0].GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task Compare_OneSystemFails_OthersStillReturned()
    {
        await using var factory = new LibrainApiFactory();
        factory.Llm.OnTool("submit_discovery", _ => throw new InvalidOperationException("LIBRAIN model call failed"));

        var res = await factory.CreateClient().PostAsJsonAsync("/api/compare", new { topicA = "weather forecasting", topK = 2 }, Ct);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal(JsonValueKind.Null, body.GetProperty("librain").GetProperty("result").ValueKind);
        Assert.Contains("LIBRAIN failed", body.GetProperty("librain").GetProperty("error").GetString());
        Assert.Equal(JsonValueKind.Object, body.GetProperty("naiveRag").GetProperty("result").ValueKind);
    }

    [Theory]
    [InlineData("http://localhost:5173", true)]
    [InlineData("https://evil.example", false)]
    public async Task Cors_AllowsTheViteDevServerOnly(string origin, bool allowed)
    {
        await using var factory = new LibrainApiFactory();
        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/discover");
        preflight.Headers.Add("Origin", origin);
        preflight.Headers.Add("Access-Control-Request-Method", "POST");
        preflight.Headers.Add("Access-Control-Request-Headers", "content-type");

        var res = await factory.CreateClient().SendAsync(preflight, Ct);

        Assert.Equal(allowed, res.Headers.TryGetValues("Access-Control-Allow-Origin", out var values) && values.Single() == origin);
    }
}
