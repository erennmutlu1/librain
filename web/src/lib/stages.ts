import type { ProgressEvent } from '../api/types';
import { currentLang, pick, type Lang } from '../i18n/lang';
import { text } from './stages.i18n';

/** A progress event with the time it arrived. */
export interface TimedProgress extends ProgressEvent {
  at: number;
}

type Pipeline = 'discover' | 'query';

export interface StageDef {
  key: string;
  pipeline?: Pipeline;
  /** The label in the current language (components pass `lang` to buildSteps instead). */
  readonly label: string;
}

function stage(pipeline: Pipeline, key: string): StageDef {
  return {
    key,
    pipeline,
    get label() {
      return stageLabel(key, pipeline);
    },
  };
}

/** A stage's label; unknown stage names from a newer backend are prettified. */
export function stageLabel(key: string, pipeline: Pipeline | undefined, lang: Lang = currentLang()): string {
  const t = pick(text, lang);
  const known = (pipeline ? t[pipeline][key] : undefined) ?? t.extra[key];
  return known ?? key.replace(/[-_]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** The stage names emitted by DiscoveryAgent (LIBRAIN/Pipelines/PipelineProgress.cs). */
export const DISCOVER_STAGES: StageDef[] = ['retrieving', 'retrieved', 'generating', 'validated', 'scoring'].map((k) => stage('discover', k));

/** The stage names emitted by QueryPipeline. */
export const QUERY_STAGES: StageDef[] = ['retrieving', 'retrieved', 'generating', 'validated', 'evaluating'].map((k) => stage('query', k));

export type StepStatus = 'done' | 'active' | 'pending';

export interface Step {
  key: string;
  label: string;
  status: StepStatus;
  /** The server's message for this stage, when it reported one. */
  message: string | null;
  count: number | null;
  /** When the stage was reported. */
  at: number | null;
  /** Time until the next reported stage (or until `now` while active). */
  durationMs: number | null;
}

/**
 * Folds the received events into a fixed list of steps. The latest reported
 * stage is active; everything before it is done (including stages the server
 * skipped, such as the OpenAI path, which reports only "generating"). Unknown
 * stage names are appended, so a newer backend never breaks the stepper.
 */
export function buildSteps(defs: readonly StageDef[], events: readonly TimedProgress[], now: number, finished = false, lang: Lang = currentLang()): Step[] {
  const all: StageDef[] = [...defs];
  for (const e of events) {
    if (!all.some((d) => d.key === e.stage)) all.push({ key: e.stage, label: stageLabel(e.stage, undefined, lang) });
  }
  const latest = new Map<string, TimedProgress>();
  for (const e of events) latest.set(e.stage, e);

  let reached = -1;
  all.forEach((d, i) => {
    if (latest.has(d.key)) reached = Math.max(reached, i);
  });

  const reportTimes = all
    .map((d) => latest.get(d.key)?.at ?? null)
    .map((t, i) => ({ t, i }))
    .filter((x): x is { t: number; i: number } => x.t !== null);

  return all.map((d, i) => {
    const e = latest.get(d.key) ?? null;
    const status: StepStatus = finished || i < reached ? 'done' : i === reached ? 'active' : 'pending';
    let durationMs: number | null = null;
    if (e) {
      const next = reportTimes.find((x) => x.i > i);
      durationMs = (next ? next.t : status === 'active' || finished ? now : e.at) - e.at;
    }
    return { key: d.key, label: d.pipeline ? stageLabel(d.key, d.pipeline, lang) : d.label, status, message: e?.message ?? null, count: e?.count ?? null, at: e?.at ?? null, durationMs };
  });
}

/**
 * The server words its progress messages in English. The ones this client
 * knows are shown in the interface language; anything else is shown as sent.
 */
export function progressMessage(message: string, lang: Lang = currentLang()): string {
  if (lang === 'en') return message;
  for (const [pattern, render] of PROGRESS_TR) {
    const m = pattern.exec(message);
    if (m) return render(m);
  }
  return message;
}

const PROGRESS_TR: [RegExp, (m: RegExpExecArray) => string][] = [
  [/^Searching the corpus for both topics$/, () => 'Derlemde her iki konu aranıyor'],
  [/^Searching the corpus$/, () => 'Derlemde aranıyor'],
  [/^Found (\d+) distinct passages$/, (m) => `${m[1]} farklı pasaj bulundu`],
  [/^Found (\d+) passages$/, (m) => `${m[1]} pasaj bulundu`],
  [/^Asking Claude for a hypothesis that goes beyond the sources$/, () => 'Claude\'dan kaynakların ötesine geçen bir hipotez isteniyor'],
  [/^Writing a citation-grounded answer$/, () => 'Atıf dayanaklı bir yanıt yazılıyor'],
  [/^(\d+) citation\(s\) resolved to retrieved passages$/, (m) => `${m[1]} atıf getirilen pasajlarla eşleşti`],
  [/^Citation contract kept (\d+) of (\d+) cited sources$/, (m) => `Atıf sözleşmesi, atıf yapılan ${m[2]} kaynaktan ${m[1]} tanesini tuttu`],
  [/^Scoring novelty, plausibility and per-sentence claim risk$/, () => 'Özgünlük, akla yatkınlık ve cümle başına iddia riski puanlanıyor'],
  [/^Judging groundedness, relevance and completeness$/, () => 'Dayanaklılık, alaka ve bütünlük değerlendiriliyor'],
  [/^Re-ranking passages$/, () => 'Pasajlar yeniden sıralanıyor'],
];
