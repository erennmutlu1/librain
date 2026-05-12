using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace LIBRAIN.Experiments.Commands;

// Three-system baseline run (paper §6.6 → Table 7 + Table 8).
//
// Hits /api/naive-rag and /api/single-llm for each of the 10 pre-registered
// topic pairs. The LIBRAIN column is NOT re-run here — it reuses the Phase B
// outputs from experiments/phase-b/results/ (same topic pairs, same prompt,
// same model). After this finishes, AnalyzeCommand aggregates the three
// systems into Table 7 (aggregate means) and Table 8 (fabrication counts).
public sealed class BaselineCommand
{
    public async Task<int> RunAsync(string[] args)
    {
        string url = "http://localhost:5099";
        int topK = 5;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--url":   url = args[++i]; break;
                case "--topK":  topK = int.Parse(args[++i]); break;
                case "-h": case "--help":
                    Console.Error.WriteLine("baseline [--url http://localhost:5099] [--topK 5]");
                    return 0;
                default: throw new ArgumentException($"unknown flag: {args[i]}");
            }
        }

        var librainDir = Path.Combine(ExperimentPaths.BaselineResults, "librain");
        var naiveDir = Path.Combine(ExperimentPaths.BaselineResults, "naive-rag");
        var singleDir = Path.Combine(ExperimentPaths.BaselineResults, "single-llm");
        Directory.CreateDirectory(librainDir);
        Directory.CreateDirectory(naiveDir);
        Directory.CreateDirectory(singleDir);

        // Mirror Phase B LIBRAIN responses into the baseline layout. Hard-links
        // would be ideal but cross-filesystem paths fail; copy is universal.
        var phaseBFiles = Directory.GetFiles(ExperimentPaths.PhaseBResults, "pair-*.json");
        if (phaseBFiles.Length == 0)
        {
            Console.Error.WriteLine($"HALT: no Phase B results under {ExperimentPaths.PhaseBResults}. Run `phase-b` first.");
            return 2;
        }
        foreach (var src in phaseBFiles)
        {
            File.Copy(src, Path.Combine(librainDir, Path.GetFileName(src)), overwrite: true);
        }
        Console.WriteLine($"Mirrored {phaseBFiles.Length} Phase B LIBRAIN result(s) into {librainDir}");
        Console.WriteLine();

        var pairs = PhaseBCommand.LoadTopicPairs();
        Console.WriteLine($"Topic pairs: {pairs.Count}");
        Console.WriteLine();

        using var http = new HttpClient { BaseAddress = new Uri(url), Timeout = TimeSpan.FromMinutes(2) };
        foreach (var pair in pairs)
        {
            Console.WriteLine($"=== {pair.Id}: '{pair.TopicA}' × '{pair.TopicB}' ===");
            var naivePayload = JsonSerializer.Serialize(new { topicA = pair.TopicA, topicB = pair.TopicB, topK });
            var singlePayload = JsonSerializer.Serialize(new { topicA = pair.TopicA, topicB = pair.TopicB });

            var naiveExit = await CallEndpointAsync(http, "/api/naive-rag", "naive-rag", pair.Id, naivePayload, naiveDir);
            if (naiveExit != 0) return naiveExit;
            await Task.Delay(1000);

            var singleExit = await CallEndpointAsync(http, "/api/single-llm", "single-llm", pair.Id, singlePayload, singleDir);
            if (singleExit != 0) return singleExit;
            await Task.Delay(1000);
        }

        Console.WriteLine();
        Console.WriteLine("Done. Per-system responses written to:");
        Console.WriteLine($"  {ExperimentPaths.BaselineResults}/{{librain,naive-rag,single-llm}}/");
        Console.WriteLine("Next: `dotnet run --project LIBRAIN.Experiments -- analyze`");
        return 0;
    }

    private static async Task<int> CallEndpointAsync(
        HttpClient http,
        string endpoint,
        string system,
        string pairId,
        string payload,
        string outDir)
    {
        var sw = Stopwatch.StartNew();
        using var content = new StringContent(payload, Encoding.UTF8, "application/json");
        using var response = await http.PostAsync(endpoint, content);
        var body = await response.Content.ReadAsStringAsync();
        sw.Stop();

        if (!response.IsSuccessStatusCode)
        {
            Console.Error.WriteLine($"HALT: {system} {pairId} returned HTTP {(int)response.StatusCode}");
            Console.Error.WriteLine(body);
            return 2;
        }

        var outPath = Path.Combine(outDir, $"{pairId}.json");
        await File.WriteAllTextAsync(outPath, body);

        var parsed = JsonNode.Parse(body)!;
        var nov = parsed["evaluation"]!["noveltyScore"]!.GetValue<double>();
        var qual = parsed["evaluation"]!["qualityScore"]!.GetValue<double>();
        Console.WriteLine($"  {system,-10} → HTTP {(int)response.StatusCode}  elapsed={sw.ElapsedMilliseconds}ms  novelty={nov:F4}  quality={qual:F4}");
        return 0;
    }
}
