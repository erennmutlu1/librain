import { createContext, useContext } from 'react';
import type { CheckKeys } from './clients';

/** Recorded: real runs replayed from the repository, no keys. Live: the API, with the visitor's own keys. */
export type DemoMode = 'recorded' | 'live';

export interface PublicDemo {
  mode: DemoMode;
  /**
   * Changes the data source. Going Live without both keys opens the keys
   * panel instead, and saving both keys there completes the switch.
   */
  switchTo: (mode: DemoMode) => void;
  /** Live mode only: a request has waited a few seconds on a free server that may be waking up. */
  waking: boolean;
  /** The same in either mode, for requests the keys panel makes before going Live (the key check). */
  serverWaking: boolean;
  /** Asks the API whether the providers accept the visitor's keys; absent when the build has no API to ask. */
  checkKeys?: CheckKeys;
}

/** Provided only by the public build (PublicApp); null everywhere else. */
export const PublicDemoContext = createContext<PublicDemo | null>(null);

/** The public build's mode switch, or null in the owner's builds, which then behave exactly as before. */
export function usePublicDemo(): PublicDemo | null {
  return useContext(PublicDemoContext);
}
