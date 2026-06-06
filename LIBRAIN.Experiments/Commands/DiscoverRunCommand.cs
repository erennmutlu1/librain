using System.Diagnostics;
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace LIBRAIN.Experiments.Commands;

// Runs the REAL end-to-end Discovery pipeline (provider=openai) across topic pairs,
// saves the full DiscoverResponse per pair, and ranks by the genuine four-axis
// quality so the highest-quality discoveries surface. Paced + retried for the gpt-4o
// rate tier. Output: experiments/discovery-openai/{<pair>.json, ranking.csv, best-examples.md}.
public sealed class DiscoverRunCommand
{
    public async Task<int> RunAsync(string[] args)
    {
        string url = "http://localhost:5000";
        string model = "gpt-4o";
        int limit = 30, topK = 5, delayMs = 20000;
        string? only = null;
        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--url": url = args[++i]; break;
                case "--model": model = args[++i]; break;
                case "--limit": limit = int.Parse(args[++i]); break;
                case "--topK": topK = int.Parse(args[++i]); break;
                case "--delay-ms": delayMs = int.Parse(args[++i]); break;
                case "--pairs": only = args[++i]; break;  // comma list e.g. pair-13,pair-30
                case "-h": case "--help":
                    Console.Error.WriteLine("discover-run [--url ...] [--model gpt-4o] [--limit 30] [--topK 5] [--delay-ms 20000] [--pairs pair-13,pair-30]\n  Real OpenAI discovery across pairs, ranked by quality.");
                    return 0;
            }
        }

        var pairs = PhaseBCommand.LoadTopicPairs().ToList();
        if (only is not null)
        {
            var set = only.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToHashSet();
            pairs = pairs.Where(p => set.Contains(p.Id)).ToList();
        }
        else pairs = pairs.Take(limit).ToList();

        Directory.CreateDirectory(ExperimentPaths.DiscoveryOpenAiResults);
        Console.WriteLine($"Real discovery (provider=openai, model={model}) on {pairs.Count} pairs, topK={topK}");
        var rows = new List<(string Pair, string A, string B, double N, double P, double C, double Q, double Risk, int Ev, int Drop, string Novel)>();
        using var http = new HttpClient { BaseAddress = new Uri(url), Timeout = TimeSpan.FromMinutes(6) };

        foreach (var pair in pairs)
        {
            var payload = JsonSerializer.Serialize(new { topicA = pair.TopicA, topicB = pair.TopicB, topK, provider = "openai", model });
            var body = await PostWithRetryAsync(http, payload, pair.Id);
            if (body is null) continue;
            await File.WriteAllTextAsync(Path.Combine(ExperimentPaths.DiscoveryOpenAiResults, $"{pair.Id}.json"), body);
            var p = JsonNode.Parse(body)!;
            var e = p["evaluation"]!;
            rows.Add((pair.Id, pair.TopicA, pair.TopicB,
                e["noveltyScore"]!.GetValue<double>(), e["plausibilityScore"]!.GetValue<double>(),
                e["structuralCoherenceScore"]!.GetValue<double>(), e["qualityScore"]!.GetValue<double>(),
                p["claimValidation"]?["aggregateRisk"]?.GetValue<double>() ?? 0,
                p["supportingEvidence"]?.AsArray().Count ?? 0, p["droppedEvidenceCount"]?.GetValue<int>() ?? 0,
                p["novelClaim"]?.GetValue<string>() ?? ""));
            Console.WriteLine($"  {pair.Id,-8} q={rows[^1].Q:F3} (nov={rows[^1].N:F2} pla={rows[^1].P:F2} coh={rows[^1].C:F2}) risk={rows[^1].Risk:F2} ev={rows[^1].Ev} drop={rows[^1].Drop}");
            await Task.Delay(delayMs);
        }

        rows.Sort((a, b) => b.Q.CompareTo(a.Q));
        WriteRanking(rows);
        Console.WriteLine($"\nDone. {rows.Count} discoveries → {ExperimentPaths.DiscoveryOpenAiResults} (ranking.csv, best-examples.md)");
        if (rows.Count > 0) Console.WriteLine($"BEST: {rows[0].Pair} '{rows[0].A}' × '{rows[0].B}' quality={rows[0].Q:F3}");
        return 0;
    }

    private static readonly int[] Backoff = { 20, 40, 60 };
    private static async Task<string?> PostWithRetryAsync(HttpClient http, string payload, string pid)
    {
        for (int attempt = 1; attempt <= 4; attempt++)
        {
            using var content = new StringContent(payload, Encoding.UTF8, "application/json");
            using var resp = await http.PostAsync("/api/discover", content);
            var body = await resp.Content.ReadAsStringAsync();
            if (resp.IsSuccessStatusCode) return body;
            if (body.Contains("credit", StringComparison.OrdinalIgnoreCase) || body.Contains("invalid_request", StringComparison.OrdinalIgnoreCase))
            { Console.Error.WriteLine($"FATAL {pid}: {body}"); Environment.Exit(3); }
            var code = (int)resp.StatusCode;
            if (code is 429 or 502 or 503 && attempt < 4)
            { Console.Error.WriteLine($"  transient {pid} HTTP {code}; backoff {Backoff[attempt-1]}s ({attempt}/4)"); await Task.Delay(TimeSpan.FromSeconds(Backoff[attempt - 1])); continue; }
            Console.Error.WriteLine($"  HALT {pid} HTTP {code}: {body[..Math.Min(200, body.Length)]}");
            return null;
        }
        return null;
    }

    private static void WriteRanking(List<(string Pair, string A, string B, double N, double P, double C, double Q, double Risk, int Ev, int Drop, string Novel)> rows)
    {
        var sb = new StringBuilder("rank,pair,topicA,topicB,novelty,plausibility,coherence,quality,aggregate_risk,evidence,dropped\n");
        for (int i = 0; i < rows.Count; i++)
        {
            var r = rows[i];
            sb.Append(i + 1).Append(',').Append(r.Pair).Append(",\"").Append(r.A).Append("\",\"").Append(r.B).Append("\",")
              .Append(F(r.N)).Append(',').Append(F(r.P)).Append(',').Append(F(r.C)).Append(',').Append(F(r.Q)).Append(',')
              .Append(F(r.Risk)).Append(',').Append(r.Ev).Append(',').Append(r.Drop).Append('\n');
        }
        File.WriteAllText(Path.Combine(ExperimentPaths.DiscoveryOpenAiResults, "ranking.csv"), sb.ToString());

        var md = new StringBuilder("# Best discovery examples (real Discovery pipeline on OpenAI)\n\n");
        foreach (var r in rows.Take(5))
        {
            md.Append("## ").Append(r.A).Append(" × ").Append(r.B).Append("  (quality ").Append(F(r.Q)).Append(")\n\n");
            md.Append("- novelty ").Append(F(r.N)).Append(" · plausibility ").Append(F(r.P)).Append(" · coherence ").Append(F(r.C))
              .Append(" · claim-risk ").Append(F(r.Risk)).Append(" · evidence ").Append(r.Ev).Append(" (dropped ").Append(r.Drop).Append(")\n\n");
            md.Append("**novelClaim:** ").Append(r.Novel).Append("\n\n");
        }
        File.WriteAllText(Path.Combine(ExperimentPaths.DiscoveryOpenAiResults, "best-examples.md"), md.ToString());
    }

    private static string F(double v) => v.ToString("F4", CultureInfo.InvariantCulture);
}
