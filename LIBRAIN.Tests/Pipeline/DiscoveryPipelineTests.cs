using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using LIBRAIN.Agents;
using LIBRAIN.Embeddings;
using LIBRAIN.Endpoints;
using LIBRAIN.Llm;
using LIBRAIN.Models;
using LIBRAIN.Retrieval;
using LIBRAIN.Storage;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace LIBRAIN.Tests.Pipeline;

// Fakes for the three external dependencies. Nothing here touches the network.
internal sealed class FakeLlmClient : ILlmClient
{
    private readonly Dictionary<string, Func<LlmRequest, JsonNode>> _toolReplies = new();
    public ConcurrentQueue<(LlmRequest Request, string? Tool)> Calls { get; } = new();

    public FakeLlmClient OnTool(string toolName, string json) => OnTool(toolName, _ => JsonNode.Parse(json)!);

    public FakeLlmClient OnTool(string toolName, Func<LlmRequest, JsonNode> reply)
    {
        _toolReplies[toolName] = reply;
        return this;
    }

    public Task<LlmToolCallResult> CallToolAsync(LlmRequest request, LlmTool tool, CancellationToken ct = default)
    {
        Calls.Enqueue((request, tool.Name));
        if (!_toolReplies.TryGetValue(tool.Name, out var reply))
            throw new InvalidOperationException($"FakeLlmClient: no reply scripted for tool '{tool.Name}'.");
        return Task.FromResult(new LlmToolCallResult(reply(request), new LlmUsage(100, 50, 0, 0), "tool_use"));
    }

    public Task<LlmTextResult> CompleteAsync(LlmRequest request, CancellationToken ct = default)
    {
        Calls.Enqueue((request, null));
        return Task.FromResult(new LlmTextResult("A plain-text hypothesis.", new LlmUsage(100, 20, 0, 0), "end_turn"));
    }
}

internal sealed class FakeEmbeddings : IEmbeddingClient
{
    public Task<IReadOnlyList<float[]>> GenerateAsync(IReadOnlyList<string> inputs, CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<float[]>>(inputs.Select((_, i) => new[] { (float)i }).ToArray());
}

// Vector 0 = topic A, vector 1 = topic B; any other query (novelty) gets the nearest chunk.
internal sealed class FakePaperStore(IReadOnlyList<SearchHit> hitsA, IReadOnlyList<SearchHit> hitsB, float nearestSimilarity = 0.6f) : IPaperStore
{
    public Task PersistAsync(IReadOnlyList<ChunkRecord> chunks, CancellationToken ct = default) => Task.CompletedTask;

    public Task<IReadOnlyList<SearchHit>> VectorSearchAsync(float[] queryEmbedding, int topK, CancellationToken ct = default)
    {
        if (topK == 1) return Task.FromResult<IReadOnlyList<SearchHit>>(new[] { hitsA[0] with { Score = nearestSimilarity } });
        return Task.FromResult(queryEmbedding[0] == 0f ? hitsA : hitsB);
    }

    public Task<IReadOnlyList<PaperSummary>> ListPapersAsync(CancellationToken ct = default) =>
        Task.FromResult<IReadOnlyList<PaperSummary>>(Array.Empty<PaperSummary>());
}

public sealed class DiscoveryPipelineTests
{
    private static readonly SearchHit[] HitsA =
    {
        new("graphcast", 1, "GraphCast forecasts weather with graph neural networks.", 0.91f, "Intro", 1),
        new("graphcast", 2, "Message passing over a multi-mesh.", 0.85f, "Method", 3),
    };

    private static readonly SearchHit[] HitsB =
    {
        new("graphcast", 2, "Message passing over a multi-mesh.", 0.80f, "Method", 3), // duplicate across topics
        new("alphafold", 7, "Structure prediction from sequence.", 0.88f, null, 5),
    };

    private const string Discovery = """
        {
          "hypothesis": "Mesh-based message passing could transfer to protein contact graphs.",
          "novel_claim": "Multi-mesh message passing may improve long-range contact prediction. It could reduce error.",
          "reasoning": "Both are graph problems.",
          "supporting_evidence": [
            {"paper_id": "graphcast", "chunk_index": "2", "support_type": "direct"},
            {"paper_id": "alphafold", "chunk_index": 7, "support_type": "analogy"},
            {"paper_id": "made-up-paper", "chunk_index": 0, "support_type": "direct"}
          ],
          "extrapolation_basis": [
            {"claim_sentence": "Multi-mesh message passing may improve long-range contact prediction.", "basis_type": "analogy", "grounded_in_chunk_id": "graphcast:2", "rationale": "mechanism transfer"},
            {"claim_sentence": "It could reduce error.", "basis_type": "pure_speculation", "grounded_in_chunk_id": null, "rationale": "untested"}
          ]
        }
        """;

    private const string Claims = """
        {
          "claims": [
            {"sentence": "Multi-mesh message passing may improve long-range contact prediction.", "factuality_status": "EXTRAPOLATED", "factual_hallucination_probability": 0.2, "supporting_chunks": [], "rationale": "hedged"},
            {"sentence": "It could reduce error.", "factuality_status": "EXTRAPOLATED", "factual_hallucination_probability": 0.15, "supporting_chunks": [], "rationale": "hedged"}
          ],
          "aggregate_risk": 0.2
        }
        """;

    private const string Judge = """{"plausibility": 0.7, "structural_coherence": 0.9, "rationale": "coherent"}""";

