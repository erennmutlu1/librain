using System.Globalization;
using System.Text;
using LIBRAIN.Experiments.Stats;

namespace LIBRAIN.Experiments.Commands;

// Task 4 — novelty-metric validation. Offline (no API): does the deterministic
// cosine-distance novelty score (OpenAI embeddings, novelty = 1 − max cosine to the
// corpus) correlate with HUMAN novelty ratings? Joins every committed rater judgment
// (across both human-eval pilots) to the cosine novelty of its (pair, system) and
// reports Spearman ρ per rater + pooled. A weak ρ means cosine novelty is a
// measurement surface (a rough proxy), not a control surface — consistent with the
// retired noveltyTarget knob, which could not steer it.
public sealed class NoveltyValidationCommand
{
    public int Run(string[] args)
    {
        // (pair_id, system_norm) -> cosine novelty, from the committed LLM scores.
        var cosine = LoadCosineNovelty();
        if (cosine.Count == 0)
        {
            Console.Error.WriteLine("No per-pair cosine novelty found; run `baseline` + `analyze` first.");
            return 2;
        }

        var pilots = new[]
        {
            (Dir: ExperimentPaths.HumanEvalDir, Label: "human-eval-pilot"),
            (Dir: ExperimentPaths.HallucinationPilotDir, Label: "hallucination-pilot"),
        };

        var rows = new List<(string Pilot, string Rater, int N, double Rho)>();
        var pooledHuman = new List<double>();
        var pooledCosine = new List<double>();

        foreach (var (dir, label) in pilots)
        {
            var keyPath = Path.Combine(dir, "unblind-key.csv");
            if (!File.Exists(keyPath)) continue;
            var key = LoadUnblindKey(keyPath); // output_id -> (pair_id, system_norm)

            foreach (var ratingFile in Directory.GetFiles(dir, "ratings-rater*.csv").OrderBy(f => f))
            {
                var rater = Path.GetFileNameWithoutExtension(ratingFile).Replace("ratings-", "");
                var human = new List<double>();
                var cos = new List<double>();
                foreach (var (outputId, novelty) in LoadRaterNovelty(ratingFile))
                {
                    if (!key.TryGetValue(outputId, out var ps)) continue;
                    if (!cosine.TryGetValue(ps, out var cosVal)) continue;
                    human.Add(novelty);
                    cos.Add(cosVal);
                }
                if (human.Count >= 2 && !AllEqual(human) && !AllEqual(cos))
                {
                    var rho = SpearmanRank.Correlation(human, cos);
                    rows.Add((label, rater, human.Count, rho));
                    pooledHuman.AddRange(human);
                    pooledCosine.AddRange(cos);
                }
            }
        }

        double? pooledRho = (pooledHuman.Count >= 2 && !AllEqual(pooledHuman) && !AllEqual(pooledCosine))
            ? SpearmanRank.Correlation(pooledHuman, pooledCosine)
            : null;

        Directory.CreateDirectory(ExperimentPaths.NoveltyValidationResults);
        WriteCsv(rows, pooledRho, pooledHuman.Count);
        WriteSummary(rows, pooledRho, pooledHuman.Count);

        Console.WriteLine("Novelty-metric validation (cosine novelty vs human novelty):");
        foreach (var r in rows)
            Console.WriteLine($"  {r.Pilot,-20} {r.Rater,-8} n={r.N,-3} spearman_rho={r.Rho:+0.000;-0.000}");
        Console.WriteLine($"  {"POOLED",-20} {"all",-8} n={pooledHuman.Count,-3} spearman_rho={(pooledRho is double pr ? pr.ToString("+0.000;-0.000", CultureInfo.InvariantCulture) : "n/a")}");
        Console.WriteLine($"Output: {ExperimentPaths.NoveltyValidationResults}");
        return 0;
    }

    private static Dictionary<(string, string), double> LoadCosineNovelty()
    {
        var map = new Dictionary<(string, string), double>();
        var perPair = Path.Combine(ExperimentPaths.BaselineResults, "per-pair.csv");
        if (File.Exists(perPair))
        {
            foreach (var line in File.ReadLines(perPair).Skip(1))
            {
                var c = line.Split(',');
                if (c.Length < 3) continue;
                if (double.TryParse(c[2], NumberStyles.Float, CultureInfo.InvariantCulture, out var nov))
                    map[(c[0].Trim(), NormalizeSystem(c[1]))] = nov;
            }
        }
        return map;
    }

