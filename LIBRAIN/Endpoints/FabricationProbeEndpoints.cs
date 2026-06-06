using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using LIBRAIN.Agents;
using LIBRAIN.Embeddings;
using LIBRAIN.Generation;
using LIBRAIN.Storage;

namespace LIBRAIN.Endpoints;

// RQ3 fabrication probe. Retrieves, generates ONE response from the chosen provider,
// and resolves the cited papers/chunks against the retrieval set IN C# — no LLM
// evaluator calls. This is the model-agnostic fabrication-measurement surface: the
// same generation yields both the contract-off count (fabricated, what Naive-RAG
// surfaces) and the contract-on count (dropped, what LIBRAIN removes). Lets the whole
// experiment run on OpenAI with zero Anthropic dependency.
public sealed record FabricationProbeRequest(
    string Provider,        // "openai" (Anthropic uses the regular /api/naive-rag + /api/discover)
    string Model,           // e.g. "gpt-4o-mini", "gpt-4o"
    string TopicA,
    string? TopicB,
    int? TopK,
    string? CitationMode);  // "structured" | "free-text"

public sealed record FabricationProbeResponse(
    Guid CorrelationId,
    string Provider,
    string Model,
    string CitationMode,
    string Hypothesis,
    int RetrievedChunkCount,
    int ClaimedCount,
    int ResolvedCount,
    int FabricatedCount);

public static class FabricationProbeEndpoints
{
    private const int DefaultTopK = 5;

    private const string FreeTextSystem = """
        You are a scientific research assistant. Given one or two topics and a numbered
        list of source excerpts, propose a single hypothesis (1–3 sentences). Cite your
        sources INLINE using square brackets with the paper_id, optionally a chunk index,
        e.g. "[2005.11401]" or "[2005.11401:4]". Support every claim with a citation.
        Respond with the hypothesis text only.
        """;

    private const string StructuredSystem = """
        You are a scientific research assistant. Given one or two topics and a numbered
        list of source excerpts, propose a single hypothesis (1–3 sentences) and cite the
        chunks that support it. Respond with ONLY a JSON object of the form:
        {"hypothesis": "...", "claimed_citations": [{"paper_id": "...", "chunk_index": 0}]}
        """;

