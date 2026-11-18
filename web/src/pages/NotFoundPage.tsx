import { Link } from 'react-router';
import { EmptyState } from '../components/States';
import styles from './pages.module.css';

export function NotFoundPage() {
  return (
    <div className="page">
      <header className={`page-header ${styles.hero}`}>
        <h1 className="page-title">Page not found</h1>
      </header>
      <div>
        <EmptyState
          title="There is nothing at this address"
          action={
            <Link to="/discover" className="btn btn-primary">
              Go to Discover
            </Link>
          }
        />
      </div>
    </div>
  );
}
