using LIBRAIN.Experiments.Stats;

namespace LIBRAIN.Tests.Agents;

// Pins the fabrication-delta CSV contract: Naive-RAG rows carry the fabrication count
// with a blank contract_dropped (no contract); LIBRAIN rows carry contract_dropped and
// zero fabrication-in-output.
public sealed class FabricationCsvTests
{
    [Fact]
    public void Format_NaiveRow_RendersFabricationAndBlankDropped()
    {
        var row = new FabricationRow(
            PairId: "pair-01", System: "naive-rag", CitationMode: "free-text",
            Model: "haiku-4.5", Coercion: "aggressive", Corpus: "noisy",
            Claimed: 6, Validated: 4, Fabricated: 2, FabricationRate: 0.3333,
            ContractDropped: null, ElapsedMs: 12000);

        Assert.Equal(
            "pair-01,naive-rag,free-text,haiku-4.5,aggressive,noisy,6,4,2,0.3333,,12000",
            FabricationCsv.Format(row));
    }

    [Fact]
    public void Format_LibrainRow_RendersZeroFabricationAndDroppedCount()
    {
        var row = new FabricationRow(
            PairId: "pair-01", System: "librain", CitationMode: "structured",
            Model: "haiku-4.5", Coercion: "aggressive", Corpus: "noisy",
            Claimed: 7, Validated: 5, Fabricated: 0, FabricationRate: 0.0,
            ContractDropped: 2, ElapsedMs: 13000);

        Assert.Equal(
            "pair-01,librain,structured,haiku-4.5,aggressive,noisy,7,5,0,0.0000,2,13000",
            FabricationCsv.Format(row));
    }

    [Fact]
    public void Rate_ZeroClaimed_IsZeroNotNaN()
    {
        Assert.Equal(0.0, FabricationCsv.Rate(0, 0));
        Assert.Equal(0.5, FabricationCsv.Rate(2, 4));
    }
}
