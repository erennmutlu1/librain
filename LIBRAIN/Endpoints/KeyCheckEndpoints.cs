using System.Net;
using System.Net.Http.Headers;
using System.Text.Json.Serialization;
using LIBRAIN.Llm;

namespace LIBRAIN.Endpoints;

// POST /api/keys/check: tells a visitor whether the provider keys they entered are
// accepted, before they spend anything on a run. Each key is checked by listing the
// provider's models, which is free and uses no tokens. It cannot see the credit balance:
// an accepted key on an empty account still fails on the first run (402 from the pipelines).
//
// The keys come from IProviderKeys like every other call (the visitor's headers in public
// mode), are sent to their own provider only, and are never logged or echoed. Provider
// error bodies are not passed on either: OpenAI's quotes part of the key.
public static class KeyCheckEndpoints
{
    public const string Path = "/api/keys/check";
    public const string ClientName = "provider-key-check";

    internal static readonly Uri AnthropicModels = new("https://api.anthropic.com/v1/models?limit=1");
    internal static readonly Uri OpenAIModels = new("https://api.openai.com/v1/models");

    public static class Status
    {
        public const string Valid = "valid";
        public const string Invalid = "invalid";
        public const string RateLimited = "rate_limited";
        public const string Unreachable = "unreachable";
        public const string NotProvided = "not_provided";
    }

    public sealed record ProviderCheck(string Status, string? Detail = null);

    public sealed record KeyCheckResponse(
        [property: JsonPropertyName("anthropic")] ProviderCheck Anthropic,
        [property: JsonPropertyName("openai")] ProviderCheck OpenAI);

    public static IServiceCollection AddKeyCheck(this IServiceCollection services)
    {
        services.AddHttpClient(ClientName, http => http.Timeout = TimeSpan.FromSeconds(10));
        return services;
    }

    public static IEndpointRouteBuilder MapKeyCheckEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost(Path, CheckAsync)
            .RequireRateLimiting(Guards.KeyCheckPolicy)
            .WithName("CheckProviderKeys")
            .WithSummary("Checks whether the supplied Anthropic and OpenAI keys are accepted (free; not the credit balance).");
        return app;
    }

    internal static async Task<IResult> CheckAsync(IProviderKeys keys, IHttpClientFactory httpFactory, ILoggerFactory loggers, CancellationToken ct)
    {
        var anthropicKey = keys.Anthropic;
        var openAiKey = keys.OpenAI;
        if (anthropicKey is null && openAiKey is null)
        {
            return Results.Problem(title: "no keys to check",
                detail: $"Send an Anthropic key in {ProviderKeys.AnthropicHeader}, an OpenAI key in {ProviderKeys.OpenAIHeader}, or both.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var http = httpFactory.CreateClient(ClientName);
        var log = loggers.CreateLogger(typeof(KeyCheckEndpoints));

        var anthropic = anthropicKey is null
            ? Task.FromResult(new ProviderCheck(Status.NotProvided))
            : ProbeAsync(http, log, "Anthropic", () =>
            {
                var request = new HttpRequestMessage(HttpMethod.Get, AnthropicModels);
                request.Headers.Add("x-api-key", anthropicKey);
                request.Headers.Add("anthropic-version", "2023-06-01");
                return request;
            }, ct);

        var openAi = openAiKey is null
            ? Task.FromResult(new ProviderCheck(Status.NotProvided))
            : ProbeAsync(http, log, "OpenAI", () =>
            {
                var request = new HttpRequestMessage(HttpMethod.Get, OpenAIModels);
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", openAiKey);
                return request;
            }, ct);

        return Results.Ok(new KeyCheckResponse(await anthropic, await openAi));
    }

    private static async Task<ProviderCheck> ProbeAsync(HttpClient http, ILogger log, string provider, Func<HttpRequestMessage> build, CancellationToken ct)
    {
        try
        {
            using var request = build();
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            return Classify(response.StatusCode);
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            return new ProviderCheck(Status.Unreachable, $"{provider} did not answer within 10 seconds.");
        }
        catch (HttpRequestException ex)
        {
            // The message names the host, never the key.
            log.LogWarning("Key check could not reach {Provider}: {Error}", provider, ex.Message);
            return new ProviderCheck(Status.Unreachable, $"{provider} could not be reached.");
        }
    }

    internal static ProviderCheck Classify(HttpStatusCode status) => status switch
    {
        HttpStatusCode.OK => new(Status.Valid),
        HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden => new(Status.Invalid),
        HttpStatusCode.TooManyRequests => new(Status.RateLimited),
        _ => new(Status.Unreachable, $"The provider answered HTTP {(int)status}."),
    };
}
