# New-area discoveries (2026-11-18)

25 Discovery runs in five areas the owner asked about (AI × football, AI × sport, AI × web development, programming languages, future jobs), each bridging a newly added paper with one already in the corpus. Same pipeline, prompts and models as the paper (Claude Sonnet 4.6 generates; Claude Haiku 4.5 judges and validates claims), `topK = 5`.

**Cost:** $1.65 for 25 runs ($0.057–$0.075 each), from the logged token counts. Budget cap was $2. Embedding the 14 new papers cost a fraction of a cent on the OpenAI account.

**Corpus:** 14 arXiv papers were added for these areas (titles verified against the arXiv API before ingest), taking the corpus from 41 to 55 papers and 2,210 chunks.

## Areas

Kept: AI × football, AI × sport, AI × web development, Programming languages, Future jobs.

**Dropped — How people will live without money or work.** Not kept. (1) 'Without money' is not logical as stated: every society needs a way to allocate food, housing and care, and even a universal basic income is money. (2) How people should live without work is a values and policy question that a literature-grounded hypothesis engine cannot settle, and arXiv evidence is thin, so the output would be the unsupported speculation LIBRAIN exists to flag. The researchable part (how AI changes jobs) is covered by 'Future jobs'.

## Featured

Selected by reading every result: a specific mechanism, a testable consequence, a bridge across papers; at least one per area.

### F4 · AI × football · corner kick tactic generation and player positioning × learned physics simulators with graph networks

Treat each player at a corner kick like a particle in a learned physics simulator, so a TacticAI-style assistant can test whole movement plans, not just starting positions.

- quality 0.571 · novelty 0.344 · plausibility 0.62 · coherence 0.75 · claim risk 0.25 (0 of 1 sentences RISKY)
- evidence from: 2310.10553, gns-physics
- why featured: A vivid, testable mechanism transfer from physics simulation to football tactics.
- full output: [`runs/F4.json`](runs/F4.json)

### F2 · AI × football · valuing player actions in soccer by their effect on scoring probability × graph attention networks

A graph-attention model learns which earlier actions in a possession matter most for a goal, giving sharper values for each player action than a fixed window.

- quality 0.665 · novelty 0.494 · plausibility 0.68 · coherence 0.82 · claim risk 0.25 (0 of 1 sentences RISKY)
- evidence from: 1802.07127, gat
- why featured: Highest quality in both batches (0.665) and a concrete change to an established method (VAEP).
- full output: [`runs/F2.json`](runs/F2.json)

### S5 · AI × sport · predictive modelling of football injuries × spatio-temporal graph neural networks

Model a whole squad as a graph of players over time, so injury risk reflects shared workload and team relationships, not each player in isolation.

- quality 0.573 · novelty 0.319 · plausibility 0.68 · coherence 0.72 · claim risk 0.28 (0 of 2 sentences RISKY)
- evidence from: 1609.07480, 2601.19479, covid-stgnn, gat
- why featured: Draws on four papers; reframes injury prediction from individuals to the team.
- full output: [`runs/S5.json`](runs/S5.json)

### S1 · AI × sport · muscle fatigue detection from surface EMG with spiking neural networks × neuromorphic hardware energy efficiency

Pair spiking neural networks with neuromorphic chips so a battery-powered wearable can monitor muscle fatigue continuously for days.

- quality 0.595 · novelty 0.355 · plausibility 0.68 · coherence 0.75 · claim risk 0.25 (0 of 1 sentences RISKY)
- evidence from: 2607.11065, neuromorphic-survey
- why featured: Concrete engineering claim that can be measured (battery life, accuracy).
- full output: [`runs/S1.json`](runs/S1.json)

### P5 · Programming languages · translating code between programming languages × graph convolutional networks

Run graph convolutions over a program's syntax tree when translating code between languages, especially from dynamically to statically typed languages.

- quality 0.629 · novelty 0.387 · plausibility 0.72 · coherence 0.78 · claim risk 0.18 (0 of 2 sentences RISKY)
- evidence from: 2006.03511, gat, gcn
- why featured: Specific architecture and a specific hard case where it should help.
- full output: [`runs/P5.json`](runs/P5.json)

