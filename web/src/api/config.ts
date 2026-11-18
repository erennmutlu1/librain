/**
 * Mock mode is on unless VITE_USE_MOCKS is explicitly falsy. When the variable
 * is unset it defaults to true under `vite dev` and false in production builds.
 */
export function resolveUseMocks(flag: string | undefined, isDev: boolean): boolean {
  if (flag === undefined || flag.trim() === '') return isDev;
  return !['false', '0', 'no', 'off'].includes(flag.trim().toLowerCase());
}

/**
 * The public build is opt-in only: anything but exactly "true" keeps the
 * owner's build (mock or real mode, X-Api-Key settings) exactly as it was.
 * main.tsx repeats this test inline (see there), so keep the two identical.
 */
export function resolvePublicDemo(flag: string | undefined): boolean {
  return flag === 'true';
}

export const USE_MOCKS = resolveUseMocks(import.meta.env.VITE_USE_MOCKS as string | undefined, import.meta.env.DEV);

/** Empty = same origin (the Vite proxy in dev, or an API behind the same host). */
export const API_BASE_URL = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').trim();

/**
 * The static public site (librain.erenmutlu.me): recorded runs by default, and
 * a Live mode that sends the visitor's own provider keys. USE_MOCKS is ignored
 * when this is on; the visitor picks the mode at runtime.
 */
export const PUBLIC_DEMO = resolvePublicDemo(import.meta.env.VITE_PUBLIC_DEMO as string | undefined);
