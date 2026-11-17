using System.Text.RegularExpressions;
using LIBRAIN.Agents;
using LIBRAIN.Ingestion;
using LIBRAIN.Storage;

namespace LIBRAIN.Endpoints;

public sealed record ArxivIngestRequest(string ArxivId);

public static partial class PaperEndpoints
{
    // Paper ids become Qdrant payload keys, URL segments and prompt text, so keep them
    // to a conservative character set (arXiv ids and kebab-case stems both fit).
    [GeneratedRegex(@"^[A-Za-z0-9][A-Za-z0-9._\-]{0,127}$")]
    private static partial Regex SafePaperId();

    public static void MapPaperEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/api/papers", async (IPaperStore store, CancellationToken ct) =>
            Results.Ok(await store.ListPapersAsync(ct)));

        app.MapPost("/api/papers/ingest", IngestUploadAsync).DisableAntiforgery();
        app.MapPost("/api/papers/arxiv", IngestArxivAsync);
        app.MapDelete("/api/papers/{paperId}", DeleteAsync);
    }

    private static async Task<IResult> IngestUploadAsync(
        IFormFile file, ReaderAgent reader, ILogger<ReaderAgent> logger, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            return Problem(StatusCodes.Status400BadRequest, "file is required", "Upload a PDF in the multipart field 'file'.");

        var paperId = Path.GetFileNameWithoutExtension(file.FileName);
        if (!SafePaperId().IsMatch(paperId ?? string.Empty))
            return Problem(StatusCodes.Status400BadRequest, "invalid file name",
                "The file name (without .pdf) becomes the paper id: use letters, digits, '.', '_' or '-' (max 128).");

        await using var stream = file.OpenReadStream();
        return await IngestAsync(() => reader.IngestAsync(stream, paperId!, ct), paperId!, logger);
    }

    private static async Task<IResult> IngestArxivAsync(
        ArxivIngestRequest req, ArxivClient arxiv, ReaderAgent reader, ILogger<ReaderAgent> logger, CancellationToken ct)
    {
        if (!ArxivClient.TryNormalizeId(req.ArxivId, out var id))
            return Problem(StatusCodes.Status400BadRequest, "invalid arXiv id",
                "Use a new-style id such as 2005.11401 (a version suffix, 'arXiv:' prefix or abs/pdf URL is fine).");

        try
        {
            var paper = await arxiv.GetMetadataAsync(id, ct);
            var pdf = await arxiv.DownloadPdfAsync(id, ct);
            await using var stream = new MemoryStream(pdf, writable: false);
            return await IngestAsync(() => reader.IngestAsync(stream, id, ct, ArxivClient.ToMetadata(paper)), id, logger);
        }
        catch (ArxivNotFoundException ex)
        {
            return Problem(StatusCodes.Status404NotFound, "arXiv paper not found", ex.Message);
        }
        catch (HttpRequestException ex)
        {
            logger.LogWarning(ex, "arXiv request failed for {ArxivId}", id);
            return Problem(StatusCodes.Status502BadGateway, "arXiv unavailable", $"Could not reach arXiv: {ex.Message}");
        }
    }

    private static async Task<IResult> IngestAsync(Func<Task<IngestResult>> ingest, string paperId, ILogger logger)
    {
        try
        {
            var result = await ingest();
            return result.ChunkCount == 0
                ? Problem(StatusCodes.Status422UnprocessableEntity, "no text extracted",
                    $"'{paperId}' produced no text chunks (scanned PDFs without a text layer are not supported yet).")
                : Results.Ok(result);
        }
        catch (Exception ex) when (ex is UglyToad.PdfPig.Core.PdfDocumentFormatException or InvalidDataException)
        {
            return Problem(StatusCodes.Status400BadRequest, "unreadable PDF", $"'{paperId}' could not be parsed as a PDF.");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Ingest failed for {PaperId}", paperId);
            return Problem(StatusCodes.Status502BadGateway, "ingest failed", $"Embedding or storage failed: {ex.GetType().Name}");
        }
    }

    private static async Task<IResult> DeleteAsync(string paperId, IPaperStore store, CancellationToken ct)
    {
        if (!SafePaperId().IsMatch(paperId))
            return Problem(StatusCodes.Status400BadRequest, "invalid paper id", "Paper ids use letters, digits, '.', '_' or '-'.");
        var removed = await store.DeletePaperAsync(paperId, ct);
        return removed == 0
            ? Problem(StatusCodes.Status404NotFound, "paper not found", $"No chunks stored for '{paperId}'.")
            : Results.NoContent();
    }

    private static IResult Problem(int status, string title, string detail) =>
        Results.Problem(title: title, detail: detail, statusCode: status);
}
