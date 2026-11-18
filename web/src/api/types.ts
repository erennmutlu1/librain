/**
 * Types mirroring the LIBRAIN backend DTOs as ASP.NET serialises them
 * (camelCase). Source records, for anyone updating these:
 *
 *   PaperSummary            LIBRAIN/Storage/PaperSummary.cs
 *   IngestResult            LIBRAIN/Agents/IngestResult.cs
 *   ArxivIngestRequest      LIBRAIN/Endpoints/PaperEndpoints.cs
 *   QueryRequest/Response   LIBRAIN/Endpoints/QueryEndpoints.cs
 *   SynthesisCitation       LIBRAIN/Agents/SynthesisResult.cs
 *   Discover*               LIBRAIN/Endpoints/DiscoveryEndpoints.cs
 *   ClaimValidation*        LIBRAIN/Agents/ClaimValidation.cs
 *   NaiveRag*, SingleLlm*   LIBRAIN/Endpoints/BaselineEndpoints.cs
 *   ClaimedCitation         LIBRAIN/Agents/NaiveRagAgent.cs
 *   Compare*                LIBRAIN/Endpoints/CompareEndpoints.cs
 *   PipelineProgress        LIBRAIN/Pipelines/PipelineProgress.cs
 *   StreamError             LIBRAIN/Endpoints/StreamingEndpoints.cs
 *   RunSummary, RunRecord   LIBRAIN/Runs/RunStore.cs
 *
 * Every shape is pinned by the captured snapshots in src/mocks/contract/ and
 * the contract tests that parse them. These are the *normalised* shapes the UI
 * renders: wire payloads go through `normalize.ts`, which fills defaults for
 * fields that older recorded runs lack and converts the ClaimFactualityStatus
 * enum (serialised as a number) into a string union.
 */

export type Guid = string;

export interface HealthResponse {
  status: string;
}

export interface PaperSummary {
  paperId: string;
  /** Null for legacy chunks; equals paperId when the PDF had no title metadata. */
  title: string | null;
  chunkCount: number;
  /** ISO timestamp, or null when no chunk carried an ingest time. */
  firstIngestedAt: string | null;
  /** From the arXiv API for arXiv ingests; null for most uploaded PDFs. */
  authors: string[] | null;
  year: number | null;
}

export interface IngestResult {
  paperId: string;
  chunkCount: number;
  correlationId: Guid;
  title: string | null;
}

// ---------- /api/query ----------

export interface QueryRequest {
  query: string;
  topK?: number;
}

export interface SynthesisCitation {
  /** 1-based index into the retrieved sources; matches [n] markers in the text. */
  index: number;
  paperId: string;
  chunkIndex: number;
  section: string | null;
  pageNumber: number | null;
  /** The cited passage text. */
  content?: string | null;
}

export interface EvaluationSummary {
  qualityScore: number;
  groundednessScore: number;
  relevanceScore: number;
  completenessScore: number;
  critique: string;
  unsupportedClaims: string[];
  missingEvidence: string[];
}

export interface QueryResponse {
  correlationId: Guid;
  hypothesis: string;
  citations: SynthesisCitation[];
  synthesisConfidence: number | null;
  /** Always present from the live API; null only if a payload omits it. */
  evaluation: EvaluationSummary | null;
}

// ---------- /api/discover ----------

export type Provider = 'anthropic' | 'openai';

/** The only models /api/discover accepts with provider "openai". */
export const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini'] as const;
export type OpenAiModel = (typeof OPENAI_MODELS)[number];

export const MAX_TOPIC_CHARS = 500;
export const MAX_QUERY_CHARS = 2000;

export interface DiscoverRequest {
  topicA: string;
  topicB?: string;
  topK?: number;
  provider?: Provider;
  /** Only used when provider is "openai" (API default gpt-4o). */
  model?: OpenAiModel;
}

