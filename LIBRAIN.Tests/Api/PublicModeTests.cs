using System.Collections.Concurrent;
using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using LIBRAIN.Agents;
using LIBRAIN.Endpoints;
using LIBRAIN.Llm;
using LIBRAIN.Models;
using LIBRAIN.Runs;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace LIBRAIN.Tests.Api;

// The public deployment's promises, pinned: the server never spends its own keys, a
// visitor's keys are used for their own request only and never stored, logged or echoed,
// and the corpus cannot be changed.
public sealed partial class PublicModeTests
{
    private static CancellationToken Ct => TestContext.Current.CancellationToken;
    private static readonly object Topics = new { topicA = "weather forecasting", topicB = "protein folding", topK = 2 };

    private const string VisitorAnthropicKey = "sk-ant-SENTINEL-visitor-7f3a9c";
    private const string VisitorOpenAiKey = "sk-proj-SENTINEL-visitor-2b8e1d";
    private const string Origin = "https://librain.erenmutlu.me";

    private static LibrainApiFactory PublicFactory(Dictionary<string, string>? extra = null)
    {
        var settings = new Dictionary<string, string>
        {
            ["Public:Enabled"] = "true",
            ["Cors:AllowedOrigins:0"] = Origin,
            // Configured by mistake on a public deployment: must never be used.
            ["Anthropic:ApiKey"] = "sk-ant-SERVER-OWNER-KEY",
            ["OpenAI:ApiKey"] = "sk-SERVER-OWNER-KEY",
        };
        foreach (var (k, v) in extra ?? []) settings[k] = v;
        return new LibrainApiFactory { Settings = settings };
    }

