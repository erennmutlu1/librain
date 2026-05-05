using System.Diagnostics;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Qdrant.Client;
using Qdrant.Client.Grpc;

namespace LIBRAIN.Storage;

public sealed class QdrantPaperRepository
{
    private const string CollectionName = "librain_chunks";
    private const ulong VectorSize = 1536;

    // LIBRAIN chunk identity namespace (RFC 4122 v5, project-private).
    private static readonly Guid ChunkNamespace = Guid.Parse("e0fb56f3-2b60-402e-a9f7-e45fa320a1a2");

    private readonly ILogger<QdrantPaperRepository> _logger;
    private readonly QdrantClient _client;
    private readonly Lazy<Task> _initialization;

    public QdrantPaperRepository(
        ILogger<QdrantPaperRepository> logger,
        QdrantClient client)
    {
        _logger = logger;
        _client = client;
        _initialization = new Lazy<Task>(InitializeAsync);
    }

    public async Task PersistAsync(IReadOnlyList<ChunkRecord> chunks, CancellationToken ct = default)
    {
        if (chunks.Count == 0)
        {
            return;
        }

        await _initialization.Value.ConfigureAwait(false);

        var sw = Stopwatch.StartNew();
        var points = new PointStruct[chunks.Count];
        for (int i = 0; i < chunks.Count; i++)
        {
            points[i] = ToPoint(chunks[i]);
        }

        // Qdrant has no documented per-upsert point limit; gRPC default message size (~100MB)
        // is the practical bound. ~50 chunks/paper × 1536 floats × 4 bytes ≈ 312KB, well under.
        await _client.UpsertAsync(CollectionName, points, cancellationToken: ct).ConfigureAwait(false);

        _logger.LogInformation(
            "Persisted {ChunkCount} chunk(s) in {ElapsedMs}ms",
            points.Length,
            sw.ElapsedMilliseconds);
    }

    public async Task<IReadOnlyList<SearchHit>> VectorSearchAsync(
        float[] queryEmbedding,
        int topK,
        CancellationToken ct = default)
    {
        await _initialization.Value.ConfigureAwait(false);

        var sw = Stopwatch.StartNew();
        var results = await _client.SearchAsync(
            collectionName: CollectionName,
            vector: queryEmbedding,
            limit: (ulong)topK,
            payloadSelector: true,
            cancellationToken: ct).ConfigureAwait(false);

        var hits = new SearchHit[results.Count];
        for (int i = 0; i < results.Count; i++)
        {
            var p = results[i];
            hits[i] = new SearchHit(
                PaperId: p.Payload["paperId"].StringValue,
                ChunkIndex: (int)p.Payload["chunkIndex"].IntegerValue,
                Content: p.Payload["content"].StringValue,
                Score: p.Score,
                Section: p.Payload.TryGetValue("section", out var s) ? s.StringValue : null,
                PageNumber: p.Payload.TryGetValue("pageNumber", out var pg) ? (int?)pg.IntegerValue : null);
        }

        _logger.LogInformation(
            "Returned {HitCount} hit(s) in {ElapsedMs}ms",
            hits.Length,
            sw.ElapsedMilliseconds);
        return hits;
    }

