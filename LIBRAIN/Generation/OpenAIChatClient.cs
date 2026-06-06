using LIBRAIN.Models;
using Microsoft.Extensions.Options;
using OpenAI.Chat;

namespace LIBRAIN.Generation;

// OpenAI chat generator used by the RQ3 fabrication-probe (cross-family fabrication
// delta). Deliberately thin: a single text completion. The probe parses citations
// from the returned text (free-text) or JSON (structured), so no function-calling
// plumbing is needed. Embeddings already run on OpenAI, so this lets the whole
// fabrication experiment run with no Anthropic dependency.
public sealed class OpenAIChatClient(
    ILogger<OpenAIChatClient> logger,
    IOptions<OpenAIOptions> options)
{
    private readonly ILogger<OpenAIChatClient> _logger = logger;
    private readonly string _apiKey = options.Value.ApiKey;

    public async Task<(string Text, int InputTokens, int OutputTokens)> CompleteAsync(
        string systemPrompt,
        string userPrompt,
        string model,
        float temperature,
        CancellationToken ct = default)
    {
        var client = new ChatClient(model, _apiKey);
        ChatMessage[] messages =
        {
            new SystemChatMessage(systemPrompt),
            new UserChatMessage(userPrompt),
        };
        var opts = new ChatCompletionOptions { Temperature = temperature };

        var result = await client.CompleteChatAsync(messages, opts, ct).ConfigureAwait(false);
        var completion = result.Value;
        var text = completion.Content.Count > 0 ? completion.Content[0].Text : string.Empty;
        var input = completion.Usage?.InputTokenCount ?? 0;
        var output = completion.Usage?.OutputTokenCount ?? 0;

        _logger.LogInformation(
            "OpenAI chat ({Model}): input={InputTokens} output={OutputTokens} tokens",
            model, input, output);

        return (text, input, output);
    }
}
