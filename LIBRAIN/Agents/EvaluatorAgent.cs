using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using Anthropic.SDK.Common;
using Anthropic.SDK.Constants;
using Anthropic.SDK.Messaging;
using LIBRAIN.Storage;
using AnthropicTool = Anthropic.SDK.Common.Tool;

namespace LIBRAIN.Agents;

public sealed class EvaluatorAgent(
    ILogger<EvaluatorAgent> logger,
    AnthropicChatClient claude)
{
    private readonly ILogger<EvaluatorAgent> _logger = logger;
    private readonly AnthropicChatClient _claude = claude;

    private const string SystemPromptText = """
        You are an evaluator for a research-synthesis system. You will be given a user
        query, a hypothesis the system produced, and the source excerpts the system was
        allowed to use. Your job is to score the hypothesis on three independent
        dimensions, each on a 0.0-1.0 scale:

        - groundedness: Does every claim in the hypothesis trace back to one of the
          cited sources? 1.0 = fully supported. 0.0 = fabricated or contradicted by
          sources. List specific unsupported claims in `unsupported_claims`.
        - relevance: Does the hypothesis answer the user's query? 1.0 = directly
          addresses the question. 0.0 = drifts to an unrelated topic.
        - completeness: Does the hypothesis integrate the available sources, or
          cherry-pick one and ignore others? 1.0 = uses all relevant sources well.
          0.0 = ignores most of the evidence. List missing evidence in
          `missing_evidence` (what would strengthen the hypothesis).

        Be a strict, fair judge. A confident-sounding hypothesis with one fabricated
        claim should score below 0.5 on groundedness regardless of how it reads.

        Always call the `submit_evaluation` tool. Do not respond in plain text.
        """;

    // Schema is raw JSON because Anthropic.SDK.Messaging.Property in 5.10 has no Items field;
    // see SynthesisAgent for the same constraint. Function's (string, string, JsonNode) ctor
    // accepts a parsed schema directly.
    private const string ToolSchemaJson = """
        {
          "type": "object",
          "properties": {
            "groundedness_score": { "type": "number", "description": "0.0 to 1.0. Are the hypothesis's claims supported by the cited sources?" },
            "relevance_score":    { "type": "number", "description": "0.0 to 1.0. Does the hypothesis answer the user's query?" },
            "completeness_score": { "type": "number", "description": "0.0 to 1.0. Does the hypothesis integrate the available sources?" },
            "critique":           { "type": "string", "description": "One paragraph qualitative summary of strengths and weaknesses." },
            "unsupported_claims": { "type": "array",  "items": { "type": "string" }, "description": "Specific claims in the hypothesis not backed by any cited source." },
            "missing_evidence":   { "type": "array",  "items": { "type": "string" }, "description": "What additional evidence would strengthen the hypothesis." }
          },
          "required": ["groundedness_score", "relevance_score", "completeness_score", "critique", "unsupported_claims", "missing_evidence"]
        }
        """;

    private static readonly AnthropicTool SubmitEvaluationTool =
        new Function("submit_evaluation", "Submit a multi-dimensional evaluation of a hypothesis.", JsonNode.Parse(ToolSchemaJson)!);

    public async Task<EvaluationResult> EvaluateAsync(
        string query,
        string hypothesis,
        IReadOnlyList<SearchHit> chunks,
        Guid? correlationId = null,
        CancellationToken ct = default)
    {
        var corrId = correlationId ?? Guid.NewGuid();
        using var scope = _logger.BeginScope(new Dictionary<string, object>
        {
            ["correlationId"] = corrId,
            ["chunkCount"] = chunks.Count,
        });

        if (string.IsNullOrWhiteSpace(hypothesis))
        {
            _logger.LogWarning("Evaluation skipped: empty hypothesis");
            return new EvaluationResult(
                QualityScore: 0f,
                GroundednessScore: 0f,
                RelevanceScore: 0f,
                CompletenessScore: 0f,
                Critique: "No hypothesis to evaluate.",
                UnsupportedClaims: Array.Empty<string>(),
                MissingEvidence: Array.Empty<string>(),
                CorrelationId: corrId);
        }

        if (chunks.Count == 0)
        {
            _logger.LogWarning("Evaluation skipped: no source chunks provided");
            return new EvaluationResult(
                QualityScore: 0f,
                GroundednessScore: 0f,
                RelevanceScore: 0f,
                CompletenessScore: 0f,
                Critique: "No sources provided to evaluate against.",
                UnsupportedClaims: Array.Empty<string>(),
                MissingEvidence: Array.Empty<string>(),
                CorrelationId: corrId);
        }

        var sw = Stopwatch.StartNew();
        var parameters = new MessageParameters
        {
            Messages = new List<Message> { new Message(RoleType.User, BuildUserPrompt(query, hypothesis, chunks)) },
            System = new List<SystemMessage> { new SystemMessage(SystemPromptText) },
            Tools = new List<AnthropicTool> { SubmitEvaluationTool },
            ToolChoice = new ToolChoice { Type = ToolChoiceType.Tool, Name = "submit_evaluation" },
            MaxTokens = 1024,
            Model = AnthropicModels.Claude45Haiku,
            Temperature = 0.0m,
            Stream = false,
            PromptCaching = PromptCacheType.AutomaticToolsAndSystem,
        };

        var res = await _claude.ChatAsync(parameters, ct).ConfigureAwait(false);

        var toolUse = res.Content.OfType<ToolUseContent>().FirstOrDefault();
        if (toolUse is null)
        {
            _logger.LogWarning("Forced tool call did not fire (stopReason={StopReason})", res.StopReason);
            throw new InvalidOperationException(
                $"Claude did not emit a tool_use block (correlationId={corrId}, stopReason={res.StopReason})");
        }

        var input = toolUse.Input ?? throw new InvalidOperationException(
            $"Tool use block had null input (correlationId={corrId})");

        var rawG = input["groundedness_score"]?.GetValue<double>();
        var rawR = input["relevance_score"]?.GetValue<double>();
        var rawC = input["completeness_score"]?.GetValue<double>();

        var groundedness = EvaluationScoring.Clamp01(rawG);
        var relevance = EvaluationScoring.Clamp01(rawR);
        var completeness = EvaluationScoring.Clamp01(rawC);
        var quality = EvaluationScoring.Aggregate(groundedness, relevance, completeness);

        int clampedCount = 0;
        if (IsOutOfBand(rawG)) clampedCount++;
        if (IsOutOfBand(rawR)) clampedCount++;
        if (IsOutOfBand(rawC)) clampedCount++;
        if (clampedCount > 0)
        {
            _logger.LogInformation(
                "Clamped {ClampedCount} of 3 evaluator score(s) into [0,1]",
                clampedCount);
        }

        var critique = input["critique"]?.GetValue<string>() ?? string.Empty;

        var unsupported = input["unsupported_claims"]?.AsArray()
            .Select(n => n?.GetValue<string>() ?? string.Empty)
            .Where(s => !string.IsNullOrEmpty(s))
            .ToArray() ?? Array.Empty<string>();

        var missing = input["missing_evidence"]?.AsArray()
            .Select(n => n?.GetValue<string>() ?? string.Empty)
            .Where(s => !string.IsNullOrEmpty(s))
            .ToArray() ?? Array.Empty<string>();

        _logger.LogInformation(
            "Evaluated hypothesis (q={QualityScore:F2} g={Groundedness:F2} r={Relevance:F2} c={Completeness:F2}; input={InputTokens} output={OutputTokens} cacheRead={CacheRead} cacheCreate={CacheCreate} tokens) in {ElapsedMs}ms",
            quality, groundedness, relevance, completeness,
            res.Usage.InputTokens, res.Usage.OutputTokens,
            res.Usage.CacheReadInputTokens, res.Usage.CacheCreationInputTokens,
            sw.ElapsedMilliseconds);

        return new EvaluationResult(
            QualityScore: quality,
            GroundednessScore: groundedness,
            RelevanceScore: relevance,
            CompletenessScore: completeness,
            Critique: critique,
            UnsupportedClaims: unsupported,
            MissingEvidence: missing,
            CorrelationId: corrId);
    }

    private static bool IsOutOfBand(double? raw)
        => raw is null || double.IsNaN(raw.Value) || raw.Value < 0.0 || raw.Value > 1.0;

    private static string BuildUserPrompt(string query, string hypothesis, IReadOnlyList<SearchHit> chunks)
    {
        var sb = new StringBuilder();
        sb.Append("QUERY: ").AppendLine(query);
        sb.AppendLine();
        sb.Append("HYPOTHESIS: ").AppendLine(hypothesis);
        sb.AppendLine();
        sb.AppendLine("SOURCES:");
        for (int i = 0; i < chunks.Count; i++)
        {
            var c = chunks[i];
            sb.Append('[').Append(i + 1).Append("] ").Append(c.PaperId);
            if (c.Section is not null) sb.Append(" | ").Append(c.Section);
            if (c.PageNumber is not null) sb.Append(" | p.").Append(c.PageNumber);
            sb.AppendLine();
            sb.AppendLine(c.Content);
            sb.AppendLine();
        }
        return sb.ToString();
    }
}

public static class EvaluationScoring
{
    public static float Clamp01(double? raw)
    {
        if (raw is null || double.IsNaN(raw.Value)) return 0f;
        var v = raw.Value;
        if (v < 0.0) return 0f;
        if (v > 1.0) return 1f;
        return (float)v;
    }

    public static float Aggregate(float groundedness, float relevance, float completeness)
        => (groundedness + relevance + completeness) / 3f;
}
