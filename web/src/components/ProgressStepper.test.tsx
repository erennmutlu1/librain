import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { normalizeProgress } from '../api/normalize';
import { SseParser } from '../api/sse';
import { contract } from '../mocks/scenarios';
import { buildSteps, DISCOVER_STAGES, QUERY_STAGES, type TimedProgress } from '../lib/stages';
import { ProgressStepper } from './ProgressStepper';

/** The progress events from the captured stream, one second apart. */
function capturedProgress(): TimedProgress[] {
  const events: TimedProgress[] = [];
  const parser = new SseParser((m) => {
    if (m.event === 'progress') events.push({ ...normalizeProgress(JSON.parse(m.data)), at: 1000 * (events.length + 1) });
  });
  parser.push(contract.discoverStream);
  parser.end();
  return events;
}

describe('buildSteps', () => {
  it('marks reported stages done and the latest active', () => {
    const events = capturedProgress().slice(0, 3);
    const steps = buildSteps(DISCOVER_STAGES, events, 5000);
    expect(steps.map((s) => s.status)).toEqual(['done', 'done', 'active', 'pending', 'pending']);
    expect(steps[1]).toMatchObject({ message: 'Found 3 distinct passages', count: 3, durationMs: 1000 });
    expect(steps[2]?.durationMs).toBe(2000); // still running: until "now"
  });

  it('treats skipped stages as done (the OpenAI path reports only "generating")', () => {
    const steps = buildSteps(DISCOVER_STAGES, [{ stage: 'generating', message: 'Running the OpenAI port of the Discovery pipeline', count: null, at: 0 }], 100);
    expect(steps.map((s) => s.status)).toEqual(['done', 'done', 'active', 'pending', 'pending']);
    expect(steps[0]?.message).toBeNull();
  });

  it('appends stages it does not know instead of dropping them', () => {
    const steps = buildSteps(QUERY_STAGES, [{ stage: 'reranking', message: 'Re-ranking passages', count: 8, at: 0 }], 10);
    expect(steps.at(-1)).toMatchObject({ key: 'reranking', label: 'Reranking', status: 'active' });
  });
});

describe('ProgressStepper', () => {
  it('renders every stage with the server messages, the active step and a cancel button', () => {
    const events = capturedProgress().slice(0, 4);
    render(<ProgressStepper title="Running discovery" stages={DISCOVER_STAGES} events={events} startedAt={Date.now()} onCancel={() => undefined} />);

    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items[1]).toHaveTextContent('Found 3 distinct passages');
    expect(items[3]).toHaveTextContent('Citation contract kept 2 of 3 cited sources');
    expect(items[3]).toHaveAttribute('aria-current', 'step');
    expect(items[3]).toHaveTextContent('(in progress)');
    expect(items[4]).toHaveTextContent('(waiting)');
    expect(screen.getByRole('status')).toHaveTextContent('Citation contract kept 2 of 3 cited sources');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('shows a starting state before the first event', () => {
    render(<ProgressStepper title="Answering" stages={QUERY_STAGES} events={[]} startedAt={Date.now()} />);
    expect(screen.getByRole('status')).toHaveTextContent('Starting');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
