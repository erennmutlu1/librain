/*
 * Checks the Turkish discovery files against the recorded runs:
 * one per run, the right shape, the same number of claim verdicts and basis
 * entries, every translated sentence findable in the translated claim, and
 * the original files untouched by localizeRun.
 *
 * Run one file while translating:  npx vitest run src/i18n/discoveries -t A1
 */
import { describe, expect, it } from 'vitest';
import { localizeManifest, localizeRun, type ManifestTranslation, type RunTranslation } from './localize';

const runs = import.meta.glob<Record<string, unknown>>('../../explore/data/*/runs/*.json', { eager: true, import: 'default' });
const manifests = import.meta.glob<Record<string, unknown>>('../../explore/data/*/featured.json', { eager: true, import: 'default' });
const translations = import.meta.glob<RunTranslation>('./tr/[A-Z]*.json', { eager: true, import: 'default' });
const manifestTr = import.meta.glob<ManifestTranslation>('./tr/manifests.json', { eager: true, import: 'default' });

type Rec = Record<string, unknown>;
const byId = new Map(Object.values(runs).map((r) => [r.id as string, r]));
const trById = new Map(Object.entries(translations).map(([path, t]) => [path.split('/').pop()!.replace('.json', ''), t]));

const nonEmpty = (s: unknown) => typeof s === 'string' && s.trim().length > 0;

describe('Turkish discovery translations', () => {
  it('covers all 46 recorded runs and nothing else', () => {
    expect(byId.size).toBe(46);
    expect([...trById.keys()].sort()).toEqual([...byId.keys()].sort());
  });

  for (const id of [...byId.keys()].sort()) {
    it(`${id} matches its recorded run`, () => {
      const t = trById.get(id);
      expect(t, `src/i18n/discoveries/tr/${id}.json is missing`).toBeDefined();
      if (!t) return;
      const raw = byId.get(id)!;
      const res = raw.response as Rec;
      const claims = ((res.claimValidation as Rec | null)?.claims as Rec[] | undefined) ?? [];
      const basis = (res.extrapolationBasis as Rec[] | undefined) ?? [];

      expect(t.id).toBe(id);
      for (const k of ['topicA', 'topicB', 'hypothesis', 'novelClaim', 'reasoning'] as const) {
        expect(nonEmpty(t[k]), `${id}.${k} is empty`).toBe(true);
      }
      expect(t.claims.length, `${id}: claims must have ${claims.length} entries`).toBe(claims.length);
      expect(t.extrapolationBasis.length, `${id}: extrapolationBasis must have ${basis.length} entries`).toBe(basis.length);
      t.claims.forEach((c, i) => {
        expect(nonEmpty(c.sentence) && nonEmpty(c.rationale), `${id}.claims[${i}] is incomplete`).toBe(true);
      });
      t.extrapolationBasis.forEach((b, i) => {
        expect(nonEmpty(b.claimSentence) && nonEmpty(b.rationale), `${id}.extrapolationBasis[${i}] is incomplete`).toBe(true);
      });

      // Every verdict must land on its sentence of the translated claim word for word.
      for (const s of t.claims.map((c) => c.sentence)) {
        expect(t.novelClaim.includes(s.trim()), `${id}: claim sentence not found word for word in novelClaim: "${s}"`).toBe(true);
      }
      for (const s of t.extrapolationBasis.map((b) => b.claimSentence)) {
        expect(t.novelClaim.includes(s.trim()), `${id}: basis sentence not found word for word in novelClaim: "${s}"`).toBe(true);
      }

      // The recorded file is not changed by the overlay.
      const before = JSON.stringify(raw);
      const localized = localizeRun(raw, t) as Rec;
      expect(JSON.stringify(raw)).toBe(before);
      expect((localized.response as Rec).novelClaim).toBe(t.novelClaim);
      expect((localized.response as Rec).supportingEvidence).toEqual(res.supportingEvidence);
    });
  }

  it('translates every editor pick, area and dropped area', () => {
    const t = Object.values(manifestTr)[0];
    expect(t, 'src/i18n/discoveries/tr/manifests.json is missing').toBeDefined();
    if (!t) return;
    for (const m of Object.values(manifests)) {
      for (const p of (m.featured as Rec[] | undefined) ?? []) {
        const pt = t.picks[p.id as string];
        expect(pt && nonEmpty(pt.takeaway) && nonEmpty(pt.whyFeatured), `pick ${String(p.id)}`).toBe(true);
      }
      for (const a of (m.areas as Rec[] | undefined) ?? []) expect(nonEmpty(t.areas[a.prefix as string]), `area ${String(a.prefix)}`).toBe(true);
      const dropped = (m.droppedAreas as Rec[] | undefined) ?? [];
      if (dropped.length) expect(t.droppedAreas.length).toBe(dropped.length);
      const before = JSON.stringify(m);
      localizeManifest(m, t);
      expect(JSON.stringify(m)).toBe(before);
    }
  });
});
