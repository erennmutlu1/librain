import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { glossaryEntry, type GlossaryTermKey } from '../explore/glossary';
import { useLang, useT } from '../i18n/lang';
import { Icon } from './Icon';
import { text } from './InfoTip.i18n';
import styles from './InfoTip.module.css';

/**
 * A small ⓘ button next to a score or verdict label. Click, tap, Enter or
 * Space opens a short plain-language definition (and an everyday example)
 * from the shared glossary; Escape, a second press or a tap elsewhere closes
 * it. The definition is also the button's accessible description, so screen
 * readers hear it on focus without opening anything. Nothing depends on hover.
 */
export function InfoTip({ k, label, className }: { k: GlossaryTermKey; label?: string; className?: string }) {
  const t = useT(text);
  const { lang } = useLang();
  const entry = glossaryEntry(k, lang);
  const uid = useId();
  const tipId = `${uid}-tip`;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  // Keep the popover inside the viewport on narrow screens.
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

  // An open tip closes on a tap or click anywhere else, and on Escape wherever focus is.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className={`${styles.root}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className={styles.button}
        aria-label={t.about(label ?? entry.term)}
        aria-expanded={open}
        aria-controls={tipId}
        aria-describedby={tipId}
        data-open={open || undefined}
        onClick={() => setOpen((o) => !o)}
        // Tabbing to another control closes it; clicking the tip's own text does not.
        onBlur={(e) => {
          if (e.relatedTarget && !rootRef.current?.contains(e.relatedTarget)) setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <Icon name="info" size={14} />
      </button>
      <span ref={tipRef} id={tipId} className={styles.tip} hidden={!open}>
        <span className={styles.definition}>{entry.definition}</span>{' '}
        {entry.example ? (
          <span className={styles.example}>
            <span className={styles.exampleLabel}>{t.example}</span> {entry.example}
          </span>
        ) : null}
      </span>
    </span>
  );
}
