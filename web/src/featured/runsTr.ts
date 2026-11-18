/*
 * The six featured runs with their Turkish translations laid over them
 * (src/i18n/discoveries). Its own chunk, loaded only when the interface is in
 * Turkish. Paper passages stay in English; a run or manifest entry without a
 * translation keeps its English text.
 */
import { localizeManifest, localizeRun, type ManifestTranslation, type RunTranslation } from '../i18n/discoveries/localize';
import rawManifest from './data/featured.json';
import { parseManifest } from './manifest';
import { buildFeaturedRun, type FeaturedRun } from './runs';

const files = import.meta.glob<unknown>('./data/runs/*.json', { eager: true, import: 'default' });
// Only the six featured ids, so this chunk does not carry all 46 translations.
const runTr = import.meta.glob<RunTranslation>('../i18n/discoveries/tr/{A2,C1,D1,D5,D7,N3}.json', { eager: true, import: 'default' });
const manifestTr = Object.values(
  import.meta.glob<ManifestTranslation>('../i18n/discoveries/tr/manifests.json', { eager: true, import: 'default' }),
)[0];

const byId = new Map(Object.values(runTr).map((t) => [t.id, t]));

export const featuredManifestTr = parseManifest(localizeManifest(rawManifest, manifestTr));

export const featuredRunsTr: FeaturedRun[] = featuredManifestTr.entries.map((entry) => {
  const raw = files[`./data/${entry.file}`];
  if (raw === undefined) throw new Error(`Featured run ${entry.id} is missing: expected src/featured/data/${entry.file}.`);
  const t = byId.get(entry.id);
  return buildFeaturedRun(entry, localizeRun(raw, t), t !== undefined);
});
