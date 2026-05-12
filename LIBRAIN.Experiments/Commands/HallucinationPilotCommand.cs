namespace LIBRAIN.Experiments.Commands;

// Hallucination Mitigation Pilot for the claim-level validation prototype.
//
// Because the current main branch already includes the stage A1
// (extrapolation_basis) and stage A2 (ClaimValidator) changes, "LIBRAIN-with-fix"
// IS what Phase B has already produced. This command does NOT re-run any
// Anthropic calls. Instead it:
//   1. Copies the 5 human-eval pairs from experiments/phase-b/results/
//      into experiments/hallucination-pilot/results/librain-with-fix/.
//   2. Copies the same 5 pairs from baseline-comparison/results/{naive-rag,single-llm}/.
//   3. Generates a fresh blinded unblind-key.csv via GenerateUnblindKeyCommand
//      and an empty ratings-template.csv for the rater.
//   4. Re-emits the rubric.md so the rater scores from the same definitions.
//
// Cost: ~$0 (no API calls). Comparison "after-fix" data is produced when the
// rater fills ratings-template.csv. The "before-fix" data is the
// existing experiments/human-eval-pilot/ratings-rater1.csv.
public sealed class HallucinationPilotCommand
{
    private static readonly string[] HumanEvalPairs =
        { "pair-01", "pair-02", "pair-06", "pair-09", "pair-10" };

