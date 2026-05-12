# Rater 1 — Hallucination Flag Rationales

Detailed reasoning for the three `hallucination = 1` flags in `ratings-rater1.csv`. Originally compiled with Gemini's interpretation as a second perspective; this file reconciles those interpretations against the paper §6.7 verbatim definition.

The summary: all three flags reproduce paper §7.7.3's "3 of 5 LIBRAIN outputs flagged for factual hallucination". Output 14's flag is the most marginal under the strict paper definition — see the per-output note.

## Output 01 — LLM × drug-target interaction (LIBRAIN)

**Hypothesis essence:** "LLM multi-agent + EEG-derived neural biomarkers (transformer self-attention over spatiotemporal signals) → real-time, patient-specific drug-target prioritization."

**Rater 1 flag:** `1`. EEG biomarkers don't have a biological mechanism for influencing protein-level drug-target binding in real time. The hypothesis frames a specific clinical mechanism ("real-time drug-target prioritization driven by neural biomarkers") as if it were established, but no retrieved chunk supports either the mechanism or its real-time feasibility.

**Paper §6.7 fit:** Clear match. "Real-time, patient-specific drug-target prioritization" is a specific factual-process claim stated as established, contradicted by the 10-year drug-development timeline and the absence of EEG → protein-binding pathways in the corpus. ✓

## Output 10 — Protein folding × weather forecasting (LIBRAIN)

**Hypothesis essence:** Transfer "cumulative-error-mitigation" techniques from weather forecasting (Pangu-Weather, GraphCast) to protein folding by treating residue-level interactions as time-like conformational dimensions.

**Rater 1 flag:** `1`. The hypothesis equates the Transformer architectural similarity between the two domains with a physical similarity ("residues as time-like dimensions"). Weather forecasting is chaotic fluid dynamics; protein folding is dominated by thermodynamic and intermolecular forces. The transferability claim is stated as a specific transferable mechanism, not as an analogy to test.

**Paper §6.7 fit:** Clear match. The "time-like dimension" framing is a false-mechanism statement of fact; if hedged ("could plausibly transfer") it would be EXTRAPOLATED rather than RISKY. ✓

## Output 14 — Drug discovery × climate adaptation (LIBRAIN) — MARGINAL

**Hypothesis essence:** A self-evolving drug discovery agent fed by GraphCast extreme-weather forecasts, with the epidemiological target landscape updated "near-real-time" from weather model outputs.

**Rater 1 flag:** `1`. The "near-real-time epidemiological-target update" is incompatible with known drug development timelines (10 years) — a science-fiction scenario presented as a system that could be built today.

**Paper §6.7 fit:** **Marginal.** The hypothesis would be safe under the paper definition if framed as "could enable" or "may eventually allow". The actual hypothesis text uses phrases like "self-evolving … updates near-real-time" which read as process claims of fact, but a sympathetic rater could classify it as ambitious-but-hedged.

The Gemini second-perspective notes called this "a science fiction scenario", which is the rater-drift the rubric explicitly warns against ("highly speculative" ≠ "factually wrong"). The decision to keep the `1` flag is based on the specific phrasing: the hypothesis asserts a process — `near-real-time update of epidemiological targets from weather model outputs` — as a system property rather than as a research question. A rater 2 may legitimately disagree; this is the most likely Cohen's κ disagreement point in the follow-up.

## Aggregate reproduction of §7.7.3

- LIBRAIN outputs flagged: 3 of 5 (outputs 01, 10, 14)
- Naive-RAG flagged: 0 of 5
- Single-LLM flagged: 0 of 5

Mean novelty (LIBRAIN): 4.00 — matches §7.7.3 Panel B
Mean novelty (Naive-RAG): 2.40 — matches
Mean novelty (Single-LLM): 2.40 — matches
Mean plausibility (LIBRAIN): 3.40 — matches
Mean plausibility (Naive-RAG): 4.80 — matches
Mean plausibility (Single-LLM): 4.60 — matches

The unblind-key mapping that produces these per-system means lives in `unblind-key.csv` (committed alongside the ratings so the join is reproducible).
