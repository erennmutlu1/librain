import { MAX_QUERY_CHARS, MAX_TOPIC_CHARS } from '../api/types';
import type { TopicForm } from '../components/topicSuggestions';
import { text, type FormError } from './forms.i18n';

/** Passages per topic: the API's own range. */
export const TOPK_MIN = 1;
export const TOPK_MAX = 20;

export interface CheckedTopics {
  topicA: string;
  topicB?: string;
  topK: number;
}

/**
 * The same checks, in the same order, as the API's endpoint validation. A
 * failure is an error code, so the message follows the interface language
 * even after it is shown.
 */
export function checkTopicForm(form: TopicForm): CheckedTopics | { error: FormError } {
  const topicA = form.topicA.trim();
  const topicB = form.topicB.trim();
  if (!topicA) return { error: 'topicRequired' };
  if (topicA.length > MAX_TOPIC_CHARS || topicB.length > MAX_TOPIC_CHARS) return { error: 'topicTooLong' };
  if (topicB && topicA === topicB) return { error: 'topicsSame' };
  const topK = Number(form.topK);
  if (!Number.isInteger(topK) || topK < TOPK_MIN || topK > TOPK_MAX) return { error: 'topKRange' };
  return topicB ? { topicA, topicB, topK } : { topicA, topK };
}

/** A form error in the reader's language. */
export function formErrorText(t: (typeof text)['en'], error: FormError): string {
  const message = t.errors[error];
  if (typeof message === 'string') return message;
  return message(error === 'queryTooLong' ? MAX_QUERY_CHARS : MAX_TOPIC_CHARS);
}

/** A /discover?a=&b=&k= link's values, validated: topics trimmed and capped, k only when in range. */
export function readTopicParams(params: URLSearchParams): Partial<TopicForm> | null {
  const a = params.get('a');
  const b = params.get('b');
  const k = params.get('k');
  if (a === null && b === null && k === null) return null;
  const patch: Partial<TopicForm> = {};
  if (a !== null) {
    patch.topicA = a.trim().slice(0, MAX_TOPIC_CHARS);
    // A link that names Topic A alone means "this topic", not "this plus whatever B was".
    patch.topicB = (b ?? '').trim().slice(0, MAX_TOPIC_CHARS);
  } else if (b !== null) {
    patch.topicB = b.trim().slice(0, MAX_TOPIC_CHARS);
  }
  if (k !== null && /^\d+$/.test(k.trim())) {
    const n = Number(k.trim());
    if (n >= TOPK_MIN && n <= TOPK_MAX) patch.topK = String(n);
  }
  return patch;
}
