import { strings } from '../i18n/lang';
import type { Theme } from '../lib/theme';

type Health = 'checking' | 'up' | 'down';

export const text = strings({
  en: {
    skip: 'Skip to content',
    home: 'LIBRAIN home',
    sections: 'Sections',
    nav: {
      explore: 'Ideas',
      discover: 'New idea',
      ask: 'Ask',
      compare: 'Compare',
      library: 'Papers',
      history: 'History',
    },
    theme: { light: 'Light theme', dark: 'Dark theme' } as Record<Theme, string>,
    themeButton: {
      light: 'Light theme. Switch to dark theme',
      dark: 'Dark theme. Switch to light theme',
    } as Record<Theme, string>,
    themeAction: { light: 'Switch to dark theme', dark: 'Switch to light theme' } as Record<Theme, string>,
    palette: {
      button: 'Search',
      label: (shortcut: string) => `Quick search (${shortcut})`,
    },
    more: {
      button: 'Menu',
      language: 'Language',
      theme: 'Theme',
    },
    mock: {
      badge: 'Mock data',
      title: 'Responses are recorded runs from the repository’s experiments folder. Set VITE_USE_MOCKS=false to call the API.',
      hidden: ': responses are recorded runs, the API is not called',
    },
    status: { checking: 'Checking API', up: 'API connected', down: 'API unreachable' } as Record<Health, string>,
    health: { checking: 'checking the API', up: 'API connected', down: 'API unreachable' } as Record<Health, string>,
    mode: {
      group: 'Data source',
      recorded: 'Recorded',
      live: 'Live',
      recordedTitle: 'Saved runs from the experiments. Free, no API keys.',
      liveTitle: 'Your own topics, run with your own API keys.',
      liveNow: (health: string) => `Live: ${health}`,
    },
    wake: 'Waking up the free server. The first request after a quiet spell can take up to a minute.',
    newTab: ' (opens in a new tab)',
    footer: {
      about: 'Ask questions of a library of research papers and get new ideas, with every sentence checked.',
      recordedNote: 'Recorded runs are real results saved from the project’s experiments.',
      links: 'Project links',
      source: 'Source code on GitHub',
      paper: 'Companion paper (Zenodo)',
      explained: 'Ideas explained (PDF)',
      legalBefore: 'Open source under the ',
      licence: 'MIT licence',
      legalAfter: ', provided as is.',
    },
  },
  tr: {
    skip: 'İçeriğe geç',
    home: 'LIBRAIN ana sayfa',
    sections: 'Bölümler',
    nav: {
      explore: 'Fikirler',
      discover: 'Yeni fikir',
      ask: 'Sor',
      compare: 'Karşılaştır',
      library: 'Makaleler',
      history: 'Geçmiş',
    },
    theme: { light: 'Açık tema', dark: 'Koyu tema' },
    themeButton: {
      light: 'Açık tema. Koyu temaya geç',
      dark: 'Koyu tema. Açık temaya geç',
    },
    themeAction: { light: 'Koyu temaya geç', dark: 'Açık temaya geç' },
    palette: {
      button: 'Ara',
      label: (shortcut: string) => `Hızlı arama (${shortcut})`,
    },
    more: {
      button: 'Menü',
      language: 'Dil',
      theme: 'Tema',
    },
    mock: {
      badge: 'Örnek veri',
      title: 'Yanıtlar, deponun experiments klasöründeki kayıtlı çalıştırmalardır. API’yi çağırmak için VITE_USE_MOCKS=false ayarlayın.',
      hidden: ': yanıtlar kayıtlı çalıştırmalardır, API çağrılmaz',
    },
    status: { checking: 'API denetleniyor', up: 'API bağlı', down: 'API’ye ulaşılamıyor' },
    health: { checking: 'API denetleniyor', up: 'API bağlı', down: 'API’ye ulaşılamıyor' },
    mode: {
      group: 'Veri kaynağı',
      recorded: 'Hazır',
      live: 'Canlı',
      recordedTitle: 'Deneylerden kaydedilmiş çalıştırmalar. Ücretsiz, API key gerekmez.',
      liveTitle: 'Kendi konularınız, kendi API key’lerinizle.',
      liveNow: (health: string) => `Canlı: ${health}`,
    },
    wake: 'Ücretsiz sunucu uyandırılıyor. Bir süre istek gelmediyse ilk isteğin yanıtı bir dakikayı bulabilir.',
    newTab: ' (yeni sekmede açılır)',
    footer: {
      about: 'Bir makale kütüphanesine soru sorun ve her cümlesi kontrol edilmiş yeni fikirler alın.',
      recordedNote: 'Hazır çalıştırmalar, projenin deneylerinden kaydedilmiş gerçek sonuçlardır.',
      links: 'Proje bağlantıları',
      source: 'GitHub’da kaynak kod',
      paper: 'Proje makalesi (Zenodo)',
      explained: 'Fikirlerin açıklaması (PDF)',
      legalBefore: '',
      licence: 'MIT lisansıyla',
      legalAfter: ' açık kaynaktır ve olduğu gibi sunulur.',
    },
  },
});