    public int Run(string[] args)
    {
        int seed = 42;
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--seed": seed = int.Parse(args[++i]); break;
                case "-h": case "--help":
                    Console.Error.WriteLine("hallucination-pilot [--seed 42]");
                    return 0;
                default: throw new ArgumentException($"unknown flag: {args[i]}");
            }
        }

        var pilotDir = ExperimentPaths.HallucinationPilotDir;
        var librainWithFix = Path.Combine(pilotDir, "results", "librain-with-fix");
        var naive = Path.Combine(pilotDir, "results", "naive-rag");
        var single = Path.Combine(pilotDir, "results", "single-llm");
        Directory.CreateDirectory(librainWithFix);
        Directory.CreateDirectory(naive);
        Directory.CreateDirectory(single);

        Console.WriteLine($"Copying {HumanEvalPairs.Length} human-eval pair outputs into pilot results layout...");
        foreach (var pair in HumanEvalPairs)
        {
            var phaseB = Path.Combine(ExperimentPaths.PhaseBResults, $"{pair}.json");
            if (!File.Exists(phaseB))
            {
                Console.Error.WriteLine($"HALT: missing {phaseB} (run `phase-b` first)");
                return 2;
            }
            File.Copy(phaseB, Path.Combine(librainWithFix, $"{pair}.json"), overwrite: true);

            var naiveSrc = Path.Combine(ExperimentPaths.BaselineResults, "naive-rag", $"{pair}.json");
            if (File.Exists(naiveSrc))
            {
                File.Copy(naiveSrc, Path.Combine(naive, $"{pair}.json"), overwrite: true);
            }
            else
            {
                Console.WriteLine($"  WARN: {naiveSrc} missing (run `baseline` to populate)");
            }

            var singleSrc = Path.Combine(ExperimentPaths.BaselineResults, "single-llm", $"{pair}.json");
            if (File.Exists(singleSrc))
            {
                File.Copy(singleSrc, Path.Combine(single, $"{pair}.json"), overwrite: true);
            }
            else
            {
                Console.WriteLine($"  WARN: {singleSrc} missing (run `baseline` to populate)");
            }
        }
        Console.WriteLine();

        // Blinded unblind-key.csv + empty ratings template.
        var unblindOut = Path.Combine(pilotDir, "unblind-key.csv");
        var keyArgs = new[]
        {
            "--pairs", string.Join(",", HumanEvalPairs),
            "--systems", "LIBRAIN-with-fix,Naive-RAG,Single-LLM",
            "--seed", seed.ToString(),
            "--out", unblindOut,
        };
        Console.WriteLine($"Generating blinded unblind-key (seed={seed})...");
        new GenerateUnblindKeyCommand().Run(keyArgs);

        var templatePath = Path.Combine(pilotDir, "ratings-template.csv");
        using (var w = new StreamWriter(templatePath))
        {
            w.WriteLine("output_id,novelty,plausibility,hallucination,rater_note");
            using var r = new StreamReader(unblindOut);
            r.ReadLine(); // skip header
            string? line;
            while ((line = r.ReadLine()) is not null)
            {
                var outputId = line.Split(',')[0];
                w.WriteLine($"{outputId},,,,");
            }
        }
        Console.WriteLine($"wrote {templatePath}");
        Console.WriteLine();

        // Reuse the human-eval rubric verbatim; same definitions.
        var rubricSrc = Path.Combine(ExperimentPaths.HumanEvalDir, "rubric.md");
        var rubricDst = Path.Combine(pilotDir, "rubric.md");
        if (File.Exists(rubricSrc))
        {
            File.Copy(rubricSrc, rubricDst, overwrite: true);
            Console.WriteLine($"copied rubric → {rubricDst}");
            Console.WriteLine();
        }

        PrintBeforeFixTarget();

        Console.WriteLine();
        Console.WriteLine("Done. Rater workflow:");
        Console.WriteLine($"  1. Open each output in {pilotDir}/results/<system>/pair-XX.json (the hypothesis + novelClaim fields are the rater's input).");
        Console.WriteLine($"  2. Use {unblindOut} mapping, but do NOT open until after scoring.");
        Console.WriteLine($"  3. Score each output_id in {templatePath} (novelty 1-5, plausibility 1-5, hallucination 0/1) using {rubricDst}.");
        Console.WriteLine("  4. Re-run `dotnet run --project LIBRAIN.Experiments -- analyze` to compute the after-fix table.");
        return 0;
    }

    private static void PrintBeforeFixTarget()
    {
        var ratingsPath = Path.Combine(ExperimentPaths.HumanEvalDir, "ratings-rater1.csv");
        var unblindPath = Path.Combine(ExperimentPaths.HumanEvalDir, "unblind-key.csv");
        if (!File.Exists(ratingsPath) || !File.Exists(unblindPath)) return;

        var ratings = LoadCsv(ratingsPath);
        var unblind = LoadCsv(unblindPath);
        var bySystem = new Dictionary<string, (int n, int novSum, int plausSum, int halls)>();
        foreach (var row in ratings)
        {
            var oid = row["output_id"];
            var key = unblind.FirstOrDefault(r => r["output_id"] == oid);
            if (key is null) continue;
            var system = key["system"];
            if (!bySystem.ContainsKey(system)) bySystem[system] = (0, 0, 0, 0);
            var prev = bySystem[system];
            bySystem[system] = (
                prev.n + 1,
                prev.novSum + int.Parse(row["novelty"]),
                prev.plausSum + int.Parse(row["plausibility"]),
                prev.halls + int.Parse(row["hallucination"]));
        }

        Console.WriteLine("===== BEFORE-FIX target (rater 1, pre-extrapolation_basis/ClaimValidator) =====");
        Console.WriteLine($"  {"system",-16} {"n",3} {"novelty_mean",14} {"plaus_mean",12} {"hall_flags",11}");
        foreach (var kvp in bySystem.OrderBy(p => p.Key))
        {
            var (n, novSum, plausSum, halls) = kvp.Value;
            var nov = (double)novSum / n;
            var pla = (double)plausSum / n;
            Console.WriteLine($"  {kvp.Key,-16} {n,3} {nov,14:F2} {pla,12:F2} {halls,5}/{n,-5}");
        }
        Console.WriteLine();
        Console.WriteLine("  Target after fix: LIBRAIN hall_flags ≤ 1/5, novelty mean ≥ 3.50, plausibility unchanged (±0.5).");
    }

    private static List<Dictionary<string, string>> LoadCsv(string path)
    {
        var rows = new List<Dictionary<string, string>>();
        using var reader = new StreamReader(path);
        var header = reader.ReadLine()?.Split(',') ?? throw new InvalidOperationException("empty CSV");
        string? line;
        while ((line = reader.ReadLine()) is not null)
        {
            var fields = SplitCsvLine(line);
            var row = new Dictionary<string, string>();
            for (int i = 0; i < header.Length; i++)
            {
                row[header[i]] = i < fields.Count ? fields[i] : string.Empty;
            }
            rows.Add(row);
        }
        return rows;
    }

    // Handles quoted fields containing commas (e.g., rater notes).
    private static List<string> SplitCsvLine(string line)
    {
        var fields = new List<string>();
        var sb = new System.Text.StringBuilder();
        bool inQuotes = false;
        for (int i = 0; i < line.Length; i++)
        {
            var c = line[i];
            if (c == '"')
            {
                if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
                {
                    sb.Append('"'); i++;
                }
                else inQuotes = !inQuotes;
            }
            else if (c == ',' && !inQuotes)
            {
                fields.Add(sb.ToString()); sb.Clear();
            }
            else
            {
                sb.Append(c);
            }
        }
        fields.Add(sb.ToString());
        return fields;
    }
}
