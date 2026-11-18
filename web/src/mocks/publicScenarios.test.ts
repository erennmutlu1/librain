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
