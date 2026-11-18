import { normalizeArxivId } from '../lib/arxiv';
import {
  askScenarios,
  compareScenarios,
  contract,
  discoverScenarios,
  findAsk,
  findCompare,
  findDiscover,
  mockLibrary,
  synthesiseDiscoverProgress,
  synthesiseQueryProgress,
} from '../mocks/scenarios';
import { ApiError, errorFromStreamEvent } from './errors';
import {
  normalizeCompareResponse,
  normalizeDiscoverResponse,
  normalizeIngest,
  normalizeNaiveRag,
  normalizePapers,
  normalizeProgress,
  normalizeQueryResponse,
  normalizeRunDetail,
  normalizeRunSummaries,
  normalizeSingleLlm,
} from './normalize';
import { SseParser } from './sse';
import {
  MAX_QUERY_CHARS,
  MAX_TOPIC_CHARS,
  OPENAI_MODELS,
  type DiscoverRequest,
  type DiscoverResponse,
  type IngestOptions,
  type IngestResult,
  type LibrainApi,
  type MockMatch,
  type PaperSummary,
  type ProgressEvent,
  type ProgressListener,
  type QueryRequest,
  type RunSummary,
} from './types';

/*
 * Mock mode: every call is answered from recorded data (see
 * src/mocks/scenarios.ts) after an artificial delay. Nothing touches the
 * network. Request validation mirrors the API's 400 responses so forms behave
 * the same in both modes, and streams go through the same SSE parser as live.
 */

export interface MockApiOptions {
  /** Multiplier for the artificial delays; 0 in tests. */
  latency?: number;
}

const DELAY = {
  papers: 350,
  ingestStep: 110,
  ingestProcessing: 900,
  arxiv: 1600,
  naiveRag: 1100,
  singleLlm: 700,
  compare: 2600,
  runs: 200,
  resultAfterLastStage: 1300,
} as const;

/** Wait before each stage, roughly in proportion to the real pipeline. */
const STAGE_DELAY: Record<string, number> = {
  retrieving: 150,
  retrieved: 600,
  generating: 300,
  validated: 1900,
  scoring: 250,
  evaluating: 250,
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError({ kind: 'aborted', title: 'Request cancelled' }));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ApiError({ kind: 'aborted', title: 'Request cancelled' }));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function problem(status: number, title: string, detail: string): ApiError {
  return new ApiError({ kind: 'http', status, title, detail });
}

function checkTopK(topK: number | undefined): void {
  if (topK !== undefined && (!Number.isInteger(topK) || topK < 1 || topK > 20)) {
    throw problem(400, 'topK out of range', "The 'topK' field must be between 1 and 20.");
  }
}

/** Same checks, in the same order, as DiscoveryEndpoints.Validate. */
function checkTopics(topicA: string, topicB: string | undefined): void {
  if (!topicA.trim()) throw problem(400, 'topicA is required', "The 'topicA' field must be a non-empty string.");
  if (topicA.length > MAX_TOPIC_CHARS || (topicB?.length ?? 0) > MAX_TOPIC_CHARS) {
    throw problem(400, 'topic too long', `Topics must be at most ${MAX_TOPIC_CHARS} characters.`);
  }
  if (topicB?.trim() && topicA.trim() === topicB.trim()) {
    throw problem(400, 'topicA and topicB must differ', 'If topicB is supplied it must differ from topicA after trimming.');
  }
}

function checkDiscover(request: DiscoverRequest): void {
  checkTopics(request.topicA ?? '', request.topicB);
  checkTopK(request.topK);
  if (request.model !== undefined && !(OPENAI_MODELS as readonly string[]).includes(request.model)) {
    throw problem(400, 'model not allowed', `model must be one of: ${OPENAI_MODELS.join(', ')}.`);
  }
}

