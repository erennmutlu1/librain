using System.Diagnostics;
using LIBRAIN.Agents;

namespace LIBRAIN.Endpoints;

public sealed record DiscoverRequest(
    string TopicA,
    string? TopicB,
    int? TopK,
    float? NoveltyTarget);

public sealed record SupportingEvidence(
    string PaperId,
    int ChunkIndex,
    string? Section,
    int? PageNumber,
    string SupportType);

public sealed record DiscoveryEvaluation(
    float NoveltyScore,
    float PlausibilityScore,
    float StructuralCoherenceScore,
    float QualityScore);

public sealed record DiscoverResponse(
    Guid CorrelationId,
    string Hypothesis,
    IReadOnlyList<SupportingEvidence> SupportingEvidence,
    string NovelClaim,
    string Reasoning,
    DiscoveryEvaluation Evaluation);

public static class DiscoveryEndpoints
{
    private const int DefaultTopK = 5;
    private const int MinTopK = 1;
    private const int MaxTopK = 20;
    private const float DefaultNoveltyTarget = 0.7f;
    private const float MinNoveltyTarget = 0.0f;
    private const float MaxNoveltyTarget = 1.0f;

    public static void MapDiscoveryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/discover", HandleAsync);
    }

    private static async Task<IResult> HandleAsync(
        DiscoverRequest req,
        DiscoveryAgent agent,
        ILogger<Program> logger,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.TopicA))
        {
            return Results.Problem(
                title: "topicA is required",
                detail: "The 'topicA' field must be a non-empty string.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var topK = req.TopK ?? DefaultTopK;
        if (topK < MinTopK || topK > MaxTopK)
        {
            return Results.Problem(
                title: "topK out of range",
                detail: $"The 'topK' field must be between {MinTopK} and {MaxTopK}.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var noveltyTarget = req.NoveltyTarget ?? DefaultNoveltyTarget;
        if (noveltyTarget < MinNoveltyTarget || noveltyTarget > MaxNoveltyTarget)
        {
            return Results.Problem(
                title: "noveltyTarget out of range",
                detail: $"The 'noveltyTarget' field must be between {MinNoveltyTarget} and {MaxNoveltyTarget}.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var sw = Stopwatch.StartNew();
        try
        {
            var normalized = req with { TopK = topK, NoveltyTarget = noveltyTarget };
            var response = await agent.DiscoverAsync(normalized, ct);

            using var scope = logger.BeginScope(new Dictionary<string, object>
            {
                ["correlationId"] = response.CorrelationId,
            });
            logger.LogInformation(
                "Discovery handled (topicA='{TopicA}', topicB='{TopicB}', topK={TopK}, noveltyTarget={NoveltyTarget:F2}) in {ElapsedMs}ms",
                req.TopicA,
                req.TopicB ?? "(none)",
                topK,
                noveltyTarget,
                sw.ElapsedMilliseconds);

            return Results.Ok(response);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex,
                "Discovery pipeline failed (elapsed={ElapsedMs}ms, exceptionType={ExceptionType})",
                sw.ElapsedMilliseconds,
                ex.GetType().Name);
            return Results.Problem(
                title: "Upstream API error",
                detail: $"The discovery pipeline failed: {ex.GetType().Name}",
                statusCode: StatusCodes.Status502BadGateway);
        }
    }
}
