import type { ReactNode } from 'react';
import { useT } from '../i18n/lang';
import { CopyText } from './CopyText';
import { text } from './TechDetails.i18n';
import styles from './TechDetails.module.css';

/**
 * "Technical details": request IDs, file paths and other developer facts,
 * folded away so the result reads first. A native disclosure, so it works
 * with keyboard, touch and screen readers without extra code.
 */
export function TechDetails({ children, className }: { children: ReactNode; className?: string }) {
  const t = useT(text);
  return (
    <details className={`${styles.root}${className ? ` ${className}` : ''}`}>
      <summary className={styles.summary}>{t.title}</summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}

/** The API's request (correlation) ID, copyable, inside Technical details; nothing when there is none. */
export function RequestId({ value, className, children }: { value: string | null | undefined; className?: string; children?: ReactNode }) {
  const t = useT(text);
  if (!value && !children) return null;
  return (
    <TechDetails className={className}>
      {value ? <CopyText value={value} label={t.requestId} /> : null}
      {children}
    </TechDetails>
  );
}
