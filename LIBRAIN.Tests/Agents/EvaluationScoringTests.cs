using LIBRAIN.Agents;

namespace LIBRAIN.Tests.Agents;

public sealed class EvaluationScoringTests
{
    [Fact]
    public void Clamp01_InRange_PassesThrough()
    {
        Assert.Equal(0f, EvaluationScoring.Clamp01(0.0));
        Assert.Equal(0.5f, EvaluationScoring.Clamp01(0.5));
        Assert.Equal(1f, EvaluationScoring.Clamp01(1.0));
    }

    [Fact]
    public void Clamp01_BelowZero_ClampsToZero()
    {
        Assert.Equal(0f, EvaluationScoring.Clamp01(-0.1));
        Assert.Equal(0f, EvaluationScoring.Clamp01(-1.0));
        Assert.Equal(0f, EvaluationScoring.Clamp01(-100.0));
    }

    [Fact]
    public void Clamp01_AboveOne_ClampsToOne()
    {
        Assert.Equal(1f, EvaluationScoring.Clamp01(1.5));
        Assert.Equal(1f, EvaluationScoring.Clamp01(2.0));
        Assert.Equal(1f, EvaluationScoring.Clamp01(100.0));
    }

    [Fact]
    public void Clamp01_Null_ReturnsZero()
    {
        Assert.Equal(0f, EvaluationScoring.Clamp01(null));
    }

    [Fact]
    public void Clamp01_NaN_ReturnsZero()
    {
        Assert.Equal(0f, EvaluationScoring.Clamp01(double.NaN));
    }

    [Fact]
    public void Aggregate_ThreeScores_ReturnsMean()
    {
        var mean = EvaluationScoring.Aggregate(0.6f, 0.9f, 0.3f);

        Assert.Equal(0.6f, mean, precision: 5);
    }
}
