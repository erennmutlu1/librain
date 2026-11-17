using Anthropic.SDK;
using Anthropic.SDK.Messaging;
using LIBRAIN.Models;
using Microsoft.Extensions.Http.Resilience;
using Microsoft.Extensions.Options;
using Polly;

namespace LIBRAIN.Agents;

// Thin wrapper over Anthropic.SDK 5.10's AnthropicClient. Registered as a singleton
// in Program.cs: the underlying AnthropicClient owns an internal HttpClient, so a
// per-request lifetime would spin up a fresh HttpClient per scope and risk socket
// exhaustion (the classic HttpClient antipattern). The DI container disposes this
// singleton (and the inner HttpClient) on app shutdown via IDisposable.
public sealed class AnthropicChatClient : IDisposable
{
    // Output ceiling for every agent call. Billing is per generated token, so a higher
    // ceiling costs nothing unless a reply would otherwise have been truncated. 1024
    // was tight for the Discovery schema (hypothesis + evidence + per-sentence basis).
    public const int DefaultMaxTokens = 4096;

    private readonly ILogger<AnthropicChatClient> _logger;
    private readonly AnthropicClient _client;
    private readonly HttpClient _httpClient;

    public AnthropicChatClient(
        ILogger<AnthropicChatClient> logger,
        IOptions<AnthropicOptions> options)
    {
        _logger = logger;
        // Anthropic.SDK 5.10's default HttpClient timeout is 100s, which Sonnet 4.6
        // can exceed on Discovery requests now that the tool schema includes
        // extrapolation_basis (longer structured output, longer wall-clock).
        // Pair-08 hit this during the first Phase B run. 5 min is well above any
        // observed synthesis latency while still bounded enough to surface real
        // hangs.
        //
        // Retries: a single 429 / 529 (overloaded) / 5xx / connection error used to
        // fail a whole multi-call Discovery run. Retry at the HTTP layer so it works
        // regardless of the SDK version: up to 3 retries, exponential backoff with
        // jitter, honouring the Retry-After header. Failed requests are not billed.
        // The 5-minute HttpClient timeout covers the whole call including retries,
        // and a timeout is never retried (the first attempt may still be running
        // server-side, and retrying it could be billed twice).
        var handler = CreateRetryingHandler(_logger, new SocketsHttpHandler());
        _httpClient = new HttpClient(handler) { Timeout = TimeSpan.FromMinutes(5) };
        _client = new AnthropicClient(new APIAuthentication(options.Value.ApiKey), _httpClient);
    }

    public const int MaxRetryAttempts = 3;

    // Exposed so the retry policy can be tested offline against a fake inner handler.
    public static DelegatingHandler CreateRetryingHandler(
        ILogger logger,
        HttpMessageHandler inner,
        TimeSpan? baseDelay = null)
    {
        var pipeline = new ResiliencePipelineBuilder<HttpResponseMessage>()
            .AddRetry(new HttpRetryStrategyOptions
            {
                MaxRetryAttempts = MaxRetryAttempts,
                Delay = baseDelay ?? TimeSpan.FromSeconds(2),
                BackoffType = DelayBackoffType.Exponential,
                UseJitter = baseDelay is null,
                ShouldRetryAfterHeader = true,
                OnRetry = args =>
                {
                    logger.LogWarning(
                        "Anthropic call failed (status={StatusCode}, exception={ExceptionType}); retry {Attempt} of {MaxAttempts} in {DelayMs}ms",
                        (int?)args.Outcome.Result?.StatusCode,
                        args.Outcome.Exception?.GetType().Name,
                        args.AttemptNumber + 1,
                        MaxRetryAttempts,
                        (int)args.RetryDelay.TotalMilliseconds);
                    return default;
                },
            })
            .Build();
        return new ResilienceHandler(pipeline) { InnerHandler = inner };
    }

    public async Task<MessageResponse> ChatAsync(
        MessageParameters parameters,
        CancellationToken ct = default)
    {
        MessageResponse response;
        try
        {
            response = await _client.Messages.GetClaudeMessageAsync(parameters, ct).ConfigureAwait(false);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogError(
                ex,
                "Anthropic API call failed (model={Model}, exceptionType={ExceptionType})",
                parameters.Model,
                ex.GetType().Name);
            throw;
        }

        // A reply cut off at max_tokens is partial: a truncated tool_use input used to
        // surface downstream as a misleading "contract violation" or a silently short
        // hypothesis. Fail with the real cause instead.
        if (string.Equals(response.StopReason, "max_tokens", StringComparison.Ordinal))
        {
            _logger.LogError(
                "Anthropic response truncated at max_tokens={MaxTokens} (model={Model}, output={OutputTokens} tokens)",
                parameters.MaxTokens, parameters.Model, response.Usage?.OutputTokens);
            throw new InvalidOperationException(
                $"Claude output was truncated at max_tokens={parameters.MaxTokens}; refusing to parse a partial response.");
        }

        return response;
    }

    public void Dispose()
    {
        _client.Dispose();
        _httpClient.Dispose();
        GC.SuppressFinalize(this);
    }
}
