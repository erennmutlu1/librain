import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    source: (n: number) => `Source ${n}`,
    close: 'Close source panel',
    section: 'Section',
    page: 'Page',
    chunk: 'Cited passage',
    notRecorded: 'Not recorded',
    passage: 'Passage text',
    noPassage: 'No passage text came back for this citation (runs recorded before the API returned passages have none).',
  },
  tr: {
    source: (n: number) => `Kaynak ${n}`,
    close: 'Kaynak panelini kapat',
    section: 'Bölüm',
    page: 'Sayfa',
    chunk: 'Atıf yapılan parça',
    notRecorded: 'Kaydedilmedi',
    passage: 'Parça metni',
    noPassage: 'Bu atıf için parça metni gelmedi (API parça metinlerini döndürmeye başlamadan önce kaydedilen çalıştırmalarda yoktur).',
  },
});
