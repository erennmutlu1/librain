using System.Diagnostics;
using Anthropic.SDK.Constants;
using Anthropic.SDK.Messaging;
using LIBRAIN.Endpoints;
using LIBRAIN.Storage;

namespace LIBRAIN.Agents;

public sealed record SingleLlmResult(
    Guid CorrelationId,
    string Hypothesis,
    DiscoveryEvaluation Evaluation,
    long TotalElapsedMs,
    int InputTokens,
    int OutputTokens);

// Baseline #1: single LLM call with topic(s) only. No retrieval, no structured tool-use,
// no agent decomposition, no citation contract. The Claude output is treated as the
// hypothesis verbatim. Used as the "no-RAG, no-agents" lower bound for RQ1 / RQ3.
public sealed class SingleLlmAgent(
    ILogger<SingleLlmAgent> logger,
    AnthropicChatClient claude,
    NoveltyScorer noveltyScorer,
    DiscoveryEvaluatorAgent evaluator)
{
    private readonly ILogger<SingleLlmAgent> _logger = logger;
    private readonly AnthropicChatClient _claude = claude;
    private readonly NoveltyScorer _noveltyScorer = noveltyScorer;
    private readonly DiscoveryEvaluatorAgent _evaluator = evaluator;

    private const string SystemPrompt = """
        You are a scientific research assistant. Given one or two topics, propose a single
        hypothesis (1–3 sentences) exploring the relationship or a substantive insight
        about them. Be concise. Do not cite specific papers or chunk identifiers; you have
        no access to a literature database. Respond in plain text only.
        """;

    public async Task<SingleLlmResult> RunAsync(
        string topicA,
        string? topicB,
        CancellationToken ct = default)
    {
        var corrId = Guid.NewGuid();
        using var scope = _logger.BeginScope(new Dictionary<string, object>
        {
            ["correlationId"] = corrId,
            ["pipeline"] = "single-llm",
        });

        var totalSw = Stopwatch.StartNew();
        var userPrompt = BuildUserPrompt(topicA, topicB);

        var parameters = new MessageParameters
        {
            Messages = new List<Message> { new Message(RoleType.User, userPrompt) },
            System = new List<SystemMessage> { new SystemMessage(SystemPrompt) },
            MaxTokens = 1024,
            Model = AnthropicModels.Claude46Sonnet,
            Temperature = 0.2m,
            Stream = false,
            PromptCaching = PromptCacheType.AutomaticToolsAndSystem,
        };

        var sw = Stopwatch.StartNew();
        var res = await _claude.ChatAsync(parameters, ct).ConfigureAwait(false);
        var synthElapsedMs = sw.ElapsedMilliseconds;

        var hypothesis = string.Join(
            "",
            res.Content.OfType<TextContent>().Select(t => t.Text)).Trim();

        if (string.IsNullOrWhiteSpace(hypothesis))
        {
            throw new InvalidOperationException(
                $"Single-LLM baseline returned empty text (correlationId={corrId}, stopReason={res.StopReason})");
        }

        _logger.LogInformation(
            "Single-LLM synthesis: input={InputTokens} output={OutputTokens} cacheRead={CacheRead} cacheCreate={CacheCreate} tokens; hypothesisChars={HypothesisChars} in {ElapsedMs}ms",
            res.Usage.InputTokens, res.Usage.OutputTokens,
            res.Usage.CacheReadInputTokens, res.Usage.CacheCreationInputTokens,
            hypothesis.Length, synthElapsedMs);

        // No novelClaim fence in this baseline → score the full hypothesis as the
        // speculative claim. No retrieval → empty cited-chunk set for the evaluator.
        sw.Restart();
        var noveltyScore = await _noveltyScorer.ScoreAsync(hypothesis, ct).ConfigureAwait(false);
        var noveltyElapsedMs = sw.ElapsedMilliseconds;

        sw.Restart();
        var (plausibility, structuralCoherence, _) =
            await _evaluator.EvaluateAsync(hypothesis, hypothesis, Array.Empty<SearchHit>(), ct).ConfigureAwait(false);
        var evalElapsedMs = sw.ElapsedMilliseconds;

        var evaluation = DiscoveryScoring.Aggregate(noveltyScore, plausibility, structuralCoherence);

        _logger.LogInformation(
            "Single-LLM scoring: novelty={Novelty:F4} plausibility={Plausibility:F2} structuralCoherence={StructuralCoherence:F2} quality={Quality:F4} (novelty+{NoveltyMs}ms eval+{EvalMs}ms)",
            evaluation.NoveltyScore, evaluation.PlausibilityScore, evaluation.StructuralCoherenceScore, evaluation.QualityScore, noveltyElapsedMs, evalElapsedMs);

        return new SingleLlmResult(
            CorrelationId: corrId,
            Hypothesis: hypothesis,
            Evaluation: evaluation,
            TotalElapsedMs: totalSw.ElapsedMilliseconds,
            InputTokens: res.Usage.InputTokens,
            OutputTokens: res.Usage.OutputTokens);
    }

    private static string BuildUserPrompt(string topicA, string? topicB)
    {
        if (string.IsNullOrWhiteSpace(topicB))
        {
            return $"TOPIC: {topicA.Trim()}\n\nPropose a hypothesis about this topic.";
        }
        return $"TOPIC A: {topicA.Trim()}\nTOPIC B: {topicB.Trim()}\n\nPropose a hypothesis about the relationship between these two topics.";
    }
}
