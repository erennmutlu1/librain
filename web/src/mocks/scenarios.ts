/*
 * Everything mock mode serves, and where it came from.
 *
 * Two kinds of real data, never hand-written content:
 *   1. API contract snapshots (src/mocks/contract/): responses captured from
 *      the real API running in memory with a fake LLM
 *      (LIBRAIN.Tests/Api/UiContractSnapshotTests.cs). They pin every shape.
 *   2. Committed experiment outputs (src/mocks/fixtures/): byte-for-byte copies
 *      of LIBRAIN results under experiments/, for real domain content.
 *
 * Anything assembled or synthesised is labelled where it is built:
 *   - progress events for recordings that have no captured stream
 *     (synthesiseDiscoverProgress / synthesiseQueryProgress);
 *   - Compare envelopes around three separate experiment outputs;
 *   - the mock library, derived from the paper ids those outputs cite.
 */
import { normalizeDiscoverResponse, normalizeQueryResponse } from '../api/normalize';
import type {
  CompareRequest,
  DiscoverRequest,
  DiscoverResponse,
  MockScenario,
  ProgressEvent,
  QueryRequest,
  QueryResponse,
} from '../api/types';
import { parseChunkKey } from '../lib/citations';

import contractArxiv from './contract/arxiv-ingest-result.json';
import contractCompare from './contract/compare-response.json';
import contractDiscover from './contract/discover-response.json';
import discoverStreamText from './contract/discover-stream.txt?raw';
import contractIngest from './contract/ingest-result.json';
import contractNaive from './contract/naive-rag-response.json';
import contractPapers from './contract/papers.json';
import contractProblem400 from './contract/problem-400.json';
import contractQuery from './contract/query-response.json';
import contractRunRecord from './contract/run-record.json';
import contractRuns from './contract/runs.json';
import contractSingle from './contract/single-llm-response.json';

import discoverAnthropic01 from './fixtures/discover-anthropic-pair-01.json';
import discoverAnthropic02 from './fixtures/discover-anthropic-pair-02.json';
import discoverAnthropic08 from './fixtures/discover-anthropic-pair-08.json';
import discoverAnthropic10 from './fixtures/discover-anthropic-pair-10.json';
import discoverOpenai01 from './fixtures/discover-openai-pair-01.json';
import discoverOpenai03 from './fixtures/discover-openai-pair-03.json';
import discoverOpenai21 from './fixtures/discover-openai-pair-21.json';
import naiveRag01 from './fixtures/naive-rag-pair-01.json';
import naiveRag10 from './fixtures/naive-rag-pair-10.json';
import singleLlm01 from './fixtures/single-llm-pair-01.json';
import singleLlm10 from './fixtures/single-llm-pair-10.json';

export const contract = {
  arxiv: contractArxiv as unknown,
  compare: contractCompare as unknown,
  discover: contractDiscover as unknown,
  discoverStream: discoverStreamText,
  ingest: contractIngest as unknown,
  naiveRag: contractNaive as unknown,
  papers: contractPapers as unknown,
  problem400: contractProblem400 as unknown,
  query: contractQuery as unknown,
  runRecord: contractRunRecord as unknown,
  runs: contractRuns as unknown,
  singleLlm: contractSingle as unknown,
};

const SNAPSHOT_NOTE =
  'API contract snapshot: real API output with a fake LLM, so the text is placeholder-like but every field is exactly what the API sends.';

/** The request every contract snapshot was captured with (UiContractSnapshotTests). */
const CONTRACT_TOPICS: CompareRequest = { topicA: 'weather forecasting', topicB: 'protein folding', topK: 2 };

export interface Recorded<Req> extends MockScenario<Req> {
  response: unknown;
}

// ---------- Ask ----------

export const askScenarios: Recorded<QueryRequest>[] = [
  {
    id: 'contract-query',
    label: 'Why does GraphCast forecast well?',
    request: { query: 'Why does GraphCast forecast well?', topK: 2 },
    source: 'web/src/mocks/contract/query-response.json',
    note: `${SNAPSHOT_NOTE} Progress events are synthesised from the documented query stages.`,
    response: contractQuery,
  },
];

