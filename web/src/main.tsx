import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { loadApi } from './api';
import { createDefaultRunStore } from './history/runStore';
import './styles/tokens.css';
import './styles/base.css';

const root = createRoot(document.getElementById('root')!);

loadApi().then(
  (api) => {
    root.render(
      <StrictMode>
        <App api={api} runStore={createDefaultRunStore(api)} />
      </StrictMode>,
    );
  },
  (error: unknown) => {
    root.render(
      <div className="page">
        <h1 className="page-title">LIBRAIN could not start</h1>
        <p className="page-lede">{error instanceof Error ? error.message : 'The app failed to load. Reload the page to try again.'}</p>
      </div>,
    );
  },
);
