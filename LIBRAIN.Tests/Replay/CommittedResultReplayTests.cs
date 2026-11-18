using System.Text.Json;
using System.Text.Json.Nodes;
using LIBRAIN.Agents;
using LIBRAIN.Endpoints;
using LIBRAIN.Models;
using LIBRAIN.Retrieval;
using LIBRAIN.Storage;
using LIBRAIN.Tests.Fixtures;
using LIBRAIN.Tests.Pipeline;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace LIBRAIN.Tests.Replay;

// Replays the 30 committed Discovery outputs (experiments/discovery-openai/pair-*.json,
// real gpt-4o runs on the pre-registered topic pairs) through TODAY's pipeline code.
// The fake LLM returns exactly what the model returned then; the fake store returns the
// cited chunks and the committed nearest-neighbour similarity. If the contract, the
// claim-risk aggregation or the scoring math drifts, these numbers stop matching.
public sealed class CommittedResultReplayTests
{
    public static TheoryData<string> PairIds()
    {
        var data = new TheoryData<string>();
        foreach (var f in Directory.GetFiles(RealData.RepoFile("experiments", "discovery-openai"), "pair-*.json").Order())
            data.Add(Path.GetFileNameWithoutExtension(f));
        return data;
    }

    private static readonly JsonElement TopicPairs =
        JsonDocument.Parse(File.ReadAllText(RealData.RepoFile("experiments", "topic-pairs.json"))).RootElement.GetProperty("pairs");

    private static readonly string[] StatusNames = { "GROUNDED", "EXTRAPOLATED", "RISKY" };

    [Theory]
    [MemberData(nameof(PairIds))]
    public async Task CommittedDiscovery_ReplaysToTheSameScores(string pairId)
    {
        var committed = JsonNode.Parse(File.ReadAllText(RealData.RepoFile("experiments", "discovery-openai", $"{pairId}.json")))!;
        var topic = TopicPairs.EnumerateArray().Single(p => p.GetProperty("id").GetString() == pairId);

        // Retrieved set = every chunk the committed output cites (evidence + basis).
        var hits = new List<SearchHit>();
        void AddHit(string paperId, int chunkIndex, string? section = null, int? page = null)
        {
            if (!hits.Any(h => h.PaperId == paperId && h.ChunkIndex == chunkIndex))
                hits.Add(new SearchHit(paperId, chunkIndex, $"[{paperId}:{chunkIndex}]", 0.9f, section, page));
        }
        foreach (var e in committed["supportingEvidence"]!.AsArray())
            AddHit((string)e!["paperId"]!, (int)e["chunkIndex"]!, (string?)e["section"], (int?)e["pageNumber"]);
        foreach (var b in committed["extrapolationBasis"]!.AsArray())
            if (LlmJson.TryParseChunkKey((string?)b!["groundedInChunkId"], out var pid, out var ci)) AddHit(pid, ci);
        if (hits.Count == 0) hits.Add(new SearchHit("placeholder", 0, "x", 0.9f, null, null));

        var evaluation = committed["evaluation"]!;
        var llm = new FakeLlmClient()
            .OnTool("submit_discovery", _ => new JsonObject
            {
                ["hypothesis"] = (string)committed["hypothesis"]!,
                ["novel_claim"] = (string)committed["novelClaim"]!,
                ["reasoning"] = (string?)committed["reasoning"],
                ["supporting_evidence"] = new JsonArray(committed["supportingEvidence"]!.AsArray().Select(e => (JsonNode)new JsonObject
                {
                    ["paper_id"] = (string)e!["paperId"]!, ["chunk_index"] = (int)e["chunkIndex"]!, ["support_type"] = (string)e["supportType"]!,
                }).ToArray()),
                ["extrapolation_basis"] = new JsonArray(committed["extrapolationBasis"]!.AsArray().Select(b => (JsonNode)new JsonObject
                {
                    ["claim_sentence"] = (string)b!["claimSentence"]!, ["basis_type"] = (string)b["basisType"]!,
                    ["grounded_in_chunk_id"] = (string?)b["groundedInChunkId"], ["rationale"] = (string)b["rationale"]!,
                }).ToArray()),
            })
            .OnTool("submit_claim_validation", _ => new JsonObject
            {
                ["claims"] = new JsonArray(committed["claimValidation"]!["claims"]!.AsArray().Select(c => (JsonNode)new JsonObject
                {
                    ["sentence"] = (string)c!["sentence"]!, ["factuality_status"] = StatusNames[(int)c["status"]!],
                    ["factual_hallucination_probability"] = (double)c["factualHallucinationProbability"]!,
                    ["supporting_chunks"] = new JsonArray(c["supportingChunks"]!.AsArray().Select(x => (JsonNode)(string)x!).ToArray()),
                    ["rationale"] = (string)c["rationale"]!,
                }).ToArray()),
                ["aggregate_risk"] = 0.0,
            })
            .OnTool("submit_discovery_evaluation", _ => new JsonObject
            {
                ["plausibility"] = (double)evaluation["plausibilityScore"]!,
                ["structural_coherence"] = (double)evaluation["structuralCoherenceScore"]!,
                ["rationale"] = "replayed",
            });

        var store = new FakePaperStore(hits, Array.Empty<SearchHit>(), nearestSimilarity: 1f - (float)evaluation["noveltyScore"]!);
        var embeddings = new FakeEmbeddings();
        var agent = new DiscoveryAgent(
            NullLogger<DiscoveryAgent>.Instance, llm, new TopicRetriever(embeddings, store),
            new NoveltyScorer(NullLogger<NoveltyScorer>.Instance, embeddings, store),
            new DiscoveryEvaluatorAgent(NullLogger<DiscoveryEvaluatorAgent>.Instance, llm),
            new ClaimValidatorAgent(NullLogger<ClaimValidatorAgent>.Instance, llm),
            Options.Create(new ModelOptions()));

        var replay = await agent.DiscoverAsync(
            new DiscoverRequest(topic.GetProperty("topicA").GetString()!, topic.GetProperty("topicB").GetString(), 5),
            TestContext.Current.CancellationToken);

        Assert.Equal((float)evaluation["qualityScore"]!, replay.Evaluation.QualityScore, precision: 5);
        Assert.Equal((float)evaluation["noveltyScore"]!, replay.Evaluation.NoveltyScore, precision: 5);
        Assert.Equal((float)committed["claimValidation"]!["aggregateRisk"]!, replay.ClaimValidation.AggregateRisk, precision: 5);
        Assert.False(replay.ClaimValidation.ValidationFailed);
        Assert.Equal(
            committed["supportingEvidence"]!.AsArray().Select(e => $"{e!["paperId"]}:{e["chunkIndex"]}"),
            replay.SupportingEvidence.Select(e => $"{e.PaperId}:{e.ChunkIndex}"));
        Assert.Equal(0, replay.DroppedEvidenceCount);
        Assert.Equal(
            committed["extrapolationBasis"]!.AsArray().Select(b => (string)b!["basisType"]!),
            replay.ExtrapolationBasis.Select(b => b.BasisType));
    }
}

