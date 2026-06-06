using System.Globalization;
using System.Text;
using LIBRAIN.Experiments.Stats;

namespace LIBRAIN.Experiments.Commands;

// Task 5: compute inter-rater agreement IN CODE from the committed pilot rater CSVs
// (replacing the hand-authored kappa.csv / spearman-pairwise.csv). Aligns the three
// raters on common (pair, system) keys via each pilot's unblind-key, then reports
// pairwise + pooled Krippendorff α (ordinal novelty/plausibility), Cohen/Fleiss κ
// (binary hallucination), and Spearman ρ — with explicit zero-variance handling.
public sealed class HumanEvalCommand
{
    private sealed record Ratings(double? Novelty, double? Plausibility, int? Hallucination);

    public int Run(string[] args)
    {
        var raters = new (string Name, string Dir, string File)[]
        {
            ("R1", ExperimentPaths.HumanEvalDir, "ratings-rater1.csv"),
            ("R2", ExperimentPaths.HallucinationPilotDir, "ratings-rater2.csv"),
            ("R3", ExperimentPaths.HallucinationPilotDir, "ratings-rater3.csv"),
        };

        var perRater = new Dictionary<string, Dictionary<string, Ratings>>();
        foreach (var (name, dir, file) in raters)
        {
            var path = Path.Combine(dir, file);
            var key = Path.Combine(dir, "unblind-key.csv");
            if (!File.Exists(path) || !File.Exists(key)) { Console.Error.WriteLine($"skip {name}: missing {file}/unblind-key"); continue; }
            perRater[name] = LoadRater(path, key);
        }
        if (perRater.Count < 2) { Console.Error.WriteLine("need >=2 raters"); return 2; }

        // Common (pair, system) keys across all present raters.
        var common = perRater.Values.Select(m => (IEnumerable<string>)m.Keys).Aggregate((a, b) => a.Intersect(b)).ToList();
        common.Sort();
        Console.WriteLine($"Raters: {string.Join(",", perRater.Keys)}   common (pair,system) keys: {common.Count}");

        Directory.CreateDirectory(ExperimentPaths.HumanEvalAgreementDir);
        var rows = new List<string> { "axis,scope,raters,n,statistic,value,status" };

        var names = perRater.Keys.OrderBy(x => x).ToList();
        // Pairwise
        for (int i = 0; i < names.Count; i++)
            for (int j = i + 1; j < names.Count; j++)
            {
                var a = perRater[names[i]]; var b = perRater[names[j]];
                var pair = $"{names[i]}-{names[j]}";
                // ordinal axes
                foreach (var axis in new[] { "novelty", "plausibility" })
                {
                    var (x, y) = OrdinalPair(a, b, common, axis);
                    if (x.Count >= 2)
                    {
                        var kr = InterRaterAgreement.KrippendorffAlpha(
                            new[] { x.Select(v => (int?)v).ToArray(), y.Select(v => (int?)v).ToArray() },
                            InterRaterAgreement.Metric.Ordinal);
                        rows.Add(Row(axis, "pairwise", pair, x.Count, "krippendorff_ordinal", kr));
                        if (!AllEqual(x) && !AllEqual(y))
                            rows.Add($"{axis},pairwise,{pair},{x.Count},spearman_rho,{Fmt(SpearmanRank.Correlation(ToD(x), ToD(y)))},ok");
                    }
                }
                // hallucination (binary)
                var (h1, h2) = BinaryPair(a, b, common);
                if (h1.Count >= 1)
                {
                    var ck = InterRaterAgreement.CohensKappa(h1, h2);
                    rows.Add(Row("hallucination", "pairwise", pair, h1.Count, "cohen_kappa", ck));
                }
            }

        // Pooled (>=3 raters): Fleiss (hallucination) + Krippendorff ordinal (novelty)
        if (names.Count >= 3)
        {
            var hallItems = new List<IReadOnlyList<int>>();
            foreach (var k in common)
            {
                var v = names.Select(n => perRater[n][k].Hallucination).ToList();
                if (v.All(x => x.HasValue)) hallItems.Add(v.Select(x => x!.Value).ToList());
            }
            if (hallItems.Count > 0)
            {
                var fk = InterRaterAgreement.FleissKappa(hallItems, new[] { 0, 1 });
                rows.Add(Row("hallucination", "pooled", string.Join("", names), hallItems.Count, "fleiss_kappa", fk));
            }
            foreach (var axis in new[] { "novelty", "plausibility" })
            {
                var matrix = names.Select(n => common.Select(k => Get(perRater[n][k], axis)).ToArray()).ToArray();
                var kr = InterRaterAgreement.KrippendorffAlpha(matrix, InterRaterAgreement.Metric.Ordinal);
                rows.Add(Row(axis, "pooled", string.Join("", names), common.Count, "krippendorff_ordinal", kr));
            }
        }

        File.WriteAllLines(Path.Combine(ExperimentPaths.HumanEvalAgreementDir, "agreement.csv"), rows);
        foreach (var r in rows.Skip(1)) Console.WriteLine("  " + r);
        Console.WriteLine($"\nWrote {ExperimentPaths.HumanEvalAgreementDir}/agreement.csv");
        Console.WriteLine("Note: the hallucination axis is all-zero in this pilot (post-fix) → κ undefined (zero variance), as expected.");
        return 0;
    }

