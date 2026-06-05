<!--
FIX BLOCK: FIX-JAIR.1 — new subsection "1.1 Problem Formulation".
INSERTION POINT: Section 1 (Introduction), immediately AFTER the four bold RQ
paragraphs and BEFORE the sentence "The contributions of this work are as follows."
VERIFY CHECKLIST: none — no [VERIFY] items left in this block. All numeric and
symbolic claims are drawn from the grounding facts or experiments/phase-b/results/pair-02.json.
-->

## 1.1 Problem Formulation

We frame scientific discovery assistance as a constrained generation problem.
A discovery-assistance system *S* takes a scientific corpus *C* and a topic
specification *T* = (*t₁*, *t₂*), where *t₁* and *t₂* may belong to distinct
domains, and produces a tuple

> *O* = (*h*, *E*<sub>grounded</sub>, *c*<sub>novel</sub>, *A*)

where:

- *h* is a natural-language hypothesis;
- *E*<sub>grounded</sub> ⊆ *C* is a set of evidence chunks supporting *h*, each
  individually verifiable against *C*;
- *c*<sub>novel</sub> is the speculative portion of *h*, explicitly fenced and
  exempt from grounding;
- *A* is a structured audit trace such that every element of
  (*h*, *E*<sub>grounded</sub>, *c*<sub>novel</sub>) is reproducible from *A*.

In LIBRAIN these symbols map directly onto concrete output artifacts:
*E*<sub>grounded</sub> is the `supportingEvidence` array, *c*<sub>novel</sub> is
the `novelClaim` field, and *A* is the Application Insights audit trace keyed by
correlation ID. The worked example in Appendix A (Demo 3, pair-02, RAG ×
de novo molecular design) instantiates the tuple: six `supportingEvidence`
chunks, a single fenced `novelClaim`, and a correlation ID
(`9dc74671-678d-439f-9438-35ccd2739391`) from which the retrieval set, prompts,
and per-axis scores are all recoverable.

### Constraints

*S* must satisfy four constraints:

- **(C1) Grounding.** Every claim in (*h* − *c*<sub>novel</sub>) maps to at least
  one chunk in *E*<sub>grounded</sub>.
- **(C2) Validation.** *E*<sub>grounded</sub> ⊆ retrieved(*C*, *T*), enforced
  structurally — no cited chunk may exist outside the set actually retrieved
  for *T*.
- **(C3) Speculation containment.** Claims in *c*<sub>novel</sub> are
  syntactically separable from grounded claims, so a reader (or an automated
  evaluator) can isolate the speculative content without inference.
- **(C4) Auditability.** *A* suffices to reconstruct the retrieval set, the
  prompts, the per-stage decisions, and the per-axis evaluator scores.

### Peculiarities of the problem

**Cross-domain bridging demands grounded extrapolation.** When *t₁* and *t₂*
sit in different domains, no single retrieved chunk spans the bridge; a useful
hypothesis must extrapolate beyond any one chunk while remaining anchored in
evidence. In pair-02 the novel claim — a RAG retriever that self-evolves over
design cycles — is justified by `basisType: "analogy"` grounded in
`03-pharmagents:7`, not asserted free of evidence. Extrapolation is therefore
not a relaxation of grounding but a controlled operation layered on top of it.

**Citation fabrication is a model-independent failure mode.** Large language
models invent plausible-looking citations regardless of scale or instruction
tuning. A structural contract — refusing to emit any chunk that is not present
in retrieved(*C*, *T*) — is the only mitigation that holds independently of model
strength, because it removes the failure by construction rather than by hoping
the model behaves. This is the difference between a probabilistic reduction and
a guarantee.

**Novelty and plausibility are a genuine trade-off.** Across our ten-pair
aggregate, fencing speculation raises LIBRAIN's novelty 31% over Naive-RAG
(0.4033 vs. 0.3068) while lowering plausibility 19% (0.5050 vs. 0.6220). This is
a deliberate profile shift, not a deficit. Collapsing the two axes into a single
quality score would hide both the trade-off itself and the design intent behind
it, which is precisely why the evaluation reports them separately.

**Observability is a first-class constraint, distinct from output quality.**
Two systems can emit byte-identical outputs yet differ in trustworthiness: one
exposes its retrieval set, prompts, and per-stage decisions for inspection, the
other does not. Auditability (C4) is therefore orthogonal to the quality of *h*
and must be evaluated on its own terms.

The four research questions defined above each probe one constraint: RQ1 → C4
(auditability), RQ2 → measurement validity, RQ3 → C2 (validation), RQ4 → C3
(speculation containment).
