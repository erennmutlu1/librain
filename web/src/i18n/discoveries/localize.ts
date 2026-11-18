/*
 * Turkish versions of the recorded discoveries.
 *
 * The recorded runs (src/explore/data, src/featured/data) stay byte-for-byte
 * copies of the experiments folder. A translation is a separate file,
 * tr/<ID>.json, holding only the model-written prose:
 *
 *   {
 *     "id": "A1",
 *     "topicA": "...", "topicB": "...",
 *     "hypothesis": "...", "novelClaim": "...", "reasoning": "...",
 *     "claims": [{ "sentence": "...", "rationale": "..." }],          // same order and length as claimValidation.claims
 *     "extrapolationBasis": [{ "claimSentence": "...", "rationale": "..." }]  // same order and length
 *   }
 *
 * Each translated claim sentence and basis sentence must appear word for word
 * in the translated novelClaim, so the sentence verdicts still land on the
 * right sentence. Paper passages (supportingEvidence) are quotes and stay in
 * English. tr/manifests.json translates the editor's takeaways, the area names
 * and the dropped-area note.
 *
 * localizeRun() overlays a translation on a copy of the raw run; the original
 * object is never changed.
 */

export interface RunTranslation {
  id: string;
  topicA: string;
  topicB: string;
  hypothesis: string;
  novelClaim: string;
  reasoning: string;
  claims: { sentence: string; rationale: string }[];
  extrapolationBasis: { claimSentence: string; rationale: string }[];
}

export interface ManifestTranslation {
  /** By run id: the editor's takeaway and why it was picked. */
  picks: Record<string, { takeaway: string; whyFeatured: string }>;
  /** By area prefix, e.g. "F": "Yapay zekâ × futbol". */
  areas: Record<string, string>;
  droppedAreas: { area: string; reason: string }[];
}

type Rec = Record<string, unknown>;
const isRecord = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A copy of a recorded run with the translated prose laid over it. */
export function localizeRun(raw: unknown, t: RunTranslation | undefined): unknown {
  if (!t || !isRecord(raw)) return raw;
  const run = structuredClone(raw) as Rec;
  if (isRecord(run.request)) {
    run.request.topicA = t.topicA;
    run.request.topicB = t.topicB;
  }
  const r = run.response;
  if (!isRecord(r)) return run;
  r.hypothesis = t.hypothesis;
  r.novelClaim = t.novelClaim;
  r.reasoning = t.reasoning;
  const cv = r.claimValidation;
  if (isRecord(cv) && Array.isArray(cv.claims) && cv.claims.length === t.claims.length) {
    cv.claims.forEach((c, i) => {
      const tc = t.claims[i];
      if (isRecord(c) && tc) {
        c.sentence = tc.sentence;
        c.rationale = tc.rationale;
      }
    });
  }
  if (Array.isArray(r.extrapolationBasis) && r.extrapolationBasis.length === t.extrapolationBasis.length) {
    r.extrapolationBasis.forEach((b, i) => {
      const tb = t.extrapolationBasis[i];
      if (isRecord(b) && tb) {
        b.claimSentence = tb.claimSentence;
        b.rationale = tb.rationale;
      }
    });
  }
  return run;
}

/** A manifest (featured.json) with the translated takeaways, area names and notes. */
export function localizeManifest(raw: unknown, t: ManifestTranslation | undefined): unknown {
  if (!t || !isRecord(raw)) return raw;
  const m = structuredClone(raw) as Rec;
  if (Array.isArray(m.featured)) {
    for (const e of m.featured) {
      if (!isRecord(e) || typeof e.id !== 'string') continue;
      const p = t.picks[e.id];
      if (p) {
        e.takeaway = p.takeaway;
        e.whyFeatured = p.whyFeatured;
      }
    }
  }
  if (Array.isArray(m.areas)) {
    for (const a of m.areas) {
      if (isRecord(a) && typeof a.prefix === 'string' && t.areas[a.prefix]) a.name = t.areas[a.prefix];
    }
  }
  if (Array.isArray(m.droppedAreas) && m.droppedAreas.length === t.droppedAreas.length) {
    m.droppedAreas = m.droppedAreas.map((d, i) => (isRecord(d) ? { ...d, ...t.droppedAreas[i] } : d));
  }
  return m;
}
