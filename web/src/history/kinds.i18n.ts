import type { RunKind } from '../api/types';
import { strings } from '../i18n/lang';

/** Run kinds as the History screen and the exports name them. */
export const kindText = strings<Record<RunKind, string>>({
  en: { query: 'Ask', discover: 'Discover', compare: 'Compare', 'naive-rag': 'Naive-RAG', 'single-llm': 'Single-LLM' },
  tr: { query: 'Sor', discover: 'Keşfet', compare: 'Karşılaştır', 'naive-rag': 'Naive-RAG', 'single-llm': 'Single-LLM' },
});
