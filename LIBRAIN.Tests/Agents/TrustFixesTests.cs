using System.Text.Json.Nodes;
using LIBRAIN.Agents;
using LIBRAIN.Storage;

namespace LIBRAIN.Tests.Agents;

// Phase 0 trust fixes: model output that is malformed, partial or missing must be
// tolerated where the meaning is unambiguous and rejected loudly where it is not,
// never silently turned into a score of 0 or a risk of 0.
public sealed class LlmJsonTests
{
    [Fact]
    public void GetString_NumericPaperId_KeepsDigitsExactly()
    {
        var node = JsonNode.Parse("""{"paper_id": 2005.11401}""")!;
        Assert.Equal("2005.11401", LlmJson.GetString(node["paper_id"]));
    }

    [Fact]
    public void GetString_ObjectOrMissing_ReturnsNull()
    {
        var node = JsonNode.Parse("""{"a": {"b": 1}}""")!;
        Assert.Null(LlmJson.GetString(node["a"]));
        Assert.Null(LlmJson.GetString(node["missing"]));
    }

    [Fact]
    public void GetInt_AcceptsNumericStringAndWholeDouble_RejectsFraction()
    {
        var node = JsonNode.Parse("""{"s": "3", "d": 4.0, "f": 2.5, "t": "x"}""")!;
        Assert.Equal(3, LlmJson.GetInt(node["s"]));
        Assert.Equal(4, LlmJson.GetInt(node["d"]));
        Assert.Null(LlmJson.GetInt(node["f"]));
        Assert.Null(LlmJson.GetInt(node["t"]));
    }

    [Fact]
    public void GetInt_And_GetDouble_WorkOnNodesBuiltInCode()
    {
        var node = new JsonObject { ["i"] = 7, ["d"] = 0.25, ["l"] = 3L };
        Assert.Equal(7, LlmJson.GetInt(node["i"]));
        Assert.Equal(0.25, LlmJson.GetDouble(node["d"]));
        Assert.Equal(3, LlmJson.GetInt(node["l"]));
        Assert.Equal(7.0, LlmJson.GetDouble(node["i"]));
    }

    [Fact]
    public void GetDouble_AcceptsNumericString()
    {
        var node = JsonNode.Parse("""{"p": "0.8"}""")!;
        Assert.Equal(0.8, LlmJson.GetDouble(node["p"]));
    }

    [Fact]
    public void TryParseChunkKey_SplitsOnLastColon()
    {
        Assert.True(LlmJson.TryParseChunkKey("doi:10.1/x:3", out var paperId, out var chunkIndex));
        Assert.Equal("doi:10.1/x", paperId);
        Assert.Equal(3, chunkIndex);

        Assert.False(LlmJson.TryParseChunkKey("graphcast", out _, out _));
        Assert.False(LlmJson.TryParseChunkKey("graphcast:x", out _, out _));
        Assert.False(LlmJson.TryParseChunkKey(":3", out _, out _));
    }
}

public sealed class ClaimValidationFailClosedTests
{
    private static readonly HashSet<string> Keys = new() { "graphcast:1" };

    [Fact]
    public void BuildResult_NoUsableClaims_FailsClosed()
    {
        var (result, stats) = ClaimValidationScoring.BuildResult(JsonNode.Parse("""[{"sentence": ""}]""")!.AsArray(), Keys);

        Assert.True(result.ValidationFailed);
        Assert.Equal(1f, result.AggregateRisk);
        Assert.Empty(result.Claims);
        Assert.Equal(1, stats.Dropped);
    }

    [Fact]
    public void BuildResult_NullClaimsArray_FailsClosed()
    {
        var (result, _) = ClaimValidationScoring.BuildResult(null, Keys);
        Assert.True(result.ValidationFailed);
        Assert.Equal(1f, result.AggregateRisk);
    }

