using LIBRAIN.Agents;

namespace LIBRAIN.Tests.Agents;

public sealed class DiscoveryScoringTests
{
    [Fact]
    public void Aggregate_AllZero_ReturnsZeroQuality()
    {
        var result = DiscoveryScoring.Aggregate(0f, 0f, 0f);

        Assert.Equal(0f, result.QualityScore);
    }

    [Fact]
    public void Aggregate_AllOne_ReturnsOneQuality()
    {
        var result = DiscoveryScoring.Aggregate(1f, 1f, 1f);

        Assert.Equal(1f, result.QualityScore);
    }

    [Fact]
    public void Aggregate_AllHalf_ReturnsHalfQuality()
    {
        var result = DiscoveryScoring.Aggregate(0.5f, 0.5f, 0.5f);

        Assert.Equal(0.5f, result.QualityScore, precision: 5);
    }

    [Fact]
    public void Aggregate_MixedValues_ReturnsArithmeticMean()
    {
        var result = DiscoveryScoring.Aggregate(0.9f, 0.6f, 0.3f);

        Assert.Equal(0.6f, result.QualityScore, precision: 5);
    }

    [Fact]
    public void Aggregate_PreservesIndividualScores()
    {
        var result = DiscoveryScoring.Aggregate(0.42f, 0.81f, 0.13f);

        Assert.Equal(0.42f, result.NoveltyScore);
        Assert.Equal(0.81f, result.PlausibilityScore);
        Assert.Equal(0.13f, result.StructuralCoherenceScore);
    }
}