    private static HttpRequestMessage Post(string path, object body, bool anthropic = true, bool openAi = true)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(body) };
        if (anthropic) request.Headers.Add(ProviderKeys.AnthropicHeader, VisitorAnthropicKey);
        if (openAi) request.Headers.Add(ProviderKeys.OpenAIHeader, VisitorOpenAiKey);
        return request;
    }

    private static async Task<string> TitleOf(HttpResponseMessage response) =>
        JsonDocument.Parse(await response.Content.ReadAsStringAsync(Ct)).RootElement.GetProperty("title").GetString()!;

    [Theory]
    [InlineData("/api/discover")]
    [InlineData("/api/discover/stream")]
    [InlineData("/api/query")]
    [InlineData("/api/query/stream")]
    [InlineData("/api/compare")]
    [InlineData("/api/naive-rag")]
    [InlineData("/api/single-llm")]
    public async Task WithoutVisitorKeys_EveryPipelineIs401_AndTheServerKeysAreNeverUsed(string path)
    {
        await using var factory = PublicFactory();
        var http = factory.CreateClient();
        object body = path.StartsWith("/api/query") ? new { query = "Why does GraphCast forecast well?", topK = 2 } : Topics;

        var none = await http.SendAsync(Post(path, body, anthropic: false, openAi: false), Ct);
        var onlyAnthropic = await http.SendAsync(Post(path, body, openAi: false), Ct);

        Assert.Equal(HttpStatusCode.Unauthorized, none.StatusCode);
        Assert.Equal(PublicMode.KeysRequiredTitle, await TitleOf(none));
        Assert.Equal(HttpStatusCode.Unauthorized, onlyAnthropic.StatusCode);
        Assert.Contains("OpenAI", await onlyAnthropic.Content.ReadAsStringAsync(Ct));
        Assert.Empty(factory.Llm.Calls);                                  // refused before any model call
    }

    [Fact]
    public async Task WithVisitorKeys_ThePipelinesRun()
    {
        await using var factory = PublicFactory();
        var http = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await http.SendAsync(Post("/api/discover", Topics), Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await http.SendAsync(Post("/api/compare", Topics), Ct)).StatusCode);
        Assert.NotEmpty(factory.Llm.Calls);
    }

    [Theory]
    [InlineData("POST", "/api/papers/arxiv")]
    [InlineData("POST", "/api/papers/ingest")]
    [InlineData("DELETE", "/api/papers/graphcast")]
    [InlineData("GET", "/api/runs")]
    [InlineData("GET", "/api/runs/6f1c2b9e-0000-4000-8000-000000000000")]
    [InlineData("DELETE", "/api/runs/6f1c2b9e-0000-4000-8000-000000000000")]
    [InlineData("POST", "/api/fabrication-probe")]
    [InlineData("POST", "/api/score")]
    [InlineData("GET", "/api/anything-added-later")]
    public async Task EverythingElseUnderApi_IsReadOnly403_EvenWithKeys(string method, string path)
    {
        await using var factory = PublicFactory();
        using var request = new HttpRequestMessage(new HttpMethod(method), path) { Content = JsonContent.Create(new { arxivId = "2212.12794" }) };
        request.Headers.Add(ProviderKeys.AnthropicHeader, VisitorAnthropicKey);
        request.Headers.Add(ProviderKeys.OpenAIHeader, VisitorOpenAiKey);

        var response = await factory.CreateClient().SendAsync(request, Ct);

        Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
        Assert.Equal(PublicMode.ReadOnlyTitle, await TitleOf(response));
        Assert.Empty(factory.Store.Persisted);
        Assert.Empty(factory.Llm.Calls);
    }

    [Fact]
    public async Task TheCorpusListingAndHealth_StayOpen_WithoutKeys()
    {
        await using var factory = PublicFactory();
        var http = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync("/api/papers", Ct)).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await http.GetAsync("/health", Ct)).StatusCode);
    }

    [Fact]
    public async Task AVisitorsRun_IsNotStoredOnTheServer()
    {
        await using var factory = PublicFactory();
        var http = factory.CreateClient();

        Assert.Equal(HttpStatusCode.OK, (await http.SendAsync(Post("/api/discover", Topics), Ct)).StatusCode);
        var stream = await http.SendAsync(Post("/api/discover/stream", Topics), Ct);
        Assert.Contains("event: result", await stream.Content.ReadAsStringAsync(Ct));

        var runs = factory.Services.GetRequiredService<IRunStore>();
        Assert.Empty(await runs.ListAsync(null, 50, Ct));
    }

    [Fact]
    public async Task TheOpenAiPort_IsNotAvailable()
    {
        await using var factory = PublicFactory();

        var response = await factory.CreateClient().SendAsync(
            Post("/api/discover", new { topicA = "weather forecasting", topicB = "protein folding", provider = "openai" }), Ct);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("provider not available", await TitleOf(response));
    }

    [Fact]
    public async Task StartsWithNoServerKeysAtAll()
    {
        await using var factory = PublicFactory(new() { ["Anthropic:ApiKey"] = "", ["OpenAI:ApiKey"] = "" });

        Assert.Equal(HttpStatusCode.OK, (await factory.CreateClient().GetAsync("/api/papers", Ct)).StatusCode);
    }

    [Fact]
    public async Task Cors_LetsTheSiteSendTheKeyHeaders_AndReadTheRefusals()
    {
        await using var factory = PublicFactory();
        var http = factory.CreateClient();

        using var preflight = new HttpRequestMessage(HttpMethod.Options, "/api/discover/stream");
        preflight.Headers.Add("Origin", Origin);
        preflight.Headers.Add("Access-Control-Request-Method", "POST");
        preflight.Headers.Add("Access-Control-Request-Headers", "content-type,x-anthropic-key,x-openai-key");
        var answer = await http.SendAsync(preflight, Ct);
        Assert.True(answer.IsSuccessStatusCode);
        var allowed = string.Join(",", answer.Headers.GetValues("Access-Control-Allow-Headers")).ToLowerInvariant();
        Assert.Contains("x-anthropic-key", allowed);
        Assert.Contains("x-openai-key", allowed);

        using var refused = Post("/api/discover", Topics, anthropic: false, openAi: false);
        refused.Headers.Add("Origin", Origin);
        var response = await http.SendAsync(refused, Ct);
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Equal(Origin, response.Headers.GetValues("Access-Control-Allow-Origin").Single());
    }

    [Fact]
    public async Task AVisitorsKeys_NeverAppearInLogsOrResponses()
    {
        var logs = new CapturingLoggerProvider();
        await using var factory = PublicFactory();
        await using var logged = factory.WithWebHostBuilder(b => b.ConfigureLogging(l =>
        {
            l.AddProvider(logs);
            l.SetMinimumLevel(LogLevel.Trace);
        }));
        var http = logged.CreateClient();
        var bodies = new List<string>();
        async Task Send(HttpRequestMessage r) => bodies.Add(await (await http.SendAsync(r, Ct)).Content.ReadAsStringAsync(Ct));

        await Send(Post("/api/discover", Topics));
        await Send(Post("/api/discover/stream", Topics));
        await Send(Post("/api/compare", Topics));
        // A provider that rejects the key, the way Anthropic.SDK reports it.
        factory.Llm.OnTool("submit_discovery", _ => throw new HttpRequestException(
            "Error at messages (Unauthorized): authentication_error", null, HttpStatusCode.Unauthorized));
        await Send(Post("/api/discover", Topics));
        await Send(Post("/api/discover/stream", Topics));
        await Send(Post("/api/compare", Topics));
        await Send(Post("/api/runs", new { }));

        var everything = string.Join("\n", bodies) + "\n" + logs.Text;
        Assert.DoesNotContain("SENTINEL", everything);
        Assert.Contains("Anthropic rejected the key", string.Join("\n", bodies));
        Assert.Contains("\"provider\":\"anthropic\"", string.Join("\n", bodies));   // the UI names the provider from this
    }

    // ---------- the key that actually goes out to Anthropic ----------

    [Fact]
    public async Task AnthropicClient_SendsTheVisitorsKey_NotThePlaceholderOrTheServerKey()
    {
        var network = new FakeAnthropic();
        using var client = new AnthropicChatClient(NullLogger<AnthropicChatClient>.Instance,
            Options.Create(new AnthropicOptions { ApiKey = "sk-ant-SERVER-OWNER-KEY" }),
            KeysFromHeaders(VisitorAnthropicKey), network);

        var result = await client.CompleteAsync(new LlmRequest("m", "s", "u", 0m), Ct);

        Assert.Equal("ok", result.Text);
        Assert.Equal([VisitorAnthropicKey], network.Seen.Select(s => s.Key));
    }

    [Fact]
    public async Task AnthropicClient_ConcurrentVisitors_EachSendTheirOwnKey()
    {
        var network = new FakeAnthropic(delay: true);
        using var client = new AnthropicChatClient(NullLogger<AnthropicChatClient>.Instance,
            Options.Create(new AnthropicOptions { MaxConcurrentRequests = 8 }), new PerFlowKeys(), network);

        await Task.WhenAll(Enumerable.Range(0, 40).Select(i => Task.Run(async () =>
        {
            PerFlowKeys.Current.Value = $"sk-ant-visitor-{i}";
            await client.CompleteAsync(new LlmRequest("m", "s", $"prompt of visitor-{i}", 0m), Ct);
        }, Ct)));

        Assert.Equal(40, network.Seen.Count);
        Assert.All(network.Seen, s => Assert.Equal($"sk-ant-{s.Visitor}", s.Key));
    }

    [Fact]
    public async Task AnthropicClient_RejectedKey_IsAClear401_AndTheKeyIsNotInTheErrorOrLogs()
    {
        var logs = new CapturingLoggerProvider();
        var network = new FakeAnthropic(rejectKeys: true);
        using var client = new AnthropicChatClient(logs.CreateTypedLogger<AnthropicChatClient>(),
            Options.Create(new AnthropicOptions()), KeysFromHeaders(VisitorAnthropicKey), network);

        var ex = await Assert.ThrowsAnyAsync<Exception>(() => client.CompleteAsync(new LlmRequest("m", "s", "u", 0m), Ct));

        var failure = UpstreamErrors.Classify(ex);
        Assert.NotNull(failure);
        Assert.Equal(StatusCodes.Status401Unauthorized, failure.Status);
        Assert.Equal("Anthropic rejected the key", failure.Title);
        Assert.Single(network.Seen);                                   // a 401 is not retried
        Assert.DoesNotContain("SENTINEL", ex.ToString() + logs.Text + failure.Detail);
    }

    [Fact]
    public async Task AnthropicClient_PublicModeWithoutAKey_FailsBeforeAnyNetworkCall()
    {
        var network = new FakeAnthropic();
        using var client = new AnthropicChatClient(NullLogger<AnthropicChatClient>.Instance,
            Options.Create(new AnthropicOptions { ApiKey = "sk-ant-SERVER-OWNER-KEY" }), KeysFromHeaders(null), network);

        await Assert.ThrowsAsync<ProviderKeyMissingException>(() => client.CompleteAsync(new LlmRequest("m", "s", "u", 0m), Ct));
        Assert.Empty(network.Seen);
    }

    // ---------- ProviderKeys ----------

    [Fact]
    public void ProviderKeys_PublicMode_ReadsOnlyTheRequestHeaders()
    {
        var withHeaders = KeysFromHeaders(VisitorAnthropicKey, VisitorOpenAiKey);
        var without = KeysFromHeaders(null, null);

        Assert.Equal(VisitorAnthropicKey, withHeaders.Anthropic);
        Assert.Equal(VisitorOpenAiKey, withHeaders.OpenAI);
        Assert.Null(without.Anthropic);                               // never the configured key
        Assert.Null(without.OpenAI);
    }

    [Fact]
    public void ProviderKeys_NormalMode_UsesTheConfiguredKeys_AndIgnoresHeaders()
    {
        var keys = Keys(publicMode: false, VisitorAnthropicKey, VisitorOpenAiKey);

        Assert.Equal("sk-ant-SERVER-OWNER-KEY", keys.Anthropic);
        Assert.Equal("sk-SERVER-OWNER-KEY", keys.OpenAI);
    }

    [Theory]
    [InlineData("sk-ant with space")]
    [InlineData("sk-ant-é")]
    [InlineData("")]
    public void ProviderKeys_ImplausibleHeaderValues_CountAsMissing(string value)
    {
        Assert.Null(KeysFromHeaders(value).Anthropic);
        Assert.Null(KeysFromHeaders(new string('k', 513)).Anthropic);
    }

    // ---------- error wording ----------

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized, "authentication_error", 401, "Anthropic rejected the key")]
    [InlineData(HttpStatusCode.BadRequest, "Your credit balance is too low", 402, "Anthropic account has no credit")]
    [InlineData(HttpStatusCode.TooManyRequests, "rate_limit_error", 429, "Anthropic rate limit reached")]
    public void UpstreamErrors_AnthropicFailures_AreActionable(HttpStatusCode status, string message, int expected, string title)
    {
        var failure = UpstreamErrors.Classify(new InvalidOperationException("wrapped", new HttpRequestException(message, null, status)));

        Assert.NotNull(failure);
        Assert.Equal(expected, failure.Status);
        Assert.Equal(title, failure.Title);
        Assert.DoesNotContain(message, failure.Detail);               // never echoes the provider's text
    }

    [Fact]
    public void UpstreamErrors_UnrelatedFailures_StayGeneric() =>
        Assert.Null(UpstreamErrors.Classify(new InvalidOperationException("contract violation")));


    // ---------- helpers ----------

    private static ProviderKeys KeysFromHeaders(string? anthropic, string? openAi = null) =>
        Keys(publicMode: true, anthropic, openAi);

    private static ProviderKeys Keys(bool publicMode, string? anthropicHeader, string? openAiHeader)
    {
        var context = new DefaultHttpContext();
        if (anthropicHeader is not null) context.Request.Headers[ProviderKeys.AnthropicHeader] = anthropicHeader;
        if (openAiHeader is not null) context.Request.Headers[ProviderKeys.OpenAIHeader] = openAiHeader;
        return new ProviderKeys(new FixedContext(context),
            Options.Create(new PublicModeOptions { Enabled = publicMode }),
            Options.Create(new AnthropicOptions { ApiKey = "sk-ant-SERVER-OWNER-KEY" }),
            Options.Create(new OpenAIOptions { ApiKey = "sk-SERVER-OWNER-KEY" }));
    }

    // HttpContextAccessor keeps its context in one process-wide AsyncLocal, so two of them
    // in one test overwrite each other; a plain holder keeps each request separate.
    private sealed class FixedContext(HttpContext context) : IHttpContextAccessor
    {
        public HttpContext? HttpContext { get; set; } = context;
    }

    // Each concurrent "visitor" sets its own key on its own async flow.
    private sealed class PerFlowKeys : IProviderKeys
    {
        public static readonly AsyncLocal<string?> Current = new();
        public bool PublicMode => true;
        public string? Anthropic => Current.Value;
        public string? OpenAI => null;
    }

    // Stands in for api.anthropic.com: records the key each request carried and which
    // visitor's prompt it belonged to.
    private sealed partial class FakeAnthropic(bool delay = false, bool rejectKeys = false) : HttpMessageHandler
    {
        public ConcurrentQueue<(string Key, string Visitor)> Seen { get; } = new();

        [GeneratedRegex(@"visitor-\d+")]
        private static partial Regex VisitorTag();

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var body = request.Content is null ? "" : await request.Content.ReadAsStringAsync(ct);
            var key = request.Headers.TryGetValues("x-api-key", out var values) ? string.Join("|", values) : "";
            Seen.Enqueue((key, VisitorTag().Match(body).Value));
            if (delay) await Task.Delay(Random.Shared.Next(1, 15), ct);

            if (rejectKeys)
                return new HttpResponseMessage(HttpStatusCode.Unauthorized)
                {
                    Content = new StringContent("""{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}""",
                        Encoding.UTF8, "application/json"),
                };
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""
                    {"id":"msg_1","type":"message","role":"assistant","model":"m",
                     "content":[{"type":"text","text":"ok"}],"stop_reason":"end_turn",
                     "usage":{"input_tokens":1,"output_tokens":1}}
                    """, Encoding.UTF8, "application/json"),
            };
        }
    }

    private sealed class CapturingLoggerProvider : ILoggerProvider
    {
        private readonly ConcurrentQueue<string> _lines = new();
        public string Text => string.Join("\n", _lines);
        public ILogger CreateLogger(string categoryName) => new Logger(_lines);
        public ILogger<T> CreateTypedLogger<T>() => new Logger<T>(new Factory(this));
        public void Dispose() { }

        private sealed class Factory(ILoggerProvider provider) : ILoggerFactory
        {
            public ILogger CreateLogger(string categoryName) => provider.CreateLogger(categoryName);
            public void AddProvider(ILoggerProvider p) { }
            public void Dispose() { }
        }

        private sealed class Logger(ConcurrentQueue<string> lines) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull
            {
                lines.Enqueue($"scope: {state}");
                return null;
            }

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
                Func<TState, Exception?, string> formatter) =>
                lines.Enqueue($"{logLevel}: {formatter(state, exception)} {exception}");
        }
    }
}
