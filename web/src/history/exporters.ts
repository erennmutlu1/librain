import type {
  CompareOutcome,
  CompareRun,
  DiscoverResponse,
  DiscoverRun,
  DiscoveryEvaluation,
  EvaluationSummary,
  NaiveRagResponse,
  QueryRun,
  SingleLlmResponse,
} from '../api/types';
import { currentLang, pick, type Lang } from '../i18n/lang';
import { auditClaimedCitations, chunkKey } from '../lib/citations';
import { toCsv, type CsvValue } from '../lib/download';
import { formatPercent, formatScore, topicLabel } from '../lib/format';
import { annotate } from '../lib/sentences';
import { basisMeta, statusMeta } from '../lib/vocabulary';
import { text } from './exporters.i18n';
import { kindText } from './kinds.i18n';
import type { RunDetail } from './types';

/*
 * Run exports. JSON is the API's own record shape (machine-readable, no
 * language). Markdown and CSV are for people, so their headings, labels and
 * CSV headers follow the interface language (or `lang`); ids, topics,
 * questions, model output and timestamps (ISO, UTC) are written as they are.
 */

export const EXPORT_FORMAT_VERSION = 2;

type Text = (typeof text)['en'];

/** The same record shape GET /api/runs/{id} returns, so exports re-import through one normaliser. */
export function runsToJson(runs: readonly RunDetail[]): string {
  return JSON.stringify(
    { format: 'librain-web-runs', version: EXPORT_FORMAT_VERSION, exportedAt: new Date().toISOString(), runs },
    null,
    2,
  );
}

// ---------- Markdown ----------

