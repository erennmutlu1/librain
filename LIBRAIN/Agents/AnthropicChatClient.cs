using System.Runtime.CompilerServices;
using Anthropic.SDK;
using Anthropic.SDK.Common;
using Anthropic.SDK.Messaging;
using LIBRAIN.Llm;
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
//
// Implements ILlmClient by building exactly the MessageParameters every agent used to
// build inline (forced tool choice, prompt caching on tools + system, no streaming),
// so moving the agents behind the interface did not change what is sent to the API.
public sealed class AnthropicChatClient : ILlmClient, IDisposable
{
    // One SDK tool object per LlmTool instance, reused across requests exactly as the
    // agents' former static Function fields were.
    private static readonly ConditionalWeakTable<LlmTool, Anthropic.SDK.Common.Tool> SdkTools = new();

    private readonly ILogger<AnthropicChatClient> _logger;
    private readonly AnthropicClient _client;
    private readonly HttpClient _httpClient;
    private readonly SemaphoreSlim _concurrency;
    private readonly bool _hasApiKey;

    public AnthropicChatClient(
        ILogger<AnthropicChatClient> logger,
        IOptions<AnthropicOptions> options)
    {
        _logger = logger;
        _hasApiKey = !string.IsNullOrWhiteSpace(options.Value.ApiKey);
        _concurrency = new SemaphoreSlim(Math.Max(1, options.Value.MaxConcurrentRequests));
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

    public async Task<LlmToolCallResult> CallToolAsync(LlmRequest request, LlmTool tool, CancellationToken ct = default)
    {
        var parameters = BuildParameters(request);
        parameters.Tools = new List<Anthropic.SDK.Common.Tool>
        {
            SdkTools.GetValue(tool, t => new Function(t.Name, t.Description, t.InputSchema)),
        };
        parameters.ToolChoice = new ToolChoice { Type = ToolChoiceType.Tool, Name = tool.Name };

        var response = await SendAsync(parameters, ct).ConfigureAwait(false);

        var toolUse = response.Content.OfType<ToolUseContent>().FirstOrDefault();
        if (toolUse is null)
        {
            _logger.LogError(
                "Forced tool call '{ToolName}' did not fire (stopReason={StopReason})", tool.Name, response.StopReason);
            throw new InvalidOperationException(
                $"Claude did not emit a tool_use block for '{tool.Name}' (stopReason={response.StopReason})");
        }

        var input = toolUse.Input ?? throw new InvalidOperationException(
            $"Tool use block for '{tool.Name}' had null input.");
        return new LlmToolCallResult(input, ToUsage(response), response.StopReason);
    }

    public async Task<LlmTextResult> CompleteAsync(LlmRequest request, CancellationToken ct = default)
    {
        var response = await SendAsync(BuildParameters(request), ct).ConfigureAwait(false);
        var text = string.Join("", response.Content.OfType<TextContent>().Select(t => t.Text));
        return new LlmTextResult(text, ToUsage(response), response.StopReason);
    }

    private static MessageParameters BuildParameters(LlmRequest request) => new()
    {
        Messages = new List<Message> { new Message(RoleType.User, request.UserPrompt) },
        System = new List<SystemMessage> { new SystemMessage(request.SystemPrompt) },
        MaxTokens = request.MaxTokens,
        Model = request.Model,
        Temperature = request.Temperature,
        Stream = false,
        PromptCaching = PromptCacheType.AutomaticToolsAndSystem,
    };

    private static LlmUsage ToUsage(MessageResponse response) => new(
        response.Usage?.InputTokens ?? 0,
        response.Usage?.OutputTokens ?? 0,
        response.Usage?.CacheReadInputTokens ?? 0,
        response.Usage?.CacheCreationInputTokens ?? 0);

    private async Task<MessageResponse> SendAsync(
        MessageParameters parameters,
        CancellationToken ct)
    {
        if (!_hasApiKey)
        {
            // Not validated at startup: the OpenAI-only experiments run without it.
            throw new InvalidOperationException(
                "Anthropic:ApiKey is not configured. Set it with: dotnet user-secrets set \"Anthropic:ApiKey\" \"sk-ant-...\" --project LIBRAIN");
        }

        MessageResponse response;
        await _concurrency.WaitAsync(ct).ConfigureAwait(false);
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
        finally
        {
            _concurrency.Release();
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
        _concurrency.Dispose();
        GC.SuppressFinalize(this);
    }
}
