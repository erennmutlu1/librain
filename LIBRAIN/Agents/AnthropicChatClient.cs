using Anthropic.SDK;
using Anthropic.SDK.Messaging;
using LIBRAIN.Models;
using Microsoft.Extensions.Options;

namespace LIBRAIN.Agents;

// Thin wrapper over Anthropic.SDK 5.10's AnthropicClient. Registered as a singleton
// in Program.cs: the underlying AnthropicClient owns an internal HttpClient, so a
// per-request lifetime would spin up a fresh HttpClient per scope and risk socket
// exhaustion (the classic HttpClient antipattern). The DI container disposes this
// singleton (and the inner HttpClient) on app shutdown via IDisposable.
public sealed class AnthropicChatClient : IDisposable
{
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
        _httpClient = new HttpClient { Timeout = TimeSpan.FromMinutes(5) };
        _client = new AnthropicClient(new APIAuthentication(options.Value.ApiKey), _httpClient);
    }

    public async Task<MessageResponse> ChatAsync(
        MessageParameters parameters,
        CancellationToken ct = default)
    {
        try
        {
            return await _client.Messages.GetClaudeMessageAsync(parameters, ct).ConfigureAwait(false);
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
    }

    public void Dispose()
    {
        _client.Dispose();
        _httpClient.Dispose();
        GC.SuppressFinalize(this);
    }
}
