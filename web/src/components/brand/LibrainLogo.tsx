import { useId } from 'react';
import styles from './LibrainLogo.module.css';

/*
 * The LIBRAIN wordmark, drawn as monoline strokes so it never depends on a font.
 * Flat and single-colour: everything paints in currentColor, which the stylesheet
 * sets to the --ink token, so the logo follows the light and dark themes.
 *
 * Grid: baseline y=64, x-height y=28, ascender y=8, stroke 6. Every place a bowl
 * or shoulder meets a stem turns through the same radius-8 bend. The "ai" is the
 * one stroke that spans two letters, drawn as an alpha: a round bowl (radius 18,
 * like the b) whose stroke crosses itself at the lower right. One strand leaves
 * the crossing and flicks out along the baseline towards the n; the other rises
 * past the x-height as the stem of the i, under the node that is its dot.
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
  wordmark: { box: [0, 4, 246, 64] as Box, defaultHeight: 28 },
  mark: { box: [132, 1, 70, 70] as Box, defaultHeight: 24 },
} as const;

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
  const titleId = `lb${useId().replace(/[^\w-]/g, '')}-title`;
  const { box, defaultHeight } = VARIANTS[variant];
  const [, , w, h] = box;
  const px = height ?? defaultHeight;
  const isWordmark = variant === 'wordmark';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={box.join(' ')}
      width={Math.round(((px * w) / h) * 100) / 100}
      height={px}
      className={[styles.logo, className].filter(Boolean).join(' ')}
      focusable="false"
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-labelledby': titleId })}
    >
      {!decorative && <title id={titleId}>{title}</title>}
      <g fill="none" stroke="currentColor" strokeWidth={STROKE} strokeLinecap="round" strokeLinejoin="round">
        {isWordmark && LETTERS.map((d) => <path key={d} d={d} />)}
        <path d={AI} />
      </g>
      <g fill="currentColor">
        {isWordmark && <circle {...DOT} />}
        <circle {...NODE} />
      </g>
    </svg>
  );
}
