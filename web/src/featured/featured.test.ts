import { describe, expect, it } from 'vitest';
import { formatUsd } from '../lib/format';
import rawManifest from './data/featured.json';
import { featuredManifest, modelDisplayNames, parseManifest } from './manifest';
import { buildFeaturedRun, featuredRuns } from './runs';

const copies = import.meta.glob<string>('./data/**/*.json', { query: '?raw', import: 'default', eager: true });
const originals = import.meta.glob<string>('../../../experiments/featured-discoveries/{featured.json,runs/*.json}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

describe('featured data', () => {
  it('is a byte-for-byte copy of experiments/featured-discoveries', () => {
    const manifestFiles = ['featured.json', ...rawManifest.featured.map((f) => f.file)];
    expect(Object.keys(copies).sort()).toEqual(manifestFiles.map((f) => `./data/${f}`).sort());
    for (const file of manifestFiles) {
      const original = originals[`../../../experiments/featured-discoveries/${file}`];
      expect(original, `experiments/featured-discoveries/${file}`).toBeDefined();
      expect(copies[`./data/${file}`] === original, `src/featured/data/${file} differs from the experiment output`).toBe(true);
    }
  });

  it('reads the manifest: order, models, corpus and date', () => {
    expect(featuredManifest.entries.map((e) => e.id)).toEqual(['D7', 'C1', 'N3', 'A2', 'D5', 'D1']);
    expect(featuredManifest.generator).toBe('Claude Sonnet 4.6');
    expect(featuredManifest.judge).toBe('Claude Haiku 4.5');
    expect(featuredManifest.corpusPapers).toBe(41);
    expect(featuredManifest.date).toBe('2026-11-18');
  });

  it('builds every run in manifest order with its paper bridges, verdict counts and cost', () => {
    expect(featuredRuns.map((r) => r.id)).toEqual(featuredManifest.entries.map((e) => e.id));
    for (const run of featuredRuns) {
      expect(run.request.topicA).not.toBe('');
      expect(run.request.topicB).toBeTruthy();
      expect(run.response.claimValidation?.validationFailed).toBe(false);
      expect(run.response.supportingEvidence.every((e) => (e.content ?? '').length > 0)).toBe(true);
      expect(formatUsd(run.costUsd)).toBe('$0.07');
      expect(run.source).toBe(`experiments/featured-discoveries/runs/${run.id}.json`);
    }

    const d1 = featuredRuns.find((r) => r.id === 'D1')!;
    expect(d1.paperIds).toEqual(['self-rag', 'pharmagents', '2508.14111']);
    expect(d1.riskyCount).toBe(1);
    expect(d1.sentenceCount).toBe(2);
    expect(featuredRuns.filter((r) => r.riskyCount > 0).map((r) => r.id)).toEqual(['D1']);
  });

  it('refuses a run file that does not match its manifest entry', () => {
    const entry = { id: 'D7', takeaway: '', whyFeatured: '', file: 'runs/D7.json' };
    expect(() => buildFeaturedRun(entry, { id: 'D1', response: {} })).toThrow(/manifest lists D7/);
  });

  it('names models from their ids and tolerates a sparse manifest', () => {
    expect(modelDisplayNames('claude-opus-4-1 (x), claude-haiku-4-5')).toEqual(['Claude Opus 4.1', 'Claude Haiku 4.5']);
    const sparse = parseManifest({ model: 'gpt-4o', featured: [{ id: 'X1' }, { id: 'X2', file: 'runs/X2.json' }] });
    expect(sparse).toMatchObject({ generator: 'gpt-4o', judge: null, corpusPapers: null, topK: null });
    expect(sparse.entries.map((e) => e.id)).toEqual(['X2']);
  });
});
