import { useId } from 'react';
import { NumberStepper } from '../components/NumberStepper';
import { TopicCombobox } from '../components/TopicCombobox';
import { pickPatch, useTopicSuggestions, type TopicField, type TopicForm, type TopicSuggestion } from '../components/topicSuggestions';
import { useT } from '../i18n/lang';
import { text } from './forms.i18n';
import { topicFieldId, TOPK_MAX, TOPK_MIN, type TopicFormField } from './topicForm';
import styles from './pages.module.css';

/**
 * Topic A ⇄ Topic B and the passage count, shared by Discover and Compare.
 * The bridge node between the topics is the swap button.
 *
 * A form error is shown under the field it is about (`error`), which is then
 * aria-invalid and described by it; the page moves focus there with
 * `topicFieldId(idPrefix, field)`. There is no maxLength on the topics: a cap
 * would cut a pasted topic short without a word, so the length check (and
 * its message) is the form validation's job.
 */
export function TopicFields<F extends TopicForm>({
  source,
  form,
  setForm,
  idPrefix,
  hints,
  placeholders,
  error,
  invalidA,
  describedBy,
}: {
  source: 'discover' | 'compare';
  form: F;
  setForm: (update: (previous: F) => F) => void;
  /** Prefix for the fields' ids, so the page can focus one; one is made up when missing. */
  idPrefix?: string;
  /** One sentence under each topic, such as an example. */
  hints?: { a?: string; b?: string };
  /** Kept for Compare; examples belong in `hints`, since a placeholder disappears as you type. */
  placeholders?: { a?: string; b?: string };
  /** The form's error, shown under the field it concerns. */
  error?: { field: TopicFormField; message: string } | null;
  /** Older API: marks Topic A invalid for an error shown elsewhere. */
  invalidA?: boolean;
  describedBy?: string;
}) {
  const t = useT(text);
  const ownId = useId();
  const prefix = idPrefix ?? ownId;
  const { suggestionsFor, onFocus, recordedOnly } = useTopicSuggestions(source);

  const set = (patch: Partial<TopicForm>) => setForm((f) => ({ ...f, ...patch }));
  const onPick = (field: TopicField) => (s: TopicSuggestion) => setForm((f) => ({ ...f, ...pickPatch(field, s, f, recordedOnly) }));
  const paired = form.topicA.trim() !== '' && form.topicB.trim() !== '';
  const errorFor = (field: TopicFormField) => (error?.field === field ? error.message : null);

  return (
    <div className={styles.bridgeFields} data-paired={paired || undefined}>
      <TopicCombobox
        id={topicFieldId(prefix, 'a')}
        label={t.topicA}
        value={form.topicA}
        onChange={(v) => set({ topicA: v })}
        suggestions={suggestionsFor('a', form.topicB)}
        onPick={onPick('a')}
        onFocus={onFocus}
        placeholder={placeholders?.a}
        hint={hints?.a}
        error={errorFor('a')}
        invalid={invalidA}
        describedBy={describedBy}
      />
      <span className={styles.bridge}>
        <button
          type="button"
          className={`${styles.bridgeNode} ${styles.swap}`}
          aria-label={t.swap}
          title={t.swap}
          disabled={!form.topicA.trim() && !form.topicB.trim()}
          onClick={() => setForm((f) => ({ ...f, topicA: f.topicB, topicB: f.topicA }))}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M2.5 5.5h10M10 3l2.5 2.5L10 8M13.5 10.5h-10M6 8l-2.5 2.5L6 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </span>
      <TopicCombobox
        id={topicFieldId(prefix, 'b')}
        label={t.topicB}
        optional
        value={form.topicB}
        onChange={(v) => set({ topicB: v })}
        suggestions={suggestionsFor('b', form.topicA)}
        onPick={onPick('b')}
        onFocus={onFocus}
        placeholder={placeholders?.b}
        hint={hints?.b}
        error={errorFor('b')}
      />
      <NumberStepper
        id={topicFieldId(prefix, 'topK')}
        className={styles.countField}
        label={t.passagesPerTopic}
        value={form.topK}
        onChange={(v) => set({ topK: v })}
        min={TOPK_MIN}
        max={TOPK_MAX}
        error={errorFor('topK')}
      />
    </div>
  );
}
