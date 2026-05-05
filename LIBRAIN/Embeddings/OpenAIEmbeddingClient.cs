using System.Diagnostics;
using LIBRAIN.Models;
using Microsoft.Extensions.Options;
using OpenAI.Embeddings;

namespace LIBRAIN.Embeddings;

public sealed class OpenAIEmbeddingClient(
    ILogger<OpenAIEmbeddingClient> logger,
    IOptions<OpenAIOptions> options)
{
    private const string Model = "text-embedding-3-small";
    private const int MaxInputsPerBatch = 100;
    private const int MaxTokensPerBatch = 250_000;
    private const int CharsPerToken = 4;

    private readonly ILogger<OpenAIEmbeddingClient> _logger = logger;
    private readonly EmbeddingClient _client = new(Model, options.Value.ApiKey);

    public async Task<IReadOnlyList<float[]>> GenerateAsync(
        IReadOnlyList<string> inputs,
        CancellationToken ct = default)
    {
        if (inputs.Count == 0)
        {
            return Array.Empty<float[]>();
        }

        var results = new float[inputs.Count][];
        var batches = BuildBatches(inputs);
        var sw = Stopwatch.StartNew();

        foreach (var batch in batches)
        {
            var slice = new string[batch.Count];
            for (int i = 0; i < batch.Count; i++)
            {
                slice[i] = inputs[batch.Start + i];
            }

            var response = await _client.GenerateEmbeddingsAsync(slice, cancellationToken: ct);

            int idx = 0;
            foreach (var embedding in response.Value)
            {
                results[batch.Start + idx] = embedding.ToFloats().ToArray();
                idx++;
            }
        }

        _logger.LogInformation(
            "Generated {InputCount} embedding(s) across {BatchCount} batch(es) in {ElapsedMs}ms",
            inputs.Count,
            batches.Count,
            sw.ElapsedMilliseconds);

        return results;
    }

    private static IReadOnlyList<(int Start, int Count)> BuildBatches(IReadOnlyList<string> inputs)
    {
        var batches = new List<(int Start, int Count)>();
        int start = 0;
        while (start < inputs.Count)
        {
            int count = 0;
            int tokenSum = 0;
            while (start + count < inputs.Count && count < MaxInputsPerBatch)
            {
                int next = inputs[start + count].Length / CharsPerToken;
                if (count > 0 && tokenSum + next > MaxTokensPerBatch)
                {
                    break;
                }
                tokenSum += next;
                count++;
            }
            batches.Add((start, count));
            start += count;
        }
        return batches;
    }
}
