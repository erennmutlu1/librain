using LIBRAIN.Llm;

namespace LIBRAIN.Endpoints;

// The rules of the public deployment (Public:Enabled), applied before any endpoint runs.
// Deny by default: under /api only the corpus listing and the pipelines a visitor can run
// with their own keys are reachable, so an endpoint added later stays private until it
// is listed here on purpose.
public static class PublicMode
{
    public const string ReadOnlyTitle = "read-only public deployment";
    public const string KeysRequiredTitle = "provider keys required";

    // The pipelines a visitor may run, each with their own Anthropic and OpenAI keys
    // (StartsWithSegments also covers the /stream variants).
    internal static readonly string[] VisitorPipelines =
        ["/api/discover", "/api/query", "/api/compare", "/api/naive-rag", "/api/single-llm"];

    public static IApplicationBuilder UsePublicMode(this IApplicationBuilder app) =>
        app.Use(async (context, next) =>
        {
            var keys = context.RequestServices.GetRequiredService<IProviderKeys>();
            var request = context.Request;
            if (!keys.PublicMode || HttpMethods.IsOptions(request.Method) || !request.Path.StartsWithSegments("/api"))
            {
                await next(context);
                return;
            }

            if (HttpMethods.IsGet(request.Method) && request.Path.Equals("/api/papers", StringComparison.OrdinalIgnoreCase))
            {
                await next(context);
                return;
            }

            if (!IsVisitorPipeline(request.Method, request.Path))
            {
                await Results.Problem(title: ReadOnlyTitle,
                        detail: "This public deployment only reads its 55-paper corpus. Adding or deleting papers, "
                            + "server-side run history and the research endpoints are switched off here; run LIBRAIN "
                            + "locally for those (see the README).",
                        statusCode: StatusCodes.Status403Forbidden)
                    .ExecuteAsync(context);
                return;
            }

            var missing = new List<string>(2);
            if (keys.Anthropic is null) missing.Add("Anthropic");
            if (keys.OpenAI is null) missing.Add("OpenAI");
            if (missing.Count > 0)
            {
                await Results.Problem(title: KeysRequiredTitle,
                        detail: $"Add your own {string.Join(" and ", missing)} API {(missing.Count > 1 ? "keys" : "key")} "
                            + $"in Settings. They are sent as {ProviderKeys.AnthropicHeader} and {ProviderKeys.OpenAIHeader} "
                            + "with each request, used for that request only and never stored.",
                        statusCode: StatusCodes.Status401Unauthorized)
                    .ExecuteAsync(context);
                return;
            }

            await next(context);
        });

    internal static bool IsVisitorPipeline(string method, PathString path) =>
        HttpMethods.IsPost(method) && VisitorPipelines.Any(p => path.StartsWithSegments(p, StringComparison.OrdinalIgnoreCase));
}
