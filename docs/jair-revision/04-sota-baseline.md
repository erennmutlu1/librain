> **FIX block:** FIX-JAIR.4 — Path B qualitative SOTA comparison.
> **Inserts in paper:** Section 7.6 (Cross-System Findings), as an analysis
> paragraph following the existing RQ1/RQ3 discussion. Add the two new
> references as [27] (PaperQA) and [28] (SciRAG) in Section 10.
> **VERIFY checklist:**
> - [VERIFY — PaperQA reported metric X on benchmark Y from Lala et al. 2023]
> - [VERIFY — SciRAG reported metric Z from Tay et al. 2025]

---

## 7.6 (extension) — Positioning against grounded-RAG state of the art

A reviewer correctly noted that Naive-RAG and Single-LLM are *ablations* of
LIBRAIN — they isolate the contribution of retrieval and of agent
decomposition, but they are not independent state-of-the-art systems. To
position LIBRAIN against the published literature we take two external
reference points. PaperQA (Lala et al. 2023, arXiv:2312.07559) [27] is the
canonical grounded-RAG agent for scientific question answering: it couples
retrieval with an LLM and reports answer accuracy with provenance, and we
treat it as the *grounded-RAG* reference. SciRAG (Tay et al. 2025,
arXiv:2511.14362) [28] adds explicit citation-awareness to the retrieval
loop, and we treat it as the *citation-aware-RAG* reference — the family
closest to LIBRAIN's citation-validation contract.

As published reference points: PaperQA reports
**[VERIFY — insert PaperQA's reported metric X on benchmark Y from Lala et
al. 2023]**, and SciRAG reports
**[VERIFY — SciRAG reported metric Z from Tay et al. 2025]**. (Both of the
preceding figures are placeholders to be filled from the source papers; the
sentences that follow are our own claims.)

These numbers are *not directly comparable* to LIBRAIN's results. Direct
re-running of PaperQA and SciRAG against the same 13-paper corpus and the
same four-axis rubric (Table 7) was infeasible within this revision; the
published metrics above are reported on different corpora and different
rubrics, and serve only as reference points for what grounded-RAG and
citation-aware-RAG systems respectively achieve. What our own Table 7
*does* establish, on a like-for-like rubric, is the internal contrast: the
retrieval effect on plausibility is +0.265 (Naive-RAG 0.6220 vs Single-LLM
0.3570), and speculation-fencing lifts LIBRAIN's novelty by +31% over
Naive-RAG (0.4033 vs 0.3068) at a deliberate −19% plausibility trade
(0.5050 vs 0.6220).

A like-for-like external comparison is planned for a future revision via
**Path A**: PaperQA is open-source
(github.com/Future-House/paper-qa), so a same-corpus, same-rubric re-run —
its outputs scored by our Discovery Evaluator and NoveltyScorer — would
yield a fourth system column in Table 7. We estimate this at roughly
$10–20 in API cost and defer it to the next revision rather than report
non-comparable numbers here.
