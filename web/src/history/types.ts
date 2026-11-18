import type { RunDetail, RunKind, RunSummary } from '../api/types';

export type { RunDetail, RunKind, RunSummary };

/** A row in the History list. `mock` marks runs answered from fixtures. */
export type RunListItem = RunSummary & { mock?: boolean };

export const RUN_KIND_LABEL: Record<RunKind, string> = {
  query: 'Ask',
  discover: 'New idea',
  compare: 'Compare',
  'naive-rag': 'Naive RAG',
  'single-llm': 'Single LLM',
};

export function toListItem(run: RunDetail): RunListItem {
  const item: RunListItem = { id: run.id, kind: run.kind, title: run.title, createdAt: run.createdAt, quality: run.quality };
  if (run.mock) item.mock = true;
  return item;
}
