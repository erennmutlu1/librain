# LIBRAIN web

The first web interface for LIBRAIN: ask questions of the paper corpus, run
Discovery, compare LIBRAIN against the two baselines, and audit every
generated hypothesis sentence by sentence.

React 19 + Vite + TypeScript (strict), React Router, plain CSS modules. No UI
kit. Tests use Vitest and Testing Library.

## Run it

Requires Node 20.19+ or 22.12+ (developed on Node 23) and npm.

```bash
cd web
npm ci
npm run dev          # http://localhost:5173, mock mode
```

### Mock mode (default under `npm run dev`)

Every call is answered from recorded fixtures in `src/mocks/` after a short
artificial delay. **Nothing touches the network, so no API key is used and
nothing is billed.** A "Mock data" badge sits in the header. Each screen shows
a "Recorded runs" row for one-click access to every recording, and a small
notice under each result says which repository file the answer came from.
Inputs that match no recording get the default recording plus a notice
saying so.

Request validation mirrors the API (empty topic, topK outside 1–20, identical
topics for the baselines), so the form errors look the same in both modes.
PDF upload is simulated: it shows progress, then adds the paper to an
in-memory library for the session.

### Real mode

```bash
# terminal 1, repo root: the LIBRAIN API on http://localhost:5000 (launch profile "http")
dotnet run --project LIBRAIN --launch-profile http

# terminal 2
cd web
VITE_USE_MOCKS=false npm run dev
```

The Vite dev server proxies `/api/*` and `/health` to `http://localhost:5000`,
so the browser only makes same-origin requests and **the API needs no CORS
policy in development**. Point the proxy elsewhere with
`VITE_API_PROXY_TARGET=http://host:port`. The header shows "API connected" or
"API unreachable" from `GET /health`.

Real mode makes paid model calls on every Ask, Discover and Compare (Compare
makes three runs at once). Discovery takes 15–30 s; the UI shows elapsed time
and a Cancel button.

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_USE_MOCKS` | `true` in `npm run dev`, `false` in `npm run build` | `false`/`0`/`no`/`off` calls the API; anything else uses fixtures. |
| `VITE_API_PROXY_TARGET` | `http://localhost:5000` | Dev-server proxy target for real mode. |
| `VITE_API_BASE_URL` | empty (same origin) | API origin for production builds hosted separately from the API. |

See `.env.example`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR. |
| `npm run build` | `tsc --noEmit`, then the production build into `dist/`. |
| `npm run preview` | Serves `dist/`. |
| `npm test` | Vitest, once (jsdom). `fetch` is stubbed to throw, so a test can never reach the network. |
| `npm run lint` | ESLint (typescript-eslint, react-hooks). |
| `npm run typecheck` | `tsc --noEmit` only. |

> npm 10.9.x has an arborist bug (`Cannot read properties of null (reading
> 'edgesOut')`) when *adding* some packages to this tree. `npm ci` and
> `npm install` from the lockfile work; to add a dependency, run
> `npx npm@11 install <pkg>`.

## Screens

- **Library**: the papers in the vector store (`GET /api/papers`) with
  title, ID, chunk count and date added; filter and sort. Upload a PDF
  (`POST /api/papers/ingest`) with real upload progress, then a "processing"
  phase, then the result with its correlation ID. The file name becomes the
  paper ID; the panel says so and warns when that ID already exists.
  Ingest-by-arXiv-ID is shown disabled ("coming soon").
- **Ask** (`POST /api/query`): question and topK. The answer renders `[n]`
  markers as numbered chips; selecting one opens a side panel (bottom sheet
  on phones) with the paper, section, page and chunk. The panel shows the
  passage when a citation carries `content`. Markers whose source the API
  dropped show struck through. Beside the answer: evaluator bars for
  quality, groundedness, relevance and completeness, the critique,
  unsupported claims, missing evidence, and a copyable correlation ID.
- **Discover** (`POST /api/discover`): Topic A, optional Topic B, topK,
  provider (Anthropic or OpenAI, with an optional OpenAI model). The
  hypothesis marks where the model's novel claim begins. The novel claim is
  then painted sentence by sentence with the validator's verdict: grounded
  (solid underline), extrapolated (dashed) or risky (wavy), each with its own
  colour and icon, plus a legend with counts. Hover, focus (Tab) or select a
  sentence (Enter pins it) to read the margin note: hallucination
  probability, the validator's rationale, supporting chunks (with section and
  page when known), and the generator's own extrapolation basis for that
  sentence. Validator sentences that can't be placed in the text are listed
  below it. The view also shows the scores, the aggregate-risk meter, the
  citation contract ("dropped N" of M claimed), supporting evidence, the
  extrapolation-basis list and the model's reasoning. When
  `validationFailed` is true, a warning says nothing was checked and the risk
  shows as "Unverified".
- **Compare**: one topic pair through LIBRAIN, Naive-RAG and Single-LLM in
  parallel. Each column fills in as its run finishes. A plain-language
  explainer covers what differs between the systems. One score table with
  bars on a shared 0–1 scale shows hallucination risk and citation counts.
  Naive-RAG's claimed citations are listed with fabricated ones
  (`isResolved: false`) in red, struck through and labelled. A Naive-RAG
  citation mode toggle (structured / free text) maps to the API's
  `citationMode`.
- **History**: every run is saved in `localStorage` (newest first, last 100).
  You can filter by type, open a run to re-render it with the same
  components, and export one run or the whole list as JSON or Markdown. If
  storage is blocked or full, history keeps working in memory for the tab
  and says so. In mock mode an empty history offers "Load the recorded runs".

