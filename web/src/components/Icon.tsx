import type { ClaimStatus } from '../api/types';
import type { CategoryIcon } from '../explore/categories';

/* Small inline icon set (stroke icons on a 16px grid). Decorative unless labelled. */

export type IconName =
  | 'upload'
  | 'copy'
  | 'check'
  | 'close'
  | 'warning'
  | 'info'
  | 'download'
  | 'trash'
  | 'back'
  | 'sun'
  | 'moon'
  | 'auto'
  | 'error'
  | 'doc'
  | 'key'
  | 'external'
  | 'star'
  | 'bookmark'
  | 'shuffle'
  | 'link'
  | 'chart'
  | 'question'
  | 'grid'
  | 'list'
  | 'search'
  | 'arrow'
  | 'globe'
  | CategoryIcon;

const PATHS: Record<IconName, string> = {
  upload: 'M8 11V2.5M4.5 6 8 2.5 11.5 6M2.5 10.5v3h11v-3',
  copy: 'M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3',
  check: 'M3 8.5l3.2 3L13 4.5',
  close: 'M4 4l8 8M12 4l-8 8',
  warning: 'M8 2 14.5 13.5h-13zM8 6.5v3.2M8 11.6v.4',
  info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 7.2v4.3M8 4.6v.4',
  download: 'M8 2.5V11M4.5 7.5 8 11l3.5-3.5M2.5 13.5h11',
  trash: 'M2.5 4.5h11M6 4.5V2.5h4v2M4 4.5l.7 9h6.6l.7-9',
  back: 'M10 3 5 8l5 5',
  sun: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1',
  moon: 'M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z',
  auto: 'M8 14.5a6.5 6.5 0 1 0 0-13zM8 1.5a6.5 6.5 0 0 0 0 13',
  error: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM5.7 5.7l4.6 4.6M10.3 5.7l-4.6 4.6',
  doc: 'M4 1.5h5.5L12.5 4.5v10h-8.5zM9.5 1.5v3h3M6 8h4.5M6 10.5h4.5',
  key: 'M9.2 6.8 2.5 13.5M4.4 11.6l1.5 1.5M6 10l1.3 1.3M11 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  external: 'M9.5 2.5h4v4M13.5 2.5 7.5 8.5M12 9.5v4h-9.5V4h4',
  star: 'M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z',
  bookmark: 'M4 1.8h8v12.4l-4-3-4 3z',
  shuffle: 'M1.5 4.5h2.5l6 7h4.5M12.5 9.5l2 2-2 2M1.5 11.5H4l1.7-2M8.3 6.5 10 4.5h4.5M12.5 2.5l2 2-2 2',
  link: 'M6.5 9.5l3-3M7 4.5l1.2-1.2a2.8 2.8 0 0 1 4 4L11 8.5M9 11.5l-1.2 1.2a2.8 2.8 0 0 1-4-4L5 7.5',
  chart: 'M2 13.5h12M4 11.5v-4M7 11.5v-8M10 11.5v-6M13 11.5v-2',
  question: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM6.2 6.2a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.7-.8 1.2v.5M8 11.5v.3',
  grid: 'M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5H9z',
  list: 'M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.5M2.5 8h.5M2.5 12h.5',
  search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM10.6 10.6l3.4 3.4',
  arrow: 'M3 8h10M9 4l4 4-4 4',
  globe: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM1.5 8h13M8 1.5C6.2 3.3 5.3 5.5 5.3 8s.9 4.7 2.7 6.5M8 1.5c1.8 1.8 2.7 4 2.7 6.5s-.9 4.7-2.7 6.5',
  // Explore categories
  pill: 'M3.2 12.8a2.9 2.9 0 0 1 0-4.1l5.5-5.5a2.9 2.9 0 0 1 4.1 4.1l-5.5 5.5a2.9 2.9 0 0 1-4.1 0zM6 6l4 4',
  leaf: 'M2.5 13.5C2.5 7 6.5 3 13.5 2.5 13 9.5 9 13.5 2.5 13.5zM2.5 13.5l6-6',
  pulse: 'M1.5 8.5h3l1.5-4 3 8 1.5-4h4',
  venn: 'M6 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ball: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 5.6l2.3 1.7-.9 2.7H6.6l-.9-2.7zM8 5.6V1.5M10.3 7.3l3.9-1.2M9.4 10l2.3 3.2M6.6 10l-2.3 3.2M5.7 7.3 1.8 6.1',
  stopwatch: 'M8 14.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM8 9V6.3M6.3 1.5h3.4M8 1.5v2M12.2 4.3l1-1',
  browser: 'M1.5 2.5h13v11h-13zM1.5 5.5h13M3.5 4h.4M5.3 4h.4',
  code: 'M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5M9.2 2.5l-2.4 11',
  briefcase: 'M1.8 5h12.4v8.5H1.8zM5.5 5V2.8h5V5M1.8 8.8h12.4M7 8.8v1.4h2V8.8',
};

export function Icon({ name, size = 16, label, filled = false }: { name: IconName; size?: number; label?: string; filled?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={name === 'auto' || filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {name === 'auto' ? (
        <>
          <path d="M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z" fill="none" />
          <path d="M8 1.5a6.5 6.5 0 0 0 0 13z" stroke="none" />
        </>
      ) : (
        <path d={PATHS[name]} />
      )}
    </svg>
  );
}

/**
 * Status glyphs double the colour coding: a filled dot for grounded, a hollow
 * half-dashed ring for extrapolated, a warning triangle for risky.
 */
export function StatusIcon({ status, size = 14 }: { status: ClaimStatus; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 14 14', 'aria-hidden': true, focusable: 'false' as const };
  if (status === 'grounded') {
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="5.5" fill="var(--grounded)" />
        <path d="M4.4 7.2l1.8 1.7 3.4-3.6" fill="none" stroke="var(--surface)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === 'extrapolated') {
    return (
      <svg {...common}>
        <circle cx="7" cy="7" r="5" fill="none" stroke="var(--extrapolated)" strokeWidth="1.8" strokeDasharray="2.6 1.8" />
        <circle cx="7" cy="7" r="1.6" fill="var(--extrapolated)" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M7 1.2 13 12.3H1z" fill="var(--risky)" />
      <path d="M7 5.2v3.3M7 10.2v.3" stroke="var(--surface)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
