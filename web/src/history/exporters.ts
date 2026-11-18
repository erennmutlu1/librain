import type {
  CompareOutcome,
  CompareRun,
  DiscoverResponse,
  DiscoverRun,
  DiscoveryEvaluation,
  NaiveRagResponse,
  QueryRun,
  SingleLlmResponse,
} from '../api/types';
import { auditClaimedCitations, chunkKey } from '../lib/citations';
import { formatPercent, formatScore, topicLabel } from '../lib/format';
import { annotate } from '../lib/sentences';
import { basisMeta, STATUS_META } from '../lib/vocabulary';
import { RUN_KIND_LABEL, type RunDetail } from './types';

export const EXPORT_FORMAT_VERSION = 2;

/** The same record shape GET /api/runs/{id} returns, so exports re-import through one normaliser. */
export function runsToJson(runs: readonly RunDetail[]): string {
  return JSON.stringify(
    { format: 'librain-web-runs', version: EXPORT_FORMAT_VERSION, exportedAt: new Date().toISOString(), runs },
    null,
    2,
  );
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
}

function quote(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n');
}

function header(run: RunDetail): string[] {
  const lines = [
    `# ${RUN_KIND_LABEL[run.kind]}: ${run.title}`,
    '',
    `- Run at: ${new Date(run.createdAt).toISOString()}${run.mock ? ' (mock data from recorded runs)' : ''}`,
    `- Run id: \`${run.id}\``,
  ];
  if (run.quality !== null) lines.push(`- Quality: ${formatScore(run.quality)}`);
  return lines;
}

function scores(evaluation: DiscoveryEvaluation | null): string[] {
  if (!evaluation) return ['_Not scored._'];
  return [
    '| Axis | Score |',
    '| --- | --- |',
    `| Quality | ${formatScore(evaluation.qualityScore)} |`,
    `| Novelty | ${formatScore(evaluation.noveltyScore)} |`,
    `| Plausibility | ${formatScore(evaluation.plausibilityScore)} |`,
    `| Structural coherence | ${formatScore(evaluation.structuralCoherenceScore)} |`,
  ];
}

function discoverBody(result: DiscoverResponse, level = 2): string[] {
  const h = '#'.repeat(level);
  const lines: string[] = [];
  lines.push(`${h} Hypothesis`, '', result.hypothesis || '_Empty._', '');
  lines.push(`${h} Novel claim`, '', result.novelClaim ? quote(result.novelClaim) : '_None._', '');

  const cv = result.claimValidation;
  lines.push(`${h}# Claim validation`, '');
  if (!cv) {
    lines.push('_Not returned._', '');
  } else {
    if (cv.validationFailed) {
      lines.push('**Validation failed:** the validator produced no usable verdicts; treat the claim as unverified.', '');
    }
    lines.push(`Aggregate risk: ${formatScore(cv.aggregateRisk)}`, '');
    if (cv.claims.length > 0 && !cv.validationFailed) {
      const ann = annotate(result.novelClaim, cv.claims.map((c) => c.sentence));
      lines.push('| # | Status | Hallucination probability | Sentence | Rationale |', '| --- | --- | --- | --- | --- |');
      cv.claims.forEach((c, i) => {
        const placed = ann.matches[i] ? '' : ' (not found in novel claim)';
        lines.push(
          `| ${i + 1} | ${STATUS_META[c.status].label}${placed} | ${formatPercent(c.factualHallucinationProbability)} | ${cell(c.sentence)} | ${cell(c.rationale)} |`,
        );
      });
      lines.push('');
    }
  }

  lines.push(`${h} Scores`, '', ...scores(result.evaluation), '');

  lines.push(`${h} Citation contract`, '');
  if (result.claimedEvidenceCount === undefined) {
    lines.push('_Claimed and dropped evidence counts were not recorded for this run._', '');
  } else {
    lines.push(
      `The model claimed ${result.claimedEvidenceCount} supporting chunk(s); the contract dropped ${result.droppedEvidenceCount ?? 0} that were not in the retrieved set.`,
      '',
    );
  }

  lines.push(`${h} Supporting evidence`, '');
  if (result.supportingEvidence.length === 0) lines.push('_None._');
  for (const e of result.supportingEvidence) {
    const where = [e.section, e.pageNumber !== null ? `p. ${e.pageNumber}` : null].filter(Boolean).join(', ');
    lines.push(`- \`${chunkKey(e.paperId, e.chunkIndex)}\`${where ? ` ${where}` : ''} (${e.supportType})`);
    if (e.content) lines.push(`  > ${e.content.replace(/\s+/g, ' ').trim()}`);
  }
  lines.push('');

  if (result.extrapolationBasis.length > 0) {
    lines.push(`${h} Extrapolation basis`, '');
    for (const b of result.extrapolationBasis) {
      const grounded = b.groundedInChunkId ? `, from \`${b.groundedInChunkId}\`` : '';
      lines.push(`- **${basisMeta(b.basisType).label}${grounded}:** ${b.claimSentence}`, `  - ${b.rationale}`);
    }
    lines.push('');
  }

  if (result.reasoning) lines.push(`${h} Reasoning`, '', result.reasoning, '');
  lines.push(`Correlation ID: \`${result.correlationId}\``, '');
  return lines;
}

