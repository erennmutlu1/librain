using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using LIBRAIN.Tests.Fixtures;

namespace LIBRAIN.Tests.Api;

// Paper ingest / list / delete over HTTP, with arXiv played from captured real
// responses and the PDF text layer taken from the real abstract of 2005.11401.
public sealed class PaperEndpointTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    [Fact]
    public async Task ArxivIngest_StoresChunksWithAuthoritativeMetadata()
    {
        await using var factory = new LibrainApiFactory();
        var http = factory.CreateClient();

        var res = await http.PostAsJsonAsync("/api/papers/arxiv", new { arxivId = "arXiv:2005.11401v4" }, Ct);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>(Ct);
        Assert.Equal("2005.11401", body.GetProperty("paperId").GetString());
        Assert.Equal("Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", body.GetProperty("title").GetString());

        var chunks = factory.Store.Persisted.Where(c => c.PaperId == "2005.11401").ToArray();
        Assert.NotEmpty(chunks);
        Assert.All(chunks, c =>
        {
            Assert.Equal(2020, c.Year);                       // from the API, not the PDF build date
            Assert.Equal("Patrick Lewis", c.Authors![0]);
        });
        Assert.Contains("retrieval-augmented generation", string.Join(" ", chunks.Select(c => c.Content)), StringComparison.OrdinalIgnoreCase);

        var papers = await http.GetFromJsonAsync<JsonElement>("/api/papers", Ct);
        var listed = papers.EnumerateArray().Single(p => p.GetProperty("paperId").GetString() == "2005.11401");
        Assert.Equal(2020, listed.GetProperty("year").GetInt32());
        Assert.Equal("Patrick Lewis", listed.GetProperty("authors")[0].GetString());
    }

    [Theory]
    [InlineData("not-an-id", HttpStatusCode.BadRequest)]
    [InlineData("2005.99999", HttpStatusCode.NotFound)]
    public async Task ArxivIngest_BadOrUnknownId(string arxivId, HttpStatusCode expected)
    {
        await using var factory = new LibrainApiFactory();
        var res = await factory.CreateClient().PostAsJsonAsync("/api/papers/arxiv", new { arxivId }, Ct);

        Assert.Equal(expected, res.StatusCode);
        Assert.Empty(factory.Store.Persisted);
    }

    [Fact]
    public async Task UploadIngest_RealPdf_ThenDelete()
    {
        await using var factory = new LibrainApiFactory();
        var http = factory.CreateClient();
        using var form = new MultipartFormDataContent { { new ByteArrayContent(RealData.RagAbstractPdf()), "file", "rag-abstract.pdf" } };

        var res = await http.PostAsync("/api/papers/ingest", form, Ct);
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Contains(factory.Store.Persisted, c => c.PaperId == "rag-abstract");

        Assert.Equal(HttpStatusCode.NoContent, (await http.DeleteAsync("/api/papers/rag-abstract", Ct)).StatusCode);
        Assert.DoesNotContain(factory.Store.Persisted, c => c.PaperId == "rag-abstract");
        Assert.Equal(HttpStatusCode.NotFound, (await http.DeleteAsync("/api/papers/rag-abstract", Ct)).StatusCode);
    }

    [Fact]
    public async Task UploadIngest_NotAPdf_Returns400NotA500()
    {
        await using var factory = new LibrainApiFactory();
        using var form = new MultipartFormDataContent { { new ByteArrayContent("plain text, not a pdf"u8.ToArray()), "file", "notes.pdf" } };

        var res = await factory.CreateClient().PostAsync("/api/papers/ingest", form, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task UploadIngest_UnsafeFileName_Returns400()
    {
        await using var factory = new LibrainApiFactory();
        using var form = new MultipartFormDataContent { { new ByteArrayContent(RealData.RagAbstractPdf()), "file", "../../etc/x y.pdf" } };

        var res = await factory.CreateClient().PostAsync("/api/papers/ingest", form, Ct);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }
}
