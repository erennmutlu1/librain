using LIBRAIN.Agents;

namespace LIBRAIN.Tests.Agents;

public sealed class NoveltyScoringTests
{
    [Fact]
    public void FromSimilarity_PerfectMatch_ReturnsZeroNovelty()
    {
        Assert.Equal(0f, NoveltyScoring.FromSimilarity(1f));
    }

    [Fact]
    public void FromSimilarity_NoMatch_ReturnsFullNovelty()
    {
        Assert.Equal(1f, NoveltyScoring.FromSimilarity(0f));
    }

    [Fact]
    public void FromSimilarity_HalfMatch_ReturnsHalfNovelty()
    {
        Assert.Equal(0.5f, NoveltyScoring.FromSimilarity(0.5f), precision: 5);
    }

    [Fact]
    public void FromSimilarity_AboveOne_ClampsToZero()
    {
        Assert.Equal(0f, NoveltyScoring.FromSimilarity(1.001f));
    }

    [Fact]
    public void FromSimilarity_BelowZero_ClampsToOne()
    {
        Assert.Equal(1f, NoveltyScoring.FromSimilarity(-0.001f));
    }

    [Fact]
    public void FromSimilarity_NaN_ReturnsZero()
    {
        Assert.Equal(0f, NoveltyScoring.FromSimilarity(float.NaN));
    }
}