function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function quote(value: string): string {
  return value
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

const code = (value: string) => `\`${value}\``;

/** Everything a section renderer needs: the strings and the language for numbers. */
interface Ctx {
  t: Text;
  lang: Lang;
}

function header(run: RunDetail, { t, lang }: Ctx): string[] {
  const lines = [
    `# ${pick(kindText, lang)[run.kind]}: ${run.title}`,
    '',
    `- ${t.runAt}: ${new Date(run.createdAt).toISOString()}${run.mock ? t.mockNote : ''}`,
    `- ${t.runId}: ${code(run.id)}`,
  ];
  if (run.quality !== null) lines.push(`- ${t.quality}: ${formatScore(run.quality, 2, lang)}`);
  return lines;
}

function scoreTable(rows: [string, number][], { t, lang }: Ctx): string[] {
  return [`| ${t.axis} | ${t.score} |`, '| --- | --- |', ...rows.map(([axis, value]) => `| ${axis} | ${formatScore(value, 2, lang)} |`)];
}

function scores(evaluation: DiscoveryEvaluation | null, ctx: Ctx): string[] {
  const { t } = ctx;
  if (!evaluation) return [t.notScored];
  return scoreTable(
    [
      [t.quality, evaluation.qualityScore],
      [t.novelty, evaluation.noveltyScore],
      [t.plausibility, evaluation.plausibilityScore],
      [t.coherence, evaluation.structuralCoherenceScore],
    ],
    ctx,
  );
}

function where(section: string | null, pageNumber: number | null, t: Text): string {
  return [section, pageNumber !== null ? t.page(pageNumber) : null].filter(Boolean).join(', ');
}

function discoverBody(result: DiscoverResponse, ctx: Ctx, level = 2): string[] {
  const { t, lang } = ctx;
  const h = '#'.repeat(level);
  const lines: string[] = [];
  lines.push(`${h} ${t.hypothesis}`, '', result.hypothesis || t.empty, '');
  lines.push(`${h} ${t.novelClaim}`, '', result.novelClaim ? quote(result.novelClaim) : t.none, '');

  const cv = result.claimValidation;
  lines.push(`${h}# ${t.claimValidation}`, '');
  if (!cv) {
    lines.push(t.notReturned, '');
  } else {
    if (cv.validationFailed) lines.push(t.validationFailed, '');
    lines.push(`${t.aggregateRisk}: ${formatScore(cv.aggregateRisk, 2, lang)}`, '');
    if (cv.claims.length > 0 && !cv.validationFailed) {
      const ann = annotate(result.novelClaim, cv.claims.map((c) => c.sentence));
      lines.push(`| # | ${t.status} | ${t.hallucination} | ${t.sentence} | ${t.rationale} |`, '| --- | --- | --- | --- | --- |');
      cv.claims.forEach((c, i) => {
        const placed = ann.matches[i] ? '' : t.notFound;
        lines.push(
          `| ${i + 1} | ${statusMeta(c.status, lang).label}${placed} | ${formatPercent(c.factualHallucinationProbability, lang)} | ${cell(c.sentence)} | ${cell(c.rationale)} |`,
        );
      });
      lines.push('');
    }
  }

  lines.push(`${h} ${t.scores}`, '', ...scores(result.evaluation, ctx), '');

  lines.push(`${h} ${t.contract}`, '');
  if (result.claimedEvidenceCount === undefined) {
    lines.push(t.countsNotRecorded, '');
  } else {
    lines.push(t.contractCounts(result.claimedEvidenceCount, result.droppedEvidenceCount ?? 0), '');
  }

  lines.push(`${h} ${t.evidence}`, '');
  if (result.supportingEvidence.length === 0) lines.push(t.none);
  for (const e of result.supportingEvidence) {
    const at = where(e.section, e.pageNumber, t);
    lines.push(`- ${code(chunkKey(e.paperId, e.chunkIndex))}${at ? ` ${at}` : ''} (${e.supportType})`);
    if (e.content) lines.push(`  > ${e.content.replace(/\s+/g, ' ').trim()}`);
  }
  lines.push('');

  if (result.extrapolationBasis.length > 0) {
    lines.push(`${h} ${t.basis}`, '');
    for (const b of result.extrapolationBasis) {
      const grounded = b.groundedInChunkId ? t.from(code(b.groundedInChunkId)) : '';
      lines.push(`- **${basisMeta(b.basisType, lang).label}${grounded}:** ${b.claimSentence}`, `  - ${b.rationale}`);
    }
    lines.push('');
  }

  if (result.reasoning) lines.push(`${h} ${t.reasoning}`, '', result.reasoning, '');
  lines.push(`${t.correlationId}: ${code(result.correlationId)}`, '');
  return lines;
}

function askScores(e: EvaluationSummary, ctx: Ctx): string[] {
  const { t } = ctx;
  return scoreTable(
    [
      [t.quality, e.qualityScore],
      [t.groundedness, e.groundednessScore],
      [t.relevance, e.relevanceScore],
      [t.completeness, e.completenessScore],
    ],
    ctx,
  );
}

function queryMarkdown(run: QueryRun, ctx: Ctx): string[] {
  const { t, lang } = ctx;
  const r = run.response;
  const lines = [...header(run, ctx), `- topK: ${run.request.topK ?? 5}`, ''];
  lines.push(`## ${t.answer}`, '', r.hypothesis || t.empty, '');
  if (r.synthesisConfidence !== null) lines.push(`${t.synthesisConfidence}: ${formatScore(r.synthesisConfidence, 2, lang)}`, '');
  lines.push(`## ${t.citations}`, '');
  if (r.citations.length === 0) lines.push(t.none);
  for (const c of r.citations) {
    const at = where(c.section, c.pageNumber, t);
    lines.push(`- [${c.index}] ${code(chunkKey(c.paperId, c.chunkIndex))}${at ? ` ${at}` : ''}`);
    if (c.content) lines.push(`  > ${c.content.replace(/\s+/g, ' ').trim()}`);
  }
  lines.push('');
  const e = r.evaluation;
  lines.push(`## ${t.evaluation}`, '');
  if (!e) {
    lines.push(t.notEvaluated, '');
  } else {
    lines.push(...askScores(e, ctx), '');
    if (e.critique) lines.push(`### ${t.critique}`, '', e.critique, '');
    const list = (items: string[]) => (items.length ? items.map((c) => `- ${c}`) : [t.none]);
    lines.push(`### ${t.unsupported}`, '', ...list(e.unsupportedClaims), '');
    lines.push(`### ${t.missing}`, '', ...list(e.missingEvidence), '');
  }
  lines.push(`${t.correlationId}: ${code(r.correlationId)}`, '');
  return lines;
}

function discoverMarkdown(run: DiscoverRun, ctx: Ctx): string[] {
  const req = run.request;
  return [
    ...header(run, ctx),
    `- ${ctx.t.provider}: ${req.provider ?? 'anthropic'}${req.model ? ` (${req.model})` : ''}, topK ${req.topK ?? 5}`,
    '',
    ...discoverBody(run.response, ctx),
  ];
}

function naiveLines(r: NaiveRagResponse, ctx: Ctx, level = 3): string[] {
  const { t } = ctx;
  const h = '#'.repeat(level);
  const audit = auditClaimedCitations(r.claimedCitations, r.fabricatedCitationCount);
  const lines = [`${h} ${t.hypothesis}`, '', r.hypothesis, '', `${h} ${t.scores}`, '', ...scores(r.evaluation, ctx), ''];
  lines.push(`${h} ${t.claimedCitations}`, '', t.fabricated(audit.fabricated.length, audit.total), '');
  for (const c of r.claimedCitations) lines.push(`- ${code(chunkKey(c.paperId, c.chunkIndex))}${c.isResolved ? '' : ` ${t.fabricatedMark}`}`);
  lines.push('', `${t.correlationId}: ${code(r.correlationId)}`, '');
  return lines;
}

function singleLines(r: SingleLlmResponse, ctx: Ctx, level = 3): string[] {
  const { t } = ctx;
  const h = '#'.repeat(level);
  return [`${h} ${t.hypothesis}`, '', r.hypothesis, '', `${h} ${t.scores}`, '', ...scores(r.evaluation, ctx), '', `${t.correlationId}: ${code(r.correlationId)}`, ''];
}

function outcomeLines<T>(outcome: CompareOutcome<T>, t: Text, render: (value: T) => string[]): string[] {
  if (outcome.result) return render(outcome.result);
  return [`_${t.failed(outcome.error)}_${outcome.correlationId ? t.failedId(code(outcome.correlationId)) : ''}`, ''];
}

function compareMarkdown(run: CompareRun, ctx: Ctx): string[] {
  const { librain, naiveRag, singleLlm } = run.response;
  return [
    ...header(run, ctx),
    `- ${ctx.t.topics}: ${topicLabel(run.response.topicA || run.request.topicA, run.response.topicB ?? run.request.topicB)}, topK ${run.response.topK}`,
    '',
    '## LIBRAIN',
    '',
    ...outcomeLines(librain, ctx.t, (v) => discoverBody(v, ctx, 3)),
    '## Naive-RAG',
    '',
    ...outcomeLines(naiveRag, ctx.t, (v) => naiveLines(v, ctx)),
    '## Single-LLM',
    '',
    ...outcomeLines(singleLlm, ctx.t, (v) => singleLines(v, ctx)),
  ];
}

export function runToMarkdown(run: RunDetail, lang: Lang = currentLang()): string {
  const ctx: Ctx = { t: pick(text, lang), lang };
  let lines: string[];
  switch (run.kind) {
    case 'query':
      lines = queryMarkdown(run, ctx);
      break;
    case 'discover':
      lines = discoverMarkdown(run, ctx);
      break;
    case 'compare':
      lines = compareMarkdown(run, ctx);
      break;
    case 'naive-rag':
      lines = [...header(run, ctx), '', ...naiveLines(run.response, ctx, 2)];
      break;
    case 'single-llm':
      lines = [...header(run, ctx), '', ...singleLines(run.response, ctx, 2)];
      break;
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export function runsToMarkdown(runs: readonly RunDetail[], lang: Lang = currentLang()): string {
  const t = pick(text, lang);
  const intro = `# ${t.historyTitle}\n\n${t.exported(new Date().toISOString(), runs.length)}\n`;
  return [intro, ...runs.map((run) => runToMarkdown(run, lang).replace(/^# /, '## ').replace(/\n(#{2,}) /g, '\n#$1 '))].join('\n---\n\n');
}

// ---------- CSV ----------

/** One run's row: whatever its kind recorded, blank where it has nothing. */
interface CsvFields {
  question?: string;
  topicA?: string;
  topicB?: string | null;
  topK?: number;
  provider?: string;
  model?: string;
  discovery?: DiscoveryEvaluation | null;
  ask?: EvaluationSummary | null;
  claimRisk?: number;
  claims?: number;
  risky?: number;
  citations?: number;
  fabricated?: number;
  elapsedMs?: number;
}

function discoverFields(r: DiscoverResponse): CsvFields {
  const cv = r.claimValidation;
  return {
    discovery: r.evaluation,
    ...(cv ? { claimRisk: cv.aggregateRisk, claims: cv.claims.length, risky: cv.claims.filter((c) => c.status === 'risky').length } : {}),
    citations: r.supportingEvidence.length,
  };
}

function csvFields(run: RunDetail): CsvFields {
  switch (run.kind) {
    case 'query':
      return {
        question: run.request.query,
        topK: run.request.topK ?? 5,
        ask: run.response.evaluation,
        citations: run.response.citations.length,
      };
    case 'discover':
      return {
        topicA: run.request.topicA,
        topicB: run.request.topicB ?? null,
        topK: run.request.topK ?? 5,
        provider: run.request.provider ?? 'anthropic',
        model: run.request.model ?? '',
        ...discoverFields(run.response),
      };
    case 'compare': {
      const r = run.response;
      return {
        topicA: r.topicA || run.request.topicA,
        topicB: r.topicB ?? run.request.topicB ?? null,
        topK: r.topK,
        // The row's scores are LIBRAIN's; the baselines are in the JSON and Markdown exports.
        ...(r.librain.result ? discoverFields(r.librain.result) : {}),
        ...(r.totalElapsedMs !== undefined ? { elapsedMs: r.totalElapsedMs } : {}),
      };
    }
    case 'naive-rag':
      return {
        topicA: run.request.topicA,
        topicB: run.request.topicB ?? null,
        topK: run.request.topK ?? 5,
        discovery: run.response.evaluation,
        citations: run.response.claimedCitations.length,
        fabricated: run.response.fabricatedCitationCount,
        ...(run.response.totalElapsedMs !== undefined ? { elapsedMs: run.response.totalElapsedMs } : {}),
      };
    case 'single-llm':
      return {
        topicA: run.request.topicA,
        topicB: run.request.topicB ?? null,
        discovery: run.response.evaluation,
        ...(run.response.totalElapsedMs !== undefined ? { elapsedMs: run.response.totalElapsedMs } : {}),
      };
  }
}

/**
 * Every run as one spreadsheet row, with the scores each kind has. Numbers
 * keep full precision and a dot decimal; times are ISO 8601 in UTC.
 */
export function runsToCsv(runs: readonly RunDetail[], lang: Lang = currentLang()): string {
  const t = pick(text, lang).csv;
  const kinds = pick(kindText, lang);
  const header = [
    t.id,
    t.kind,
    t.createdAt,
    t.title,
    t.question,
    t.topicA,
    t.topicB,
    t.topK,
    t.provider,
    t.model,
    t.quality,
    t.novelty,
    t.plausibility,
    t.coherence,
    t.groundedness,
    t.relevance,
    t.completeness,
    t.claimRisk,
    t.claims,
    t.risky,
    t.citations,
    t.fabricated,
    t.elapsedMs,
    t.mock,
  ];
  const rows = runs.map((run): CsvValue[] => {
    const f = csvFields(run);
    const created = new Date(run.createdAt);
    return [
      run.id,
      kinds[run.kind],
      Number.isNaN(created.getTime()) ? run.createdAt : created.toISOString(),
      run.title,
      f.question,
      f.topicA,
      f.topicB,
      f.topK,
      f.provider,
      f.model,
      run.quality ?? f.discovery?.qualityScore ?? f.ask?.qualityScore,
      f.discovery?.noveltyScore,
      f.discovery?.plausibilityScore,
      f.discovery?.structuralCoherenceScore,
      f.ask?.groundednessScore,
      f.ask?.relevanceScore,
      f.ask?.completenessScore,
      f.claimRisk,
      f.claims,
      f.risky,
      f.citations,
      f.fabricated,
      f.elapsedMs,
      Boolean(run.mock),
    ];
  });
  return toCsv(header, rows);
}