    public async Task<IReadOnlyList<PaperSummary>> ListPapersAsync(CancellationToken ct = default)
    {
        await _initialization.Value.ConfigureAwait(false);

        var sw = Stopwatch.StartNew();
        var byPaperId = new Dictionary<string, (string? Title, int Count, DateTime? Earliest)>();

        PointId? offset = null;
        const uint pageSize = 256;
        while (true)
        {
            var page = await _client.ScrollAsync(
                collectionName: CollectionName,
                limit: pageSize,
                offset: offset!,
                payloadSelector: true,
                vectorsSelector: false,
                cancellationToken: ct).ConfigureAwait(false);

            foreach (var point in page.Result)
            {
                if (!point.Payload.TryGetValue("paperId", out var idVal))
                {
                    continue;
                }
                var paperId = idVal.StringValue;
                var title = point.Payload.TryGetValue("title", out var t) ? t.StringValue : null;
                DateTime? ingestedAt = null;
                if (point.Payload.TryGetValue("ingestedAt", out var ia)
                    && DateTime.TryParse(
                        ia.StringValue,
                        CultureInfo.InvariantCulture,
                        DateTimeStyles.RoundtripKind,
                        out var parsed))
                {
                    ingestedAt = parsed;
                }

                if (byPaperId.TryGetValue(paperId, out var existing))
                {
                    var earliest = ingestedAt is not null
                        && (existing.Earliest is null || ingestedAt < existing.Earliest)
                            ? ingestedAt
                            : existing.Earliest;
                    byPaperId[paperId] = (existing.Title ?? title, existing.Count + 1, earliest);
                }
                else
                {
                    byPaperId[paperId] = (title, 1, ingestedAt);
                }
            }

            if (page.NextPageOffset is null)
            {
                break;
            }
            offset = page.NextPageOffset;
        }

        var summaries = byPaperId
            .Select(kv => new PaperSummary(kv.Key, kv.Value.Title, kv.Value.Count, kv.Value.Earliest))
            .ToList();

        _logger.LogInformation(
            "Listed {PaperCount} paper(s) ({ChunkCount} total chunks) in {ElapsedMs}ms",
            summaries.Count,
            summaries.Sum(p => p.ChunkCount),
            sw.ElapsedMilliseconds);
        return summaries;
    }

    private async Task InitializeAsync()
    {
        if (await _client.CollectionExistsAsync(CollectionName).ConfigureAwait(false))
        {
            return;
        }

        await _client.CreateCollectionAsync(
            collectionName: CollectionName,
            vectorsConfig: new VectorParams { Size = VectorSize, Distance = Distance.Cosine })
            .ConfigureAwait(false);

        _logger.LogInformation(
            "Provisioned Qdrant collection '{Collection}' (size={VectorSize}, distance=Cosine)",
            CollectionName,
            VectorSize);
    }

    private static PointStruct ToPoint(ChunkRecord chunk)
    {
        var id = UuidV5(ChunkNamespace, $"{chunk.PaperId}-{chunk.ChunkIndex}");
        var point = new PointStruct
        {
            Id = id,
            Vectors = chunk.Embedding,
        };

        point.Payload["paperId"] = chunk.PaperId;
        point.Payload["chunkIndex"] = chunk.ChunkIndex;
        point.Payload["content"] = chunk.Content;
        point.Payload["ingestedAt"] = chunk.IngestedAt.ToString("O", CultureInfo.InvariantCulture);
        if (chunk.Title is not null) point.Payload["title"] = chunk.Title;
        if (chunk.Year is not null) point.Payload["year"] = chunk.Year.Value;
        if (chunk.Section is not null) point.Payload["section"] = chunk.Section;
        if (chunk.PageNumber is not null) point.Payload["pageNumber"] = chunk.PageNumber.Value;
        if (chunk.Authors is { Count: > 0 })
        {
            var list = new ListValue();
            foreach (var a in chunk.Authors) list.Values.Add(a);
            point.Payload["authors"] = new Value { ListValue = list };
        }

        return point;
    }

    // RFC 4122 §4.3: UUID v5 = SHA-1(namespace || name), set version=5, variant=10xx.
    private static Guid UuidV5(Guid namespaceId, string name)
    {
        Span<byte> ns = stackalloc byte[16];
        namespaceId.TryWriteBytes(ns);
        SwapEndian(ns); // Guid stores fields little-endian; RFC needs big-endian

        var nameBytes = Encoding.UTF8.GetBytes(name);
        var input = new byte[16 + nameBytes.Length];
        ns.CopyTo(input);
        nameBytes.CopyTo(input.AsSpan(16));

        Span<byte> hash = stackalloc byte[20];
        SHA1.HashData(input, hash);

        Span<byte> g = stackalloc byte[16];
        hash[..16].CopyTo(g);
        g[6] = (byte)((g[6] & 0x0F) | 0x50); // version 5
        g[8] = (byte)((g[8] & 0x3F) | 0x80); // RFC 4122 variant
        SwapEndian(g);
        return new Guid(g);
    }

    private static void SwapEndian(Span<byte> guid)
    {
        (guid[0], guid[3]) = (guid[3], guid[0]);
        (guid[1], guid[2]) = (guid[2], guid[1]);
        (guid[4], guid[5]) = (guid[5], guid[4]);
        (guid[6], guid[7]) = (guid[7], guid[6]);
    }
}
