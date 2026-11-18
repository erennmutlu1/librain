using System.ClientModel;
using System.Net;
using LIBRAIN.Llm;

namespace LIBRAIN.Endpoints;

// Turns provider failures a caller can act on (a rejected key, no credit left, a rate
// limit, a missing key) into a clear problem instead of a generic 502. Only fixed wording
// is returned: the provider's response body and the exception message are never echoed,
// so nothing from the request, keys included, can travel back in an error.
public static class UpstreamErrors
{
    // Provider: "anthropic" or "openai" when that provider refused the call (the UI names it).
    public sealed record Failure(int Status, string Title, string Detail, string? Provider = null);

    public static Failure? Classify(Exception exception)
    {
        for (var ex = exception; ex is not null; ex = ex.InnerException)
        {
            switch (ex)
            {
                case ProviderKeyMissingException missing:
                    return new(StatusCodes.Status401Unauthorized, PublicMode.KeysRequiredTitle,
                        $"No {missing.Provider} API key was supplied for this request.");

                // OpenAI .NET SDK (embeddings, and the OpenAI port in local use).
                case ClientResultException openAi:
                    return FromStatus("OpenAI", openAi.Status, openAi.Message);

                // Anthropic.SDK reports a rejected key (401) as AuthenticationException with the
                // API's error JSON in the message. TLS failures use the same type, so only the
                // provider's error type counts.
                case System.Security.Authentication.AuthenticationException auth
                    when FromMessage("Anthropic", auth.Message) is { } rejected:
                    return rejected;

                // Every other Anthropic.SDK HTTP failure (400 no credit, 403, 429 via its
                // RateLimitsExceeded subclass, 5xx) is an HttpRequestException with the status.
                case HttpRequestException anthropic when anthropic.StatusCode is { } status:
                    return FromStatus("Anthropic", (int)status, anthropic.Message);

                case HttpRequestException anthropic:
                    return FromMessage("Anthropic", anthropic.Message);
            }
        }
        return null;
    }

    // The message is only inspected for the provider's error type, never returned.
    private static Failure? FromStatus(string provider, int status, string message) => status switch
    {
        (int)HttpStatusCode.Unauthorized => Rejected(provider),
        (int)HttpStatusCode.Forbidden => new(StatusCodes.Status403Forbidden, $"{provider} refused the request",
            $"{provider} says this key is not allowed to make this request. Check the key's permissions in your {provider} account.",
            Id(provider)),
        (int)HttpStatusCode.TooManyRequests when message.Contains("insufficient_quota", StringComparison.OrdinalIgnoreCase)
            => NoCredit(provider),
        (int)HttpStatusCode.TooManyRequests => new(StatusCodes.Status429TooManyRequests, $"{provider} rate limit reached",
            $"Your {provider} account hit its rate limit. Wait a minute and try again.", Id(provider)),
        (int)HttpStatusCode.BadRequest when message.Contains("credit balance", StringComparison.OrdinalIgnoreCase)
            => NoCredit(provider),
        _ => FromMessage(provider, message),
    };

    private static Failure? FromMessage(string provider, string message)
    {
        if (message.Contains("authentication_error", StringComparison.OrdinalIgnoreCase)
            || message.Contains("invalid x-api-key", StringComparison.OrdinalIgnoreCase)
            || message.Contains("Unauthorized", StringComparison.Ordinal))
            return Rejected(provider);
        if (message.Contains("credit balance", StringComparison.OrdinalIgnoreCase)
            || message.Contains("insufficient_quota", StringComparison.OrdinalIgnoreCase))
            return NoCredit(provider);
        if (message.Contains("rate_limit_error", StringComparison.OrdinalIgnoreCase)
            || message.Contains("TooManyRequests", StringComparison.Ordinal))
            return new(StatusCodes.Status429TooManyRequests, $"{provider} rate limit reached",
                $"Your {provider} account hit its rate limit. Wait a minute and try again.", Id(provider));
        return null;
    }

    private static Failure Rejected(string provider) => new(StatusCodes.Status401Unauthorized,
        $"{provider} rejected the key", $"{provider} did not accept the API key. Check that it is complete and still active.",
        Id(provider));

    private static Failure NoCredit(string provider) => new(StatusCodes.Status402PaymentRequired,
        $"{provider} account has no credit", $"Your {provider} account has no credit left for this request. Add credit or use another key.",
        Id(provider));

    private static string Id(string provider) => provider.ToLowerInvariant();

    // A problem result for a pipeline failure: the classified failure when there is one,
    // otherwise the endpoint's generic 502.
    public static IResult ToProblem(Exception ex, string fallbackTitle, string fallbackDetail, Guid? correlationId = null)
    {
        var failure = Classify(ex);
        var extensions = new Dictionary<string, object?>();
        if (correlationId is not null) extensions["correlationId"] = correlationId;
        if (failure is null)
            return Results.Problem(title: fallbackTitle, detail: fallbackDetail, statusCode: StatusCodes.Status502BadGateway, extensions: extensions);
        return ToProblem(failure, extensions);
    }

    public static IResult ToProblem(Failure failure, Dictionary<string, object?>? extensions = null)
    {
        extensions ??= new();
        if (failure.Provider is not null) extensions["provider"] = failure.Provider;
        return Results.Problem(title: failure.Title, detail: failure.Detail, statusCode: failure.Status, extensions: extensions);
    }
}
