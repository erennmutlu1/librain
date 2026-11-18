import { strings } from '../i18n/lang';
import type { Theme } from '../lib/theme';

export type PaletteSection = 'library' | 'ask' | 'discover' | 'featured' | 'explore' | 'stats' | 'quiz' | 'compare' | 'history';

interface Entry {
  label: string;
  hint: string;
}

export const text = strings({
  en: {
    title: 'Command palette',
    input: 'Search sections, actions and discoveries',
    placeholder: 'Search, or type topics to discover…',
    close: 'Close',
    results: 'Results',
    count: (n: number) => (n === 1 ? '1 result' : `${n} results`),
    empty: 'No matches. Type at least two letters to start a discovery.',
    groups: { go: 'Go to', actions: 'Actions', discoveries: 'Discoveries', picks: 'Editor’s picks', discover: 'Discover' },
    sections: {
      library: { label: 'Library', hint: 'The papers in the corpus' },
      ask: { label: 'Ask', hint: 'Question the papers, with citations' },
      discover: { label: 'Discover', hint: 'A new hypothesis from two topics' },
      featured: { label: 'Featured discoveries', hint: 'Recorded runs worth reading first' },
      explore: { label: 'Explore', hint: 'All 46 recorded discoveries' },
      stats: { label: 'Explore statistics', hint: 'Charts across every recorded run' },
      quiz: { label: 'Spot the risk', hint: 'Quiz: find the risky sentence' },
      compare: { label: 'Compare', hint: 'LIBRAIN against two baselines' },
      history: { label: 'History', hint: 'Your past runs' },
    } as Record<PaletteSection, Entry>,
    language: { label: 'Switch to Turkish', hint: 'Türkçe' },
    theme: {
      light: 'Switch to the light theme',
      dark: 'Switch to the dark theme',
    } as Record<Theme, string>,
    themeNow: { light: 'Now: light theme', dark: 'Now: dark theme' } as Record<Theme, string>,
    recorded: { label: 'Switch to Recorded runs', hint: 'No keys, nothing billed' },
    live: { label: 'Switch to Live mode', hint: 'Runs on your own API keys' },
    keys: { label: 'Open your API keys', hint: 'Add, check or clear your keys' },
    discoverTyped: (q: string) => `Discover: ${q}`,
    discoverHint: 'Open Discover with this as Topic A',
    loading: 'Loading the discoveries…',
    failed: 'The discoveries could not be loaded.',
    keysHint: { move: 'move', open: 'open', close: 'close' },
  },
  tr: {
    title: 'Komut paleti',
    input: 'Bölüm, eylem ve keşif arayın',
    placeholder: 'Arayın ya da keşfetmek için konu yazın…',
    close: 'Kapat',
    results: 'Sonuçlar',
    count: (n: number) => `${n} sonuç`,
    empty: 'Eşleşme yok. Keşif başlatmak için en az iki harf yazın.',
    groups: { go: 'Git', actions: 'Eylemler', discoveries: 'Keşifler', picks: 'Editörün seçimi', discover: 'Keşfet' },
    sections: {
      library: { label: 'Kütüphane', hint: 'Derlemdeki makaleler' },
      ask: { label: 'Sor', hint: 'Makalelere kaynak göstererek soru sorun' },
      discover: { label: 'Keşfet', hint: 'İki konudan yeni bir hipotez' },
      featured: { label: 'Öne çıkan keşifler', hint: 'Önce okunmaya değer kayıtlı çalıştırmalar' },
      explore: { label: 'İncele', hint: 'Kayıtlı 46 keşfin tümü' },
      stats: { label: 'Keşif istatistikleri', hint: 'Tüm kayıtlı çalıştırmaların grafikleri' },
      quiz: { label: 'Riski bul', hint: 'Test: riskli cümleyi bulun' },
      compare: { label: 'Karşılaştır', hint: 'LIBRAIN ve iki temel yöntem' },
      history: { label: 'Geçmiş', hint: 'Önceki çalıştırmalarınız' },
    },
    language: { label: 'İngilizceye geç', hint: 'English' },
    theme: {
      light: 'Açık temaya geç',
      dark: 'Koyu temaya geç',
    },
    themeNow: { light: 'Şu an: açık tema', dark: 'Şu an: koyu tema' },
    recorded: { label: 'Kayıtlı çalıştırmalara geç', hint: 'Anahtar gerekmez, ücret alınmaz' },
    live: { label: 'Canlı moda geç', hint: 'Kendi API anahtarlarınızla çalışır' },
    keys: { label: 'API anahtarlarınızı açın', hint: 'Anahtar ekleyin, denetleyin ya da silin' },
    discoverTyped: (q: string) => `Keşfet: ${q}`,
    discoverHint: 'Bunu Konu A olarak Keşfet’te açın',
    loading: 'Keşifler yükleniyor…',
    failed: 'Keşifler yüklenemedi.',
    keysHint: { move: 'gezin', open: 'aç', close: 'kapat' },
  },
});
