/*
 * All 46 recorded runs, built into Explore's model. This module is its own
 * chunk, loaded on demand (useDiscoveries.ts), because the passage text makes
 * it large. Nothing here calls the API: the data is bundled.
 */
import { EXPLORE_MANIFESTS } from './manifests';
import { buildExploreData, type ExploreData } from './model';

const files = import.meta.glob<unknown>('./data/*/runs/*.json', { eager: true, import: 'default' });

export const exploreData: ExploreData = buildExploreData(
  Object.entries(files).map(([path, raw]) => ({ file: path.replace(/^\.\/data\//, ''), raw })),
  EXPLORE_MANIFESTS,
);
