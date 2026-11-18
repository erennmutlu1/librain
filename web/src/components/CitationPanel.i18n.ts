import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    source: (n: number) => `Source ${n}`,
    close: 'Close source panel',
    section: 'Section',
    page: 'Page',
    chunk: 'Chunk',
    notRecorded: 'Not recorded',
    passage: 'Passage',
    noPassage: 'No passage text came back for this citation (runs recorded before the API returned passages have none).',
  },
  tr: {
    source: (n: number) => `Kaynak ${n}`,
    close: 'Kaynak panelini kapat',
    section: 'Bölüm',
    page: 'Sayfa',
    chunk: 'Parça',
    notRecorded: 'Kaydedilmedi',
    passage: 'Pasaj',
    noPassage: 'Bu atıf için pasaj metni gelmedi (API pasajları döndürmeden önce kaydedilen çalıştırmalarda yoktur).',
  },
});
