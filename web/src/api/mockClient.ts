import { ApiError } from './errors';
import {
  normalizeDiscoverResponse,
  normalizeNaiveRag,
  normalizePapers,
  normalizeQueryResponse,
  normalizeSingleLlm,
} from './normalize';
import type {
  CompareRequest,
  DiscoverRequest,
  IngestOptions,
  IngestResult,
  LibrainApi,
  MockMatch,
  PaperSummary,
  QueryRequest,
} from './types';
import {
  askScenarios,
  compareScenarios,
  discoverScenarios,
  findAsk,
  findCompare,
  findDiscover,
  papers as papersFixture,
} from '../mocks/scenarios';

/*
 * Mock mode: every call is answered from recorded fixtures after a short
 * artificial delay. Nothing touches the network. Request validation mirrors
 * the API's 400 responses so form errors look the same in both modes.
 */

export interface MockApiOptions {
  /** Multiplier for the artificial delays; 0 in tests. */
  latency?: number;
}

const BASE_DELAY = {
  papers: 350,
  query: 900,
  discover: 1400,
  naiveRag: 1100,
  singleLlm: 700,
  ingestProcessing: 900,
} as const;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError({ kind: 'aborted', title: 'Request cancelled' }));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ApiError({ kind: 'aborted', title: 'Request cancelled' }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function badRequest(title: string, detail: string): ApiError {
  return new ApiError({ kind: 'http', status: 400, title, detail });
}

function checkTopK(topK: number | undefined): void {
  if (topK !== undefined && (topK < 1 || topK > 20)) {
    throw badRequest('topK out of range', "The 'topK' field must be between 1 and 20.");
  }
}

function checkTopics(topicA: string, topicB: string | undefined, mustDiffer: boolean): void {
  if (!topicA.trim()) throw badRequest('topicA is required', "The 'topicA' field must be a non-empty string.");
  if (mustDiffer && topicB?.trim() && topicA.trim() === topicB.trim()) {
    throw badRequest('topicA and topicB must differ', 'If topicB is supplied it must differ from topicA after trimming.');
  }
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

export function createMockApi(options: MockApiOptions = {}): LibrainApi {
  const scale = options.latency ?? 1;
  const delay = (ms: number, signal?: AbortSignal) => sleep(Math.round(ms * scale), signal);
  let library: PaperSummary[] = normalizePapers(papersFixture);

  async function ingestPaper(file: File, opts: IngestOptions = {}): Promise<IngestResult> {
    if (!file || file.size === 0) throw badRequest('file is required', 'Choose a non-empty PDF file.');
    const paperId = file.name.replace(/\.[^.]+$/, '');
    if (!paperId.trim()) throw badRequest('filename must include a non-empty stem', 'Rename the file and try again.');

    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      await delay(110, opts.signal);
      opts.onProgress?.(i / steps);
    }
    await delay(BASE_DELAY.ingestProcessing, opts.signal);

    const chunkCount = Math.max(4, Math.round(file.size / 9000));
    const entry: PaperSummary = {
      paperId,
      title: paperId,
      chunkCount,
      firstIngestedAt: new Date().toISOString(),
    };
    library = [...library.filter((p) => p.paperId !== paperId), entry];
    return { paperId, chunkCount, correlationId: uuid() };
  }

  return {
    mode: 'mock',
    mock: {
      ask: askScenarios.map(({ response: _r, ...s }) => s),
      discover: discoverScenarios.map(({ response: _r, ...s }) => s),
      compare: compareScenarios.map(({ id, label, request, source, note }) => (note ? { id, label, request, source, note } : { id, label, request, source })),
      matchAsk: (request: QueryRequest) => toMatch(findAsk(request)),
      matchDiscover: (request: DiscoverRequest) => toMatch(findDiscover(request)),
      matchCompare: (request: CompareRequest) => toMatch(findCompare(request)),
    },

    async health(signal) {
      await delay(80, signal);
      return { status: 'ok' };
    },

    async listPapers(signal) {
      await delay(BASE_DELAY.papers, signal);
      return [...library];
    },

    ingestPaper,

    async query(request, signal) {
      if (!request.query?.trim()) throw badRequest('Query is required', "The 'query' field must be a non-empty string.");
      checkTopK(request.topK);
      await delay(BASE_DELAY.query, signal);
      return normalizeQueryResponse(findAsk(request).scenario.response);
    },

    async discover(request, signal) {
      checkTopics(request.topicA ?? '', request.topicB, false);
      checkTopK(request.topK);
      await delay(BASE_DELAY.discover, signal);
      return normalizeDiscoverResponse(findDiscover(request).scenario.response);
    },

    async naiveRag(request, signal) {
      checkTopics(request.topicA ?? '', request.topicB, true);
      checkTopK(request.topK);
      await delay(BASE_DELAY.naiveRag, signal);
      return normalizeNaiveRag(findCompare(request).scenario.naiveRag);
    },

    async singleLlm(request, signal) {
      checkTopics(request.topicA ?? '', request.topicB, true);
      await delay(BASE_DELAY.singleLlm, signal);
      return normalizeSingleLlm(findCompare(request).scenario.singleLlm);
    },
  };
}
