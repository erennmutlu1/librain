/*
 * Where the topic suggestions come from, and the visitor's recent topics and
 * questions.
 *
 *   Recorded mode (public build)  exactly the recorded topic pairs the mock
 *       client can replay (its own catalogue, already loaded), nothing else:
 *       a Discover run there only plays when the topics match a recording.
 *   Live and the owner's builds   recorded pairs (the mock catalogue when
 *       there is one, else the tiny TopicCombobox.data list), the visitor's
 *       recent topics, and the corpus paper titles, loaded once on the first
 *       focus of a topic field (GET /api/papers is free and needs no keys).
 *
 * A recorded topic knows its pair, so choosing it can fill in its partner.
 */
import { useCallback, useMemo, useState } from 'react';
import { useApi } from '../api/context';
import type { PaperSummary } from '../api/types';
import { displayTitle } from '../lib/papers';
import { fold, sameText } from '../lib/textMatch';
import { useRequest } from '../lib/useRequest';
import { usePublicDemo } from '../public/context';
import { RECORDED_TOPIC_PAIRS, RECORDED_TOPK } from './TopicCombobox.data';

export interface RecordedPair {
  topicA: string;
  topicB: string | null;
  topK: number;
}

export type SuggestionGroup = 'partner' | 'recent' | 'recorded' | 'paper';
export const SUGGESTION_GROUPS: readonly SuggestionGroup[] = ['partner', 'recent', 'recorded', 'paper'];

export interface TopicSuggestion {
  value: string;
  group: SuggestionGroup;
  /** A second line, such as "× its recorded partner". */
  hint?: string;
  /** Recorded topics: the pair this one belongs to. */
  pair?: RecordedPair;
}

export type TopicField = 'a' | 'b';

export interface TopicForm {
  topicA: string;
  topicB: string;
  topK: string;
}

// ---------- Recent topics and questions (this browser only) ----------

const RECENT_TOPICS = 'librain.recentTopics.v1';
const RECENT_QUESTIONS = 'librain.recentQuestions.v1';
const MAX_RECENT = 10;

function readList(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string' && v.trim() !== '').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** Newest first, no duplicates (case and accents ignored), at most ten. */
function remember(key: string, values: readonly (string | null | undefined)[]): void {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const v of [...values.map((x) => x?.trim() ?? ''), ...readList(key)]) {
    const k = fold(v);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    next.push(v);
  }
  try {
    localStorage.setItem(key, JSON.stringify(next.slice(0, MAX_RECENT)));
  } catch {
    // Storage blocked or full: suggestions simply stay as they were.
  }
}

export const recentTopics = (): string[] => readList(RECENT_TOPICS);
export const rememberTopics = (...topics: (string | null | undefined)[]): void => remember(RECENT_TOPICS, topics);
export const recentQuestions = (): string[] => readList(RECENT_QUESTIONS);
export const rememberQuestion = (question: string): void => remember(RECENT_QUESTIONS, [question]);

// ---------- Building the lists ----------

/** The recorded partners of `topic` (pairs match in either order, as the mock client does). */
export function partnersOf(topic: string, pairs: readonly RecordedPair[]): { value: string; pair: RecordedPair }[] {
  if (!fold(topic)) return [];
  const out: { value: string; pair: RecordedPair }[] = [];
  const seen = new Set<string>();
  for (const pair of pairs) {
    const partner = sameText(pair.topicA, topic) ? pair.topicB : pair.topicB && sameText(pair.topicB, topic) ? pair.topicA : null;
    if (!partner || seen.has(fold(partner))) continue;
    seen.add(fold(partner));
    out.push({ value: partner, pair });
  }
  return out;
}

export interface SuggestionSources {
  pairs: readonly RecordedPair[];
  recent: readonly string[];
  papers: readonly string[];
  /** Recorded mode: only what can replay. */
  recordedOnly: boolean;
}

