import { useT } from '../i18n/lang';
import { text } from './ExportButtons.i18n';
import { Icon } from './Icon';
import styles from './ExportButtons.module.css';

/**
 * "↓ Markdown" and "↓ JSON": a run as a file. The files are built on click,
 * so rendering never pays for an export nobody asked for.
 */
export function ExportButtons({ onMarkdown, onJson, className }: { onMarkdown: () => void; onJson: () => void; className?: string }) {
  const t = useT(text);
  return (
    <div className={`cluster ${styles.group}${className ? ` ${className}` : ''}`} role="group" aria-label={t.group}>
      <button type="button" className="btn btn-sm" onClick={onMarkdown} aria-label={t.markdown}>
        <Icon name="download" size={14} /> Markdown
      </button>
      <button type="button" className="btn btn-sm" onClick={onJson} aria-label={t.json}>
        <Icon name="download" size={14} /> JSON
      </button>
    </div>
  );
}
