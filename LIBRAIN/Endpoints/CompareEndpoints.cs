using System.Diagnostics;
using LIBRAIN.Agents;
using LIBRAIN.Generation;
using LIBRAIN.Runs;

namespace LIBRAIN.Endpoints;

public sealed record CompareRequest(string TopicA, string? TopicB, int? TopK);

// Result of one system; exactly one of Result / Error is set.
public sealed record CompareOutcome<T>(T? Result, string? Error) where T : class;

public sealed record CompareResponse(
    Guid CorrelationId,
    string TopicA,
    string? TopicB,
    int TopK,
    CompareOutcome<DiscoverResponse> Librain,
    CompareOutcome<NaiveRagResponse> NaiveRag,
    CompareOutcome<SingleLlmResponse> SingleLlm,
    long TotalElapsedMs);

// The paper's three-system comparison on one topic pair, run concurrently: LIBRAIN
// (citation contract + novelClaim fence), Naive-RAG (same retrieval, no contract) and
// Single-LLM (no retrieval). Each system succeeds or fails on its own, so one failure
// does not hide the other two results.
public static class CompareEndpoints
{
    public static void MapCompareEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/compare", HandleAsync)
            .RequireRateLimiting(Guards.PaidPolicy);
    }

    private static async Task<IResult> HandleAsync(
        CompareRequest req,
        DiscoveryAgent librain,
        NaiveRagAgent naiveRag,
        SingleLlmAgent singleLlm,
        OpenAiDiscoveryAgent openai,
        RunRecorder recorder,
        ILogger<Program> logger,
        CancellationToken ct)
    {
        var discoverReq = new DiscoverRequest(req.TopicA, req.TopicB, req.TopK);
        if (DiscoveryEndpoints.Validate(discoverReq, out var topK) is { } invalid) return invalid;

        var sw = Stopwatch.StartNew();
        var librainTask = Capture("LIBRAIN", () => DiscoveryEndpoints.RunAsync(discoverReq with { TopK = topK }, librain, openai, null, ct), logger);
        var naiveTask = Capture("Naive-RAG", async () => BaselineEndpoints.ToResponse(await naiveRag.RunAsync(req.TopicA, req.TopicB, topK, null, ct)), logger);
        var singleTask = Capture("Single-LLM", async () => BaselineEndpoints.ToResponse(await singleLlm.RunAsync(req.TopicA, req.TopicB, ct)), logger);
        await Task.WhenAll(librainTask, naiveTask, singleTask);
        ct.ThrowIfCancellationRequested();

        var response = new CompareResponse(
            Guid.NewGuid(), req.TopicA.Trim(), string.IsNullOrWhiteSpace(req.TopicB) ? null : req.TopicB.Trim(), topK,
            librainTask.Result, naiveTask.Result, singleTask.Result, sw.ElapsedMilliseconds);

        if (response.Librain.Result is null && response.NaiveRag.Result is null && response.SingleLlm.Result is null)
        {
            return Results.Problem(title: "All three systems failed",
                detail: $"LIBRAIN: {response.Librain.Error} | Naive-RAG: {response.NaiveRag.Error} | Single-LLM: {response.SingleLlm.Error}",
                statusCode: StatusCodes.Status502BadGateway);
        }

        await recorder.TryRecordAsync(response.CorrelationId, RunKinds.Compare, RunRecorder.TopicTitle(req.TopicA, req.TopicB),
            response.Librain.Result?.Evaluation.QualityScore, req with { TopK = topK }, response, CancellationToken.None);
        return Results.Ok(response);
    }

    private static async Task<CompareOutcome<T>> Capture<T>(string system, Func<Task<T>> run, ILogger logger) where T : class
    {
        try
        {
            return new CompareOutcome<T>(await run(), null);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Compare: {System} failed ({ExceptionType})", system, ex.GetType().Name);
            return new CompareOutcome<T>(null, $"{system} failed: {ex.GetType().Name}");
        }
    }
}
