import { useId, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { normalizeDiscoverResponse } from '../api/normalize';
import type { ClaimStatus, ClaimValidationEntry } from '../api/types';
import { text as paletteText } from '../components/CommandPalette.i18n';
import { Icon, StatusIcon, type IconName } from '../components/Icon';
import rawD1 from '../explore/data/featured-discoveries/runs/D1.json';
import trD1 from '../i18n/discoveries/tr/D1.json';
import { localizeRun, type RunTranslation } from '../i18n/discoveries/localize';
import { useLang, useT, type Lang } from '../i18n/lang';
import { formatPercent } from '../lib/format';
import { usePublicDemo } from '../public/context';
import { text } from './HomePage.i18n';
import styles from './HomePage.module.css';

/*
 * "/": what LIBRAIN is and how it works, side by side in the first screen;
 * then one real checked idea as proof, with what its marks mean; then the
 * ways in. The example is the recorded run D1 (with its
 * Turkish translation laid over it in Turkish), imported on its own so this
 * page never loads the chunk of recorded runs.
 */

const REPO_URL = 'https://github.com/erennmutlu1/librain';
const PAPER_URL = 'https://doi.org/10.5281/zenodo.20745782';
const EXAMPLE_ID = 'D1';
const STATUS_ORDER: readonly ClaimStatus[] = ['grounded', 'extrapolated', 'risky'];

/** The sections the header leads to, in its order, with the quick-search one-liners. */
const SECTIONS = [
  { key: 'explore', to: '/explore', icon: 'grid' },
  { key: 'discover', to: '/discover', icon: 'shuffle' },
  { key: 'ask', to: '/ask', icon: 'question' },
  { key: 'compare', to: '/compare', icon: 'venn' },
  { key: 'library', to: '/library', icon: 'list' },
  { key: 'history', to: '/history', icon: 'doc' },
] as const satisfies readonly { key: string; to: string; icon: IconName }[];

function exampleClaims(lang: Lang): ClaimValidationEntry[] {
  const run = (lang === 'tr' ? localizeRun(rawD1, trD1 as RunTranslation) : rawD1) as { response?: unknown };
  const validation = normalizeDiscoverResponse(run.response).claimValidation;
  return validation && !validation.validationFailed ? validation.claims : [];
}

function ExternalLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const t = useT(text);
  return (
    <a href={href} className={className} target="_blank" rel="noreferrer">
      {children}
      <span className="visually-hidden">{t.about.newTab}</span>
    </a>
  );
}

function Hero() {
  const t = useT(text).hero;
  return (
    <div className={styles.heroText}>
      <p className={styles.eyebrow}>{t.eyebrow}</p>
      <h1 id="home-title" className={styles.title}>
        {t.title}
      </h1>
      <p className={styles.lede}>{t.lede}</p>
      <div className={styles.ctas}>
        <Link to="/explore" className={`btn btn-primary ${styles.cta}`}>
          {t.primary}
          <Icon name="arrow" />
        </Link>
        <Link to="/discover" className={`btn ${styles.cta}`}>
          {t.secondary}
        </Link>
      </div>
      <p className={styles.free}>{t.free}</p>
    </div>
  );
}

/**
 * After the explanation, the proof: what the marks mean, then D1's two
 * novel-claim sentences with the validator's verdicts and its reason for the
 * risky one.
 */
