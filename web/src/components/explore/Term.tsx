import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { glossary } from '../../explore/glossary';
import type { GlossaryKey } from '../../explore/model';
import { useLang } from '../../i18n/lang';
import styles from './Term.module.css';

/**
 * A glossary term: hover or focus it to read one plain sentence; tap or click
 * pins it open (for touch), Escape closes it. The definition is always the
 * button's accessible description, so screen readers hear it on focus.
 */
export function Term({ k, children }: { k: GlossaryKey; children?: ReactNode }) {
  const uid = useId();
  const tipId = `${uid}-tip`;
  const { lang } = useLang();
  const entry = glossary(lang)[k];
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const tipRef = useRef<HTMLSpanElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const open = hover || focus || pinned;

  // Keep the tooltip inside the viewport on narrow screens.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!open || !tip) return;
    tip.style.transform = '';
    const rect = tip.getBoundingClientRect();
    const margin = 8;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    let dx = 0;
    if (rect.right > vw - margin) dx = vw - margin - rect.right;
    if (rect.left + dx < margin) dx = margin - rect.left;
    tip.style.transform = dx ? `translateX(${Math.round(dx)}px)` : '';
  }, [open]);

  // A pinned tooltip closes on an outside tap.
  useEffect(() => {
    if (!pinned) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setPinned(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pinned]);

  return (
    <span ref={rootRef} className={styles.root} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        className={styles.term}
        aria-describedby={tipId}
        onFocus={() => setFocus(true)}
        onBlur={() => {
          setFocus(false);
          setPinned(false);
        }}
        onClick={() => setPinned((p) => !p)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setHover(false);
            setFocus(false);
            setPinned(false);
          }
        }}
      >
        {children ?? entry.term}
      </button>
      <span ref={tipRef} id={tipId} role="tooltip" className={styles.tip} hidden={!open}>
        {entry.definition}
      </span>
    </span>
  );
}
