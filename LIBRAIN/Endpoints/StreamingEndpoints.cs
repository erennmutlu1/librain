using System.Net.ServerSentEvents;
using System.Threading.Channels;
using LIBRAIN.Agents;
using LIBRAIN.Generation;
using LIBRAIN.Pipelines;
using LIBRAIN.Runs;

namespace LIBRAIN.Endpoints;

public sealed record StreamError(string Title, string Detail, Guid? CorrelationId = null);

// Server-sent-event variants of the long-running endpoints. The body is the same as
// the non-streaming endpoint; the response is a text/event-stream of:
//   event: progress  data: {"stage": "...", "message": "...", "count": n}
//   event: result    data: <the same JSON the non-streaming endpoint returns>
//   event: error     data: {"title": "...", "detail": "..."}
// Input validation still answers with a normal 400 problem+json before streaming.
public static class StreamingEndpoints
{
    public static void MapStreamingEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/query/stream", (QueryRequest req, QueryPipeline pipeline, RunRecorder recorder,
            ILogger<Program> logger, CancellationToken ct) =>
        {
            if (QueryEndpoints.Validate(req, out var topK) is { } invalid) return invalid;
            var normalized = req with { TopK = topK };
            return TypedResults.ServerSentEvents(Run(
                progress => pipeline.RunAsync(req.Query, topK, progress, ct),
                r => recorder.TryRecordAsync(r.CorrelationId, RunKinds.Query, req.Query.Trim(), r.Evaluation.QualityScore,
                    normalized, r, CancellationToken.None),
                "query", logger, ct));
        }).RequireRateLimiting(Guards.PaidPolicy);

        app.MapPost("/api/discover/stream", (DiscoverRequest req, DiscoveryAgent agent, OpenAiDiscoveryAgent openai,
            RunRecorder recorder, LIBRAIN.Llm.IProviderKeys keys, ILogger<Program> logger, CancellationToken ct) =>
        {
            if (DiscoveryEndpoints.Validate(req, out var topK, keys.PublicMode) is { } invalid) return invalid;
            var normalized = req with { TopK = topK };
            var correlationId = Guid.NewGuid();
            return TypedResults.ServerSentEvents(Run(
                progress => DiscoveryEndpoints.RunAsync(normalized, agent, openai, progress, ct, correlationId),
                r => recorder.TryRecordAsync(r.CorrelationId, RunKinds.Discover, RunRecorder.TopicTitle(req.TopicA, req.TopicB),
                    r.Evaluation.QualityScore, normalized, r, CancellationToken.None),
                "discovery", logger, ct, correlationId));
        }).RequireRateLimiting(Guards.PaidPolicy);
    }

    internal static async IAsyncEnumerable<SseItem<object>> Run<T>(
        Func<Action<PipelineProgress>, Task<T>> pipeline,
        Func<T, Task> onSuccess,
        string name,
        ILogger logger,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct,
        Guid? correlationId = null)
        where T : notnull
    {
        var events = Channel.CreateUnbounded<SseItem<object>>(new UnboundedChannelOptions { SingleReader = true });

        var work = Task.Run(async () =>
        {
            try
            {
                var result = await pipeline(p => events.Writer.TryWrite(new SseItem<object>(p, "progress")));
                await onSuccess(result);
                events.Writer.TryWrite(new SseItem<object>(result, "result"));
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                // Client went away; nothing to send.
            }
            catch (NoSourcesException ex)
            {
                events.Writer.TryWrite(new SseItem<object>(new StreamError("No relevant sources found", ex.Message), "error"));
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Streaming {Pipeline} pipeline failed ({ExceptionType})", name, ex.GetType().Name);
                var error = UpstreamErrors.Classify(ex) is { } failure
                    ? new StreamError(failure.Title, failure.Detail, correlationId)
                    : new StreamError("Upstream API error", $"The {name} pipeline failed: {ex.GetType().Name}", correlationId);
                events.Writer.TryWrite(new SseItem<object>(error, "error"));
            }
            finally
            {
                events.Writer.TryComplete();
            }
        }, CancellationToken.None);

        await foreach (var item in events.Reader.ReadAllAsync(ct))
        {
            yield return item;
        }
        await work;
    }
}
