using System.Globalization;
using System.Net.Http.Headers;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using LIBRAIN.Agents;

namespace LIBRAIN.Ingestion;

public sealed record ArxivPaper(string Id, string Title, IReadOnlyList<string> Authors, int? Year, string? Summary);

public sealed class ArxivNotFoundException(string id) : Exception($"arXiv has no paper with id '{id}'.");

// Fetches metadata (arXiv API, Atom) and the PDF for a new-style arXiv id. Metadata
// from the API is authoritative; the PDF Info dictionary in arXiv PDFs is usually empty
// and its date is the build date, not the publication year.
public sealed partial class ArxivClient(HttpClient http, ILogger<ArxivClient> logger)
{
    public const long MaxPdfBytes = 50_000_000;

    private static readonly XNamespace Atom = "http://www.w3.org/2005/Atom";
    private readonly HttpClient _http = http;
    private readonly ILogger<ArxivClient> _logger = logger;

    // New-style ids (2007 onward): YYMM.NNNN or YYMM.NNNNN, optional version.
    [GeneratedRegex(@"^(?<id>\d{4}\.\d{4,5})(?<version>v\d+)?$")]
    private static partial Regex NewStyleId();

    // Accepts "2005.11401", "2005.11401v4", "arXiv:2005.11401", and abs/pdf URLs.
    // Returns the id WITHOUT version, which is how papers are keyed in the corpus.
    public static bool TryNormalizeId(string? input, out string id)
    {
        id = string.Empty;
        if (string.IsNullOrWhiteSpace(input)) return false;
        var s = input.Trim();
        if (s.StartsWith("arxiv:", StringComparison.OrdinalIgnoreCase)) s = s[6..].Trim();
        if (Uri.TryCreate(s, UriKind.Absolute, out var uri)
            && uri.Host.EndsWith("arxiv.org", StringComparison.OrdinalIgnoreCase))
        {
            var last = uri.AbsolutePath.TrimEnd('/').Split('/').LastOrDefault() ?? string.Empty;
            s = last.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ? last[..^4] : last;
        }
        var m = NewStyleId().Match(s);
        if (!m.Success) return false;
        id = m.Groups["id"].Value;
        return true;
    }

    public async Task<ArxivPaper> GetMetadataAsync(string id, CancellationToken ct = default)
    {
        using var res = await _http.GetAsync(
            $"https://export.arxiv.org/api/query?id_list={Uri.EscapeDataString(id)}", ct).ConfigureAwait(false);
        res.EnsureSuccessStatusCode();
        var xml = await res.Content.ReadAsStringAsync(ct).ConfigureAwait(false);
        return ParseAtom(xml, id);
    }

    public static ArxivPaper ParseAtom(string xml, string requestedId)
    {
        var feed = XDocument.Parse(xml).Root
            ?? throw new InvalidOperationException("arXiv API returned an empty document.");
        var entry = feed.Elements(Atom + "entry").FirstOrDefault(e =>
            (e.Element(Atom + "id")?.Value ?? string.Empty).Contains("/abs/", StringComparison.Ordinal));
        if (entry is null) throw new ArxivNotFoundException(requestedId);

        var title = Collapse(entry.Element(Atom + "title")?.Value);
        if (string.IsNullOrEmpty(title)) throw new ArxivNotFoundException(requestedId);

        var authors = entry.Elements(Atom + "author")
            .Select(a => Collapse(a.Element(Atom + "name")?.Value))
            .Where(n => n.Length > 0)
            .ToArray();
        int? year = DateTimeOffset.TryParse(entry.Element(Atom + "published")?.Value, CultureInfo.InvariantCulture,
            DateTimeStyles.AssumeUniversal, out var published) ? published.Year : null;
        var summary = Collapse(entry.Element(Atom + "summary")?.Value);

        return new ArxivPaper(requestedId, title, authors, year, summary.Length == 0 ? null : summary);
    }

    public async Task<byte[]> DownloadPdfAsync(string id, CancellationToken ct = default)
    {
        using var res = await _http.GetAsync(
            $"https://arxiv.org/pdf/{Uri.EscapeDataString(id)}", HttpCompletionOption.ResponseHeadersRead, ct).ConfigureAwait(false);
        if (res.StatusCode == System.Net.HttpStatusCode.NotFound) throw new ArxivNotFoundException(id);
        res.EnsureSuccessStatusCode();

        if (res.Content.Headers.ContentLength is > MaxPdfBytes)
            throw new InvalidOperationException($"arXiv PDF for '{id}' exceeds the {MaxPdfBytes / 1_000_000} MB limit.");
        var mediaType = res.Content.Headers.ContentType?.MediaType;
        if (mediaType is not null && !mediaType.Equals("application/pdf", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"arXiv returned '{mediaType}' instead of a PDF for '{id}'.");

        var bytes = await res.Content.ReadAsByteArrayAsync(ct).ConfigureAwait(false);
        if (bytes.Length > MaxPdfBytes)
            throw new InvalidOperationException($"arXiv PDF for '{id}' exceeds the {MaxPdfBytes / 1_000_000} MB limit.");
        _logger.LogInformation("Downloaded arXiv PDF {ArxivId} ({Bytes} bytes)", id, bytes.Length);
        return bytes;
    }

    public static PaperMetadata ToMetadata(ArxivPaper paper) => new(paper.Title, paper.Authors, paper.Year);

    // arXiv titles and names contain line breaks and runs of spaces.
    private static string Collapse(string? text) =>
        string.IsNullOrWhiteSpace(text) ? string.Empty : Regex.Replace(text, @"\s+", " ").Trim();

    // Generic client name only: no personal or project-identifying details go to arXiv.
    public static void Configure(HttpClient client)
    {
        client.Timeout = TimeSpan.FromSeconds(90);
        client.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("LIBRAIN-research-software", "1.0"));
    }
}
