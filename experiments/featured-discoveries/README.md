# Featured discoveries (2026-11-18)

21 new Discovery runs on mechanism-level topic pairs, chosen to bridge drug discovery × agents, agriculture/energy × foundation models, clinical trials × causal ML, plus three new pairings. Same pipeline, prompts and models as the paper (Claude Sonnet 4.6 generates; Claude Haiku 4.5 judges and validates claims), `topK = 5`, against the 41-paper / 1,766-chunk corpus.

**Cost:** $1.40 for all 21 runs ($0.057–$0.073 each), computed from the token counts the API logs. Budget cap was $2.

**What "novel" means here:** each hypothesis is a *candidate*, and its `novelClaim` is the part the retrieved evidence does not support, checked sentence by sentence. Novelty is measured against this corpus (cosine distance to the nearest chunk); an idea can still exist in literature outside the corpus.

## Featured

Selected by reading every result, not by score alone: a specific mechanism, a testable consequence, and a bridge across papers.

### D7 · catalyst adsorption energy prediction (OC20) × multi-agent hypothesis generation

A multi-agent system chooses which DFT calculations to run next, so catalyst models trained on OC20 extend to the multi-adsorbate and solvation regimes the dataset leaves out.

- quality 0.577 · novelty 0.330 · plausibility 0.68 · coherence 0.72 · claim risk 0.25 (0 of 2 sentences RISKY)
- evidence from: 2505.04651, 2508.14111, oc20
- why featured: Specific, quantified gap (OC20 covers ~0.07% of configurations) with a concrete mechanism to close it; testable.
- full output: [`runs/D7.json`](runs/D7.json)

### C1 · clinical trial outcome prediction with LLM agents (AutoCT) × physics-informed neural networks for epidemic dynamics

Epidemic ODE constraints become features an LLM agent can search over, so infectious-disease trial-outcome models predict from mechanistic quantities such as trial-specific reproduction numbers.

- quality 0.565 · novelty 0.394 · plausibility 0.62 · coherence 0.68 · claim risk 0.25 (0 of 1 sentences RISKY)
- evidence from: autoct-clinical, epi-pinn
- why featured: The least obvious bridge in the set: compartmental-model physics inside an LLM agent's feature search.
- full output: [`runs/C1.json`](runs/C1.json)

### N3 · mesh-based learned physics simulators × epidemic spread modelling with physics-informed neural networks

A mesh-based graph simulator, as used for physics, is trained on epidemic dynamics so it generalises across infection seeds, population densities and interventions and supports real-time counterfactual policy runs.

- quality 0.593 · novelty 0.380 · plausibility 0.68 · coherence 0.72 · claim risk 0.25 (0 of 1 sentences RISKY)
- evidence from: covid-stgnn, epi-pinn, gns-physics
- why featured: Transfers a property GNS is known for (generalising across initial conditions) to epidemics; draws on three papers.
- full output: [`runs/N3.json`](runs/N3.json)

### A2 · crop yield prediction from multi-modal remote sensing × contrastive image-text pretraining (CLIP)

A CLIP-style model pretrained on paired satellite imagery and text estimates crop yield zero-shot, prompted with natural-language descriptions of crop conditions.

- quality 0.603 · novelty 0.378 · plausibility 0.68 · coherence 0.75 · claim risk 0.25 (0 of 2 sentences RISKY)
- evidence from: clip, crop-yield-multimodal, crop-yield-rs
- why featured: Clear, testable zero-shot claim that would remove the labelled-yield bottleneck if it holds.
- full output: [`runs/A2.json`](runs/A2.json)

### D5 · crystal graph convolutional networks for material property prediction × autonomous agentic scientific discovery loops

CGCNN serves as a fast surrogate inside an agentic discovery loop, so candidate crystal structures are proposed, scored and refined in silico before any DFT calculation.

- quality 0.580 · novelty 0.369 · plausibility 0.62 · coherence 0.75 · claim risk 0.25 (0 of 2 sentences RISKY)
- evidence from: 2503.08979, 2508.14111, cgcnn
- why featured: Concrete loop design with a named surrogate; drawn from three papers across materials science and agentic AI.
- full output: [`runs/D5.json`](runs/D5.json)

### D1 · self-reflective retrieval with critique tokens (Self-RAG) × multi-agent drug discovery pipeline (PharmAgents)

