import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AnnotatedClaim } from '../components/AnnotatedClaim';
import { DiscoverResultView } from '../components/DiscoverResult';
import { ExportButtons } from '../components/ExportButtons';
import {
  BookmarkButton,
  CategoryGlyph,
  CategoryTag,
  ExploreLoadError,
  ExploreLoading,
  ExploreTabs,
  PickBadge,
  Rating,
  RatingExplainer,
  RiskChip,
  Section,
  TopicPair,
} from '../components/explore/ExploreParts';
import { Term } from '../components/explore/Term';
import { Icon } from '../components/Icon';
import { Passage } from '../components/Passage';
import { EmptyState } from '../components/States';
import { catStyle, categoryName } from '../explore/categories';
import { dateText, fmtUsd } from '../explore/fmt';
import { EXPLORE_MANIFESTS, explorePath, paperName } from '../explore/manifests';
import { promisingPoints, relatedTo, topPassages, type Discovery, type ExploreData } from '../explore/model';
import { useExploreData } from '../explore/useDiscoveries';
import { useLang, useT } from '../i18n/lang';
import { chunkKey } from '../lib/citations';
import { downloadDiscovery, type DiscoveryExport } from '../lib/exportDiscovery';
import { topicLabel } from '../lib/format';
import { useLoadedPaperIndex } from '../lib/papers';
import { discoverPath } from '../lib/remix';
import { useSessionState } from '../lib/sessionStore';
import { basisMeta } from '../lib/vocabulary';
import { text } from './ExploreDetailPage.i18n';
import styles from './ExploreDetailPage.module.css';

/*
 * /explore/:id       a short, scannable case for one recorded idea
 * /explore/:id/full  the same run in the full Discover result view
 *
 * Neither calls the API. Paper titles come from the experiment manifests
 * (arXiv titles for the papers batch 2 added) or, for the full view, from a
 * library list this tab already loaded.
 *
 * In Turkish the run's prose is a translation; "Show original" swaps in the
 * recorded English for every discovery until it is turned off again. Remix
 * and the JSON download always use the recorded English run: the corpus and
 * the recorded-run matching are English.
 */

type Text = (typeof text)['en'];

/** Kept for the tab, so the choice holds while moving between discoveries. */
const SHOW_ORIGINAL_KEY = 'explore.showOriginal';

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

function CopyLinkButton({ path }: { path: string }) {
  const t = useT(text);
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={async () => {
          const ok = await copyText(`${window.location.origin}${path}`);
          setState(ok ? 'copied' : 'failed');
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setState('idle'), 2000);
        }}
      >
        <Icon name={state === 'copied' ? 'check' : 'link'} size={14} />
        {state === 'copied' ? t.linkCopied : t.copyLink}
      </button>
      <span role="status" className="visually-hidden">
        {state === 'copied' ? t.linkCopied : state === 'failed' ? t.copyFailed : ''}
      </span>
    </>
  );
}

function manifestOf(d: Discovery) {
  return EXPLORE_MANIFESTS.find((m) => m.batch === d.batch)!;
}

function Provenance({ d }: { d: Discovery }) {
  const t = useT(text);
  const { lang } = useLang();
  const manifest = manifestOf(d);
  return (
    <p className={styles.provenance}>
      {t.recordedRun} · <time dateTime={manifest.date}>{dateText(manifest.date, lang)}</time>
      {d.costUsd !== null ? ` · ${fmtUsd(d.costUsd, 2, lang)}` : ''}
    </p>
  );
}

/** What the header's actions need beyond the shown discovery. */
interface Actions {
  /** The recorded English run (Remix and JSON); undefined while it loads. */
  original: Discovery | undefined;
  /** The shown text is a translation. */
  translated: boolean;
}

function exportInput(d: Discovery, translated: boolean): DiscoveryExport {
  return {
    request: d.request,
    response: d.response,
    id: d.id,
    source: d.source,
    url: `${window.location.origin}${explorePath(d.id)}`,
    recordedOn: manifestOf(d).date,
    translated,
    paperTitle: paperName,
  };
}