### W5 · AI × web development · automated front-end engineering benchmarks × large language models for education

Turn screenshot-to-code benchmarks into automatically checked web-development lessons; the limit is that models still miss 30–40% of page blocks on complex layouts.

- quality 0.660 · novelty 0.479 · plausibility 0.72 · coherence 0.78 · claim risk 0.05 (0 of 1 sentences RISKY)
- evidence from: 2403.03163, llm-education-survey
- why featured: Lowest claim risk of all 46 runs (0.05) and an honest built-in limitation.
- full output: [`runs/W5.json`](runs/W5.json)

### J5 · Future jobs · developer productivity with AI pair programmers (GitHub Copilot) × competition-level code generation (AlphaCode)

Bring AlphaCode-style 'generate many, test, keep the best' into pair-programming tools, which could help beginner developers most.

- quality 0.585 · novelty 0.385 · plausibility 0.62 · coherence 0.75 · claim risk 0.25 (0 of 1 sentences RISKY)
- evidence from: 2203.07814, 2302.06590
- why featured: Testable with a controlled productivity study like the GitHub Copilot paper.
- full output: [`runs/J5.json`](runs/J5.json)

### J4 · Future jobs · AI usage across economic tasks and occupations × multi-agent drug discovery pipelines (PharmAgents)

Pharmaceutical R&D jobs may jump straight from little to deep AI use, faster than other occupations and faster than policy adapts.

- quality 0.588 · novelty 0.393 · plausibility 0.62 · coherence 0.75 · claim risk 0.28 (0 of 2 sentences RISKY)
- evidence from: 2503.04761, 2508.14111, pharmagents
- why featured: A bold, checkable labour-market prediction (track AI-usage data for R&D roles over time).
- full output: [`runs/J4.json`](runs/J4.json)

## New papers

| arXiv | title |
|---|---|
| 2403.03163 | Design2Code: Benchmarking Multimodal Code Generation for Automated Front-End Engineering |
| 2307.13854 | WebArena: A Realistic Web Environment for Building Autonomous Agents |
| 2310.10553 | TacticAI: an AI assistant for football tactics |
| 1802.07127 | Actions Speak Louder Than Goals: Valuing Player Actions in Soccer |
| 1907.11180 | Google Research Football: A Novel Reinforcement Learning Environment |
| 2107.03374 | Evaluating Large Language Models Trained on Code |
| 2203.07814 | Competition-Level Code Generation with AlphaCode |
| 2006.03511 | Unsupervised Translation of Programming Languages |
| 2303.10130 | GPTs are GPTs: An Early Look at the Labor Market Impact Potential of Large Language Models |
| 2302.06590 | The Impact of AI on Developer Productivity: Evidence from GitHub Copilot |
| 2503.04761 | Which Economic Tasks are Performed with AI? Evidence from Millions of Claude Conversations |
| 1609.07480 | Predictive modelling of football injuries |
| 2601.19479 | Time-to-Injury Forecasting in Elite Female Football: A DeepHit Survival Approach |
| 2607.11065 | Efficient and Robust Spiking Neural Networks for sEMG-Based Muscle Fatigue Detection |

## All runs

