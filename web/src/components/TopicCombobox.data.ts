/*
 * The topic pairs of the 46 recorded Explore discoveries
 * (src/explore/data/<batch>/runs/<id>.json), in repository order, all at
 * topK 5. A tiny copy, so the topic suggestions in Live mode never pull the
 * runs (and their passage text) into the bundle. TopicCombobox.test.tsx
 * checks it against the run files, so a new or changed run fails a test
 * until this list follows.
 *
 * Recorded mode does not use it: there the suggestions come from the mock
 * client's own catalogue, which is exactly what can replay.
 */
export const RECORDED_TOPIC_PAIRS: readonly (readonly [string, string | null])[] = [
  ['photovoltaic power forecasting with transfer learning (SolNet)', 'medium-range weather forecasting with graph neural networks (GraphCast)'],
  ['crop yield prediction from multi-modal remote sensing', 'contrastive image-text pretraining (CLIP)'],
  ['probabilistic time-series forecasting with autoregressive recurrent networks (DeepAR)', 'fine-tuning an atmospheric foundation model (Aurora)'],
  ['crop yield forecasting', '3D Earth-specific transformer weather forecasting (Pangu-Weather)'],
  ['renewable energy grid balancing', 'decomposition transformers for long-horizon forecasting (Autoformer)'],
  ['vision transformer patch embeddings', 'satellite imagery for agricultural monitoring'],
  ['learned physics simulators with graph networks', 'solar irradiance and cloud motion forecasting'],
  ['clinical trial outcome prediction with LLM agents (AutoCT)', 'physics-informed neural networks for epidemic dynamics'],
  ['spatio-temporal graph neural networks for COVID-19 forecasting', 'adaptive clinical trial site selection'],
  ['causal inference for treatment effect estimation', 'graph convolutional networks on patient similarity graphs'],
  ['clinical trial eligibility criteria design', 'retrieval-augmented generation'],
  ['self-reflective retrieval with critique tokens (Self-RAG)', 'multi-agent drug discovery pipeline (PharmAgents)'],
  ['drug-target binding affinity prediction from sequences (DeepDTA)', 'reinforcement learning with proximal policy optimization'],
  ['de novo molecular generation with generative models', 'retrieval-augmented generation over a dense document index'],
  ['graph attention networks', 'protein-ligand interaction prediction'],
  ['crystal graph convolutional networks for material property prediction', 'autonomous agentic scientific discovery loops'],
  ['biomedical generalist foundation model (BiomedGPT)', 'toxicity and ADMET evaluation by LLM agents'],
  ['catalyst adsorption energy prediction (OC20)', 'multi-agent hypothesis generation'],
  ['neuromorphic spiking hardware energy efficiency', 'edge deployment of weather and photovoltaic forecasting models'],
  ['decoding text from EEG signals (Thought2Text)', 'a foundation model of human cognition (Centaur)'],
  ['mesh-based learned physics simulators', 'epidemic spread modelling with physics-informed neural networks'],
  ['graph neural network assistant for football tactics (TacticAI)', 'medium-range weather forecasting with graph neural networks (GraphCast)'],
  ['valuing player actions in soccer by their effect on scoring probability', 'graph attention networks'],
  ['Google Research Football reinforcement learning environment', 'proximal policy optimization'],
  ['corner kick tactic generation and player positioning', 'learned physics simulators with graph networks'],
  ['valuing football player decisions and actions', 'a foundation model of human cognition and decision-making (Centaur)'],
  ['labor market exposure of occupations to large language models (GPTs are GPTs)', 'developer productivity with AI pair programmers (GitHub Copilot)'],
  ['which economic tasks people perform with AI assistants', 'large language models for education'],
  ['occupational exposure to large language models', 'autonomous agentic scientific discovery'],
  ['AI usage across economic tasks and occupations', 'multi-agent drug discovery pipelines (PharmAgents)'],
  ['developer productivity with AI pair programmers (GitHub Copilot)', 'competition-level code generation (AlphaCode)'],
  ['unsupervised translation between programming languages (TransCoder)', 'large-scale weakly supervised multilingual training (Whisper)'],
  ['competition-level code generation with large-scale sampling and filtering (AlphaCode)', 'Monte Carlo tree search feature discovery in LLM agents (AutoCT)'],
  ['large language models trained on code and functional correctness (Codex)', 'self-reflective retrieval with critique tokens (Self-RAG)'],
  ['large-scale program sampling and filtering (AlphaCode)', 'de novo molecular generation with generative models'],
  ['translating code between programming languages', 'graph convolutional networks'],
  ['muscle fatigue detection from surface EMG with spiking neural networks', 'neuromorphic hardware energy efficiency'],
  ['time-to-injury survival models for elite football players', 'clinical trial outcome prediction with LLM agents (AutoCT)'],
  ['athlete injury prediction from training load', 'probabilistic time-series forecasting with autoregressive recurrent networks (DeepAR)'],
  ['wearable sensor monitoring of athlete injury risk', 'physics-informed neural networks'],
  ['predictive modelling of football injuries', 'spatio-temporal graph neural networks'],
  ['screenshot-to-code generation for web front-ends (Design2Code)', 'contrastive image-text pretraining (CLIP)'],
  ['autonomous web agents in realistic browser environments (WebArena)', 'self-reflective retrieval with critique tokens (Self-RAG)'],
  ['multimodal front-end code generation from web page screenshots', 'vision transformer patch embeddings'],
  ['web navigation agents completing multi-step tasks', 'reinforcement learning with proximal policy optimization'],
  ['automated front-end engineering benchmarks', 'large language models for education'],
];

/** Every recorded Explore run asked for five passages per topic. */
export const RECORDED_TOPK = 5;