/** Suggestions for one topic field, given what the other field holds. */
export function buildTopicSuggestions(field: TopicField, other: string, sources: SuggestionSources): TopicSuggestion[] {
  const partners: TopicSuggestion[] = partnersOf(other, sources.pairs).map(({ value, pair }) => ({ value, group: 'partner', pair }));
  if (sources.recordedOnly && partners.length > 0) return partners;

  const recorded: TopicSuggestion[] = [];
  const seen = new Set(partners.map((p) => fold(p.value)));
  for (const pair of sources.pairs) {
    const [value, partner] = field === 'a' ? [pair.topicA, pair.topicB] : [pair.topicB, pair.topicA];
    if (!value) continue;
    const key = `${fold(value)}|${fold(partner ?? '')}`;
    if (seen.has(key) || seen.has(fold(value))) continue;
    seen.add(key);
    recorded.push({ value, group: 'recorded', pair, ...(partner ? { hint: `× ${partner}` } : {}) });
  }
  if (sources.recordedOnly) return recorded;

  const differs = (v: string) => !sameText(v, other);
  const recent: TopicSuggestion[] = sources.recent.filter(differs).map((value) => ({ value, group: 'recent' }));
  const papers: TopicSuggestion[] = sources.papers.filter(differs).map((value) => ({ value, group: 'paper' }));
  return [...partners, ...recent, ...recorded.filter((s) => differs(s.value)), ...papers];
}

/**
 * The form change that choosing `s` in `field` implies besides the field
 * itself: a recorded topic fills its partner into the other field when that
 * is empty (in Recorded mode also when it holds a topic that would not
 * replay), and Recorded mode takes the recording's passage count, since a
 * run only replays with the same one.
 */
export function pickPatch(field: TopicField, s: TopicSuggestion, form: TopicForm, recordedOnly: boolean): Partial<TopicForm> {
  if (!s.pair) return {};
  const partner = sameText(s.pair.topicA, s.value) ? s.pair.topicB : s.pair.topicA;
  const otherKey = field === 'a' ? 'topicB' : 'topicA';
  const current = form[otherKey];
  const patch: Partial<TopicForm> = {};
  if (partner && (!current.trim() || (recordedOnly && !sameText(current, partner)))) patch[otherKey] = partner;
  if (recordedOnly) patch.topK = String(s.pair.topK);
  return patch;
}

// ---------- The hook the forms use ----------

const MAX_PAPERS = 80;

export function useTopicSuggestions(source: 'discover' | 'compare') {
  const api = useApi();
  const demo = usePublicDemo();
  const recordedOnly = demo?.mode === 'recorded';
  const scenarios = source === 'discover' ? api.mock?.discover : api.mock?.compare;

  const pairs = useMemo<RecordedPair[]>(
    () =>
      scenarios
        ? scenarios.map((s) => ({ topicA: s.request.topicA, topicB: s.request.topicB ?? null, topK: s.request.topK ?? 5 }))
        : RECORDED_TOPIC_PAIRS.map(([topicA, topicB]) => ({ topicA, topicB, topK: RECORDED_TOPK })),
    [scenarios],
  );

  // The same session entry as the Library's list, so either screen's load serves both.
  const fetchPapers = useCallback((_: void, signal: AbortSignal) => api.listPapers(signal), [api]);
  const { state: papersState, run: loadPapers } = useRequest<void, PaperSummary[]>('papers', fetchPapers);
  const papers = useMemo(() => {
    if (papersState.status !== 'success') return [];
    const seen = new Set<string>();
    const titles: string[] = [];
    for (const p of papersState.data) {
      const title = displayTitle(p);
      if (title && !seen.has(fold(title))) {
        seen.add(fold(title));
        titles.push(title);
      }
    }
    return titles.slice(0, MAX_PAPERS);
  }, [papersState]);

  const [recent, setRecent] = useState<string[]>(() => recentTopics());

  /** On focus: pick up topics saved meanwhile, and load the paper titles once. */
  const onFocus = useCallback(() => {
    setRecent(recentTopics());
    if (!recordedOnly && papersState.status === 'idle') void loadPapers();
  }, [recordedOnly, papersState.status, loadPapers]);

  const sources = useMemo<SuggestionSources>(
    () => ({ pairs, recent: recordedOnly ? [] : recent, papers: recordedOnly ? [] : papers, recordedOnly }),
    [pairs, recent, papers, recordedOnly],
  );

  const suggestionsFor = useCallback((field: TopicField, other: string) => buildTopicSuggestions(field, other, sources), [sources]);

  return { suggestionsFor, onFocus, recordedOnly };
}
