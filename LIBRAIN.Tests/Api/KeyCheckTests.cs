using System.Collections.Concurrent;
using System.Net;
using System.Text.Json;
using LIBRAIN.Endpoints;
using LIBRAIN.Llm;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;

namespace LIBRAIN.Tests.Api;

// POST /api/keys/check: free, per-provider verdicts, visitor keys only, nothing echoed.
public sealed class KeyCheckTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    private const string AnthropicKey = "sk-ant-SENTINEL-check-5d1e";
    private const string OpenAiKey = "sk-proj-SENTINEL-check-9c4a";

    // Stands in for api.anthropic.com and api.openai.com; records what was sent.
    private sealed class FakeProviders : HttpMessageHandler
    {
        public HttpStatusCode Anthropic { get; set; } = HttpStatusCode.OK;
        public HttpStatusCode OpenAI { get; set; } = HttpStatusCode.OK;
        public bool OpenAIDown { get; set; }
        public ConcurrentBag<(Uri Uri, string? ApiKey, string? Version, string? Bearer)> Requests { get; } = [];

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            request.Headers.TryGetValues("x-api-key", out var key);
            request.Headers.TryGetValues("anthropic-version", out var version);
            Requests.Add((request.RequestUri!, key?.Single(), version?.Single(), request.Headers.Authorization?.Parameter));
            if (request.RequestUri!.Host == "api.openai.com")
            {
                if (OpenAIDown) throw new HttpRequestException("Name or service not known (api.openai.com:443)");
                // OpenAI quotes part of a rejected key in its error body: it must never reach the visitor's response.
                return Task.FromResult(new HttpResponseMessage(OpenAI) { Content = new StringContent($"{{\"error\":\"Incorrect API key provided: {OpenAiKey}\"}}") });
            }
            return Task.FromResult(new HttpResponseMessage(Anthropic) { Content = new StringContent("{}") });
        }
    }

    private static (LibrainApiFactory Root, HttpClient Http) Public(FakeProviders providers, Dictionary<string, string>? extra = null)
    {
        var settings = new Dictionary<string, string>
        {
            ["Public:Enabled"] = "true",
            ["Anthropic:ApiKey"] = "sk-ant-SERVER-OWNER-KEY",
            ["OpenAI:ApiKey"] = "sk-SERVER-OWNER-KEY",
        };
        foreach (var (k, v) in extra ?? []) settings[k] = v;
        var root = new LibrainApiFactory { Settings = settings };
        var http = root.WithWebHostBuilder(b => b.ConfigureServices(s =>
            s.AddHttpClient(KeyCheckEndpoints.ClientName).ConfigurePrimaryHttpMessageHandler(() => providers))).CreateClient();
        return (root, http);
    }

    private static HttpRequestMessage Check(bool anthropic = true, bool openAi = true)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, KeyCheckEndpoints.Path);
        if (anthropic) request.Headers.Add(ProviderKeys.AnthropicHeader, AnthropicKey);
        if (openAi) request.Headers.Add(ProviderKeys.OpenAIHeader, OpenAiKey);
        return request;
    }

    private static async Task<(string Anthropic, string OpenAI, string Body)> Read(HttpResponseMessage response)
    {
        var body = await response.Content.ReadAsStringAsync(Ct);
        var root = JsonDocument.Parse(body).RootElement;
        return (root.GetProperty("anthropic").GetProperty("status").GetString()!, root.GetProperty("openai").GetProperty("status").GetString()!, body);
    }

    [Fact]
    public async Task AcceptedKeys_AreValid_AndEachGoesOnlyToItsOwnProvider()
    {
        var providers = new FakeProviders();
        var (root, http) = Public(providers);
        await using var _ = root;

        var response = await http.SendAsync(Check(), Ct);
        var (anthropic, openAi, body) = await Read(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("valid", anthropic);
        Assert.Equal("valid", openAi);
        Assert.DoesNotContain("SENTINEL", body);
        var a = Assert.Single(providers.Requests, r => r.Uri.Host == "api.anthropic.com");
        var o = Assert.Single(providers.Requests, r => r.Uri.Host == "api.openai.com");
        Assert.Equal((AnthropicKey, "2023-06-01", (string?)null), (a.ApiKey, a.Version, a.Bearer));
        Assert.Equal(("/v1/models", (string?)null, OpenAiKey), (o.Uri.AbsolutePath, o.ApiKey, o.Bearer));
        Assert.Empty(root.Llm.Calls);                                       // no model was run
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, "invalid")]
    [InlineData(HttpStatusCode.Forbidden, "invalid")]
    [InlineData(HttpStatusCode.TooManyRequests, "rate_limited")]
    [InlineData(HttpStatusCode.InternalServerError, "unreachable")]
    public async Task ProviderAnswers_MapToAStatus_WithoutEchoingTheProviderBody(HttpStatusCode upstream, string expected)
    {
        var providers = new FakeProviders { OpenAI = upstream };
        var (root, http) = Public(providers);
        await using var _ = root;

        var (anthropic, openAi, body) = await Read(await http.SendAsync(Check(), Ct));

        Assert.Equal("valid", anthropic);
        Assert.Equal(expected, openAi);
        Assert.DoesNotContain("SENTINEL", body);
        Assert.DoesNotContain("Incorrect API key", body);
    }

    [Fact]
    public async Task OneKey_IsEnough_TheOtherIsNotProvided()
    {
        var providers = new FakeProviders();
        var (root, http) = Public(providers);
        await using var _ = root;

        var response = await http.SendAsync(Check(openAi: false), Ct);
        var (anthropic, openAi, _) = await Read(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);              // not the pipelines' 401
        Assert.Equal(("valid", "not_provided"), (anthropic, openAi));
        Assert.DoesNotContain(providers.Requests, r => r.Uri.Host == "api.openai.com");
    }

    [Fact]
    public async Task NoKeys_Is400_AndTheServerKeysAreNeverChecked()
    {
        var providers = new FakeProviders();
        var (root, http) = Public(providers);
        await using var _ = root;

        var response = await http.SendAsync(Check(anthropic: false, openAi: false), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("no keys to check", await response.Content.ReadAsStringAsync(Ct));
        Assert.Empty(providers.Requests);
    }

    [Fact]
    public async Task AnUnreachableProvider_IsReported_NotThrown()
    {
        var providers = new FakeProviders { OpenAIDown = true };
        var (root, http) = Public(providers);
        await using var _ = root;

        var response = await http.SendAsync(Check(), Ct);
        var (anthropic, openAi, body) = await Read(response);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(("valid", "unreachable"), (anthropic, openAi));
        Assert.DoesNotContain("SENTINEL", body);
    }

    [Fact]
    public async Task KeyChecks_HaveTheirOwnHourlyLimit()
    {
        var providers = new FakeProviders();
        var (root, http) = Public(providers, new() { ["RateLimiting:PaidRequestsPerHour"] = "1" });
        await using var _ = root;

        for (var i = 0; i < Guards.KeyChecksPerHour; i++)
            Assert.Equal(HttpStatusCode.OK, (await http.SendAsync(Check(), Ct)).StatusCode);
        var over = await http.SendAsync(Check(), Ct);

        Assert.Equal(HttpStatusCode.TooManyRequests, over.StatusCode);
        Assert.Contains("key checks", await over.Content.ReadAsStringAsync(Ct));
    }
}