function Example() {
  const t = useT(text).example;
  const { lang } = useLang();
  const uid = useId();
  const claims = useMemo(() => exampleClaims(lang), [lang]);
  const riskyIndex = claims.findIndex((c) => c.status === 'risky');
  const risky = claims[riskyIndex];
  const verdicts = useT(text).how.verdicts;

  return (
    <section className={styles.section} aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className={styles.sectionTitle}>
        {t.title}
      </h2>
      <div className={styles.exampleGrid}>
        <Legend />
        <div className={styles.example}>
          <p className={styles.topics}>
            <span className={styles.topicsLabel}>{t.topicsLabel}: </span>
            {t.topics.map((topic, i) => (
              <span key={topic.name}>
                {i > 0 ? ' + ' : null}
                <strong>{topic.name}</strong> ({topic.gloss})
              </span>
            ))}
          </p>

          <p className={styles.claimLabel} id={`${uid}-claim`}>
            {t.claimLabel}
          </p>
          <ol role="list" className={styles.sentences} aria-labelledby={`${uid}-claim`}>
            {claims.map((claim, i) => (
              <li key={i} className={styles.sentenceItem} data-status={claim.status}>
                <p className={styles.verdictRow}>
                  <span className={styles.badge} data-status={claim.status}>
                    <StatusIcon status={claim.status} size={12} />
                    <span className="visually-hidden">{t.sentence(i + 1)}: </span>
                    {verdicts[claim.status].label}
                  </span>
                  <span className={`${styles.probability} num`}>{t.probability(formatPercent(claim.factualHallucinationProbability, lang))}</span>
                </p>
                <p className={styles.sentence}>
                  <span className={styles.marked}>{claim.sentence}</span>
                </p>
              </li>
            ))}
          </ol>

          {risky ? (
            <div className={styles.reason}>
              <p className={styles.reasonLabel}>{t.reasonFor(riskyIndex + 1)}</p>
              <blockquote className={styles.reasonText}>
                <p>{risky.rationale}</p>
              </blockquote>
            </div>
          ) : null}

          {t.translated ? <p className={styles.note}>{t.translated}</p> : null}
          <p className={styles.note}>{t.credit}</p>
          <Link to={`/explore/${EXAMPLE_ID}`} className={styles.exampleLink}>
            {t.open}
            <Icon name="arrow" size={14} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Beside the hero: the three steps, so a first visit reads what happens before any example. */
function HowItWorks() {
  const t = useT(text).how;
  return (
    <section className={styles.how} aria-labelledby="home-how">
      <h2 id="home-how" className={styles.howTitle}>
        {t.title}
      </h2>
      <ol role="list" className={styles.steps}>
        {t.steps.map((step, i) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.stepNumber} aria-hidden="true">
              {i + 1}
            </span>
            <h3 className={styles.stepTitle}>{step.title}</h3>
            <p className={styles.stepBody}>{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** What the three marks mean, read just before the example that uses them. */
function Legend() {
  const t = useT(text).how;
  return (
    <div className={styles.legendBox}>
      <h3 id="home-legend" className={styles.legendTitle}>
        {t.legendTitle}
      </h3>
      <ul role="list" className={styles.legend} aria-labelledby="home-legend">
        {STATUS_ORDER.map((status) => (
          <li key={status} className={styles.legendItem} data-status={status}>
            <StatusIcon status={status} size={16} />
            <span>
              <span className={styles.legendLabel}>{t.verdicts[status].label}</span>
              <span className={styles.legendLine}>{t.verdicts[status].line}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Modes() {
  const t = useT(text).modes;
  const demo = usePublicDemo();
  return (
    <section className={styles.section} aria-labelledby="home-modes">
      <h2 id="home-modes" className={styles.sectionTitle}>
        {t.title}
      </h2>
      {demo ? <p className={styles.sectionIntro}>{t.intro}</p> : null}
      <div className={styles.modes}>
        <div className={styles.mode}>
          <h3 className={styles.modeTitle}>{t.recorded.title}</h3>
          <p className={styles.modeLede}>{t.recorded.lede}</p>
          <ul role="list" className={styles.points}>
            {t.recorded.points.map((point) => (
              <li key={point}>
                <Icon name="check" size={14} />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.mode}>
          <h3 className={styles.modeTitle}>{t.live.title}</h3>
          <p className={styles.modeLede}>{t.live.lede}</p>
          <ul role="list" className={styles.points}>
            {t.live.points.map((point) => (
              <li key={point}>
                <Icon name="check" size={14} />
                {point}
              </li>
            ))}
          </ul>
          {demo && demo.mode === 'recorded' ? (
            <button type="button" className={`btn ${styles.modeAction}`} onClick={() => demo.switchTo('live')}>
              {t.live.go}
            </button>
          ) : null}
        </div>
      </div>
      <p className={styles.caveat}>
        <Icon name="info" />
        <span>{t.caveat}</span>
      </p>
    </section>
  );
}

function Inside() {
  const t = useT(text).inside;
  const sections = useT(paletteText).sections;
  return (
    <section className={styles.section} aria-labelledby="home-inside">
      <h2 id="home-inside" className={styles.sectionTitle}>
        {t.title}
      </h2>
      <ul role="list" className={styles.cards}>
        {SECTIONS.map((s) => (
          <li key={s.key} className={styles.card}>
            <span className={styles.cardIcon} aria-hidden="true">
              <Icon name={s.icon} />
            </span>
            <h3 className={styles.cardTitle}>
              <Link to={s.to} className={styles.cardLink}>
                {sections[s.key].label}
              </Link>
            </h3>
            <p className={styles.cardHint}>{sections[s.key].hint}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function About() {
  const t = useT(text).about;
  return (
    <section className={styles.section} aria-labelledby="home-about">
      <h2 id="home-about" className={styles.sectionTitle}>
        {t.title}
      </h2>
      <p className={styles.evidence}>{t.evidence}</p>
      <ul role="list" className={styles.credits}>
        <li>
          <ExternalLink href={PAPER_URL} className={styles.creditLink}>
            {t.paper}
            <Icon name="external" size={12} />
          </ExternalLink>
          <span className={`${styles.creditMeta} mono`}>{t.doi}</span>
        </li>
        <li>
          <ExternalLink href={REPO_URL} className={styles.creditLink}>
            {t.source}
            <Icon name="external" size={12} />
          </ExternalLink>
        </li>
        <li>
          <ExternalLink href={`${REPO_URL}/blob/main/LICENSE`} className={styles.creditLink}>
            {t.licence}
            <Icon name="external" size={12} />
          </ExternalLink>
        </li>
        <li>
          <ExternalLink href="https://erenmutlu.me" className={styles.creditLink}>
            {t.author}
            <Icon name="external" size={12} />
          </ExternalLink>
        </li>
      </ul>
    </section>
  );
}

export default function HomePage() {
  return (
    <div className={`page ${styles.home}`}>
      <section className={styles.hero} aria-labelledby="home-title">
        <Hero />
        <HowItWorks />
      </section>
      <Example />
      <Modes />
      <Inside />
      <About />
    </div>
  );
}
