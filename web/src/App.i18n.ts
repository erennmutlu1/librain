import { strings } from './i18n/lang';

export const text = strings({
  en: {
    titles: {
      '/library': 'Library',
      '/ask': 'Ask',
      '/discover': 'Discover',
      '/discover/featured': 'Featured discoveries',
      '/explore': 'Explore',
      '/explore/stats': 'Explore statistics',
      '/explore/quiz': 'Spot the risk',
      '/compare': 'Compare',
      '/history': 'History',
    } as Record<string, string>,
    run: 'Run',
    featured: 'Featured discovery',
    discovery: (id: string) => `Discovery ${id}`,
    loading: 'Loading',
  },
  tr: {
    titles: {
      '/library': 'Kütüphane',
      '/ask': 'Sor',
      '/discover': 'Keşfet',
      '/discover/featured': 'Öne çıkan keşifler',
      '/explore': 'İncele',
      '/explore/stats': 'Keşif istatistikleri',
      '/explore/quiz': 'Riski bul',
      '/compare': 'Karşılaştır',
      '/history': 'Geçmiş',
    },
    run: 'Çalıştırma',
    featured: 'Öne çıkan keşif',
    discovery: (id: string) => `Keşif ${id}`,
    loading: 'Yükleniyor',
  },
});
