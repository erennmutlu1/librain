import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    title: 'Library',
    ledeIdle: 'The papers LIBRAIN can search. Ask, Discover and Compare all draw their evidence from here.',
    ledeEmpty: 'No papers yet.',
    ledeRecorded: (papers: string) =>
      `The recorded runs cite ${papers} papers, some of them from the earlier, smaller corpora the runs were made on. Switch to Live to list today’s corpus.`,
    ledeLive: (papers: string, chunks: string) => `${papers} papers, ${chunks} chunks in the vector store. Ask, Discover and Compare all search this collection.`,
    /** Keep in step with PUBLIC_CORPUS_NOTE in LibraryPage.tsx. */
    corpusNote: 'The public corpus is read-only: 55 papers, 2,210 chunks.',
    papers: 'Papers',
    caption: 'Papers in the library',
    searchLabel: 'Search papers by ID, title or author',
    searchPlaceholder: 'Search by ID, title or author',
    count: (shown: number, total: number, f: (n: number) => string) =>
      shown === total ? (total === 1 ? '1 paper' : `${f(total)} papers`) : `${f(shown)} of ${f(total)} papers`,
    footnoteRecorded:
      'Recorded mode: every paper id the recorded runs cite. Titles are unknown for those, and chunk counts are lower bounds (highest cited chunk index plus one). Switch to Live to list the whole corpus.',
    footnoteMock:
      'Mock mode: the API snapshot’s paper plus every paper id the recorded runs cite. Titles are unknown for those, and chunk counts are lower bounds (highest cited chunk index plus one).',
    footnoteAuthors: 'Authors and year are filled in for papers ingested from arXiv; uploaded PDFs rarely carry them.',
    loading: 'Loading papers…',
    emptyTitle: 'The library is empty',
    emptyBody: 'Upload a PDF or ingest an arXiv paper to start. Every paper you add becomes searchable from Ask, Discover and Compare.',
    deleted: (id: string) => `Deleted ${id}.`,
    columns: { paper: 'Paper', authors: 'Authors', year: 'Year', chunks: 'Chunks', added: 'Added', actions: 'Actions' },
    csv: {
      paperId: 'Paper ID',
      title: 'Title',
      authors: 'Authors',
      year: 'Year',
      chunks: 'Chunks',
      added: 'Added (UTC)',
      arxiv: 'arXiv link',
    },
    onArxiv: (id: string) => `${id} on arXiv (opens in a new tab)`,
    deleteLabel: (id: string) => `Delete ${id}`,
    confirmBefore: 'Delete ',
    confirmAfter: (chunks: string) => ` and its ${chunks} chunks from the vector store? Saved runs that cite it are kept.`,
    deleting: 'Deleting…',
    deletePaper: 'Delete paper',
    keep: 'Keep',
  },
  tr: {
    title: 'Kütüphane',
    ledeIdle: 'LIBRAIN’in arayabildiği makaleler. Sor, Keşfet ve Karşılaştır kanıtlarını buradan alır.',
    ledeEmpty: 'Henüz makale yok.',
    ledeRecorded: (papers: string) =>
      `Kayıtlı çalıştırmalar ${papers} makaleyi kaynak gösteriyor; bazıları çalıştırmaların yapıldığı daha eski ve küçük derlemlerden. Bugünkü derlemi listelemek için Canlı moda geçin.`,
    ledeLive: (papers: string, chunks: string) =>
      `Vektör deposunda ${papers} makale, ${chunks} parça var. Sor, Keşfet ve Karşılaştır bu koleksiyonda arar.`,
    corpusNote: 'Herkese açık derlem salt okunurdur: 55 makale, 2.210 parça.',
    papers: 'Makaleler',
    caption: 'Kütüphanedeki makaleler',
    searchLabel: 'Makaleleri kimlik, başlık ya da yazara göre arayın',
    searchPlaceholder: 'Kimlik, başlık ya da yazar ara',
    count: (shown: number, total: number, f: (n: number) => string) =>
      shown === total ? `${f(total)} makale` : `${f(total)} makaleden ${f(shown)}`,
    footnoteRecorded:
      'Kayıtlı mod: kayıtlı çalıştırmaların kaynak gösterdiği her makale kimliği. Bunların başlıkları bilinmiyor; parça sayıları da alt sınırdır (kaynak gösterilen en yüksek parça sırası artı bir). Tüm derlemi listelemek için Canlı moda geçin.',
    footnoteMock:
      'Örnek veri modu: API anlık görüntüsündeki makale ve kayıtlı çalıştırmaların kaynak gösterdiği her makale kimliği. Bunların başlıkları bilinmiyor; parça sayıları da alt sınırdır (kaynak gösterilen en yüksek parça sırası artı bir).',
    footnoteAuthors: 'Yazar ve yıl, arXiv’den alınan makalelerde dolu gelir; yüklenen PDF’lerde nadiren bulunur.',
    loading: 'Makaleler yükleniyor…',
    emptyTitle: 'Kütüphane boş',
    emptyBody: 'Başlamak için bir PDF yükleyin ya da arXiv’den bir makale alın. Eklediğiniz her makale Sor, Keşfet ve Karşılaştır’da aranabilir olur.',
    deleted: (id: string) => `${id} silindi.`,
    columns: { paper: 'Makale', authors: 'Yazarlar', year: 'Yıl', chunks: 'Parça', added: 'Eklenme', actions: 'İşlemler' },
    csv: {
      paperId: 'Makale kimliği',
      title: 'Başlık',
      authors: 'Yazarlar',
      year: 'Yıl',
      chunks: 'Parça',
      added: 'Eklenme (UTC)',
      arxiv: 'arXiv bağlantısı',
    },
    onArxiv: (id: string) => `arXiv’de ${id} (yeni sekmede açılır)`,
    deleteLabel: (id: string) => `${id} makalesini sil`,
    confirmBefore: '',
    confirmAfter: (chunks: string) => ` ve ${chunks} parçası vektör deposundan silinsin mi? Onu kaynak gösteren kayıtlı çalıştırmalar korunur.`,
    deleting: 'Siliniyor…',
    deletePaper: 'Makaleyi sil',
    keep: 'Vazgeç',
  },
});
