/*
 * The public site (VITE_PUBLIC_DEMO=true): the same App, with a runtime
 * switch between two clients.
 *
 *   Recorded (default)  the mock client over src/mocks/publicScenarios.ts:
 *                       real recorded runs, strict matching, no network.
 *   Live                the HTTP client against VITE_API_BASE_URL, sending
 *                       the visitor's own provider keys on /api requests.
 *
 * Both read History from this browser (browserHistory.ts). Switching modes
 * cancels whatever is running, clears every result and remounts the routed
 * screen, so nothing from one source stays on screen in the other.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { App } from '../App';
import { hasBothProviderKeys, requestProviderKeys } from '../api/providerKeys';
import type { LibrainApi } from '../api/types';
import { resetAllRequests } from '../lib/useRequest';
import { LIVE_NEEDS_KEYS, pendingClient, type PublicClients } from './clients';
import { PublicDemoContext, type DemoMode, type PublicDemo } from './context';

const never = () => () => undefined;

export function PublicApp({
  clients,
  initialPath,
  initialMode = 'recorded',
}: {
  clients: PublicClients;
  /** Tests render with an in-memory router starting here. */
  initialPath?: string;
  initialMode?: DemoMode;
}) {
  const [recorded, setRecorded] = useState<LibrainApi>(() =>
    clients.recorded instanceof Promise ? pendingClient(clients.recorded) : clients.recorded,
  );
  const [mode, setMode] = useState<DemoMode>(initialMode);
  const wake = clients.wake;
  const waking = useSyncExternalStore(wake ? wake.subscribe : never, () => wake?.waking() ?? false);

  useEffect(() => {
    if (!(clients.recorded instanceof Promise)) return;
    let live = true;
    clients.recorded.then(
      (api) => live && setRecorded(api),
      // The pending client rejects each call with the same error, which the screens show.
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [clients.recorded]);

  const switchTo = useCallback(
    (next: DemoMode) => {
      if (next === mode) return;
      if (next === 'live' && !hasBothProviderKeys()) {
        requestProviderKeys({ reason: LIVE_NEEDS_KEYS, goLive: true });
        return;
      }
      resetAllRequests();
      setMode(next);
    },
    [mode],
  );

  const demo = useMemo<PublicDemo>(() => ({ mode, switchTo, waking: mode === 'live' && waking }), [mode, switchTo, waking]);

  return (
    <PublicDemoContext.Provider value={demo}>
      <App api={mode === 'live' ? clients.live : recorded} runStore={clients.runStore} initialPath={initialPath} />
    </PublicDemoContext.Provider>
  );
}
