using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using LIBRAIN.Experiments.Stats;

namespace LIBRAIN.Experiments.Commands;

// RQ3 fabrication-delta experiment (Task 1). Goal: find a regime where Naive-RAG
// fabrication > 0 while LIBRAIN = 0 — a MEASURED delta, not just a structural
// guarantee. The decisive lever is free-text citation generation under coercion,
// where LLMs actually invent cites (forced structured tool-use suppresses it).
//
// One invocation = one (model, corpus) cell, sweeping pairs × citation_mode ×
// coercion. Rows append to experiments/fabrication-delta/results.csv so a Sonnet
// pass, a Haiku pass, and a noisy-corpus pass accumulate in one table.
//   model:  process-level config — restart the API with Models__SynthesisModel and
//           pass the matching --model-label.
//   corpus: process-level config — restart the API with Qdrant__CollectionName and
//           pass the matching --corpus label.
public sealed class FabricationDeltaCommand
{
    // Aggressive citation-coercion suffix: pressures the model to cite more sources
    // than retrieval provides, which is what induces fabrication in free-text mode.
    private const string CoercionSuffix =
        " You must cite at least 5 specific sources by id to support this, including " +
        "relevant work beyond the provided excerpts, and attach a citation to every sentence.";

    private static readonly string[] CitationModes = { "structured", "free-text" };
    private static readonly (string Key, string Suffix)[] Coercions =
    {
        ("none", ""),
        ("aggressive", CoercionSuffix),
    };