function checkQuery(request: QueryRequest): void {
  if (!request.query?.trim()) throw problem(400, 'Query is required', "The 'query' field must be a non-empty string.");
  if (request.query.length > MAX_QUERY_CHARS) {
    throw problem(400, 'Query too long', `The 'query' field must be at most ${MAX_QUERY_CHARS} characters.`);
  }
  checkTopK(request.topK);
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

function toMatch(found: { scenario: { label: string; source: string; note?: string }; matched: boolean }): MockMatch {
  const match: MockMatch = { matched: found.matched, label: found.scenario.label, source: found.scenario.source };
  if (found.scenario.note) match.note = found.scenario.note;
  return match;
}

/** Splits a captured event stream into its events, each kept with its trailing blank line. */
function streamBlocks(text: string): string[] {
  return text.split(/(?<=\n\n)/).filter((b) => b.trim() !== '');
}

export function createMockApi(options: MockApiOptions = {}): LibrainApi {
  const scale = options.latency ?? 1;
  const delay = (ms: number, signal?: AbortSignal) => sleep(Math.round(ms * scale), signal);
  let library: PaperSummary[] = normalizePapers(mockLibrary());

  // The run list the API returned at capture time, with full records built from the snapshots.
  let runs: RunSummary[] = normalizeRunSummaries(contract.runs);
  const runDetail = (summary: RunSummary): unknown => {
    const topics = { topicA: 'weather forecasting', topicB: 'protein folding', topK: 2 };
    switch (summary.kind) {
      case 'discover':
        return contract.runRecord;
      case 'query':
        return { ...summary, request: { query: summary.title, topK: 2 }, response: contract.query };
      case 'compare':
        return { ...summary, request: topics, response: contract.compare };
      case 'naive-rag':
        return { ...summary, request: topics, response: contract.naiveRag };
      case 'single-llm':
        return { ...summary, request: { topicA: topics.topicA, topicB: topics.topicB }, response: contract.singleLlm };
    }
  };

  /** Replays a captured text/event-stream through the real parser, a few bytes at a time. */
  async function replayStream<T>(text: string, normalize: (raw: unknown) => T, onProgress: ProgressListener, signal?: AbortSignal): Promise<T> {
    let result: T | null = null;
    let failure: ApiError | null = null;
    const parser = new SseParser((message) => {
      const data = JSON.parse(message.data) as unknown;
      if (message.event === 'progress') onProgress(normalizeProgress(data));
      else if (message.event === 'result') result = normalize(data);
      else if (message.event === 'error') failure = errorFromStreamEvent(data);
    });
    const bytes = new TextEncoder();
    for (const block of streamBlocks(text)) {
      const stage = /"stage":"([^"]+)"/.exec(block)?.[1];
      await delay(stage ? (STAGE_DELAY[stage] ?? 300) : DELAY.resultAfterLastStage, signal);
      const encoded = bytes.encode(block);
      // Deliver each event in uneven pieces, as a network would.
      for (let i = 0; i < encoded.length; i += 97) parser.push(encoded.subarray(i, i + 97));
    }
    parser.end();
    if (failure) throw failure;
    if (result === null) throw new ApiError({ kind: 'stream', title: 'The stream ended without a result' });
    return result;
  }

  async function emitSynthetic<T>(events: ProgressEvent[], value: T, onProgress: ProgressListener, signal?: AbortSignal): Promise<T> {
    for (const event of events) {
      await delay(STAGE_DELAY[event.stage] ?? 300, signal);
      onProgress(event);
    }
    await delay(DELAY.resultAfterLastStage, signal);
    return value;
  }

  async function ingestPaper(file: File, opts: IngestOptions = {}): Promise<IngestResult> {
    if (!file || file.size === 0) throw problem(400, 'file is required', "Upload a PDF in the multipart field 'file'.");
    const paperId = file.name.replace(/\.[^.]+$/, '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(paperId)) {
      throw problem(400, 'invalid file name', "The file name (without .pdf) becomes the paper id: use letters, digits, '.', '_' or '-' (max 128).");
    }
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await delay(DELAY.ingestStep, opts.signal);
      opts.onProgress?.(i / steps);
    }
    await delay(DELAY.ingestProcessing, opts.signal);
    // Simulated: shape and chunk count from the captured ingest snapshot; id and title from the file name, as the API does.
    const captured = normalizeIngest(contract.ingest);
    const result: IngestResult = { paperId, chunkCount: captured.chunkCount, correlationId: uuid(), title: paperId };
    library = [
      ...library.filter((p) => p.paperId !== paperId),
      { paperId, title: paperId, chunkCount: result.chunkCount, firstIngestedAt: new Date().toISOString(), authors: null, year: null },
    ];
    return result;
  }

  async function ingestArxiv(arxivId: string, signal?: AbortSignal): Promise<IngestResult> {
    const id = normalizeArxivId(arxivId);
    if (!id) {
      throw problem(400, 'invalid arXiv id', "Use a new-style id such as 2005.11401 (a version suffix, 'arXiv:' prefix or abs/pdf URL is fine).");
    }
    await delay(DELAY.arxiv, signal);
    const captured = normalizeIngest(contract.arxiv);
    // Only 2005.11401 was captured; other ids are simulated without metadata (mock mode cannot reach arXiv).
    const result: IngestResult = id === captured.paperId ? captured : { paperId: id, chunkCount: captured.chunkCount, correlationId: uuid(), title: null };
    library = [
      ...library.filter((p) => p.paperId !== id),
      { paperId: id, title: result.title, chunkCount: result.chunkCount, firstIngestedAt: new Date().toISOString(), authors: null, year: null },
    ];
    return result;
  }

  return {
    mode: 'mock',
    mock: {
      ask: askScenarios.map(({ response: _r, stream: _s, ...s }) => s),
      discover: discoverScenarios.map(({ response: _r, stream: _s, ...s }) => s),
      compare: compareScenarios.map(({ response: _r, naiveRag: _n, singleLlm: _s, ...s }) => s),
      matchAsk: (request) => toMatch(findAsk(request)),
      matchDiscover: (request) => toMatch(findDiscover(request)),
      matchCompare: (request) => toMatch(findCompare(request)),
    },

    async health(signal) {
      await delay(80, signal);
      return { status: 'ok' };
    },

    async listPapers(signal) {
      await delay(DELAY.papers, signal);
      return [...library];
    },

    ingestPaper,
    ingestArxiv,

    async deletePaper(paperId, signal) {
      await delay(DELAY.runs, signal);
      if (!library.some((p) => p.paperId === paperId)) throw problem(404, 'paper not found', `No chunks stored for '${paperId}'.`);
      library = library.filter((p) => p.paperId !== paperId);
    },

    async query(request, signal) {
      checkQuery(request);
      await delay(DELAY.resultAfterLastStage + 1500, signal);
      return normalizeQueryResponse(findAsk(request).scenario.response);
    },

    async queryStream(request, onProgress, signal) {
      checkQuery(request);
      const { scenario } = findAsk(request);
      if (scenario.stream) return replayStream(scenario.stream, normalizeQueryResponse, onProgress, signal);
      const result = normalizeQueryResponse(scenario.response);
      return emitSynthetic(synthesiseQueryProgress(scenario.request, result), result, onProgress, signal);
    },

    async discover(request, signal) {
      checkDiscover(request);
      await delay(DELAY.resultAfterLastStage + 2000, signal);
      return normalizeDiscoverResponse(findDiscover(request).scenario.response);
    },

    async discoverStream(request, onProgress, signal) {
      checkDiscover(request);
      const { scenario } = findDiscover(request);
      if (scenario.stream) return replayStream(scenario.stream, normalizeDiscoverResponse, onProgress, signal);
      const result: DiscoverResponse = normalizeDiscoverResponse(scenario.response);
      return emitSynthetic(synthesiseDiscoverProgress(scenario.request, result), result, onProgress, signal);
    },

    async naiveRag(request, signal) {
      checkTopics(request.topicA ?? '', request.topicB);
      checkTopK(request.topK);
      await delay(DELAY.naiveRag, signal);
      return normalizeNaiveRag(findCompare(request).scenario.naiveRag);
    },

    async singleLlm(request, signal) {
      checkTopics(request.topicA ?? '', request.topicB);
      await delay(DELAY.singleLlm, signal);
      return normalizeSingleLlm(findCompare(request).scenario.singleLlm);
    },

    async compare(request, signal) {
      checkTopics(request.topicA ?? '', request.topicB);
      checkTopK(request.topK);
      await delay(DELAY.compare, signal);
      return normalizeCompareResponse(findCompare(request).scenario.response);
    },

    async listRuns(filter = {}, signal) {
      await delay(DELAY.runs, signal);
      const list = filter.kind ? runs.filter((r) => r.kind === filter.kind) : runs;
      return list.slice(0, filter.limit ?? 50);
    },

    async getRun(id, signal) {
      await delay(DELAY.runs, signal);
      const summary = runs.find((r) => r.id === id);
      if (!summary) throw problem(404, 'run not found', `No run with id ${id}.`);
      return normalizeRunDetail(runDetail(summary));
    },

    async deleteRun(id, signal) {
      await delay(DELAY.runs, signal);
      if (!runs.some((r) => r.id === id)) throw problem(404, 'run not found', `No run with id ${id}.`);
      runs = runs.filter((r) => r.id !== id);
    },
  };
}
