using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;
using LIBRAIN.Experiments.Stats;

namespace LIBRAIN.Experiments.Commands;

// Aggregates raw experiment outputs into CSVs consumed by the paper:
//   experiments/phase-b/results/aggregate.csv                       → paper Table 5
//   experiments/baseline-comparison/results/per-pair.csv            → joined per-pair data
//   experiments/baseline-comparison/results/aggregate.csv           → paper Table 7
//   experiments/baseline-comparison/results/fabrication-counts.csv  → paper Table 8
//   experiments/human-eval-pilot/analysis.csv                       → per-system descriptives (Table 9)
//   experiments/human-eval-pilot/spearman.csv                       → rater-vs-LLM-as-Judge Spearman ρ
public sealed class AnalyzeCommand
{
    public int Run(string[] args)
    {
        if (args.Length > 0)
        {
            if (args[0] is "-h" or "--help")
            {
                Console.Error.WriteLine("analyze (no arguments; reads experiments/* and writes CSV outputs)");
                return 0;
            }
            throw new ArgumentException($"unknown flag: {args[0]}");
        }

        WriteSection("Phase B (Table 5)", WritePhaseBTable);
        WriteSection("Three-system baseline (Table 7)", WriteBaselineAggregate);
        WriteSection("Naive-RAG fabrication counts (Table 8)", WriteFabricationCounts);
        WriteSection("Human evaluation pilot (Table 9, per-system descriptives)", WriteHumanEvalAnalysis);
        WriteSection("Hallucination mitigation pilot (Phase 3.A.5)", WriteHallucinationPilotAnalysis);
        return 0;
    }

    private static void WriteSection(string title, Action body)
    {
        Console.WriteLine(new string('=', 60));
        Console.WriteLine(title);
        Console.WriteLine(new string('=', 60));
        body();
        Console.WriteLine();
    }

    // ---------- Helpers ----------

    private sealed record EvalRow(string PairId, double Novelty, double Plausibility, double Coherence, double Quality);

    private static EvalRow EvaluationRow(string pairId, JsonNode response)
    {
        var e = response["evaluation"] ?? throw new InvalidOperationException($"{pairId}: missing 'evaluation'");
        return new EvalRow(
            PairId: pairId,
            Novelty: e["noveltyScore"]!.GetValue<double>(),
            Plausibility: e["plausibilityScore"]!.GetValue<double>(),
            Coherence: e["structuralCoherenceScore"]!.GetValue<double>(),
            Quality: e["qualityScore"]!.GetValue<double>());
    }

    private static List<(string PairId, JsonNode Response)> LoadPairResponses(string dir)
    {
        if (!Directory.Exists(dir)) return new();
        return Directory.GetFiles(dir, "pair-*.json")
            .OrderBy(p => p)
            .Select(p => (
                PairId: Path.GetFileNameWithoutExtension(p),
                Response: JsonNode.Parse(File.ReadAllText(p))!))
            .ToList();
    }

