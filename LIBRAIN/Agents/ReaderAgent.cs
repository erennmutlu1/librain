using System.Diagnostics;
using LIBRAIN.Embeddings;
using LIBRAIN.Reading;
using LIBRAIN.Storage;

namespace LIBRAIN.Agents;

public sealed class ReaderAgent(
    ILogger<ReaderAgent> logger,
    PdfTextExtractor extractor,
    RecursiveChunker chunker,
    OpenAIEmbeddingClient embeddings,
    QdrantPaperRepository repository)
{
    private readonly ILogger<ReaderAgent> _logger = logger;
    private readonly PdfTextExtractor _extractor = extractor;
    private readonly RecursiveChunker _chunker = chunker;
    private readonly OpenAIEmbeddingClient _embeddings = embeddings;
    private readonly QdrantPaperRepository _repository = repository;

    public async Task<IngestResult> IngestAsync(
        Stream pdfStream,
        string paperId,
        CancellationToken ct = default)
    {
        var correlationId = Guid.NewGuid();
        using var scope = _logger.BeginScope(new Dictionary<string, object>
        {
            ["correlationId"] = correlationId,
            ["paperId"] = paperId,
        });

        var sw = Stopwatch.StartNew();
        _logger.LogInformation("Ingest started for {PaperId}", paperId);

        var doc = _extractor.Extract(pdfStream);
        var chunks = _chunker.Chunk(doc.FullText, doc.Pages);
        if (chunks.Count == 0)
        {
            _logger.LogWarning("No chunks produced; nothing to persist");
            return new IngestResult(paperId, 0, correlationId);
        }

        var contents = chunks.Select(c => c.Content).ToArray();
        var vectors = await _embeddings.GenerateAsync(contents, ct);

        var title = string.IsNullOrWhiteSpace(doc.Title) ? paperId : doc.Title;
        var ingestedAt = DateTime.UtcNow;
        var records = new ChunkRecord[chunks.Count];
        for (int i = 0; i < chunks.Count; i++)
        {
            var c = chunks[i];
            records[i] = new ChunkRecord(
                PaperId: paperId,
                ChunkIndex: c.ChunkIndex,
                Content: c.Content,
                Embedding: vectors[i],
                Title: title,
                Authors: doc.Authors,
                Year: doc.Year,
                Section: c.Section,
                PageNumber: c.PageNumber,
                IngestedAt: ingestedAt);
        }

        await _repository.PersistAsync(records, ct);

        _logger.LogInformation(
            "Ingest completed: {ChunkCount} chunks in {ElapsedMs}ms",
            chunks.Count,
            sw.ElapsedMilliseconds);

        return new IngestResult(paperId, chunks.Count, correlationId);
    }
}