function Header({ d, data, actions }: { d: Discovery; data: ExploreData; actions: Actions }) {
  const t = useT(text);
  const { lang } = useLang();
  const { original } = actions;
  return (
    <header className={styles.header} style={catStyle(d.category)}>
      <div className={styles.headMeta}>
        <CategoryTag category={d.category} />
        {d.pick ? <PickBadge /> : null}
        <span className={styles.runId}>{t.run(d.id)}</span>
      </div>
      <div className={styles.headGrid}>
        <div className={styles.headMain}>
          <h1 className={styles.title}>
            <TopicPair discovery={d} />
          </h1>
          <Provenance d={d} />
          <div className={styles.actions}>
            {original ? (
              <Link to={discoverPath(original.request)} className={`btn btn-primary ${styles.remix}`} aria-describedby={`remix-hint-${d.id}`}>
                <Icon name="shuffle" size={14} /> {t.remix}
              </Link>
            ) : null}
            <Link to={explorePath(d.id, 'full')} className="btn">
              <Icon name="doc" size={14} /> {t.openFull}
            </Link>
            <CopyLinkButton path={explorePath(d.id)} />
            <BookmarkButton id={d.id} label={d.request.topicA} />
          </div>
          <span id={`remix-hint-${d.id}`} hidden>
            {t.remixHint}
          </span>
          <ExportButtons
            className={styles.export}
            onMarkdown={() => downloadDiscovery(exportInput(d, actions.translated), 'markdown', lang)}
            onJson={() => downloadDiscovery(exportInput(original ?? d, false), 'json', lang)}
          />
        </div>
        <div className={styles.headRating}>
          <Rating value={d.rating} size="lg" />
          <RiskChip discovery={d} />
        </div>
        <div className={styles.headExplain}>
          <RatingExplainer range={data.noveltyRange} discovery={d} align="end" />
        </div>
      </div>
    </header>
  );
}

function Promising({ d, data }: { d: Discovery; data: ExploreData }) {
  const t = useT(text);
  const { lang } = useLang();
  const points = promisingPoints(d, data, paperName, lang);
  return (
    <Section
      id="promising"
      title={t.promising}
      note={
        <p className={styles.candidate}>
          <strong>{t.candidateLabel}</strong> {t.candidate}
        </p>
      }
    >
      <ul role="list" className={styles.points}>
        {points.map((p) => (
          <li key={p.key} className={styles.point} data-tone={p.tone}>
            <span className={styles.pointMark} aria-hidden="true">
              {p.tone === 'strong' ? <Icon name="check" size={14} /> : p.tone === 'caution' ? <Icon name="warning" size={14} /> : <span className={styles.dash} />}
            </span>
            <span>
              {p.term ? (
                <>
                  <Term k={p.term.key}>{p.term.label}</Term> <b className="num">{p.term.value}</b> —{' '}
                </>
              ) : null}
              {p.href ? <a href={p.href}>{p.text}</a> : p.text}
              {p.papers ? (
                <>
                  {' '}
                  {p.papers.map((name, i) => (
                    <span key={name}>
                      <cite className={styles.paper}>{name}</cite>
                      {i < p.papers!.length - 1 ? '; ' : '.'}
                    </span>
                  ))}
                </>
              ) : null}
            </span>
          </li>
        ))}
        {d.pick?.whyFeatured ? (
          <li className={styles.point} data-tone="strong">
            <span className={styles.pointMark} aria-hidden="true">
              <Icon name="star" size={14} filled />
            </span>
            <span>
              <span className={styles.editor}>{t.editorsNote}</span> {d.pick.whyFeatured}
            </span>
          </li>
        ) : null}
      </ul>
    </Section>
  );
}