export interface SupportingEvidence {
  paperId: string;
  chunkIndex: number;
  section: string | null;
  pageNumber: number | null;
  /** "direct", "analogous" or "analogy" in recorded runs. */
  supportType: string;
  /** The passage text. */
  content?: string | null;
}

/** "generalization" | "analogy" | "pure_speculation" per the Discovery prompt. */
export type BasisType = string;

export interface ExtrapolationBasis {
  claimSentence: string;
  basisType: BasisType;
  /** "paperId:chunkIndex", or null for pure speculation. */
  groundedInChunkId: string | null;
  rationale: string;
}

export type ClaimStatus = 'grounded' | 'extrapolated' | 'risky';

export interface ClaimValidationEntry {
  sentence: string;
  status: ClaimStatus;
  /** "paperId:chunkIndex" keys, already filtered to the retrieved set. */
  supportingChunks: string[];
  factualHallucinationProbability: number;
  rationale: string;
}

export interface ClaimValidationResult {
  claims: ClaimValidationEntry[];
  aggregateRisk: number;
  /** True when the validator produced nothing usable (aggregateRisk is then 1.0). */
  validationFailed?: boolean;
}

export interface DiscoveryEvaluation {
  noveltyScore: number;
  plausibilityScore: number;
  structuralCoherenceScore: number;
  qualityScore: number;
}

export interface DiscoverResponse {
  correlationId: Guid;
  hypothesis: string;
  supportingEvidence: SupportingEvidence[];
  novelClaim: string;
  extrapolationBasis: ExtrapolationBasis[];
  /** Null only if a payload omits it entirely. */
  claimValidation: ClaimValidationResult | null;
  reasoning: string;
  evaluation: DiscoveryEvaluation | null;
  /** Undefined when the run predates the citation-contract counters. */
  claimedEvidenceCount?: number;
  droppedEvidenceCount?: number;
}

// ---------- Baselines ----------

export type CitationMode = 'structured' | 'free-text';

export interface NaiveRagRequest {
  topicA: string;
  topicB?: string;
  topK?: number;
  citationMode?: CitationMode;
}

export interface ClaimedCitation {
  paperId: string;
  /** Null for free-text citations that named a paper without a chunk. */
  chunkIndex: number | null;
  isResolved: boolean;
}

