using LIBRAIN.Experiments.Stats;

namespace LIBRAIN.Tests.Agents;

// Pins the robustness CSV contract (FIX-JAIR.5). Numeric cells are blank when
// an axis does not apply to a row, and string cells with commas are quoted so
// the file stays parseable.
public sealed class RobustnessCsvTests
{
    [Fact]
    public void Format_DiscoverRow_RendersScoresAndBlanksFabrication()
    {
        var row = new RobustnessRow(
            Sweep: "topK", Variant: "K=5", SynthesisModel: "sonnet-4.6",
            Novelty: 0.3773, Plausibility: 0.62, Coherence: 0.75, Quality: 0.5824,
            AggregateRisk: 0.08, SupportingEvidenceCount: 6, FabricatedCitationCount: null,
            ElapsedMs: 13500, Note: "");

        Assert.Equal(
            "topK,K=5,sonnet-4.6,0.3773,0.6200,0.7500,0.5824,0.0800,6,,13500,",
            RobustnessCsv.Format(row));
    }

    [Fact]
    public void Format_GatedRow_LeavesAllNumericCellsBlank()
    {
        var row = new RobustnessRow(
            Sweep: "corpus-size", Variant: "GATED", SynthesisModel: "sonnet-4.6",
            Novelty: null, Plausibility: null, Coherence: null, Quality: null,
            AggregateRisk: null, SupportingEvidenceCount: null, FabricatedCitationCount: null,
            ElapsedMs: null, Note: "needs 13-paper corpus");

        Assert.Equal(
            "corpus-size,GATED,sonnet-4.6,,,,,,,,,needs 13-paper corpus",
            RobustnessCsv.Format(row));
    }

    [Fact]
    public void Escape_FieldWithComma_IsQuoted()
    {
        Assert.Equal("\"a, b\"", RobustnessCsv.Escape("a, b"));
    }

    [Fact]
    public void Escape_FieldWithQuote_DoublesQuoteAndWraps()
    {
        Assert.Equal("\"he said \"\"hi\"\"\"", RobustnessCsv.Escape("he said \"hi\""));
    }

    [Fact]
    public void Escape_PlainField_IsUnchanged()
    {
        Assert.Equal("topK", RobustnessCsv.Escape("topK"));
    }
}
