# Experiments Runbook

Detailed reference for the `LIBRAIN.Experiments` CLI and the `experiments/`
directory layout. Companion to the README "Reproducing Paper Numbers"
section — that table is the index, this file is the contract.

## Contents

- [Environment](#environment)
- [Directory layout](#directory-layout)
- [Commands](#commands)
  - [`phase-b`](#phase-b)
  - [`baseline`](#baseline)
  - [`analyze`](#analyze)
  - [`hallucination-pilot`](#hallucination-pilot)
  - [`generate-unblind-key`](#generate-unblind-key)
- [Output schemas](#output-schemas)
- [Failure modes](#failure-modes)
- [Application Insights telemetry](#application-insights-telemetry)
- [Cost reference](#cost-reference)

## Environment

| Prerequisite | Setup |
|---|---|
| .NET 10 SDK | Install from [dot.net/download](https://dot.net/download). Verify with `dotnet --version`. |
| Anthropic key | `dotnet user-secrets set "Anthropic:ApiKey" "sk-ant-..." --project LIBRAIN` |
| OpenAI key | `dotnet user-secrets set "OpenAI:ApiKey" "sk-..." --project LIBRAIN` |
| Qdrant Cloud | `dotnet user-secrets set "Qdrant:Host" "your-cluster.eu-central.gcp.cloud.qdrant.io" --project LIBRAIN` and `Qdrant:ApiKey`. Local Docker alternative: `docker run -d -p 6333:6333 -p 6334:6334 -v ~/qdrant-data:/qdrant/storage qdrant/qdrant`. |
| Corpus loaded | 13 papers (610 chunks) ingested into the Qdrant collection. Re-run `POST /api/papers/ingest` for any missing PDF; UUIDv5 chunk IDs make re-ingestion idempotent. |
| Dev server | `dotnet run --project LIBRAIN`. Note the port (default `5099` http or `7XXX` https) the kestrel banner prints. Pass it via `--url` to every command below. |

The `LIBRAIN.Experiments` CLI is its own console project — running `dotnet
run --project LIBRAIN.Experiments -- <command>` does NOT start the API
server, it calls into an already-running one. Keep two terminals open.

## Directory layout

`experiments/` is the single source of truth for paper-backing data.

```
experiments/
├── topic-pairs.json                  # 10 pre-registered pairs (paper §6.5)
├── phase-b/
│   └── results/
│       ├── pair-01.json … pair-10.json    # raw /api/discover responses (DiscoverResponse)
│       └── aggregate.csv                  # → paper Table 5
├── baseline-comparison/
│   └── results/
│       ├── librain/pair-*.json            # mirrored from phase-b/results/
│       ├── naive-rag/pair-*.json          # NaiveRagResult
│       ├── single-llm/pair-*.json         # SingleLlmResult
│       ├── per-pair.csv                   # all 30 runs, joined
│       ├── aggregate.csv                  # → paper Table 7
│       └── fabrication-counts.csv         # → paper Table 8
├── human-eval-pilot/
│   ├── rubric.md                          # paper §6.7 verbatim definition
│   ├── ratings-rater1.csv                 # 15 rater 1 scores (first author)
│   ├── rater1-rationale.md                # per-output reasoning for the 3 flags
│   ├── unblind-key.csv                    # Latin-square (committed; reproduces §7.7 Panel B)
│   ├── analysis.csv                       # → paper Table 9 / §7.7 Panel B
│   └── spearman.csv                       # → paper §7.7.1 (only after baseline runs)
└── hallucination-pilot/                   # Phase 3.A.5 RQ4 follow-up scaffolding
    ├── results/{librain-with-fix,naive-rag,single-llm}/pair-*.json
    ├── rubric.md
    ├── unblind-key.csv                    # regenerated each run via Latin-square
    └── ratings-template.csv               # empty; rater fills in then re-runs analyze
```

A path like `experiments/<phase>/results/pair-XX.json` always holds the
**raw** API response for one pair × one system. Every aggregation step
(`aggregate.csv`, `fabrication-counts.csv`, `analysis.csv`,
`spearman.csv`) is derivable from those raw files by re-running
`analyze`.

## Commands

### `phase-b`

Runs `POST /api/discover` once per topic pair in `topic-pairs.json`.
Reuses identical retrieval ordering across runs because the dedup loop in
`DiscoveryAgent` is deterministic for fixed `(topicA, topicB, topK)`.

**Args**

| Flag | Default | Purpose |
|---|---|---|
| `--url <url>` | `http://localhost:5099` | Dev server base URL. |
| `--topK <int>` | `5` | Top-K vector hits per topic; matches paper §6.5. |
| `--help` | — | Print short usage and exit. |

**Output**

- One `experiments/phase-b/results/pair-XX.json` per pair (raw
  `DiscoverResponse` shape — see [Output schemas](#output-schemas)).
- stdout: per-pair line with HTTP code, wall-clock ms, novelty, quality.

**Preconditions**

- Dev server reachable at `--url`.
- Anthropic Sonnet 4.6 + Haiku 4.5 access on the configured key.
- Qdrant collection populated with the 13-paper Phase B corpus.

### `baseline`

Hits `POST /api/naive-rag` and `POST /api/single-llm` for the same 10
pairs. **Requires `phase-b` to have been run first** because it mirrors
the LIBRAIN responses into the baseline layout (avoids paying for the
LIBRAIN column twice).

**Args**

| Flag | Default | Purpose |
|---|---|---|
| `--url <url>` | `http://localhost:5099` | Dev server base URL. |
| `--topK <int>` | `5` | Top-K vector hits per topic (Naive-RAG only). |

**Output**

- `experiments/baseline-comparison/results/librain/pair-*.json` — copied from `experiments/phase-b/results/`.
- `experiments/baseline-comparison/results/naive-rag/pair-*.json` (`NaiveRagResult` shape).
- `experiments/baseline-comparison/results/single-llm/pair-*.json` (`SingleLlmResult` shape).

The `librain/` directory is overwritten on every run so re-running
`phase-b` and then `baseline` always reflects the latest Phase B outputs.

### `analyze`

Pure offline aggregator. Reads everything under `experiments/` and emits
the four committed CSVs:

| Output | Source | Paper artifact |
|---|---|---|
| `experiments/phase-b/results/aggregate.csv` | `pair-*.json` × 1 system | Table 5 |
| `experiments/baseline-comparison/results/per-pair.csv` | `pair-*.json` × 3 systems | (intermediate) |
| `experiments/baseline-comparison/results/aggregate.csv` | per-pair × group-by system | Table 7 |
| `experiments/baseline-comparison/results/fabrication-counts.csv` | Naive-RAG `claimedCitations` + `fabricatedCitationCount` | Table 8 |
| `experiments/human-eval-pilot/analysis.csv` | `ratings-rater1.csv` ⋈ `unblind-key.csv` | Table 9 / §7.7 Panel B |
| `experiments/human-eval-pilot/spearman.csv` | analysis ⋈ baseline `per-pair.csv` | §7.7.1 |

Sections silently skip when their source data is absent (e.g. running
`analyze` before `baseline` skips Table 7/8 and the Spearman block — but
still produces Table 9 from the committed rater 1 CSV).

**Spearman ρ** uses an in-house rank-correlation with average-rank tie
handling (`LIBRAIN.Experiments/Stats/SpearmanRank.cs`). No SciPy / MathNet
dependency.

### `hallucination-pilot`

No API calls. Stages the 5 §6.7 human-eval pairs across three conditions
(`librain-with-fix`, `naive-rag`, `single-llm`) for rater re-scoring under
the Aşama A1 + A2 changes.

**Args**

| Flag | Default | Purpose |
|---|---|---|
| `--seed <int>` | `42` | Seed for Latin-square pair assignment. |

**Effect**

1. Copies `pair-01/02/06/09/10.json` from `experiments/phase-b/results/`
   into `experiments/hallucination-pilot/results/librain-with-fix/`.
2. Copies the same pair IDs from `experiments/baseline-comparison/results/{naive-rag,single-llm}/`. Missing files surface a warning, not an error.
3. Calls `generate-unblind-key` with the fixed seed to produce
   `experiments/hallucination-pilot/unblind-key.csv`.
4. Writes `ratings-template.csv` (15 empty `output_id` rows) and copies
   the rubric so the rater works from the same definitions.
5. Prints the §7.7.3 BEFORE-FIX target (rater 1's existing scores) so the
   after-fix comparison budget is visible.

Rater workflow afterward: fill `ratings-template.csv`, then re-run
`analyze` (with the pilot CSVs in place).

### `generate-unblind-key`

Stand-alone utility used by `hallucination-pilot` and (eventually) the
two-rater follow-up.

**Args**

| Flag | Default | Required | Purpose |
|---|---|---|---|
| `--pairs <list>` | — | yes | Comma-separated pair IDs (e.g. `pair-01,pair-02,...`). |
| `--systems <list>` | `LIBRAIN,Naive-RAG,Single-LLM` | no | Comma-separated system labels. |
| `--seed <int>` | `42` | no | Random seed for Fisher-Yates shuffle. |
| `--out <path>` | — | yes | Destination CSV. |

**Effect**

For each pair, shuffles the system list with Fisher-Yates (NOT
`OrderBy(_ => Random.Next())`, which produces degenerate orderings) and
assigns each system to position A/B/C in the shuffled order. Output rows
are numbered with zero-padded `output_id` starting at 01.

stderr lists the per-system position distribution so unbalanced shuffles
(rare but possible with small N) are visible immediately.

## Output schemas

### `experiments/phase-b/results/pair-XX.json` (`DiscoverResponse`)

```jsonc
{
  "correlationId": "...",
  "hypothesis": "...",
  "supportingEvidence": [
    {"paperId": "2005.11401", "chunkIndex": 12, "section": "...", "pageNumber": 3, "supportType": "direct"}
  ],
  "novelClaim": "...",
  "extrapolationBasis": [
    {"claimSentence": "...", "basisType": "generalization|analogy|pure_speculation",
     "groundedInChunkId": "paper-id:idx", "rationale": "..."}
  ],
  "claimValidation": {
    "claims": [
      {"sentence": "...", "status": 0|1|2, "supportingChunks": ["..."],
       "factualHallucinationProbability": 0.0, "rationale": "..."}
    ],
    "aggregateRisk": 0.0
  },
  "reasoning": "...",
  "evaluation": {
    "noveltyScore": 0.0,
    "plausibilityScore": 0.0,
    "structuralCoherenceScore": 0.0,
    "qualityScore": 0.0
  }
}
```

`status` is the integer ordinal of `ClaimFactualityStatus` (0 Grounded, 1 Extrapolated, 2 Risky).

### `experiments/baseline-comparison/results/naive-rag/pair-XX.json` (`NaiveRagResult`)

```jsonc
{
  "correlationId": "...",
  "hypothesis": "...",
  "retrievedChunkCount": 7,
  "claimedCitations": [
    {"paperId": "...", "chunkIndex": 12, "isResolved": true}
  ],
  "fabricatedCitationCount": 0,
  "evaluation": { /* same 4 axes as DiscoverResponse */ },
  "totalElapsedMs": 0,
  "inputTokens": 0,
  "outputTokens": 0
}
```

`fabricatedCitationCount` is the canonical RQ3 measurement. It is the
count of `claimedCitations` entries with `isResolved == false`.

### `experiments/baseline-comparison/results/single-llm/pair-XX.json` (`SingleLlmResult`)

Same as Naive-RAG minus `retrievedChunkCount`, `claimedCitations`, and
`fabricatedCitationCount` — there is no retrieval and no citation
contract by design.

### `experiments/*/aggregate.csv`

```csv
pair_id,novelty,plausibility,coherence,quality
pair-01,0.3992,0.4200,0.6800,0.4997
…
```

Phase B and baseline `aggregate.csv` share the schema; baseline adds a
`system` column and a `per-pair.csv` keeping both keys.

### `experiments/human-eval-pilot/analysis.csv`

```csv
system,n,novelty_mean,plausibility_mean,hallucination_flag_count,hallucination_flag_rate
LIBRAIN,5,4.00,3.40,3,0.6000
Naive-RAG,5,2.40,4.80,0,0.0000
Single-LLM,5,2.40,4.60,0,0.0000
```

### `experiments/human-eval-pilot/spearman.csv`

```csv
axis,n,spearman_rho
novelty,15,0.325
plausibility,15,0.322
```

Computed only when `experiments/baseline-comparison/results/per-pair.csv`
also exists (the analyzer needs the LLM-as-Judge scores to correlate
against).

## Failure modes

| Symptom | Likely cause | Resolution |
|---|---|---|
| `HALT: pair-XX returned HTTP 401` | API key not in user-secrets, or expired. | `dotnet user-secrets list --project LIBRAIN` and re-set as needed. |
| `HALT: pair-XX returned HTTP 429` | Anthropic rate limit. | The CLI already sleeps 1s between calls; if still hit, drop topK to 3 or retry the affected pair manually. |
| `HALT: pair-XX returned HTTP 502` | Discovery pipeline raised an unhandled exception — see `DiscoveryEndpoints.cs` catch block. | Inspect the server log for the exception type; common: Qdrant cluster cold start. |
| `HALT: pair-XX empty novelClaim` | DiscoveryAgent contract violation — model returned an empty `novel_claim`. | Re-run the pair. If it persists, the topic pair may be over-grounded; tweak phrasing. |
| `HALT: no Phase B results under …` (in `baseline`) | Forgot to run `phase-b` first. | Run `phase-b`, then `baseline`. |
| `(spearman ρ skipped — only N matched rows)` | Baseline runs missing for some pair × system. | Re-run `baseline`; the analyzer fills in once `per-pair.csv` is complete. |
| `Naive-RAG fabricatedCitationCount > 0` | Model fabricated a citation. Paper §6.6 measured 0/42 under Sonnet 4.6 + structured tool use; non-zero is the falsification case for that finding. | Inspect the offending pair: `cat experiments/baseline-comparison/results/naive-rag/pair-XX.json`. |
| Build fails after schema change | Old test snapshots reference removed property names. | Re-build the solution; the 53-test suite covers helpers, not full responses, so it should keep passing. |

## Application Insights telemetry

Every Anthropic-backed agent (`Synthesis`, `Evaluator`, `Discovery`,
`DiscoveryEvaluator`, `ClaimValidator`, `NaiveRag`, `SingleLlm`) emits a
structured log line per API call with the same fields:

| Field | Meaning |
|---|---|
| `correlationId` | UUID propagated through the pipeline; one per request. |
| `pipeline` | `discover`, `naive-rag`, `single-llm`, etc. |
| `InputTokens` / `OutputTokens` | Anthropic billing tokens. |
| `cacheRead` / `cacheCreate` | Prompt-cache tokens (added Phase 3.A E1). Cache miss → `cacheCreate > 0, cacheRead == 0`. Cache hit → `cacheRead > 0, cacheCreate == 0`. |
| `ElapsedMs` | Wall-clock for the call. |

Sample Application Insights KQL for "what did pair-XX cost":

```kusto
traces
| where customDimensions.correlationId == "..."
| project timestamp, message, customDimensions
| order by timestamp asc
```

The Phase 3.A E1 commit added `cacheRead` + `cacheCreate` so a single
query can show how cached the prefix is. Expected pattern during a Phase
B run: pair-01 cache miss, pair-02..10 cache hits (5-min TTL).

## Cost reference

Numbers measured against Sonnet 4.6 + Haiku 4.5 on a 13-paper corpus
with prompt caching enabled.

| Run | API cost | Wall-clock |
|---|---|---|
| `phase-b` (10 × LIBRAIN discover) | ~$0.30 | ~15 min |
| `baseline` (10 × Naive-RAG, 10 × Single-LLM) | ~$0.45 | ~20 min |
| `hallucination-pilot` | $0.00 | seconds |
| `analyze` | $0.00 | seconds |
| `generate-unblind-key` | $0.00 | seconds |
| `cross-run-study.sh --runs 5` (legacy bash) | ~$0.40 | ~5 min |
| **Phase B + Baseline + analyze** (typical full reproduction) | **~$0.75** | **~35 min** |
| **+ hallucination pilot rerun** (after fix is committed) | **~$1.20** | **~45 min** |

Budget against the user's current $2.78 Anthropic balance: full
reproduction leaves ~$1.50 head-room for retries, prompt iteration, or
the future two-rater follow-up.
