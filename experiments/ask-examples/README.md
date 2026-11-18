# Ask examples (recorded 18 November 2026)

Five real `/api/query` runs, recorded so the public demo's Recorded mode can show Ask
without anyone's API keys. Web copies (byte-identical) live in `web/src/mocks/ask/`;
Turkish overlays of the answer and the evaluator's notes in `web/src/i18n/ask/tr/`
(the cited passages stay in English).

- API: this repository at commit `edc6a38`, run locally in normal (owner) mode against
  the public paper library (Qdrant Cloud, 55 papers, 2,210 passages, read-only key).
- Models: Claude Sonnet 4.6 writes the answer, Claude Haiku 4.5 evaluates it;
  OpenAI `text-embedding-3-small` embeds the question. `topK` 5.
- Each file: `{ request, costUsd, response }`. `costUsd` is computed from the token
  counts the API logged, at list prices (Sonnet 4.6 $3 / $15, Haiku 4.5 $1 / $5 per
  million input / output tokens; cache reads and writes at their own rates). The
  embedding call is not included (a fraction of a cent).
- Total for the five runs: US$0.143.

| File | Question | Cost | Quality |
|---|---|---|---|
| ask-1.json | Why does GraphCast forecast medium-range weather so well? | $0.032 | 0.93 |
| ask-2.json | How do Self-RAG's reflection tokens decide when to retrieve and which passages to trust? | $0.031 | 0.95 |
| ask-3.json | What does TacticAI suggest to football coaches for corner kicks, and how did experts rate it? | $0.029 | 0.93 |
| ask-4.json | How much faster did developers complete a task with GitHub Copilot in the controlled experiment? | $0.022 | 1.00 |
| ask-5.json | How does HumanEval measure the functional correctness of generated code? | $0.030 | 0.97 |
