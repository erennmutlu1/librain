import { strings } from '../i18n/lang';
import type { Theme } from '../lib/theme';

type Health = 'checking' | 'up' | 'down';

export const text = strings({
  en: {
    skip: 'Skip to content',
    home: 'LIBRAIN home',
    sections: 'Sections',
    nav: {
      library: 'Library',
      ask: 'Ask',
      discover: 'Discover',
      explore: 'Explore',
      compare: 'Compare',
      history: 'History',
    },
    theme: { system: 'System theme', light: 'Light theme', dark: 'Dark theme' } as Record<Theme, string>,
    themeButton: {
      system: 'System theme. Switch to light theme',
      light: 'Light theme. Switch to dark theme',
      dark: 'Dark theme. Switch to system theme',
    } as Record<Theme, string>,
    palette: {
      button: 'Search',
      label: (shortcut: string) => `Search and jump to anything (${shortcut})`,
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
      recordedTitle: 'Real runs recorded in the repository. No keys, nothing billed.',
      liveTitle: 'Run your own inputs on the API with your own keys, billed to your accounts.',
      liveNow: (health: string) => `Live: ${health}`,
    },
    wake: 'Waking up the free server. The first request after a quiet spell can take up to a minute.',
    newTab: ' (opens in a new tab)',
    footer: {
      about: 'Ask questions of a paper corpus and audit every generated hypothesis, sentence by sentence.',
      recordedNote: 'The recorded runs are real outputs from the repository’s experiments folder.',
      links: 'Project links',
      source: 'Source code on GitHub',
      paper: 'Companion paper (Zenodo)',
      explained: 'Discoveries explained (PDF)',
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
      library: 'Kütüphane',
      ask: 'Sor',
      discover: 'Keşfet',
      explore: 'İncele',
      compare: 'Karşılaştır',
      history: 'Geçmiş',
    },
    theme: { system: 'Sistem teması', light: 'Açık tema', dark: 'Koyu tema' },
    themeButton: {
      system: 'Sistem teması. Açık temaya geç',
      light: 'Açık tema. Koyu temaya geç',
      dark: 'Koyu tema. Sistem temasına geç',
    },
    palette: {
      button: 'Ara',
      label: (shortcut: string) => `Ara ve istediğiniz yere gidin (${shortcut})`,
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
      recorded: 'Kayıtlı',
      live: 'Canlı',
      recordedTitle: 'Depoda kayıtlı gerçek çalıştırmalar. Anahtar gerekmez, ücret alınmaz.',
      liveTitle: 'Kendi girdilerinizi kendi anahtarlarınızla API’de çalıştırın; ücreti kendi hesaplarınıza yansır.',
      liveNow: (health: string) => `Canlı: ${health}`,
    },
    wake: 'Ücretsiz sunucu uyandırılıyor. Bir süre istek gelmediyse ilk isteğin yanıtı bir dakikayı bulabilir.',
    newTab: ' (yeni sekmede açılır)',
    footer: {
      about: 'Bir makale derlemine soru sorun ve üretilen her hipotezi cümle cümle denetleyin.',
      recordedNote: 'Kayıtlı çalıştırmalar, deponun experiments klasöründeki gerçek çıktılardır.',
      links: 'Proje bağlantıları',
      source: 'GitHub’da kaynak kod',
      paper: 'Eşlik eden makale (Zenodo)',
      explained: 'Keşiflerin açıklaması (PDF)',
      legalBefore: '',
      licence: 'MIT lisansıyla',
      legalAfter: ' açık kaynaktır ve olduğu gibi sunulur.',
    },
  },
});