// ---------- Discover ----------

export interface DiscoverRecording extends Recorded<DiscoverRequest> {
  /** A captured text/event-stream, replayed verbatim when present. */
  stream?: string;
}

export const discoverScenarios: DiscoverRecording[] = [
  {
    id: 'anthropic-pair-10',
    label: 'Drug discovery × climate adaptation',
    request: { topicA: 'drug discovery', topicB: 'climate adaptation', topK: 5, provider: 'anthropic' },
    source: 'experiments/baseline-comparison/results/librain/pair-10.json',
    response: discoverAnthropic10,
  },
  {
    id: 'anthropic-pair-02',
    label: 'Retrieval-augmented generation × de novo molecular design',
    request: { topicA: 'retrieval-augmented generation', topicB: 'de novo molecular design', topK: 5, provider: 'anthropic' },
    source: 'experiments/baseline-comparison/results/librain/pair-02.json',
    response: discoverAnthropic02,
  },
  {
    id: 'anthropic-pair-01',
    label: 'Large language models × drug-target interaction prediction',
    request: { topicA: 'large language models', topicB: 'drug-target interaction prediction', topK: 5, provider: 'anthropic' },
    source: 'experiments/baseline-comparison/results/librain/pair-01.json',
    response: discoverAnthropic01,
  },
  {
    id: 'anthropic-pair-08',
    label: 'Brain-inspired architectures × hypothesis generation',
    request: { topicA: 'brain inspired architectures', topicB: 'hypothesis generation', topK: 5, provider: 'anthropic' },
    source: 'experiments/baseline-comparison/results/librain/pair-08.json',
    response: discoverAnthropic08,
  },
  {
    id: 'openai-pair-21',
    label: 'Graph neural networks × epidemic spread modeling (OpenAI)',
    request: { topicA: 'graph neural networks', topicB: 'epidemic spread modeling', topK: 5, provider: 'openai', model: 'gpt-4o' },
    source: 'experiments/discovery-openai/pair-21.json',
    response: discoverOpenai21,
  },
  {
    id: 'openai-pair-03',
    label: 'Agentic AI × clinical trial design (OpenAI, 1 citation dropped)',
    request: { topicA: 'agentic AI', topicB: 'clinical trial design', topK: 5, provider: 'openai', model: 'gpt-4o-mini' },
    source: 'experiments/discovery-openai/pair-03.json',
    response: discoverOpenai03,
  },
  {
    id: 'openai-pair-01',
    label: 'Large language models × drug-target interaction prediction (OpenAI)',
    request: { topicA: 'large language models', topicB: 'drug-target interaction prediction', topK: 5, provider: 'openai', model: 'gpt-4o-mini' },
    source: 'experiments/discovery-openai/pair-01.json',
    response: discoverOpenai01,
  },
  {
    id: 'contract-discover',
    label: 'Weather forecasting × protein folding (API snapshot)',
    request: { ...CONTRACT_TOPICS },
    source: 'web/src/mocks/contract/discover-stream.txt',
    note: `${SNAPSHOT_NOTE} The captured event stream is replayed event by event.`,
    response: contractDiscover,
    stream: discoverStreamText,
  },
];

/** Served when the topics match no recording. */
export const DEFAULT_DISCOVER = discoverScenarios.find((s) => s.id === 'contract-discover')!;

// ---------- Compare ----------

export interface CompareRecording extends Recorded<CompareRequest> {
  naiveRag: unknown;
  singleLlm: unknown;
}

/**
 * Wraps three committed experiment outputs in the /api/compare envelope. The
 * envelope itself was never returned by an API: its correlation id is a
 * visible "assembled-…" label and it has no totalElapsedMs.
 */
function assembleCompare(id: string, request: CompareRequest, librain: unknown, naiveRag: unknown, singleLlm: unknown): unknown {
  const idOf = (r: unknown) => (r as { correlationId?: string }).correlationId ?? null;
  return {
    correlationId: `assembled-${id}`,
    topicA: request.topicA,
    topicB: request.topicB ?? null,
    topK: request.topK ?? 5,
    librain: { result: librain, error: null, correlationId: idOf(librain) },
    naiveRag: { result: naiveRag, error: null, correlationId: idOf(naiveRag) },
    singleLlm: { result: singleLlm, error: null, correlationId: idOf(singleLlm) },
  };
}

