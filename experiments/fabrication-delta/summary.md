# RQ3 Fabrication-Delta — Summary

Fabrication = claimed citations that do not resolve to the retrieval set.
Naive-RAG surfaces them; LIBRAIN's citation contract drops them (0 in output).

| Corpus | Naive-RAG structured | Naive-RAG free-text | Naive-RAG total | LIBRAIN in output | Contract dropped |
|---|--:|--:|--:|--:|--:|
| clean | 5 | 9 | 14 | 0 | 14 |
| starved | 26 | 27 | 53 | 0 | 53 |

The delta is Naive-RAG fabrications surfaced vs. LIBRAIN's zero-in-output;
`contract_dropped` is the citation contract's measured work. See `results.csv`
for the per-cell breakdown and `metadata.md` for model/temperature/corpus of each leg.
