import { afterEach, describe, expect, it } from 'vitest';
import { resetLang } from '../i18n/lang';
import { exploreRecordings } from './publicScenarios';

const d7 = () => exploreRecordings.find((r) => r.id === 'explore-D7')!;
const claim = () => (d7().response as { novelClaim: string }).novelClaim;

describe('recorded replays follow the interface language', () => {
  afterEach(() => resetLang());

  it('serves the recorded English by default', () => {
    expect(d7().label).toMatch(/^D7 · catalyst/);
    expect(claim()).toMatch(/OC20/);
    expect(d7().note).toMatch(/^Recorded 2026-11-18 with Claude/);
  });

  it('serves the Turkish translation in Turkish, matching on the English topics', () => {
    resetLang('tr');
    expect(d7().request.topicA).toMatch(/catalyst/); // matching input stays as recorded
    expect(d7().label).toMatch(/^D7 · katalizör/);
    expect(claim()).toMatch(/adsorpsiyon/);
    expect(d7().note).toMatch(/kaydedildi/);
    // Paper passages are quotes and stay in English.
    const evidence = (d7().response as { supportingEvidence: { content: string }[] }).supportingEvidence;
    expect(evidence[0]?.content).not.toMatch(/[ğışİ]/);
  });
});

describe('recorded Ask questions', () => {
  const copies = import.meta.glob<string>('./ask/*.json', { query: '?raw', import: 'default', eager: true });
  const originals = import.meta.glob<string>('../../../experiments/ask-examples/*.json', { query: '?raw', import: 'default', eager: true });
  const turkish = import.meta.glob<Record<string, unknown>>('../i18n/ask/tr/*.json', { eager: true, import: 'default' });

  afterEach(() => resetLang());

  it('are byte-for-byte copies of experiments/ask-examples, each with a Turkish overlay', () => {
    const names = (m: Record<string, unknown>) => Object.keys(m).map((k) => k.split('/').pop()).sort();
    expect(names(copies)).toEqual(['ask-1.json', 'ask-2.json', 'ask-3.json', 'ask-4.json', 'ask-5.json']);
    expect(names(originals)).toEqual(names(copies));
    expect(names(turkish)).toEqual(names(copies));
    for (const name of names(copies)) {
      expect(copies[`./ask/${name}`] === originals[`../../../experiments/ask-examples/${name}`], `${name} differs`).toBe(true);
    }
  });

  it('replay in the interface language and match on the English question', async () => {
    const { askRecordings } = await import('./publicScenarios');
    const graphcast = askRecordings[0]!;
    const answer = () => (graphcast.response as { hypothesis: string }).hypothesis;
    const passage = () => (graphcast.response as { citations: { content: string }[] }).citations[0]?.content ?? '';

    expect(graphcast.request.query).toBe('Why does GraphCast forecast medium-range weather so well?');
    expect(answer()).toMatch(/^GraphCast forecasts medium-range weather/);

    resetLang('tr');
    expect(graphcast.label).toBe('GraphCast orta vadeli hava tahminini neden bu kadar iyi yapıyor?');
    expect(graphcast.request.query).toBe('Why does GraphCast forecast medium-range weather so well?');
    expect(answer()).toMatch(/^GraphCast orta vadeli hava tahminini/);
    expect(graphcast.note).toMatch(/Claude Haiku 4\.5 değerlendirdi/);
    // Passages are quotes from the papers and stay in English.
    expect(passage()).not.toMatch(/[ğışİ]/);
  });
});
