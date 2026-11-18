using System.Net;
using LIBRAIN.Agents;
using Microsoft.Extensions.Logging.Abstractions;

namespace LIBRAIN.Tests.Agents;

// Offline check of the HTTP retry policy wrapped around the Anthropic client:
// no network, a fake inner handler plays the API.
public sealed class AnthropicRetryTests
{
    private sealed class ScriptedHandler(params HttpStatusCode[] script) : HttpMessageHandler
    {
        public int Calls { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            var status = script[Math.Min(Calls, script.Length - 1)];
            Calls++;
            return Task.FromResult(new HttpResponseMessage(status));
        }
    }

    private static HttpClient ClientOver(HttpMessageHandler inner) =>
        new(AnthropicChatClient.CreateRetryingHandler(NullLogger.Instance, inner, TimeSpan.Zero));

    [Fact]
    public async Task Overloaded_ThenOk_IsRetried()
    {
        var api = new ScriptedHandler((HttpStatusCode)529, HttpStatusCode.TooManyRequests, HttpStatusCode.OK);
        using var http = ClientOver(api);

        var res = await http.PostAsync("https://api.example/v1/messages", new StringContent("{}"), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        Assert.Equal(3, api.Calls);
    }

    [Fact]
    public async Task PersistentServerError_GivesUpAfterMaxRetries()
    {
        var api = new ScriptedHandler(HttpStatusCode.ServiceUnavailable);
        using var http = ClientOver(api);

        var res = await http.PostAsync("https://api.example/v1/messages", new StringContent("{}"), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, res.StatusCode);
        Assert.Equal(1 + AnthropicChatClient.MaxRetryAttempts, api.Calls);
    }

    [Fact]
    public async Task BadRequest_IsNotRetried()
    {
        var api = new ScriptedHandler(HttpStatusCode.BadRequest);
        using var http = ClientOver(api);

        var res = await http.PostAsync("https://api.example/v1/messages", new StringContent("{}"), TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal(1, api.Calls);
    }
}
