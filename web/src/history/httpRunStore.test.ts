import { describe, expect, it, vi } from 'vitest';
import { createHttpApi } from '../api/httpClient';
import { contract } from '../mocks/scenarios';
import { createHttpRunStore } from './httpRunStore';

function json(status: number, body: unknown): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

/** A fake /api/runs backed by the captured snapshots. */
function fakeApi() {
  const calls: { method: string; url: string }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url });
    const runRecord = contract.runRecord as { id: string };
    if (method === 'GET' && url.startsWith('/api/runs?')) return json(200, contract.runs);
    if (method === 'GET' && url === `/api/runs/${runRecord.id}`) return json(200, contract.runRecord);
    if (method === 'GET' && url.startsWith('/api/runs/')) return json(404, { title: 'run not found', status: 404 });
    if (method === 'DELETE' && url === `/api/runs/${runRecord.id}`) return new Response(null, { status: 204 });
    return json(500, { title: 'unexpected' });
  });
  const api = createHttpApi({ fetchImpl, apiKey: () => null });
  return { store: createHttpRunStore(api), calls, runId: (contract.runRecord as { id: string }).id };
}

describe('createHttpRunStore (/api/runs)', () => {
  it('lists the API run summaries (runs.json) with kinds mapped', async () => {
    const { store, calls } = fakeApi();
    const list = await store.list();
    expect(calls[0]).toEqual({ method: 'GET', url: '/api/runs?limit=100' });
    expect(list.map((r) => r.kind)).toEqual(['compare', 'single-llm', 'naive-rag', 'discover', 'query']);
    expect(list[4]).toMatchObject({ title: 'Why does GraphCast forecast well?' });
    expect(store.location).toBe('server');
  });

  it('passes the kind filter to the server', async () => {
    const { store, calls } = fakeApi();
    await store.list({ kind: 'naive-rag' });
    expect(calls[0]?.url).toBe('/api/runs?kind=naive-rag&limit=100');
  });

  it('gets a full record (run-record.json) and normalises its request and response', async () => {
    const { store, runId } = fakeApi();
    const run = await store.get(runId);
    expect(run?.kind).toBe('discover');
    if (run?.kind !== 'discover') return;
    // provider/model were null in the stored request; they normalise to absent.
    expect(run.request).toEqual({ topicA: 'weather forecasting', topicB: 'protein folding', topK: 2 });
    expect(run.response.droppedEvidenceCount).toBe(1);
    expect(run.response.supportingEvidence[0]?.content).toBe('Message passing over a multi-mesh.');
  });

  it('returns undefined for a missing run', async () => {
    const { store } = fakeApi();
    await expect(store.get('00000000-0000-0000-0000-000000000000')).resolves.toBeUndefined();
  });

  it('deletes with DELETE /api/runs/{id} and notifies', async () => {
    const { store, calls, runId } = fakeApi();
    const listener = vi.fn();
    store.subscribe(listener);
    await store.remove(runId);
    expect(calls.at(-1)).toEqual({ method: 'DELETE', url: `/api/runs/${runId}` });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not save anything itself (the API records runs) but refreshes listeners', async () => {
    const { store, calls } = fakeApi();
    const listener = vi.fn();
    store.subscribe(listener);
    await store.save({} as never);
    expect(calls).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.clear).toBeUndefined();
  });
});