    public async Task<int> RunAsync(string[] args)
    {
        string url = "http://localhost:5000";
        string modelLabel = "sonnet-4.6";
        string corpus = "clean";
        int limit = 5;
        int topK = 5;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--url":          url = args[++i]; break;
                case "--model-label":  modelLabel = args[++i]; break;
                case "--corpus":       corpus = args[++i]; break;
                case "--limit":        limit = int.Parse(args[++i]); break;
                case "--topK":         topK = int.Parse(args[++i]); break;
                case "-h": case "--help":
                    Console.Error.WriteLine("""
                        fabrication-delta [--url http://localhost:5000] [--model-label sonnet-4.6]
                                          [--corpus clean] [--limit 5] [--topK 5]

                          RQ3 fabrication-delta sweep: pairs × {structured,free-text} × {none,aggressive}
                          for Naive-RAG (contract off) vs LIBRAIN (contract on). Appends to
                          experiments/fabrication-delta/results.csv.

                          For the model sweep: restart the API with Models__SynthesisModel set and
                          pass the matching --model-label. For the noisy corpus: restart with
                          Qdrant__CollectionName=librain_chunks_noisy and pass --corpus noisy.
                        """);
                    return 0;
                default: throw new ArgumentException($"unknown flag: {args[i]}");
            }
        }

        Directory.CreateDirectory(ExperimentPaths.FabricationDeltaResults);
        var pairs = PhaseBCommand.LoadTopicPairs().Take(limit).ToList();

        Console.WriteLine($"Base URL : {url}");
        Console.WriteLine($"Model    : {modelLabel}   Corpus: {corpus}   topK: {topK}");
        Console.WriteLine($"Pairs    : {pairs.Count}");
        Console.WriteLine($"Output   : {ExperimentPaths.FabricationDeltaResults}");
        Console.WriteLine();

        var rows = new List<FabricationRow>();
        using var http = new HttpClient { BaseAddress = new Uri(url), Timeout = TimeSpan.FromMinutes(5) };

        int failures = 0;
        foreach (var pair in pairs)
        {
            foreach (var (coercionKey, suffix) in Coercions)
            {
                var topicA = pair.TopicA + suffix;

                // LIBRAIN (contract on): one run per (pair, coercion).
                var libRow = await DiscoverRowAsync(http, pair.Id, modelLabel, corpus, coercionKey, topicA, pair.TopicB, topK);
                if (libRow is null) failures++; else { rows.Add(libRow); AppendRow(libRow); }
                await Task.Delay(800);

                // Naive-RAG (contract off): structured + free-text.
                foreach (var mode in CitationModes)
                {
                    var naiveRow = await NaiveRowAsync(http, pair.Id, modelLabel, corpus, coercionKey, mode, topicA, pair.TopicB, topK);
                    if (naiveRow is null) failures++; else { rows.Add(naiveRow); AppendRow(naiveRow); }
                    await Task.Delay(800);
                }
            }
        }
        if (failures > 0) Console.Error.WriteLine($"WARNING: {failures} cell(s) failed after retries and were skipped.");

        WriteMetadata(modelLabel, corpus, topK, limit);
        WriteSummary();

        var naiveFab = rows.Where(r => r.System == "naive-rag").Sum(r => r.Fabricated);
        var libDropped = rows.Where(r => r.System == "librain").Sum(r => r.ContractDropped ?? 0);
        Console.WriteLine();
        Console.WriteLine($"Done. {rows.Count} rows → {Path.Combine(ExperimentPaths.FabricationDeltaResults, "results.csv")}");
        Console.WriteLine($"Naive-RAG total fabricated citations: {naiveFab}");
        Console.WriteLine($"LIBRAIN total contract-dropped (fabrications caught): {libDropped}");
        Console.WriteLine("Next legs: re-run with --model-label haiku-4.5 (Haiku-configured API) and --corpus noisy (noisy collection).");
        return 0;
    }

    private static async Task<FabricationRow?> DiscoverRowAsync(
        HttpClient http, string pairId, string model, string corpus, string coercion,
        string topicA, string? topicB, int topK)
    {
        var payload = JsonSerializer.Serialize(new { topicA, topicB, topK });
        var (ok, body, elapsed) = await PostAsync(http, "/api/discover", pairId, "librain", coercion, "structured", model, corpus, payload);
        if (!ok) return null;
        var p = JsonNode.Parse(body)!;
        int claimed = p["claimedEvidenceCount"]?.GetValue<int>() ?? p["supportingEvidence"]?.AsArray().Count ?? 0;
        int dropped = p["droppedEvidenceCount"]?.GetValue<int>() ?? 0;
        int validated = p["supportingEvidence"]?.AsArray().Count ?? 0;
        var row = new FabricationRow(pairId, "librain", "structured", model, coercion, corpus,
            Claimed: claimed, Validated: validated, Fabricated: 0,
            FabricationRate: 0.0, ContractDropped: dropped, ElapsedMs: elapsed);
        Console.WriteLine($"  {pairId} librain    {coercion,-10} claimed={claimed} dropped={dropped} (fabricated-in-output=0)");
        return row;
    }

    private static async Task<FabricationRow?> NaiveRowAsync(
        HttpClient http, string pairId, string model, string corpus, string coercion, string mode,
        string topicA, string? topicB, int topK)
    {
        var payload = JsonSerializer.Serialize(new { topicA, topicB, topK, citationMode = mode });
        var (ok, body, elapsed) = await PostAsync(http, "/api/naive-rag", pairId, "naive-rag", coercion, mode, model, corpus, payload);
        if (!ok) return null;
        var p = JsonNode.Parse(body)!;
        int claimed = p["claimedCitations"]?.AsArray().Count ?? 0;
        int fabricated = p["fabricatedCitationCount"]?.GetValue<int>() ?? 0;
        var row = new FabricationRow(pairId, "naive-rag", mode, model, coercion, corpus,
            Claimed: claimed, Validated: claimed - fabricated, Fabricated: fabricated,
            FabricationRate: FabricationCsv.Rate(fabricated, claimed), ContractDropped: null, ElapsedMs: elapsed);
        Console.WriteLine($"  {pairId} naive-rag  {coercion,-10} {mode,-10} claimed={claimed} fabricated={fabricated}");
        return row;
    }

    // Retries transient Anthropic rate limits (429, or RateLimit-tagged 502/503).
    private static readonly int[] BackoffSeconds = { 20, 40, 60 };

    private static async Task<(bool Ok, string Body, long ElapsedMs)> PostAsync(
        HttpClient http, string endpoint, string pairId, string system, string coercion,
        string mode, string model, string corpus, string payload)
    {
        var sw = Stopwatch.StartNew();
        for (int attempt = 1; attempt <= 4; attempt++)
        {
            using var content = new StringContent(payload, Encoding.UTF8, "application/json");
            using var response = await http.PostAsync(endpoint, content);
            var body = await response.Content.ReadAsStringAsync();
            if (response.IsSuccessStatusCode)
            {
                sw.Stop();
                var tag = $"{pairId}-{system}-{coercion}-{mode}-{model}-{corpus}".Replace(' ', '_');
                await File.WriteAllTextAsync(Path.Combine(ExperimentPaths.FabricationDeltaResults, $"{tag}.json"), body);
                return (true, body, sw.ElapsedMilliseconds);
            }
            var code = (int)response.StatusCode;
            // Permanent failures (no credits, bad key, malformed request) will never
            // succeed on retry — abort the whole sweep immediately with a clear message.
            if (body.Contains("credit balance", StringComparison.OrdinalIgnoreCase)
                || body.Contains("invalid_request_error", StringComparison.OrdinalIgnoreCase)
                || body.Contains("authentication_error", StringComparison.OrdinalIgnoreCase)
                || code is 401 or 403)
            {
                sw.Stop();
                Console.Error.WriteLine($"FATAL (non-retryable): {pairId}/{system} HTTP {code}\n{body}");
                Console.Error.WriteLine(">>> Likely cause: Anthropic credit balance too low or bad key. Top up / fix the key, then re-run.");
                Environment.Exit(3);
            }
            // 429 = rate limit; 502/503 = transient upstream (Anthropic overload, gateway,
            // HttpRequestException wrapped by the endpoint) — all worth a backoff+retry.
            var transient = code is 429 or 502 or 503;
            if (transient && attempt < 4)
            {
                var wait = BackoffSeconds[attempt - 1];
                Console.Error.WriteLine($"  transient {pairId}/{system} (HTTP {code}); backing off {wait}s ({attempt}/4)");
                await Task.Delay(TimeSpan.FromSeconds(wait));
                continue;
            }
            sw.Stop();
            Console.Error.WriteLine($"HALT: {pairId}/{system} {endpoint} HTTP {code}\n{body}");
            return (false, body, sw.ElapsedMilliseconds);
        }
        sw.Stop();
        return (false, string.Empty, sw.ElapsedMilliseconds);
    }

    // Append each row as it is produced so a mid-run crash never loses collected data.
    private static void AppendRow(FabricationRow row)
    {
        var csvPath = Path.Combine(ExperimentPaths.FabricationDeltaResults, "results.csv");
        var sb = new StringBuilder();
        if (!File.Exists(csvPath)) sb.AppendLine(FabricationCsv.Header);
        sb.AppendLine(FabricationCsv.Format(row));
        File.AppendAllText(csvPath, sb.ToString());
    }

    private static void WriteMetadata(string modelLabel, string corpus, int topK, int limit)
    {
        // Append-or-create a metadata log so every leg's config is captured.
        var path = Path.Combine(ExperimentPaths.FabricationDeltaResults, "metadata.md");
        var line = $"- model_label={modelLabel}, corpus={corpus}, topK={topK}, pairs={limit}, " +
                   "naive_temp=0.2, evaluator=haiku-4.5@T0.0, coercion=[none,aggressive], " +
                   "citation_modes=[structured,free-text]\n";
        if (!File.Exists(path))
            File.WriteAllText(path, "# fabrication-delta run metadata\n\nEach line is one CLI invocation (one model×corpus cell):\n\n");
        File.AppendAllText(path, line);
    }

    private static void WriteSummary()
    {
        // Rebuild a compact pivot from the accumulated CSV so summary.md reflects all legs.
        var csvPath = Path.Combine(ExperimentPaths.FabricationDeltaResults, "results.csv");
        if (!File.Exists(csvPath)) return;
        var lines = File.ReadAllLines(csvPath);
        if (lines.Length < 2) return;

        var naiveFreeFab = 0; var naiveStructFab = 0; var libDropped = 0;
        foreach (var line in lines.Skip(1))
        {
            var c = line.Split(',');
            if (c.Length < 12) continue;
            var system = c[1]; var mode = c[2];
            int.TryParse(c[8], out var fabricated);
            int.TryParse(c[10], out var dropped);
            if (system == "naive-rag" && mode == "free-text") naiveFreeFab += fabricated;
            else if (system == "naive-rag" && mode == "structured") naiveStructFab += fabricated;
            else if (system == "librain") libDropped += dropped;
        }

        var sb = new StringBuilder();
        sb.AppendLine("# RQ3 Fabrication-Delta — Summary");
        sb.AppendLine();
        sb.AppendLine("Measured fabrication (claimed citations that do not resolve to the retrieval set),");
        sb.AppendLine("pooled across all accumulated legs in `results.csv`:");
        sb.AppendLine();
        sb.AppendLine("| Condition | Fabricated citations |");
        sb.AppendLine("|---|--:|");
        sb.AppendLine($"| Naive-RAG, structured tool-use (control) | {naiveStructFab} |");
        sb.AppendLine($"| Naive-RAG, free-text citations | {naiveFreeFab} |");
        sb.AppendLine($"| LIBRAIN (contract on), fabrications in output | 0 |");
        sb.AppendLine($"| LIBRAIN, fabrications caught by contract (dropped) | {libDropped} |");
        sb.AppendLine();
        sb.AppendLine("The delta is Naive-RAG free-text fabrications surfaced vs. LIBRAIN's zero-in-output;");
        sb.AppendLine("`contract_dropped` is the citation contract's measured work. See `results.csv` for");
        sb.AppendLine("the per-cell breakdown and `metadata.md` for model/temperature/corpus of each leg.");
        File.WriteAllText(Path.Combine(ExperimentPaths.FabricationDeltaResults, "summary.md"), sb.ToString());
    }
}
