using LIBRAIN.Experiments.Stats;

namespace LIBRAIN.Tests.Agents;

// Pins the inter-rater agreement math (Task 5) against hand-computable values, incl.
// the zero-variance cases that the hallucination axis hits (all raters flag 0).
public sealed class InterRaterAgreementTests
{
    [Fact]
    public void Cohen_KnownExample_MatchesHandComputation()
    {
        // a=[1,1,1,0,0], b=[1,1,0,0,0]: po=0.8, pe=0.48 → kappa=0.32/0.52≈0.6154
        var r = InterRaterAgreement.CohensKappa(new[] { 1, 1, 1, 0, 0 }, new[] { 1, 1, 0, 0, 0 });
        Assert.Equal("ok", r.Status);
        Assert.Equal(0.6154, r.Value!.Value, 3);
        Assert.Equal(0.8, r.ObservedAgreement, 6);
    }

    [Fact]
    public void Cohen_PerfectAgreement_IsOne()
    {
        var r = InterRaterAgreement.CohensKappa(new[] { 1, 0, 1, 0 }, new[] { 1, 0, 1, 0 });
        Assert.Equal(1.0, r.Value!.Value, 6);
    }

    [Fact]
    public void Cohen_ZeroVariance_IsUndefined()
    {
        // Every rating identical (the hallucination 0/0/0 case).
        var r = InterRaterAgreement.CohensKappa(new[] { 0, 0, 0 }, new[] { 0, 0, 0 });
        Assert.Null(r.Value);
        Assert.Contains("zero variance", r.Status);
        Assert.Equal(1.0, r.ObservedAgreement, 6);
    }

    [Fact]
    public void Fleiss_UnanimousPerItem_IsOne()
    {
        // item1 all cat0, item2 all cat1 → each item unanimous → kappa=1.
        var ratings = new IReadOnlyList<int>[] { new[] { 0, 0, 0 }, new[] { 1, 1, 1 } };
        var r = InterRaterAgreement.FleissKappa(ratings, new[] { 0, 1 });
        Assert.Equal(1.0, r.Value!.Value, 6);
    }

    [Fact]
    public void Fleiss_SystematicSplit_MatchesHandComputation()
    {
        // item1 [0,1,0], item2 [1,0,1]: Pbar=1/3, Pe=0.5 → kappa=(1/3-1/2)/(1/2)=-1/3
        var ratings = new IReadOnlyList<int>[] { new[] { 0, 1, 0 }, new[] { 1, 0, 1 } };
        var r = InterRaterAgreement.FleissKappa(ratings, new[] { 0, 1 });
        Assert.Equal(-0.3333, r.Value!.Value, 3);
    }

    [Fact]
    public void Krippendorff_Nominal_PerfectAgreement_IsOne()
    {
        var data = new int?[][] { new int?[] { 1, 2, 1, 2 }, new int?[] { 1, 2, 1, 2 } };
        var r = InterRaterAgreement.KrippendorffAlpha(data, InterRaterAgreement.Metric.Nominal);
        Assert.Equal(1.0, r.Value!.Value, 6);
    }

    [Fact]
    public void Krippendorff_Ordinal_PerfectAgreement_IsOne()
    {
        var data = new int?[][] { new int?[] { 1, 3, 5, 2 }, new int?[] { 1, 3, 5, 2 } };
        var r = InterRaterAgreement.KrippendorffAlpha(data, InterRaterAgreement.Metric.Ordinal);
        Assert.Equal(1.0, r.Value!.Value, 6);
    }

    [Fact]
    public void Krippendorff_SingleValue_IsUndefined()
    {
        var data = new int?[][] { new int?[] { 0, 0, 0 }, new int?[] { 0, 0, 0 } };
        var r = InterRaterAgreement.KrippendorffAlpha(data, InterRaterAgreement.Metric.Nominal);
        Assert.Null(r.Value);
        Assert.Contains("zero variance", r.Status);
    }

    [Fact]
    public void Krippendorff_Nominal_TotalDisagreement_IsNegative()
    {
        var data = new int?[][] { new int?[] { 1, 1, 1, 1 }, new int?[] { 2, 2, 2, 2 } };
        var r = InterRaterAgreement.KrippendorffAlpha(data, InterRaterAgreement.Metric.Nominal);
        Assert.True(r.Value!.Value < 0, $"expected negative alpha, got {r.Value}");
    }
}
