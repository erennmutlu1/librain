using System.Net;
using LIBRAIN.Ingestion;
using UglyToad.PdfPig.Content;
using UglyToad.PdfPig.Core;
using UglyToad.PdfPig.Fonts.Standard14Fonts;
using UglyToad.PdfPig.Writer;

namespace LIBRAIN.Tests.Fixtures;

// Real data used by tests: arXiv API responses captured from export.arxiv.org and the
// committed experiment outputs under experiments/. Nothing here is invented.
public static class RealData
{
    public static string Fixture(params string[] parts) =>
        File.ReadAllText(Path.Combine([AppContext.BaseDirectory, "Fixtures", .. parts]));

    public static string RagAtom => Fixture("arxiv", "atom-2005.11401.xml");
    public static string NotFoundAtom => Fixture("arxiv", "atom-not-found.xml");

    public static string RepoFile(params string[] parts) =>
        Path.Combine([LIBRAIN.Experiments.ExperimentPaths.RepoRoot, .. parts]);

    // A one-page PDF whose text layer is the real abstract of arXiv 2005.11401.
    public static byte[] RagAbstractPdf()
    {
        var abstractText = ArxivClient.ParseAtom(RagAtom, "2005.11401").Summary!;
        var builder = new PdfDocumentBuilder();
        var page = builder.AddPage(PageSize.A4);
        var font = builder.AddStandard14Font(Standard14Font.Helvetica);
        var y = 780.0;
        foreach (var line in Wrap(abstractText, 95))
        {
            page.AddText(line, 10, new PdfPoint(40, y), font);
            y -= 14;
        }
        return builder.Build();
    }

    private static IEnumerable<string> Wrap(string text, int width)
    {
        var line = new System.Text.StringBuilder();
        foreach (var word in text.Split(' ', StringSplitOptions.RemoveEmptyEntries))
        {
            if (line.Length + word.Length + 1 > width) { yield return line.ToString(); line.Clear(); }
            if (line.Length > 0) line.Append(' ');
            line.Append(word);
        }
        if (line.Length > 0) yield return line.ToString();
    }
}

// Plays export.arxiv.org and arxiv.org/pdf from the captured fixtures.
public sealed class FakeArxivHandler : HttpMessageHandler
{
    public int Requests { get; private set; }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Requests++;
        var url = request.RequestUri!.ToString();
        HttpResponseMessage res;
        if (url.Contains("id_list=2005.11401", StringComparison.Ordinal))
            res = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(RealData.RagAtom) };
        else if (url.Contains("id_list=", StringComparison.Ordinal))
            res = new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(RealData.NotFoundAtom) };
        else if (url.EndsWith("/pdf/2005.11401", StringComparison.Ordinal))
        {
            res = new HttpResponseMessage(HttpStatusCode.OK) { Content = new ByteArrayContent(RealData.RagAbstractPdf()) };
            res.Content.Headers.ContentType = new("application/pdf");
        }
        else res = new HttpResponseMessage(HttpStatusCode.NotFound);
        return Task.FromResult(res);
    }
}
