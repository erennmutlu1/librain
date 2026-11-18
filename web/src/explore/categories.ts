/*
 * Explore categories. A run's category comes from the letter its id starts
 * with (D1, F4, J5, …), the naming both experiment batches used.
 *
 * Each category has a hue (a --cat-* token in styles/tokens.css, light and
 * dark steps from the same categorical palette as the Compare systems) and an
 * icon. The hue is never the only cue: every place a category appears also
 * shows its icon and its name, and the scatter on the stats page has a
 * highlightable legend and a table.
 */
import type { CSSProperties } from 'react';
import { currentLang, type Lang } from '../i18n/lang';

export type CategoryIcon = 'pill' | 'leaf' | 'pulse' | 'venn' | 'ball' | 'stopwatch' | 'browser' | 'code' | 'briefcase';

export interface Category {
  /** The id prefix, e.g. "D". */
  prefix: string;
  /** English name; use categoryName() to show it in the interface language. */
  name: string;
  /** Short form for tight spaces (chart axes, chips on phones). */
  short: string;
  icon: CategoryIcon;
  /** CSS custom property holding the category hue. */
  colorVar: string;
  /** Which recorded batch the category belongs to. */
  batch: 1 | 2;
  /** The same two names in Turkish. */
  tr: { name: string; short: string };
}

/** Display order: batch 1 then batch 2, each in the order its experiment lists them. */
export const CATEGORIES: readonly Category[] = [
  {
    prefix: 'D',
    name: 'Drug & materials discovery × agents',
    short: 'Drug & materials',
    icon: 'pill',
    colorVar: '--cat-d',
    batch: 1,
    tr: { name: 'İlaç ve malzeme keşfi × ajanlar', short: 'İlaç ve malzeme' },
  },
  {
    prefix: 'A',
    name: 'Agriculture & energy × foundation models',
    short: 'Agriculture & energy',
    icon: 'leaf',
    colorVar: '--cat-a',
    batch: 1,
    tr: { name: 'Tarım ve enerji × temel modeller', short: 'Tarım ve enerji' },
  },
  {
    prefix: 'C',
    name: 'Clinical trials × causal & graph methods',
    short: 'Clinical trials',
    icon: 'pulse',
    colorVar: '--cat-c',
    batch: 1,
    tr: { name: 'Klinik araştırmalar × nedensel ve graf yöntemleri', short: 'Klinik araştırmalar' },
  },
  {
    prefix: 'N',
    name: 'New cross-field pairings',
    short: 'Cross-field',
    icon: 'venn',
    colorVar: '--cat-n',
    batch: 1,
    tr: { name: 'Yeni alanlar arası eşleşmeler', short: 'Alanlar arası' },
  },
  {
    prefix: 'F',
    name: 'AI × football',
    short: 'Football',
    icon: 'ball',
    colorVar: '--cat-f',
    batch: 2,
    tr: { name: 'Yapay zekâ × futbol', short: 'Futbol' },
  },
  {
    prefix: 'S',
    name: 'AI × sport',
    short: 'Sport',
    icon: 'stopwatch',
    colorVar: '--cat-s',
    batch: 2,
    tr: { name: 'Yapay zekâ × spor', short: 'Spor' },
  },
  {
    prefix: 'W',
    name: 'AI × web development',
    short: 'Web development',
    icon: 'browser',
    colorVar: '--cat-w',
    batch: 2,
    tr: { name: 'Yapay zekâ × web geliştirme', short: 'Web geliştirme' },
  },
  {
    prefix: 'P',
    name: 'Programming languages',
    short: 'Programming languages',
    icon: 'code',
    colorVar: '--cat-p',
    batch: 2,
    tr: { name: 'Programlama dilleri', short: 'Programlama dilleri' },
  },
  {
    prefix: 'J',
    name: 'Future jobs',
    short: 'Future jobs',
    icon: 'briefcase',
    colorVar: '--cat-j',
    batch: 2,
    tr: { name: 'Geleceğin meslekleri', short: 'Geleceğin meslekleri' },
  },
];

const BY_PREFIX = new Map(CATEGORIES.map((c) => [c.prefix, c]));

/** "F4" -> AI × football. Throws for an id with no known prefix, so a new batch cannot slip in uncategorised. */
export function categoryOf(id: string): Category {
  const category = BY_PREFIX.get(id.charAt(0).toUpperCase());
  if (!category) throw new Error(`Run ${id} has no Explore category: its id must start with one of ${CATEGORIES.map((c) => c.prefix).join(', ')}.`);
  return category;
}

/** A category's name (or its short form) in `lang`. */
export function categoryName(category: Category, short = false, lang: Lang = currentLang()): string {
  const names = lang === 'tr' ? category.tr : category;
  return short ? names.short : names.name;
}

export function categoryByPrefix(prefix: string): Category | undefined {
  return BY_PREFIX.get(prefix.toUpperCase());
}

/** Inline style carrying a category's hue as --cat. */
export function catStyle(category: Category): CSSProperties {
  return { '--cat': `var(${category.colorVar})` } as CSSProperties;
}
