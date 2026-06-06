using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using LIBRAIN.Experiments.Stats;

namespace LIBRAIN.Experiments.Commands;

// Task 2 support: re-score every system's committed hypothesis through /api/score
// (OpenAI judge) so LIBRAIN, Naive-RAG, Single-LLM, and PaperQA land on ONE
// self-consistent OpenAI-judged four-axis scale (the existing tables are Haiku-judged
// and not comparable to PaperQA). Cosine novelty is deterministic; only
// plausibility/coherence/quality are re-judged. Writes openai-judged-{per-pair,
// aggregate}.csv under experiments/baseline-comparison/results/.
public sealed class ScoreSystemsCommand
{
    private static readonly (string System, Func<string, string> PathFor)[] Systems =
    {
        ("librain",    pid => Path.Combine(ExperimentPaths.PhaseBResults, $"{pid}.json")),
        ("naive-rag",  pid => Path.Combine(ExperimentPaths.BaselineResults, "naive-rag", $"{pid}.json")),
        ("single-llm", pid => Path.Combine(ExperimentPaths.BaselineResults, "single-llm", $"{pid}.json")),
        ("paperqa",    pid => Path.Combine(ExperimentPaths.BaselineResults, "paperqa", $"{pid}.json")),
    };

    public async Task<int> RunAsync(string[] args)
    {
        string url = "http://localhost:5000";
        string model = "gpt-4o-mini";
        int limit = 10;
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--url":   url = args[++i]; break;
                case "--model": model = args[++i]; break;
                case "--limit": limit = int.Parse(args[++i]); break;
                case "-h": case "--help":
                    Console.Error.WriteLine("score-systems [--url http://localhost:5000] [--model gpt-4o-mini] [--limit 10]\n  Re-score all 4 systems' hypotheses on the OpenAI four-axis judge.");
                    return 0;
            }
        }

        var pairs = PhaseBCommand.LoadTopicPairs().Take(limit).ToList();
        var perPair = new List<(string Pair, string System, double N, double P, double C, double Q)>();
        using var http = new HttpClient { BaseAddress = new Uri(url), Timeout = TimeSpan.FromMinutes(5) };

        foreach (var pair in pairs)
        {
            foreach (var (system, pathFor) in Systems)
            {
                var path = pathFor(pair.Id);
                if (!File.Exists(path)) { Console.Error.WriteLine($"  skip {pair.Id}/{system}: no file"); continue; }
                var hypothesis = JsonNode.Parse(await File.ReadAllTextAsync(path))?["hypothesis"]?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(hypothesis)) { Console.Error.WriteLine($"  skip {pair.Id}/{system}: empty hypothesis"); continue; }

                var payload = JsonSerializer.Serialize(new { provider = "openai", model, hypothesis, topicA = pair.TopicA, topicB = pair.TopicB });
                var body = await PostWithRetryAsync(http, payload, pair.Id, system);
                if (body is null) continue;
                var eval = JsonNode.Parse(body)!["evaluation"]!;
                var n = eval["noveltyScore"]!.GetValue<double>();
                var p = eval["plausibilityScore"]!.GetValue<double>();
                var c = eval["structuralCoherenceScore"]!.GetValue<double>();
                var q = eval["qualityScore"]!.GetValue<double>();
                perPair.Add((pair.Id, system, n, p, c, q));
                Console.WriteLine($"  {pair.Id} {system,-10} novelty={n:F3} plaus={p:F2} coher={c:F2} quality={q:F3}");
                await Task.Delay(500);
            }
        }

        WritePerPair(perPair);
        WriteAggregate(perPair);
        Console.WriteLine($"\nDone. {perPair.Count} scored rows → experiments/baseline-comparison/results/openai-judged-*.csv");
        return 0;
    }

    private static readonly int[] Backoff = { 15, 30, 45 };
    private static async Task<string?> PostWithRetryAsync(HttpClient http, string payload, string pid, string system)
    {
        for (int attempt = 1; attempt <= 4; attempt++)
        {
            using var content = new StringContent(payload, Encoding.UTF8, "application/json");
            using var resp = await http.PostAsync("/api/score", content);
            var body = await resp.Content.ReadAsStringAsync();
            if (resp.IsSuccessStatusCode) return body;
            if (body.Contains("credit", StringComparison.OrdinalIgnoreCase) || body.Contains("invalid_request", StringComparison.OrdinalIgnoreCase))
            { Console.Error.WriteLine($"FATAL {pid}/{system}: {body}"); Environment.Exit(3); }
            var code = (int)resp.StatusCode;
            if (code is 429 or 502 or 503 && attempt < 4) { await Task.Delay(TimeSpan.FromSeconds(Backoff[attempt - 1])); continue; }
            Console.Error.WriteLine($"  HALT {pid}/{system} HTTP {code}: {body}");
            return null;
        }
        return null;
    }

    private static void WritePerPair(List<(string Pair, string System, double N, double P, double C, double Q)> rows)
    {
        var sb = new StringBuilder("pair_id,system,novelty,plausibility,coherence,quality\n");
        foreach (var r in rows)
            sb.Append(r.Pair).Append(',').Append(r.System).Append(',')
              .Append(F(r.N)).Append(',').Append(F(r.P)).Append(',').Append(F(r.C)).Append(',').Append(F(r.Q)).Append('\n');
        File.WriteAllText(Path.Combine(ExperimentPaths.BaselineResults, "openai-judged-per-pair.csv"), sb.ToString());
    }

    private static void WriteAggregate(List<(string Pair, string System, double N, double P, double C, double Q)> rows)
    {
        var sb = new StringBuilder("system,n,novelty_mean,plausibility_mean,coherence_mean,quality_mean\n");
        foreach (var g in rows.GroupBy(r => r.System))
        {
            var n = g.Count();
            sb.Append(g.Key).Append(',').Append(n).Append(',')
              .Append(F(g.Average(r => r.N))).Append(',').Append(F(g.Average(r => r.P))).Append(',')
              .Append(F(g.Average(r => r.C))).Append(',').Append(F(g.Average(r => r.Q))).Append('\n');
        }
        File.WriteAllText(Path.Combine(ExperimentPaths.BaselineResults, "openai-judged-aggregate.csv"), sb.ToString());
    }

    private static string F(double v) => v.ToString("F4", CultureInfo.InvariantCulture);
}
