import { Link } from 'react-router';
import { useT } from '../i18n/lang';
import { EmptyState } from '../components/States';
import { text } from './NotFoundPage.i18n';
import styles from './pages.module.css';

export function NotFoundPage() {
  const t = useT(text);
  return (
    <div className="page">
      <header className={`page-header ${styles.hero}`}>
        <h1 className="page-title">{t.title}</h1>
      </header>
      <div>
        <EmptyState
          title={t.empty}
          action={
            <Link to="/discover" className="btn btn-primary">
              {t.go}
            </Link>
          }
        />
      </div>
    </div>
  );
}
