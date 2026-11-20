import { strings } from './i18n/lang';

/** Document titles: "<Section> · LIBRAIN" on every route; the home page leads with the name. */
export const text = strings({
  en: {
    home: 'LIBRAIN · Research ideas, every sentence checked',
    sections: {
      library: 'Library',
      ask: 'Ask',
      discover: 'Discover',
      featured: 'Featured ideas',
      explore: 'Explore',
      stats: 'Idea statistics',
      quiz: 'Spot the risk',
      compare: 'Compare',
      history: 'History',
      run: 'Run',
      notFound: 'Page not found',
    },
    featuredOne: 'Featured idea',
    idea: (id: string) => `Idea ${id}`,
    loading: 'Loading',
  },
  tr: {
    home: 'LIBRAIN · Her cümlesi kontrol edilmiş araştırma fikirleri',
    sections: {
      library: 'Kütüphane',
      ask: 'Sor',
      discover: 'Keşfet',
      featured: 'Öne çıkan fikirler',
      explore: 'Fikirler',
      stats: 'Fikir istatistikleri',
      quiz: 'Riski bul',
      compare: 'Karşılaştır',
      history: 'Geçmiş',
      run: 'Çalıştırma',
      notFound: 'Sayfa bulunamadı',
    },
    featuredOne: 'Öne çıkan fikir',
    idea: (id: string) => `Fikir ${id}`,
    loading: 'Yükleniyor',
  },
});