Light and dark themes follow the system setting; the header button cycles
system → light → dark. Every screen was checked at 360 and 375 px wide with
no horizontal scrolling. Every screen is keyboard operable (skip link,
visible focus, focus moved to new content) and respects reduced motion. The only
non-interactive animation is the "highlighter" sweep when verdicts first
appear.

## Code map

```
src/
  api/          types.ts      DTOs mirroring the C# records (source files listed in the header comment)
                normalize.ts  wire -> UI mapping; numeric/string enum handling; defaults for missing fields
                httpClient.ts real client (fetch; XHR for upload progress)
                mockClient.ts fixture-backed client (dynamically imported, so real-mode bundles don't load it)
                config.ts     VITE_USE_MOCKS / VITE_API_BASE_URL resolution
  mocks/        fixtures/*.json + scenarios.ts (the provenance of every recording)
  lib/          sentences.ts  validator-sentence -> novelClaim matching
                citations.ts  [n] markers, fabricated-citation audit, chunk keys
  history/      runStore.ts   THE SEAM: RunStore interface + createDefaultRunStore()
                localRunStore.ts, exporters.ts (JSON/Markdown), context.tsx
  components/   AnnotatedClaim (the sentence view), DiscoverResult, AskResult, CitationPanel, CompareView, ...
  pages/        one file per screen
```

**Sentence matching** (`lib/sentences.ts`). The validator re-types sentences,
so matching runs on letter/digit tokens with their original offsets. Case,
accents, quotes, dashes and whitespace don't matter, and the matcher finds
clause fragments the validator split off. Each sentence is placed by an exact
contiguous token match, otherwise by the best free sentence with token Dice
≥ 0.6. Anything left is listed as unplaced rather than dropped. Spans never
overlap.

**Switching History to a backend.** Implement `RunStore` against
`/api/runs` (list, get, save, remove, clear, subscribe) and return it from
`createDefaultRunStore()` in `src/history/runStore.ts`. No component changes.

## Data shapes and what degrades

- `ClaimFactualityStatus` arrives as a **number** (0 grounded, 1
  extrapolated, 2 risky), confirmed against every committed fixture. The API
  registers no `JsonStringEnumConverter`. String forms (`"Risky"`,
  `"GROUNDED"`) are also accepted. Unknown values map to extrapolated, like
  the backend's `ParseStatus`.
- `claimValidation.validationFailed` is optional. When true, the UI shows the
  failure warning; when absent, it is treated as not failed.
- `claimedEvidenceCount` / `droppedEvidenceCount` are missing from runs that
  predate them (all `baseline-comparison` LIBRAIN runs). The UI then says
  "not recorded" instead of showing 0.
- Free-text Naive-RAG citations without a chunk are serialised as
  `chunkIndex: -1` and shown as a paper-level key.
- Any missing evaluation, run stats or citation list is labelled "Not
  scored" or "None" rather than breaking the screen. Stored history is
  re-normalised on read, so old saved runs keep rendering.

## Fixtures

| File | Source | Changes |
| --- | --- | --- |
| `discover-anthropic-pair-{01,02,08,10}.json` | `experiments/baseline-comparison/results/librain/pair-NN.json` | None. pair-10 has a RISKY sentence; pair-02 a GROUNDED one. |
| `discover-openai-pair-{01,03,21}.json` | `experiments/discovery-openai/pair-NN.json` | None. pair-03 has 1 dropped citation; pair-01's validator split one sentence into two fragments. |
| `naive-rag-pair-{01,10}.json`, `single-llm-pair-{01,10}.json` | `experiments/baseline-comparison/results/{naive-rag,single-llm}/` | None. |
| `fabrication-delta-pair-01-free-text-gpt-4o.json` | `experiments/fabrication-delta/pair-01-probe-aggressive-free-text-gpt-4o-clean.json` | None on disk. `scenarios.ts` turns it into a Naive-RAG response: citations parsed from the hypothesis exactly as the backend does; the 2 fabrications (the experiment stores counts only) assigned to `2504.05496:9`, cited twice, one assignment consistent with the recorded 5 claimed / 2 fabricated. Unscored. |
| validator-failure scenario | pair-08 above | `scenarios.ts` replaces `claimValidation` with the failure shape (no claims, risk 1.0, `validationFailed: true`). |
| `query-rag-hallucination.json` | README "Example query result" | Scores, confidence and two citations are from the README; the full answer, the other two citations, the critique and two passage excerpts were written to complete it. |
| `papers.json` | paper IDs found in the fixtures above | Hand-made: titles of well-known papers; others use the backend's fallback (title = paper ID) or null. Chunk counts and dates are plausible, not measured. |

No committed Naive-RAG run in `baseline-comparison` has a fabricated
citation, so the structured Compare recordings correctly show none.

## Backend changes this UI would use

1. **Passage text in citations**: an optional `content` on
   `SynthesisCitation`, `SupportingEvidence` and claim `supportingChunks`.
   The panels already render it.
2. **`/api/runs`**: server-side run history, behind the `RunStore` seam.
3. **Authors and year in `GET /api/papers`**: they are stored per chunk
   (`ChunkRecord`) but `PaperSummary` drops them.
4. **Ingest by arXiv ID**: the disabled field is ready for it.
5. **CORS for production**: when the UI is hosted on a different origin
   (Static Web Apps), the API needs a CORS policy for that origin and the
   build needs `VITE_API_BASE_URL`. Not needed in development.
6. **Streaming or progress events** for the 15–30 s discovery pipeline.
   Today the UI can only show elapsed time.
7. **`JsonStringEnumConverter`** (optional): readable enums on the wire.
   The UI handles both forms.
8. **Correlation ID on every error**: `/api/query` includes it in
   ProblemDetails; discover and the baselines don't yet. The UI shows it
   whenever present.
