import type { RunKind } from '../api/types';
import { strings } from '../i18n/lang';

/** Run kinds as the History screens and the exports name them (the nav's names; baselines as the glossary words them). */
export const kindText = strings<Record<RunKind, string>>({
  en: { query: 'Ask', discover: 'New idea', compare: 'Compare', 'naive-rag': 'Naive RAG', 'single-llm': 'Single LLM' },
  tr: { query: 'Sor', discover: 'Yeni fikir', compare: 'Karşılaştır', 'naive-rag': 'Basit RAG', 'single-llm': 'Tek model' },
});
