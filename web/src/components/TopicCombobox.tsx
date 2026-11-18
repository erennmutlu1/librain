import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useT } from '../i18n/lang';
import { findMatch, matchRank } from '../lib/textMatch';
import { Icon } from './Icon';
import { SUGGESTION_GROUPS, type SuggestionGroup, type TopicSuggestion } from './topicSuggestions';
import { text } from './TopicCombobox.i18n';
import styles from './TopicCombobox.module.css';

/*
 * A topic field with suggestions: the ARIA 1.2 combobox pattern with a list
 * popup and no automatic selection (an <input role="combobox"> that owns a
 * grouped listbox through aria-controls and points at the highlighted option
 * with aria-activedescendant, so focus never leaves the field).
 *
 *   Typing         filters (case and accents ignored) and highlights the match
 *   ↓ / ↑          open the list, then move through it (wrapping)
 *   Alt+↓ / Alt+↑  open / close without moving
 *   Enter          picks the highlighted option; with none highlighted, or with
 *                  Ctrl/⌘ held, the form submits as usual
 *   Escape         closes the list; when it is already closed, clears the field
 *   Tab, click away  close without picking
 *
 * The chevron button opens the full list for pointer and touch users; it stays
 * out of the Tab order, as in the pattern's examples. Neither it nor anything
 * in the open list (options, group labels, padding, the scrollbar) takes focus
 * on mousedown, so a click there never blurs the field and closes the list.
 */

export interface TopicComboboxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: readonly TopicSuggestion[];
  /** Called after onChange when an option is chosen. */
  onPick?: (suggestion: TopicSuggestion) => void;
  /** The field gained focus (a good moment to load suggestions). */
  onFocus?: () => void;
  optional?: boolean;
  placeholder?: string;
  maxLength?: number;
  /** One sentence under the field, such as an example. */
  hint?: string;
  /** A form-level error for this field, shown under the hint and announced. */
  error?: string | null;
  /** Marks the field invalid (an error shown elsewhere). `error` implies it. */
  invalid?: boolean;
  /** Extra ids for aria-describedby, after the hint and the error. */
  describedBy?: string;
  disabled?: boolean;
  id?: string;
}

/** At most this many options per group are rendered. */
const PER_GROUP = 60;

interface Ranked {
  s: TopicSuggestion;
  rank: number;
}

function Highlight({ text: value, query }: { text: string; query: string }) {
  const m = findMatch(value, query);
  if (!m) return <>{value}</>;
  return (
    <>
      {value.slice(0, m.start)}
      <mark className={styles.mark}>{value.slice(m.start, m.end)}</mark>
      {value.slice(m.end)}
    </>
  );
}

