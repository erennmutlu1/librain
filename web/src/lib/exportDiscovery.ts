/*
 * One discovery as a file: Markdown to read or paste into notes, JSON to keep
 * the run itself. Shared by the Discover result, History and Explore.
 *
 * The Markdown's headings follow the interface language; the run's own text
 * (hypothesis, claim, passages) is exported as shown. Passages are trimmed to
 * a short quote; the JSON keeps them whole.
 */
import type { DiscoverRequest, DiscoverResponse } from '../api/types';
import { currentLang, pick, type Lang } from '../i18n/lang';
import { chunkKey } from './citations';
import { downloadText, slugify } from './download';
import { text } from './exportDiscovery.i18n';
import { formatPercent, formatScore, topicLabel } from './format';
import { discoveryAxes } from './scoreItems';
import { basisMeta, statusMeta } from './vocabulary';

export interface DiscoveryExport {
  request: DiscoverRequest;
  response: DiscoverResponse;
  /** The recorded run's id in Explore, e.g. "F4". */
  id?: string | null;
  /** Repository path of a recorded run. */
  source?: string | null;
  /** A link back to this discovery. */
  url?: string | null;
  /** When it was recorded (YYYY-MM-DD). */
  recordedOn?: string | null;
  /** The prose is a Turkish translation of the recorded English run. */
  translated?: boolean;
  /** A paper's title for the evidence list, when known. */
  paperTitle?: (paperId: string) => string | null | undefined;
}

export const DISCOVERY_EXPORT_FORMAT = 'librain-discovery';
export const DISCOVERY_EXPORT_VERSION = 1;

const PASSAGE_CHARS = 320;

