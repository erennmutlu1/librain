/*
 * Recorded LIBRAIN runs served in mock mode.
 *
 * Every discovery / baseline fixture is a byte-for-byte copy of a committed
 * output under experiments/ (see `source`). Two are adjusted in code below,
 * each with a `note` saying exactly how, so the UI's rarer states can be seen
 * without a live API:
 *   - a validator-failure run (validationFailed is new on the backend and no
 *     recorded run has it yet);
 *   - a free-text Naive-RAG run with per-citation isResolved flags (the
 *     fabrication-delta experiment stored only the counts).
 * The papers list and the Ask answer are hand-built; see web/README.md.
 */
import type { CompareRequest, DiscoverRequest, MockScenario, QueryRequest } from '../api/types';
import { parseFreeTextCitations } from '../lib/citations';

import discoverAnthropic01 from './fixtures/discover-anthropic-pair-01.json';
import discoverAnthropic02 from './fixtures/discover-anthropic-pair-02.json';
import discoverAnthropic08 from './fixtures/discover-anthropic-pair-08.json';
import discoverAnthropic10 from './fixtures/discover-anthropic-pair-10.json';
import discoverOpenai01 from './fixtures/discover-openai-pair-01.json';
import discoverOpenai03 from './fixtures/discover-openai-pair-03.json';
import discoverOpenai21 from './fixtures/discover-openai-pair-21.json';
import fabricationDeltaFreeText from './fixtures/fabrication-delta-pair-01-free-text-gpt-4o.json';
import naiveRag01 from './fixtures/naive-rag-pair-01.json';
import naiveRag10 from './fixtures/naive-rag-pair-10.json';
import papersFixture from './fixtures/papers.json';
import queryRag from './fixtures/query-rag-hallucination.json';
import singleLlm01 from './fixtures/single-llm-pair-01.json';
import singleLlm10 from './fixtures/single-llm-pair-10.json';

export interface Recorded<Req> extends MockScenario<Req> {
  response: unknown;
}

export const papers: unknown = papersFixture;

// ---------- Ask ----------

export const askScenarios: Recorded<QueryRequest>[] = [
  {
    id: 'rag-hallucination',
    label: 'How does retrieval-augmented generation mitigate hallucination?',
    request: { query: 'How does retrieval-augmented generation mitigate hallucination?', topK: 5 },
    source: 'README.md, "Example query result" (Phase 2 smoke test)',
    note:
      'Scores, confidence and two citations are from the README example; the full answer text, the other two citations, the critique and the passage excerpts were written to complete it. The live API does not return passage text yet.',
    response: queryRag,
  },
];

// ---------- Discover ----------

/** The backend's failure shape: no usable verdicts, aggregate risk pinned to 1.0. */
const validatorFailure = {
  ...discoverAnthropic08,
  claimValidation: { claims: [], aggregateRisk: 1, validationFailed: true },
};

export const discoverScenarios: Recorded<DiscoverRequest>[] = [
  {
    id: 'anthropic-pair-10',
    label: 'Drug discovery × climate adaptation',
    request: { topicA: 'drug discovery', topicB: 'climate adaptation', topK: 5, provider: 'anthropic' },
    source: 'experiments/baseline-comparison/results/librain/pair-10.json',
    response: discoverAnthropic10,
  },
  {
    id: 'anthropic-pair-02',
    label: 'Retrieval-augmented generation × de novo molecular design',
    request: { topicA: 'retrieval-augmented generation', topicB: 'de novo molecular design', topK: 5, provider: 'anthropic' },
    source: 'experiments/baseline-comparison/results/librain/pair-02.json',
    response: discoverAnthropic02,
  },
  {
    id: 'anthropic-pair-01',
    label: 'Large language models × drug-target interaction prediction',
    request: { topicA: 'large language models', topicB: 'drug-target interaction prediction', topK: 5, provider: 'anthropic' },
    source: 'experiments/baseline-comparison/results/librain/pair-01.json',
    response: discoverAnthropic01,
  },
  {
    id: 'openai-pair-21',
    label: 'Graph neural networks × epidemic spread modeling (OpenAI)',
    request: { topicA: 'graph neural networks', topicB: 'epidemic spread modeling', topK: 5, provider: 'openai', model: 'gpt-4o' },
    source: 'experiments/discovery-openai/pair-21.json',
    response: discoverOpenai21,
  },
  {
    id: 'openai-pair-03',
    label: 'Agentic AI × clinical trial design (OpenAI, 1 citation dropped)',
    request: { topicA: 'agentic AI', topicB: 'clinical trial design', topK: 5, provider: 'openai', model: 'gpt-4o-mini' },
    source: 'experiments/discovery-openai/pair-03.json',
    response: discoverOpenai03,
  },
  {
    id: 'openai-pair-01',
    label: 'Large language models × drug-target interaction prediction (OpenAI)',
    request: { topicA: 'large language models', topicB: 'drug-target interaction prediction', topK: 5, provider: 'openai', model: 'gpt-4o-mini' },
    source: 'experiments/discovery-openai/pair-01.json',
    response: discoverOpenai01,
  },
  {
    id: 'validator-failure',
    label: 'Brain-inspired architectures × hypothesis generation (validator failure)',
    request: { topicA: 'brain inspired architectures', topicB: 'hypothesis generation', topK: 5, provider: 'anthropic' },
    source: 'experiments/baseline-comparison/results/librain/pair-08.json',
    note: 'claimValidation replaced with the backend failure shape (no claims, aggregateRisk 1.0, validationFailed true) to preview the warning.',
    response: validatorFailure,
  },
];

