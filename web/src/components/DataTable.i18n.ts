import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    clearSearch: 'Clear search',
    /** `n` decides the plural; `f` is the same number formatted for the locale. */
    rows: (n: number, f: string) => (n === 1 ? '1 row' : `${f} rows`),
    showing: (shown: string, total: string) => `${shown} of ${total}`,
    noMatches: (q: string) => `Nothing matches “${q}”`,
    noMatchesHint: 'Try fewer letters or another word. Search ignores case and accents.',
    sortedBy: (column: string, ascending: boolean) => `, sorted by ${column}, ${ascending ? 'ascending' : 'descending'}`,
    filteredBy: (q: string) => `, filtered by “${q}”`,
    csv: 'CSV',
    exportCsv: (n: number, f: string) => (n === 1 ? 'Export 1 row as CSV' : `Export the ${f} rows shown as CSV`),
  },
  tr: {
    clearSearch: 'Aramayı temizle',
    rows: (_n: number, f: string) => `${f} satır`,
    showing: (shown: string, total: string) => `${total} satırdan ${shown}`,
    noMatches: (q: string) => `“${q}” için sonuç yok`,
    noMatchesHint: 'Daha az harf ya da başka bir sözcük deneyin. Arama büyük/küçük harfe ve aksanlara bakmaz.',
    sortedBy: (column: string, ascending: boolean) => `, ${column} sütununa göre ${ascending ? 'artan' : 'azalan'} sıralı`,
    filteredBy: (q: string) => `, “${q}” ile filtrelenmiş`,
    csv: 'CSV',
    exportCsv: (_n: number, f: string) => `Gösterilen ${f} satırı CSV olarak dışa aktar`,
  },
});
