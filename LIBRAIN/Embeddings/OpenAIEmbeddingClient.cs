using System.Diagnostics;
using LIBRAIN.Llm;
using OpenAI.Embeddings;

namespace LIBRAIN.Embeddings;

// Scoped: one instance per request, built with that request's OpenAI key (the visitor's
// own key in public mode, see IProviderKeys).
public sealed class OpenAIEmbeddingClient(
    ILogger<OpenAIEmbeddingClient> logger,
    IProviderKeys keys) : IEmbeddingClient
{
    private const string Model = "text-embedding-3-small";
    private const int MaxInputsPerBatch = 100;
    // OpenAI Tier 1 (new accounts) caps text-embedding-3-small at 40K TPM.
    // 35K per batch + 1.5s gap keeps us safely under both per-request and
    // rolling-window limits. On higher tiers this is conservative; revisit
    // when account graduates (auto-detect via 200 OK history? defer to later).
    private const int MaxTokensPerBatch = 35_000;
    private const int InterBatchDelayMs = 1500;
    private const int CharsPerToken = 4;

    private readonly ILogger<OpenAIEmbeddingClient> _logger = logger;
    private EmbeddingClient? _client;

    // Created on first use, so a request that never embeds needs no key.
    private EmbeddingClient Client => _client ??= new(Model, keys.OpenAI ?? throw MissingKey(keys));

    internal static Exception MissingKey(IProviderKeys keys) => keys.PublicMode
        ? new ProviderKeyMissingException("OpenAI")
        : new InvalidOperationException(
            "OpenAI:ApiKey is not configured. Set it with: dotnet user-secrets set \"OpenAI:ApiKey\" \"sk-...\" --project LIBRAIN");

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

        for (int batchIndex = 0; batchIndex < batches.Count; batchIndex++)
        {
            var batch = batches[batchIndex];
            var slice = new string[batch.Count];
            for (int i = 0; i < batch.Count; i++)
            {
                slice[i] = inputs[batch.Start + i];
            }

            var response = await Client.GenerateEmbeddingsAsync(slice, cancellationToken: ct);

            int idx = 0;
            foreach (var embedding in response.Value)
            {
                results[batch.Start + idx] = embedding.ToFloats().ToArray();
                idx++;
            }

            if (batchIndex < batches.Count - 1)
            {
                await Task.Delay(InterBatchDelayMs, ct);
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
