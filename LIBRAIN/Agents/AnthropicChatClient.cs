using Anthropic.SDK;
using Anthropic.SDK.Messaging;
using LIBRAIN.Models;
using Microsoft.Extensions.Options;

namespace LIBRAIN.Agents;

// Thin wrapper over Anthropic.SDK 5.10's AnthropicClient. Registered as a singleton
// in Program.cs: the underlying AnthropicClient owns an internal HttpClient, so a
// per-request lifetime would spin up a fresh HttpClient per scope and risk socket
// exhaustion (the classic HttpClient antipattern). The DI container disposes this
// singleton — and the inner HttpClient — on app shutdown via IDisposable.
public sealed class AnthropicChatClient : IDisposable
{
    private readonly ILogger<AnthropicChatClient> _logger;
    private readonly AnthropicClient _client;

    public AnthropicChatClient(
        ILogger<AnthropicChatClient> logger,
        IOptions<AnthropicOptions> options)
    {
        _logger = logger;
        _client = new AnthropicClient(options.Value.ApiKey);
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
        GC.SuppressFinalize(this);
    }
}
