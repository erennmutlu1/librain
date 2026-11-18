import { Fragment, useEffect, useId, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import { locale, useLang, useT } from '../i18n/lang';
import { downloadCsv, type CsvValue } from '../lib/download';
import { formatCount } from '../lib/format';
import { fold } from '../lib/textMatch';
import { Icon } from './Icon';
import { text } from './DataTable.i18n';
import styles from './DataTable.module.css';

/*
 * A real <table> with the conveniences people expect from a data grid:
 * sortable headers (buttons in the <th>; the sorted one has aria-sort), a search box that filters
 * rows as you type, a live "N of M" count, a sticky header, an empty state
 * that offers to clear the search, and an optional CSV export of the rows
 * shown. Columns are typed against the row, so a page declares what a column
 * shows, how it sorts and what it exports in one place.
 *
 * Narrow screens: columns can drop out below a breakpoint (`hideBelow`), and
 * the page shows what they held inside the first cell. If the table is still
 * wider than its box, it scrolls inside that box, which is then a labelled,
 * focusable region so the keyboard can scroll it too. The page never scrolls
 * sideways.
 */

export type SortDir = 'asc' | 'desc';
type SortValue = string | number | null | undefined;

export interface DataColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable. Missing values (null, undefined, '') sort last in both directions. */
  sortValue?: (row: T) => SortValue;
  /** Direction of the first click; numbers and dates usually want 'desc'. */
  firstDir?: SortDir;
  /** Right-aligned with tabular figures. */
  numeric?: boolean;
  /** Hidden below 40rem (sm), 48rem (md) or 80rem (lg). */
  hideBelow?: 'sm' | 'md' | 'lg';
  /** The cell is a <th scope="row"> that names the row. */
  rowHeader?: boolean;
  /** The header is read by screen readers but not shown (an actions column). */
  headerHidden?: boolean;
  width?: string;
  className?: string;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

export interface DataTableProps<T> {
  rows: readonly T[];
  columns: readonly DataColumn<T>[];
  rowKey: (row: T) => string;
  /** Names the table; the current sort and search are added for screen readers. */
  caption: string;
  searchLabel: string;
  searchPlaceholder?: string;
  /** Everything the search box should find a row by. */
  searchText: (row: T) => string;
  /** Controlled search, for a page that keeps it across visits. */
  query?: string;
  onQueryChange?: (query: string) => void;
  initialSort?: { column: string; dir: SortDir };
  /** Adds a CSV button that exports the rows shown, in the order shown. */
  csv?: { filename: string; columns: readonly CsvColumn<T>[] };
  /** Replaces the default "12 of 55" / "55 rows". */
  countLabel?: (shown: number, total: number) => string;
  /** Extra filters after the search box. */
  filters?: ReactNode;
  /** Extra buttons after the CSV button. */
  actions?: ReactNode;
  /** A row that follows a row, such as an inline confirmation; spans every column. */
  afterRow?: (row: T, columnCount: number) => ReactNode;
  /** data-* attributes for a row's <tr>. */
  rowData?: (row: T) => Record<`data-${string}`, string | boolean | undefined>;
  /**
   * A pointer convenience: clicking anywhere on the row (outside its links
   * and buttons) does what the row's own link does. Keyboard and screen
   * reader users use that link, so the row itself takes no focus.
   */
  onRowClick?: (row: T) => void;
  busy?: boolean;
}

const HIDE: Record<NonNullable<DataColumn<unknown>['hideBelow']>, string | undefined> = {
  sm: styles.hideSm,
  md: styles.hideMd,
  lg: styles.hideLg,
};

function isMissing(v: SortValue): v is null | undefined | '' {
  return v === null || v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v));
}

