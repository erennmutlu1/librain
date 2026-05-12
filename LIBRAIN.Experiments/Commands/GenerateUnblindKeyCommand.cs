namespace LIBRAIN.Experiments.Commands;

// Produces a blinded unblind-key.csv mapping output_id → (pair_id, position, system).
// For each pair the order of systems across positions A/B/C is randomized with a
// fixed seed (deterministic, reproducible). Used for human evaluation pilots.
public sealed class GenerateUnblindKeyCommand
{
    public int Run(string[] args)
    {
        string? pairsArg = null;
        string systemsArg = "LIBRAIN,Naive-RAG,Single-LLM";
        int seed = 42;
        string? outPath = null;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--pairs":   pairsArg = args[++i]; break;
                case "--systems": systemsArg = args[++i]; break;
                case "--seed":    seed = int.Parse(args[++i]); break;
                case "--out":     outPath = args[++i]; break;
                case "-h": case "--help":
                    Console.Error.WriteLine(
                        "generate-unblind-key --pairs pair-01,pair-02,...  [--systems LIBRAIN,Naive-RAG,Single-LLM] [--seed 42] --out path.csv");
                    return 0;
                default: throw new ArgumentException($"unknown flag: {args[i]}");
            }
        }

        if (string.IsNullOrWhiteSpace(pairsArg))
            throw new ArgumentException("--pairs is required");
        if (string.IsNullOrWhiteSpace(outPath))
            throw new ArgumentException("--out is required");

        var pairs = pairsArg.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var systems = systemsArg.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (systems.Length > 26)
            throw new ArgumentException("at most 26 systems supported (positions A..Z)");

        var rng = new Random(seed);
        var rows = new List<(string OutputId, string PairId, string Position, string System)>();
        int outputId = 1;
        foreach (var pair in pairs)
        {
            // Fisher-Yates: OrderBy(_ => rng.Next()) is not a real shuffle (stable
            // sort with non-key projection produces deterministic-but-degenerate
            // orderings). Permute in place instead.
            var shuffled = (string[])systems.Clone();
            for (int k = shuffled.Length - 1; k > 0; k--)
            {
                int j = rng.Next(k + 1);
                (shuffled[k], shuffled[j]) = (shuffled[j], shuffled[k]);
            }
            for (int p = 0; p < shuffled.Length; p++)
            {
                var position = ((char)('A' + p)).ToString();
                rows.Add(($"{outputId:D2}", pair, position, shuffled[p]));
                outputId++;
            }
        }

        Directory.CreateDirectory(Path.GetDirectoryName(outPath)!);
        using (var w = new StreamWriter(outPath))
        {
            w.WriteLine("output_id,pair_id,position,system");
            foreach (var row in rows)
                w.WriteLine($"{row.OutputId},{row.PairId},{row.Position},{row.System}");
        }
        Console.Error.WriteLine($"wrote {outPath} with {rows.Count} rows");

        // Quick balance summary.
        var bySystem = rows.GroupBy(r => r.System);
        foreach (var g in bySystem)
        {
            Console.Error.WriteLine($"  {g.Key}: positions = {string.Join(",", g.Select(r => r.Position))}");
        }
        return 0;
    }
}