function queryMarkdown(run: QueryRun): string[] {
  const r = run.response;
  const lines = [...header(run), `- topK: ${run.request.topK ?? 5}`, ''];
  lines.push('## Answer', '', r.hypothesis || '_Empty._', '');
  if (r.synthesisConfidence !== null) lines.push(`Synthesis confidence: ${formatScore(r.synthesisConfidence)}`, '');
  lines.push('## Citations', '');
  if (r.citations.length === 0) lines.push('_None._');
  for (const c of r.citations) {
    const where = [c.section, c.pageNumber !== null ? `p. ${c.pageNumber}` : null].filter(Boolean).join(', ');
    lines.push(`- [${c.index}] \`${chunkKey(c.paperId, c.chunkIndex)}\`${where ? ` ${where}` : ''}`);
    if (c.content) lines.push(`  > ${c.content.replace(/\s+/g, ' ').trim()}`);
  }
  lines.push('');
  const e = r.evaluation;
  lines.push('## Evaluation', '');
  if (!e) {
    lines.push('_Not evaluated._', '');
  } else {
    lines.push(
      '| Axis | Score |',
      '| --- | --- |',
      `| Quality | ${formatScore(e.qualityScore)} |`,
      `| Groundedness | ${formatScore(e.groundednessScore)} |`,
      `| Relevance | ${formatScore(e.relevanceScore)} |`,
      `| Completeness | ${formatScore(e.completenessScore)} |`,
      '',
    );
    if (e.critique) lines.push('### Critique', '', e.critique, '');
    lines.push('### Unsupported claims', '', ...(e.unsupportedClaims.length ? e.unsupportedClaims.map((c) => `- ${c}`) : ['_None._']), '');
    lines.push('### Missing evidence', '', ...(e.missingEvidence.length ? e.missingEvidence.map((c) => `- ${c}`) : ['_None._']), '');
  }
  lines.push(`Correlation ID: \`${r.correlationId}\``, '');
  return lines;
}

function discoverMarkdown(run: DiscoverRun): string[] {
  const req = run.request;
  return [
    ...header(run),
    `- Provider: ${req.provider ?? 'anthropic'}${req.model ? ` (${req.model})` : ''}, topK ${req.topK ?? 5}`,
    '',
    ...discoverBody(run.response),
  ];
}

function naiveLines(r: NaiveRagResponse, level = 3): string[] {
  const h = '#'.repeat(level);
  const audit = auditClaimedCitations(r.claimedCitations, r.fabricatedCitationCount);
  const lines = [`${h} Hypothesis`, '', r.hypothesis, '', `${h} Scores`, '', ...scores(r.evaluation), ''];
  lines.push(`${h} Claimed citations`, '', `${audit.fabricated.length} of ${audit.total} fabricated (not in the retrieved set).`, '');
  for (const c of r.claimedCitations) lines.push(`- \`${chunkKey(c.paperId, c.chunkIndex)}\`${c.isResolved ? '' : ' **FABRICATED**'}`);
  lines.push('', `Correlation ID: \`${r.correlationId}\``, '');
  return lines;
}

function singleLines(r: SingleLlmResponse, level = 3): string[] {
  const h = '#'.repeat(level);
  return [`${h} Hypothesis`, '', r.hypothesis, '', `${h} Scores`, '', ...scores(r.evaluation), '', `Correlation ID: \`${r.correlationId}\``, ''];
}

function outcomeLines<T>(outcome: CompareOutcome<T>, render: (value: T) => string[]): string[] {
  if (outcome.result) return render(outcome.result);
  return [`_Failed: ${outcome.error ?? 'no result'}_${outcome.correlationId ? ` (correlation ID \`${outcome.correlationId}\`)` : ''}`, ''];
}

function compareMarkdown(run: CompareRun): string[] {
  const { librain, naiveRag, singleLlm } = run.response;
  return [
    ...header(run),
    `- Topics: ${topicLabel(run.response.topicA || run.request.topicA, run.response.topicB ?? run.request.topicB)}, topK ${run.response.topK}`,
    '',
    '## LIBRAIN',
    '',
    ...outcomeLines(librain, (v) => discoverBody(v, 3)),
    '## Naive-RAG',
    '',
    ...outcomeLines(naiveRag, (v) => naiveLines(v)),
    '## Single-LLM',
    '',
    ...outcomeLines(singleLlm, (v) => singleLines(v)),
  ];
}

export function runToMarkdown(run: RunDetail): string {
  let lines: string[];
  switch (run.kind) {
    case 'query':
      lines = queryMarkdown(run);
      break;
    case 'discover':
      lines = discoverMarkdown(run);
      break;
    case 'compare':
      lines = compareMarkdown(run);
      break;
    case 'naive-rag':
      lines = [...header(run), '', ...naiveLines(run.response, 2)];
      break;
    case 'single-llm':
      lines = [...header(run), '', ...singleLines(run.response, 2)];
      break;
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

export function runsToMarkdown(runs: readonly RunDetail[]): string {
  const intro = `# LIBRAIN run history\n\nExported ${new Date().toISOString()}, ${runs.length} run(s).\n`;
  return [intro, ...runs.map((run) => runToMarkdown(run).replace(/^# /, '## ').replace(/\n(#{2,}) /g, '\n#$1 '))].join('\n---\n\n');
}
