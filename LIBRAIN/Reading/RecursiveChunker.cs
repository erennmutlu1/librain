using System.Text.RegularExpressions;

namespace LIBRAIN.Reading;

public sealed partial class RecursiveChunker(ILogger<RecursiveChunker> logger)
{
    private const int TargetChars = 2000;
    private const int MaxChars = 4000;
    private const int OverlapChars = 300;

    private readonly ILogger<RecursiveChunker> _logger = logger;

    [GeneratedRegex(@"\n\s*\n")]
    private static partial Regex ParagraphBreakRegex();

    [GeneratedRegex(@"(?<=[.!?])\s+")]
    private static partial Regex SentenceBreakRegex();

    [GeneratedRegex(@"^(\d+(\.\d+)*\.?\s+\S.*|[A-Z][A-Z\s]{3,30})$")]
    private static partial Regex HeadingLineRegex();

    public IReadOnlyList<Chunk> Chunk(string fullText, IReadOnlyList<ExtractedPage>? pages = null)
    {
        if (string.IsNullOrEmpty(fullText))
        {
            return Array.Empty<Chunk>();
        }

        var headings = ScanHeadings(fullText);
        var pageOffsets = pages is null
            ? Array.Empty<int>()
            : pages.Select(p => p.StartOffset).ToArray();

        var chunks = new List<Chunk>();
        int position = 0;
        int chunkIndex = 0;

        while (position < fullText.Length)
        {
            int chunkEnd = ChooseEnd(fullText, position);
            string content = fullText[position..chunkEnd];

            chunks.Add(new Chunk(
                Content: content,
                StartOffset: position,
                Length: content.Length,
                ChunkIndex: chunkIndex,
                PageNumber: ResolvePage(pages, pageOffsets, position),
                Section: ResolveSection(headings, position)));
            chunkIndex++;

            if (chunkEnd >= fullText.Length)
            {
                break;
            }

            int nextStart = chunkEnd - OverlapChars;
            if (nextStart <= position)
            {
                nextStart = position + 1;
            }
            position = nextStart;
        }

        _logger.LogInformation(
            "Chunked {CharCount} chars into {ChunkCount} chunk(s)",
            fullText.Length,
            chunks.Count);
        return chunks;
    }

    private static int ChooseEnd(string text, int start)
    {
        int remaining = text.Length - start;
        if (remaining <= MaxChars)
        {
            return text.Length;
        }

        int targetEnd = start + TargetChars;
        int maxEnd = start + MaxChars;

        int paraEnd = LatestMatchIndex(ParagraphBreakRegex(), text, targetEnd, maxEnd);
        if (paraEnd > start)
        {
            return paraEnd;
        }

        int sentEnd = LatestMatchIndex(SentenceBreakRegex(), text, targetEnd, maxEnd);
        if (sentEnd > start)
        {
            return sentEnd;
        }

        return maxEnd;
    }

    private static int LatestMatchIndex(Regex regex, string text, int rangeStart, int rangeEnd)
    {
        int latest = -1;
        var match = regex.Match(text, rangeStart);
        while (match.Success && match.Index <= rangeEnd)
        {
            latest = match.Index;
            match = match.NextMatch();
        }
        return latest;
    }

    private static int? ResolvePage(
        IReadOnlyList<ExtractedPage>? pages,
        int[] pageOffsets,
        int chunkStart)
    {
        if (pages is null || pages.Count == 0)
        {
            return null;
        }

        int idx = Array.BinarySearch(pageOffsets, chunkStart);
        if (idx < 0)
        {
            idx = ~idx - 1;
        }
        if (idx < 0)
        {
            idx = 0;
        }
        return pages[idx].PageNumber;
    }

    private static string? ResolveSection(
        List<(int Offset, string Name)> headings,
        int chunkStart)
    {
        if (headings.Count == 0)
        {
            return null;
        }

        string? latest = null;
        foreach (var h in headings)
        {
            if (h.Offset <= chunkStart)
            {
                latest = h.Name;
            }
            else
            {
                break;
            }
        }
        return latest;
    }

    private static List<(int Offset, string Name)> ScanHeadings(string text)
    {
        var result = new List<(int Offset, string Name)>();
        var regex = HeadingLineRegex();
        int pos = 0;
        while (pos < text.Length)
        {
            int newlineIdx = text.IndexOf('\n', pos);
            int lineEnd = newlineIdx == -1 ? text.Length : newlineIdx;
            var slice = text[pos..lineEnd].Trim();
            if (slice.Length > 0 && regex.IsMatch(slice))
            {
                result.Add((pos, slice));
            }
            if (newlineIdx == -1)
            {
                break;
            }
            pos = newlineIdx + 1;
        }
        return result;
    }
}
