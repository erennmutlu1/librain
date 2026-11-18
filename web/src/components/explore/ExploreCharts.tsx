import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { CATEGORIES, catStyle, categoryName } from '../../explore/categories';
import { fmtNum } from '../../explore/fmt';
import { explorePath } from '../../explore/manifests';
import type { Bin, CategoryStat, Discovery } from '../../explore/model';
import { formatRating } from '../../explore/rating';
import { useLang, useT } from '../../i18n/lang';
import { topicLabel } from '../../lib/format';
import { Icon } from '../Icon';
import { chartText } from './ExploreCharts.i18n';
import styles from './ExploreCharts.module.css';

/*
 * Small inline-SVG charts for the stats page. Each is a <figure> with a
 * caption, an SVG named by role="img" (or, for the scatter, a group of links),
 * and a table of the same numbers behind a disclosure. The SVGs are drawn at
 * the container's real width so text stays at its true size on phones.
 */

function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.floor(entry?.contentRect.width ?? 0);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function ChartFigure({
  title,
  caption,
  table,
  children,
  id,
}: {
  title: string;
  caption: ReactNode;
  table: ReactNode;
  children: ReactNode;
  id: string;
}) {
  const t = useT(chartText);
  const [open, setOpen] = useState(false);
  return (
    <figure className={styles.figure} aria-labelledby={`${id}-cap`}>
      <figcaption id={`${id}-cap`} className={styles.caption}>
        <span className={styles.captionTitle}>{title}</span>
        <span className={styles.captionText}>{caption}</span>
      </figcaption>
      {children}
      <div className={styles.tableToggle}>
        <button type="button" className="btn btn-quiet btn-sm" aria-expanded={open} aria-controls={`${id}-table`} onClick={() => setOpen((o) => !o)}>
          <Icon name="list" size={14} /> {open ? t.hideTable : t.showTable}
        </button>
      </div>
      <div id={`${id}-table`} className={styles.tableWrap} hidden={!open}>
        {table}
      </div>
    </figure>
  );
}

// ---------- Rating histogram ----------

export function RatingHistogram({ bins }: { bins: Bin[] }) {
  const t = useT(chartText);
  const { lang } = useLang();
  const n1 = (v: number) => fmtNum(v, 1, lang);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = 200;
  const m = { top: 22, right: 8, bottom: 30, left: 30 };
  const plotW = Math.max(120, width - m.left - m.right);
  const plotH = height - m.top - m.bottom;
  const max = Math.max(...bins.map((b) => b.count), 1);
  const yMax = Math.ceil(max / 5) * 5;
  const binW = plotW / bins.length;
  const barW = Math.min(binW - 6, 36);
  const y = (v: number) => m.top + plotH - (v / yMax) * plotH;
  const ticks = Array.from({ length: yMax / 5 + 1 }, (_, i) => i * 5);
  const total = bins.reduce((s, b) => s + b.count, 0);
  const peak = bins.reduce((a, b) => (b.count > a.count ? b : a));
  const lo = bins[0]!.from;
  const hi = bins.at(-1)!.to;

  return (
    <ChartFigure
      id={`hist-${uid}`}
      title={t.histTitle}
      caption={t.histCaption(total, fmtNum(lo, 0, lang), fmtNum(hi, 0, lang), n1(peak.from), n1(peak.to), peak.count)}
      table={
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t.colRating}</th>
              <th scope="col">{t.colIdeas}</th>
              <th scope="col">{t.colRuns}</th>
            </tr>
          </thead>
          <tbody>
            {bins.map((b) => (
              <tr key={b.from}>
                <th scope="row" className="num">
                  {t.binRange(n1(b.from), n1(b.to))}
                </th>
                <td className="num">{b.count}</td>
                <td>{b.ids.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className={styles.plot}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t.histAria(bins.map((b) => t.histAriaPart(b.count, n1(b.from), n1(b.to))).join('; '))}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={m.left} x2={m.left + plotW} y1={y(t)} y2={y(t)} className={t === 0 ? styles.baseline : styles.grid} />
              <text x={m.left - 6} y={y(t)} className={styles.tick} textAnchor="end" dominantBaseline="middle">
                {t}
              </text>
            </g>
          ))}
          {bins.map((b, i) => {
            const x = m.left + i * binW + (binW - barW) / 2;
            const top = y(b.count);
            const h = Math.max(0, y(0) - top);
            return (
              <g key={b.from}>
                {b.count > 0 ? (
                  <path d={roundedTop(x, top, barW, h, Math.min(4, h))} className={styles.bar}>
                    <title>{t.barTitle(n1(b.from), n1(b.to), b.count, b.ids.join(', '))}</title>
                  </path>
                ) : null}
                {b.count > 0 ? (
                  <text x={x + barW / 2} y={top - 6} className={styles.value} textAnchor="middle">
                    {b.count}
                  </text>
                ) : null}
              </g>
            );
          })}
          {[...bins.map((b) => b.from), hi].map((edge, i) => (
            <text key={edge} x={m.left + i * binW} y={height - 10} className={styles.tick} textAnchor="middle">
              {width < 420 && i % 2 === 1 ? '' : edge % 1 === 0 ? fmtNum(edge, 0, lang) : n1(edge)}
            </text>
          ))}
        </svg>
      </div>
    </ChartFigure>
  );
}

