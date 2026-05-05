namespace LIBRAIN.Agents;

public sealed record IngestResult(string PaperId, int ChunkCount, Guid CorrelationId);