| id | area | topics | quality | novelty | risk | cost |
|---|---|---|--:|--:|--:|--:|
| F2 ★ | AI × football | valuing player actions in soccer by their effect on scoring probability × graph attention networks | 0.665 | 0.494 | 0.25 | $0.062 |
| W5 ★ | AI × web development | automated front-end engineering benchmarks × large language models for education | 0.660 | 0.479 | 0.05 | $0.070 |
| S3 | AI × sport | athlete injury prediction from training load × probabilistic time-series forecasting with autoregressive recurrent networks (DeepAR) | 0.647 | 0.541 | 0.25 | $0.064 |
| P5 ★ | Programming languages | translating code between programming languages × graph convolutional networks | 0.629 | 0.387 | 0.18 | $0.071 |
| P3 | Programming languages | large language models trained on code and functional correctness (Codex) × self-reflective retrieval with critique tokens (Self-RAG) | 0.614 | 0.343 | 0.72 | $0.068 |
| S1 ★ | AI × sport | muscle fatigue detection from surface EMG with spiking neural networks × neuromorphic hardware energy efficiency | 0.595 | 0.355 | 0.25 | $0.068 |
| P4 | Programming languages | large-scale program sampling and filtering (AlphaCode) × de novo molecular generation with generative models | 0.589 | 0.338 | 0.22 | $0.067 |
| J4 ★ | Future jobs | AI usage across economic tasks and occupations × multi-agent drug discovery pipelines (PharmAgents) | 0.588 | 0.393 | 0.28 | $0.057 |
| J5 ★ | Future jobs | developer productivity with AI pair programmers (GitHub Copilot) × competition-level code generation (AlphaCode) | 0.585 | 0.385 | 0.25 | $0.059 |
| W4 | AI × web development | web navigation agents completing multi-step tasks × reinforcement learning with proximal policy optimization | 0.577 | 0.361 | 0.18 | $0.059 |
| J3 | Future jobs | occupational exposure to large language models × autonomous agentic scientific discovery | 0.576 | 0.327 | 0.28 | $0.065 |
| W1 | AI × web development | screenshot-to-code generation for web front-ends (Design2Code) × contrastive image-text pretraining (CLIP) | 0.576 | 0.357 | 0.25 | $0.063 |
| S5 ★ | AI × sport | predictive modelling of football injuries × spatio-temporal graph neural networks | 0.573 | 0.319 | 0.28 | $0.071 |
| F4 ★ | AI × football | corner kick tactic generation and player positioning × learned physics simulators with graph networks | 0.571 | 0.344 | 0.25 | $0.066 |
| S2 | AI × sport | time-to-injury survival models for elite football players × clinical trial outcome prediction with LLM agents (AutoCT) | 0.567 | 0.300 | 0.28 | $0.067 |
| J2 | Future jobs | which economic tasks people perform with AI assistants × large language models for education | 0.563 | 0.319 | 0.28 | $0.067 |
| W2 | AI × web development | autonomous web agents in realistic browser environments (WebArena) × self-reflective retrieval with critique tokens (Self-RAG) | 0.557 | 0.300 | 0.28 | $0.068 |
| S4 | AI × sport | wearable sensor monitoring of athlete injury risk × physics-informed neural networks | 0.556 | 0.297 | 0.28 | $0.071 |
| W3 | AI × web development | multimodal front-end code generation from web page screenshots × vision transformer patch embeddings | 0.496 | 0.389 | 0.25 | $0.069 |
| F1 | AI × football | graph neural network assistant for football tactics (TacticAI) × medium-range weather forecasting with graph neural networks (GraphCast) | 0.489 | 0.366 | 0.25 | $0.075 |
| P1 | Programming languages | unsupervised translation between programming languages (TransCoder) × large-scale weakly supervised multilingual training (Whisper) | 0.483 | 0.378 | 0.75 | $0.067 |
| F5 | AI × football | valuing football player decisions and actions × a foundation model of human cognition and decision-making (Centaur) | 0.481 | 0.342 | 0.25 | $0.067 |
| J1 | Future jobs | labor market exposure of occupations to large language models (GPTs are GPTs) × developer productivity with AI pair programmers (GitHub Copilot) | 0.475 | 0.324 | 0.25 | $0.063 |
| P2 | Programming languages | competition-level code generation with large-scale sampling and filtering (AlphaCode) × Monte Carlo tree search feature discovery in LLM agents (AutoCT) | 0.471 | 0.313 | 0.25 | $0.065 |
| F3 | AI × football | Google Research Football reinforcement learning environment × proximal policy optimization | 0.416 | 0.347 | 0.25 | $0.062 |

Not featured despite scores: S3 (high novelty 0.54, but its novel claim is generic), P3 (kept as an example elsewhere: a RISKY sentence was flagged). F3, P2, J1, F5, P1, F1 and W3 scored lowest on plausibility.
