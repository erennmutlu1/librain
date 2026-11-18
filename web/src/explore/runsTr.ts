/*
 * The recorded runs with their Turkish translations laid over them
 * (src/i18n/discoveries). Its own chunk, loaded only when the interface is in
 * Turkish. Paper passages stay in English; a run without a translation keeps
 * its English text and is marked translated: false.
 */
import { localizeManifest, localizeRun, type ManifestTranslation, type RunTranslation } from '../i18n/discoveries/localize';
import rawBatch3 from './data/cross-field-discoveries/featured.json';
import rawBatch1 from './data/featured-discoveries/featured.json';
import rawBatch2 from './data/new-areas-discoveries/featured.json';
import { parseExploreManifest } from './manifests';
import { buildExploreData, type ExploreData } from './model';

const files = import.meta.glob<unknown>('./data/*/runs/*.json', { eager: true, import: 'default' });
const runTr = import.meta.glob<RunTranslation>('../i18n/discoveries/tr/[A-Z]*.json', { eager: true, import: 'default' });
const manifestTr = Object.values(
  import.meta.glob<ManifestTranslation>('../i18n/discoveries/tr/manifests.json', { eager: true, import: 'default' }),
)[0];

const byId = new Map(Object.values(runTr).map((t) => [t.id, t]));

export const TR_MANIFESTS = [
  parseExploreManifest(localizeManifest(rawBatch1, manifestTr), 1, 'experiments/featured-discoveries'),
  parseExploreManifest(localizeManifest(rawBatch2, manifestTr), 2, 'experiments/new-areas-discoveries'),
  parseExploreManifest(localizeManifest(rawBatch3, manifestTr), 3, 'experiments/cross-field-discoveries'),
] as const;

export const exploreData: ExploreData = buildExploreData(
  Object.entries(files).map(([path, raw]) => {
    const id = path.split('/').pop()!.replace(/\.json$/, '');
    const t = byId.get(id);
    return { file: path.replace(/^\.\/data\//, ''), raw: localizeRun(raw, t), translated: t !== undefined };
  }),
  TR_MANIFESTS,
);