    private static Dictionary<string, Ratings> LoadRater(string ratingsPath, string keyPath)
    {
        var key = new Dictionary<string, string>(); // output_id -> (pair|system_norm)
        foreach (var line in File.ReadLines(keyPath).Skip(1))
        {
            var c = line.Split(',');
            if (c.Length < 4) continue;
            key[c[0].Trim()] = $"{c[1].Trim()}|{Norm(c[3])}";
        }
        var map = new Dictionary<string, Ratings>();
        foreach (var line in File.ReadLines(ratingsPath).Skip(1))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var c = line.Split(',');
            if (c.Length < 4 || !key.TryGetValue(c[0].Trim(), out var k)) continue;
            map[k] = new Ratings(
                double.TryParse(c[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var n) ? n : null,
                double.TryParse(c[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var p) ? p : null,
                int.TryParse(c[3], out var h) ? h : null);
        }
        return map;
    }

    private static (List<int>, List<int>) OrdinalPair(Dictionary<string, Ratings> a, Dictionary<string, Ratings> b, List<string> keys, string axis)
    {
        var x = new List<int>(); var y = new List<int>();
        foreach (var k in keys)
        {
            var va = Get(a[k], axis); var vb = Get(b[k], axis);
            if (va.HasValue && vb.HasValue) { x.Add(va.Value); y.Add(vb.Value); }
        }
        return (x, y);
    }

    private static (List<int>, List<int>) BinaryPair(Dictionary<string, Ratings> a, Dictionary<string, Ratings> b, List<string> keys)
    {
        var x = new List<int>(); var y = new List<int>();
        foreach (var k in keys)
            if (a[k].Hallucination is int ha && b[k].Hallucination is int hb) { x.Add(ha); y.Add(hb); }
        return (x, y);
    }

    private static int? Get(Ratings r, string axis) => axis == "novelty"
        ? (r.Novelty is double n ? (int?)Math.Round(n) : null)
        : (r.Plausibility is double p ? (int?)Math.Round(p) : null);

    private static string Norm(string s)
    {
        s = s.Trim().ToLowerInvariant().Replace("-with-fix", "");
        return new string(s.Where(ch => char.IsLetterOrDigit(ch) || ch == '-').ToArray());
    }

    private static bool AllEqual(IReadOnlyList<int> xs) => xs.All(v => v == xs[0]);
    private static List<double> ToD(IReadOnlyList<int> xs) => xs.Select(v => (double)v).ToList();
    private static string Fmt(double v) => v.ToString("F4", CultureInfo.InvariantCulture);

    private static string Row(string axis, string scope, string raters, int n, string stat, InterRaterAgreement.Agreement a) =>
        $"{axis},{scope},{raters},{n},{stat},{(a.Value is double v ? Fmt(v) : "")},{a.Status}";
}
