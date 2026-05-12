using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using Anthropic.SDK.Common;
using Anthropic.SDK.Constants;
using Anthropic.SDK.Messaging;
using LIBRAIN.Storage;
using AnthropicTool = Anthropic.SDK.Common.Tool;

namespace LIBRAIN.Agents;

public sealed class DiscoveryEvaluatorAgent(
    ILogger<DiscoveryEvaluatorAgent> logger,
    AnthropicChatClient claude)
{
    private readonly ILogger<DiscoveryEvaluatorAgent> _logger = logger;
    private readonly AnthropicChatClient _claude = claude;

    private const string SystemPromptText = """
        You are an impartial scientific reviewer evaluating a discovery hypothesis. The
        hypothesis combines evidence-grounded portions with a flagged novel claim, the
        substring that is NOT directly stated in any supporting source. Your job is to
        score the hypothesis on two independent dimensions, each on a continuous
        0.0–1.0 scale:

        - plausibility: Does the novel claim follow logically from the supporting
          evidence and reasonable corpus context, even though it is not directly
          stated? 0.0 = the novel claim contradicts the evidence or has no logical
          bridge to it. 1.0 = the inferential bridge is tight and would persuade a
          careful reviewer. 0.5 = borderline; speculative but not incoherent.
        - structural_coherence: Is the hypothesis a well-formed, testable,
          falsifiable scientific statement? 0.0 = vague, untestable, or
          ungrammatical. 1.0 = precise, testable, properly-scoped: a scientist
          could design an experiment from this. 0.5 = mostly testable but with one
          loose construct or scoping issue.

        Be a strict judge. A confidently-phrased but logically unanchored novel claim
        should score below 0.3 on plausibility regardless of how it reads. Use the full
        continuous range; do not snap to 0.5 / 1.0.

        Provide a single rationale (1–2 sentences) covering both axes.

        Always call the `submit_discovery_evaluation` tool. Do not respond in plain text.
        """;

    private const string ToolSchemaJson = """
        {
          "type": "object",
          "properties": {
            "plausibility":         { "type": "number", "description": "0.0 to 1.0. Does the novel claim follow logically from the supporting evidence?" },
            "structural_coherence": { "type": "number", "description": "0.0 to 1.0. Is the hypothesis a well-formed, testable, falsifiable scientific statement?" },
            "rationale":            { "type": "string", "description": "1-2 sentence justification covering both axes." }
          },
          "required": ["plausibility", "structural_coherence", "rationale"]
        }
        """;

    private static readonly AnthropicTool SubmitDiscoveryEvaluationTool =
        new Function(
            "submit_discovery_evaluation",
            "Submit a two-axis evaluation of a discovery hypothesis (plausibility + structural coherence).",
            JsonNode.Parse(ToolSchemaJson)!);

    public async Task<(float Plausibility, float StructuralCoherence, string Rationale)> EvaluateAsync(
        string hypothesis,
        string novelClaim,
        IReadOnlyList<SearchHit> citedChunks,
        CancellationToken ct = default)
    {
        var sw = Stopwatch.StartNew();

        var parameters = new MessageParameters
        {
            Messages = new List<Message> { new Message(RoleType.User, BuildUserPrompt(hypothesis, novelClaim, citedChunks)) },
            System = new List<SystemMessage> { new SystemMessage(SystemPromptText) },
            Tools = new List<AnthropicTool> { SubmitDiscoveryEvaluationTool },
            ToolChoice = new ToolChoice { Type = ToolChoiceType.Tool, Name = "submit_discovery_evaluation" },
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
            _logger.LogError(
                "Discovery evaluator: forced tool call did not fire (stopReason={StopReason})",
                res.StopReason);
            throw new InvalidOperationException(
                $"Claude did not emit a tool_use block for discovery evaluation (stopReason={res.StopReason})");
        }

        var input = toolUse.Input ?? throw new InvalidOperationException(
            "Discovery evaluator tool use block had null input.");

        var rawP = input["plausibility"]?.GetValue<double>();
        var rawC = input["structural_coherence"]?.GetValue<double>();

        var plausibility = EvaluationScoring.Clamp01(rawP);
        var structuralCoherence = EvaluationScoring.Clamp01(rawC);

        int clamped = 0;
        if (IsOutOfBand(rawP)) clamped++;
        if (IsOutOfBand(rawC)) clamped++;
        if (clamped > 0)
        {
            _logger.LogWarning(
                "Discovery evaluator: clamped {ClampedCount} of 2 score(s) into [0,1] (rawP={RawP} rawC={RawC})",
                clamped, rawP, rawC);
        }

        var rationale = input["rationale"]?.GetValue<string>() ?? string.Empty;

        _logger.LogInformation(
            "Discovery evaluation: plausibility={Plausibility:F2} structuralCoherence={StructuralCoherence:F2} (input={InputTokens} output={OutputTokens} cacheRead={CacheRead} cacheCreate={CacheCreate} tokens) in {ElapsedMs}ms",
            plausibility, structuralCoherence,
            res.Usage.InputTokens, res.Usage.OutputTokens,
            res.Usage.CacheReadInputTokens, res.Usage.CacheCreationInputTokens,
            sw.ElapsedMilliseconds);

        _logger.LogDebug(
            "Discovery evaluation rationale: {Rationale}",
            rationale);

        return (plausibility, structuralCoherence, rationale);
    }

    private static bool IsOutOfBand(double? raw)
        => raw is null || double.IsNaN(raw.Value) || raw.Value < 0.0 || raw.Value > 1.0;

    private static string BuildUserPrompt(string hypothesis, string novelClaim, IReadOnlyList<SearchHit> citedChunks)
    {
        var sb = new StringBuilder();
        sb.Append("HYPOTHESIS: ").AppendLine(hypothesis);
        sb.AppendLine();
        sb.Append("NOVEL CLAIM: ").AppendLine(novelClaim);
        sb.AppendLine();
        sb.AppendLine("SUPPORTING EVIDENCE:");
        for (int i = 0; i < citedChunks.Count; i++)
        {
            var c = citedChunks[i];
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
