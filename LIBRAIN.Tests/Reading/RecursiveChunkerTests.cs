using LIBRAIN.Reading;
using Microsoft.Extensions.Logging.Abstractions;

namespace LIBRAIN.Tests.Reading;

public sealed class RecursiveChunkerTests
{
    private const int TargetChars = 2000;
    private const int MaxChars = 4000;
    private const int OverlapChars = 300;

    private static RecursiveChunker NewChunker() =>
        new(NullLogger<RecursiveChunker>.Instance);

    [Fact]
    public void Chunk_EmptyInput_ReturnsEmpty()
    {
        var chunks = NewChunker().Chunk(string.Empty);

        Assert.Empty(chunks);
    }

    [Fact]
    public void Chunk_BelowTarget_ReturnsSingleChunk()
    {
        var input = new string('a', 500);

        var chunks = NewChunker().Chunk(input);

        var only = Assert.Single(chunks);
        Assert.Equal(input, only.Content);
        Assert.Equal(0, only.StartOffset);
        Assert.Equal(500, only.Length);
        Assert.Equal(0, only.ChunkIndex);
    }

    [Fact]
    public void Chunk_AboveMax_ReturnsMultipleChunks()
    {
        var input = BuildFourParagraphs();

        var chunks = NewChunker().Chunk(input);

        Assert.True(chunks.Count >= 2, $"expected ≥2 chunks, got {chunks.Count}");
        Assert.All(chunks, c => Assert.True(c.Length <= MaxChars, $"chunk {c.ChunkIndex} exceeded MaxChars: {c.Length}"));
        for (int i = 0; i < chunks.Count; i++)
        {
            Assert.Equal(i, chunks[i].ChunkIndex);
        }
    }

    [Fact]
    public void Chunk_OverlapPresent_BetweenAdjacent()
    {
        var input = BuildFourParagraphs();

        var chunks = NewChunker().Chunk(input);

        Assert.True(chunks.Count >= 2);
        for (int i = 0; i < chunks.Count - 1; i++)
        {
            var a = chunks[i];
            var b = chunks[i + 1];
            var aEnd = a.StartOffset + a.Length;
            Assert.True(b.StartOffset < aEnd, $"chunks {i}/{i + 1} do not overlap");

            var overlapLen = aEnd - b.StartOffset;
            var fromA = a.Content.Substring(a.Length - overlapLen, overlapLen);
            var fromB = b.Content[..overlapLen];
            Assert.Equal(fromA, fromB);
        }
    }

    [Fact]
    public void Chunk_PrefersParagraphBoundary()
    {
        var paragraph1 = new string('a', 2500);
        var paragraph2 = new string('b', 2500);
        var input = paragraph1 + "\n\n" + paragraph2;

        var chunks = NewChunker().Chunk(input);

        Assert.True(chunks.Count >= 2);
        Assert.Equal(paragraph1, chunks[0].Content);
        Assert.DoesNotContain('\n', chunks[0].Content);
    }

    [Fact]
    public void Chunk_FallsBackToSentence_WhenParagraphTooLarge()
    {
        var sentence = new string('a', 199) + ".";
        var input = string.Join(" ", Enumerable.Repeat(sentence, 25));

        Assert.True(input.Length > MaxChars);
        Assert.DoesNotContain("\n\n", input);

        var chunks = NewChunker().Chunk(input);

        Assert.True(chunks.Count >= 2);
        for (int i = 0; i < chunks.Count - 1; i++)
        {
            var trimmed = chunks[i].Content.TrimEnd();
            var lastChar = trimmed[^1];
            Assert.True(lastChar is '.' or '!' or '?', $"chunk {i} did not end on a sentence boundary; last char: '{lastChar}'");
        }
    }

    [Fact]
    public void Chunk_HardCuts_WhenNoBoundary()
    {
        var input = new string('a', 5000);

        var chunks = NewChunker().Chunk(input);

        Assert.True(chunks.Count >= 2);
        Assert.All(chunks, c => Assert.True(c.Length <= MaxChars));
        Assert.Equal(0, chunks[0].StartOffset);
        Assert.Equal(input.Length, chunks[^1].StartOffset + chunks[^1].Length);
        for (int i = 0; i < chunks.Count - 1; i++)
        {
            var aEnd = chunks[i].StartOffset + chunks[i].Length;
            Assert.True(chunks[i + 1].StartOffset <= aEnd, "gap between adjacent chunks");
        }
    }

    private static string BuildFourParagraphs()
    {
        var paragraphs = new[]
        {
            new string('a', 2000),
            new string('b', 2000),
            new string('c', 2000),
            new string('d', 2000),
        };
        return string.Join("\n\n", paragraphs);
    }
}
