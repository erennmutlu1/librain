using LIBRAIN.Agents;

namespace LIBRAIN.Tests.Agents;

public sealed class ClaimValidatorTests
{
    // -- ParseStatus -----------------------------------------------------

    [Fact]
    public void ParseStatus_Grounded_MapsToGrounded()
    {
        Assert.Equal(ClaimFactualityStatus.Grounded, ClaimValidationScoring.ParseStatus("GROUNDED"));
    }

    [Fact]
    public void ParseStatus_Risky_MapsToRisky()
    {
        Assert.Equal(ClaimFactualityStatus.Risky, ClaimValidationScoring.ParseStatus("RISKY"));
    }

    [Fact]
    public void ParseStatus_Extrapolated_MapsToExtrapolated()
    {
        Assert.Equal(ClaimFactualityStatus.Extrapolated, ClaimValidationScoring.ParseStatus("EXTRAPOLATED"));
    }

    [Fact]
    public void ParseStatus_CaseInsensitive()
    {
        Assert.Equal(ClaimFactualityStatus.Grounded, ClaimValidationScoring.ParseStatus("grounded"));
        Assert.Equal(ClaimFactualityStatus.Risky, ClaimValidationScoring.ParseStatus("Risky"));
        Assert.Equal(ClaimFactualityStatus.Extrapolated, ClaimValidationScoring.ParseStatus(" extrapolated "));
    }

    [Fact]
    public void ParseStatus_UnknownOrNull_DefaultsToExtrapolated()
    {
        Assert.Equal(ClaimFactualityStatus.Extrapolated, ClaimValidationScoring.ParseStatus(null));
        Assert.Equal(ClaimFactualityStatus.Extrapolated, ClaimValidationScoring.ParseStatus(""));
        Assert.Equal(ClaimFactualityStatus.Extrapolated, ClaimValidationScoring.ParseStatus("UNKNOWN"));
        Assert.Equal(ClaimFactualityStatus.Extrapolated, ClaimValidationScoring.ParseStatus("hallucination"));
    }

    // -- ClampProbability ------------------------------------------------

    [Fact]
    public void ClampProbability_InRange_PassesThrough()
    {
        Assert.Equal(0f, ClaimValidationScoring.ClampProbability(0.0));
        Assert.Equal(0.5f, ClaimValidationScoring.ClampProbability(0.5));
        Assert.Equal(1f, ClaimValidationScoring.ClampProbability(1.0));
    }

    [Fact]
    public void ClampProbability_AboveOne_ClampsToOne()
    {
        Assert.Equal(1f, ClaimValidationScoring.ClampProbability(1.5));
        Assert.Equal(1f, ClaimValidationScoring.ClampProbability(100.0));
    }

    [Fact]
    public void ClampProbability_BelowZero_ClampsToZero()
    {
        Assert.Equal(0f, ClaimValidationScoring.ClampProbability(-0.1));
        Assert.Equal(0f, ClaimValidationScoring.ClampProbability(-1.0));
    }

    [Fact]
    public void ClampProbability_NullOrNaN_ReturnsZero()
    {
        Assert.Equal(0f, ClaimValidationScoring.ClampProbability(null));
        Assert.Equal(0f, ClaimValidationScoring.ClampProbability(double.NaN));
    }

    // -- AggregateRisk ---------------------------------------------------

    [Fact]
    public void AggregateRisk_TakesMaxOfPerSentence()
    {
        var probs = new[] { 0.1f, 0.7f, 0.3f, 0.2f };

        Assert.Equal(0.7f, ClaimValidationScoring.AggregateRisk(probs), precision: 5);
    }

    [Fact]
    public void AggregateRisk_SingleValue_ReturnsThatValue()
    {
        Assert.Equal(0.42f, ClaimValidationScoring.AggregateRisk(new[] { 0.42f }), precision: 5);
    }

    [Fact]
    public void AggregateRisk_Empty_ReturnsZero()
    {
        Assert.Equal(0f, ClaimValidationScoring.AggregateRisk(Array.Empty<float>()));
    }

    [Fact]
    public void AggregateRisk_OutOfRangeValues_Clamped()
    {
        // Defensive: per-sentence values should already be clamped, but if a caller
        // forgets and passes raw values, AggregateRisk still returns [0,1].
        Assert.Equal(1f, ClaimValidationScoring.AggregateRisk(new[] { 0.3f, 1.5f, 0.2f }));
    }

    [Fact]
    public void AggregateRisk_AllZero_ReturnsZero()
    {
        Assert.Equal(0f, ClaimValidationScoring.AggregateRisk(new[] { 0f, 0f, 0f }));
    }

    // -- FilterSupportingChunks ------------------------------------------

    [Fact]
    public void FilterSupportingChunks_OnlyRetrievedKeysPass()
    {
        var retrieved = new HashSet<string> { "paper-A:10", "paper-B:20", "paper-C:30" };
        var claimed = new[] { "paper-A:10", "paper-X:99", "paper-B:20" };

        var filtered = ClaimValidationScoring.FilterSupportingChunks(claimed, retrieved);

        Assert.Equal(2, filtered.Count);
        Assert.Contains("paper-A:10", filtered);
        Assert.Contains("paper-B:20", filtered);
        Assert.DoesNotContain("paper-X:99", filtered);
    }

    [Fact]
    public void FilterSupportingChunks_EmptyClaimed_ReturnsEmpty()
    {
        var retrieved = new HashSet<string> { "paper-A:10" };

        var filtered = ClaimValidationScoring.FilterSupportingChunks(Array.Empty<string>(), retrieved);

        Assert.Empty(filtered);
    }

    [Fact]
    public void FilterSupportingChunks_NoneMatch_ReturnsEmpty()
    {
        var retrieved = new HashSet<string> { "paper-A:10" };
        var claimed = new[] { "paper-X:99", "paper-Y:88" };

        var filtered = ClaimValidationScoring.FilterSupportingChunks(claimed, retrieved);

        Assert.Empty(filtered);
    }
}