// ---------- Compare ----------

/**
 * fabrication-delta stored counts only (claimed 5, resolved 3, fabricated 2).
 * The citations are parsed from the recorded hypothesis exactly as the backend
 * does; the two unresolved ones are assigned to the key cited twice
 * (2504.05496:9), one of the assignments consistent with those counts.
 */
function freeTextNaiveRag(): unknown {
  const unresolvedKey = '2504.05496:9';
  const claimedCitations = parseFreeTextCitations(fabricationDeltaFreeText.hypothesis).map((c) => ({
    paperId: c.paperId,
    chunkIndex: c.chunkIndex ?? -1,
    isResolved: `${c.paperId}:${c.chunkIndex}` !== unresolvedKey,
  }));
  return {
    correlationId: fabricationDeltaFreeText.correlationId,
    hypothesis: fabricationDeltaFreeText.hypothesis,
    retrievedChunkCount: fabricationDeltaFreeText.retrievedChunkCount,
    claimedCitations,
    fabricatedCitationCount: fabricationDeltaFreeText.fabricatedCount,
    // Evaluators were skipped in that experiment, so there are no scores.
  };
}

export interface CompareRecording extends Recorded<CompareRequest> {
  librain: unknown;
  naiveRag: unknown;
  naiveRagSource: string;
  singleLlm: unknown;
}

export const compareScenarios: CompareRecording[] = [
  {
    id: 'pair-10',
    label: 'Drug discovery × climate adaptation',
    request: { topicA: 'drug discovery', topicB: 'climate adaptation', topK: 5, provider: 'anthropic', citationMode: 'structured' },
    source: 'experiments/baseline-comparison/results/{librain,naive-rag,single-llm}/pair-10.json',
    response: null,
    librain: discoverAnthropic10,
    naiveRag: naiveRag10,
    naiveRagSource: 'experiments/baseline-comparison/results/naive-rag/pair-10.json',
    singleLlm: singleLlm10,
  },
  {
    id: 'pair-01',
    label: 'Large language models × drug-target interaction prediction',
    request: { topicA: 'large language models', topicB: 'drug-target interaction prediction', topK: 5, provider: 'anthropic', citationMode: 'structured' },
    source: 'experiments/baseline-comparison/results/{librain,naive-rag,single-llm}/pair-01.json',
    response: null,
    librain: discoverAnthropic01,
    naiveRag: naiveRag01,
    naiveRagSource: 'experiments/baseline-comparison/results/naive-rag/pair-01.json',
    singleLlm: singleLlm01,
  },
  {
    id: 'pair-01-free-text',
    label: 'Large language models × drug-target interaction prediction (free-text citations)',
    request: { topicA: 'large language models', topicB: 'drug-target interaction prediction', topK: 5, provider: 'anthropic', citationMode: 'free-text' },
    source: 'experiments/fabrication-delta/pair-01-probe-aggressive-free-text-gpt-4o-clean.json (Naive-RAG); baseline-comparison pair-01 (others)',
    note:
      'Naive-RAG column comes from the fabrication-delta experiment (gpt-4o, free-text citations, unscored). Per-citation isResolved flags are reconstructed from its recorded counts.',
    response: null,
    librain: discoverAnthropic01,
    naiveRag: freeTextNaiveRag(),
    naiveRagSource: 'experiments/fabrication-delta/pair-01-probe-aggressive-free-text-gpt-4o-clean.json',
    singleLlm: singleLlm01,
  },
];

// ---------- Matching ----------

export function normalizeTopic(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function sameTopics(a: { topicA: string; topicB?: string }, b: { topicA: string; topicB?: string }): boolean {
  const a1 = normalizeTopic(a.topicA);
  const a2 = normalizeTopic(a.topicB);
  const b1 = normalizeTopic(b.topicA);
  const b2 = normalizeTopic(b.topicB);
  return (a1 === b1 && a2 === b2) || (a1 === b2 && a2 === b1);
}

export function findDiscover(request: DiscoverRequest): { scenario: Recorded<DiscoverRequest>; matched: boolean } {
  const provider = request.provider ?? 'anthropic';
  const byTopic = discoverScenarios.filter((s) => sameTopics(s.request, request));
  const exact = byTopic.find((s) => (s.request.provider ?? 'anthropic') === provider);
  const scenario = exact ?? byTopic[0];
  if (scenario) return { scenario, matched: true };
  return { scenario: discoverScenarios[0]!, matched: false };
}

export function findCompare(request: CompareRequest): { scenario: CompareRecording; matched: boolean } {
  const mode = request.citationMode ?? 'structured';
  const byTopic = compareScenarios.filter((s) => sameTopics(s.request, request));
  const exact = byTopic.find((s) => (s.request.citationMode ?? 'structured') === mode);
  const scenario = exact ?? byTopic[0];
  if (scenario) return { scenario, matched: true };
  return { scenario: compareScenarios[0]!, matched: false };
}

export function findAsk(request: QueryRequest): { scenario: Recorded<QueryRequest>; matched: boolean } {
  const q = normalizeTopic(request.query).replace(/[?.!]+$/, '');
  const scenario = askScenarios.find((s) => normalizeTopic(s.request.query).replace(/[?.!]+$/, '') === q);
  return scenario ? { scenario, matched: true } : { scenario: askScenarios[0]!, matched: false };
}
