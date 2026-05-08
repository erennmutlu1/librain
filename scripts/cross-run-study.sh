#!/usr/bin/env bash
# Cross-Run Consistency Study for the LIBRAIN Discovery pipeline (Phase 2.5).
#
# Hits POST /api/discover N times for each of the two locked smoke pairs
# (in-corpus and off-corpus), captures per-run scores, then prints
# mean±std per axis per pair plus a classification verdict for the two
# LLM-judged axes (plausibility, structural_coherence).
#
# Prereq: the LIBRAIN dev server is running at $URL and configured against
# the live Qdrant Cloud cluster (e.g. `dotnet run --project LIBRAIN
# --urls http://localhost:5099`). Sonnet 4.6 + Haiku 4.5 keys must be set
# via dotnet user-secrets.
#
# Usage:
#   scripts/cross-run-study.sh                          # defaults
#   scripts/cross-run-study.sh --url http://host:port   # custom base URL
#   scripts/cross-run-study.sh --runs 10                # custom N

set -euo pipefail

URL="http://localhost:5099"
N=5

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)  URL="$2"; shift 2;;
    --runs) N="$2"; shift 2;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0;;
    *)
      echo "unknown flag: $1" >&2
      exit 1;;
  esac
done

OUTDIR="$(mktemp -d -t librain-cross-XXXX)"
echo "Output dir: $OUTDIR"
echo "Base URL  : $URL"
echo "Runs/pair : $N"
echo

PAYLOAD_IN_CORPUS='{"topicA":"retrieval-augmented generation","topicB":"hypothesis generation in scientific discovery","topK":5}'
PAYLOAD_OFF_CORPUS='{"topicA":"retrieval-augmented generation","topicB":"protein folding dynamics","topK":5}'

run_pair() {
  local label="$1" payload="$2"
  echo "===== $label (N=$N) ====="
  for r in $(seq 1 $N); do
    local out="$OUTDIR/$label-$r.json"
    local code_file="$OUTDIR/$label-$r.code"
    local elapsed_file="$OUTDIR/$label-$r.elapsed_ms"

    local start_ms end_ms elapsed_ms
    start_ms=$(python3 -c 'import time; print(int(time.time()*1000))')

    curl -sS -X POST "$URL/api/discover" \
         -H 'Content-Type: application/json' \
         -d "$payload" \
         -o "$out" \
         -w '%{http_code}' > "$code_file"

    end_ms=$(python3 -c 'import time; print(int(time.time()*1000))')
    elapsed_ms=$((end_ms - start_ms))
    echo "$elapsed_ms" > "$elapsed_file"

    local code
    code=$(cat "$code_file")
    if [[ "$code" != "200" ]]; then
      echo "HALT: $label run $r returned HTTP $code" >&2
      cat "$out" >&2
      exit 2
    fi
    echo "  run $r: HTTP $code  elapsed=${elapsed_ms}ms"
    sleep 1
  done
  echo
}

run_pair "in-corpus"  "$PAYLOAD_IN_CORPUS"
run_pair "off-corpus" "$PAYLOAD_OFF_CORPUS"

# Embedded analysis: response-side stats only.
# Server-log-side details (chunk-IDs, per-stage tokens) are extracted
# separately when filling the smoke artifact — the script intentionally
# stays HTTP-only so it can run from any client.
python3 - "$OUTDIR" "$N" <<'PYEOF'
import json
import statistics
import sys

outdir, n = sys.argv[1], int(sys.argv[2])

def load_run(label, r):
    with open(f"{outdir}/{label}-{r}.json") as f:
        return json.load(f)

def stats_for(label):
    rows = [load_run(label, r) for r in range(1, n + 1)]
    cols = {
        "novelty":      [row["evaluation"]["noveltyScore"]              for row in rows],
        "plausibility": [row["evaluation"]["plausibilityScore"]         for row in rows],
        "coherence":    [row["evaluation"]["structuralCoherenceScore"]  for row in rows],
        "quality":      [row["evaluation"]["qualityScore"]              for row in rows],
    }
    contracts = [(len(row["novelClaim"].strip()) > 0, len(row["supportingEvidence"]) > 0)
                 for row in rows]
    return cols, contracts

def classify(std):
    if std < 0.01:  return "ANCHOR"
    if std <= 0.05: return "AMBIGUOUS"
    return "GENUINE SIGNAL"

print("===== Per-run raw scores =====")
for label in ("in-corpus", "off-corpus"):
    cols, contracts = stats_for(label)
    print(f"\n{label}:")
    print("  run | novelty | plausibility | coherence | quality")
    for r in range(n):
        nv, pl, co, ql = cols["novelty"][r], cols["plausibility"][r], cols["coherence"][r], cols["quality"][r]
        print(f"   {r+1}  | {nv:.4f}  | {pl:.4f}       | {co:.4f}    | {ql:.4f}")
    for r, (has_nc, has_ev) in enumerate(contracts, start=1):
        if not has_nc:
            print(f"  HALT: {label} run {r} has empty novel_claim")
            sys.exit(3)
        if not has_ev:
            print(f"  HALT: {label} run {r} has zero supporting_evidence")
            sys.exit(3)

print("\n===== Mean ± std per axis per pair =====")
for label in ("in-corpus", "off-corpus"):
    cols, _ = stats_for(label)
    print(f"\n{label}:")
    for axis, values in cols.items():
        mean = statistics.mean(values)
        std = statistics.stdev(values) if len(values) > 1 else 0.0
        # Guard: any score outside [0,1] post-clamp is a signal
        for v in values:
            if v < 0.0 or v > 1.0:
                print(f"  HALT: {label} {axis} value {v:.6f} outside [0,1]")
                sys.exit(4)
        verdict = ""
        if axis in ("plausibility", "coherence"):
            verdict = f"   → {classify(std)}"
        print(f"  {axis:12s}: {mean:.4f} ± {std:.4f}{verdict}")
PYEOF

echo
echo "Done. Per-run JSON responses preserved at: $OUTDIR"