function roundedTop(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function roundedEnd(x: number, y: number, w: number, h: number, r: number): string {
  if (w <= 0) return '';
  const rr = Math.min(r, w);
  return `M${x},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h - rr}Q${x + w},${y + h} ${x + w - rr},${y + h}H${x}Z`;
}

// ---------- Average rating per category ----------

export function CategoryBars({ stats }: { stats: CategoryStat[] }) {
  const t = useT(chartText);
  const { lang } = useLang();
  const n1 = (v: number) => fmtNum(v, 1, lang);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [ref, width] = useWidth<HTMLDivElement>();
  const rowH = 46;
  const barH = 12;
  const valueW = 92;
  const axisH = 22;
  const height = stats.length * rowH + 8 + axisH;
  const plotW = Math.max(80, width - valueW);
  const x = (v: number) => (v / 10) * plotW;
  const best = stats.reduce((a, b) => (b.average > a.average ? b : a));

  return (
    <ChartFigure
      id={`cat-${uid}`}
      title={t.catTitle}
      caption={t.catCaption(categoryName(best.category, false, lang), n1(best.average))}
      table={
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t.colCategory}</th>
              <th scope="col">{t.colIdeas}</th>
              <th scope="col">{t.colAverage}</th>
              <th scope="col">{t.colBest}</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.category.prefix}>
                <th scope="row">{categoryName(s.category, false, lang)}</th>
                <td className="num">{s.count}</td>
                <td className="num">{n1(s.average)}</td>
                <td>
                  <Link to={explorePath(s.best.id)}>{s.best.id}</Link> ({formatRating(s.best.rating, lang)})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className={styles.plot}>
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t.catAria(stats.map((s) => t.catAriaPart(categoryName(s.category, false, lang), n1(s.average), s.count)).join('; '))}
        >
          {[0, 2.5, 5, 7.5, 10].map((t) => (
            <g key={t}>
              <line x1={x(t) + 0.5} x2={x(t) + 0.5} y1={4} y2={height - axisH} className={t === 0 ? styles.baseline : styles.grid} />
              <text x={x(t) + 0.5} y={height - 6} className={styles.tick} textAnchor={t === 0 ? 'start' : 'middle'}>
                {t}
              </text>
            </g>
          ))}
          {stats.map((s, i) => {
            const top = i * rowH + 8;
            return (
              <g key={s.category.prefix} style={catStyle(s.category)}>
                <rect x={0} y={top + 2} width={9} height={9} rx={2} className={styles.swatch} />
                <text x={15} y={top + 7} className={styles.label} dominantBaseline="middle">
                  {categoryName(s.category, width < 420, lang)}
                </text>
                <path d={roundedEnd(0, top + 18, x(s.average), barH, 4)} className={styles.catBar} />
                <text x={x(s.average) + 6} y={top + 18 + barH / 2} className={styles.value} dominantBaseline="middle">
                  {n1(s.average)}
                  <tspan className={styles.valueMuted}>{` · ${t.ideas(s.count)}`}</tspan>
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </ChartFigure>
  );
}

// ---------- Novelty against plausibility ----------

export function NoveltyScatter({ discoveries }: { discoveries: Discovery[] }) {
  const t = useT(chartText);
  const { lang } = useLang();
  const n2 = (v: number) => fmtNum(v, 2, lang);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [ref, width] = useWidth<HTMLDivElement>();
  const [focus, setFocus] = useState<string | null>(null);
  const [active, setActive] = useState<Discovery | null>(null);
  const height = width < 480 ? 280 : 340;
  const m = { top: 14, right: 14, bottom: 42, left: 44 };
  const plotW = Math.max(120, width - m.left - m.right);
  const plotH = height - m.top - m.bottom;
  // Novelty of the recorded runs spans about 0.256 (E4) to 0.555 (E5).
  const xDomain = [0.25, 0.6] as const;
  const yDomain = [0.2, 0.8] as const;
  const x = (v: number) => m.left + ((v - xDomain[0]) / (xDomain[1] - xDomain[0])) * plotW;
  const y = (v: number) => m.top + plotH - ((v - yDomain[0]) / (yDomain[1] - yDomain[0])) * plotH;
  const xTicks = [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6];
  const yTicks = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  const present = CATEGORIES.filter((c) => discoveries.some((d) => d.category === c));
  // Draw the highlighted category last, so it sits on top.
  const ordered = focus ? [...discoveries.filter((d) => d.category.prefix !== focus), ...discoveries.filter((d) => d.category.prefix === focus)] : discoveries;

  return (
    <ChartFigure
      id={`scatter-${uid}`}
      title={t.scatterTitle}
      caption={t.scatterCaption}
      table={
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{t.colIdea}</th>
              <th scope="col">{t.colCategory}</th>
              <th scope="col">{t.colNovelty}</th>
              <th scope="col">{t.colPlausibility}</th>
              <th scope="col">{t.colRating}</th>
            </tr>
          </thead>
          <tbody>
            {discoveries.map((d) => (
              <tr key={d.id}>
                <th scope="row">
                  <Link to={explorePath(d.id)}>{d.id}</Link>
                </th>
                <td>{categoryName(d.category, true, lang)}</td>
                <td className="num">{n2(d.scores.novelty)}</td>
                <td className="num">{n2(d.scores.plausibility)}</td>
                <td className="num">{formatRating(d.rating, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div ref={ref} className={styles.plot} onMouseLeave={() => setActive(null)}>
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={t.scatterAria}>
          {xTicks.map((tick) => (
            <g key={`x${tick}`} aria-hidden="true">
              <line x1={x(tick)} x2={x(tick)} y1={m.top} y2={m.top + plotH} className={styles.grid} />
              <text x={x(tick)} y={m.top + plotH + 16} className={styles.tick} textAnchor="middle">
                {width < 420 && Math.round(tick * 100) % 10 !== 0 ? '' : n2(tick)}
              </text>
            </g>
          ))}
          {yTicks.map((tick) => (
            <g key={`y${tick}`} aria-hidden="true">
              <line x1={m.left} x2={m.left + plotW} y1={y(tick)} y2={y(tick)} className={tick === yDomain[0] ? styles.baseline : styles.grid} />
              <text x={m.left - 6} y={y(tick)} className={styles.tick} textAnchor="end" dominantBaseline="middle">
                {fmtNum(tick, 1, lang)}
              </text>
            </g>
          ))}
          <text x={m.left + plotW} y={height - 4} className={styles.axisTitle} textAnchor="end" aria-hidden="true">
            {t.axisNovelty}
          </text>
          <text transform={`translate(12 ${m.top}) rotate(-90)`} className={styles.axisTitle} textAnchor="end" aria-hidden="true">
            {t.axisPlausibility}
          </text>
          {ordered.map((d) => {
            const dim = focus !== null && d.category.prefix !== focus;
            return (
              <Link
                key={d.id}
                to={explorePath(d.id)}
                className={styles.dotLink}
                data-dim={dim || undefined}
                style={catStyle(d.category)}
                aria-label={t.dotAria(d.id, categoryName(d.category, false, lang), topicLabel(d.request.topicA, d.request.topicB), n2(d.scores.novelty), n2(d.scores.plausibility), formatRating(d.rating, lang))}
                onMouseEnter={() => setActive(d)}
                onFocus={() => setActive(d)}
                onBlur={() => setActive(null)}
              >
                <circle cx={x(d.scores.novelty)} cy={y(d.scores.plausibility)} r={12} className={styles.hit} />
                <circle cx={x(d.scores.novelty)} cy={y(d.scores.plausibility)} r={5.5} className={styles.dot} />
              </Link>
            );
          })}
        </svg>
        {active ? (
          <div
            className={styles.tooltip}
            aria-hidden="true"
            style={{
              left: Math.min(Math.max(8, x(active.scores.novelty) - 110), width - 228),
              top: y(active.scores.plausibility) + (y(active.scores.plausibility) > height / 2 ? -96 : 14),
            }}
          >
            <span className={styles.tooltipHead}>
              <span className={styles.tooltipSwatch} style={catStyle(active.category)} />
              {active.id} · {categoryName(active.category, true, lang)}
            </span>
            <span className={styles.tooltipTopic}>{topicLabel(active.request.topicA, active.request.topicB)}</span>
            <span className="num">
              {t.tooltip(n2(active.scores.novelty), n2(active.scores.plausibility), formatRating(active.rating, lang))}
            </span>
          </div>
        ) : null}
      </div>
      <div className={styles.legend} role="group" aria-label={t.legend}>
        {present.map((c) => (
          <button
            key={c.prefix}
            type="button"
            className={styles.legendItem}
            style={catStyle(c)}
            aria-pressed={focus === c.prefix}
            onClick={() => setFocus((f) => (f === c.prefix ? null : c.prefix))}
          >
            <span className={styles.legendDot} aria-hidden="true" />
            {categoryName(c, true, lang)}
          </button>
        ))}
      </div>
    </ChartFigure>
  );
}
