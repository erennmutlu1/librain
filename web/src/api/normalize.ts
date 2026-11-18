import { ApiError } from './errors';
import type {
  CompareOutcome,
  CompareRequest,
  CompareResponse,
  DiscoverRequest,
  NaiveRagRequest,
  ProgressEvent,
  Provider,
  QueryRequest,
  RunDetail,
  RunKind,
  RunSummary,
  SingleLlmRequest,
  ClaimStatus,
  ClaimValidationEntry,
  ClaimValidationResult,
  ClaimedCitation,
  DiscoverResponse,
  DiscoveryEvaluation,
  EvaluationSummary,
  ExtrapolationBasis,
  HealthResponse,
  IngestResult,
  NaiveRagResponse,
  PaperSummary,
  QueryResponse,
  SingleLlmResponse,
  SupportingEvidence,
  SynthesisCitation,
} from './types';

/*
 * Wire -> UI normalisation. Every payload is treated as `unknown` and coerced
 * field by field, so a recorded run that predates a field, or a backend that
 * adds one, never crashes a screen. Missing scalars become explicit
 * null/undefined (never a made-up 0) so the UI can say "not recorded".
 */

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function numOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function num(value: unknown, fallback = 0): number {
  return numOrNull(value) ?? fallback;
}

function optNum(value: unknown): number | undefined {
  return numOrNull(value) ?? undefined;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strArr(value: unknown): string[] {
  return arr(value).filter((v): v is string => typeof v === 'string');
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function requireRecord(value: unknown, what: string): Rec {
  if (!isRecord(value)) {
    throw new ApiError({ kind: 'parse', title: 'Unexpected response', detail: `Expected ${what} to be a JSON object.` });
  }
  return value;
}

/**
 * ClaimFactualityStatus arrives as a number (Grounded=0, Extrapolated=1,
 * Risky=2) because the API registers no JsonStringEnumConverter. Strings are
 * accepted too in case one is added. Anything unrecognised maps to
 * "extrapolated", matching ClaimValidationScoring.ParseStatus on the backend.
 */
export function parseClaimStatus(raw: unknown): ClaimStatus {
  if (typeof raw === 'number') {
    if (raw === 0) return 'grounded';
    if (raw === 2) return 'risky';
    return 'extrapolated';
  }
  if (typeof raw === 'string') {
    const s = raw.trim().toUpperCase();
    if (s === 'GROUNDED' || s === '0') return 'grounded';
    if (s === 'RISKY' || s === '2') return 'risky';
    return 'extrapolated';
  }
  return 'extrapolated';
}

export function normalizeHealth(raw: unknown): HealthResponse {
  const r = requireRecord(raw, 'the health response');
  return { status: str(r.status, 'unknown') };
}

export function normalizePaper(raw: unknown): PaperSummary | null {
  if (!isRecord(raw) || typeof raw.paperId !== 'string') return null;
  const authors = Array.isArray(raw.authors) ? strArr(raw.authors).filter((a) => a.trim() !== '') : null;
  const year = numOrNull(raw.year);
  return {
    paperId: raw.paperId,
    title: strOrNull(raw.title),
    chunkCount: num(raw.chunkCount),
    firstIngestedAt: strOrNull(raw.firstIngestedAt),
    authors: authors && authors.length > 0 ? authors : null,
    year: year !== null && Number.isInteger(year) ? year : null,
  };
}

export function normalizePapers(raw: unknown): PaperSummary[] {
  if (!Array.isArray(raw)) {
    throw new ApiError({ kind: 'parse', title: 'Unexpected response', detail: 'Expected a list of papers.' });
  }
  return raw.map(normalizePaper).filter((p): p is PaperSummary => p !== null);
}

export function normalizeIngest(raw: unknown): IngestResult {
  const r = requireRecord(raw, 'the ingest result');
  return {
    paperId: str(r.paperId),
    chunkCount: num(r.chunkCount),
    correlationId: str(r.correlationId),
    title: strOrNull(r.title),
  };
}

function normalizeSynthesisCitation(raw: unknown): SynthesisCitation | null {
  if (!isRecord(raw)) return null;
  const index = numOrNull(raw.index);
  if (index === null) return null;
  const citation: SynthesisCitation = {
    index,
    paperId: str(raw.paperId),
    chunkIndex: num(raw.chunkIndex),
    section: strOrNull(raw.section),
    pageNumber: numOrNull(raw.pageNumber),
  };
  if (typeof raw.content === 'string' && raw.content.trim() !== '') citation.content = raw.content;
  return citation;
}

function normalizeEvaluationSummary(raw: unknown): EvaluationSummary | null {
  if (!isRecord(raw)) return null;
  return {
    qualityScore: num(raw.qualityScore),
    groundednessScore: num(raw.groundednessScore),
    relevanceScore: num(raw.relevanceScore),
    completenessScore: num(raw.completenessScore),
    critique: str(raw.critique),
    unsupportedClaims: strArr(raw.unsupportedClaims),
    missingEvidence: strArr(raw.missingEvidence),
  };
}

export function normalizeQueryResponse(raw: unknown): QueryResponse {
  const r = requireRecord(raw, 'the query response');
  return {
    correlationId: str(r.correlationId),
    hypothesis: str(r.hypothesis),
    citations: arr(r.citations)
      .map(normalizeSynthesisCitation)
      .filter((c): c is SynthesisCitation => c !== null),
    synthesisConfidence: numOrNull(r.synthesisConfidence),
    evaluation: normalizeEvaluationSummary(r.evaluation),
  };
}

export function normalizeDiscoveryEvaluation(raw: unknown): DiscoveryEvaluation | null {
  if (!isRecord(raw)) return null;
  return {
    noveltyScore: num(raw.noveltyScore),
    plausibilityScore: num(raw.plausibilityScore),
    structuralCoherenceScore: num(raw.structuralCoherenceScore),
    qualityScore: num(raw.qualityScore),
  };
}

function normalizeEvidence(raw: unknown): SupportingEvidence | null {
  if (!isRecord(raw) || typeof raw.paperId !== 'string') return null;
  const evidence: SupportingEvidence = {
    paperId: raw.paperId,
    chunkIndex: num(raw.chunkIndex),
    section: strOrNull(raw.section),
    pageNumber: numOrNull(raw.pageNumber),
    supportType: str(raw.supportType, 'direct'),
  };
  if (typeof raw.content === 'string' && raw.content.trim() !== '') evidence.content = raw.content;
  return evidence;
}

function normalizeBasis(raw: unknown): ExtrapolationBasis | null {
  if (!isRecord(raw)) return null;
  return {
    claimSentence: str(raw.claimSentence),
    basisType: str(raw.basisType, 'unknown'),
    groundedInChunkId: strOrNull(raw.groundedInChunkId),
    rationale: str(raw.rationale),
  };
}

function normalizeClaimEntry(raw: unknown): ClaimValidationEntry | null {
  if (!isRecord(raw)) return null;
  return {
    sentence: str(raw.sentence),
    status: parseClaimStatus(raw.status),
    supportingChunks: strArr(raw.supportingChunks),
    factualHallucinationProbability: clamp01(num(raw.factualHallucinationProbability)),
    rationale: str(raw.rationale),
  };
}

export function normalizeClaimValidation(raw: unknown): ClaimValidationResult | null {
  if (!isRecord(raw)) return null;
  const result: ClaimValidationResult = {
    claims: arr(raw.claims)
      .map(normalizeClaimEntry)
      .filter((c): c is ClaimValidationEntry => c !== null),
    aggregateRisk: clamp01(num(raw.aggregateRisk)),
  };
  if (typeof raw.validationFailed === 'boolean') result.validationFailed = raw.validationFailed;
  return result;
}

export function normalizeDiscoverResponse(raw: unknown): DiscoverResponse {
  const r = requireRecord(raw, 'the discovery response');
  const response: DiscoverResponse = {
    correlationId: str(r.correlationId),
    hypothesis: str(r.hypothesis),
    supportingEvidence: arr(r.supportingEvidence)
      .map(normalizeEvidence)
      .filter((e): e is SupportingEvidence => e !== null),
    novelClaim: str(r.novelClaim),
    extrapolationBasis: arr(r.extrapolationBasis)
      .map(normalizeBasis)
      .filter((b): b is ExtrapolationBasis => b !== null),
    claimValidation: normalizeClaimValidation(r.claimValidation),
    reasoning: str(r.reasoning),
    evaluation: normalizeDiscoveryEvaluation(r.evaluation),
  };
  const claimed = optNum(r.claimedEvidenceCount);
  const dropped = optNum(r.droppedEvidenceCount);
  if (claimed !== undefined) response.claimedEvidenceCount = claimed;
  if (dropped !== undefined) response.droppedEvidenceCount = dropped;
  return response;
}

function normalizeClaimedCitation(raw: unknown): ClaimedCitation | null {
  if (!isRecord(raw) || typeof raw.paperId !== 'string') return null;
  const chunk = numOrNull(raw.chunkIndex);
  return {
    paperId: raw.paperId,
    // Free-text citations that name only a paper are serialised with -1.
    chunkIndex: chunk === null || chunk < 0 ? null : chunk,
    // Absent means the backend did not resolve it; treat as unverified, not fabricated.
    isResolved: raw.isResolved !== false,
  };
}

function withRunStats<T extends object>(target: T, r: Rec): T {
  const stats: Record<string, number> = {};
  for (const key of ['totalElapsedMs', 'inputTokens', 'outputTokens'] as const) {
    const value = optNum(r[key]);
    if (value !== undefined) stats[key] = value;
  }
  return Object.assign(target, stats);
}

export function normalizeNaiveRag(raw: unknown): NaiveRagResponse {
  const r = requireRecord(raw, 'the Naive-RAG response');
  const claimedCitations = arr(r.claimedCitations)
    .map(normalizeClaimedCitation)
    .filter((c): c is ClaimedCitation => c !== null);
  const response: NaiveRagResponse = {
    correlationId: str(r.correlationId),
    hypothesis: str(r.hypothesis),
    claimedCitations,
    fabricatedCitationCount: num(
      r.fabricatedCitationCount,
      claimedCitations.filter((c) => !c.isResolved).length,
    ),
    evaluation: normalizeDiscoveryEvaluation(r.evaluation),
  };
  const retrieved = optNum(r.retrievedChunkCount);
  if (retrieved !== undefined) response.retrievedChunkCount = retrieved;
  return withRunStats(response, r);
}

export function normalizeSingleLlm(raw: unknown): SingleLlmResponse {
  const r = requireRecord(raw, 'the Single-LLM response');
  return withRunStats(
    {
      correlationId: str(r.correlationId),
      hypothesis: str(r.hypothesis),
      evaluation: normalizeDiscoveryEvaluation(r.evaluation),
    } satisfies SingleLlmResponse,
    r,
  );
}

// ---------- /api/compare ----------

function normalizeOutcome<T>(raw: unknown, normalize: (value: unknown) => T): CompareOutcome<T> {
  const r = isRecord(raw) ? raw : {};
  let result: T | null = null;
  let error = strOrNull(r.error);
  // `{ ok, value }` is how the first UI pass stored outcomes locally.
  const value = r.result !== undefined ? r.result : r.ok === true ? r.value : undefined;
  if (value !== null && value !== undefined) {
    try {
      result = normalize(value);
    } catch {
      error = error ?? 'The result could not be read.';
    }
  }
  if (result === null && error === null) error = 'No result was returned.';
  return { result, error, correlationId: strOrNull(r.correlationId) ?? (result as { correlationId?: string } | null)?.correlationId ?? null };
}

export function normalizeCompareResponse(raw: unknown): CompareResponse {
  const r = requireRecord(raw, 'the compare response');
  const response: CompareResponse = {
    correlationId: str(r.correlationId),
    topicA: str(r.topicA),
    topicB: strOrNull(r.topicB),
    topK: num(r.topK, 5),
    librain: normalizeOutcome(r.librain, normalizeDiscoverResponse),
    naiveRag: normalizeOutcome(r.naiveRag, normalizeNaiveRag),
    singleLlm: normalizeOutcome(r.singleLlm, normalizeSingleLlm),
  };
  const elapsed = optNum(r.totalElapsedMs);
  if (elapsed !== undefined) response.totalElapsedMs = elapsed;
  return response;
}

// ---------- Streaming ----------

export function normalizeProgress(raw: unknown): ProgressEvent {
  const r = isRecord(raw) ? raw : {};
  return { stage: str(r.stage, 'working'), message: str(r.message), count: numOrNull(r.count) };
}

// ---------- /api/runs ----------

const KIND_ALIASES: Record<string, RunKind> = {
  query: 'query',
  ask: 'query',
  discover: 'discover',
  compare: 'compare',
  'naive-rag': 'naive-rag',
  'single-llm': 'single-llm',
};

export function parseRunKind(raw: unknown): RunKind | null {
  return typeof raw === 'string' ? (KIND_ALIASES[raw.trim().toLowerCase()] ?? null) : null;
}

export function normalizeRunSummary(raw: unknown): RunSummary | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  const kind = parseRunKind(raw.kind);
  if (!kind) return null;
  return {
    id: raw.id,
    kind,
    title: str(raw.title, str(raw.label)),
    createdAt: str(raw.createdAt),
    quality: numOrNull(raw.quality),
  };
}

export function normalizeRunSummaries(raw: unknown): RunSummary[] {
  if (!Array.isArray(raw)) {
    throw new ApiError({ kind: 'parse', title: 'Unexpected response', detail: 'Expected a list of runs.' });
  }
  return raw.map(normalizeRunSummary).filter((r): r is RunSummary => r !== null);
}

function optStr(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function optInt(value: unknown): number | undefined {
  const n = numOrNull(value);
  return n === null ? undefined : n;
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

function topicsRequest(r: Rec): { topicA: string; topicB?: string; topK?: number } {
  return compact({ topicA: str(r.topicA), topicB: optStr(r.topicB), topK: optInt(r.topK) });
}

function normalizeProvider(value: unknown): Provider | undefined {
  return value === 'openai' || value === 'anthropic' ? value : undefined;
}

export function normalizeQueryRequest(raw: unknown): QueryRequest {
  const r = isRecord(raw) ? raw : {};
  return compact({ query: str(r.query), topK: optInt(r.topK) });
}

export function normalizeDiscoverRequest(raw: unknown): DiscoverRequest {
  const r = isRecord(raw) ? raw : {};
  const model = r.model === 'gpt-4o' || r.model === 'gpt-4o-mini' ? r.model : undefined;
  return compact({ ...topicsRequest(r), provider: normalizeProvider(r.provider), model });
}

export function normalizeCompareRequest(raw: unknown): CompareRequest {
  return topicsRequest(isRecord(raw) ? raw : {});
}

export function normalizeNaiveRagRequest(raw: unknown): NaiveRagRequest {
  const r = isRecord(raw) ? raw : {};
  const mode = r.citationMode === 'free-text' || r.citationMode === 'structured' ? r.citationMode : undefined;
  return compact({ ...topicsRequest(r), citationMode: mode });
}

export function normalizeSingleLlmRequest(raw: unknown): SingleLlmRequest {
  const r = isRecord(raw) ? raw : {};
  return compact({ topicA: str(r.topicA), topicB: optStr(r.topicB) });
}

/**
 * A saved run with request and response (GET /api/runs/{id}, or a record from
 * the browser store). Accepts `response` or the first UI pass's `result`, and
 * the old "ask" kind, so locally stored runs keep rendering.
 */
export function normalizeRunDetail(raw: unknown): RunDetail {
  const r = requireRecord(raw, 'the run');
  const summary = normalizeRunSummary(r);
  if (!summary) throw new ApiError({ kind: 'parse', title: 'Unexpected response', detail: 'The run has no id or an unknown kind.' });
  const body = r.response !== undefined ? r.response : r.result;
  const base = r.mock === true ? { ...summary, mock: true } : summary;
  switch (summary.kind) {
    case 'query':
      return { ...base, kind: 'query', request: normalizeQueryRequest(r.request), response: normalizeQueryResponse(body) };
    case 'discover':
      return { ...base, kind: 'discover', request: normalizeDiscoverRequest(r.request), response: normalizeDiscoverResponse(body) };
    case 'compare':
      return { ...base, kind: 'compare', request: normalizeCompareRequest(r.request), response: normalizeCompareResponse(body) };
    case 'naive-rag':
      return { ...base, kind: 'naive-rag', request: normalizeNaiveRagRequest(r.request), response: normalizeNaiveRag(body) };
    case 'single-llm':
      return { ...base, kind: 'single-llm', request: normalizeSingleLlmRequest(r.request), response: normalizeSingleLlm(body) };
  }
}
