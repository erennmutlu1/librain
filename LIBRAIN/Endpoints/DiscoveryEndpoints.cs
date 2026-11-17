using System.Diagnostics;
using LIBRAIN.Agents;

namespace LIBRAIN.Endpoints;

public sealed record DiscoverRequest(
    string TopicA,
    string? TopicB,
    int? TopK,
    string? Provider = null,   // "anthropic" (default) | "openai"
    string? Model = null);     // OpenAI model id when Provider=openai (default gpt-4o)

public sealed record SupportingEvidence(
    string PaperId,
    int ChunkIndex,
    string? Section,
    int? PageNumber,
    string SupportType,
    // The cited passage. Optional so results saved before it existed still deserialize.
    string? Content = null);

// Per-sentence self-annotation the DiscoveryAgent must produce alongside novel_claim.
// BasisType is one of: "generalization" (extends retrieved evidence to a new case),
// "analogy" (transfers a mechanism from a related domain), "pure_speculation" (not
// derivable from retrieved chunks). When BasisType is "pure_speculation",
// GroundedInChunkId is null; otherwise it must reference a retrieved chunk
// (paper_id:chunk_index format). This is the Stage 1 hallucination-mitigation guard:
// forcing the model to justify each sentence reduces "specific factual claim as fact"
// drift in the novelClaim body.
public sealed record ExtrapolationBasis(
    string ClaimSentence,
    string BasisType,
    string? GroundedInChunkId,
    string Rationale);

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
    IReadOnlyList<ExtrapolationBasis> ExtrapolationBasis,
    ClaimValidationResult ClaimValidation,
    string Reasoning,
    DiscoveryEvaluation Evaluation,
    // RQ3 measurement surface: how much work the citation-validation contract did.
    // ClaimedEvidenceCount = supporting_evidence entries the model emitted;
    // DroppedEvidenceCount = entries dropped because they did not resolve to the
    // retrieval set. DroppedEvidenceCount > 0 with SupportingEvidence all-resolved
    // is the contract catching fabrications that Naive-RAG would have surfaced.
    int ClaimedEvidenceCount = 0,
    int DroppedEvidenceCount = 0);

public static class DiscoveryEndpoints
{
    private const int DefaultTopK = 5;
    private const int MinTopK = 1;
    private const int MaxTopK = 20;

    public static void MapDiscoveryEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/discover", HandleAsync);
    }

    // Routes to the Anthropic pipeline (default) or the OpenAI cross-family port.
    internal static Task<DiscoverResponse> RunAsync(
        DiscoverRequest normalized, DiscoveryAgent agent, LIBRAIN.Generation.OpenAiDiscoveryAgent openaiAgent,
        Action<LIBRAIN.Pipelines.PipelineProgress>? progress, CancellationToken ct)
    {
        if (string.Equals(normalized.Provider, "openai", StringComparison.OrdinalIgnoreCase))
        {
            progress?.Invoke(new(LIBRAIN.Pipelines.PipelineStages.Generating, "Running the OpenAI port of the Discovery pipeline"));
            return openaiAgent.DiscoverAsync(normalized, string.IsNullOrWhiteSpace(normalized.Model) ? "gpt-4o" : normalized.Model!, ct);
        }
        return agent.DiscoverAsync(normalized, ct, progress);
    }

    internal const int MaxTopicChars = 500;

    internal static IResult? Validate(DiscoverRequest req, out int topK)
    {
        topK = req.TopK ?? DefaultTopK;
        if (string.IsNullOrWhiteSpace(req.TopicA))
            return Results.Problem(title: "topicA is required",
                detail: "The 'topicA' field must be a non-empty string.", statusCode: StatusCodes.Status400BadRequest);
        if (req.TopicA.Length > MaxTopicChars || req.TopicB?.Length > MaxTopicChars)
            return Results.Problem(title: "topic too long",
                detail: $"Topics must be at most {MaxTopicChars} characters.", statusCode: StatusCodes.Status400BadRequest);
        if (!string.IsNullOrWhiteSpace(req.TopicB)
            && string.Equals(req.TopicA.Trim(), req.TopicB.Trim(), StringComparison.Ordinal))
            return Results.Problem(title: "topicA and topicB must differ",
                detail: "If topicB is supplied it must differ from topicA after trimming.", statusCode: StatusCodes.Status400BadRequest);
        if (topK < MinTopK || topK > MaxTopK)
            return Results.Problem(title: "topK out of range",
                detail: $"The 'topK' field must be between {MinTopK} and {MaxTopK}.", statusCode: StatusCodes.Status400BadRequest);
        if (req.Provider is not null && !req.Provider.Equals("anthropic", StringComparison.OrdinalIgnoreCase)
            && !req.Provider.Equals("openai", StringComparison.OrdinalIgnoreCase))
            return Results.Problem(title: "unknown provider",
                detail: "provider must be 'anthropic' (default) or 'openai'.", statusCode: StatusCodes.Status400BadRequest);
        if (req.Model is not null && !AllowedOpenAiModels.Contains(req.Model))
            return Results.Problem(title: "model not allowed",
                detail: $"model must be one of: {string.Join(", ", AllowedOpenAiModels)}.", statusCode: StatusCodes.Status400BadRequest);
        return null;
    }

    // Callers could previously pick ANY OpenAI model id (and its price). Restrict to the
    // models the cross-family experiments actually use.
    internal static readonly IReadOnlySet<string> AllowedOpenAiModels =
        new HashSet<string>(StringComparer.Ordinal) { "gpt-4o", "gpt-4o-mini" };

    private static async Task<IResult> HandleAsync(
        DiscoverRequest req,
        DiscoveryAgent agent,
        LIBRAIN.Generation.OpenAiDiscoveryAgent openaiAgent,
        LIBRAIN.Runs.RunRecorder recorder,
        ILogger<Program> logger,
        CancellationToken ct)
    {
        if (Validate(req, out var topK) is { } invalid) return invalid;

        var sw = Stopwatch.StartNew();
        try
        {
            var normalized = req with { TopK = topK };
            var response = await RunAsync(normalized, agent, openaiAgent, progress: null, ct);

            using var scope = logger.BeginScope(new Dictionary<string, object>
            {
                ["correlationId"] = response.CorrelationId,
            });
            logger.LogInformation(
                "Discovery handled (topicA='{TopicA}', topicB='{TopicB}', topK={TopK}) in {ElapsedMs}ms",
                req.TopicA,
                req.TopicB ?? "(none)",
                topK,
                sw.ElapsedMilliseconds);

            // Persist even if the client has gone: the run was already paid for.
            await recorder.TryRecordAsync(response.CorrelationId, LIBRAIN.Runs.RunKinds.Discover,
                LIBRAIN.Runs.RunRecorder.TopicTitle(req.TopicA, req.TopicB), response.Evaluation.QualityScore,
                normalized, response, CancellationToken.None);
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
