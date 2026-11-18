using System.Diagnostics;
using LIBRAIN.Agents;
using LIBRAIN.Embeddings;
using LIBRAIN.Endpoints;
using LIBRAIN.Storage;

namespace LIBRAIN.Pipelines;

// Grounded question answering: retrieve → synthesize (citation contract) → evaluate.
// Shared by POST /api/query and its streaming variant.
public sealed class QueryPipeline(
    IEmbeddingClient embeddings,
    IPaperStore store,
    SynthesisAgent synthesis,
    EvaluatorAgent evaluator,
    ILogger<QueryPipeline> logger)
{
    public async Task<QueryResponse> RunAsync(
        string query, int topK, Action<PipelineProgress>? progress = null, CancellationToken ct = default)
    {
        var correlationId = Guid.NewGuid();
        using var scope = logger.BeginScope(new Dictionary<string, object> { ["correlationId"] = correlationId });
        var sw = Stopwatch.StartNew();

        progress?.Invoke(new(PipelineStages.Retrieving, "Searching the corpus"));
        var queryEmbedding = await embeddings.GenerateAsync(new[] { query }, ct).ConfigureAwait(false);
        var hits = await store.VectorSearchAsync(queryEmbedding[0], topK, ct).ConfigureAwait(false);
        if (hits.Count == 0)
        {
            logger.LogWarning("Vector search returned 0 hits");
            throw new NoSourcesException("Vector search returned no chunks for this query.");
        }
        progress?.Invoke(new(PipelineStages.Retrieved, $"Found {hits.Count} passages", hits.Count));

        progress?.Invoke(new(PipelineStages.Generating, "Writing a citation-grounded answer"));
        var synthesized = await synthesis.SynthesizeAsync(query, hits, correlationId, ct).ConfigureAwait(false);
        progress?.Invoke(new(PipelineStages.Validated,
            $"{synthesized.Citations.Count} citation(s) resolved to retrieved passages", synthesized.Citations.Count));

        progress?.Invoke(new(PipelineStages.Evaluating, "Judging groundedness, relevance and completeness"));
        var evaluation = await evaluator.EvaluateAsync(query, synthesized.Hypothesis, hits, correlationId, ct).ConfigureAwait(false);

        logger.LogInformation("Query handled (hits={HitCount}, quality={QualityScore:F2}) in {ElapsedMs}ms",
            hits.Count, evaluation.QualityScore, sw.ElapsedMilliseconds);

        return new QueryResponse(
            CorrelationId: correlationId,
            Hypothesis: synthesized.Hypothesis,
            Citations: synthesized.Citations,
            SynthesisConfidence: synthesized.Confidence,
            Evaluation: new EvaluationSummary(
                QualityScore: evaluation.QualityScore,
                GroundednessScore: evaluation.GroundednessScore,
                RelevanceScore: evaluation.RelevanceScore,
                CompletenessScore: evaluation.CompletenessScore,
                Critique: evaluation.Critique,
                UnsupportedClaims: evaluation.UnsupportedClaims,
                MissingEvidence: evaluation.MissingEvidence));
    }
}
