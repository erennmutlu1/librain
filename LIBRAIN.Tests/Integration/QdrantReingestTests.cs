using LIBRAIN.Models;
using LIBRAIN.Storage;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Qdrant.Client;

namespace LIBRAIN.Tests.Integration;

// Opt-in: runs only when LIBRAIN_QDRANT_TEST_HOST points at a disposable Qdrant
// (e.g. `docker compose up qdrant` → LIBRAIN_QDRANT_TEST_HOST=localhost). Uses a
// throwaway collection with synthetic vectors, so no embedding/API calls are made,
// and deletes the collection afterwards.
public sealed class QdrantReingestTests
{
    private static string? Host => Environment.GetEnvironmentVariable("LIBRAIN_QDRANT_TEST_HOST");

    private static ChunkRecord Chunk(string paperId, int index) => new(
        paperId, index, $"chunk {index}",
        Enumerable.Range(0, 1536).Select(i => (float)Math.Sin(i + index)).ToArray(),
        "Test paper", null, null, null, null, DateTime.UtcNow);

    [Fact]
    public async Task Reingest_WithFewerChunks_RemovesStaleTail()
    {
        Assert.SkipWhen(string.IsNullOrWhiteSpace(Host), "Set LIBRAIN_QDRANT_TEST_HOST to run Qdrant integration tests.");
        var ct = TestContext.Current.CancellationToken;
        var collection = $"librain_test_{Guid.NewGuid():N}";
        using var client = new QdrantClient(Host!, 6334);
        var store = new QdrantPaperRepository(
            NullLogger<QdrantPaperRepository>.Instance, client,
            Options.Create(new QdrantOptions { Host = Host!, CollectionName = collection }));
        try
        {
            await store.PersistAsync(Enumerable.Range(0, 5).Select(i => Chunk("paper-x", i)).ToArray(), ct);
            await store.PersistAsync(new[] { Chunk("other-paper", 0), Chunk("other-paper", 1) }, ct);
            Assert.Equal(5, (await store.ListPapersAsync(ct)).Single(p => p.PaperId == "paper-x").ChunkCount);

            // Re-ingest a shorter version of the same paper.
            await store.PersistAsync(Enumerable.Range(0, 3).Select(i => Chunk("paper-x", i)).ToArray(), ct);

            var papers = await store.ListPapersAsync(ct);
            Assert.Equal(3, papers.Single(p => p.PaperId == "paper-x").ChunkCount);
            Assert.Equal(2, papers.Single(p => p.PaperId == "other-paper").ChunkCount); // untouched
        }
        finally
        {
            if (await client.CollectionExistsAsync(collection, ct)) await client.DeleteCollectionAsync(collection, cancellationToken: ct);
        }
    }
}
