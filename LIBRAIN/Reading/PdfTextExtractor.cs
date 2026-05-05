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
        _logger.LogInformation(
            "Extracted {PageCount} page(s), {CharCount} chars from PDF",
            pages.Count,
            fullText.Length);
        return new ExtractedDocument(fullText, pages);
    }
}
