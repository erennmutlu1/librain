# Task 4 — Novelty-Metric Validation (cosine novelty vs human novelty)

Deterministic cosine novelty (OpenAI embeddings, 1 − max cosine to corpus) vs
human 1–5 novelty ratings, Spearman ρ. No Anthropic dependency.

| Pilot | Rater | n | Spearman ρ |
|---|---|--:|--:|
| human-eval-pilot | rater1 | 15 | 0,171 |
| hallucination-pilot | rater2 | 15 | 0,458 |
| hallucination-pilot | rater3 | 15 | 0,534 |
| **pooled** | all | 45 | 0.405 |

**Interpretation.** A weak-to-moderate ρ indicates cosine novelty is a
*measurement surface* — a coarse, reproducible proxy for how far a claim sits
from the corpus — not a *control surface* aligned with human novelty judgment.
This is consistent with the retired `noveltyTarget` knob, which could not steer
the score. Use cosine novelty to rank/screen, not as a human-novelty substitute.
