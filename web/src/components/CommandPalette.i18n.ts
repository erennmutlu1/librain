import { strings } from '../i18n/lang';
import type { Theme } from '../lib/theme';

export type PaletteSection = 'home' | 'explore' | 'featured' | 'stats' | 'quiz' | 'discover' | 'ask' | 'compare' | 'library' | 'history';

interface Entry {
  label: string;
  hint: string;
}

export const text = strings({
  en: {
    title: 'Quick search',
    input: 'Search sections, actions and ideas',
    placeholder: 'Search, or type a topic for a new idea…',
    close: 'Close',
    results: 'Results',
    count: (n: number) => (n === 1 ? '1 result' : `${n} results`),
    empty: 'No matches. Type at least two letters to start a new idea.',
    groups: { go: 'Go to', actions: 'Actions', discoveries: 'Ideas', picks: 'Editor’s picks', discover: 'New idea' },
    sections: {
      home: { label: 'Home', hint: 'What LIBRAIN is and how it works' },
      explore: { label: 'Ideas', hint: 'All 46 recorded ideas, checked sentence by sentence' },
      featured: { label: 'Featured ideas', hint: 'Recorded ideas worth reading first' },
      stats: { label: 'Idea statistics', hint: 'Charts across all the recorded ideas' },
      quiz: { label: 'Spot the risk', hint: 'Quiz: find the risky sentence' },
      discover: { label: 'New idea', hint: 'Pick two topics and get a new idea' },
      ask: { label: 'Ask', hint: 'Ask the papers a question and see the passages used' },
      compare: { label: 'Compare', hint: 'LIBRAIN against two simpler systems' },
      library: { label: 'Papers', hint: 'The papers LIBRAIN reads from' },
      history: { label: 'History', hint: 'Your past runs' },
    } as Record<PaletteSection, Entry>,
    language: { label: 'Switch to Turkish', hint: 'Türkçe' },
    theme: {
      light: 'Switch to the light theme',
      dark: 'Switch to the dark theme',
    } as Record<Theme, string>,
    themeNow: { light: 'Now: light theme', dark: 'Now: dark theme' } as Record<Theme, string>,
    recorded: { label: 'Switch to Recorded', hint: 'Free, no API keys' },
    live: { label: 'Switch to Live', hint: 'Runs on your own API keys, billed to your accounts' },
    keys: { label: 'Open your API keys', hint: 'Add, check or clear your keys' },
    discoverTyped: (q: string) => `New idea: ${q}`,
    discoverHint: 'Open New idea with this as Topic A',
    loading: 'Loading the ideas…',
    failed: 'The ideas could not be loaded.',
    keysHint: { move: 'move', open: 'open', close: 'close' },
  },
  tr: {
    title: 'Hızlı arama',
    input: 'Bölüm, eylem ve fikir arayın',
    placeholder: 'Arayın ya da yeni fikir için bir konu yazın…',
    close: 'Kapat',
    results: 'Sonuçlar',
    count: (n: number) => `${n} sonuç`,
    empty: 'Eşleşme yok. Yeni bir fikir başlatmak için en az iki harf yazın.',
    groups: { go: 'Git', actions: 'Eylemler', discoveries: 'Fikirler', picks: 'Editörün seçimi', discover: 'Yeni fikir' },
    sections: {
      home: { label: 'Ana sayfa', hint: 'LIBRAIN nedir, nasıl çalışır' },
      explore: { label: 'Fikirler', hint: 'Kayıtlı 46 fikrin tümü, cümle cümle kontrol edilmiş' },
      featured: { label: 'Öne çıkan fikirler', hint: 'Önce okunmaya değer kayıtlı fikirler' },
      stats: { label: 'Fikir istatistikleri', hint: 'Tüm kayıtlı fikirlerin grafikleri' },
      quiz: { label: 'Riski bul', hint: 'Test: riskli cümleyi bulun' },
      discover: { label: 'Yeni fikir', hint: 'İki konu seçin, yeni bir fikir alın' },
      ask: { label: 'Sor', hint: 'Makalelere soru sorun, kullanılan parçaları görün' },
      compare: { label: 'Karşılaştır', hint: 'LIBRAIN ve iki basit referans sistem' },
      library: { label: 'Makaleler', hint: 'LIBRAIN’in okuduğu makaleler' },
      history: { label: 'Geçmiş', hint: 'Önceki çalıştırmalarınız' },
    },
    language: { label: 'İngilizceye geç', hint: 'English' },
    theme: {
      light: 'Açık temaya geç',
      dark: 'Koyu temaya geç',
    },
    themeNow: { light: 'Şu an: açık tema', dark: 'Şu an: koyu tema' },
    recorded: { label: 'Hazır moda geç', hint: 'Ücretsiz, API key gerekmez' },
    live: { label: 'Canlı moda geç', hint: 'Kendi API key’lerinizle çalışır; ücreti hesaplarınıza yansır' },
    keys: { label: 'API key’lerinizi yönetin', hint: 'API key ekleyin, kontrol edin ya da silin' },
    discoverTyped: (q: string) => `Yeni fikir: ${q}`,
    discoverHint: 'Yeni fikir formunda Konu A olarak açın',
    loading: 'Fikirler yükleniyor…',
    failed: 'Fikirler yüklenemedi.',
    keysHint: { move: 'gezin', open: 'aç', close: 'kapat' },
  },
});
