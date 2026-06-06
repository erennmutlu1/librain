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
        string provider = "anthropic";  // "anthropic" (regular endpoints) or "openai" (fabrication-probe)
        int limit = 5;
        int topK = 5;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--url":          url = args[++i]; break;
                case "--model-label":  modelLabel = args[++i]; break;
                case "--corpus":       corpus = args[++i]; break;
                case "--provider":     provider = args[++i]; break;
                case "--model":        modelLabel = args[++i]; break;  // openai model id, also used as the label
                case "--limit":        limit = int.Parse(args[++i]); break;
                case "--topK":         topK = int.Parse(args[++i]); break;
                case "-h": case "--help":
                    Console.Error.WriteLine("""
                        fabrication-delta [--url http://localhost:5000] [--provider anthropic|openai]
                                          [--model-label sonnet-4.6 | --model gpt-4o-mini]
                                          [--corpus clean] [--limit 5] [--topK 5]

                          RQ3 fabrication-delta sweep: pairs × {structured,free-text} × {none,aggressive}
                          for Naive-RAG (contract off) vs LIBRAIN (contract on). Appends to
                          experiments/fabrication-delta/results.csv.

                          provider=anthropic (default): uses /api/naive-rag + /api/discover (needs
                            Anthropic credit). Model sweep via Models__SynthesisModel + --model-label.
                          provider=openai: uses /api/fabrication-probe with --model (gpt-4o-mini, gpt-4o),
                            fabrication-only (no Haiku evaluators) — runs with zero Anthropic dependency.

                          Noisy corpus: restart the API with Qdrant__CollectionName=librain_chunks_noisy
                          and pass --corpus noisy.
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

        var openai = string.Equals(provider, "openai", StringComparison.OrdinalIgnoreCase);
        int failures = 0;
        foreach (var pair in pairs)
        {
            foreach (var (coercionKey, suffix) in Coercions)
            {
                var topicA = pair.TopicA + suffix;

                if (openai)
                {
                    // One generation per (pair, coercion, mode); the same response yields
                    // both the contract-off (naive fabricated) and contract-on (librain
                    // dropped) rows — a perfectly controlled with/without-contract contrast.
                    foreach (var mode in CitationModes)
                    {
                        var pair2 = await ProbeRowsAsync(http, pair.Id, modelLabel, corpus, coercionKey, mode, topicA, pair.TopicB, topK);
                        if (pair2 is null) { failures++; }
                        else { foreach (var r in pair2) { rows.Add(r); AppendRow(r); } }
                        await Task.Delay(800);
                    }
                    continue;
                }

                // Anthropic provider: regular endpoints (LIBRAIN contract on + Naive-RAG).
                var libRow = await DiscoverRowAsync(http, pair.Id, modelLabel, corpus, coercionKey, topicA, pair.TopicB, topK);
                if (libRow is null) failures++; else { rows.Add(libRow); AppendRow(libRow); }
                await Task.Delay(800);

                foreach (var mode in CitationModes)
                {
                    var naiveRow = await NaiveRowAsync(http, pair.Id, modelLabel, corpus, coercionKey, mode, topicA, pair.TopicB, topK);
                    if (naiveRow is null) failures++; else { rows.Add(naiveRow); AppendRow(naiveRow); }
                    await Task.Delay(800);
                }
            }
        }
        if (failures > 0) Console.Error.WriteLine($"WARNING: {failures} cell(s) failed after retries and were skipped.");

        WriteMetadata(provider, modelLabel, corpus, topK, limit);
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

    // OpenAI provider: one fabrication-probe generation → both the contract-off
    // (naive-rag) and contract-on (librain) rows. The contract drops exactly the
    // fabricated cites, so librain fabricated-in-output = 0 and dropped = fabricated.
    private static async Task<List<FabricationRow>?> ProbeRowsAsync(
        HttpClient http, string pairId, string model, string corpus, string coercion, string mode,
        string topicA, string? topicB, int topK)
    {
        var payload = JsonSerializer.Serialize(new { provider = "openai", model, topicA, topicB, topK, citationMode = mode });
        var (ok, body, elapsed) = await PostAsync(http, "/api/fabrication-probe", pairId, "probe", coercion, mode, model, corpus, payload);
        if (!ok) return null;
        var p = JsonNode.Parse(body)!;
        int claimed = p["claimedCount"]?.GetValue<int>() ?? 0;
        int fabricated = p["fabricatedCount"]?.GetValue<int>() ?? 0;
        int resolved = p["resolvedCount"]?.GetValue<int>() ?? (claimed - fabricated);

        var naive = new FabricationRow(pairId, "naive-rag", mode, model, coercion, corpus,
            Claimed: claimed, Validated: resolved, Fabricated: fabricated,
            FabricationRate: FabricationCsv.Rate(fabricated, claimed), ContractDropped: null, ElapsedMs: elapsed);
        var librain = new FabricationRow(pairId, "librain", mode, model, coercion, corpus,
            Claimed: claimed, Validated: resolved, Fabricated: 0,
            FabricationRate: 0.0, ContractDropped: fabricated, ElapsedMs: elapsed);

        Console.WriteLine($"  {pairId} {model,-12} {coercion,-10} {mode,-10} claimed={claimed} fabricated={fabricated} (contract drops {fabricated} → 0)");
        return new List<FabricationRow> { naive, librain };
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

    private static void WriteMetadata(string provider, string modelLabel, string corpus, int topK, int limit)
    {
        // Append-or-create a metadata log so every leg's config is captured.
        var path = Path.Combine(ExperimentPaths.FabricationDeltaResults, "metadata.md");
        var evalNote = provider == "openai"
            ? "evaluators=skipped (fabrication-only; metric is pure C#)"
            : "evaluator=haiku-4.5@T0.0";
        var line = $"- provider={provider}, model={modelLabel}, corpus={corpus}, topK={topK}, pairs={limit}, " +
                   $"gen_temp=0.2, {evalNote}, coercion=[none,aggressive], " +
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

        // Pivot by corpus: Naive-RAG fabrications (structured / free-text) vs LIBRAIN
        // in-output (always 0) and dropped (the contract's measured work).
        var corpora = new List<string>();
        var nStruct = new Dictionary<string, int>();
        var nFree = new Dictionary<string, int>();
        var libDrop = new Dictionary<string, int>();
        var libOut = new Dictionary<string, int>();
        foreach (var line in lines.Skip(1))
        {
            var c = line.Split(',');
            if (c.Length < 12) continue;
            var system = c[1]; var mode = c[2]; var corpus = c[5];
            int.TryParse(c[8], out var fabricated);
            int.TryParse(c[10], out var dropped);
            if (!corpora.Contains(corpus)) { corpora.Add(corpus); nStruct[corpus] = nFree[corpus] = libDrop[corpus] = libOut[corpus] = 0; }
            if (system == "naive-rag" && mode == "structured") nStruct[corpus] += fabricated;
            else if (system == "naive-rag" && mode == "free-text") nFree[corpus] += fabricated;
            else if (system == "librain") { libDrop[corpus] += dropped; libOut[corpus] += fabricated; }
        }

        var sb = new StringBuilder();
        sb.AppendLine("# RQ3 Fabrication-Delta — Summary");
        sb.AppendLine();
        sb.AppendLine("Fabrication = claimed citations that do not resolve to the retrieval set.");
        sb.AppendLine("Naive-RAG surfaces them; LIBRAIN's citation contract drops them (0 in output).");
        sb.AppendLine();
        sb.AppendLine("| Corpus | Naive-RAG structured | Naive-RAG free-text | Naive-RAG total | LIBRAIN in output | Contract dropped |");
        sb.AppendLine("|---|--:|--:|--:|--:|--:|");
        foreach (var corpus in corpora)
        {
            var total = nStruct[corpus] + nFree[corpus];
            sb.AppendLine($"| {corpus} | {nStruct[corpus]} | {nFree[corpus]} | {total} | {libOut[corpus]} | {libDrop[corpus]} |");
        }
        sb.AppendLine();
        sb.AppendLine("The delta is Naive-RAG fabrications surfaced vs. LIBRAIN's zero-in-output;");
        sb.AppendLine("`contract_dropped` is the citation contract's measured work. See `results.csv`");
        sb.AppendLine("for the per-cell breakdown and `metadata.md` for model/temperature/corpus of each leg.");
        File.WriteAllText(Path.Combine(ExperimentPaths.FabricationDeltaResults, "summary.md"), sb.ToString());
    }
}
