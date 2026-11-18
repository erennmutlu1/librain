import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    none: 'No supporting evidence survived the citation contract.',
    direct: 'Directly supports the hypothesis',
    other: 'Supports by analogy from another domain',
    page: (n: number) => `page ${n}`,
    notRecorded: 'Section not recorded',
    /** Backend support types shown on the tag; unknown ones are shown as sent. */
    supportTypes: { direct: 'direct', analogous: 'analogous', analogy: 'analogy' } as Record<string, string>,
  },
  tr: {
    none: 'Atıf sözleşmesinden sağ çıkan destekleyici kanıt yok.',
    direct: 'Hipotezi doğrudan destekliyor',
    other: 'Başka bir alandan analojiyle destekliyor',
    page: (n: number) => `sayfa ${n}`,
    notRecorded: 'Bölüm kaydedilmedi',
    supportTypes: { direct: 'doğrudan', analogous: 'analojik', analogy: 'analoji' },
  },
});
