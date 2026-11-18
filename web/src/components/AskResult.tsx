import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { QueryRequest, QueryResponse, SynthesisCitation } from '../api/types';
import { useLang, useT } from '../i18n/lang';
import { chunkKey, groupForWrapping, parseCitationMarkers } from '../lib/citations';
import { formatScore } from '../lib/format';
import { displayTitle, paperTitleFor, usePaperIndex } from '../lib/papers';
import { askScoreItems } from '../lib/scoreItems';
import { CitationPanel } from './CitationPanel';
import { InfoTip } from './InfoTip';
import { ScoreBars } from './ScoreBars';
import { RequestId } from './TechDetails';
import { text } from './AskResult.i18n';
import styles from './AskResult.module.css';

export function AskResult({ request, result }: { request: QueryRequest; result: QueryResponse }) {
  const t = useT(text);
  const { lang } = useLang();
  const uid = useId();
  const papers = usePaperIndex();
  const [open, setOpen] = useState<number | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  const byIndex = useMemo(() => new Map(result.citations.map((c) => [c.index, c])), [result.citations]);
  const parts = useMemo(() => parseCitationMarkers(result.hypothesis), [result.hypothesis]);
  const hasMarkers = parts.some((p) => p.kind === 'cite');

  const openCitation = (index: number, el: HTMLElement) => {
    trigger.current = el;
    setOpen(index);
  };
  const close = useCallback(() => {
    setOpen(null);
    trigger.current?.focus();
  }, []);

  const chipLabel = (c: SynthesisCitation) => {
    const title = displayTitle(papers.get(c.paperId)) ?? c.paperId;
    return t.source(c.index, title, c.section);
  };

  const evaluation = result.evaluation;
  const openCitationData = open !== null ? byIndex.get(open) : undefined;

  return (
    <article className={styles.root} aria-labelledby={`${uid}-q`}>
      <header className={styles.header}>
        <h2 id={`${uid}-q`} className={styles.question}>
          {request.query}
        </h2>
        <div className={styles.meta}>
          <span className="tag">{t.topChunks(request.topK ?? 5)}</span>
          {result.synthesisConfidence !== null ? (
            <span className={styles.confidence}>
              <span className="tag">
                {t.confidence} <span className="num">{formatScore(result.synthesisConfidence, 2, lang)}</span>
              </span>
              <InfoTip k="confidence" label={t.confidence} />
            </span>
          ) : null}
          <RequestId value={result.correlationId} />
        </div>
      </header>

      <div className={styles.layout}>
        <div className={styles.main}>
          <section aria-labelledby={`${uid}-answer`}>
            <h3 id={`${uid}-answer`} className={styles.sectionTitle}>
              {t.answer}
            </h3>
            <p className={styles.answer}>
              {groupForWrapping(parts).map((run, i) =>
                run.kind === 'text' ? (
                  <span key={i}>{run.text}</span>
                ) : (
                  <span key={i} className={styles.cluster}>
                    {run.lead}
                    {run.cites.map((part, j) => (
                  <span key={j} className={styles.cites}>
                    {part.indices.map((n) => {
                      const c = byIndex.get(n);
                      return c ? (
                        <button
                          key={n}
                          type="button"
                          className={styles.chip}
                          aria-label={chipLabel(c)}
                          aria-expanded={open === n}
                          data-open={open === n || undefined}
                          onClick={(e) => openCitation(n, e.currentTarget)}
                        >
                          {n}
                        </button>
                      ) : (
                        <span key={n} className={styles.chipDropped} title={t.droppedTitle}>
                          <span aria-hidden="true">{n}</span>
                          <span className="visually-hidden">{t.droppedSr(n)}</span>
                        </span>
                      );
                    })}
                  </span>
                    ))}
                    {run.trail}
                  </span>
                ),
              )}
            </p>
            {!hasMarkers && result.citations.length > 0 ? (
              <p className={styles.noMarkers}>{t.noMarkers}</p>
            ) : null}
          </section>

          <section aria-labelledby={`${uid}-sources`}>
            <h3 id={`${uid}-sources`} className={styles.sectionTitle}>
              {t.sources} <span className="muted num">({result.citations.length})</span>
            </h3>
            {result.citations.length === 0 ? (
              <p className="muted small">{t.noCitations}</p>
            ) : (
              <ul role="list" className={styles.sources}>
                {result.citations.map((c) => {
                  const title = paperTitleFor(c.paperId, papers);
                  return (
                    <li key={c.index}>
                      <button
                        type="button"
                        className={styles.source}
                        data-open={open === c.index || undefined}
                        aria-expanded={open === c.index}
                        onClick={(e) => openCitation(c.index, e.currentTarget)}
                      >
                        <span className={styles.sourceNum} aria-hidden="true">
                          {c.index}
                        </span>
                        <span className={styles.sourceBody}>
                          <span className={styles.sourceTitle}>{title ?? c.paperId}</span>
                          <span className={styles.sourceWhere}>
                            {[c.section, c.pageNumber !== null ? t.page(c.pageNumber) : null, chunkKey(c.paperId, c.chunkIndex)]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        </span>
                        <span className="visually-hidden">{t.openSource(c.index)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside className={styles.side} aria-labelledby={`${uid}-eval`}>
          <h3 id={`${uid}-eval`} className={styles.sectionTitle}>
            {t.evaluator}
          </h3>
          {evaluation ? (
            <div className={styles.evaluation}>
              <ScoreBars label={t.evaluation} items={askScoreItems(evaluation, lang)} />
              {evaluation.critique ? (
                <div>
                  <p className={styles.subTitle}>{t.critique}</p>
                  <p className={styles.critique}>{evaluation.critique}</p>
                </div>
              ) : null}
              <div>
                <p className={styles.subTitle}>{t.unsupported}</p>
                {evaluation.unsupportedClaims.length ? (
                  <ul className={styles.flags}>
                    {evaluation.unsupportedClaims.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">{t.none}</p>
                )}
              </div>
              <div>
                <p className={styles.subTitle}>{t.missing}</p>
                {evaluation.missingEvidence.length ? (
                  <ul className={styles.gaps}>
                    {evaluation.missingEvidence.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted small">{t.noneNoted}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="muted small">{t.notEvaluated}</p>
          )}
        </aside>
      </div>

      {openCitationData ? (
        <CitationPanel citation={openCitationData} paper={papers.get(openCitationData.paperId)} onClose={close} />
      ) : null}
    </article>
  );
}
