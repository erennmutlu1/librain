using LIBRAIN.Endpoints;

namespace LIBRAIN.Agents;

public static class DiscoveryScoring
{
    public static DiscoveryEvaluation Aggregate(
        float noveltyScore,
        float plausibilityScore,
        float structuralCoherenceScore)
    {
        var quality = (noveltyScore + plausibilityScore + structuralCoherenceScore) / 3f;
        return new DiscoveryEvaluation(
            NoveltyScore: noveltyScore,
            PlausibilityScore: plausibilityScore,
            StructuralCoherenceScore: structuralCoherenceScore,
            QualityScore: quality);
    }
}
