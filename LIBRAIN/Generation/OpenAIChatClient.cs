using LIBRAIN.Embeddings;
using LIBRAIN.Llm;
using OpenAI.Chat;

namespace LIBRAIN.Generation;

// OpenAI chat generator used by the RQ3 fabrication-probe (cross-family fabrication
// delta). Deliberately thin: a single text completion. The probe parses citations
// from the returned text (free-text) or JSON (structured), so no function-calling
// plumbing is needed. Embeddings already run on OpenAI, so this lets the whole
// fabrication experiment run with no Anthropic dependency.
// Unreachable in public mode (the OpenAI port and the probe are switched off there), but it
// still takes its key from IProviderKeys so the configured key is never read in that mode.
public sealed class OpenAIChatClient(
    ILogger<OpenAIChatClient> logger,
    IProviderKeys keys)
{
    private readonly ILogger<OpenAIChatClient> _logger = logger;

    public async Task<(string Text, int InputTokens, int OutputTokens)> CompleteAsync(
        string systemPrompt,
        string userPrompt,
        string model,
        float temperature,
        CancellationToken ct = default)
    {
        var client = new ChatClient(model, keys.OpenAI ?? throw OpenAIEmbeddingClient.MissingKey(keys));
        ChatMessage[] messages =
        {
            new SystemChatMessage(systemPrompt),
            new UserChatMessage(userPrompt),
        };
        var opts = new ChatCompletionOptions { Temperature = temperature };

        var result = await client.CompleteChatAsync(messages, opts, ct).ConfigureAwait(false);
        var completion = result.Value;
        if (completion.FinishReason == ChatFinishReason.Length)
        {
            _logger.LogError("OpenAI chat ({Model}) truncated at the output token limit", model);
            throw new InvalidOperationException(
                $"OpenAI output ({model}) was truncated at the token limit; refusing to parse a partial response.");
        }
        var text = completion.Content.Count > 0 ? completion.Content[0].Text : string.Empty;
        var input = completion.Usage?.InputTokenCount ?? 0;
        var output = completion.Usage?.OutputTokenCount ?? 0;

        _logger.LogInformation(
            "OpenAI chat ({Model}): input={InputTokens} output={OutputTokens} tokens",
            model, input, output);

        return (text, input, output);
    }
}
