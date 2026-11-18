import { describe, expect, it } from 'vitest';
import type { DiscoverRequest, DiscoverResponse } from '../api/types';
import { DISCOVERY_EXPORT_FORMAT, discoveryFileBase, discoveryToJson, discoveryToMarkdown, type DiscoveryExport } from './exportDiscovery';

const LONG_PASSAGE = `${'Graph networks learn particle dynamics from data. '.repeat(10)}The end.`;

const request: DiscoverRequest = { topicA: 'corner kicks', topicB: 'learned physics simulators', topK: 5, provider: 'anthropic' };

const response: DiscoverResponse = {
  correlationId: 'c0ffee00-0000-4000-8000-000000000001',
  hypothesis: 'Corner-kick routines can be planned with a learned simulator of player motion.',
  novelClaim: 'A graph network trained on tracking data predicts the ball’s path. Teams that use it score 40% more.',
  supportingEvidence: [
    { paperId: 'gns', chunkIndex: 3, section: 'Method', pageNumber: 4, supportType: 'direct', content: LONG_PASSAGE },
    { paperId: 'vaep', chunkIndex: 12, section: null, pageNumber: null, supportType: 'analogous', content: 'Valuing actions by goal probability.' },
  ],
  extrapolationBasis: [
    { claimSentence: 'A graph network trained on tracking data predicts the ball’s path.', basisType: 'analogy', groundedInChunkId: 'gns:3', rationale: 'Particles behave like players.' },
  ],
  claimValidation: {
    claims: [
      {
        sentence: 'A graph network trained on tracking data predicts the ball’s path.',
        status: 'extrapolated',
        supportingChunks: ['gns:3'],
        factualHallucinationProbability: 0.18,
        rationale: 'Plausible transfer, not shown for football.',
      },
      {
        sentence: 'Teams that use it score 40% more.',
        status: 'risky',
        supportingChunks: [],
        factualHallucinationProbability: 0.81,
        rationale: 'A specific number with no source.',
      },
    ],
    aggregateRisk: 0.81,
  },
  reasoning: 'Both fields model interacting agents on a graph.',
  evaluation: { noveltyScore: 0.62, plausibilityScore: 0.7, structuralCoherenceScore: 0.8, qualityScore: 0.71 },
  claimedEvidenceCount: 2,
  droppedEvidenceCount: 0,
};

const recorded: DiscoveryExport = {
  request,
  response,
  id: 'F4',
  source: 'experiments/new-areas-discoveries/runs/F4.json',
  url: 'https://librain.example/explore/F4',
  recordedOn: '2026-11-18',
  paperTitle: (id) => (id === 'gns' ? 'Learning to Simulate Complex Physics with Graph Networks' : null),
};

describe('discoveryToMarkdown', () => {
  const md = discoveryToMarkdown(recorded, 'en');

  it('starts with the title, the topics and where the run came from', () => {
    expect(md.startsWith('# corner kicks × learned physics simulators\n')).toBe(true);
    expect(md).toContain('- Topic A: corner kicks');
    expect(md).toContain('- Topic B: learned physics simulators');
    expect(md).toContain('- Run: `F4` (recorded run, 2026-11-18)');
    expect(md).toContain('- Source: `experiments/new-areas-discoveries/runs/F4.json`');
    expect(md).toContain('- Link: <https://librain.example/explore/F4>');
    expect(md).toContain('- Model: Anthropic, top 5 passages per topic');
  });

  it('has the hypothesis, and the novel claim with each sentence’s verdict', () => {
    expect(md).toContain('## Hypothesis\n\nCorner-kick routines can be planned with a learned simulator of player motion.');
    expect(md).toContain('## Novel claim, sentence by sentence');
    expect(md).toContain('1. **Extrapolated** (hallucination probability 18%): A graph network trained on tracking data predicts the ball’s path.');
    expect(md).toContain('   - Validator: Plausible transfer, not shown for football.');
    expect(md).toContain('   - Sources: `gns:3`');
    expect(md).toContain('2. **Risky** (hallucination probability 81%): Teams that use it score 40% more.');
    expect(md).toContain('Claim risk: 0.81');
  });

  it('has the reasoning with the generator’s basis, and the scores as a table', () => {
    expect(md).toContain('## Reasoning\n\nBoth fields model interacting agents on a graph.');
    expect(md).toContain('- **Analogy** (from `gns:3`): A graph network trained on tracking data predicts the ball’s path.');
    expect(md).toContain('| Quality | 0.71 |');
    expect(md).toContain('| Novelty | 0.62 |');
    expect(md).toContain('| Plausibility | 0.70 |');
    expect(md).toContain('| Claim risk | 0.81 |');
  });

  it('lists the evidence with paper ids, pages and a short passage', () => {
    expect(md).toContain('## Evidence (2 passages)');
    expect(md).toContain('1. **Learning to Simulate Complex Physics with Graph Networks** (`gns`), page 4, Method: `gns:3` (direct)');
    expect(md).toContain('2. `vaep`: `vaep:12` (analogous)');
    expect(md).toContain('   > Valuing actions by goal probability.');
    const quoted = md.split('\n').find((l) => l.startsWith('   > Graph networks'))!;
    expect(quoted.length).toBeLessThan(340);
    expect(quoted.endsWith('…')).toBe(true);
    expect(md).not.toContain('The end.');
  });

  it('says when the claim was not validated', () => {
    const failed = discoveryToMarkdown({ request, response: { ...response, claimValidation: { claims: [], aggregateRisk: 1, validationFailed: true } } }, 'en');
    expect(failed).toContain('> A graph network trained on tracking data predicts the ball’s path. Teams that use it score 40% more.');
    expect(failed).toContain('_The validator returned no usable verdicts: treat the claim as unverified._');
  });

  it('writes its headings in Turkish and marks a translation', () => {
    const tr = discoveryToMarkdown({ ...recorded, translated: true }, 'tr');
    expect(tr).toContain('- Konu A: corner kicks');
    expect(tr).toContain('## Hipotez');
    expect(tr).toContain('## Özgün iddia, cümle cümle');
    expect(tr).toContain('1. **Çıkarımsal** (halüsinasyon olasılığı %18)');
    expect(tr).toContain('| İddia riski | 0,81 |');
    expect(tr).toContain('## Kanıt (2 pasaj)');
    expect(tr).toContain('_İngilizceden çevrildi. Makale pasajları özgün dilinde alıntılanmıştır._');
  });
});

describe('discoveryToJson', () => {
  it('keeps the run whole, with where it came from', () => {
    const json = JSON.parse(discoveryToJson(recorded)) as Record<string, unknown>;
    expect(json).toMatchObject({ format: DISCOVERY_EXPORT_FORMAT, version: 1, id: 'F4', source: recorded.source, request, response });
    expect(json).not.toHaveProperty('paperTitle');
  });

  it('names files after the run', () => {
    expect(discoveryFileBase(recorded)).toBe('librain-f4-corner-kicks-learned-physics-simulators');
    expect(discoveryFileBase({ request })).toBe('librain-corner-kicks-learned-physics-simulators');
  });
});
