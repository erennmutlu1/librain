using LIBRAIN.Models;
using Microsoft.Extensions.Options;

namespace LIBRAIN.Llm;

// Where the Anthropic and OpenAI keys for a call come from. The one place that decides it,
// so the public deployment's promise ("we never use our own keys, and never keep yours")
// is enforced here rather than at every call site:
//   - normal mode (local use, experiments): the configured keys (user-secrets / env);
//   - public mode (Public:Enabled): ONLY the keys the visitor sent with this request, in
//     X-Anthropic-Key / X-OpenAI-Key. Configured keys are never read, even if someone sets
//     them by mistake, so a request without keys fails instead of spending the owner's credit.
// Keys are read per request and never stored, logged or echoed.
public interface IProviderKeys
{
    bool PublicMode { get; }

    // Null when no usable key is available for the current call.
    string? Anthropic { get; }
    string? OpenAI { get; }
}

public sealed class ProviderKeys(
    IHttpContextAccessor http,
    IOptions<PublicModeOptions> publicMode,
    IOptions<AnthropicOptions> anthropic,
    IOptions<OpenAIOptions> openAi) : IProviderKeys
{
    public const string AnthropicHeader = "X-Anthropic-Key";
    public const string OpenAIHeader = "X-OpenAI-Key";

    // Real keys are ~100-200 characters; the cap only stops absurd header values.
    private const int MaxKeyLength = 512;

    public bool PublicMode => publicMode.Value.Enabled;

    public string? Anthropic => PublicMode ? FromHeader(AnthropicHeader) : Configured(anthropic.Value.ApiKey);

    public string? OpenAI => PublicMode ? FromHeader(OpenAIHeader) : Configured(openAi.Value.ApiKey);

    private string? FromHeader(string name)
    {
        var value = http.HttpContext?.Request.Headers[name].ToString().Trim();
        return IsPlausibleKey(value) ? value : null;
    }

    private static string? Configured(string? key) => string.IsNullOrWhiteSpace(key) ? null : key.Trim();

    // Printable ASCII without spaces: anything else cannot be a provider key, and rejecting
    // it here keeps odd bytes out of the outgoing request headers.
    public static bool IsPlausibleKey(string? value) =>
        !string.IsNullOrEmpty(value) && value.Length <= MaxKeyLength && value.All(c => c > ' ' && c < (char)127);
}

// Thrown when a call needs a provider key that the request did not supply (public mode)
// or that is not configured (normal mode). The message names the provider, never a key.
public sealed class ProviderKeyMissingException(string provider)
    : Exception($"No {provider} API key was supplied for this request.")
{
    public string Provider { get; } = provider;
}