    private static DiscoveryAgent BuildAgent(FakeLlmClient llm, ModelOptions? models = null)
    {
        var store = new FakePaperStore(HitsA, HitsB);
        var embeddings = new FakeEmbeddings();
        return new DiscoveryAgent(
            NullLogger<DiscoveryAgent>.Instance,
            llm,
            new TopicRetriever(embeddings, store),
            new NoveltyScorer(NullLogger<NoveltyScorer>.Instance, embeddings, store),
            new DiscoveryEvaluatorAgent(NullLogger<DiscoveryEvaluatorAgent>.Instance, llm),
            new ClaimValidatorAgent(NullLogger<ClaimValidatorAgent>.Instance, llm),
            Options.Create(models ?? new ModelOptions()));
    }

    private static FakeLlmClient ScriptedLlm(string? claims = null, string? judge = null) => new FakeLlmClient()
        .OnTool("submit_discovery", Discovery)
        .OnTool("submit_claim_validation", claims ?? Claims)
        .OnTool("submit_discovery_evaluation", judge ?? Judge);

    private static DiscoverRequest Request => new("weather forecasting", "protein folding", TopK: 2);

    [Fact]
    public async Task Discover_EndToEnd_AppliesContractAndScores()
    {
        var llm = ScriptedLlm();

        var res = await BuildAgent(llm).DiscoverAsync(Request, TestContext.Current.CancellationToken);

        // Citation contract: the made-up paper is dropped and counted; "2" as a string still resolves.
        Assert.Equal(3, res.ClaimedEvidenceCount);
        Assert.Equal(1, res.DroppedEvidenceCount);
        Assert.Equal(new[] { "graphcast", "alphafold" }, res.SupportingEvidence.Select(e => e.PaperId));
        Assert.Equal(2, res.ExtrapolationBasis.Count);

        Assert.False(res.ClaimValidation.ValidationFailed);
        Assert.Equal(0.2f, res.ClaimValidation.AggregateRisk, precision: 5);

        // novelty = 1 - nearest similarity (0.6); quality = mean of the three axes.
        Assert.Equal(0.4f, res.Evaluation.NoveltyScore, precision: 5);
        Assert.Equal(0.7f, res.Evaluation.PlausibilityScore, precision: 5);
        Assert.Equal((0.4f + 0.7f + 0.9f) / 3f, res.Evaluation.QualityScore, precision: 5);
    }

    [Fact]
    public async Task Discover_SendsUnionOfBothTopicsOnce_InFirstSeenOrder()
    {
        var llm = ScriptedLlm();

        await BuildAgent(llm).DiscoverAsync(Request, TestContext.Current.CancellationToken);

        var prompt = llm.Calls.Single(c => c.Tool == "submit_discovery").Request.UserPrompt;
        var order = new[] { "[paper_id=graphcast chunk_index=1", "[paper_id=graphcast chunk_index=2", "[paper_id=alphafold chunk_index=7" }
            .Select(h => prompt.IndexOf(h, StringComparison.Ordinal)).ToArray();
        Assert.All(order, i => Assert.True(i >= 0));
        Assert.Equal(order.Order(), order);
        Assert.Single(System.Text.RegularExpressions.Regex.Matches(prompt, @"chunk_index=2\b"));
    }

    [Fact]
    public async Task Discover_UsesPinnedModels()
    {
        var llm = ScriptedLlm();

        await BuildAgent(llm, new ModelOptions { SynthesisModel = "synthesis-override" })
            .DiscoverAsync(Request, TestContext.Current.CancellationToken);

        var byTool = llm.Calls.ToDictionary(c => c.Tool!, c => c.Request);
        Assert.Equal("synthesis-override", byTool["submit_discovery"].Model);
        Assert.Equal(0.2m, byTool["submit_discovery"].Temperature);
        Assert.Equal(ModelSelection.JudgeModel, byTool["submit_claim_validation"].Model);
        Assert.Equal(ModelSelection.JudgeModel, byTool["submit_discovery_evaluation"].Model);
        Assert.Equal(0.0m, byTool["submit_discovery_evaluation"].Temperature);
    }

    [Fact]
    public async Task Discover_ValidatorReturnsNothingUsable_FailsClosed()
    {
        var llm = ScriptedLlm(claims: """{"claims": [], "aggregate_risk": 0.0}""");

        var res = await BuildAgent(llm).DiscoverAsync(Request, TestContext.Current.CancellationToken);

        Assert.True(res.ClaimValidation.ValidationFailed);
        Assert.Equal(1f, res.ClaimValidation.AggregateRisk);
    }

    [Fact]
    public async Task Discover_JudgeOmitsScore_FailsLoudly()
    {
        var llm = ScriptedLlm(judge: """{"structural_coherence": 0.9, "rationale": "no plausibility"}""");

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            BuildAgent(llm).DiscoverAsync(Request, TestContext.Current.CancellationToken));
        Assert.Contains("plausibility", ex.Message);
    }

    [Fact]
    public void Merge_DeduplicatesAcrossTopics_KeepingTopicAFirst()
    {
        var merged = TopicRetriever.Merge(HitsA, HitsB);

        Assert.Equal(
            new[] { ("graphcast", 1), ("graphcast", 2), ("alphafold", 7) },
            merged.Union.Select(h => (h.PaperId, h.ChunkIndex)));
        Assert.Equal(0.85f, merged.Union[1].Score); // topic A's copy wins
        Assert.Equal(3, merged.Keys.Count);
    }
}
