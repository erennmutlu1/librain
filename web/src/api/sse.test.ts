import { describe, expect, it } from 'vitest';
import { contract } from '../mocks/scenarios';
import { readSse, SseParser, type SseMessage } from './sse';

const encoder = new TextEncoder();

function parseChunks(chunks: Iterable<Uint8Array | string>): SseMessage[] {
  const out: SseMessage[] = [];
  const parser = new SseParser((m) => out.push(m));
  for (const c of chunks) parser.push(c);
  parser.end();
  return out;
}

function* fixedChunks(bytes: Uint8Array, size: number): Generator<Uint8Array> {
  for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size);
}

/** Deterministic pseudo-random chunk sizes between 1 and max. */
function* jaggedChunks(bytes: Uint8Array, seed: number, max: number): Generator<Uint8Array> {
  let s = seed;
  let i = 0;
  while (i < bytes.length) {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    const size = 1 + (s % max);
    yield bytes.subarray(i, i + size);
    i += size;
  }
}

describe('SseParser over the captured discover stream', () => {
  const bytes = encoder.encode(contract.discoverStream);
  const reference = parseChunks([bytes]);

  it('parses the whole stream in one chunk', () => {
    expect(reference.map((m) => m.event)).toEqual(['progress', 'progress', 'progress', 'progress', 'progress', 'result']);
    expect(JSON.parse(reference[1]!.data)).toEqual({ stage: 'retrieved', message: 'Found 3 distinct passages', count: 3 });
  });

  it.each([1, 2, 3, 5, 7, 13, 64, 257])('gives identical events when fed %i byte(s) at a time', (size) => {
    expect(parseChunks(fixedChunks(bytes, size))).toEqual(reference);
  });

  it.each([1, 2, 3, 4, 5])('gives identical events for jagged chunk sizes (seed %i)', (seed) => {
    expect(parseChunks(jaggedChunks(bytes, seed, 40))).toEqual(reference);
  });

  it('handles CRLF line endings, including a CR/LF pair split across chunks', () => {
    const crlf = encoder.encode(contract.discoverStream.replace(/\n/g, '\r\n'));
    expect(parseChunks(fixedChunks(crlf, 1))).toEqual(reference);
    expect(parseChunks(fixedChunks(crlf, 3))).toEqual(reference);
  });

  it('handles bare CR line endings', () => {
    expect(parseChunks([contract.discoverStream.replace(/\n/g, '\r')])).toEqual(reference);
  });
});

describe('SseParser edge cases', () => {
  it('reassembles multi-byte UTF-8 characters split between chunks', () => {
    const text = 'event: progress\ndata: {"message":"weather × protein — naïve 🧬 ünïcode"}\n\n';
    const bytes = encoder.encode(text);
    for (let size = 1; size <= 5; size++) {
      const [m] = parseChunks(fixedChunks(bytes, size));
      expect(JSON.parse(m!.data).message).toBe('weather × protein — naïve 🧬 ünïcode');
    }
  });

  it('joins multi-line data, ignores comments and unknown fields, strips one leading space', () => {
    const out = parseChunks([': keep-alive\nretry: 1000\nevent: progress\ndata:  two spaces\ndata:line2\nfoo: bar\nid: 7\n\n']);
    expect(out).toEqual([{ event: 'progress', data: ' two spaces\nline2', id: '7' }]);
  });

  it('defaults the event name to "message" and skips events with no data', () => {
    expect(parseChunks(['event: ping\n\ndata: hi\n\n'])).toEqual([{ event: 'message', data: 'hi', id: null }]);
  });

  it('delivers a final event even without the closing blank line', () => {
    expect(parseChunks(['event: result\ndata: {"ok":true}'])).toEqual([{ event: 'result', data: '{"ok":true}', id: null }]);
  });

  it('strips a byte-order mark', () => {
    expect(parseChunks([encoder.encode('﻿data: x\n\n')])).toEqual([{ event: 'message', data: 'x', id: null }]);
  });
});

describe('readSse', () => {
  function body(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(c);
        controller.close();
      },
    });
  }

  it('reads a fetch-style body to the end', async () => {
    const out: SseMessage[] = [];
    await readSse(body([...fixedChunks(encoder.encode(contract.discoverStream), 11)]), (m) => out.push(m));
    expect(out).toHaveLength(6);
  });

  it('stops with an AbortError when the signal aborts mid-stream', async () => {
    const controller = new AbortController();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(encoder.encode('event: progress\ndata: {"stage":"retrieving"}\n\n'));
        // never closes: the server is still working
      },
    });
    const seen: string[] = [];
    const reading = readSse(stream, (m) => {
      seen.push(m.event);
      controller.abort();
    }, controller.signal);
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    expect(seen).toEqual(['progress']);
  });
});
