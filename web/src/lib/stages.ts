import type { ProgressEvent } from '../api/types';

/** A progress event with the time it arrived. */
export interface TimedProgress extends ProgressEvent {
  at: number;
}

export interface StageDef {
  key: string;
  label: string;
}

/** The stage names emitted by DiscoveryAgent (LIBRAIN/Pipelines/PipelineProgress.cs). */
export const DISCOVER_STAGES: StageDef[] = [
  { key: 'retrieving', label: 'Search the corpus' },
  { key: 'retrieved', label: 'Collect passages' },
  { key: 'generating', label: 'Generate a hypothesis' },
  { key: 'validated', label: 'Enforce the citation contract' },
  { key: 'scoring', label: 'Score it and check every claim' },
];

/** The stage names emitted by QueryPipeline. */
export const QUERY_STAGES: StageDef[] = [
  { key: 'retrieving', label: 'Search the corpus' },
  { key: 'retrieved', label: 'Collect passages' },
  { key: 'generating', label: 'Write the answer' },
  { key: 'validated', label: 'Check the citations' },
  { key: 'evaluating', label: 'Evaluate the answer' },
];

export type StepStatus = 'done' | 'active' | 'pending';

export interface Step {
  key: string;
  label: string;
  status: StepStatus;
  /** The server's message for this stage, when it reported one. */
  message: string | null;
  count: number | null;
  /** When the stage was reported. */
  at: number | null;
  /** Time until the next reported stage (or until `now` while active). */
  durationMs: number | null;
}

/**
 * Folds the received events into a fixed list of steps. The latest reported
 * stage is active; everything before it is done (including stages the server
 * skipped, such as the OpenAI path, which reports only "generating"). Unknown
 * stage names are appended, so a newer backend never breaks the stepper.
 */
export function buildSteps(defs: readonly StageDef[], events: readonly TimedProgress[], now: number, finished = false): Step[] {
  const all: StageDef[] = [...defs];
  for (const e of events) {
    if (!all.some((d) => d.key === e.stage)) all.push({ key: e.stage, label: e.stage.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) });
  }
  const latest = new Map<string, TimedProgress>();
  for (const e of events) latest.set(e.stage, e);

  let reached = -1;
  all.forEach((d, i) => {
    if (latest.has(d.key)) reached = Math.max(reached, i);
  });

  const reportTimes = all
    .map((d) => latest.get(d.key)?.at ?? null)
    .map((t, i) => ({ t, i }))
    .filter((x): x is { t: number; i: number } => x.t !== null);

  return all.map((d, i) => {
    const e = latest.get(d.key) ?? null;
    const status: StepStatus = finished || i < reached ? 'done' : i === reached ? 'active' : 'pending';
    let durationMs: number | null = null;
    if (e) {
      const next = reportTimes.find((x) => x.i > i);
      durationMs = (next ? next.t : status === 'active' || finished ? now : e.at) - e.at;
    }
    return { key: d.key, label: d.label, status, message: e?.message ?? null, count: e?.count ?? null, at: e?.at ?? null, durationMs };
  });
}
