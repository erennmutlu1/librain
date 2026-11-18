import { currentLang, locale, type Lang } from '../i18n/lang';

/*
 * Number and date formatting for Explore in the interface language. Pages pass
 * the language they got from useLang(); code outside React gets the current one.
 */

const cache = new Map<string, Intl.NumberFormat>();

function numberFormat(lang: Lang, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${lang}|${JSON.stringify(options)}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale(lang), options);
    cache.set(key, f);
  }
  return f;
}

/** "7.4" / "7,4" with a fixed number of decimals. */
export function fmtNum(value: number, digits = 2, lang: Lang = currentLang()): string {
  return numberFormat(lang, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

/** A whole number with the language's grouping. */
export function fmtInt(value: number, lang: Lang = currentLang()): string {
  return numberFormat(lang, { maximumFractionDigits: 0 }).format(value);
}

/** 0.3 -> "30%" / "%30". */
export function fmtPercent(fraction: number, lang: Lang = currentLang()): string {
  return numberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(fraction);
}

/** "$0.07", with the language's decimal mark. */
export function fmtUsd(value: number, digits = 2, lang: Lang = currentLang()): string {
  return `$${fmtNum(value, digits, lang)}`;
}

/** "18 Nov 2026" / "18 Kas 2026"; an em dash for a missing or invalid date. */
export function fmtDate(iso: string | null | undefined, lang: Lang = currentLang()): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale(lang), { year: 'numeric', month: 'short', day: 'numeric' });
}

/** The recorded date: the ISO date in English (as recorded), a localized date in Turkish. */
export function dateText(iso: string, lang: Lang = currentLang()): string {
  return lang === 'tr' ? fmtDate(iso, 'tr') : iso;
}
