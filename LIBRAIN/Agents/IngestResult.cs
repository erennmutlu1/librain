namespace LIBRAIN.Agents;

public sealed record IngestResult(string PaperId, int ChunkCount, Guid CorrelationId, string? Title = null);

// Bibliographic metadata from an authoritative source (e.g. the arXiv API). When given,
// it replaces what the PDF's Info dictionary says, which in arXiv PDFs is usually empty
// and whose date is the PDF build date, not the publication year.
public sealed record PaperMetadata(string? Title, IReadOnlyList<string>? Authors, int? Year);
