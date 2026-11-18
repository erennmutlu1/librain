import { strings } from '../i18n/lang';
import { libraryCounts } from '../lib/library';

const en = libraryCounts('en');
const tr = libraryCounts('tr');

export const text = strings({
  en: {
    title: 'Papers',
    ledeIdle: 'The papers LIBRAIN can search. Ask, New idea and Compare all take their evidence from here.',
    ledeEmpty: 'No papers yet.',
    /**
     * Recorded mode lists the ids the recorded runs cite. `older` of them come
     * from the 13-paper library the baseline comparison ran on.
     */
    ledeRecorded: (today: string, cited: string, current: string, older: string) =>
      `Today’s library has ${today} papers; the recorded runs cite ${cited} paper IDs: ${current} from today’s library and ${older} from an earlier, smaller library (13 papers) used to compare LIBRAIN with simpler systems.`,
    ledeLive: (papers: string, passages: string) =>
      `${papers} papers, split into ${passages} passages. Ask, New idea and Compare all search this library.`,
    /** PUBLIC_CORPUS_NOTE below is this English text; the numbers come from src/lib/library.ts. */
    corpusNote: `The public paper library is read-only: ${en.papers} papers, ${en.passages} passages.`,
    papers: 'Paper list',
    caption: 'Papers in the library',
    searchLabel: 'Search papers by ID, title or author',
    searchPlaceholder: 'Search by ID, title or author',
    count: (shown: number, total: number, f: (n: number) => string) =>
      shown === total ? (total === 1 ? '1 paper' : `${f(total)} papers`) : `${f(shown)} of ${f(total)} papers`,
    footnoteRecorded:
      'Recorded mode lists every paper ID the recorded runs cite. Titles, authors and years come from a fixed list of the library’s papers, and are left empty where no source gives them. Passage counts are lower bounds (the highest cited passage number plus one).',
    footnoteMock:
      'Mock mode: the API snapshot’s paper plus every paper ID the recorded runs cite. Titles, authors and years come from a fixed list of the library’s papers; passage counts are lower bounds (the highest cited passage number plus one).',
    footnoteAuthors: 'Authors and year are filled in for papers added from arXiv; uploaded PDFs rarely carry them.',
    earlier: 'earlier library',
    earlierTitle: 'Not in today’s library: an earlier, 13-paper library had this ID.',
    loading: 'Loading papers…',
    emptyTitle: 'The library is empty',
    emptyBody: 'Upload a PDF or add an arXiv paper to start. Every paper you add can be searched from Ask, New idea and Compare.',
    deleted: (id: string) => `Deleted ${id}.`,
    columns: { paper: 'Paper', authors: 'Authors', year: 'Year', chunks: 'Passages', added: 'Added', actions: 'Actions' },
    csv: {
      paperId: 'Paper ID',
      title: 'Title',
      authors: 'Authors',
      year: 'Year',
      chunks: 'Passages',
      added: 'Added (UTC)',
      arxiv: 'arXiv link',
    },
    onArxiv: (id: string) => `${id} on arXiv (opens in a new tab)`,
    deleteLabel: (id: string) => `Delete ${id}`,
    confirmBefore: 'Delete ',
    confirmAfter: (chunks: string) => ` and its ${chunks} passages from the library? Saved runs that cite it are kept.`,
    deleting: 'Deleting…',
    deletePaper: 'Delete paper',
    keep: 'Keep',
  },
  tr: {
    title: 'Makaleler',
    ledeIdle: 'LIBRAIN’in arayabildiği makaleler. Sor, Yeni fikir ve Karşılaştır kanıtlarını buradan alır.',
    ledeEmpty: 'Henüz makale yok.',
    ledeRecorded: (today: string, cited: string, current: string, older: string) =>
      `Bugünkü makale kütüphanesinde ${today} makale var; hazır çalıştırmalar ${cited} makale kimliğine atıf yapıyor: bugünkü kütüphaneden ${current} makale ve LIBRAIN’i daha basit sistemlerle karşılaştırmak için kullanılan daha eski, küçük bir kütüphaneden (13 makale) ${older} kimlik.`,
    ledeLive: (papers: string, passages: string) =>
      `${papers} makale, ${passages} parçaya bölünmüş durumda. Sor, Yeni fikir ve Karşılaştır bu kütüphanede arar.`,
    corpusNote: `Herkese açık makale kütüphanesi salt okunurdur: ${tr.papers} makale, ${tr.passages} parça.`,
    papers: 'Makale listesi',
    caption: 'Kütüphanedeki makaleler',
    searchLabel: 'Makaleleri kimlik, başlık ya da yazara göre arayın',
    searchPlaceholder: 'Kimlik, başlık ya da yazar ara',
    count: (shown: number, total: number, f: (n: number) => string) =>
      shown === total ? `${f(total)} makale` : `${f(total)} makaleden ${f(shown)}`,
    footnoteRecorded:
      'Hazır mod, hazır çalıştırmaların atıf yaptığı her makale kimliğini listeler. Başlık, yazar ve yıl, kütüphanedeki makalelerin sabit bir listesinden gelir; hiçbir kaynağın vermediği yerler boş kalır. Parça sayıları alt sınırdır (atıf yapılan en yüksek parça numarası artı bir).',
    footnoteMock:
      'Örnek veri modu: API anlık görüntüsündeki makale ve hazır çalıştırmaların atıf yaptığı her makale kimliği. Başlık, yazar ve yıl, kütüphanedeki makalelerin sabit bir listesinden gelir; parça sayıları alt sınırdır (atıf yapılan en yüksek parça numarası artı bir).',
    footnoteAuthors: 'Yazar ve yıl, arXiv’den eklenen makalelerde dolu gelir; yüklenen PDF’lerde nadiren bulunur.',
    earlier: 'önceki kütüphane',
    earlierTitle: 'Bugünkü kütüphanede yok: bu kimlik, 13 makalelik önceki bir kütüphanedeydi.',
    loading: 'Makaleler yükleniyor…',
    emptyTitle: 'Kütüphane boş',
    emptyBody: 'Başlamak için bir PDF yükleyin ya da arXiv’den bir makale ekleyin. Eklediğiniz her makale Sor, Yeni fikir ve Karşılaştır’da aranabilir.',
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
    confirmAfter: (chunks: string) => ` ve ${chunks} parçası kütüphaneden silinsin mi? Ona atıf yapan kaydedilmiş çalıştırmalar korunur.`,
    deleting: 'Siliniyor…',
    deletePaper: 'Makaleyi sil',
    keep: 'Vazgeç',
  },
});

/** The library the public API serves (src/lib/library.ts), in English; the screen shows the reader's language. */
export const PUBLIC_CORPUS_NOTE = text.en.corpusNote;
