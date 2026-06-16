using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using LIBRAIN.Agents;
using LIBRAIN.Embeddings;
using LIBRAIN.Endpoints;
using LIBRAIN.Storage;

namespace LIBRAIN.Generation;

// OpenAI-backed port of the REAL end-to-end Discovery pipeline (DiscoveryAgent +
// DiscoveryEvaluator + ClaimValidator), used when Anthropic is unavailable. The LLM
// calls swap to OpenAI (JSON output); ALL the model-agnostic logic is reused verbatim
// from the Anthropic path: the citation-validation contract (supporting_evidence must
// resolve to the retrieval set, else dropped), the novelClaim fence, extrapolation
// basis validation, ClaimValidationScoring, EvaluationScoring, DiscoveryScoring,
// NoveltyScorer. Produces the same DiscoverResponse. Does NOT touch the Anthropic path.
public sealed class OpenAiDiscoveryAgent(
    ILogger<OpenAiDiscoveryAgent> logger,
    OpenAIChatClient openai,
    OpenAIEmbeddingClient embeddings,
    QdrantPaperRepository repo,
    NoveltyScorer noveltyScorer)
{
    private readonly ILogger<OpenAiDiscoveryAgent> _logger = logger;
    private readonly OpenAIChatClient _openai = openai;
    private readonly OpenAIEmbeddingClient _embeddings = embeddings;
    private readonly QdrantPaperRepository _repo = repo;
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
        var topicTexts = topicB is null ? new[] { topicA } : new[] { topicA, topicB };
        var emb = await _embeddings.GenerateAsync(topicTexts, ct).ConfigureAwait(false);
        var hitsA = await _repo.VectorSearchAsync(emb[0], topK, ct).ConfigureAwait(false);
        var hitsB = topicB is null ? Array.Empty<SearchHit>() : await _repo.VectorSearchAsync(emb[1], topK, ct).ConfigureAwait(false);
        var seenKeys = new HashSet<(string PaperId, int ChunkIndex)>();
        var dedup = new List<SearchHit>(hitsA.Count + hitsB.Count);
        foreach (var h in hitsA) if (seenKeys.Add((h.PaperId, h.ChunkIndex))) dedup.Add(h);
        foreach (var h in hitsB) if (seenKeys.Add((h.PaperId, h.ChunkIndex))) dedup.Add(h);
        if (dedup.Count == 0)
            throw new InvalidOperationException($"No sources retrieved (correlationId={corrId}).");

        // Generation (OpenAI JSON).
        var (text, _, _) = await _openai.CompleteAsync(DiscoverySystem, BuildSourcesPrompt(topicA, topicB, dedup), model, 0.2f, ct).ConfigureAwait(false);
        var input = (NaiveRagCitations.ExtractJsonObject(text) is string js ? JsonNode.Parse(js) : null)
            ?? throw new InvalidOperationException($"OpenAI discovery returned no JSON object (correlationId={corrId}).");

        var hypothesis = input["hypothesis"]?.GetValue<string>()
            ?? throw new InvalidOperationException($"Missing 'hypothesis' (correlationId={corrId}).");
        var novelClaim = input["novel_claim"]?.GetValue<string>() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(novelClaim))
            throw new InvalidOperationException($"Discovery contract violation: empty novel_claim (correlationId={corrId}).");
        var reasoning = input["reasoning"]?.GetValue<string>() ?? string.Empty;

        // Citation-validation contract: drop supporting_evidence not in the retrieval set.
        var rawEvidence = input["supporting_evidence"]?.AsArray() ?? new JsonArray();
        var validatedEvidence = new List<SupportingEvidence>(rawEvidence.Count);
        var citedHits = new List<SearchHit>(rawEvidence.Count);
        int dropped = 0;
        foreach (var node in rawEvidence)
        {
            var pid = node?["paper_id"]?.GetValue<string>();
            var ci = node?["chunk_index"]?.GetValue<int>();
            var st = node?["support_type"]?.GetValue<string>();
            if (pid is null || ci is null || st is null || !seenKeys.Contains((pid, ci.Value))) { dropped++; continue; }
            var hit = dedup.First(h => h.PaperId == pid && h.ChunkIndex == ci.Value);
            validatedEvidence.Add(new SupportingEvidence(pid, ci.Value, hit.Section, hit.PageNumber, st));
            citedHits.Add(hit);
        }

        // Extrapolation basis validation (same rules as DiscoveryAgent).
        var rawBasis = input["extrapolation_basis"]?.AsArray() ?? new JsonArray();
        var validatedBasis = new List<ExtrapolationBasis>(rawBasis.Count);
        foreach (var node in rawBasis)
        {
            var cs = node?["claim_sentence"]?.GetValue<string>();
            var bt = node?["basis_type"]?.GetValue<string>();
            var rat = node?["rationale"]?.GetValue<string>();
            var gid = node?["grounded_in_chunk_id"]?.GetValue<string?>();
            if (string.IsNullOrWhiteSpace(cs) || string.IsNullOrWhiteSpace(bt) || string.IsNullOrWhiteSpace(rat)) continue;
            bt = bt.Trim().ToLowerInvariant();
            if (bt is not ("generalization" or "analogy" or "pure_speculation")) continue;
            if (bt == "pure_speculation") { gid = null; }
            else
            {
                if (string.IsNullOrWhiteSpace(gid)) continue;
                var parts = gid.Split(':');
                if (parts.Length != 2 || !int.TryParse(parts[1], out var bci) || !seenKeys.Contains((parts[0], bci))) continue;
            }
            validatedBasis.Add(new ExtrapolationBasis(cs, bt, gid, rat));
        }
        if (validatedBasis.Count == 0)
            validatedBasis.Add(new ExtrapolationBasis(novelClaim, "pure_speculation", null, "auto: model basis failed validation"));

        // Parallel scoring (same as the Anthropic path), all on OpenAI/embeddings.
        var noveltyTask = _noveltyScorer.ScoreAsync(novelClaim, ct);
        var evalTask = EvaluateAsync(hypothesis, novelClaim, citedHits, model, ct);
        var claimsTask = ValidateClaimsAsync(novelClaim, dedup, model, ct);
        await Task.WhenAll(noveltyTask, evalTask, claimsTask).ConfigureAwait(false);

        var (plausibility, coherence) = evalTask.Result;
        var evaluation = DiscoveryScoring.Aggregate(noveltyTask.Result, plausibility, coherence);

        _logger.LogInformation(
            "OpenAI discovery ({Model}): evidence={Ev}/{Raw} dropped={Drop} novelty={N:F3} plausibility={P:F2} coherence={C:F2} quality={Q:F3} aggRisk={R:F2} (corr={Corr})",
            model, validatedEvidence.Count, rawEvidence.Count, dropped, evaluation.NoveltyScore, plausibility, coherence,
            evaluation.QualityScore, claimsTask.Result.AggregateRisk, corrId);

        return new DiscoverResponse(corrId, hypothesis, validatedEvidence, novelClaim, validatedBasis,
            claimsTask.Result, reasoning, evaluation, rawEvidence.Count, dropped);
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
        var node = NaiveRagCitations.ExtractJsonObject(text) is string js ? JsonNode.Parse(js) : null;
        return (EvaluationScoring.Clamp01(node?["plausibility"]?.GetValue<double>()),
                EvaluationScoring.Clamp01(node?["structural_coherence"]?.GetValue<double>()));
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
        var node = NaiveRagCitations.ExtractJsonObject(text) is string js ? JsonNode.Parse(js) : null;
        var rawClaims = node?["claims"]?.AsArray() ?? new JsonArray();
        var retrievedKeys = new HashSet<string>(retrievedChunks.Select(c => $"{c.PaperId}:{c.ChunkIndex}"));

        var entries = new List<ClaimValidationEntry>(rawClaims.Count);
        var probs = new List<float>(rawClaims.Count);
        foreach (var n in rawClaims)
        {
            var sentence = n?["sentence"]?.GetValue<string>();
            var rationale = n?["rationale"]?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(sentence) || string.IsNullOrWhiteSpace(rationale)) continue;
            var status = ClaimValidationScoring.ParseStatus(n?["factuality_status"]?.GetValue<string>());
            var prob = ClaimValidationScoring.ClampProbability(n?["factual_hallucination_probability"]?.GetValue<double?>());
            var claimed = new List<string>();
            foreach (var ch in n?["supporting_chunks"]?.AsArray() ?? new JsonArray())
            {
                var id = ch?.GetValue<string>();
                if (!string.IsNullOrWhiteSpace(id)) claimed.Add(id);
            }
            var valid = ClaimValidationScoring.FilterSupportingChunks(claimed, retrievedKeys);
            entries.Add(new ClaimValidationEntry(sentence, status, valid, prob, rationale));
            probs.Add(prob);
        }
        return new ClaimValidationResult(entries, ClaimValidationScoring.AggregateRisk(probs));
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