function Evidence({ d }: { d: Discovery }) {
  const t = useT(text);
  const passages = topPassages(d);
  const total = d.response.supportingEvidence.length;
  return (
    <Section id="evidence" title={t.evidence} note={<p>{t.evidenceNote(passages.length, total)}</p>}>
      <ol role="list" className={styles.passages}>
        {passages.map((e) => (
          <li key={chunkKey(e.paperId, e.chunkIndex)} className={styles.passage}>
            <p className={styles.passageSource}>
              <cite className={styles.paper}>{paperName(e.paperId)}</cite>
              <span className={styles.passageWhere}>
                {[e.section, e.pageNumber !== null ? t.page(e.pageNumber) : null].filter(Boolean).join(', ') || t.noSection}
                {' · '}
                <code className="mono">{chunkKey(e.paperId, e.chunkIndex)}</code>
              </span>
            </p>
            <Passage text={e.content ?? ''} />
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Reasoning({ d }: { d: Discovery }) {
  const t = useT(text);
  const { lang } = useLang();
  const basis = d.response.extrapolationBasis;
  if (basis.length === 0) return null;
  return (
    <Section id="reasoning" title={t.reasoning} note={<p>{t.reasoningNote}</p>}>
      <ol className={styles.basis}>
        {basis.map((b, i) => (
          <li key={i} className={styles.basisItem}>
            <p className={styles.basisSentence}>{b.claimSentence}</p>
            <p className={styles.basisMeta}>
              <span className="tag" title={basisMeta(b.basisType, lang).description}>
                {basisMeta(b.basisType, lang).label}
              </span>
              {b.groundedInChunkId ? (
                <span>
                  {t.from} <cite className={styles.paper}>{paperName(b.groundedInChunkId.split(':')[0] ?? '')}</cite>{' '}
                  <code className="mono">{b.groundedInChunkId}</code>
                </span>
              ) : (
                <span className="muted">{t.noSourcePassage}</span>
              )}
            </p>
            {b.rationale ? <p className={styles.basisRationale}>{b.rationale}</p> : null}
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Unproven({ d }: { d: Discovery }) {
  const t = useT(text);
  const papers = useLoadedPaperIndex();
  const counts = { grounded: 0, extrapolated: 0, risky: 0 };
  for (const v of d.verdicts) counts[v.status]++;
  const parts = (['grounded', 'extrapolated', 'risky'] as const)
    .filter((s) => counts[s] > 0)
    .map((s) => (
      <span key={s}>
        {counts[s]} <Term k={s}>{t.statusWord[s]}</Term>
      </span>
    ));
  return (
    <Section
      id="unproven"
      title={t.unproven}
      note={
        d.verdicts.length > 0 ? (
          <p>
            {t.unprovenLead(d.verdicts.length)}
            {parts.map((p, i) => (
              <span key={i}>
                {p}
                {i < parts.length - 1 ? ', ' : '.'}
              </span>
            ))}{' '}
            {t.unprovenTail}
          </p>
        ) : null
      }
    >
      <AnnotatedClaim
        novelClaim={d.response.novelClaim}
        validation={d.response.claimValidation}
        basis={d.response.extrapolationBasis}
        evidence={d.response.supportingEvidence}
        papers={papers}
      />
    </Section>
  );
}

function RelatedIdeas({ d, data }: { d: Discovery; data: ExploreData }) {
  const t = useT(text);
  const { lang } = useLang();
  const related = relatedTo(d, data);
  if (related.length === 0) return null;
  return (
    <Section id="related" title={t.related}>
      <ul role="list" className={styles.related}>
        {related.map((r) => (
          <li key={r.discovery.id} className={styles.relatedItem} style={catStyle(r.discovery.category)}>
            <CategoryGlyph category={r.discovery.category} />
            <div className={styles.relatedBody}>
              <Link to={explorePath(r.discovery.id)} className={styles.relatedLink}>
                {topicLabel(r.discovery.request.topicA, r.discovery.request.topicB)}
              </Link>
              <p className={styles.relatedWhy}>
                {r.sharedPapers.length > 0
                  ? t.alsoDrawsOn(r.sharedPapers.map(paperName).join(', '))
                  : t.alsoIn(categoryName(r.discovery.category, false, lang))}
              </p>
            </div>
            <Rating value={r.discovery.rating} size="sm" />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function DetailView({ d, data, actions }: { d: Discovery; data: ExploreData; actions: Actions }) {
  const t = useT(text);
  return (
    <article className={styles.article}>
      <Header d={d} data={data} actions={actions} />
      <section className={styles.oneLine} aria-labelledby="one-line-title">
        <h2 id="one-line-title" className={styles.oneLineTitle}>
          {t.oneLine}
        </h2>
        <p className={styles.oneLineText}>{d.takeaway}</p>
      </section>
      <Promising d={d} data={data} />
      <Evidence d={d} />
      <Reasoning d={d} />
      <Unproven d={d} />
      <RelatedIdeas d={d} data={data} />
    </article>
  );
}

function FullView({ d }: { d: Discovery }) {
  const t = useT(text);
  const { lang } = useLang();
  const papers = useLoadedPaperIndex();
  const manifest = manifestOf(d);
  const cost = d.costUsd !== null ? fmtUsd(d.costUsd, 2, lang) : null;
  return (
    <>
      <h1 className="visually-hidden">{t.fullTitle(topicLabel(d.request.topicA, d.request.topicB))}</h1>
      <div className={`notice notice-info ${styles.banner}`}>
        <Icon name="doc" />
        <div className={styles.bannerBody}>
          <p>
            <strong>{t.notNow}</strong>
          </p>
          <p>
            {t.wroteBefore(manifest.generator)}
            <time dateTime={manifest.date}>{dateText(manifest.date, lang)}</time>
            {t.wroteAfter(manifest.judge, cost)}
          </p>
          <p className={styles.source}>
            {t.recordedOutput} <code className="mono">{d.source}</code>
          </p>
        </div>
      </div>
      <DiscoverResultView request={d.request} result={d.response} papers={papers} />
    </>
  );
}

/**
 * Turkish interface only: says the text is a translation (or has none yet)
 * and offers the recorded English instead.
 */
function TranslationNotice({ translated, showOriginal, onToggle, t }: { translated: boolean; showOriginal: boolean; onToggle: () => void; t: Text }) {
  if (!translated) {
    return (
      <p className={`notice ${styles.translation}`}>
        <Icon name="globe" />
        <span>{t.translation.untranslated}</span>
      </p>
    );
  }
  return (
    <div className={`notice notice-info ${styles.translation}`}>
      <Icon name="globe" />
      <div className={styles.translationBody}>
        <p>{showOriginal ? t.translation.original : t.translation.translated}</p>
        <button type="button" className="btn btn-sm" aria-pressed={showOriginal} onClick={onToggle}>
          {t.translation.toggle}
        </button>
      </div>
    </div>
  );
}

export default function ExploreDetailPage({ full = false }: { full?: boolean }) {
  const t = useT(text);
  const { lang } = useLang();
  const { id = '' } = useParams();
  const [showOriginal, setShowOriginal] = useSessionState(SHOW_ORIGINAL_KEY, false);
  const original = lang === 'tr' && showOriginal;
  // The interface language's runs, and the recorded English (Remix, JSON, "Show original").
  const inUi = useExploreData();
  const inEnglish = useExploreData('en');
  const { state, retry } = original ? inEnglish : inUi;

  if (state.status === 'error') {
    return (
      <div className="page">
        <ExploreLoadError title={t.discovery(id)} onRetry={retry} />
      </div>
    );
  }

  const data = state.status === 'ready' ? state.data : undefined;
  const d = data?.byId.get(id.toUpperCase());
  const uiData = inUi.state.status === 'ready' ? inUi.state.data : undefined;
  const english = inEnglish.state.status === 'ready' ? inEnglish.state.data.byId.get(id.toUpperCase()) : undefined;
  const translated = Boolean(uiData?.byId.get(id.toUpperCase())?.translated);
  const actions: Actions = { original: english, translated: translated && !original };

  return (
    <div className="page">
      <ExploreTabs data={uiData ?? data} currentId={d?.id} />
      <Link to={full && d ? explorePath(d.id) : explorePath()} className={styles.back}>
        <Icon name="back" size={14} /> {full && d ? t.backToSummary(d.id) : t.all}
      </Link>
      {!data ? (
        <>
          <h1 className="visually-hidden">{t.discovery(id)}</h1>
          <ExploreLoading label={t.loading(id)} />
        </>
      ) : !d ? (
        <>
          <h1 className="visually-hidden">{t.notFound}</h1>
          <EmptyState
            title={t.noSuch(id)}
            action={
              <Link to={explorePath()} className="btn btn-primary">
                {t.exploreAll(data.discoveries.length)}
              </Link>
            }
          >
            <p>{t.idHelp}</p>
          </EmptyState>
        </>
      ) : (
        <>
          {lang === 'tr' && uiData ? (
            <TranslationNotice translated={translated} showOriginal={showOriginal} onToggle={() => setShowOriginal((v) => !v)} t={t} />
          ) : null}
          {full ? <FullView d={d} /> : <DetailView d={d} data={data} actions={actions} />}
        </>
      )}
    </div>
  );
}