    [Fact]
    public void BuildResult_RiskyWithoutProbability_UsesRiskyBandFloor()
    {
        var claims = JsonNode.Parse("""
            [
              {"sentence": "A.", "factuality_status": "GROUNDED", "factual_hallucination_probability": 0.0, "rationale": "r", "supporting_chunks": ["graphcast:1", "made-up:9"]},
              {"sentence": "B.", "factuality_status": "RISKY", "rationale": "r"}
            ]
            """)!.AsArray();

        var (result, stats) = ClaimValidationScoring.BuildResult(claims, Keys);

        Assert.False(result.ValidationFailed);
        Assert.Equal(0.6f, result.AggregateRisk, precision: 5);
        Assert.Equal(new[] { "graphcast:1" }, result.Claims[0].SupportingChunks);
        Assert.Equal(1, stats.FilteredChunkRefs);
        Assert.Equal(1, stats.Risky);
    }

    [Fact]
    public void BuildResult_ProbabilityAsString_IsParsed()
    {
        var claims = JsonNode.Parse("""[{"sentence": "A.", "factuality_status": "RISKY", "factual_hallucination_probability": "0.85", "rationale": "r"}]""")!.AsArray();
        var (result, _) = ClaimValidationScoring.BuildResult(claims, Keys);
        Assert.Equal(0.85f, result.AggregateRisk, precision: 5);
    }

    [Theory]
    [InlineData(ClaimFactualityStatus.Grounded, 0f)]
    [InlineData(ClaimFactualityStatus.Extrapolated, 0.2f)]
    [InlineData(ClaimFactualityStatus.Risky, 0.6f)]
    public void ClampProbability_Missing_FallsBackToStatusBand(ClaimFactualityStatus status, float expected)
    {
        Assert.Equal(expected, ClaimValidationScoring.ClampProbability(null, status));
        Assert.Equal(0.9f, ClaimValidationScoring.ClampProbability(0.9, status));
    }
}

public sealed class RequireScoreTests
{
    [Fact]
    public void RequireScore_Missing_Throws()
    {
        var ex = Assert.Throws<InvalidOperationException>(() => EvaluationScoring.RequireScore(null, "plausibility"));
        Assert.Contains("plausibility", ex.Message);
        Assert.Throws<InvalidOperationException>(() => EvaluationScoring.RequireScore(double.NaN, "plausibility"));
    }

    [Fact]
    public void RequireScore_Present_IsClamped()
    {
        Assert.Equal(1f, EvaluationScoring.RequireScore(1.5, "x"));
        Assert.Equal(0.4f, EvaluationScoring.RequireScore(0.4, "x"));
    }
}

public sealed class DiscoveryContractTests
{
    private static readonly SearchHit[] Retrieved =
    {
        new("graphcast", 1, "c1", 0.9f, "Intro", 1),
        new("2005.11401", 4, "c2", 0.8f, null, 3),
    };

    private static readonly HashSet<(string, int)> Keys = new(Retrieved.Select(h => (h.PaperId, h.ChunkIndex)));

    [Fact]
    public void ValidateEvidence_ToleratesWrongJsonTypes_DropsOutOfSet()
    {
        var raw = JsonNode.Parse("""
            [
              {"paper_id": "graphcast", "chunk_index": "1", "support_type": "direct"},
              {"paper_id": 2005.11401, "chunk_index": 4, "support_type": "direct"},
              {"paper_id": "made-up", "chunk_index": 0, "support_type": "direct"},
              null
            ]
            """)!.AsArray();

        var result = DiscoveryContract.ValidateEvidence(raw, Retrieved);

        Assert.Equal(4, result.Claimed);
        Assert.Equal(2, result.Dropped);
        Assert.Equal(new[] { "graphcast", "2005.11401" }, result.Evidence.Select(e => e.PaperId));
        Assert.Equal("Intro", result.Evidence[0].Section);
        Assert.Equal(2, result.CitedHits.Count);
    }

