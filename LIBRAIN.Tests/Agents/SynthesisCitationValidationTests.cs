using LIBRAIN.Agents;
using LIBRAIN.Storage;

namespace LIBRAIN.Tests.Agents;

public sealed class SynthesisCitationValidationTests
{
    [Fact]
    public void Validate_InRangeIndices_ProjectHitFields()
    {
        var hits = BuildHits();

        var citations = SynthesisCitations.Validate(new[] { 1, 2, 3 }, hits);

        Assert.Equal(3, citations.Count);

        Assert.Equal(1, citations[0].Index);
        Assert.Equal("paper-A", citations[0].PaperId);
        Assert.Equal(10, citations[0].ChunkIndex);
        Assert.Equal("Introduction", citations[0].Section);
        Assert.Equal(1, citations[0].PageNumber);

        Assert.Equal(2, citations[1].Index);
        Assert.Equal("paper-B", citations[1].PaperId);
        Assert.Equal(20, citations[1].ChunkIndex);
        Assert.Equal("Methods", citations[1].Section);
        Assert.Equal(5, citations[1].PageNumber);

        Assert.Equal(3, citations[2].Index);
        Assert.Equal("paper-C", citations[2].PaperId);
        Assert.Equal(30, citations[2].ChunkIndex);
        Assert.Null(citations[2].Section);
        Assert.Null(citations[2].PageNumber);
    }

    [Fact]
    public void Validate_OutOfRangeIndices_AreFiltered()
    {
        var hits = BuildHits();

        var citations = SynthesisCitations.Validate(new[] { -1, 0, 1, 4, 100 }, hits);

        var only = Assert.Single(citations);
        Assert.Equal(1, only.Index);
        Assert.Equal("paper-A", only.PaperId);
    }

    [Fact]
    public void Validate_DuplicateIndices_AreDedupedFirstOccurrenceWins()
    {
        var hits = BuildHits();

        var citations = SynthesisCitations.Validate(new[] { 2, 1, 2, 3, 1 }, hits);

        Assert.Equal(3, citations.Count);
        Assert.Equal(new[] { 2, 1, 3 }, citations.Select(c => c.Index).ToArray());
    }

    [Fact]
    public void Validate_OneBasedToZeroBasedMapping_IsPinned()
    {
        var hits = BuildHits();

        var citations = SynthesisCitations.Validate(new[] { 1 }, hits);

        var only = Assert.Single(citations);
        Assert.Equal("paper-A", only.PaperId);
        Assert.NotEqual("paper-B", only.PaperId);
    }

    [Fact]
    public void Validate_EmptyIndices_ReturnsEmpty()
    {
        var hits = BuildHits();

        var citations = SynthesisCitations.Validate(Array.Empty<int>(), hits);

        Assert.Empty(citations);
    }

    [Fact]
    public void Validate_EmptyHits_ReturnsEmpty()
    {
        var citations = SynthesisCitations.Validate(new[] { 1, 2, 3 }, Array.Empty<SearchHit>());

        Assert.Empty(citations);
    }

    private static SearchHit[] BuildHits() => new[]
    {
        new SearchHit("paper-A", 10, "alpha content", 0.9f, "Introduction", 1),
        new SearchHit("paper-B", 20, "beta content",  0.8f, "Methods",      5),
        new SearchHit("paper-C", 30, "gamma content", 0.7f, null,           null),
    };
}
