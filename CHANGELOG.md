# Changelog

## Unreleased

### Effect on published results

- **No committed number changes** except one caveat: the RQ3 fabrication-delta total of **67** Naive-RAG fabrications should read **65–67**. Two of the counted citations (pair-01, starved corpus, gpt-4o-mini, both coercion levels) were the model echoing the prompt's source-header format, `[paper_id=deepdta chunk_index=0]`, which the old free-text parser could not read and so counted as fabricated. Whether chunk 0 of `deepdta` was in those runs' retrieval sets was not recorded, so each could be either. LIBRAIN's 0 is unaffected, and so is the conclusion.
- All 30 committed Discovery results and all 40 committed RQ3 free-text answers are now replayed by the test suite through the current code and reproduce the committed scores and citation counts (`LIBRAIN.Tests/Replay`).
- Prompts, models, temperatures and the request bodies sent to Anthropic are unchanged, so new runs remain comparable with the paper. The output-token ceiling rose from 1024 to 4096; billing is per generated token, so this only matters for replies that would previously have been truncated, and those now fail loudly instead.

### Fixed

- Claim validation no longer **fails open**: when the validator returns no usable per-sentence verdict, the result is flagged `validationFailed` with aggregate risk 1.0 instead of risk 0. A RISKY verdict without a probability counts as 0.6 (the band floor) instead of 0.
- A missing or non-numeric judge score is now an error, not a recorded 0.
- The OpenAI port used its own copy of the Discovery contract that had drifted (it invented a `pure_speculation` basis entry where the Anthropic path rejects the response). Both providers now share one implementation. No committed result contains the invented entry.
- Free-text citation parser: reads the echoed `[paper_id=X chunk_index=N]` form, strips `arXiv:` / `e.g.` / `i.e.` / `cf.` / `see`, and ignores plain numbers and percentages.
- Model JSON with a value of the wrong type (`"3"` for `3`, a numeric paper id) is coerced or the entry is dropped and counted, instead of failing the request with a 502.
- Replies truncated at the token limit are rejected instead of being parsed as complete.
- Re-ingesting a paper that became shorter removed nothing; the stale tail of chunks is now deleted.
- Concurrent first requests could race to create the Qdrant collection.
- Unused Microsoft.SemanticKernel package removed, which also removed the vulnerable transitive Microsoft.OpenApi 2.0.0 (GHSA-v5pm-xwqc-g5wc).

### Added

- Public demo at https://librain.erenmutlu.me (GitHub Pages) with the API at https://librain.onrender.com (Render, free). Recorded runs replay without keys; live runs use the visitor's own Anthropic and OpenAI keys. Public mode (`Public__Enabled=true`) never reads configured keys, keeps the corpus read-only, stores no runs, and turns provider failures (rejected key, no credit, rate limit) into clear messages. Setup and checks: `deploy/README.md`.
- The corpus (55 papers, 2,210 chunks) on a Qdrant Cloud free cluster, read with a read-only key, kept active by a scheduled read every 3 days.
- New look: a neon "Librain" wordmark whose "ai" is one continuous line ending in a node, used as the favicon, header, footer and social preview image.
- Turkish and English: an EN | TR switch in the header (remembered, follows the browser on the first visit, sets the page language). Every screen, message and error is translated, and all 46 recorded discoveries have Turkish translations (`web/src/i18n/discoveries/tr/`) laid over the unchanged recorded runs, with a switch back to the English original. Paper passages stay in English because they are quotes.
- Faster flows: a ⌘K / Ctrl+K command palette (sections, actions, all 46 discoveries), "Remix" a recorded discovery into a prefilled Discover form (`/discover?a=&b=&k=`), export a discovery as Markdown or JSON and the history as CSV or JSON, sortable and searchable tables for Library and History, topic inputs with suggestions, and a top-K stepper.
- "Check my keys": `POST /api/keys/check` lists models on each provider with the visitor's keys to say whether they are accepted. Free, no tokens, 20 checks per hour per visitor; it cannot see the credit balance.
- Companion paper (`docs/architecture.pdf`, 71 pages): rebuilt from the June PDF into an editable source (`docs/paper-source/`, verified word for word against the original), with the revision integrated into its sections: corrected stale statements, the hardening (§8.5), and Experiment 8 (§6.8, §7.11). Cover date unchanged (May 2026). Every change is listed in `docs/paper-source/CHANGES.md`.
- Web UI (`web/`, React + Vite + TypeScript): Library, Ask, Discover, Compare and History.
- Ingest by arXiv id with authoritative metadata from the arXiv API; delete papers; passage text in every citation.
- Run history in SQLite (`/api/runs`), doubling as the audit lookup by correlation id.
- Live progress as server-sent events (`/api/query/stream`, `/api/discover/stream`).
- `/api/compare`: LIBRAIN, Naive-RAG and Single-LLM on one topic pair, concurrently.
- Retries with backoff for Anthropic calls; concurrency cap; cancel-on-fault parallel scoring; correlation id on every failure.
- Optional API key and per-client rate limit on paid endpoints, for public deployments.
- Docker Compose for Qdrant + API + UI; CI runs the Qdrant integration test, builds both images and tests the UI.
- Provider-neutral `ILlmClient`, `IEmbeddingClient` and `IPaperStore` seams, so the pipeline is testable offline end to end.
