import type { ClaimStatus } from '../api/types';

/* Small inline icon set (stroke icons on a 16px grid). Decorative unless labelled. */

type IconName =
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
  | 'doc';

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
};

export function Icon({ name, size = 16, label }: { name: IconName; size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill={name === 'auto' ? 'currentColor' : 'none'}
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
