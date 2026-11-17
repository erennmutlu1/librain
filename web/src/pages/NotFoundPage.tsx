import { Link } from 'react-router';
import { EmptyState } from '../components/States';

export function NotFoundPage() {
  return (
    <div className="page">
      <h1 className="page-title">Page not found</h1>
      <div style={{ marginTop: 'var(--s5)' }}>
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
