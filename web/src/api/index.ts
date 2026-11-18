import { API_BASE_URL, USE_MOCKS } from './config';
import { createHttpApi } from './httpClient';
import type { LibrainApi } from './types';

export type * from './types';
export { ApiError, describeError, isAbortError } from './errors';

/**
 * Picks the client for this build. The mock client (and its fixtures) is
 * loaded with a dynamic import so a real-mode production bundle never ships
 * the recorded data.
 */
export async function loadApi(): Promise<LibrainApi> {
  if (USE_MOCKS) {
    const { createMockApi } = await import('./mockClient');
    return createMockApi();
  }
  return createHttpApi({ baseUrl: API_BASE_URL });
}
