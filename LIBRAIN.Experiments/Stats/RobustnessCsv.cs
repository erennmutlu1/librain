using System.Globalization;
using System.Text;

namespace LIBRAIN.Experiments.Stats;

// One row of the FIX-JAIR.5 robustness table. Nullable numeric fields render as
// empty cells so a gated sweep (R3 corpus size) or an axis a given endpoint does
// not expose (e.g. fabricated_citation_count on a Discovery row) stays blank
// rather than zero.
public sealed record RobustnessRow(
    string Sweep,
    string Variant,
    string SynthesisModel,
    double? Novelty,
    double? Plausibility,
    double? Coherence,
    double? Quality,
    double? AggregateRisk,
    int? SupportingEvidenceCount,
    int? FabricatedCitationCount,
    long? ElapsedMs,
    string Note);

// Pure CSV rendering for the robustness sweep results. Kept separate from the
// command so the escaping contract is testable without a live server — topic and
// note fields carry commas, so naive string.Join would corrupt the file.
public static class RobustnessCsv
{
    public const string Header =
        "sweep,variant,synthesis_model,novelty,plausibility,coherence,quality," +
        "aggregate_risk,supporting_evidence_count,fabricated_citation_count,elapsed_ms,note";

    public static string Format(RobustnessRow row)
    {
        var sb = new StringBuilder();
        sb.Append(Escape(row.Sweep)).Append(',');
        sb.Append(Escape(row.Variant)).Append(',');
        sb.Append(Escape(row.SynthesisModel)).Append(',');
        sb.Append(Num(row.Novelty)).Append(',');
        sb.Append(Num(row.Plausibility)).Append(',');
        sb.Append(Num(row.Coherence)).Append(',');
        sb.Append(Num(row.Quality)).Append(',');
        sb.Append(Num(row.AggregateRisk)).Append(',');
        sb.Append(Int(row.SupportingEvidenceCount)).Append(',');
        sb.Append(Int(row.FabricatedCitationCount)).Append(',');
        sb.Append(Int(row.ElapsedMs)).Append(',');
        sb.Append(Escape(row.Note));
        return sb.ToString();
    }

    private static string Num(double? value) =>
        value is null ? string.Empty : value.Value.ToString("F4", CultureInfo.InvariantCulture);

    private static string Int(long? value) =>
        value is null ? string.Empty : value.Value.ToString(CultureInfo.InvariantCulture);

    // Minimal RFC-4180 escaping: quote any field containing a comma, quote, or
    // newline, and double embedded quotes.
    public static string Escape(string field)
    {
        field ??= string.Empty;
        if (field.IndexOfAny(new[] { ',', '"', '\n', '\r' }) < 0)
            return field;
        return "\"" + field.Replace("\"", "\"\"") + "\"";
    }
}