    private static Dictionary<string, (string PairId, string System)> LoadUnblindKey(string path)
    {
        var map = new Dictionary<string, (string, string)>();
        foreach (var line in File.ReadLines(path).Skip(1))
        {
            var c = line.Split(',');
            if (c.Length < 4) continue;
            map[c[0].Trim()] = (c[1].Trim(), NormalizeSystem(c[3]));
        }
        return map;
    }

    // output_id + novelty are the first two columns (before the quoted rater_note),
    // so a leading split is safe even when notes contain commas.
    private static IEnumerable<(string OutputId, double Novelty)> LoadRaterNovelty(string path)
    {
        foreach (var line in File.ReadLines(path).Skip(1))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var c = line.Split(',');
            if (c.Length < 2) continue;
            if (double.TryParse(c[1], NumberStyles.Float, CultureInfo.InvariantCulture, out var nov))
                yield return (c[0].Trim(), nov);
        }
    }

    private static string NormalizeSystem(string s)
    {
        s = s.Trim().ToLowerInvariant().Replace("-with-fix", "");
        return new string(s.Where(ch => char.IsLetterOrDigit(ch) || ch == '-').ToArray());
    }

    private static bool AllEqual(IReadOnlyList<double> xs) => xs.All(v => v == xs[0]);

    private static void WriteCsv(List<(string Pilot, string Rater, int N, double Rho)> rows, double? pooled, int pooledN)
    {
        var sb = new StringBuilder("pilot,rater,axis,n,spearman_rho\n");
        foreach (var r in rows)
            sb.Append(r.Pilot).Append(',').Append(r.Rater).Append(",novelty,")
              .Append(r.N).Append(',').Append(r.Rho.ToString("F4", CultureInfo.InvariantCulture)).Append('\n');
        sb.Append("POOLED,all,novelty,").Append(pooledN).Append(',')
          .Append(pooled is double p ? p.ToString("F4", CultureInfo.InvariantCulture) : "").Append('\n');
        File.WriteAllText(Path.Combine(ExperimentPaths.NoveltyValidationResults, "results.csv"), sb.ToString());
    }

    private static void WriteSummary(List<(string Pilot, string Rater, int N, double Rho)> rows, double? pooled, int pooledN)
    {
        var sb = new StringBuilder();
        sb.AppendLine("# Task 4 — Novelty-Metric Validation (cosine novelty vs human novelty)");
        sb.AppendLine();
        sb.AppendLine("Deterministic cosine novelty (OpenAI embeddings, 1 − max cosine to corpus) vs");
        sb.AppendLine("human 1–5 novelty ratings, Spearman ρ. No Anthropic dependency.");
        sb.AppendLine();
        sb.AppendLine("| Pilot | Rater | n | Spearman ρ |");
        sb.AppendLine("|---|---|--:|--:|");
        foreach (var r in rows)
            sb.AppendLine($"| {r.Pilot} | {r.Rater} | {r.N} | {r.Rho:F3} |");
        sb.AppendLine($"| **pooled** | all | {pooledN} | {(pooled is double p ? p.ToString("F3", CultureInfo.InvariantCulture) : "n/a")} |");
        sb.AppendLine();
        sb.AppendLine("**Interpretation.** A weak-to-moderate ρ indicates cosine novelty is a");
        sb.AppendLine("*measurement surface* — a coarse, reproducible proxy for how far a claim sits");
        sb.AppendLine("from the corpus — not a *control surface* aligned with human novelty judgment.");
        sb.AppendLine("This is consistent with the retired `noveltyTarget` knob, which could not steer");
        sb.AppendLine("the score. Use cosine novelty to rank/screen, not as a human-novelty substitute.");
        File.WriteAllText(Path.Combine(ExperimentPaths.NoveltyValidationResults, "summary.md"), sb.ToString());
    }
}