Self-RAG critique tokens go inside every PharmAgents agent, so each stage retrieves on demand and passes token-level quality signals downstream. The validator flags the claim about beating PharmAgents' 37.94% success rate as risky.

- quality 0.578 · novelty 0.334 · plausibility 0.68 · coherence 0.72 · claim risk 0.72 (1 of 2 sentences RISKY)
- evidence from: 2508.14111, pharmagents, self-rag
- why featured: Shows the audit working: a confident numeric claim beyond the evidence is flagged RISKY (0.72).
- full output: [`runs/D1.json`](runs/D1.json)

## All runs

| id | topics | quality | novelty | risk | cost |
|---|---|--:|--:|--:|--:|
| A6 | vision transformer patch embeddings × satellite imagery for agricultural monitoring | 0.631 | 0.393 | 0.25 | $0.071 |
| A2 ★ | crop yield prediction from multi-modal remote sensing × contrastive image-text pretraining (CLIP) | 0.603 | 0.378 | 0.25 | $0.068 |
| N3 ★ | mesh-based learned physics simulators × epidemic spread modelling with physics-informed neural networks | 0.593 | 0.380 | 0.25 | $0.070 |
| N1 | neuromorphic spiking hardware energy efficiency × edge deployment of weather and photovoltaic forecasting models | 0.593 | 0.410 | 0.28 | $0.072 |
| C4 | clinical trial eligibility criteria design × retrieval-augmented generation | 0.586 | 0.428 | 0.25 | $0.058 |
| D4 | graph attention networks × protein-ligand interaction prediction | 0.580 | 0.371 | 0.72 | $0.066 |
| D5 ★ | crystal graph convolutional networks for material property prediction × autonomous agentic scientific discovery loops | 0.580 | 0.369 | 0.25 | $0.067 |
| D1 ★ | self-reflective retrieval with critique tokens (Self-RAG) × multi-agent drug discovery pipeline (PharmAgents) | 0.578 | 0.334 | 0.72 | $0.071 |
| D7 ★ | catalyst adsorption energy prediction (OC20) × multi-agent hypothesis generation | 0.577 | 0.330 | 0.25 | $0.068 |
| D3 | de novo molecular generation with generative models × retrieval-augmented generation over a dense document index | 0.576 | 0.359 | 0.25 | $0.072 |
| N2 | decoding text from EEG signals (Thought2Text) × a foundation model of human cognition (Centaur) | 0.569 | 0.378 | 0.25 | $0.058 |
| A3 | probabilistic time-series forecasting with autoregressive recurrent networks (DeepAR) × fine-tuning an atmospheric foundation model (Aurora) | 0.568 | 0.374 | 0.20 | $0.069 |
| C1 ★ | clinical trial outcome prediction with LLM agents (AutoCT) × physics-informed neural networks for epidemic dynamics | 0.565 | 0.394 | 0.25 | $0.066 |
| A1 | photovoltaic power forecasting with transfer learning (SolNet) × medium-range weather forecasting with graph neural networks (GraphCast) | 0.563 | 0.318 | 0.28 | $0.064 |
| A4 | crop yield forecasting × 3D Earth-specific transformer weather forecasting (Pangu-Weather) | 0.560 | 0.311 | 0.15 | $0.072 |
| A7 | learned physics simulators with graph networks × solar irradiance and cloud motion forecasting | 0.550 | 0.281 | 0.22 | $0.073 |
| C3 | causal inference for treatment effect estimation × graph convolutional networks on patient similarity graphs | 0.506 | 0.418 | 0.28 | $0.065 |
| D2 | drug-target binding affinity prediction from sequences (DeepDTA) × reinforcement learning with proximal policy optimization | 0.476 | 0.358 | 0.18 | $0.060 |
| D6 | biomedical generalist foundation model (BiomedGPT) × toxicity and ADMET evaluation by LLM agents | 0.474 | 0.323 | 0.25 | $0.067 |
| A5 | renewable energy grid balancing × decomposition transformers for long-horizon forecasting (Autoformer) | 0.462 | 0.415 | 0.25 | $0.057 |
| C2 | spatio-temporal graph neural networks for COVID-19 forecasting × adaptive clinical trial site selection | 0.408 | 0.324 | 0.25 | $0.062 |

A6 scored highest but is not featured: satellite vision-transformer foundation models are a known research direction, so it reads as confirmation rather than discovery. C2, A5, D6 and D2 scored lowest on plausibility.
