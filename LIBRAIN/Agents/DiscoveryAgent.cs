using LIBRAIN.Endpoints;

namespace LIBRAIN.Agents;

public sealed class DiscoveryAgent(ILogger<DiscoveryAgent> logger)
{
    private readonly ILogger<DiscoveryAgent> _logger = logger;

    public Task<DiscoverResponse> DiscoverAsync(DiscoverRequest req, CancellationToken ct = default)
    {
        var corrId = Guid.NewGuid();
        _logger.LogInformation(
            "Discovery stub invoked (topicA='{TopicA}', topicB='{TopicB}', topK={TopK}, noveltyTarget={NoveltyTarget}); correlationId={CorrelationId}",
            req.TopicA,
            req.TopicB ?? "(none)",
            req.TopK,
            req.NoveltyTarget,
            corrId);

        return Task.FromResult(new DiscoverResponse(
            CorrelationId: corrId,
            Hypothesis: "[stub] Discovery pipeline scaffolded; Step 2 will wire Claude Sonnet 4.6 with the extrapolation prompt.",
            SupportingEvidence: Array.Empty<SupportingEvidence>(),
            NovelClaim: "[stub]",
            Reasoning: "[stub]",
            Evaluation: new DiscoveryEvaluation(0f, 0f, 0f, 0f)));
    }
}