// The RQ3 free-text parser, run over every committed free-text answer.
public sealed class CommittedFabricationReplayTests
{
    public static TheoryData<string> FreeTextFiles()
    {
        var data = new TheoryData<string>();
        foreach (var f in Directory.GetFiles(RealData.RepoFile("experiments", "fabrication-delta"), "*free-text*.json").Order())
            data.Add(Path.GetFileName(f));
        return data;
    }

    [Theory]
    [MemberData(nameof(FreeTextFiles))]
    public void Parser_ClaimsTheSameNumberOfCitationsAsCommitted(string file)
    {
        var committed = JsonNode.Parse(File.ReadAllText(RealData.RepoFile("experiments", "fabrication-delta", file)))!;

        var parsed = NaiveRagCitations.ParseFreeTextCitations((string?)committed["hypothesis"] ?? string.Empty);

        Assert.Equal((int)committed["claimedCount"]!, parsed.Count);
    }

    // The two committed answers where the model echoed the prompt's source-header
    // format: they are citations of deepdta chunk 0, not of a paper named
    // "paper_id=deepdta chunk_index=0" (which the old parser counted as fabricated).
    [Theory]
    [InlineData("pair-01-probe-none-free-text-gpt-4o-mini-starved.json")]
    [InlineData("pair-01-probe-aggressive-free-text-gpt-4o-mini-starved.json")]
    public void EchoedHeaderCitation_ParsesToDeepdtaChunk0(string file)
    {
        var committed = JsonNode.Parse(File.ReadAllText(RealData.RepoFile("experiments", "fabrication-delta", file)))!;
        Assert.Contains(("deepdta", (int?)0), NaiveRagCitations.ParseFreeTextCitations((string)committed["hypothesis"]!));
    }
}
