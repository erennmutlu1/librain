using System.Diagnostics;
using LIBRAIN.Agents;

namespace LIBRAIN.Endpoints;

public sealed record SingleLlmRequest(
    string TopicA,
    string? TopicB);

public sealed record SingleLlmResponse(
    Guid CorrelationId,
    string Hypothesis,
    DiscoveryEvaluation Evaluation,
    long TotalElapsedMs,
    int InputTokens,
    int OutputTokens);

public sealed record NaiveRagRequest(
    string TopicA,
    string? TopicB,
    int? TopK);

public sealed record NaiveRagResponse(
    Guid CorrelationId,
    string Hypothesis,
    int RetrievedChunkCount,
    IReadOnlyList<ClaimedCitation> ClaimedCitations,
    int FabricatedCitationCount,
    DiscoveryEvaluation Evaluation,
    long TotalElapsedMs,
    int InputTokens,
    int OutputTokens);

public static class BaselineEndpoints
{
    private const int DefaultTopK = 5;
    private const int MinTopK = 1;
    private const int MaxTopK = 20;

    public static void MapBaselineEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/single-llm", HandleSingleLlmAsync);
        app.MapPost("/api/naive-rag", HandleNaiveRagAsync);
    }

    private static async Task<IResult> HandleSingleLlmAsync(
        SingleLlmRequest req,
        SingleLlmAgent agent,
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

        if (req.TopicB is not null &&
            !string.IsNullOrWhiteSpace(req.TopicB) &&
            string.Equals(req.TopicA.Trim(), req.TopicB.Trim(), StringComparison.Ordinal))
        {
            return Results.Problem(
                title: "topicA and topicB must differ",
                detail: "If topicB is supplied it must differ from topicA after trimming.",
                statusCode: StatusCodes.Status400BadRequest);
        }

        var sw = Stopwatch.StartNew();
        try
        {
            var result = await agent.RunAsync(req.TopicA, req.TopicB, ct);
            logger.LogInformation(
                "Single-LLM endpoint complete: quality={Quality:F4} in {ElapsedMs}ms (correlationId={CorrelationId})",
                result.Evaluation.QualityScore, sw.ElapsedMilliseconds, result.CorrelationId);

            return Results.Ok(new SingleLlmResponse(
                CorrelationId: result.CorrelationId,
                Hypothesis: result.Hypothesis,
                Evaluation: result.Evaluation,
                TotalElapsedMs: result.TotalElapsedMs,
                InputTokens: result.InputTokens,
                OutputTokens: result.OutputTokens));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex,
                "Single-LLM pipeline failed (elapsed={ElapsedMs}ms, exceptionType={ExceptionType})",
                sw.ElapsedMilliseconds, ex.GetType().Name);
            return Results.Problem(
                title: "Single-LLM baseline failed",
                detail: $"The single-LLM baseline failed: {ex.GetType().Name}",
                statusCode: StatusCodes.Status502BadGateway);
        }
    }

    private static async Task<IResult> HandleNaiveRagAsync(
        NaiveRagRequest req,
        NaiveRagAgent agent,
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

        if (req.TopicB is not null &&
            !string.IsNullOrWhiteSpace(req.TopicB) &&
            string.Equals(req.TopicA.Trim(), req.TopicB.Trim(), StringComparison.Ordinal))
        {
            return Results.Problem(
                title: "topicA and topicB must differ",
                detail: "If topicB is supplied it must differ from topicA after trimming.",
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

        var sw = Stopwatch.StartNew();
        try
        {
            var result = await agent.RunAsync(req.TopicA, req.TopicB, topK, ct);
            logger.LogInformation(
                "Naive-RAG endpoint complete: quality={Quality:F4} fabricated={FabricatedCount} claimed={ClaimedCount} in {ElapsedMs}ms (correlationId={CorrelationId})",
                result.Evaluation.QualityScore, result.FabricatedCitationCount, result.ClaimedCitations.Count,
                sw.ElapsedMilliseconds, result.CorrelationId);

            return Results.Ok(new NaiveRagResponse(
                CorrelationId: result.CorrelationId,
                Hypothesis: result.Hypothesis,
                RetrievedChunkCount: result.RetrievedChunkCount,
                ClaimedCitations: result.ClaimedCitations,
                FabricatedCitationCount: result.FabricatedCitationCount,
                Evaluation: result.Evaluation,
                TotalElapsedMs: result.TotalElapsedMs,
                InputTokens: result.InputTokens,
                OutputTokens: result.OutputTokens));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex,
                "Naive-RAG pipeline failed (elapsed={ElapsedMs}ms, exceptionType={ExceptionType})",
                sw.ElapsedMilliseconds, ex.GetType().Name);
            return Results.Problem(
                title: "Naive-RAG baseline failed",
                detail: $"The naive-RAG baseline failed: {ex.GetType().Name}",
                statusCode: StatusCodes.Status502BadGateway);
        }
    }
}