/** Cut at a word boundary, with an ellipsis when cut. */
function shortPassage(text: string, max = PASSAGE_CHARS): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : t.slice(0, max)).replace(/[\s,;:.(–—-]+$/, '')}…`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function cell(text: string): string {
  return oneLine(text).replace(/\|/g, '\\|');
}

function quote(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => (line.trim() ? `> ${line.trim()}` : '>'))
    .join('\n');
}

const today = () => new Date().toISOString().slice(0, 10);

export function discoveryToMarkdown(input: DiscoveryExport, lang: Lang = currentLang()): string {
  const t = pick(text, lang);
  const { request, response: r } = input;
  const lines: string[] = [];

  // ---- Title and facts
  lines.push(`# ${topicLabel(request.topicA, request.topicB)}`, '');
  lines.push(`- ${t.topicA}: ${oneLine(request.topicA)}`);
  if (request.topicB?.trim()) lines.push(`- ${t.topicB}: ${oneLine(request.topicB)}`);
  if (input.id) lines.push(`- ${t.run}: \`${input.id}\`${input.recordedOn ? ` (${t.recorded(input.recordedOn)})` : ''}`);
  if (input.source) lines.push(`- ${t.source}: \`${input.source}\``);
  if (input.url) lines.push(`- ${t.link}: <${input.url}>`);
  const provider = request.provider === 'openai' ? `OpenAI${request.model ? ` ${request.model}` : ''}` : 'Anthropic';
  lines.push(`- ${t.model}: ${provider}, ${t.topK(request.topK ?? 5)}`);
  if (r.correlationId) lines.push(`- ${t.correlation}: \`${r.correlationId}\``);
  lines.push('');
  if (input.translated) lines.push(`_${t.translated}_`, '');

  // ---- Hypothesis
  lines.push(`## ${t.hypothesis}`, '', r.hypothesis.trim() || '—', '');

  // ---- Novel claim with each sentence's verdict
  lines.push(`## ${t.claim}`, '');
  const cv = r.claimValidation;
  const verdicts = cv && !cv.validationFailed ? cv.claims : [];
  if (verdicts.length > 0) {
    verdicts.forEach((v, i) => {
      lines.push(`${i + 1}. **${statusMeta(v.status, lang).label}** (${t.hallucination(formatPercent(v.factualHallucinationProbability, lang))}): ${oneLine(v.sentence)}`);
      if (v.rationale.trim()) lines.push(`   - ${t.validator}: ${oneLine(v.rationale)}`);
      if (v.supportingChunks.length > 0) lines.push(`   - ${t.sources}: ${v.supportingChunks.map((c) => `\`${c}\``).join(', ')}`);
    });
    lines.push('');
  } else {
    lines.push(r.novelClaim.trim() ? quote(r.novelClaim) : `_${t.noClaim}_`, '');
    if (r.novelClaim.trim()) lines.push(`_${cv ? t.unvalidated : t.notChecked}_`, '');
  }
  if (cv) lines.push(t.aggregateRisk(formatScore(cv.aggregateRisk, 2, lang)), '');

  // ---- Reasoning
  lines.push(`## ${t.reasoning}`, '', r.reasoning.trim() || `_${t.noReasoning}_`, '');
  if (r.extrapolationBasis.length > 0) {
    lines.push(`### ${t.basis}`, '');
    for (const b of r.extrapolationBasis) {
      const from = b.groundedInChunkId ? `${t.from} \`${b.groundedInChunkId}\`` : t.noSource;
      lines.push(`- **${basisMeta(b.basisType, lang).label}** (${from}): ${oneLine(b.claimSentence)}`);
      if (b.rationale.trim()) lines.push(`  - ${oneLine(b.rationale)}`);
    }
    lines.push('');
  }

  // ---- Scores
  lines.push(`## ${t.scores}`, '');
  if (r.evaluation || cv) {
    lines.push(`| ${t.score} | ${t.value} |`, '| --- | --- |');
    if (r.evaluation) {
      for (const axis of discoveryAxes(lang)) lines.push(`| ${cell(axis.label)} | ${formatScore(r.evaluation[axis.key], 2, lang)} |`);
    }
    if (cv) lines.push(`| ${t.claimRisk} | ${formatScore(cv.aggregateRisk, 2, lang)} |`);
    lines.push('');
  } else {
    lines.push(`_${t.notScored}_`, '');
  }

  // ---- Evidence
  const evidence = r.supportingEvidence;
  lines.push(`## ${t.evidence(evidence.length)}`, '');
  if (evidence.length === 0) lines.push(`_${t.noEvidence}_`, '');
  evidence.forEach((e, i) => {
    const title = input.paperTitle?.(e.paperId);
    const paper = title && title !== e.paperId ? `**${oneLine(title)}** (\`${e.paperId}\`)` : `\`${e.paperId}\``;
    const where = [e.pageNumber !== null ? t.page(e.pageNumber) : null, e.section ? oneLine(e.section) : null].filter(Boolean).join(', ');
    lines.push(`${i + 1}. ${paper}${where ? `, ${where}` : ''}: \`${chunkKey(e.paperId, e.chunkIndex)}\`${e.supportType ? ` (${e.supportType})` : ''}`);
    if (e.content?.trim()) lines.push(`   > ${shortPassage(e.content)}`);
  });
  if (evidence.length > 0) lines.push('');

  lines.push('---', '', `_${t.exported(today())}_`);
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

/** The run itself, request and response as the API returned them, with where it came from. */
export function discoveryToJson(input: DiscoveryExport): string {
  const meta: Record<string, unknown> = {};
  if (input.id) meta.id = input.id;
  if (input.source) meta.source = input.source;
  if (input.url) meta.url = input.url;
  if (input.recordedOn) meta.recordedOn = input.recordedOn;
  return JSON.stringify(
    {
      format: DISCOVERY_EXPORT_FORMAT,
      version: DISCOVERY_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      ...meta,
      request: input.request,
      response: input.response,
    },
    null,
    2,
  );
}

/** "librain-f4-corner-kick-tactic-generation…" */
export function discoveryFileBase(input: Pick<DiscoveryExport, 'request' | 'id'>): string {
  const id = input.id ? `${slugify(input.id)}-` : '';
  return `librain-${id}${slugify(topicLabel(input.request.topicA, input.request.topicB))}`;
}

export function downloadDiscovery(input: DiscoveryExport, format: 'markdown' | 'json', lang: Lang = currentLang()): void {
  const base = discoveryFileBase(input);
  if (format === 'markdown') downloadText(`${base}.md`, discoveryToMarkdown(input, lang), 'text/markdown');
  else downloadText(`${base}.json`, discoveryToJson(input), 'application/json');
}
