import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { requestProviderKeys } from '../api/providerKeys';
import { catStyle } from '../explore/categories';
import type { ExploreData } from '../explore/model';
import { loadExploreData } from '../explore/useDiscoveries';
import { useLang, useT, type Lang } from '../i18n/lang';
import { matchScore } from '../lib/fuzzy';
import { discoverPath } from '../lib/remix';
import { isPaletteShortcut } from '../lib/shortcut';
import { NEXT_THEME, setTheme, useTheme } from '../lib/theme';
import { usePublicDemo } from '../public/context';
import { text, type PaletteSection } from './CommandPalette.i18n';
import { Icon, type IconName } from './Icon';
import styles from './CommandPalette.module.css';

/*
 * ⌘K / Ctrl+K: jump to any section, run a header action, or open one of the
 * 46 recorded discoveries; anything else typed becomes "Discover: <text>".
 *
 * A modal dialog holding an ARIA 1.2 combobox: focus stays in the input,
 * the arrow keys move the active option (aria-activedescendant), Enter runs
 * it, Escape closes, Tab cycles between the input and the close button, and
 * focus returns to where it was. The recorded runs are loaded only when the
 * palette opens.
 */

type GroupKey = 'go' | 'actions' | 'discoveries' | 'discover';

interface Item {
  key: string;
  label: string;
  hint?: string;
  /** More text to match against (the hint, the other language's names). */
  extra: string;
  icon: IconName;
  /** Category hue for discoveries. */
  style?: CSSProperties;
  run: () => void;
}

interface Group {
  key: GroupKey;
  label: string;
  items: Item[];
}

const SECTIONS: readonly { key: PaletteSection; path: string; icon: IconName }[] = [
  { key: 'library', path: '/library', icon: 'list' },
  { key: 'ask', path: '/ask', icon: 'question' },
  { key: 'discover', path: '/discover', icon: 'shuffle' },
  { key: 'featured', path: '/discover/featured', icon: 'star' },
  { key: 'explore', path: '/explore', icon: 'grid' },
  { key: 'stats', path: '/explore/stats', icon: 'chart' },
  { key: 'quiz', path: '/explore/quiz', icon: 'warning' },
  { key: 'compare', path: '/compare', icon: 'venn' },
  { key: 'history', path: '/history', icon: 'doc' },
];

const MAX_DISCOVERIES = 8;
const MAX_PICKS = 6;
/** Shorter input is too ambiguous to offer as a discovery topic. */
const MIN_TOPIC_CHARS = 2;

type ExploreLoad = { lang: Lang; data: ExploreData | null };

