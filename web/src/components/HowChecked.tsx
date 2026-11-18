import { useT } from '../i18n/lang';
import { Icon } from './Icon';
import { text } from './HowChecked.i18n';
import styles from './HowChecked.module.css';

/**
 * "How a sentence is checked": the whole verdict pipeline in seven short
 * steps, folded under the verdict legend. A native disclosure, so it opens
 * with a tap, Enter or Space.
 */
export function HowChecked({ className }: { className?: string }) {
  const t = useT(text);
  return (
    <details className={`${styles.root}${className ? ` ${className}` : ''}`}>
      <summary className={styles.summary}>
        <Icon name="question" size={14} />
        {t.title}
      </summary>
      <ol className={styles.steps}>
        {t.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </details>
  );
}