    [Fact]
    public void ValidateBasis_Empty_Throws()
    {
        Assert.Throws<InvalidOperationException>(() =>
            DiscoveryContract.ValidateBasisOrThrow(new JsonArray(), Keys, Guid.NewGuid()));
        Assert.Throws<InvalidOperationException>(() =>
            DiscoveryContract.ValidateBasisOrThrow(null, Keys, Guid.NewGuid()));
    }

    // The OpenAI port used to invent a pure_speculation entry here; both providers
    // must now reject the response the same way.
    [Fact]
    public void ValidateBasis_AllEntriesInvalid_Throws()
    {
        var raw = JsonNode.Parse("""
            [{"claim_sentence": "X.", "basis_type": "analogy", "grounded_in_chunk_id": "made-up:0", "rationale": "r"}]
            """)!.AsArray();

        var ex = Assert.Throws<InvalidOperationException>(() =>
            DiscoveryContract.ValidateBasisOrThrow(raw, Keys, Guid.NewGuid()));
        Assert.Contains("all extrapolation_basis entries failed validation", ex.Message);
    }

    [Fact]
    public void ValidateBasis_NormalizesGroundedPureSpeculation_AndChecksChunkRefs()
    {
        var raw = JsonNode.Parse("""
            [
              {"claim_sentence": "A.", "basis_type": "Pure_Speculation", "grounded_in_chunk_id": "graphcast:1", "rationale": "r"},
              {"claim_sentence": "B.", "basis_type": "generalization", "grounded_in_chunk_id": "2005.11401:4", "rationale": "r"},
              {"claim_sentence": "C.", "basis_type": "analogy", "grounded_in_chunk_id": null, "rationale": "r"},
              {"claim_sentence": "D.", "basis_type": "vibes", "grounded_in_chunk_id": "graphcast:1", "rationale": "r"}
            ]
            """)!.AsArray();

        var result = DiscoveryContract.ValidateBasisOrThrow(raw, Keys, Guid.NewGuid());

        Assert.Equal(2, result.Basis.Count);
        Assert.Equal(2, result.Dropped);
        Assert.Equal(1, result.Normalized);
        Assert.Equal(1, result.PureSpeculation);
        Assert.Null(result.Basis[0].GroundedInChunkId);
        Assert.Equal("pure_speculation", result.Basis[0].BasisType);
    }
}

public sealed class FreeTextCitationEdgeCaseTests
{
    // Seen twice in the committed RQ3 data (pair-01, starved, gpt-4o-mini): the model
    // copied the prompt's source header format.
    [Fact]
    public void Parse_EchoedSourceHeader_IsReadAsPaperAndChunk()
    {
        var cites = NaiveRagCitations.ParseFreeTextCitations("as shown [paper_id=deepdta chunk_index=0].");
        Assert.Equal(new[] { ("deepdta", (int?)0) }, cites);
    }

    [Fact]
    public void Parse_ArxivPrefix_IsStripped()
    {
        var cites = NaiveRagCitations.ParseFreeTextCitations("RAG [arXiv:2005.11401] and [arxiv:2005.11401:4].");
        Assert.Equal(new[] { ("2005.11401", (int?)null), ("2005.11401", (int?)4) }, cites);
    }

    [Fact]
    public void Parse_PlainNumbersAndPercentages_AreNotCitations()
    {
        var cites = NaiveRagCitations.ParseFreeTextCitations("scores [0.5, 0.7] and [95%] and [3].");
        Assert.Empty(cites);
    }

    [Fact]
    public void Parse_LatinAbbreviations_AreStripped_PaperIdsLeftIntact()
    {
        var cites = NaiveRagCitations.ParseFreeTextCitations("[e.g., graphcast] [see pangu-weather:2] [seed-model]");
        Assert.Equal(new[] { ("graphcast", (int?)null), ("pangu-weather", (int?)2), ("seed-model", (int?)null) }, cites);
    }
}