    public static void MapFabricationProbeEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/fabrication-probe", HandleAsync);
    }

    private static async Task<IResult> HandleAsync(
        FabricationProbeRequest req,
        OpenAIEmbeddingClient embeddings,
        QdrantPaperRepository repo,
        OpenAIChatClient openai,
        ILogger<Program> logger,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(req.TopicA))
            return Results.Problem(title: "topicA is required", statusCode: StatusCodes.Status400BadRequest);
        if (!string.Equals(req.Provider, "openai", StringComparison.OrdinalIgnoreCase))
            return Results.Problem(title: "unsupported provider",
                detail: "fabrication-probe currently supports provider='openai'.",
                statusCode: StatusCodes.Status400BadRequest);

        var corrId = Guid.NewGuid();
        var topK = req.TopK ?? DefaultTopK;
        var freeText = string.Equals(req.CitationMode, "free-text", StringComparison.OrdinalIgnoreCase);
        var topicA = req.TopicA.Trim();
        var topicB = string.IsNullOrWhiteSpace(req.TopicB) ? null : req.TopicB!.Trim();

        var sw = Stopwatch.StartNew();
        try
        {
            // Retrieval (identical to the agents): embed topics, search, dedup.
            var topicTexts = topicB is null ? new[] { topicA } : new[] { topicA, topicB };
            var topicEmbeddings = await embeddings.GenerateAsync(topicTexts, ct);
            var hitsA = await repo.VectorSearchAsync(topicEmbeddings[0], topK, ct);
            var hitsB = topicB is null
                ? Array.Empty<SearchHit>()
                : await repo.VectorSearchAsync(topicEmbeddings[1], topK, ct);

            var seenKeys = new HashSet<(string PaperId, int ChunkIndex)>();
            var dedup = new List<SearchHit>(hitsA.Count + hitsB.Count);
            foreach (var h in hitsA) if (seenKeys.Add((h.PaperId, h.ChunkIndex))) dedup.Add(h);
            foreach (var h in hitsB) if (seenKeys.Add((h.PaperId, h.ChunkIndex))) dedup.Add(h);
            if (dedup.Count == 0)
                return Results.Problem(title: "no sources retrieved", statusCode: StatusCodes.Status400BadRequest);

            var retrievedPaperIds = new HashSet<string>(dedup.Select(h => h.PaperId));
            var userPrompt = BuildUserPrompt(topicA, topicB, dedup);

            var (text, inTok, outTok) = await openai.CompleteAsync(
                freeText ? FreeTextSystem : StructuredSystem, userPrompt, req.Model, 0.2f, ct);

            string hypothesis;
            int claimed, fabricated, resolved;
            if (freeText)
            {
                hypothesis = text;
                var cites = NaiveRagCitations.ParseFreeTextCitations(text);
                var (res, fab) = NaiveRagCitations.ResolveFreeText(cites, seenKeys, retrievedPaperIds);
                claimed = res.Count; fabricated = fab; resolved = claimed - fab;
            }
            else
            {
                var json = NaiveRagCitations.ExtractJsonObject(text);
                var node = json is null ? null : JsonNode.Parse(json);
                hypothesis = node?["hypothesis"]?.GetValue<string>() ?? text;
                var parsed = new List<(string, int)>();
                foreach (var c in node?["claimed_citations"]?.AsArray() ?? new JsonArray())
                {
                    var pid = c?["paper_id"]?.GetValue<string>();
                    var ci = c?["chunk_index"]?.GetValue<int>();
                    if (pid is not null && ci is not null) parsed.Add((pid, ci.Value));
                }
                var (res, fab) = NaiveRagCitations.Resolve(parsed, seenKeys);
                claimed = res.Count; fabricated = fab; resolved = claimed - fab;
            }

            logger.LogInformation(
                "Fabrication-probe ({Provider}/{Model}, {Mode}): claimed={Claimed} resolved={Resolved} fabricated={Fabricated} retrieved={Retrieved} in {Ms}ms (corr={Corr}) in={In} out={Out}",
                req.Provider, req.Model, freeText ? "free-text" : "structured",
                claimed, resolved, fabricated, dedup.Count, sw.ElapsedMilliseconds, corrId, inTok, outTok);

            return Results.Ok(new FabricationProbeResponse(
                corrId, req.Provider, req.Model, freeText ? "free-text" : "structured",
                hypothesis, dedup.Count, claimed, resolved, fabricated));
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            logger.LogError(ex, "Fabrication-probe failed ({Type}) in {Ms}ms", ex.GetType().Name, sw.ElapsedMilliseconds);
            return Results.Problem(
                title: "fabrication-probe failed",
                detail: $"{ex.GetType().Name}: {ex.Message}",
                statusCode: StatusCodes.Status502BadGateway);
        }
    }

    private static string BuildUserPrompt(string topicA, string? topicB, IReadOnlyList<SearchHit> chunks)
    {
        var sb = new StringBuilder();
        sb.Append("TOPIC A: ").AppendLine(topicA);
        if (topicB is not null) sb.Append("TOPIC B: ").AppendLine(topicB);
        sb.AppendLine();
        sb.AppendLine("SOURCES (cite by paper_id + chunk_index):");
        foreach (var c in chunks)
        {
            sb.Append("[paper_id=").Append(c.PaperId).Append(" chunk_index=").Append(c.ChunkIndex);
            if (c.Section is not null) sb.Append(" | ").Append(c.Section);
            sb.AppendLine("]");
            sb.AppendLine(c.Content);
            sb.AppendLine();
        }
        return sb.ToString();
    }
}