export interface NaiveRagResponse {
  correlationId: Guid;
  hypothesis: string;
  retrievedChunkCount?: number;
  claimedCitations: ClaimedCitation[];
  fabricatedCitationCount: number;
  evaluation: DiscoveryEvaluation | null;
  totalElapsedMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface SingleLlmRequest {
  topicA: string;
  topicB?: string;
}

export interface SingleLlmResponse {
  correlationId: Guid;
  hypothesis: string;
  evaluation: DiscoveryEvaluation | null;
  totalElapsedMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

// ---------- /api/compare ----------

export interface CompareRequest {
  topicA: string;
  topicB?: string;
  topK?: number;
}

/** One system's outcome: exactly one of result / error is set. */
export interface CompareOutcome<T> {
  result: T | null;
  error: string | null;
  /** Present on every outcome, so a failed system can be looked up in the logs. */
  correlationId: Guid | null;
}

export interface CompareResponse {
  correlationId: Guid;
  topicA: string;
  topicB: string | null;
  topK: number;
  librain: CompareOutcome<DiscoverResponse>;
  naiveRag: CompareOutcome<NaiveRagResponse>;
  singleLlm: CompareOutcome<SingleLlmResponse>;
  /** Undefined for recordings assembled from separate experiment outputs. */
  totalElapsedMs?: number;
}

// ---------- Streaming ----------

/** One `event: progress` from /api/query/stream or /api/discover/stream. */
export interface ProgressEvent {
  stage: string;
  message: string;
  count: number | null;
}

export type ProgressListener = (event: ProgressEvent) => void;

// ---------- /api/runs ----------

export const RUN_KINDS = ['query', 'discover', 'compare', 'naive-rag', 'single-llm'] as const;
export type RunKind = (typeof RUN_KINDS)[number];

export interface RunSummary {
  /** Equals the response's correlationId. */
  id: Guid;
  kind: RunKind;
  title: string;
  createdAt: string;
  quality: number | null;
}

interface RunDetailBase extends RunSummary {
  /** True when the run was answered from fixtures (mock mode) rather than the API. */
  mock?: boolean;
}

export type QueryRun = RunDetailBase & { kind: 'query'; request: QueryRequest; response: QueryResponse };
export type DiscoverRun = RunDetailBase & { kind: 'discover'; request: DiscoverRequest; response: DiscoverResponse };
export type CompareRun = RunDetailBase & { kind: 'compare'; request: CompareRequest; response: CompareResponse };
export type NaiveRagRun = RunDetailBase & { kind: 'naive-rag'; request: NaiveRagRequest; response: NaiveRagResponse };
export type SingleLlmRun = RunDetailBase & { kind: 'single-llm'; request: SingleLlmRequest; response: SingleLlmResponse };

/** A saved run with its request and response, as GET /api/runs/{id} returns it. */
export type RunDetail = QueryRun | DiscoverRun | CompareRun | NaiveRagRun | SingleLlmRun;

// ---------- Mock catalogue (mock mode only) ----------

export interface MockScenario<Req> {
  id: string;
  label: string;
  request: Req;
  /** Repo path of the recorded output this scenario serves. */
  source: string;
  /** Present when the recording is assembled or replayed with synthetic timing; says how. */
  note?: string;
}

export interface MockMatch {
  /** False when no recording matches and a default recording is served instead. */
  matched: boolean;
  label: string;
  source: string;
  note?: string;
}

export interface MockCatalog {
  ask: MockScenario<QueryRequest>[];
  discover: MockScenario<DiscoverRequest>[];
  compare: MockScenario<CompareRequest>[];
  matchAsk(request: QueryRequest): MockMatch;
  matchDiscover(request: DiscoverRequest): MockMatch;
  matchCompare(request: CompareRequest): MockMatch;
}

// ---------- Client ----------

export interface IngestOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export interface LibrainApi {
  readonly mode: 'mock' | 'live';
  /** Recorded runs and match info; only the mock client provides it. */
  readonly mock?: MockCatalog;
  health(signal?: AbortSignal): Promise<HealthResponse>;

  listPapers(signal?: AbortSignal): Promise<PaperSummary[]>;
  ingestPaper(file: File, options?: IngestOptions): Promise<IngestResult>;
  ingestArxiv(arxivId: string, signal?: AbortSignal): Promise<IngestResult>;
  deletePaper(paperId: string, signal?: AbortSignal): Promise<void>;

  query(request: QueryRequest, signal?: AbortSignal): Promise<QueryResponse>;
  queryStream(request: QueryRequest, onProgress: ProgressListener, signal?: AbortSignal): Promise<QueryResponse>;
  discover(request: DiscoverRequest, signal?: AbortSignal): Promise<DiscoverResponse>;
  discoverStream(request: DiscoverRequest, onProgress: ProgressListener, signal?: AbortSignal): Promise<DiscoverResponse>;
  naiveRag(request: NaiveRagRequest, signal?: AbortSignal): Promise<NaiveRagResponse>;
  singleLlm(request: SingleLlmRequest, signal?: AbortSignal): Promise<SingleLlmResponse>;
  compare(request: CompareRequest, signal?: AbortSignal): Promise<CompareResponse>;

  listRuns(filter?: { kind?: RunKind; limit?: number }, signal?: AbortSignal): Promise<RunSummary[]>;
  getRun(id: string, signal?: AbortSignal): Promise<RunDetail>;
  deleteRun(id: string, signal?: AbortSignal): Promise<void>;
}
