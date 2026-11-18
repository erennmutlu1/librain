import { useId } from 'react';
import styles from './LibrainLogo.module.css';

/*
 * The LIBRAIN wordmark, drawn as monoline strokes so it never depends on a font.
 *
 * Grid: baseline y=64, x-height y=28, ascender y=8, stroke 6. Every place a bowl
 * or shoulder meets a stem turns through the same radius-8 bend, like a neon tube
 * or a circuit trace. The "ai" is the one stroke that spans two letters, drawn as an
 * alpha: a round bowl (radius 18, like the b) whose stroke crosses itself at the
 * lower right. One strand leaves the crossing and flicks out along the baseline
 * towards the n; the other rises past the x-height as the stem of the i, under the
 * glowing signal node that is its dot.
 */

const STROKE = 6;

const LETTERS = [
  'M4 8V56A8 8 0 0 0 12 64H30', // L
  'M44 28V64', // i
  'M60 8V56A8 8 0 0 0 68 64H78A18 18 0 0 0 78 28A18 18 0 0 0 60 46', // b
  'M110 64V36A8 8 0 0 1 118 28H128', // r
  'M210 64V36A8 8 0 0 1 218 28H234A8 8 0 0 1 242 36V64', // n
];

/**
 * a + i in one stroke, as an alpha: from the baseline flick up to the crossing at
 * (179, 57), over the shoulder to the top of the bowl, round the radius-18 bowl to
 * its foot, back through the crossing and up as the i stem.
 */
const AI =
  'M197 64C190 64 180.8 61.7 179 57C171.1 36.5 170 28 154 28A18 18 0 0 0 154 64C163 64 173.4 61.2 179 57C187.8 50.4 189.3 35.9 190.5 23';

const DOT = { cx: 44, cy: 15, r: 3.4 };
/** The i's dot, centred over the stem's tip and level with the ascender top. */
const NODE = { cx: 190.5, cy: 11, r: 6 };

type Box = readonly [x: number, y: number, width: number, height: number];

const VARIANTS = {
  wordmark: {
    box: [0, 4, 246, 64] as Box,
    gradient: { x1: 0, y1: 36, x2: 246, y2: 36 },
    defaultHeight: 28,
  },
  mark: {
    box: [132, 1, 70, 70] as Box,
    gradient: { x1: 136, y1: 64, x2: 196, y2: 6 },
    defaultHeight: 24,
  },
} as const;

/* Light-theme stops, also the fallback if the stylesheet is missing. CSS swaps in the neon set for dark. */
const STOPS = [
  { offset: 0, color: '#0b86a6', className: styles.c1 },
  { offset: 0.5, color: '#7c3aed', className: styles.c2 },
  { offset: 1, color: '#c026d3', className: styles.c3 },
];

export interface LibrainLogoProps {
  /** `wordmark`: "Librain". `mark`: the alpha "ai" and its node alone, square, for icons and tight spaces. */
  variant?: 'wordmark' | 'mark';
  /** Rendered height in px; the width follows the aspect ratio. Defaults to 28 (wordmark) or 24 (mark). */
  height?: number;
  /** Accessible name. */
  title?: string;
  /** Hide from assistive tech when a visible label sits next to it. */
  decorative?: boolean;
  className?: string;
}

export function LibrainLogo({ variant = 'wordmark', height, title = 'LIBRAIN', decorative = false, className }: LibrainLogoProps) {
  const uid = `lb${useId().replace(/[^\w-]/g, '')}`;
  const ids = { title: `${uid}-title`, paint: `${uid}-paint`, glow: `${uid}-glow`, halo: `${uid}-halo` };
  const paint = `url(#${ids.paint})`;

  const { box, gradient, defaultHeight } = VARIANTS[variant];
  const [x, y, w, h] = box;
  const px = height ?? defaultHeight;
  const isWordmark = variant === 'wordmark';

  const strokes = (
    <>
      <g className={styles.ink} fill="none" stroke={paint} strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        {isWordmark && LETTERS.map((d) => <path key={d} d={d} />)}
        <path d={AI} />
      </g>
      {isWordmark && <circle className={styles.fill} {...DOT} fill={paint} />}
    </>
  );

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={box.join(' ')}
      width={Math.round(((px * w) / h) * 100) / 100}
      height={px}
      className={[styles.logo, className].filter(Boolean).join(' ')}
      focusable="false"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-labelledby': ids.title })}
    >
      {!decorative && <title id={ids.title}>{title}</title>}
      <defs>
        <linearGradient id={ids.paint} gradientUnits="userSpaceOnUse" {...gradient}>
          {STOPS.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} className={s.className} />
          ))}
        </linearGradient>
        <radialGradient id={ids.halo}>
          <stop offset="0" stopColor="#c026d3" stopOpacity={0.55} className={styles.c3} />
          <stop offset="1" stopColor="#c026d3" stopOpacity={0} className={styles.c3} />
        </radialGradient>
        <filter id={ids.glow} filterUnits="userSpaceOnUse" x={x - 16} y={y - 16} width={w + 32} height={h + 32}>
          <feGaussianBlur in="SourceGraphic" stdDeviation={1.4} result="near" />
          <feGaussianBlur in="SourceGraphic" stdDeviation={4.5} result="far" />
          <feMerge>
            <feMergeNode in="far" />
            <feMergeNode in="near" />
          </feMerge>
        </filter>
      </defs>

      {/* Dark theme only (CSS): a blurred copy under the strokes and a halo behind the node. */}
      <g className={styles.glow} filter={`url(#${ids.glow})`}>
        {strokes}
        <circle {...NODE} fill={paint} />
      </g>
      <circle className={styles.halo} cx={NODE.cx} cy={NODE.cy} r={14} fill={`url(#${ids.halo})`} />

      {strokes}

      <circle className={styles.ping} {...NODE} fill="none" stroke={paint} strokeWidth={1.2} />
      <circle className={`${styles.fill} ${styles.node}`} {...NODE} fill={paint} />
      <circle className={`${styles.core} ${styles.node}`} cx={NODE.cx} cy={NODE.cy} r={2.2} fill="#fff" />
    </svg>
  );
}
