using System.Diagnostics;
using LIBRAIN.Agents;

namespace LIBRAIN.Endpoints;

public sealed record DiscoverRequest(
    string TopicA,
    string? TopicB,
    int? TopK);

public sealed record SupportingEvidence(
    string PaperId,
    int ChunkIndex,
    string? Section,
    int? PageNumber,
    string SupportType);

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

        var sw = Stopwatch.StartNew();
        try
        {
            var normalized = req with { TopK = topK };
            var response = await agent.DiscoverAsync(normalized, ct);

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
