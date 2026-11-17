using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using LIBRAIN.Agents;
using LIBRAIN.Embeddings;
using LIBRAIN.Endpoints;
using LIBRAIN.Retrieval;
using LIBRAIN.Storage;

namespace LIBRAIN.Generation;

// OpenAI-backed port of the end-to-end Discovery pipeline (DiscoveryAgent +
// DiscoveryEvaluator + ClaimValidator), used for the cross-family experiments. The
// LLM calls swap to OpenAI (JSON output); the model-agnostic rules are shared code
// with the Anthropic path, not copies: DiscoveryContract (citation validation and
// extrapolation-basis validation), ClaimValidationScoring.BuildResult,
// EvaluationScoring, DiscoveryScoring and NoveltyScorer. Prompts are still separate
// (shortened for JSON mode). Produces the same DiscoverResponse.
public sealed class OpenAiDiscoveryAgent(
    ILogger<OpenAiDiscoveryAgent> logger,
    OpenAIChatClient openai,
    TopicRetriever retriever,
    NoveltyScorer noveltyScorer)
{
    private readonly ILogger<OpenAiDiscoveryAgent> _logger = logger;
    private readonly OpenAIChatClient _openai = openai;
    private readonly TopicRetriever _retriever = retriever;
    private readonly NoveltyScorer _noveltyScorer = noveltyScorer;

    // Same Discovery contract as DiscoveryAgent.SystemPrompt; tail asks for JSON
    // (OpenAI) instead of a forced tool call.
    private const string DiscoverySystem = """
        You are a discovery agent for a literature-cross-reference system. You are given
        one or two topics and a numbered list of source excerpts retrieved from academic
        papers covering each topic.

        Your job is the OPPOSITE of grounded synthesis: propose a hypothesis that goes
        BEYOND what the cited sources directly state. Connect ideas across the retrieved
        chunks into a claim that requires inferential extrapolation. The unsupported
        part is the discovery, and flagging it explicitly is the contract.

        - hypothesis: a 1-3 sentence claim combining evidence-grounded parts with the novel extrapolation.
        - supporting_evidence: chunks supporting the hypothesis; each {paper_id, chunk_index, support_type}
          where support_type is "direct" or "analogous". paper_id and chunk_index MUST be taken EXACTLY from a SOURCES entry.
        - novel_claim: the substring of hypothesis NOT directly supported by any retrieved chunk. MUST be non-empty.
        - extrapolation_basis: one entry per sentence in novel_claim: {claim_sentence, basis_type, grounded_in_chunk_id, rationale}
          basis_type is "generalization" | "analogy" | "pure_speculation"; grounded_in_chunk_id is "paper_id:chunk_index"
          for generalization/analogy and null for pure_speculation; rationale <=240 chars. Label speculation; do not state it as fact.
        - reasoning: 1-2 sentences connecting supporting evidence to the novel claim.

        Do not invent paper IDs or chunk indices. Respond with ONLY a JSON object:
        {"hypothesis": "...", "supporting_evidence": [{"paper_id":"...","chunk_index":0,"support_type":"direct"}],
         "novel_claim": "...", "extrapolation_basis": [{"claim_sentence":"...","basis_type":"analogy","grounded_in_chunk_id":"paper:0","rationale":"..."}],
         "reasoning": "..."}
        """;

    private const string EvaluatorSystem = """
        You are an impartial scientific reviewer evaluating a discovery hypothesis with a
        flagged novel claim (the substring not directly stated in any source). Score two
        independent 0.0-1.0 axes:
        - plausibility: does the novel claim follow logically from the supporting evidence
          and reasonable corpus context, though not directly stated? 0.0 contradicts/unanchored,
          1.0 tight inferential bridge, 0.5 borderline.
        - structural_coherence: is the hypothesis a well-formed, testable, falsifiable
          statement? 0.0 vague/untestable, 1.0 precise and experiment-ready.
        Be a strict judge; use the full continuous range, do not snap to 0.5/1.0. Respond
        with ONLY: {"plausibility": 0.0, "structural_coherence": 0.0, "rationale": "1-2 sentences"}
        """;

    private const string ClaimValidatorSystem = """
        You are a claim-level factuality validator. Given the novel_claim of a discovery
        hypothesis and the retrieved source chunks, split novel_claim into sentences and
        classify each:
        - GROUNDED: directly supported by >=1 retrieved chunk; cite them in supporting_chunks as "paper_id:chunk_index".
        - EXTRAPOLATED: speculative/hypothesis-framed, beyond evidence but NOT asserting a specific fact as established
          (hedging: "could", "may", "suggests").
        - RISKY: states a SPECIFIC FACTUAL CLAIM (mechanism/quantity/named entity/date/attribution) as established,
          unsupported by any retrieved chunk (confident factual framing without support).
        Per sentence return factual_hallucination_probability in [0,1] (GROUNDED ~0, EXTRAPOLATED ~0.1-0.3, RISKY ~0.6-1.0)
        and a one-sentence rationale. Respond with ONLY:
        {"claims": [{"sentence":"...","factuality_status":"GROUNDED","supporting_chunks":["paper:0"],"factual_hallucination_probability":0.0,"rationale":"..."}], "aggregate_risk": 0.0}
        """;

    public async Task<DiscoverResponse> DiscoverAsync(DiscoverRequest req, string model, CancellationToken ct = default)
    {
        var corrId = Guid.NewGuid();
        var topicA = req.TopicA.Trim();
        var topicB = string.IsNullOrWhiteSpace(req.TopicB) ? null : req.TopicB!.Trim();
        var topK = req.TopK ?? 5;
        if (topicB is not null && string.Equals(topicA, topicB, StringComparison.Ordinal))
            throw new ArgumentException("topicA and topicB must differ.", nameof(req));

        // Retrieval — identical to DiscoveryAgent (first-seen dedup union).
        var retrieval = await _retriever.RetrieveAsync(topicA, topicB, topK, ct).ConfigureAwait(false);
        var seenKeys = retrieval.Keys;
        var dedup = retrieval.Union;
        if (dedup.Count == 0)
            throw new InvalidOperationException($"No sources retrieved (correlationId={corrId}).");

        // Generation (OpenAI JSON).
        var (text, _, _) = await _openai.CompleteAsync(DiscoverySystem, BuildSourcesPrompt(topicA, topicB, dedup), model, 0.2f, ct).ConfigureAwait(false);
        var input = (NaiveRagCitations.ExtractJsonObject(text) is string js ? JsonNode.Parse(js) : null)
            ?? throw new InvalidOperationException($"OpenAI discovery returned no JSON object (correlationId={corrId}).");

        var hypothesis = LlmJson.GetString(input["hypothesis"])
            ?? throw new InvalidOperationException($"Missing 'hypothesis' (correlationId={corrId}).");
        var novelClaim = LlmJson.GetString(input["novel_claim"]) ?? string.Empty;
        if (string.IsNullOrWhiteSpace(novelClaim))
            throw new InvalidOperationException($"Discovery contract violation: empty novel_claim (correlationId={corrId}).");
        var reasoning = LlmJson.GetString(input["reasoning"]) ?? string.Empty;

        // Same contract as the Anthropic path (shared code, not a copy).
        var evidenceCheck = DiscoveryContract.ValidateEvidence(LlmJson.GetArray(input["supporting_evidence"]), dedup);
        var validatedEvidence = evidenceCheck.Evidence;
        var citedHits = evidenceCheck.CitedHits;
        var dropped = evidenceCheck.Dropped;
        var basisCheck = DiscoveryContract.ValidateBasisOrThrow(
            LlmJson.GetArray(input["extrapolation_basis"]), seenKeys, corrId);
        var validatedBasis = basisCheck.Basis;

        // Parallel scoring (same as the Anthropic path), all on OpenAI/embeddings.
        var noveltyTask = _noveltyScorer.ScoreAsync(novelClaim, ct);
        var evalTask = EvaluateAsync(hypothesis, novelClaim, citedHits, model, ct);
        var claimsTask = ValidateClaimsAsync(novelClaim, dedup, model, ct);
        await Task.WhenAll(noveltyTask, evalTask, claimsTask).ConfigureAwait(false);

        var (plausibility, coherence) = evalTask.Result;
        var evaluation = DiscoveryScoring.Aggregate(noveltyTask.Result, plausibility, coherence);

        _logger.LogInformation(
            "OpenAI discovery ({Model}): evidence={Ev}/{Raw} dropped={Drop} novelty={N:F3} plausibility={P:F2} coherence={C:F2} quality={Q:F3} aggRisk={R:F2} (corr={Corr})",
            model, validatedEvidence.Count, evidenceCheck.Claimed, dropped, evaluation.NoveltyScore, plausibility, coherence,
            evaluation.QualityScore, claimsTask.Result.AggregateRisk, corrId);

        return new DiscoverResponse(corrId, hypothesis, validatedEvidence, novelClaim, validatedBasis,
            claimsTask.Result, reasoning, evaluation, evidenceCheck.Claimed, dropped);
    }

    private async Task<(float Plausibility, float Coherence)> EvaluateAsync(
        string hypothesis, string novelClaim, IReadOnlyList<SearchHit> citedHits, string model, CancellationToken ct)
    {
        var sb = new StringBuilder();
        sb.Append("HYPOTHESIS: ").AppendLine(hypothesis).AppendLine();
        sb.Append("NOVEL CLAIM: ").AppendLine(novelClaim).AppendLine();
        sb.AppendLine("SUPPORTING EVIDENCE:");
        for (int i = 0; i < citedHits.Count; i++)
        {
            var c = citedHits[i];
            sb.Append('[').Append(i + 1).Append("] ").Append(c.PaperId);
            if (c.Section is not null) sb.Append(" | ").Append(c.Section);
            sb.AppendLine().AppendLine(c.Content).AppendLine();
        }
        var (text, _, _) = await _openai.CompleteAsync(EvaluatorSystem, sb.ToString(), model, 0.0f, ct).ConfigureAwait(false);
        var node = ParseJsonObject(text, "discovery evaluation");
        return (EvaluationScoring.RequireScore(LlmJson.GetDouble(node["plausibility"]), "plausibility"),
                EvaluationScoring.RequireScore(LlmJson.GetDouble(node["structural_coherence"]), "structural_coherence"));
    }

    private async Task<ClaimValidationResult> ValidateClaimsAsync(
        string novelClaim, IReadOnlyList<SearchHit> retrievedChunks, string model, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(novelClaim))
            return new ClaimValidationResult(Array.Empty<ClaimValidationEntry>(), 0f);

        var sb = new StringBuilder();
        sb.AppendLine("NOVEL CLAIM (split into sentences and classify each):").AppendLine(novelClaim).AppendLine();
        sb.AppendLine("RETRIEVED CHUNKS (cite by 'paper_id:chunk_index' for GROUNDED claims):");
        foreach (var c in retrievedChunks)
        {
            sb.Append('[').Append(c.PaperId).Append(':').Append(c.ChunkIndex).Append(']');
            if (c.Section is not null) sb.Append(" | ").Append(c.Section);
            sb.AppendLine().AppendLine(c.Content).AppendLine();
        }
        var (text, _, _) = await _openai.CompleteAsync(ClaimValidatorSystem, sb.ToString(), model, 0.0f, ct).ConfigureAwait(false);
        var node = ParseJsonObject(text, "claim validation");
        var retrievedKeys = new HashSet<string>(retrievedChunks.Select(c => $"{c.PaperId}:{c.ChunkIndex}"));
        var (result, stats) = ClaimValidationScoring.BuildResult(LlmJson.GetArray(node["claims"]), retrievedKeys);
        if (result.ValidationFailed)
        {
            _logger.LogError(
                "OpenAI claim validator returned no usable claim entries ({RequestedCount} requested); aggregateRisk=1.0 (fail closed)",
                stats.Requested);
        }
        return result;
    }

    // No JSON object in a judge/validator reply is an invalid response. It used to be
    // read as "no scores" (0 / zero risk); now it fails loudly like the Anthropic path
    // does when the forced tool call is missing.
    private static JsonNode ParseJsonObject(string text, string purpose)
    {
        var json = NaiveRagCitations.ExtractJsonObject(text)
            ?? throw new InvalidOperationException($"OpenAI {purpose} reply contained no JSON object.");
        return JsonNode.Parse(json)
            ?? throw new InvalidOperationException($"OpenAI {purpose} reply contained an empty JSON value.");
    }

    private static string BuildSourcesPrompt(string topicA, string? topicB, IReadOnlyList<SearchHit> chunks)
    {
        var sb = new StringBuilder();
        sb.Append("TOPIC A: ").AppendLine(topicA);
        if (topicB is not null) sb.Append("TOPIC B: ").AppendLine(topicB);
        sb.AppendLine().AppendLine("SOURCES (cite by paper_id + chunk_index):");
        foreach (var c in chunks)
        {
            sb.Append("[paper_id=").Append(c.PaperId).Append(" chunk_index=").Append(c.ChunkIndex);
            if (c.Section is not null) sb.Append(" | ").Append(c.Section);
            if (c.PageNumber is not null) sb.Append(" | p.").Append(c.PageNumber);
            sb.AppendLine("]").AppendLine(c.Content).AppendLine();
        }
        return sb.ToString();
    }
}
