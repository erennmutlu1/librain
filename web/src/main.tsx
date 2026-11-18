import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadApi } from './api';
import { API_BASE_URL } from './api/config';
import { createDefaultRunStore } from './history/runStore';
import './styles/tokens.css';
import './styles/base.css';

const root = createRoot(document.getElementById('root')!);

function startFailed(error: unknown) {
  root.render(
    <div className="page">
      <h1 className="page-title">LIBRAIN could not start</h1>
      <p className="page-lede">{error instanceof Error ? error.message : 'The app failed to load. Reload the page to try again.'}</p>
    </div>,
  );
}

// PUBLIC_DEMO (api/config.ts), written out so Vite can replace the variable
// and drop this branch from the owner's builds. Through the imported constant
// the dynamic import survives and splits the owner's bundle into extra chunks.
if (import.meta.env.VITE_PUBLIC_DEMO === 'true') {
  Promise.all([import('./public/PublicApp'), import('./public/clients')]).then(([{ PublicApp }, { createPublicClients }]) => {
    root.render(
      <StrictMode>
        <PublicApp clients={createPublicClients({ baseUrl: API_BASE_URL })} />
      </StrictMode>,
    );
  }, startFailed);
} else {
  loadApi().then((api) => {
    root.render(
      <StrictMode>
        <App api={api} runStore={createDefaultRunStore(api)} />
      </StrictMode>,
    );
  }, startFailed);
}
