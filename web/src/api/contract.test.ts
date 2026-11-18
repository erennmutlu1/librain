/*
 * Contract tests: every response captured from the real API
 * (src/mocks/contract/, written by LIBRAIN.Tests/Api/UiContractSnapshotTests.cs)
 * goes through the same mapping the live client uses. If the backend changes a
 * shape and the snapshots are re-captured, these fail before the UI does.
 */
import { describe, expect, it } from 'vitest';
import { contract } from '../mocks/scenarios';
import { errorFromBody } from './errors';
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
import { SseParser, type SseMessage } from './sse';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function streamEvents(): SseMessage[] {
  const events: SseMessage[] = [];
  const parser = new SseParser((m) => events.push(m));
  parser.push(contract.discoverStream);
  parser.end();
  return events;
}

function queryStreamEvents(): SseMessage[] {
  const events: SseMessage[] = [];
  const parser = new SseParser((m) => events.push(m));
  parser.push(contract.queryStream);
  parser.end();
  return events;
}

describe('API contract snapshots', () => {
  it('query-stream.txt -> the five query stages in order, then one result with cited passages', () => {
    const events = queryStreamEvents();
    const stages = events.filter((e) => e.event === 'progress').map((e) => (JSON.parse(e.data) as { stage: string }).stage);
    expect(stages).toEqual(['retrieving', 'retrieved', 'generating', 'validated', 'evaluating']);
    const last = events.at(-1)!;
    expect(last.event).toBe('result');
    const r = normalizeQueryResponse(JSON.parse(last.data));
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.citations.every((c) => (c.content ?? '').length > 0)).toBe(true);
  });

  it('papers.json -> PaperSummary[] with arXiv metadata (re-ingest by arXiv id replaced the upload)', () => {
    const papers = normalizePapers(contract.papers);
    expect(papers).toHaveLength(1);
    expect(papers[0]).toMatchObject({
      paperId: '2005.11401',
      title: 'Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks',
      chunkCount: 1,
      year: 2020,
    });
    expect(papers[0]?.authors?.[0]).toBe('Patrick Lewis');
    expect(papers[0]?.firstIngestedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
  });

  it('ingest-result.json and arxiv-ingest-result.json -> IngestResult with title', () => {
    const upload = normalizeIngest(contract.ingest);
    expect(upload).toMatchObject({ paperId: '2005.11401', chunkCount: 1, title: '2005.11401' });
    expect(upload.correlationId).toMatch(UUID);
    expect(normalizeIngest(contract.arxiv).title).toBe('Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks');
  });

  it('query-response.json -> QueryResponse with passage text on every citation', () => {
    const r = normalizeQueryResponse(contract.query);
    expect(r.correlationId).toMatch(UUID);
    expect(r.citations.map((c) => c.index)).toEqual([1, 2]);
    expect(r.citations.every((c) => typeof c.content === 'string' && c.content.length > 0)).toBe(true);
    expect(r.evaluation?.missingEvidence).toEqual(['No error metrics cited.']);
  });

  it('discover-response.json -> DiscoverResponse with numeric status, validationFailed and evidence text', () => {
    const r = normalizeDiscoverResponse(contract.discover);
    expect(r.claimValidation?.claims.map((c) => c.status)).toEqual(['extrapolated', 'extrapolated']);
    expect(r.claimValidation?.validationFailed).toBe(false);
    expect(r.supportingEvidence.map((e) => e.content)).toEqual(['Message passing over a multi-mesh.', 'Structure prediction from sequence.']);
    expect(r).toMatchObject({ claimedEvidenceCount: 3, droppedEvidenceCount: 1 });
  });

  it('naive-rag-response.json -> one fabricated citation', () => {
    const r = normalizeNaiveRag(contract.naiveRag);
    expect(r.fabricatedCitationCount).toBe(1);
    expect(r.claimedCitations.filter((c) => !c.isResolved)).toEqual([{ paperId: 'pangu-weather', chunkIndex: 4, isResolved: false }]);
    expect(r).toMatchObject({ retrievedChunkCount: 3, inputTokens: 100, outputTokens: 50 });
  });

  it('single-llm-response.json -> SingleLlmResponse', () => {
    const r = normalizeSingleLlm(contract.singleLlm);
    expect(r.hypothesis).toBe('A plain-text hypothesis.');
    expect(r.evaluation?.qualityScore).toBeCloseTo(0.667, 3);
  });

  it('compare-response.json -> three outcomes, each with its own correlation id', () => {
    const r = normalizeCompareResponse(contract.compare);
    expect(r).toMatchObject({ topicA: 'weather forecasting', topicB: 'protein folding', topK: 2 });
    for (const outcome of [r.librain, r.naiveRag, r.singleLlm]) {
      expect(outcome.error).toBeNull();
      expect(outcome.result).not.toBeNull();
      expect(outcome.correlationId).toMatch(UUID);
    }
    expect(r.librain.correlationId).toBe(r.librain.result?.correlationId);
    expect(r.naiveRag.result?.fabricatedCitationCount).toBe(1);
    expect(r.totalElapsedMs).toBeTypeOf('number');
  });

  it('compare outcome failure: derived from the snapshot by replacing only LIBRAIN with an error outcome', () => {
    const failed = { ...(contract.compare as object), librain: { result: null, error: 'LIBRAIN failed: TimeoutException', correlationId: 'abc' } };
    const r = normalizeCompareResponse(failed);
    expect(r.librain).toEqual({ result: null, error: 'LIBRAIN failed: TimeoutException', correlationId: 'abc' });
    expect(r.naiveRag.result).not.toBeNull();
  });

  it('runs.json -> RunSummary[] with every backend kind', () => {
    const runs = normalizeRunSummaries(contract.runs);
    expect(runs.map((r) => r.kind)).toEqual(['compare', 'single-llm', 'naive-rag', 'discover', 'query']);
    expect(runs.every((r) => UUID.test(r.id) && typeof r.quality === 'number')).toBe(true);
  });

  it('run-record.json -> RunDetail whose id is the response correlation id', () => {
    const run = normalizeRunDetail(contract.runRecord);
    expect(run.kind).toBe('discover');
    expect(run.id).toBe((run.response as { correlationId: string }).correlationId);
    expect(run.request).toEqual({ topicA: 'weather forecasting', topicB: 'protein folding', topK: 2 });
  });

  it('discover-stream.txt -> five progress events, then exactly one result', () => {
    const events = streamEvents();
    expect(events.map((e) => e.event)).toEqual(['progress', 'progress', 'progress', 'progress', 'progress', 'result']);
    const progress = events.filter((e) => e.event === 'progress').map((e) => normalizeProgress(JSON.parse(e.data)));
    expect(progress.map((p) => p.stage)).toEqual(['retrieving', 'retrieved', 'generating', 'validated', 'scoring']);
    expect(progress[1]).toEqual({ stage: 'retrieved', message: 'Found 3 distinct passages', count: 3 });
    expect(progress[3]?.message).toBe('Citation contract kept 2 of 3 cited sources');
    const result = normalizeDiscoverResponse(JSON.parse(events[5]!.data));
    expect(result.correlationId).toMatch(UUID);
    expect(result.novelClaim).toBe('Multi-mesh message passing may improve long-range contact prediction. It could reduce error.');
  });

  it('problem-400.json -> ApiError with title and detail', () => {
    const error = errorFromBody(400, 'Bad Request', contract.problem400);
    expect(error).toMatchObject({ kind: 'http', status: 400, title: 'topicA is required', detail: "The 'topicA' field must be a non-empty string." });
  });
});