function SortIcon({ dir }: { dir: SortDir | null }) {
  // Both chevrons when unsorted; the active one alone when sorted.
  return (
    <svg className={styles.sortIcon} width="10" height="12" viewBox="0 0 10 12" aria-hidden="true" focusable="false">
      {dir !== 'desc' ? <path d="M2 5 5 2l3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {dir !== 'asc' ? <path d="M2 7l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  );
}

/** A link styled as the row's main link (the thing the row opens). */
export function RowLink({ className, ...props }: LinkProps) {
  return <Link {...props} className={[styles.rowLink, className].filter(Boolean).join(' ')} />;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  caption,
  searchLabel,
  searchPlaceholder,
  searchText,
  query: controlledQuery,
  onQueryChange,
  initialSort,
  csv,
  countLabel,
  filters,
  actions,
  afterRow,
  rowData,
  onRowClick,
  busy,
}: DataTableProps<T>) {
  const t = useT(text);
  const { lang } = useLang();
  const uid = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [ownQuery, setOwnQuery] = useState('');
  const query = controlledQuery ?? ownQuery;
  const setQuery = (q: string) => (onQueryChange ? onQueryChange(q) : setOwnQuery(q));
  const [sort, setSort] = useState<{ column: string; dir: SortDir } | null>(initialSort ?? null);
  const [overflowing, setOverflowing] = useState(false);

  // Folded once per row list, not on every keystroke.
  const haystacks = useMemo(() => rows.map((r) => fold(searchText(r))), [rows, searchText]);

  const collator = useMemo(() => new Intl.Collator(locale(lang), { numeric: true, sensitivity: 'base' }), [lang]);
  const sortColumn = sort ? columns.find((c) => c.id === sort.column && c.sortValue) : undefined;

  const visible = useMemo(() => {
    const q = fold(query);
    const kept = q ? rows.filter((_, i) => haystacks[i]?.includes(q)) : [...rows];
    const value = sortColumn?.sortValue;
    if (!value || !sort) return kept;
    const sign = sort.dir === 'asc' ? 1 : -1;
    // Array.prototype.sort is stable, so ties keep the order the page gave.
    return kept
      .map((row) => ({ row, v: value(row) }))
      .sort((a, b) => {
        if (isMissing(a.v) || isMissing(b.v)) return isMissing(a.v) === isMissing(b.v) ? 0 : isMissing(a.v) ? 1 : -1;
        if (typeof a.v === 'number' && typeof b.v === 'number') return (a.v - b.v) * sign;
        return collator.compare(String(a.v), String(b.v)) * sign;
      })
      .map((x) => x.row);
  }, [rows, haystacks, query, sort, sortColumn, collator]);

  // A scroll box is only a tab stop (and a named region) when it actually scrolls.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setOverflowing(el.scrollWidth > el.clientWidth + 1));
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);

  const onSort = (column: DataColumn<T>) =>
    setSort((s) =>
      s?.column === column.id ? { column: column.id, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { column: column.id, dir: column.firstDir ?? 'asc' },
    );

  const clearSearch = () => {
    setQuery('');
    searchRef.current?.focus();
  };

  const trimmed = query.trim();
  const shown = visible.length;
  const total = rows.length;
  const count = countLabel
    ? countLabel(shown, total)
    : shown === total
      ? t.rows(total, formatCount(total, lang))
      : t.showing(formatCount(shown, lang), formatCount(total, lang));
  const fullCaption = `${caption}${sortColumn && sort ? t.sortedBy(sortColumn.header, sort.dir === 'asc') : ''}${trimmed ? t.filteredBy(trimmed) : ''}`;

  const exportCsv = () => {
    if (!csv) return;
    downloadCsv(
      csv.filename,
      csv.columns.map((c) => c.header),
      visible.map((row) => csv.columns.map((c) => c.value(row))),
    );
  };

  const rowClick = onRowClick
    ? (row: T) => (event: MouseEvent<HTMLTableRowElement>) => {
        // Links, buttons and fields in the row keep their own behaviour, and selecting text is not a click.
        if ((event.target as Element).closest('a, button, input, select, textarea, label, summary')) return;
        if (window.getSelection()?.toString()) return;
        onRowClick(row);
      }
    : undefined;

  return (
    <div className={styles.root} aria-busy={busy || undefined}>
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <label htmlFor={`${uid}-q`} className="visually-hidden">
            {searchLabel}
          </label>
          <span className={styles.searchIcon} aria-hidden="true">
            <Icon name="search" size={15} />
          </span>
          <input
            ref={searchRef}
            id={`${uid}-q`}
            className={`input ${styles.searchInput}`}
            type="search"
            value={query}
            placeholder={searchPlaceholder ?? searchLabel}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.preventDefault();
                setQuery('');
              }
            }}
            autoComplete="off"
            spellCheck={false}
            aria-controls={`${uid}-table`}
          />
        </div>
        {filters ? <div className={styles.filters}>{filters}</div> : null}
        <p className={styles.count} role="status">
          {count}
        </p>
        {csv || actions ? (
          <div className={styles.actions}>
            {csv ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={exportCsv}
                disabled={shown === 0}
                aria-label={t.exportCsv(shown, formatCount(shown, lang))}
                title={t.exportCsv(shown, formatCount(shown, lang))}
              >
                <Icon name="download" size={14} /> {t.csv}
              </button>
            ) : null}
            {actions}
          </div>
        ) : null}
      </div>

      <div
        ref={scrollerRef}
        className={styles.scroller}
        {...(overflowing ? { tabIndex: 0, role: 'region', 'aria-labelledby': `${uid}-cap` } : {})}
      >
        <table id={`${uid}-table`} className={styles.table}>
          <caption id={`${uid}-cap`} className="visually-hidden">
            {fullCaption}
          </caption>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = sort?.column === c.id && c.sortValue ? sort.dir : null;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    className={[c.hideBelow ? HIDE[c.hideBelow] : null, c.className].filter(Boolean).join(' ') || undefined}
                    style={c.width ? { width: c.width } : undefined}
                    data-numeric={c.numeric || undefined}
                    // Only the sorted column carries aria-sort; "none" on the others is noise for screen readers.
                    aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : undefined}
                  >
                    {c.headerHidden ? (
                      <span className="visually-hidden">{c.header}</span>
                    ) : c.sortValue ? (
                      <button type="button" className={styles.sortButton} onClick={() => onSort(c)}>
                        <span>{c.header}</span>
                        <SortIcon dir={active} />
                      </button>
                    ) : (
                      <span className={styles.headerText}>{c.header}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const key = rowKey(row);
              return (
                <Fragment key={key}>
                  <tr {...rowData?.(row)} onClick={rowClick?.(row)} data-clickable={onRowClick ? true : undefined}>
                    {columns.map((c) => {
                      const className = [c.hideBelow ? HIDE[c.hideBelow] : null, c.className].filter(Boolean).join(' ') || undefined;
                      return c.rowHeader ? (
                        <th key={c.id} scope="row" className={className} data-numeric={c.numeric || undefined}>
                          {c.cell(row)}
                        </th>
                      ) : (
                        <td key={c.id} className={className} data-numeric={c.numeric || undefined}>
                          {c.cell(row)}
                        </td>
                      );
                    })}
                  </tr>
                  {afterRow?.(row, columns.length)}
                </Fragment>
              );
            })}
            {shown === 0 && total > 0 ? (
              <tr className={styles.emptyRow}>
                <td colSpan={columns.length}>
                  <div className={styles.empty}>
                    <Icon name="search" size={20} />
                    <p className={styles.emptyTitle}>{t.noMatches(trimmed)}</p>
                    <p className={styles.emptyHint}>{t.noMatchesHint}</p>
                    <button type="button" className="btn btn-sm" onClick={clearSearch}>
                      {t.clearSearch}
                    </button>
                  </div>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
