# LIBRAIN web

The web interface for LIBRAIN: ask questions of the paper corpus, run
Discovery with live progress, compare LIBRAIN against the two baselines, and
audit every generated hypothesis sentence by sentence.

React 19 + Vite + TypeScript (strict), React Router, plain CSS modules. No UI
kit. Tests use Vitest and Testing Library.

![Discover: each novel-claim sentence marked with the validator's verdict](docs/screenshots/discover.png)

| | |
| --- | --- |
| ![Compare: three systems on one topic pair](docs/screenshots/compare.png) | ![Ask: citation panel with the cited passage](docs/screenshots/ask.png) |
| ![Library: papers, upload and arXiv ingest](docs/screenshots/library.png) | ![Discover on a phone, dark mode](docs/screenshots/mobile-discover.png) |

## Run it

Requires Node 20.19+ or 22.12+ (developed on Node 23) and npm.

```bash
cd web
npm ci
npm run dev          # http://localhost:5173 (Vite picks the next free port if taken), mock mode
```

### Mock mode (default under `npm run dev`)

Every call is answered from recorded data in `src/mocks/` after an artificial
delay. **Nothing touches the network, so no API key is used and nothing is
billed.** A "Mock data" badge sits in the header. Each screen has a
collapsible "Recorded runs" list, and a notice under each result names the
repository file it came from. Inputs that match no recording get the API
contract snapshot, with a notice saying so.

Streams behave as they do live: the captured `discover-stream.txt` is
replayed event by event through the same SSE parser the live client uses.
Request validation mirrors the API (topic and query length, identical topics,
topK range, allowed models, arXiv id format), so form errors look the same in
both modes. PDF upload, arXiv ingest and deletes change an in-memory library
for the session.

### Real mode

```bash
cd web
VITE_USE_MOCKS=false npm run dev
```

This needs the LIBRAIN API running on `http://localhost:5000` (repo root:
`dotnet run --project LIBRAIN --launch-profile http`). **Real mode spends
money on every Ask, Discover, Compare and ingest**: Compare alone makes three
pipeline runs.

The Vite dev server proxies `/api/*` and `/health` to `http://localhost:5000`,
so the browser only makes same-origin requests and no CORS is needed. Point
the proxy elsewhere with `VITE_API_PROXY_TARGET`. The header shows "API
connected" or "API unreachable" from `GET /health`.

**API key.** When the server sets `Security:ApiKey`, every `/api` call needs
`X-Api-Key`. Open the key icon in the header, paste the key and save. It is
kept in `localStorage`, or in memory for the tab if storage is blocked. A 401
opens that panel by itself, and the failed screen offers "Enter API key" and
"Try again".

**Rate limit.** Over `RateLimiting:PaidRequestsPerHour`, the API answers 429.
The UI says when to retry, from `Retry-After`, and disables "Try again" until
then. When the UI is served from another origin the browser hides
`Retry-After` (see below), and the message then says the limit resets within
the hour.

**Production build.** `npm run build` defaults to real mode. Serve `dist/`
behind the same origin as the API, or set `VITE_API_BASE_URL` to the API
origin and add the site to the API's `Cors:AllowedOrigins`.

**Docker.** `docker compose up --build` at the repo root builds this UI in
real mode and serves it with nginx at http://localhost:5180. nginx forwards
`/api` and `/health` to the API container, so the UI and the API share one
origin, and `proxy_buffering off` keeps progress streams live. The API is
also published on http://localhost:5080, so for `npm run dev` against that
stack set `VITE_API_PROXY_TARGET=http://localhost:5080`.

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_USE_MOCKS` | `true` in `npm run dev`, `false` in `npm run build` | `false`/`0`/`no`/`off` calls the API; anything else uses recorded data. |
| `VITE_API_PROXY_TARGET` | `http://localhost:5000` | Dev-server proxy target for real mode. |
| `VITE_API_BASE_URL` | empty (same origin) | API origin for builds served apart from the API (needs CORS on the API). |

See `.env.example`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR. |
| `npm run build` | `tsc --noEmit`, then the production build into `dist/`. |
| `npm run preview` | Serves `dist/` (port 4173, which the API's development CORS allows). |
| `npm test` | Vitest, once. `fetch` is stubbed to throw, so no test can reach the network. |
| `npm run lint` | ESLint (typescript-eslint, react-hooks). |
| `npm run typecheck` | `tsc --noEmit` only. |

> npm 10.9.x has an arborist bug (`Cannot read properties of null (reading
> 'edgesOut')`) when *adding* some packages to this tree. `npm ci` and
> `npm install` from the lockfile work; to add a dependency, run
> `npx npm@11 install <pkg>`.

## Screens

- **Library**: papers in the vector store (`GET /api/papers`) with title,
  authors, year, chunk count and date added, which you can filter and sort.
  - Upload a PDF (`POST /api/papers/ingest`) with real upload progress, then
    a processing phase. The file name becomes the paper id, checked against
    the API's naming rule.
  - Ingest from arXiv (`POST /api/papers/arxiv`). The id is checked with the
    API's own rules first (version suffix, `arXiv:` prefix and abs/pdf links
    accepted), and the UI shows the normalised id before sending.
  - Delete a paper (`DELETE /api/papers/{id}`) after an inline confirm row,
    not a browser dialog.
- **Ask** (`POST /api/query/stream`):
  - A stage stepper shows each server message ("Found 5 passages", "2
    citation(s) resolved…"), per-stage and total time, and a Cancel button.
  - The answer renders `[n]` markers as chips. A chip opens a side panel
    (bottom sheet on phones) with the paper, section, page, chunk and the
    cited passage.
  - Beside the answer are evaluator bars, the critique, unsupported claims,
    missing evidence and a copyable correlation id.
- **Discover** (`POST /api/discover/stream`):
  - Inputs: Topic A, optional Topic B, passages per topic, and provider
    (Anthropic, or OpenAI with gpt-4o or gpt-4o-mini).
  - The live stepper shows "Found N distinct passages" and "Citation
    contract kept X of Y cited sources" as they arrive.
  - The novel claim is painted sentence by sentence with the validator's
    verdict: grounded (solid underline), extrapolated (dashed) or risky
    (wavy), each with its own colour and icon.
  - Hover, focus or pin a sentence to read the margin note: probability,
    rationale, supporting chunks with their passage text, and the
    generator's own basis.
  - A scorecard shows quality, novelty, plausibility, coherence, aggregate
    risk and the citation contract ("dropped N").
  - `validationFailed` shows a warning and leaves the claim unpainted.
- **Compare** (`POST /api/compare`, one call): a plain-language explainer of
  the three systems and one score table on a shared 0 to 1 scale.
  - Naive-RAG citations outside the retrieved set are marked as fabricated
    (red, struck through, labelled).
  - A system that fails shows its error and its correlation id; the other
    two still render.
- **History**:
  - Real mode reads the API's run database (`GET /api/runs`, filtered by
    kind on the server). That includes runs started elsewhere, such as the
    experiments CLI, and standalone Naive-RAG and Single-LLM runs.
  - Mock mode keeps runs in `localStorage`. If storage is unavailable it
    falls back to memory and says so.
  - Open a run to re-render it with the same components. Delete it, with an
    inline confirm (`DELETE /api/runs/{id}` in real mode), or export one or
    all as JSON (the `/api/runs` record shape) or Markdown.

Light and dark themes follow the system setting; the header button cycles
system, light and dark. Every screen was checked at 360 and 375 px wide with
no horizontal scrolling, in both themes. Every screen is keyboard operable
(skip link, visible focus, focus moved to new content and back from panels)
and respects reduced motion. Lighthouse (snapshot mode, mock data) scores 100
for accessibility and best practices on every screen.

## Code map

```
src/
  api/          types.ts       DTOs mirroring the C# records (source files listed in its header)
                normalize.ts   wire -> UI mapping: numeric/string enums, optional fields, run records
                sse.ts         fetch + ReadableStream SSE parser (any chunk boundary, split UTF-8, CR/LF/CRLF)
                httpClient.ts  live client: every endpoint, streams, X-Api-Key, problem+json, Retry-After
                mockClient.ts  recorded-data client (dynamically imported; not in real-mode bundles)
                apiKey.ts      the stored key and the "please enter a key" signal
                errors.ts      ApiError and plain-language descriptions (401, 429, 502, stream errors)
  mocks/        contract/      responses captured from the real API (do not edit by hand)
                fixtures/      committed experiment outputs (byte-for-byte copies)
                scenarios.ts   what mock mode serves, with every assembled or synthetic piece labelled
  lib/          sentences.ts   validator-sentence -> novelClaim matching
                citations.ts   [n] markers, fabricated-citation audit, chip line-wrapping
                arxiv.ts       mirror of ArxivClient.TryNormalizeId
                stages.ts      progress events -> stepper steps
  history/      runStore.ts    THE SEAM: RunStore interface + createDefaultRunStore(api)
                httpRunStore.ts / localRunStore.ts, exporters.ts (JSON/Markdown)
  components/   AnnotatedClaim (the sentence view), ProgressStepper, DiscoverResult, AskResult, CompareView, ...
  pages/        one lazily loaded chunk per screen
```

The initial bundle is 297 kB (95 kB gzip), down from 420 kB (130 kB gzip)
before route splitting and the switch from the data router to declarative
routing. React DOM is about 200 kB of that.

## Tests

`npm test` runs 159 tests, all offline:

- **Contract tests** (`api/contract.test.ts`) parse every file in
  `src/mocks/contract/` through the client mapping. When the backend
  re-captures snapshots after a shape change, these fail first.
- **SSE parser** (`api/sse.test.ts`) gets identical events for the captured
  stream fed in 1, 2, 3, 5, 7, 13, 64 and 257-byte chunks and in jagged
  random chunks. It also covers CRLF pairs split across chunks, multi-byte
  UTF-8 split at every byte, comments, multi-line data, BOM and abort.
- **HTTP client**: X-Api-Key, 401, 429 with Retry-After (both forms), stream
  `result`/`error` events with correlation ids, 400 before streaming,
  cancellation.
- **History** against the `/api/runs` shapes (`runs.json`,
  `run-record.json`) and the browser store, including storage that throws
  or is full.
- Sentence matching against every recorded run, fabricated-citation audit,
  arXiv id rules, the progress stepper, and screen-level flows (arXiv
  ingest, inline delete, 401 to API key to retry, 429).

Tests that need a variation of a snapshot derive it in the test and say so
(for example `validationFailed` flipped to true, or one Compare outcome
replaced with a failure). The snapshot files are never edited.

## Mock data

| Source | Used for | Changes |
| --- | --- | --- |
| `src/mocks/contract/*.json`, `discover-stream.txt` | Every endpoint's shape; the "API snapshot" recorded runs; the default answer for unmatched inputs; the mock run history | None. Captured by `LIBRAIN.Tests/Api/UiContractSnapshotTests.cs` from the real API with a fake LLM, so the text is placeholder-like. |
| `fixtures/discover-anthropic-pair-{01,02,08,10}.json` | Discover recorded runs; LIBRAIN column of Compare | None. Copies of `experiments/baseline-comparison/results/librain/`. pair-10 has a RISKY sentence; pair-02 a GROUNDED one. |
| `fixtures/discover-openai-pair-{01,03,21}.json` | Discover recorded runs (OpenAI) | None. Copies of `experiments/discovery-openai/`. pair-03 has one dropped citation; pair-01's validator split one sentence in two. |
| `fixtures/{naive-rag,single-llm}-pair-{01,10}.json` | Compare recorded runs | None. In mock mode they are wrapped in the `/api/compare` envelope; the envelope id reads `assembled-pair-NN` and has no total time. |
| Progress for recordings without a captured stream | Ask, and Discover for experiment recordings | Synthesised from the stage names and wording in `QueryPipeline.cs` / `DiscoveryAgent.cs`, with counts taken from the recorded result (`synthesise*Progress` in `scenarios.ts`). The OpenAI path emits only `generating`, as the real endpoint does. |
| Mock library | Library in mock mode | Derived: the snapshot's paper plus every paper id the recordings cite. No titles, authors, years or dates are invented; chunk counts are lower bounds (highest cited chunk index plus one). The page says so. |

The fabricated Naive-RAG citation shown in Compare is the real one in
`compare-response.json`. The committed baseline-experiment runs have none.

## Backend changes this UI would use

1. **Expose `Retry-After` to cross-origin clients**:
   `WithExposedHeaders("Retry-After")` in the CORS policy. Without it a
   separately hosted UI cannot say when a 429 ends.
2. **Capture a query stream snapshot** (`query-stream.txt`) alongside
   `discover-stream.txt`, so mock mode can replay it instead of synthesising
   one.
3. **Progress for `/api/compare`**, either a stream or per-system events.
   The call takes as long as the slowest system, and today the UI can only
   show elapsed time.
4. **Paging for `/api/runs`**: an offset or cursor alongside `limit`. History
   shows the latest 100.
5. **Ingest progress**: the processing phase after upload, or arXiv
   download plus embedding, is opaque.
6. **`JsonStringEnumConverter`** (optional): readable enums on the wire.
   The UI already accepts both forms.
