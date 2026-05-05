using System.Text;
using UglyToad.PdfPig;
using UglyToad.PdfPig.DocumentLayoutAnalysis.TextExtractor;

namespace LIBRAIN.Reading;

public sealed class PdfTextExtractor(ILogger<PdfTextExtractor> logger)
{
    private const string PageSeparator = "\n\n";

    private readonly ILogger<PdfTextExtractor> _logger = logger;

    public ExtractedDocument Extract(Stream pdfStream)
    {
        using var document = PdfDocument.Open(pdfStream);
        var pages = new List<ExtractedPage>(document.NumberOfPages);
        var builder = new StringBuilder();

        foreach (var page in document.GetPages())
        {
            var startOffset = builder.Length;
            var text = ContentOrderTextExtractor.GetText(page);
            pages.Add(new ExtractedPage(page.Number, text, startOffset));
            builder.Append(text);
            if (page.Number < document.NumberOfPages)
            {
                builder.Append(PageSeparator);
            }
        }

        var fullText = builder.ToString();
        var title = NullIfBlank(document.Information.Title);
        var author = NullIfBlank(document.Information.Author);
        IReadOnlyList<string>? authors = author is null ? null : [author];
        var year = ParseYear(document.Information.CreationDate);

        _logger.LogInformation(
            "Extracted {PageCount} page(s), {CharCount} chars from PDF (title='{Title}', year={Year})",
            pages.Count,
            fullText.Length,
            title ?? "(none)",
            year?.ToString() ?? "(none)");
        return new ExtractedDocument(fullText, pages, title, authors, year);
    }

    private static string? NullIfBlank(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value;

    // PDF date format per ISO 32000-1 §7.9.4: "D:YYYYMMDDHHmmSSOHH'mm" (or shorter
    // prefixes). The "D:" prefix is sometimes missing. We extract just the year
    // and reject anything outside [1900, 2100] as garbage.
    private static int? ParseYear(string? creationDate)
    {
        if (string.IsNullOrWhiteSpace(creationDate))
        {
            return null;
        }

        var s = creationDate.StartsWith("D:") ? creationDate[2..] : creationDate;
        if (s.Length < 4)
        {
            return null;
        }

        return int.TryParse(s.AsSpan(0, 4), out var year) && year is >= 1900 and <= 2100
            ? year
            : null;
    }
}
