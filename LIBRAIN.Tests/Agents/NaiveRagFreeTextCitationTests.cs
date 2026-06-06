using LIBRAIN.Agents;

namespace LIBRAIN.Tests.Agents;

// RQ3 fabrication-delta: free-text citation parsing + resolution. The free-text path
// is where Naive-RAG can surface fabrications (forced structured tool-use suppresses
// them), so the parser/resolver is the load-bearing measurement surface.
public sealed class NaiveRagFreeTextCitationTests
{
    [Fact]
    public void Parse_ExtractsArxivIdsAndKebabStems_WithAndWithoutChunk()
    {
        var text = "RAG helps [2005.11401] and de novo design [pharmagents:7], see also [graphcast].";
        var cites = NaiveRagCitations.ParseFreeTextCitations(text);

        Assert.Equal(3, cites.Count);
        Assert.Contains(("2005.11401", (int?)null), cites);
        Assert.Contains(("pharmagents", (int?)7), cites);
        Assert.Contains(("graphcast", (int?)null), cites);
    }

    [Fact]
    public void Parse_IgnoresBareNumericListMarkers()
    {
        // "[3]" is a list/reference marker, not a paper id (no letter, no dot) → ignored.
        var cites = NaiveRagCitations.ParseFreeTextCitations("As shown [3] and [12], the model [2211.02556] works.");

        Assert.Single(cites);
        Assert.Equal("2211.02556", cites[0].PaperId);
    }

    [Fact]
    public void Parse_HandlesCommaSeparatedInsideOneBracket()
    {
        var cites = NaiveRagCitations.ParseFreeTextCitations("[2005.11401, graphcast:2]");

        Assert.Equal(2, cites.Count);
        Assert.Contains(("2005.11401", (int?)null), cites);
        Assert.Contains(("graphcast", (int?)2), cites);
    }

    [Fact]
    public void ResolveFreeText_CountsUnretrievedPaperAndWrongChunkAsFabricated()
    {
        var retrievedKeys = new HashSet<(string, int)> { ("2005.11401", 0), ("graphcast", 2) };
        var retrievedPaperIds = new HashSet<string> { "2005.11401", "graphcast" };
        var claimed = new (string, int?)[]
        {
            ("2005.11401", null),   // resolves on paper-id membership
            ("graphcast", 2),       // exact key resolves
            ("graphcast", 9),       // real paper, wrong chunk → fabricated
            ("madeup-paper", null), // not retrieved → fabricated
        };

        var (resolved, fabricated) = NaiveRagCitations.ResolveFreeText(claimed, retrievedKeys, retrievedPaperIds);

        Assert.Equal(2, fabricated);
        Assert.Equal(4, resolved.Count);
        Assert.True(resolved[0].IsResolved);
        Assert.True(resolved[1].IsResolved);
        Assert.False(resolved[2].IsResolved);
        Assert.False(resolved[3].IsResolved);
    }
}
