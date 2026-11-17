import type { ClaimStatus } from '../api/types';

/** Plain-language names for the backend's claim and basis vocabulary. */

export const STATUS_ORDER: ClaimStatus[] = ['grounded', 'extrapolated', 'risky'];

export const STATUS_META: Record<ClaimStatus, { label: string; description: string }> = {
  grounded: {
    label: 'Grounded',
    description: 'Directly supported by at least one retrieved chunk.',
  },
  extrapolated: {
    label: 'Extrapolated',
    description: 'Goes beyond the evidence, but is framed as a hypothesis.',
  },
  risky: {
    label: 'Risky',
    description: 'States a specific fact (mechanism, number, name, attribution) the evidence does not support.',
  },
};

const BASIS_META: Record<string, { label: string; description: string }> = {
  generalization: { label: 'Generalization', description: 'Extends retrieved evidence to a new case.' },
  analogy: { label: 'Analogy', description: 'Transfers a mechanism from a related domain.' },
  pure_speculation: { label: 'Speculation', description: 'Not derivable from the retrieved chunks.' },
};

export function basisMeta(type: string): { label: string; description: string } {
  return (
    BASIS_META[type] ?? {
      label: type.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) || 'Unknown',
      description: 'Basis type reported by the model.',
    }
  );
}

export const SYSTEMS = {
  librain: {
    name: 'LIBRAIN',
    summary:
      'Retrieves evidence for each topic, makes the model cite only retrieved chunks (anything else is dropped), fences speculation into a separate novel claim, then checks that claim sentence by sentence.',
  },
  naiveRag: {
    name: 'Naive-RAG',
    summary:
      'Retrieves the same evidence and asks for cited output in one call, but keeps every citation the model claims, so citations that point outside the retrieved set survive as fabrications.',
  },
  singleLlm: {
    name: 'Single-LLM',
    summary: 'One model call with only the topic names: no retrieval, no citations, no checks. The lower bound.',
  },
} as const;

export type SystemKey = keyof typeof SYSTEMS;
