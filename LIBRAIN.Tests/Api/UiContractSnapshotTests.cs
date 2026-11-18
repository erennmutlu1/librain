using System.Net.Http.Json;
using System.Text.Json;

namespace LIBRAIN.Tests.Api;

// Captures REAL responses from the API (in-memory host, fake LLM/embeddings/store) for
// every endpoint the web UI calls, so the UI's types and tests are checked against what
// the backend actually returns. Always runs as a smoke test; writes the snapshots into
// web/src/mocks/contract/ only when LIBRAIN_WRITE_UI_CONTRACT=1:
//   LIBRAIN_WRITE_UI_CONTRACT=1 dotnet test --filter UiContractSnapshotTests
public sealed class UiContractSnapshotTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    private static readonly JsonSerializerOptions Pretty = new() { WriteIndented = true };

    [Fact]
    public async Task CaptureContractSnapshots()
    {
        await using var factory = new LibrainApiFactory();
        var http = factory.CreateClient();
        var snapshots = new Dictionary<string, string>();

        async Task<JsonElement> Json(HttpResponseMessage res, string name)
        {
            res.EnsureSuccessStatusCode();
            var json = await res.Content.ReadFromJsonAsync<JsonElement>(Ct);
            snapshots[name + ".json"] = JsonSerializer.Serialize(json, Pretty);
            return json;
        }

        using (var form = new MultipartFormDataContent { { new ByteArrayContent(Fixtures.RealData.RagAbstractPdf()), "file", "2005.11401.pdf" } })
            await Json(await http.PostAsync("/api/papers/ingest", form, Ct), "ingest-result");
        await Json(await http.PostAsJsonAsync("/api/papers/arxiv", new { arxivId = "2005.11401" }, Ct), "arxiv-ingest-result");
        await Json(await http.GetAsync("/api/papers", Ct), "papers");

        var topics = new { topicA = "weather forecasting", topicB = "protein folding", topK = 2 };
        await Json(await http.PostAsJsonAsync("/api/query", new { query = "Why does GraphCast forecast well?", topK = 2 }, Ct), "query-response");
        var discover = await Json(await http.PostAsJsonAsync("/api/discover", topics, Ct), "discover-response");
        await Json(await http.PostAsJsonAsync("/api/naive-rag", topics, Ct), "naive-rag-response");
        await Json(await http.PostAsJsonAsync("/api/single-llm", topics, Ct), "single-llm-response");
        await Json(await http.PostAsJsonAsync("/api/compare", topics, Ct), "compare-response");
        await Json(await http.GetAsync("/api/runs", Ct), "runs");
        await Json(await http.GetAsync($"/api/runs/{discover.GetProperty("correlationId").GetGuid()}", Ct), "run-record");

        var stream = await http.PostAsJsonAsync("/api/discover/stream", topics, Ct);
        snapshots["discover-stream.txt"] = await stream.Content.ReadAsStringAsync(Ct);
        var queryStream = await http.PostAsJsonAsync("/api/query/stream", new { query = "Why does GraphCast forecast well?", topK = 2 }, Ct);
        snapshots["query-stream.txt"] = await queryStream.Content.ReadAsStringAsync(Ct);
        var problem = await http.PostAsJsonAsync("/api/discover", new { topicA = "" }, Ct);
        snapshots["problem-400.json"] = JsonSerializer.Serialize(await problem.Content.ReadFromJsonAsync<JsonElement>(Ct), Pretty);

        Assert.Equal(13, snapshots.Count);
        Assert.Contains("event: result", snapshots["discover-stream.txt"]);
        Assert.Contains("event: result", snapshots["query-stream.txt"]);

        if (Environment.GetEnvironmentVariable("LIBRAIN_WRITE_UI_CONTRACT") == "1")
        {
            var dir = Fixtures.RealData.RepoFile("web", "src", "mocks", "contract");
            Directory.CreateDirectory(dir);
            foreach (var (name, content) in snapshots)
                await File.WriteAllTextAsync(Path.Combine(dir, name), content.ReplaceLineEndings("\n") + (content.EndsWith('\n') ? "" : "\n"), Ct);
        }
    }
}
