/**
 * Mock mode is on unless VITE_USE_MOCKS is explicitly falsy. When the variable
 * is unset it defaults to true under `vite dev` and false in production builds.
 */
export function resolveUseMocks(flag: string | undefined, isDev: boolean): boolean {
  if (flag === undefined || flag.trim() === '') return isDev;
  return !['false', '0', 'no', 'off'].includes(flag.trim().toLowerCase());
}

export const USE_MOCKS = resolveUseMocks(import.meta.env.VITE_USE_MOCKS as string | undefined, import.meta.env.DEV);

/** Empty = same origin (the Vite proxy in dev, or an API behind the same host). */
export const API_BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').trim();
