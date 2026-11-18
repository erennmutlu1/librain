using System.Diagnostics;
using LIBRAIN.Agents;
using LIBRAIN.Embeddings;
using LIBRAIN.Storage;

namespace LIBRAIN.Endpoints;

public sealed record QueryRequest(
    string Query,
    int? TopK);

public sealed record EvaluationSummary(
    float QualityScore,
    float GroundednessScore,
    float RelevanceScore,
    float CompletenessScore,
    string Critique,
    IReadOnlyList<string> UnsupportedClaims,
    IReadOnlyList<string> MissingEvidence);

public sealed record QueryResponse(
    Guid CorrelationId,
    string Hypothesis,
    IReadOnlyList<SynthesisCitation> Citations,
    float? SynthesisConfidence,
    EvaluationSummary Evaluation);

public static class QueryEndpoints
{
    private const int DefaultTopK = 5;
    private const int MinTopK = 1;
    private const int MaxTopK = 20;
    private const int MaxQueryChars = 2000;

    public static void MapQueryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/query", HandleAsync)
            .RequireRateLimiting(Guards.PaidPolicy);
    }

    private static async Task<IResult> HandleAsync(
        QueryRequest req,
        LIBRAIN.Pipelines.QueryPipeline pipeline,
        LIBRAIN.Runs.RunRecorder recorder,
        ILogger<Program> logger,
        CancellationToken ct)
    {
        if (Validate(req, out var topK) is { } invalid) return invalid;

        var sw = Stopwatch.StartNew();
        try
        {
            var response = await pipeline.RunAsync(req.Query, topK, progress: null, ct);
            // Persist even if the client has gone: the run was already paid for.
            await recorder.TryRecordAsync(response.CorrelationId, LIBRAIN.Runs.RunKinds.Query, req.Query.Trim(),
                response.Evaluation.QualityScore, req with { TopK = topK }, response, CancellationToken.None);
            return Results.Ok(response);
        }
        catch (LIBRAIN.Pipelines.NoSourcesException ex)
        {
            return Results.Problem(title: "No relevant sources found", detail: ex.Message,
                statusCode: StatusCodes.Status404NotFound);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex,
                "Query pipeline failed (elapsed={ElapsedMs}ms, exceptionType={ExceptionType})",
                sw.ElapsedMilliseconds, ex.GetType().Name);
            return Results.Problem(
                title: "Upstream API error",
                detail: $"The query pipeline failed: {ex.GetType().Name}",
                statusCode: StatusCodes.Status502BadGateway);
        }
    }

    internal static IResult? Validate(QueryRequest req, out int topK)
    {
        topK = req.TopK ?? DefaultTopK;
        if (string.IsNullOrWhiteSpace(req.Query))
            return Results.Problem(title: "Query is required",
                detail: "The 'query' field must be a non-empty string.", statusCode: StatusCodes.Status400BadRequest);
        if (req.Query.Length > MaxQueryChars)
            return Results.Problem(title: "Query too long",
                detail: $"The 'query' field must be at most {MaxQueryChars} characters.", statusCode: StatusCodes.Status400BadRequest);
        if (topK < MinTopK || topK > MaxTopK)
            return Results.Problem(title: "topK out of range",
                detail: $"The 'topK' field must be between {MinTopK} and {MaxTopK}.", statusCode: StatusCodes.Status400BadRequest);
        return null;
    }
}
