using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using LIBRAIN.Experiments.Models;

namespace LIBRAIN.Experiments.Commands;

// Phase B 10-pair Discovery Mode run; produces Table 5.
//
// Reads the pre-registered 10 topic pairs from experiments/topic-pairs.json
// and hits POST /api/discover for each pair, writing the raw response to
// experiments/phase-b/results/<pair_id>.json. The same LIBRAIN outputs are
// reused as the LIBRAIN column of the three-system baseline, so this command
// must run before `baseline`.
public sealed class PhaseBCommand
{
    public async Task<int> RunAsync(string[] args)
    {
        string url = "http://localhost:5099";
        int topK = 5;
        string? fromPairId = null;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--url":   url = args[++i]; break;
                case "--topK":  topK = int.Parse(args[++i]); break;
                case "--from":  fromPairId = args[++i]; break;
                case "-h": case "--help":
                    Console.Error.WriteLine("phase-b [--url http://localhost:5099] [--topK 5] [--from pair-08]");
                    return 0;
                default: throw new ArgumentException($"unknown flag: {args[i]}");
            }
        }

        Directory.CreateDirectory(ExperimentPaths.PhaseBResults);
        var allPairs = LoadTopicPairs();
        var pairs = allPairs;
        if (fromPairId is not null)
        {
            var startIdx = -1;
            for (int i = 0; i < allPairs.Count; i++)
            {
                if (allPairs[i].Id == fromPairId) { startIdx = i; break; }
            }
            if (startIdx < 0)
                throw new ArgumentException($"--from pair id '{fromPairId}' not found in topic-pairs.json");
            pairs = allPairs.Skip(startIdx).ToList();
        }
        Console.WriteLine($"Base URL : {url}");
        Console.WriteLine($"topK     : {topK}");
        Console.WriteLine($"Output   : {ExperimentPaths.PhaseBResults}");
        if (fromPairId is not null)
            Console.WriteLine($"Resuming from: {fromPairId} ({pairs.Count} of {allPairs.Count} pairs)");
        Console.WriteLine();
        Console.WriteLine($"Topic pairs: {pairs.Count}");
        Console.WriteLine();

        using var http = new HttpClient { BaseAddress = new Uri(url), Timeout = TimeSpan.FromMinutes(5) };
        foreach (var pair in pairs)
        {
            var outPath = Path.Combine(ExperimentPaths.PhaseBResults, $"{pair.Id}.json");
            Console.WriteLine($"=== {pair.Id}: '{pair.TopicA}' × '{pair.TopicB}' ===");

            var payload = JsonSerializer.Serialize(new { topicA = pair.TopicA, topicB = pair.TopicB, topK });
            var sw = Stopwatch.StartNew();
            using var content = new StringContent(payload, Encoding.UTF8, "application/json");
            using var response = await http.PostAsync("/api/discover", content);
            var body = await response.Content.ReadAsStringAsync();
            sw.Stop();

            if (!response.IsSuccessStatusCode)
            {
                Console.Error.WriteLine($"HALT: {pair.Id} returned HTTP {(int)response.StatusCode}");
                Console.Error.WriteLine(body);
                return 2;
            }

            await File.WriteAllTextAsync(outPath, body);
            var parsed = JsonNode.Parse(body)!;
            var novelClaim = parsed["novelClaim"]?.GetValue<string>() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(novelClaim))
            {
                Console.Error.WriteLine($"HALT: {pair.Id} empty novelClaim");
                return 3;
            }
            var nov = parsed["evaluation"]!["noveltyScore"]!.GetValue<double>();
            var qual = parsed["evaluation"]!["qualityScore"]!.GetValue<double>();
            Console.WriteLine($"  → HTTP {(int)response.StatusCode}  elapsed={sw.ElapsedMilliseconds}ms  novelty={nov:F4}  quality={qual:F4}");

            await Task.Delay(1000);
        }

        Console.WriteLine();
        Console.WriteLine($"Done. {pairs.Count} raw responses written to {ExperimentPaths.PhaseBResults}");
        Console.WriteLine("Next: `dotnet run --project LIBRAIN.Experiments -- baseline`, then `... analyze`");
        return 0;
    }

    internal static IReadOnlyList<TopicPair> LoadTopicPairs()
    {
        var json = File.ReadAllText(ExperimentPaths.TopicPairsJson);
        var list = JsonSerializer.Deserialize<TopicPairList>(json)
            ?? throw new InvalidOperationException("Failed to parse topic-pairs.json");
        return list.Pairs;
    }
}
