import { useId, useState } from 'react';
import styles from './Passage.module.css';

const LONG = 260;

/** A retrieved passage, quoted. Long passages start clamped with a toggle. */
export function Passage({ text, compact = false }: { text: string; compact?: boolean }) {
  const uid = useId();
  const long = text.length > LONG;
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.root} data-compact={compact || undefined}>
      <blockquote id={`${uid}-q`} className={styles.quote} data-clamped={(long && !open) || undefined}>
        {text}
      </blockquote>
      {long ? (
        <button type="button" className={styles.toggle} aria-expanded={open} aria-controls={`${uid}-q`} onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Show full passage'}
        </button>
      ) : null}
    </div>
  );
}
