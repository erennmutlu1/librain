import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { AnnotatedClaim } from '../components/AnnotatedClaim';
import { DiscoverResultView } from '../components/DiscoverResult';
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
import { catStyle } from '../explore/categories';
import { EXPLORE_MANIFESTS, explorePath, paperName } from '../explore/manifests';
import { promisingPoints, relatedTo, topPassages, type Discovery, type ExploreData } from '../explore/model';
import { useExploreData } from '../explore/useDiscoveries';
import { chunkKey } from '../lib/citations';
import { formatUsd, topicLabel } from '../lib/format';
import { useLoadedPaperIndex } from '../lib/papers';
import { basisMeta, STATUS_META } from '../lib/vocabulary';
import styles from './ExploreDetailPage.module.css';

/*
 * /explore/:id       a short, scannable case for one recorded idea
 * /explore/:id/full  the same run in the full Discover result view
 *
 * Neither calls the API. Paper titles come from the experiment manifests
 * (arXiv titles for the papers batch 2 added) or, for the full view, from a
 * library list this tab already loaded.
 */

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  return false;
}

function CopyLinkButton({ path }: { path: string }) {
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
        {state === 'copied' ? 'Link copied' : 'Copy link'}
      </button>
      <span role="status" className="visually-hidden">
        {state === 'copied' ? 'Link copied' : state === 'failed' ? 'Could not copy the link; copy it from the address bar.' : ''}
      </span>
    </>
  );
}

function Provenance({ d }: { d: Discovery }) {
  const manifest = EXPLORE_MANIFESTS.find((m) => m.batch === d.batch)!;
  const cost = formatUsd(d.costUsd);
  return (
    <p className={styles.provenance}>
      Recorded run · <time dateTime={manifest.date}>{manifest.date}</time>
      {cost ? ` · ${cost}` : ''}
    </p>
  );
}

function Header({ d, data }: { d: Discovery; data: ExploreData }) {
  return (
    <header className={styles.header} style={catStyle(d.category)}>
      <div className={styles.headMeta}>
        <CategoryTag category={d.category} />
        {d.pick ? <PickBadge /> : null}
        <span className={styles.runId}>Run {d.id}</span>
      </div>
      <div className={styles.headGrid}>
        <div className={styles.headMain}>
          <h1 className={styles.title}>
            <TopicPair discovery={d} />
          </h1>
          <Provenance d={d} />
          <div className={styles.actions}>
            <CopyLinkButton path={explorePath(d.id)} />
            <BookmarkButton id={d.id} label={d.request.topicA} />
            <Link to={explorePath(d.id, 'full')} className="btn">
              <Icon name="doc" size={14} /> Open full result
            </Link>
          </div>
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
  const points = promisingPoints(d, data, paperName);
  return (
    <Section
      id="promising"
      title="Why it’s promising"
      note={
        <p className={styles.candidate}>
          <strong>Candidate hypothesis:</strong> the evidence supports its starting points; the novel part still needs a
          real test.
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
              <span className={styles.editor}>Editor’s note:</span> {d.pick.whyFeatured}
            </span>
          </li>
        ) : null}
      </ul>
    </Section>
  );
}

