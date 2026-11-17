/**
 * Types mirroring the LIBRAIN backend DTOs as ASP.NET serialises them
 * (camelCase). Source records, for anyone updating these:
 *
 *   PaperSummary            LIBRAIN/Storage/PaperSummary.cs
 *   IngestResult            LIBRAIN/Agents/IngestResult.cs
 *   QueryRequest/Response   LIBRAIN/Endpoints/QueryEndpoints.cs
 *   SynthesisCitation       LIBRAIN/Agents/SynthesisResult.cs
 *   Discover*               LIBRAIN/Endpoints/DiscoveryEndpoints.cs
 *   ClaimValidation*        LIBRAIN/Agents/ClaimValidation.cs
 *   NaiveRag*, SingleLlm*   LIBRAIN/Endpoints/BaselineEndpoints.cs
 *   ClaimedCitation         LIBRAIN/Agents/NaiveRagAgent.cs
 *
 * These are the *normalised* shapes the UI renders. Wire payloads go through
 * `normalize.ts`, which fills defaults for fields that older recorded runs
 * lack and converts the ClaimFactualityStatus enum (serialised as a number
 * because the API has no JsonStringEnumConverter) into a string union.
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
}

export interface IngestResult {
  paperId: string;
  chunkCount: number;
  correlationId: Guid;
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
  /** Not returned by the API yet. Rendered as an excerpt when present. */
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

export interface DiscoverRequest {
  topicA: string;
  topicB?: string;
  topK?: number;
  provider?: Provider;
  /** OpenAI model id; only used when provider is "openai" (API default gpt-4o). */
  model?: string;
}

export interface SupportingEvidence {
  paperId: string;
  chunkIndex: number;
  section: string | null;
  pageNumber: number | null;
  /** "direct" or "analogous" in recorded runs. */
  supportType: string;
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
  /**
   * Being added on the backend: true when the validator produced nothing
   * usable. aggregateRisk is then 1.0. Absent on older payloads.
   */
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

// ---------- UI composite (not an endpoint) ----------

/** One topic pair run through all three systems on the Compare screen. */
export interface CompareRequest {
  topicA: string;
  topicB?: string;
  topK?: number;
  /** Applies to LIBRAIN only; the baselines always use the API's default model. */
  provider?: Provider;
  citationMode?: CitationMode;
}

// ---------- Mock catalogue (mock mode only) ----------

export interface MockScenario<Req> {
  id: string;
  label: string;
  request: Req;
  /** Repo path of the recorded output this scenario serves. */
  source: string;
  /** Present when the fixture was altered or reconstructed; says how. */
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
  query(request: QueryRequest, signal?: AbortSignal): Promise<QueryResponse>;
  discover(request: DiscoverRequest, signal?: AbortSignal): Promise<DiscoverResponse>;
  naiveRag(request: NaiveRagRequest, signal?: AbortSignal): Promise<NaiveRagResponse>;
  singleLlm(request: SingleLlmRequest, signal?: AbortSignal): Promise<SingleLlmResponse>;
}
