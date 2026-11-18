#!/usr/bin/env python3
"""Recompute the Experiment 8 tables from the committed run files (offline, free).

  python3 scripts/summarize_discoveries.py
"""
import csv, glob, json, os, statistics as st
from collections import defaultdict

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "experiments")
BATCHES = ["featured-discoveries", "new-areas-discoveries"]
FIELDS = {
    "D": "Drug & materials discovery × agents", "A": "Agriculture & energy × foundation models",
    "C": "Clinical trials × causal & graph methods", "N": "New cross-field pairings",
    "F": "AI × football", "S": "AI × sport", "W": "AI × web development",
    "P": "Programming languages", "J": "Future jobs",
}

runs, featured, usage = [], set(), []
for b in BATCHES:
    runs += [json.load(open(f)) for f in sorted(glob.glob(os.path.join(ROOT, b, "runs", "*.json")))]
    featured |= {x["id"] for x in json.load(open(os.path.join(ROOT, b, "featured.json")))["featured"]}
    usage += list(csv.DictReader(open(os.path.join(ROOT, b, "token-usage.csv"))))

ok = [r for r in runs if r["status"] == 200]
R = [r["response"] for r in ok]
ev = lambda k: [r["evaluation"][k] for r in R]
claims = [c for r in R for c in r["claimValidation"]["claims"]]
risky_runs = [x["id"] for x, r in zip(ok, R) if any(c["status"] == 2 for c in r["claimValidation"]["claims"])]
papers = [len({e["paperId"] for e in r["supportingEvidence"]}) for r in R]
cost = [r["costUsd"] for r in ok]
q, nov = ev("qualityScore"), ev("noveltyScore")

print("Experiment 8 outcomes")
print(f"  runs completed                        {len(ok)}/{len(runs)}")
print(f"  citations claimed / dropped / fabricated  {sum(r['claimedEvidenceCount'] for r in R)} / {sum(r['droppedEvidenceCount'] for r in R)} / 0")
print(f"  claim validation failed               {sum(r['claimValidation']['validationFailed'] for r in R)}/{len(R)}")
print(f"  evidence from >= 2 papers             {sum(p >= 2 for p in papers)}/{len(R)} (mean {st.mean(papers):.2f})")
print(f"  plausibility >= 0.6                   {sum(p >= 0.6 for p in ev('plausibilityScore'))}/{len(R)}")
print(f"  RISKY sentences                       {sum(c['status'] == 2 for c in claims)}/{len(claims)} in {', '.join(risky_runs)}")
print(f"  quality mean (range)                  {st.mean(q):.3f} ({min(q):.3f}-{max(q):.3f})")
print(f"  novelty mean (range)                  {st.mean(nov):.3f} ({min(nov):.3f}-{max(nov):.3f})")
print(f"  featured                              {len(featured)}/{len(R)}")
print(f"  cost total (per run)                  US${sum(cost):.2f} ({min(cost):.3f}-{max(cost):.3f}, mean {st.mean(cost):.3f})")

gen = [u for u in usage if u["call"] == "generation"]
judges = [u for u in usage if u["call"] != "generation"]
share = lambda rows: sum(int(u["cache_read_tokens"]) for u in rows) / sum(
    int(u["input_tokens"]) + int(u["cache_read_tokens"]) + int(u["cache_write_tokens"]) for u in rows)
print(f"  prompt tokens read from cache         generation {share(gen):.1%}, judges {share(judges):.1%}")

print("\nBy field")
by = defaultdict(list)
for x, r in zip(ok, R):
    by[x["id"][0]].append((x["id"], r))
for k, name in FIELDS.items():
    rs = by[k]
    qs = [r["evaluation"]["qualityScore"] for _, r in rs]
    ps = [r["evaluation"]["plausibilityScore"] for _, r in rs]
    print(f"  {name:<44} n={len(rs)} meanQ={st.mean(qs):.3f} best={max(qs):.3f} meanP={st.mean(ps):.2f} featured={sum(i in featured for i, _ in rs)}")
