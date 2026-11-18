import type { ClaimStatus } from '../api/types';
import { currentLang, pick, type Lang } from '../i18n/lang';
import { text } from './vocabulary.i18n';

/**
 * Plain-language names for the backend's claim and basis vocabulary.
 * Components pass the language they render in; the exported tables follow
 * the current language for code that has no hook.
 */

export const STATUS_ORDER: ClaimStatus[] = ['grounded', 'extrapolated', 'risky'];

export function statusMeta(status: ClaimStatus, lang: Lang = currentLang()): { label: string; description: string } {
  return pick(text, lang).status[status];
}

export const STATUS_META = {
  get grounded() {
    return statusMeta('grounded');
  },
  get extrapolated() {
    return statusMeta('extrapolated');
  },
  get risky() {
    return statusMeta('risky');
  },
} as Record<ClaimStatus, { label: string; description: string }>;

export function basisMeta(type: string, lang: Lang = currentLang()): { label: string; description: string } {
  const t = pick(text, lang);
  return (
    t.basis[type] ?? {
      label: type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) || t.unknownBasis,
      description: t.basisFallback,
    }
  );
}

export type SystemKey = 'librain' | 'naiveRag' | 'singleLlm';

export function systemMeta(key: SystemKey, lang: Lang = currentLang()): { name: string; summary: string } {
  return pick(text, lang).systems[key];
}

export const SYSTEMS = {
  get librain() {
    return systemMeta('librain');
  },
  get naiveRag() {
    return systemMeta('naiveRag');
  },
  get singleLlm() {
    return systemMeta('singleLlm');
  },
} as Record<SystemKey, { name: string; summary: string }>;