const PAIR_10: CompareRequest = { topicA: 'drug discovery', topicB: 'climate adaptation', topK: 5 };
const PAIR_01: CompareRequest = { topicA: 'large language models', topicB: 'drug-target interaction prediction', topK: 5 };

export const compareScenarios: CompareRecording[] = [
  {
    id: 'contract-compare',
    label: 'Weather forecasting × protein folding (API snapshot, 1 fabricated citation)',
    request: { ...CONTRACT_TOPICS },
    source: 'web/src/mocks/contract/compare-response.json',
    note: SNAPSHOT_NOTE,
    response: contractCompare,
    naiveRag: contractNaive,
    singleLlm: contractSingle,
  },
  {
    id: 'pair-10',
    label: 'Drug discovery × climate adaptation',
    request: PAIR_10,
    source: 'experiments/baseline-comparison/results/{librain,naive-rag,single-llm}/pair-10.json',
    note: 'Three committed outputs from the baseline experiment, wrapped in the /api/compare envelope.',
    response: assembleCompare('pair-10', PAIR_10, discoverAnthropic10, naiveRag10, singleLlm10),
    naiveRag: naiveRag10,
    singleLlm: singleLlm10,
  },
  {
    id: 'pair-01',
    label: 'Large language models × drug-target interaction prediction',
    request: PAIR_01,
    source: 'experiments/baseline-comparison/results/{librain,naive-rag,single-llm}/pair-01.json',
    note: 'Three committed outputs from the baseline experiment, wrapped in the /api/compare envelope.',
    response: assembleCompare('pair-01', PAIR_01, discoverAnthropic01, naiveRag01, singleLlm01),
    naiveRag: naiveRag01,
    singleLlm: singleLlm01,
  },
];

export const DEFAULT_COMPARE = compareScenarios[0]!;

// ---------- Synthetic progress (labelled) ----------

/**
 * SYNTHETIC. Committed experiment outputs carry no event stream, so mock mode
 * rebuilds one from the stage list and message wording in
 * LIBRAIN/Agents/DiscoveryAgent.cs. Counts come from the recorded result when
 * it has them; the retrieval count is not recorded, so that event has none.
 * The OpenAI path emits only "generating", as the real endpoint does.
 */
export function synthesiseDiscoverProgress(request: DiscoverRequest, result: DiscoverResponse): ProgressEvent[] {
  if (request.provider === 'openai') {
    return [{ stage: 'generating', message: 'Running the OpenAI port of the Discovery pipeline', count: null }];
  }
  const kept = result.supportingEvidence.length;
  const claimed = result.claimedEvidenceCount;
  return [
    { stage: 'retrieving', message: request.topicB ? 'Searching the corpus for both topics' : 'Searching the corpus', count: null },
    { stage: 'retrieved', message: 'Retrieved passages for each topic', count: null },
    { stage: 'generating', message: 'Asking Claude for a hypothesis that goes beyond the sources', count: null },
    {
      stage: 'validated',
      message: claimed !== undefined ? `Citation contract kept ${kept} of ${claimed} cited sources` : `Citation contract kept ${kept} cited sources`,
      count: kept,
    },
    { stage: 'scoring', message: 'Scoring novelty, plausibility and per-sentence claim risk', count: null },
  ];
}

/**
 * SYNTHETIC. No query stream was captured; this follows the stage list and
 * wording in LIBRAIN/Pipelines/QueryPipeline.cs with counts taken from the
 * recorded request (passages) and response (citations).
 */
export function synthesiseQueryProgress(request: QueryRequest, result: QueryResponse): ProgressEvent[] {
  const passages = request.topK ?? 5;
  const cited = result.citations.length;
  return [
    { stage: 'retrieving', message: 'Searching the corpus', count: null },
    { stage: 'retrieved', message: `Found ${passages} passages`, count: passages },
    { stage: 'generating', message: 'Writing a citation-grounded answer', count: null },
    { stage: 'validated', message: `${cited} citation(s) resolved to retrieved passages`, count: cited },
    { stage: 'evaluating', message: 'Judging groundedness, relevance and completeness', count: null },
  ];
}

