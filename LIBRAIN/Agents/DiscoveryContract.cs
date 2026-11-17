using System.Text.Json.Nodes;
using LIBRAIN.Endpoints;
using LIBRAIN.Storage;

namespace LIBRAIN.Agents;

public sealed record EvidenceValidation(
    IReadOnlyList<SupportingEvidence> Evidence,
    IReadOnlyList<SearchHit> CitedHits,
    int Claimed,
    int Dropped);

public sealed record BasisValidation(
    IReadOnlyList<ExtrapolationBasis> Basis,
    int Requested,
    int Dropped,
    int Normalized,
    int PureSpeculation);

// The model-agnostic Discovery contract, shared by DiscoveryAgent (Anthropic) and
// OpenAiDiscoveryAgent (OpenAI). Before this existed the OpenAI port carried its own
// copy that had drifted: it silently invented a pure_speculation basis entry where
// the Anthropic path rejects the response, so the two providers' outputs were not
// produced under the same rules.
public static class DiscoveryContract
{
    // Citation-validation contract: every supporting_evidence entry must resolve to
    // a retrieved chunk; anything else is dropped and counted (the RQ3 surface).
    public static EvidenceValidation ValidateEvidence(
        JsonArray? rawEvidence,
        IReadOnlyList<SearchHit> retrieved)
    {
        var byKey = new Dictionary<(string PaperId, int ChunkIndex), SearchHit>();
        foreach (var hit in retrieved) byKey.TryAdd((hit.PaperId, hit.ChunkIndex), hit);

        var entries = rawEvidence ?? new JsonArray();
        var evidence = new List<SupportingEvidence>(entries.Count);
        var citedHits = new List<SearchHit>(entries.Count);
        int dropped = 0;
        foreach (var node in entries)
        {
            var paperId = LlmJson.GetString(node?["paper_id"]);
            var chunkIndex = LlmJson.GetInt(node?["chunk_index"]);
            var supportType = LlmJson.GetString(node?["support_type"]);
            if (paperId is null || chunkIndex is null || supportType is null
                || !byKey.TryGetValue((paperId, chunkIndex.Value), out var hit))
            {
                dropped++;
                continue;
            }
            evidence.Add(new SupportingEvidence(paperId, chunkIndex.Value, hit.Section, hit.PageNumber, supportType));
            citedHits.Add(hit);
        }
        return new EvidenceValidation(evidence, citedHits, entries.Count, dropped);
    }

    // Stage 1 hallucination guard. An empty extrapolation_basis, or one where every
    // entry fails validation, is a contract violation and throws.
    public static BasisValidation ValidateBasisOrThrow(
        JsonArray? rawBasis,
        ISet<(string PaperId, int ChunkIndex)> retrievedKeys,
        Guid correlationId)
    {
        if (rawBasis is null || rawBasis.Count == 0)
        {
            throw new InvalidOperationException(
                $"Discovery contract violation: empty extrapolation_basis (correlationId={correlationId})");
        }

        var basis = new List<ExtrapolationBasis>(rawBasis.Count);
        int dropped = 0, normalized = 0, pureSpeculation = 0;
        foreach (var node in rawBasis)
        {
            var claimSentence = LlmJson.GetString(node?["claim_sentence"]);
            var basisType = LlmJson.GetString(node?["basis_type"]);
            var rationale = LlmJson.GetString(node?["rationale"]);
            var groundedInChunkId = LlmJson.GetString(node?["grounded_in_chunk_id"]);
            if (string.IsNullOrWhiteSpace(claimSentence)
                || string.IsNullOrWhiteSpace(basisType)
                || string.IsNullOrWhiteSpace(rationale))
            {
                dropped++;
                continue;
            }

            basisType = basisType.Trim().ToLowerInvariant();
            if (basisType is not ("generalization" or "analogy" or "pure_speculation"))
            {
                dropped++;
                continue;
            }

            if (basisType == "pure_speculation")
            {
                // pure_speculation must be null-grounded. Normalize rather than drop:
                // the speculative label is the load-bearing bit.
                if (!string.IsNullOrWhiteSpace(groundedInChunkId))
                {
                    normalized++;
                    groundedInChunkId = null;
                }
                pureSpeculation++;
            }
            else if (!LlmJson.TryParseChunkKey(groundedInChunkId, out var paperId, out var chunkIndex)
                     || !retrievedKeys.Contains((paperId, chunkIndex)))
            {
                // generalization / analogy must cite a retrieved chunk.
                dropped++;
                continue;
            }

            basis.Add(new ExtrapolationBasis(claimSentence, basisType, groundedInChunkId, rationale));
        }

        if (basis.Count == 0)
        {
            throw new InvalidOperationException(
                $"Discovery contract violation: all extrapolation_basis entries failed validation (correlationId={correlationId})");
        }

        return new BasisValidation(basis, rawBasis.Count, dropped, normalized, pureSpeculation);
    }
}