    private static void WriteCsv(string path, IEnumerable<string> header, IEnumerable<IEnumerable<string>> rows)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        using var w = new StreamWriter(path);
        w.WriteLine(string.Join(',', header));
        foreach (var row in rows) w.WriteLine(string.Join(',', row));
    }

    private static string F4(double v) => v.ToString("F4", CultureInfo.InvariantCulture);
    private static string F2(double v) => v.ToString("F2", CultureInfo.InvariantCulture);

    // ---------- Table 5: Phase B per-pair ----------

    private static void WritePhaseBTable()
    {
        var pairs = LoadPairResponses(ExperimentPaths.PhaseBResults);
        if (pairs.Count == 0)
        {
            Console.WriteLine($"skip: no Phase B results under {ExperimentPaths.PhaseBResults}");
            return;
        }
        var rows = pairs.Select(p => EvaluationRow(p.PairId, p.Response)).ToList();
        var out_ = Path.Combine(ExperimentPaths.PhaseBResults, "aggregate.csv");
        WriteCsv(out_,
            new[] { "pair_id", "novelty", "plausibility", "coherence", "quality" },
            rows.Select(r => new[] { r.PairId, F4(r.Novelty), F4(r.Plausibility), F4(r.Coherence), F4(r.Quality) }));
        Console.WriteLine($"wrote {Path.GetRelativePath(ExperimentPaths.RepoRoot, out_)} ({rows.Count} pairs) → paper Table 5");
    }

    // ---------- Table 7: Three-system aggregate ----------

    private static void WriteBaselineAggregate()
    {
        var systems = new[] { "librain", "naive-rag", "single-llm" };
        var detailedRows = new List<(string PairId, string System, EvalRow Row)>();
        foreach (var s in systems)
        {
            var dir = Path.Combine(ExperimentPaths.BaselineResults, s);
            var pairs = LoadPairResponses(dir);
            if (pairs.Count == 0)
            {
                Console.WriteLine($"skip {s}: no results under {dir}");
                continue;
            }
            foreach (var (pairId, response) in pairs)
            {
                detailedRows.Add((pairId, s, EvaluationRow(pairId, response)));
            }
        }
        if (detailedRows.Count == 0)
        {
            Console.WriteLine("skip Table 7: no baseline results available");
            return;
        }

        var perPair = Path.Combine(ExperimentPaths.BaselineResults, "per-pair.csv");
        WriteCsv(perPair,
            new[] { "pair_id", "system", "novelty", "plausibility", "coherence", "quality" },
            detailedRows.Select(d => new[] { d.PairId, d.System, F4(d.Row.Novelty), F4(d.Row.Plausibility), F4(d.Row.Coherence), F4(d.Row.Quality) }));
        Console.WriteLine($"wrote {Path.GetRelativePath(ExperimentPaths.RepoRoot, perPair)} (per-pair × system)");

        var aggRows = detailedRows
            .GroupBy(d => d.System)
            .Select(g => new
            {
                System = g.Key,
                N = g.Count(),
                NoveltyMean = g.Average(d => d.Row.Novelty),
                PlausibilityMean = g.Average(d => d.Row.Plausibility),
                CoherenceMean = g.Average(d => d.Row.Coherence),
                QualityMean = g.Average(d => d.Row.Quality),
            })
            .ToList();

        var aggOut = Path.Combine(ExperimentPaths.BaselineResults, "aggregate.csv");
        WriteCsv(aggOut,
            new[] { "system", "n_pairs", "novelty_mean", "plausibility_mean", "coherence_mean", "quality_mean" },
            aggRows.Select(r => new[]
            {
                r.System,
                r.N.ToString(CultureInfo.InvariantCulture),
                F4(r.NoveltyMean), F4(r.PlausibilityMean), F4(r.CoherenceMean), F4(r.QualityMean),
            }));
        Console.WriteLine($"wrote {Path.GetRelativePath(ExperimentPaths.RepoRoot, aggOut)} → paper Table 7");
        Console.WriteLine($"  {"system",-12} {"n",3} {"novelty",10} {"plaus",10} {"coher",10} {"qual",10}");
        foreach (var r in aggRows)
        {
            Console.WriteLine($"  {r.System,-12} {r.N,3} {F4(r.NoveltyMean),10} {F4(r.PlausibilityMean),10} {F4(r.CoherenceMean),10} {F4(r.QualityMean),10}");
        }
    }

    // ---------- Table 8: Naive-RAG fabrication counts ----------

    private static void WriteFabricationCounts()
    {
        var dir = Path.Combine(ExperimentPaths.BaselineResults, "naive-rag");
        var pairs = LoadPairResponses(dir);
        if (pairs.Count == 0)
        {
            Console.WriteLine($"skip: no Naive-RAG results under {dir}");
            return;
        }
        var rows = new List<(string PairId, int Claimed, int Fabricated, double Rate)>();
        int totalClaimed = 0, totalFabricated = 0;
        foreach (var (pairId, response) in pairs)
        {
            var claimed = response["claimedCitations"]?.AsArray().Count ?? 0;
            var fabricated = response["fabricatedCitationCount"]?.GetValue<int>() ?? 0;
            var rate = claimed == 0 ? 0.0 : (double)fabricated / claimed;
            rows.Add((pairId, claimed, fabricated, rate));
            totalClaimed += claimed;
            totalFabricated += fabricated;
        }

        var out_ = Path.Combine(ExperimentPaths.BaselineResults, "fabrication-counts.csv");
        WriteCsv(out_,
            new[] { "pair_id", "claimed_count", "fabricated_count", "fabrication_rate" },
            rows.Select(r => new[]
            {
                r.PairId,
                r.Claimed.ToString(CultureInfo.InvariantCulture),
                r.Fabricated.ToString(CultureInfo.InvariantCulture),
                F4(r.Rate),
            }));
        var summaryRate = totalClaimed == 0 ? 0.0 : (double)totalFabricated / totalClaimed;
        Console.WriteLine($"wrote {Path.GetRelativePath(ExperimentPaths.RepoRoot, out_)} (total: {totalFabricated} fabricated / {totalClaimed} claimed = {summaryRate * 100:F1}%) → paper Table 8");
    }

    // ---------- Table 9 per-system descriptives + Spearman ρ ----------

    private static void WriteHumanEvalAnalysis()
    {
        var ratingsPath = Path.Combine(ExperimentPaths.HumanEvalDir, "ratings-rater1.csv");
        var unblindPath = Path.Combine(ExperimentPaths.HumanEvalDir, "unblind-key.csv");
        if (!File.Exists(ratingsPath) || !File.Exists(unblindPath))
        {
            Console.WriteLine("skip: need both ratings-rater1.csv and unblind-key.csv");
            return;
        }
        var ratings = LoadCsv(ratingsPath);
        var unblind = LoadCsv(unblindPath);

        var joined = ratings.Select(r =>
        {
            var key = unblind.First(u => u["output_id"] == r["output_id"]);
            return new
            {
                OutputId = r["output_id"],
                PairId = key["pair_id"],
                System = key["system"],
                Novelty = int.Parse(r["novelty"]),
                Plausibility = int.Parse(r["plausibility"]),
                Hallucination = int.Parse(r["hallucination"]),
            };
        }).ToList();

        // Per-system descriptives.
        var descr = joined
            .GroupBy(j => j.System)
            .Select(g => new
            {
                System = g.Key,
                N = g.Count(),
                NoveltyMean = g.Average(j => (double)j.Novelty),
                PlausibilityMean = g.Average(j => (double)j.Plausibility),
                HallFlagCount = g.Sum(j => j.Hallucination),
                HallFlagRate = g.Average(j => (double)j.Hallucination),
            })
            .OrderBy(d => d.System)
            .ToList();

        var analysisOut = Path.Combine(ExperimentPaths.HumanEvalDir, "analysis.csv");
        WriteCsv(analysisOut,
            new[] { "system", "n", "novelty_mean", "plausibility_mean", "hallucination_flag_count", "hallucination_flag_rate" },
            descr.Select(d => new[]
            {
                d.System,
                d.N.ToString(CultureInfo.InvariantCulture),
                F2(d.NoveltyMean),
                F2(d.PlausibilityMean),
                d.HallFlagCount.ToString(CultureInfo.InvariantCulture),
                F4(d.HallFlagRate),
            }));
        Console.WriteLine($"wrote {Path.GetRelativePath(ExperimentPaths.RepoRoot, analysisOut)} → paper Table 9 (per-system descriptives)");
        Console.WriteLine($"  {"system",-12} {"n",3} {"novelty_mean",14} {"plaus_mean",12} {"hall_flags",13}");
        foreach (var d in descr)
        {
            Console.WriteLine($"  {d.System,-12} {d.N,3} {F2(d.NoveltyMean),14} {F2(d.PlausibilityMean),12} {d.HallFlagCount,5}/{d.N,-5}");
        }

        // Spearman ρ joins rater scores with per-pair LLM-as-Judge scores from
        // the baseline run (skipped silently if baseline hasn't been produced).
        var perPairCsv = Path.Combine(ExperimentPaths.BaselineResults, "per-pair.csv");
        if (!File.Exists(perPairCsv))
        {
            Console.WriteLine("(spearman ρ skipped: baseline per-pair.csv not yet available)");
            return;
        }
        var llmRows = LoadCsv(perPairCsv);
        // unblind-key.csv uses LIBRAIN / Naive-RAG / Single-LLM (rater-facing),
        // baseline per-pair.csv uses librain / naive-rag / single-llm (filesystem-
        // facing). Match on a normalized lowercase form so the join works.
        static string Norm(string s) => s.Replace("-", "").ToLowerInvariant();
        var merged = joined
            .Select(j => new
            {
                Human = j,
                Llm = llmRows.FirstOrDefault(l =>
                    l["pair_id"] == j.PairId &&
                    Norm(l["system"]) == Norm(j.System)),
            })
            .Where(m => m.Llm is not null)
            .ToList();

        if (merged.Count < 3)
        {
            Console.WriteLine($"(spearman ρ skipped: only {merged.Count} matched rows)");
            return;
        }

        var spearmanRows = new List<(string Axis, int N, double Rho)>();
        foreach (var axis in new[] { "novelty", "plausibility" })
        {
            var humanValues = merged.Select(m =>
                axis == "novelty" ? (double)m.Human.Novelty : (double)m.Human.Plausibility).ToList();
            var llmValues = merged.Select(m =>
                double.Parse(m.Llm![axis], CultureInfo.InvariantCulture)).ToList();
            var rho = SpearmanRank.Correlation(humanValues, llmValues);
            spearmanRows.Add((axis, merged.Count, rho));
        }

        var spearmanOut = Path.Combine(ExperimentPaths.HumanEvalDir, "spearman.csv");
        WriteCsv(spearmanOut,
            new[] { "axis", "n", "spearman_rho" },
            spearmanRows.Select(s => new[] { s.Axis, s.N.ToString(CultureInfo.InvariantCulture), F4(s.Rho) }));
        Console.WriteLine($"wrote {Path.GetRelativePath(ExperimentPaths.RepoRoot, spearmanOut)} → rater-vs-LLM-as-Judge Spearman ρ");
        foreach (var s in spearmanRows)
        {
            Console.WriteLine($"  {s.Axis,-12} n={s.N,2}  ρ={F4(s.Rho)}");
        }
    }

    // ---------- Hallucination mitigation pilot (Phase 3.A.5) ----------

    private static void WriteHallucinationPilotAnalysis()
    {
        var pilotDir = ExperimentPaths.HallucinationPilotDir;
        var ratingsPath = Path.Combine(pilotDir, "ratings-template.csv");
        var unblindPath = Path.Combine(pilotDir, "unblind-key.csv");
        if (!File.Exists(ratingsPath) || !File.Exists(unblindPath))
        {
            Console.WriteLine("skip: pilot ratings-template.csv or unblind-key.csv not yet produced");
            return;
        }
        var ratings = LoadCsv(ratingsPath);
        // Only score rows that the rater has filled in (non-empty novelty).
        var scored = ratings.Where(r => !string.IsNullOrWhiteSpace(r["novelty"])).ToList();
        if (scored.Count == 0)
        {
            Console.WriteLine("skip: pilot ratings-template.csv has no scored rows yet");
            return;
        }
        var unblind = LoadCsv(unblindPath);

        var joined = scored.Select(r =>
        {
            var key = unblind.First(u => u["output_id"] == r["output_id"]);
            return new
            {
                OutputId = r["output_id"],
                System = key["system"],
                Novelty = int.Parse(r["novelty"]),
                Plausibility = int.Parse(r["plausibility"]),
                Hallucination = int.Parse(r["hallucination"]),
            };
        }).ToList();

        var afterFix = joined
            .GroupBy(j => j.System)
            .Select(g => new
            {
                System = g.Key,
                N = g.Count(),
                NoveltyMean = g.Average(j => (double)j.Novelty),
                PlausibilityMean = g.Average(j => (double)j.Plausibility),
                HallFlagCount = g.Sum(j => j.Hallucination),
                HallFlagRate = g.Average(j => (double)j.Hallucination),
            })
            .OrderBy(d => d.System)
            .ToList();

        var analysisOut = Path.Combine(pilotDir, "analysis.csv");
        WriteCsv(analysisOut,
            new[] { "system", "n", "novelty_mean", "plausibility_mean", "hallucination_flag_count", "hallucination_flag_rate" },
            afterFix.Select(d => new[]
            {
                d.System,
                d.N.ToString(CultureInfo.InvariantCulture),
                F2(d.NoveltyMean),
                F2(d.PlausibilityMean),
                d.HallFlagCount.ToString(CultureInfo.InvariantCulture),
                F4(d.HallFlagRate),
            }));
        Console.WriteLine($"wrote {Path.GetRelativePath(ExperimentPaths.RepoRoot, analysisOut)} → hallucination mitigation pilot result");

        // Side-by-side BEFORE-FIX (rater 1, pre-A1/A2) vs AFTER-FIX (rater 1 again, post-fix).
        // BEFORE comes from human-eval-pilot/{ratings-rater1.csv, unblind-key.csv}.
        var beforeRatingsPath = Path.Combine(ExperimentPaths.HumanEvalDir, "ratings-rater1.csv");
        var beforeUnblindPath = Path.Combine(ExperimentPaths.HumanEvalDir, "unblind-key.csv");
        Dictionary<string, (int N, double Nov, double Plaus, int Halls)>? before = null;
        if (File.Exists(beforeRatingsPath) && File.Exists(beforeUnblindPath))
        {
            var beforeRatings = LoadCsv(beforeRatingsPath);
            var beforeUnblind = LoadCsv(beforeUnblindPath);
            before = beforeRatings
                .Select(r => new
                {
                    System = beforeUnblind.First(u => u["output_id"] == r["output_id"])["system"],
                    Novelty = int.Parse(r["novelty"]),
                    Plausibility = int.Parse(r["plausibility"]),
                    Hallucination = int.Parse(r["hallucination"]),
                })
                .GroupBy(x => x.System)
                .ToDictionary(
                    g => g.Key,
                    g => (g.Count(), g.Average(x => (double)x.Novelty), g.Average(x => (double)x.Plausibility), g.Sum(x => x.Hallucination)));
        }

        Console.WriteLine();
        Console.WriteLine($"  {"system (period)",-26} {"n",3} {"novelty_mean",14} {"plaus_mean",12} {"hall_flags",11}");
        if (before is not null)
        {
            foreach (var kvp in before.OrderBy(p => p.Key))
            {
                var (n, nov, plaus, halls) = kvp.Value;
                Console.WriteLine($"  BEFORE-FIX · {kvp.Key,-13} {n,3} {nov,14:F2} {plaus,12:F2} {halls,5}/{n,-5}");
            }
            Console.WriteLine();
        }
        foreach (var d in afterFix)
        {
            Console.WriteLine($"  AFTER-FIX  · {d.System,-13} {d.N,3} {d.NoveltyMean,14:F2} {d.PlausibilityMean,12:F2} {d.HallFlagCount,5}/{d.N,-5}");
        }

        // Pass-fail against the pre-registered target gate.
        Console.WriteLine();
        var librainAfter = afterFix.FirstOrDefault(d => d.System.StartsWith("LIBRAIN"));
        if (librainAfter is not null && before is not null && before.TryGetValue("LIBRAIN", out var librainBefore))
        {
            var hallDelta = (librainBefore.Halls - librainAfter.HallFlagCount);
            var novDelta = (librainAfter.NoveltyMean - librainBefore.Nov);
            var plausDelta = (librainAfter.PlausibilityMean - librainBefore.Plaus);
            Console.WriteLine("  Target gate:");
            Console.WriteLine($"    hall_flags ≤ 1/5  → after = {librainAfter.HallFlagCount}/{librainAfter.N}  ({(librainAfter.HallFlagCount <= 1 ? "PASS" : "FAIL")})");
            Console.WriteLine($"    novelty mean ≥ 3.50  → after = {librainAfter.NoveltyMean:F2}  ({(librainAfter.NoveltyMean >= 3.50 ? "PASS" : "FAIL")})");
            Console.WriteLine($"    plausibility ±0.5    → after = {librainAfter.PlausibilityMean:F2} (Δ={plausDelta:+0.00;-0.00})  ({(Math.Abs(plausDelta) <= 0.5 ? "PASS" : "FAIL")})");
            Console.WriteLine($"  Headline: hallucination flag rate {librainBefore.Halls}/{librainBefore.N} → {librainAfter.HallFlagCount}/{librainAfter.N} (Δ={-hallDelta:+0;-0} flags)");
        }
    }

    // ---------- Tiny CSV reader (RFC 4180 minimal) ----------

    private static List<Dictionary<string, string>> LoadCsv(string path)
    {
        var rows = new List<Dictionary<string, string>>();
        using var reader = new StreamReader(path);
        var header = reader.ReadLine()?.Split(',') ?? throw new InvalidOperationException("empty CSV: " + path);
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var fields = SplitCsvLine(line);
            var row = new Dictionary<string, string>();
            for (int i = 0; i < header.Length; i++)
                row[header[i]] = i < fields.Count ? fields[i] : string.Empty;
            rows.Add(row);
        }
        return rows;
    }

    private static List<string> SplitCsvLine(string line)
    {
        var fields = new List<string>();
        var sb = new StringBuilder();
        bool inQuotes = false;
        for (int i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"') { sb.Append('"'); i++; }
                else inQuotes = !inQuotes;
            }
            else if (c == ',' && !inQuotes) { fields.Add(sb.ToString()); sb.Clear(); }
            else sb.Append(c);
        }
        fields.Add(sb.ToString());
        return fields;
    }
}
