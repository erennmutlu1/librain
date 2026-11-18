/*
 * Server-sent events over fetch (EventSource cannot POST or send headers).
 *
 * The parser follows the WHATWG event-stream rules and is safe for any chunk
 * boundary: bytes go through a streaming TextDecoder (so a multi-byte UTF-8
 * character split across chunks is reassembled), lines may be split
 * anywhere, and CR, LF and CRLF all end a line, including a CRLF split
 * between two chunks.
 */

export interface SseMessage {
  /** The `event:` field, or "message" when absent. */
  event: string;
  data: string;
  id: string | null;
}

export class SseParser {
  private readonly decoder = new TextDecoder('utf-8');
  private buffer = '';
  private eventType = '';
  private data = '';
  private hasData = false;
  private lastId: string | null = null;
  private started = false;

  constructor(private readonly onMessage: (message: SseMessage) => void) {}

  /** Feeds raw bytes (or already-decoded text). */
  push(chunk: Uint8Array | string): void {
    let text = typeof chunk === 'string' ? chunk : this.decoder.decode(chunk, { stream: true });
    if (!this.started && text.length > 0) {
      this.started = true;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    this.buffer += text;
    this.drain(false);
  }

  /** Flushes the decoder and any final line. A last event without its blank line is still delivered. */
  end(): void {
    this.buffer += this.decoder.decode();
    this.drain(true);
    if (this.buffer.length > 0) {
      this.processLine(this.buffer);
      this.buffer = '';
    }
    this.dispatch();
  }

  private drain(final: boolean): void {
    let pos = 0;
    const buf = this.buffer;
    while (pos < buf.length) {
      let end = -1;
      for (let i = pos; i < buf.length; i++) {
        const c = buf.charCodeAt(i);
        if (c === 10 || c === 13) {
          end = i;
          break;
        }
      }
      if (end === -1) break;
      const isCR = buf.charCodeAt(end) === 13;
      // A CR at the very end might be the first half of a CRLF; wait for more input.
      if (isCR && end === buf.length - 1 && !final) break;
      this.processLine(buf.slice(pos, end));
      pos = end + (isCR && buf.charCodeAt(end + 1) === 10 ? 2 : 1);
    }
    this.buffer = buf.slice(pos);
  }

  private processLine(line: string): void {
    if (line === '') {
      this.dispatch();
      return;
    }
    if (line.charCodeAt(0) === 58 /* ':' */) return; // comment
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.charCodeAt(0) === 32) value = value.slice(1);

    switch (field) {
      case 'event':
        this.eventType = value;
        break;
      case 'data':
        this.data += this.hasData ? `\n${value}` : value;
        this.hasData = true;
        break;
      case 'id':
        if (!value.includes('\u0000')) this.lastId = value;
        break;
      default:
        // "retry" and unknown fields are ignored.
        break;
    }
  }

  private dispatch(): void {
    if (this.hasData) {
      this.onMessage({ event: this.eventType || 'message', data: this.data, id: this.lastId });
    }
    this.eventType = '';
    this.data = '';
    this.hasData = false;
  }
}

/** Reads a fetch body to the end, delivering each event. Cancels the body if `signal` aborts. */
export async function readSse(
  body: ReadableStream<Uint8Array>,
  onMessage: (message: SseMessage) => void,
  signal?: AbortSignal,
): Promise<void> {
  const parser = new SseParser(onMessage);
  const reader = body.getReader();
  const onAbort = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException('The stream was cancelled.', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      if (value) parser.push(value);
    }
    if (signal?.aborted) throw new DOMException('The stream was cancelled.', 'AbortError');
    parser.end();
  } finally {
    signal?.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}