// ---------- Mock library (derived, labelled) ----------

interface ChunkRef {
  paperId: string;
  chunkIndex: number | null;
}

function chunkRefs(): ChunkRef[] {
  const refs: ChunkRef[] = [];
  for (const s of discoverScenarios) {
    const r = normalizeDiscoverResponse(s.response);
    for (const e of r.supportingEvidence) refs.push({ paperId: e.paperId, chunkIndex: e.chunkIndex });
    for (const c of r.claimValidation?.claims ?? []) for (const k of c.supportingChunks) refs.push(parseChunkKey(k));
    for (const b of r.extrapolationBasis) if (b.groundedInChunkId) refs.push(parseChunkKey(b.groundedInChunkId));
  }
  for (const s of askScenarios) {
    for (const c of normalizeQueryResponse(s.response).citations) refs.push({ paperId: c.paperId, chunkIndex: c.chunkIndex });
  }
  for (const s of compareScenarios) {
    const cited = (s.naiveRag as { claimedCitations?: { paperId: string; chunkIndex: number; isResolved: boolean }[] }).claimedCitations ?? [];
    // Unresolved citations point outside the retrieval set, so they prove nothing about the corpus.
    for (const c of cited) if (c.isResolved) refs.push({ paperId: c.paperId, chunkIndex: c.chunkIndex });
  }
  return refs;
}

/**
 * DERIVED. The papers the recordings cite, with no invented metadata: title,
 * authors, year and ingest date are unknown (null), and chunkCount is a lower
 * bound (highest chunk index cited, plus one). The API snapshot's own papers
 * list is merged in as captured.
 */
export function mockLibrary(): unknown[] {
  const maxIndex = new Map<string, number>();
  for (const ref of chunkRefs()) {
    const prev = maxIndex.get(ref.paperId) ?? -1;
    maxIndex.set(ref.paperId, Math.max(prev, ref.chunkIndex ?? 0));
  }
  const captured = (contract.papers as { paperId: string }[]).map((p) => p.paperId);
  const derived = [...maxIndex.entries()]
    .filter(([id]) => !captured.includes(id))
    .map(([paperId, max]) => ({ paperId, title: null, chunkCount: max + 1, firstIngestedAt: null, authors: null, year: null }));
  return [...(contract.papers as unknown[]), ...derived];
}

// ---------- Matching ----------

export function normalizeTopic(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function sameTopics(a: { topicA: string; topicB?: string }, b: { topicA: string; topicB?: string }): boolean {
  const a1 = normalizeTopic(a.topicA);
  const a2 = normalizeTopic(a.topicB);
  const b1 = normalizeTopic(b.topicA);
  const b2 = normalizeTopic(b.topicB);
  return (a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1);
}

export function findDiscover(request: DiscoverRequest): { scenario: DiscoverRecording; matched: boolean } {
  const provider = request.provider ?? 'anthropic';
  const byTopic = discoverScenarios.filter((s) => sameTopics(s.request, request));
  const scenario = byTopic.find((s) => (s.request.provider ?? 'anthropic') === provider) ?? byTopic[0];
  return scenario ? { scenario, matched: true } : { scenario: DEFAULT_DISCOVER, matched: false };
}

export function findCompare(request: CompareRequest): { scenario: CompareRecording; matched: boolean } {
  const scenario = compareScenarios.find((s) => sameTopics(s.request, request));
  return scenario ? { scenario, matched: true } : { scenario: DEFAULT_COMPARE, matched: false };
}

export function findAsk(request: QueryRequest): { scenario: Recorded<QueryRequest>; matched: boolean } {
  const q = normalizeTopic(request.query).replace(/[?.!]+$/, '');
  const scenario = askScenarios.find((s) => normalizeTopic(s.request.query).replace(/[?.!]+$/, '') === q);
  return scenario ? { scenario, matched: true } : { scenario: askScenarios[0]!, matched: false };
}
