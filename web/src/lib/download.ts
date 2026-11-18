/** Triggers a client-side download of `text`. */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function slugify(text: string, max = 48): string {
  return (
    text
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, max)
      .replace(/-+$/, '') || 'run'
  );
}

/** "2026-11-18-09-42" (UTC), for file names that sort by time. */
export function fileStamp(date: Date = new Date()): string {
  return date.toISOString().slice(0, 16).replace(/[:T]/g, '-');
}

export type CsvValue = string | number | boolean | null | undefined;

/*
 * A spreadsheet runs a cell that starts with one of these as a formula, so a
 * paper title or question like "=HYPERLINK(...)" could execute on open. Text
 * cells that start with one get a leading apostrophe (the OWASP advice);
 * numbers are written as numbers and never need it.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * RFC 4180 CSV: comma separated, CRLF line ends, quoted where needed. Numbers
 * keep a dot decimal whatever the interface language, so the file stays data.
 */
export function toCsv(header: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Downloads a CSV with a byte-order mark, so Excel reads Turkish letters as UTF-8. */
export function downloadCsv(filename: string, header: readonly string[], rows: readonly (readonly CsvValue[])[]): void {
  downloadText(filename, `\uFEFF${toCsv(header, rows)}`, 'text/csv');
}
