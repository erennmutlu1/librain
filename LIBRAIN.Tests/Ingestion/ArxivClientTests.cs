using LIBRAIN.Ingestion;
using LIBRAIN.Tests.Fixtures;

namespace LIBRAIN.Tests.Ingestion;

public sealed class ArxivClientTests
{
    [Theory]
    [InlineData("2005.11401", "2005.11401")]
    [InlineData("2005.11401v4", "2005.11401")]
    [InlineData(" arXiv:2503.08979 ", "2503.08979")]
    [InlineData("https://arxiv.org/abs/2005.11401v2", "2005.11401")]
    [InlineData("https://arxiv.org/pdf/2504.05496.pdf", "2504.05496")]
    [InlineData("0704.0001", "0704.0001")]
    public void TryNormalizeId_AcceptsCommonForms(string input, string expected)
    {
        Assert.True(ArxivClient.TryNormalizeId(input, out var id));
        Assert.Equal(expected, id);
    }

    [Theory]
    [InlineData("")]
    [InlineData("graphcast")]
    [InlineData("hep-th/9901001")]          // old-style ids are not supported
    [InlineData("2005.11401; rm -rf /")]
    [InlineData("https://example.com/abs/2005.11401")]
    public void TryNormalizeId_RejectsEverythingElse(string input)
    {
        Assert.False(ArxivClient.TryNormalizeId(input, out _));
    }

    [Fact]
    public void ParseAtom_RealResponse_ExtractsBibliographicMetadata()
    {
        var paper = ArxivClient.ParseAtom(RealData.RagAtom, "2005.11401");

        Assert.Equal("Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks", paper.Title);
        Assert.Equal("Patrick Lewis", paper.Authors[0]);
        Assert.Contains("Heinrich Küttler", paper.Authors);
        Assert.Equal(2020, paper.Year);
        Assert.StartsWith("Large pre-trained language models", paper.Summary);
        Assert.DoesNotContain("\n", paper.Title);
    }

    [Fact]
    public void ParseAtom_RealEmptyFeed_IsNotFound()
    {
        Assert.Throws<ArxivNotFoundException>(() => ArxivClient.ParseAtom(RealData.NotFoundAtom, "2005.99999"));
    }
}