function rank(items: Item[], query: string): Item[] {
  if (!query) return items;
  return items
    .map((item, order) => ({ item, order, score: matchScore(query, item.label, item.extra) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((x) => x.item);
}

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const t = useT(text);
  const { lang, setLang } = useLang();
  const other = text[lang === 'en' ? 'tr' : 'en'];
  const navigate = useNavigate();
  const demo = usePublicDemo();
  const theme = useTheme();
  const uid = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [explore, setExplore] = useState<ExploreLoad | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  // Open: remember where focus was, take it, and keep the page behind from scrolling.
  useEffect(() => {
    returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    inputRef.current?.focus();
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = overflow;
    };
  }, []);

  // The recorded runs, in the interface language; a cached chunk after the first time.
  useEffect(() => {
    let live = true;
    loadExploreData(lang).then(
      (data) => live && setExplore({ lang, data }),
      () => live && setExplore({ lang, data: null }),
    );
    return () => {
      live = false;
    };
  }, [lang]);

  /** Close, put focus back, then act (so a panel the action opens can take focus). */
  const finish = useCallback(
    (after?: () => void) => {
      const target = returnTo.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
      onClose();
      after?.();
    },
    [onClose],
  );

  const q = query.trim();
  const loaded = explore?.lang === lang ? explore : null;

  const groups = useMemo<Group[]>(() => {
    const go: Item[] = SECTIONS.map((s) => ({
      key: `go-${s.key}`,
      label: t.sections[s.key].label,
      hint: t.sections[s.key].hint,
      extra: `${t.sections[s.key].hint} ${other.sections[s.key].label} ${s.path}`,
      icon: s.icon,
      run: () => navigate(s.path),
    }));

    const nextTheme = NEXT_THEME[theme];
    const actions: Item[] = [
      {
        key: 'language',
        label: t.language.label,
        hint: t.language.hint,
        extra: `${t.language.hint} ${other.language.label} language dil english türkçe`,
        icon: 'globe',
        run: () => setLang(lang === 'en' ? 'tr' : 'en'),
      },
      {
        key: 'theme',
        label: t.theme[nextTheme],
        hint: t.themeNow[theme],
        extra: `${other.theme[nextTheme]} theme tema`,
        icon: nextTheme === 'light' ? 'sun' : nextTheme === 'dark' ? 'moon' : 'auto',
        run: () => setTheme(nextTheme),
      },
    ];
    if (demo) {
      const target = demo.mode === 'live' ? 'recorded' : 'live';
      actions.push(
        {
          key: 'mode',
          label: t[target].label,
          hint: t[target].hint,
          extra: `${t[target].hint} ${other[target].label}`,
          icon: target === 'live' ? 'pulse' : 'doc',
          run: () => demo.switchTo(target),
        },
        {
          key: 'keys',
          label: t.keys.label,
          hint: t.keys.hint,
          extra: `${t.keys.hint} ${other.keys.label} key anahtar anthropic openai`,
          icon: 'key',
          run: () => requestProviderKeys({}),
        },
      );
    }

    const data = loaded?.data;
    const discoveries: Item[] = (data ? (q ? data.discoveries : data.picks) : []).map((d) => ({
      key: `d-${d.id}`,
      label: `${d.id} · ${d.request.topicA}${d.request.topicB ? ` × ${d.request.topicB}` : ''}`,
      hint: d.takeaway,
      extra: `${d.takeaway} ${d.category.name} ${d.category.tr.name}`,
      icon: d.category.icon,
      style: catStyle(d.category),
      run: () => navigate(`/explore/${encodeURIComponent(d.id)}`),
    }));

    const out: Group[] = [
      { key: 'go', label: t.groups.go, items: rank(go, q) },
      { key: 'actions', label: t.groups.actions, items: rank(actions, q) },
      {
        key: 'discoveries',
        label: q ? t.groups.discoveries : t.groups.picks,
        items: rank(discoveries, q).slice(0, q ? MAX_DISCOVERIES : MAX_PICKS),
      },
    ];
    if (q.length >= MIN_TOPIC_CHARS) {
      out.push({
        key: 'discover',
        label: t.groups.discover,
        items: [
          {
            key: 'discover-typed',
            label: t.discoverTyped(q),
            hint: t.discoverHint,
            extra: '',
            icon: 'arrow',
            run: () => navigate(discoverPath({ topicA: q })),
          },
        ],
      });
    }
    return out.filter((g) => g.items.length > 0);
  }, [t, other, theme, demo, loaded, q, lang, setLang, navigate]);

  const flat = groups.flatMap((g) => g.items);
  // Index of each group's first option in `flat`.
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((sum, g) => sum + g.items.length, 0));
  const current = flat.length === 0 ? -1 : Math.min(active, flat.length - 1);
  const optionId = (index: number) => `${uid}-option-${index}`;

  // Keep the active option in view while arrowing through a long list.
  useEffect(() => {
    if (current < 0) return;
    document.getElementById(`${uid}-option-${current}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [current, uid]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape' || isPaletteShortcut(event)) {
      event.preventDefault();
      event.stopPropagation();
      finish();
      return;
    }
    if (event.key === 'Tab') {
      // Only two stops inside: the input and the close button.
      event.preventDefault();
      (document.activeElement === inputRef.current ? closeRef : inputRef).current?.focus();
      return;
    }
    if (event.target !== inputRef.current || flat.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + flat.length) % flat.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = flat[current];
      if (item) finish(item.run);
    }
  };

  const loadingNote = !loaded ? t.loading : loaded.data === null ? t.failed : null;

  return (
    <div
      className={styles.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
    >
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} onKeyDown={onKeyDown}>
        <h2 id={`${uid}-title`} className="visually-hidden">
          {t.title}
        </h2>
        <div className={styles.search}>
          <Icon name="search" size={18} />
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            role="combobox"
            aria-label={t.input}
            aria-expanded={flat.length > 0}
            aria-controls={`${uid}-list`}
            aria-autocomplete="list"
            aria-activedescendant={current >= 0 ? optionId(current) : undefined}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder={t.placeholder}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <button ref={closeRef} type="button" className={styles.close} onClick={() => finish()} aria-label={t.close}>
            <kbd aria-hidden="true">Esc</kbd>
          </button>
        </div>

        {/* Mouse down on an option must not pull focus out of the input. */}
        <div id={`${uid}-list`} role="listbox" aria-label={t.results} className={styles.list} onMouseDown={(e) => e.preventDefault()}>
          {groups.map((group, gi) => (
            <div key={group.key} role="group" aria-labelledby={`${uid}-${group.key}`} className={styles.group}>
              <div id={`${uid}-${group.key}`} role="presentation" className={styles.groupLabel}>
                {group.label}
              </div>
              {group.items.map((item, ii) => {
                const i = starts[gi]! + ii;
                const selected = i === current;
                return (
                  <div
                    key={item.key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={selected}
                    className={styles.option}
                    style={item.style}
                    data-group={group.key}
                    onMouseMove={() => {
                      if (!selected) setActive(i);
                    }}
                    onClick={() => finish(item.run)}
                  >
                    <span className={styles.optionIcon} aria-hidden="true">
                      <Icon name={item.icon} />
                    </span>
                    <span className={styles.optionText}>
                      <span className={styles.optionLabel}>{item.label}</span>
                      {item.hint ? <span className={styles.optionHint}>{item.hint}</span> : null}
                    </span>
                    <span className={styles.enter} aria-hidden="true">
                      ↵
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {flat.length === 0 ? <p className={styles.empty}>{t.empty}</p> : null}
        {loadingNote ? <p className={styles.note}>{loadingNote}</p> : null}

        <div className={styles.footer} aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> {t.keysHint.move}
          </span>
          <span>
            <kbd>↵</kbd> {t.keysHint.open}
          </span>
          <span>
            <kbd>Esc</kbd> {t.keysHint.close}
          </span>
        </div>
        <p className="visually-hidden" role="status">
          {q ? t.count(flat.length) : ''}
        </p>
      </div>
    </div>
  );
}
