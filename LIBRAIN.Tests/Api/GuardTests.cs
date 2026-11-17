using System.Net;
using System.Net.Http.Json;
using LIBRAIN.Reading;
using Microsoft.Extensions.Logging.Abstractions;

namespace LIBRAIN.Tests.Api;

public sealed class GuardTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    private static readonly object Topics = new { topicA = "weather forecasting", topicB = "protein folding", topK = 2 };

    [Fact]
    public async Task ApiKey_WhenConfigured_IsRequiredOnApiRoutes_ButNotOnHealthOrPreflight()
    {
        await using var factory = new LibrainApiFactory { Settings = { ["Security:ApiKey"] = "s3cret" } };
        var http = factory.CreateClient();

        Assert.Equal(HttpStatusCode.Unauthorized, (await http.GetAsync("/api/papers", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await http.PostAsJsonAsync("/api/discover", Topics, Ct)).StatusCode);
        Assert.Empty(factory.Llm.Calls);                                   // rejected before any paid call
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync("/health", Ct)).StatusCode);

        using var wrong = new HttpRequestMessage(HttpMethod.Get, "/api/papers") { Headers = { { "X-Api-Key", "guess" } } };
        Assert.Equal(HttpStatusCode.Unauthorized, (await http.SendAsync(wrong, Ct)).StatusCode);
        using var right = new HttpRequestMessage(HttpMethod.Get, "/api/papers") { Headers = { { "X-Api-Key", "s3cret" } } };
        Assert.Equal(HttpStatusCode.OK, (await http.SendAsync(right, Ct)).StatusCode);

        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/discover");
        preflight.Headers.Add("Origin", "http://localhost:5173");
        preflight.Headers.Add("Access-Control-Request-Method", "POST");
        preflight.Headers.Add("Access-Control-Request-Headers", "content-type,x-api-key");
        Assert.True((await http.SendAsync(preflight, Ct)).IsSuccessStatusCode);
    }

    [Fact]
    public async Task ApiKey_NotConfigured_EverythingOpen()
    {
        await using var factory = new LibrainApiFactory();
        Assert.Equal(HttpStatusCode.OK, (await factory.CreateClient().GetAsync("/api/papers", Ct)).StatusCode);
    }

    [Fact]
    public async Task RateLimit_StopsPaidCalls_AfterTheHourlyBudget_ButNotFreeReads()
    {
        await using var factory = new LibrainApiFactory { Settings = { ["RateLimiting:PaidRequestsPerHour"] = "2" } };
        var http = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await http.PostAsJsonAsync("/api/discover", Topics, Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await http.PostAsJsonAsync("/api/compare", Topics, Ct)).StatusCode);
        var callsBefore = factory.Llm.Calls.Count;

        var third = await http.PostAsJsonAsync("/api/discover/stream", Topics, Ct);

        Assert.Equal(HttpStatusCode.TooManyRequests, third.StatusCode);
        Assert.True(third.Headers.Contains("Retry-After"));
        Assert.Equal(callsBefore, factory.Llm.Calls.Count);                 // nothing was sent to the model
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync("/api/runs", Ct)).StatusCode);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   \n\n \t ")]
    public void Chunker_WhitespaceOnlyDocument_ProducesNoChunks(string text)
    {
        Assert.Empty(new RecursiveChunker(NullLogger<RecursiveChunker>.Instance).Chunk(text));
    }
}