function Evidence({ d }: { d: Discovery }) {
  const passages = topPassages(d);
  const total = d.response.supportingEvidence.length;
  return (
    <Section
      id="evidence"
      title="The evidence"
      note={
        <p>
          {passages.length} of the {total} supporting passages, quoted from the papers: the ones the generator says it
          built on come first.
        </p>
      }
    >
      <ol role="list" className={styles.passages}>
        {passages.map((e) => (
          <li key={chunkKey(e.paperId, e.chunkIndex)} className={styles.passage}>
            <p className={styles.passageSource}>
              <cite className={styles.paper}>{paperName(e.paperId)}</cite>
              <span className={styles.passageWhere}>
                {[e.section, e.pageNumber !== null ? `page ${e.pageNumber}` : null].filter(Boolean).join(', ') || 'Section not recorded'}
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
  const basis = d.response.extrapolationBasis;
  if (basis.length === 0) return null;
  return (
    <Section id="reasoning" title="How the generator reasoned" note={<p>The generator’s own note on where each novel sentence comes from.</p>}>
      <ol className={styles.basis}>
        {basis.map((b, i) => (
          <li key={i} className={styles.basisItem}>
            <p className={styles.basisSentence}>{b.claimSentence}</p>
            <p className={styles.basisMeta}>
              <span className="tag" title={basisMeta(b.basisType).description}>
                {basisMeta(b.basisType).label}
              </span>
              {b.groundedInChunkId ? (
                <span>
                  from <cite className={styles.paper}>{paperName(b.groundedInChunkId.split(':')[0] ?? '')}</cite>{' '}
                  <code className="mono">{b.groundedInChunkId}</code>
                </span>
              ) : (
                <span className="muted">no source passage</span>
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
  const papers = useLoadedPaperIndex();
  const counts = { grounded: 0, extrapolated: 0, risky: 0 };
  for (const v of d.verdicts) counts[v.status]++;
  const parts = (['grounded', 'extrapolated', 'risky'] as const)
    .filter((s) => counts[s] > 0)
    .map((s) => (
      <span key={s}>
        {counts[s]} <Term k={s}>{STATUS_META[s].label.toLowerCase()}</Term>
      </span>
    ));
  return (
    <Section
      id="unproven"
      title="What’s still unproven"
      note={
        d.verdicts.length > 0 ? (
          <p>
            The novel claim, checked sentence by sentence by a validator model: {d.verdicts.length}{' '}
            {d.verdicts.length === 1 ? 'sentence' : 'sentences'},{' '}
            {parts.map((p, i) => (
              <span key={i}>
                {p}
                {i < parts.length - 1 ? ', ' : '.'}
              </span>
            ))}{' '}
            Select a sentence to read the validator’s rationale.
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
  const related = relatedTo(d, data);
  if (related.length === 0) return null;
  return (
    <Section id="related" title="Related ideas">
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
                  ? `Also draws on ${r.sharedPapers.map(paperName).join(', ')}`
                  : `Also in ${r.discovery.category.name}`}
              </p>
            </div>
            <Rating value={r.discovery.rating} size="sm" />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function DetailView({ d, data }: { d: Discovery; data: ExploreData }) {
  return (
    <article className={styles.article}>
      <Header d={d} data={data} />
      <section className={styles.oneLine} aria-labelledby="one-line-title">
        <h2 id="one-line-title" className={styles.oneLineTitle}>
          The idea in one line
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
  const papers = useLoadedPaperIndex();
  const manifest = EXPLORE_MANIFESTS.find((m) => m.batch === d.batch)!;
  const cost = formatUsd(d.costUsd);
  return (
    <>
      <h1 className="visually-hidden">Full result: {topicLabel(d.request.topicA, d.request.topicB)}</h1>
      <div className={`notice notice-info ${styles.banner}`}>
        <Icon name="doc" />
        <div className={styles.bannerBody}>
          <p>
            <strong>Recorded run, not generated now.</strong>
          </p>
          <p>
            {manifest.generator} wrote it on <time dateTime={manifest.date}>{manifest.date}</time>
            {manifest.judge ? `; ${manifest.judge} scored it and checked each sentence` : ''}.{cost ? ` It cost ${cost} then.` : ''}{' '}
            Showing it calls no API.
          </p>
          <p className={styles.source}>
            Recorded output: <code className="mono">{d.source}</code>
          </p>
        </div>
      </div>
      <DiscoverResultView request={d.request} result={d.response} papers={papers} />
    </>
  );
}

export default function ExploreDetailPage({ full = false }: { full?: boolean }) {
  const { id = '' } = useParams();
  const { state, retry } = useExploreData();

  if (state.status === 'error') {
    return (
      <div className="page">
        <ExploreLoadError title={`Discovery ${id}`} onRetry={retry} />
      </div>
    );
  }

  const data = state.status === 'ready' ? state.data : undefined;
  const d = data?.byId.get(id.toUpperCase());

  return (
    <div className="page">
      <ExploreTabs data={data} currentId={d?.id} />
      <Link to={full && d ? explorePath(d.id) : explorePath()} className={styles.back}>
        <Icon name="back" size={14} /> {full && d ? `Back to the summary of ${d.id}` : 'All discoveries'}
      </Link>
      {!data ? (
        <>
          <h1 className="visually-hidden">Discovery {id}</h1>
          <ExploreLoading label={`Loading discovery ${id}`} />
        </>
      ) : !d ? (
        <>
          <h1 className="visually-hidden">Discovery not found</h1>
          <EmptyState
            title={`There is no recorded discovery called “${id}”`}
            action={
              <Link to={explorePath()} className="btn btn-primary">
                Explore all {data.discoveries.length}
              </Link>
            }
          >
            <p>Run ids are a letter and a number, such as D1, F4 or J5.</p>
          </EmptyState>
        </>
      ) : full ? (
        <FullView d={d} />
      ) : (
        <DetailView d={d} data={data} />
      )}
    </div>
  );
}