export function TopicCombobox({
  label,
  value,
  onChange,
  suggestions,
  onPick,
  onFocus,
  optional,
  placeholder,
  maxLength,
  hint,
  error,
  invalid,
  describedBy,
  disabled,
  id,
}: TopicComboboxProps) {
  const t = useT(text);
  const uid = useId();
  const inputId = id ?? `${uid}-input`;
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Filter only by what was typed: after a pick (or the chevron), show everything.
  const [typed, setTyped] = useState(false);
  const query = typed ? value : '';

  const groups = useMemo(() => {
    const byGroup = new Map<SuggestionGroup, Ranked[]>();
    for (const s of suggestions) {
      const own = matchRank(s.value, query);
      // A recorded topic is also found by its partner (rank 3, after direct matches).
      const rank = own ?? (s.hint && matchRank(s.hint, query) !== null ? 3 : null);
      if (rank === null) continue;
      const list = byGroup.get(s.group) ?? [];
      list.push({ s, rank });
      byGroup.set(s.group, list);
    }
    return SUGGESTION_GROUPS.flatMap((group) => {
      const items = byGroup.get(group);
      // Stable sort: equal ranks keep the source order.
      return items ? [{ group, items: items.sort((a, b) => a.rank - b.rank).slice(0, PER_GROUP) }] : [];
    });
  }, [suggestions, query]);

  const flat = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.s)), [groups]);
  const expanded = open && flat.length > 0 && !disabled;
  const activeIndex = expanded && active < flat.length ? active : -1;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const hintId = `${uid}-hint`;
  const errorId = `${uid}-err`;
  const describedByIds = [hint ? hintId : null, error ? errorId : null, describedBy].filter(Boolean).join(' ') || undefined;

  // Keep the highlighted option in view as the arrows move through a long list.
  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(`${uid}-opt-${activeIndex}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, uid]);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const choose = (s: TopicSuggestion) => {
    onChange(s.value);
    setTyped(false);
    close();
    onPick?.(s);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = flat.length;
    switch (event.key) {
      case 'ArrowDown':
        if (count === 0) return;
        event.preventDefault();
        if (event.altKey) {
          setOpen(true);
          return;
        }
        setOpen(true);
        setActive(expanded ? (activeIndex + 1) % count : 0);
        return;
      case 'ArrowUp':
        if (count === 0) return;
        event.preventDefault();
        if (event.altKey) {
          close();
          return;
        }
        setOpen(true);
        setActive(expanded ? (activeIndex <= 0 ? count - 1 : activeIndex - 1) : count - 1);
        return;
      case 'Enter': {
        const s = activeIndex >= 0 ? flat[activeIndex] : undefined;
        if (s && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
          event.preventDefault();
          choose(s);
          return;
        }
        // Let the form submit, without the list hanging open over the result.
        close();
        return;
      }
      case 'Escape':
        if (expanded) {
          // Do not let an enclosing dialog or page handler see this Escape.
          event.preventDefault();
          event.stopPropagation();
          close();
        } else if (value) {
          event.preventDefault();
          onChange('');
          setTyped(false);
        }
        return;
      case 'Tab':
        close();
        return;
      default:
    }
  };

  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>
        {label}
        {optional ? (
          <>
            {' '}
            <span className="muted">{t.optional}</span>
          </>
        ) : null}
      </label>
      <div className={styles.wrap}>
        <input
          id={inputId}
          className={`input ${styles.input}`}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-invalid={Boolean(error) || invalid || undefined}
          aria-describedby={describedByIds}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => {
            onChange(e.target.value);
            setTyped(true);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onClick={() => setOpen(true)}
          onBlur={close}
        />
        {suggestions.length > 0 ? (
          <button
            type="button"
            className={styles.toggle}
            tabIndex={-1}
            aria-label={t.showSuggestions(label)}
            aria-controls={listId}
            aria-expanded={expanded}
            disabled={disabled}
            // Keep focus in the field, which owns the list.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              document.getElementById(inputId)?.focus();
              if (expanded) {
                close();
              } else {
                setTyped(false);
                setOpen(true);
              }
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : null}
        <ul
          id={listId}
          role="listbox"
          aria-label={t.suggestionsFor(label)}
          className={styles.list}
          hidden={!expanded}
          // The whole popup, not just the options: a click on a group label, the padding or the scrollbar keeps focus in the field.
          onMouseDown={(e) => e.preventDefault()}
        >
          {expanded
            ? groups.map(({ group, items }) => {
                const headingId = `${uid}-g-${group}`;
                const offset = flat.indexOf(items[0]!.s);
                return (
                  <li key={group} role="presentation">
                    <ul role="group" aria-labelledby={headingId} className={styles.group}>
                      <li role="presentation" id={headingId} className={styles.groupLabel}>
                        {t.groups[group]}
                      </li>
                      {items.map(({ s }, i) => {
                        const index = offset + i;
                        return (
                          <li
                            key={`${s.value}|${s.hint ?? ''}`}
                            id={optionId(index)}
                            role="option"
                            aria-selected={index === activeIndex}
                            className={styles.option}
                            onMouseMove={() => index !== activeIndex && setActive(index)}
                            onClick={() => choose(s)}
                          >
                            <span className={styles.optionText}>
                              <Highlight text={s.value} query={query} />
                            </span>
                            {s.hint ? (
                              <span className={styles.optionHint}>
                                <Highlight text={s.hint} query={query} />
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })
            : null}
        </ul>
      </div>
      {hint ? (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.error} role="alert">
          <Icon name="error" size={14} />
          <span>{error}</span>
        </p>
      ) : null}
      <span className="visually-hidden" role="status">
        {open && typed && !disabled ? t.count(flat.length) : ''}
      </span>
    </div>
  );
}
