using System.Globalization;
using System.Text;

namespace LIBRAIN.Experiments.Stats;

// One cell of the RQ3 fabrication-delta sweep. `Fabricated` is the count of claimed
// citations that do not resolve to the retrieval set. For LIBRAIN this is 0 by
// construction and `ContractDropped` records how many the contract removed; for
// Naive-RAG `ContractDropped` is null (no contract) and `Fabricated` is the surfaced
// fabrication count — the measured delta.
public sealed record FabricationRow(
    string PairId,
    string System,
    string CitationMode,
    string Model,
    string Coercion,
    string Corpus,
    int Claimed,
    int Validated,
    int Fabricated,
    double FabricationRate,
    int? ContractDropped,
    long ElapsedMs);

public static class FabricationCsv
{
    public const string Header =
        "pair_id,system,citation_mode,model,coercion,corpus," +
        "claimed,validated,fabricated,fabrication_rate,contract_dropped,elapsed_ms";

    public static string Format(FabricationRow r)
    {
        var sb = new StringBuilder();
        sb.Append(RobustnessCsv.Escape(r.PairId)).Append(',');
        sb.Append(RobustnessCsv.Escape(r.System)).Append(',');
        sb.Append(RobustnessCsv.Escape(r.CitationMode)).Append(',');
        sb.Append(RobustnessCsv.Escape(r.Model)).Append(',');
        sb.Append(RobustnessCsv.Escape(r.Coercion)).Append(',');
        sb.Append(RobustnessCsv.Escape(r.Corpus)).Append(',');
        sb.Append(r.Claimed.ToString(CultureInfo.InvariantCulture)).Append(',');
        sb.Append(r.Validated.ToString(CultureInfo.InvariantCulture)).Append(',');
        sb.Append(r.Fabricated.ToString(CultureInfo.InvariantCulture)).Append(',');
        sb.Append(r.FabricationRate.ToString("F4", CultureInfo.InvariantCulture)).Append(',');
        sb.Append(r.ContractDropped is int d ? d.ToString(CultureInfo.InvariantCulture) : string.Empty).Append(',');
        sb.Append(r.ElapsedMs.ToString(CultureInfo.InvariantCulture));
        return sb.ToString();
    }

    public static double Rate(int fabricated, int claimed) =>
        claimed <= 0 ? 0.0 : (double)fabricated / claimed;
}
