import { currentLang, locale, pick, type Lang } from '../i18n/lang';
import { text } from './format.i18n';

/*
 * Number and date formatting follows the interface language: English keeps
 * "1,234", "0.25", "30%" and "12 Mar 2026"; Turkish gets "1.234", "0,25",
 * "%30" and Turkish month names.
 */

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fixed(value: number, digits: number, lang: Lang = currentLang()): string {
  return new Intl.NumberFormat(locale(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false }).format(value);
}

export function formatScore(value: number | null | undefined, digits = 2, lang: Lang = currentLang()): string {
  return finite(value) ? fixed(value, digits, lang) : '—';
}

/** "$0.07"; null when there is no amount. */
export function formatUsd(value: number | null | undefined): string | null {
  return finite(value) ? `$${fixed(value, 2)}` : null;
}

export function formatPercent(value: number | null | undefined, lang: Lang = currentLang()): string {
  return finite(value) ? new Intl.NumberFormat(locale(lang), { style: 'percent', maximumFractionDigits: 0 }).format(Math.round(value * 100) / 100) : '—';
}

export function formatCount(value: number | null | undefined, lang: Lang = currentLang()): string {
  return finite(value) ? new Intl.NumberFormat(locale(lang)).format(value) : '—';
}

export function formatDuration(ms: number | null | undefined): string {
  if (!finite(ms)) return '—';
  const t = pick(text);
  if (ms < 1000) return `${Math.round(ms)} ${t.ms}`;
  return `${fixed(ms / 1000, 1)} ${t.s}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(locale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatRelative(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const t = pick(text);
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return t.justNow;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t.minutesAgo(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t.hoursAgo(hours);
  const days = Math.round(hours / 24);
  if (days < 7) return t.daysAgo(days);
  return formatDate(iso);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${fixed(bytes / (1024 * 1024), 1)} MB`;
}

export function topicLabel(topicA: string, topicB?: string | null): string {
  return topicB?.trim() ? `${topicA.trim()} × ${topicB.trim()}` : topicA.trim();
}

/** "Lewis, Perez, Piktus et al." */
export function formatAuthors(authors: string[] | null | undefined, max = 3): string | null {
  if (!authors || authors.length === 0) return null;
  return authors.length > max ? `${authors.slice(0, max).join(', ')} ${pick(text).etAl}` : authors.join(', ');
}
