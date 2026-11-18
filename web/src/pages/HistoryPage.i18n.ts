import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    title: 'History',
    ledeDemo: (limit: number) =>
      `Your Live runs, newest first (the last ${limit}). Open one to see it again, or export them as CSV, JSON or Markdown.`,
    ledeServer:
      'Every successful run the API has made, newest first, from its run database. That includes runs started outside this page, such as the experiments CLI. A run’s id is its correlation ID.',
    ledeBrowser: 'Mock mode keeps runs in this browser, newest first (the last 100). Open one to see it again, or export them as CSV, JSON or Markdown.',
    browserOnly:
      'History is kept only in this browser. The server stores no runs for this site, so another browser or device will not see them, and clearing site data removes them.',
    notSaved: 'Runs are not being saved.',
    storageUnavailable: 'Browser storage is unavailable.',
    notSavedBody: 'History works for this tab only and is lost when it closes. Export anything you want to keep.',
    show: 'Show',
    allRuns: 'All runs',
    exportAll: 'Export all runs',
    exporting: 'Exporting…',
    clear: 'Clear history',
    /** Clearing deletes every saved run; `everyKind` says so when the table shows one kind. */
    deleteAll: (n: number | null, f: string, everyKind: boolean) =>
      n === null
        ? 'Delete every saved run'
        : n === 1
          ? 'Delete the 1 saved run'
          : everyKind
            ? `Delete all ${f} runs of every kind`
            : `Delete all ${f} runs`,
    keep: 'Keep',
    cleared: 'History cleared.',
    emptyAll: 'No runs yet',
    emptyKind: (kind: string) => `No ${kind} runs yet`,
    runDiscovery: 'Run a discovery',
    askQuestion: 'Ask a question',
    exploreRecorded: 'Explore recorded discoveries',
    loadRecorded: 'Load the recorded runs',
    loading: 'Loading…',
    emptyDemo:
      'Each Ask, Discover and Compare run you make in Live mode is saved here, with its full result. Recorded runs are not saved: they are always one click away in Recorded mode.',
    emptyServer: 'The API saves each successful Ask, Discover and Compare run automatically, with its full result.',
    emptyBrowser: 'Each Ask, Discover and Compare run is saved here automatically, with its full result.',
    caption: 'Saved runs',
    searchLabel: 'Search runs by topic, question or id',
    searchPlaceholder: 'Search topics and questions',
    columns: { kind: 'Kind', run: 'Topics or question', when: 'When', quality: 'Quality' },
    untitled: 'Untitled run',
    mock: 'mock',
    count: (shown: number, total: number, f: (n: number) => string) =>
      shown === total ? (total === 1 ? '1 run' : `${f(total)} runs`) : `${f(shown)} of ${f(total)} runs`,
  },
  tr: {
    title: 'Geçmiş',
    ledeDemo: (limit: number) =>
      `Canlı çalıştırmalarınız, en yenisi başta (son ${limit} tanesi). Yeniden görmek için birini açın ya da hepsini CSV, JSON veya Markdown olarak dışa aktarın.`,
    ledeServer:
      'API’nin yaptığı her başarılı çalıştırma, en yenisi başta, çalıştırma veritabanından. Buna deney komut satırı aracı gibi bu sayfanın dışında başlatılanlar da dahildir. Bir çalıştırmanın kimliği, korelasyon kimliğidir.',
    ledeBrowser:
      'Örnek veri modu çalıştırmaları bu tarayıcıda tutar, en yenisi başta (son 100 tanesi). Yeniden görmek için birini açın ya da hepsini CSV, JSON veya Markdown olarak dışa aktarın.',
    browserOnly:
      'Geçmiş yalnızca bu tarayıcıda tutulur. Sunucu bu site için hiçbir çalıştırma saklamaz; bu yüzden başka bir tarayıcı ya da cihaz onları görmez ve site verilerini temizlemek onları siler.',
    notSaved: 'Çalıştırmalar kaydedilmiyor.',
    storageUnavailable: 'Tarayıcı depolaması kullanılamıyor.',
    notSavedBody: 'Geçmiş yalnızca bu sekmede çalışır ve sekme kapanınca kaybolur. Saklamak istediklerinizi dışa aktarın.',
    show: 'Göster',
    allRuns: 'Tüm çalıştırmalar',
    exportAll: 'Tüm çalıştırmaları dışa aktar',
    exporting: 'Dışa aktarılıyor…',
    clear: 'Geçmişi temizle',
    deleteAll: (n: number | null, f: string, everyKind: boolean) =>
      n === null
        ? 'Kayıtlı tüm çalıştırmaları sil'
        : n === 1
          ? 'Kayıtlı 1 çalıştırmayı sil'
          : everyKind
            ? `Tüm türlerdeki ${f} çalıştırmayı sil`
            : `${f} çalıştırmanın tümünü sil`,
    keep: 'Vazgeç',
    cleared: 'Geçmiş temizlendi.',
    emptyAll: 'Henüz çalıştırma yok',
    emptyKind: (kind: string) => `Henüz ${kind} çalıştırması yok`,
    runDiscovery: 'Bir keşif çalıştırın',
    askQuestion: 'Bir soru sorun',
    exploreRecorded: 'Kayıtlı keşifleri inceleyin',
    loadRecorded: 'Kayıtlı çalıştırmaları yükle',
    loading: 'Yükleniyor…',
    emptyDemo:
      'Canlı modda yaptığınız her Sor, Keşfet ve Karşılaştır çalıştırması tam sonucuyla buraya kaydedilir. Kayıtlı çalıştırmalar kaydedilmez: Kayıtlı modda her zaman bir tık uzaktadırlar.',
    emptyServer: 'API her başarılı Sor, Keşfet ve Karşılaştır çalıştırmasını tam sonucuyla kendiliğinden kaydeder.',
    emptyBrowser: 'Her Sor, Keşfet ve Karşılaştır çalıştırması tam sonucuyla buraya kendiliğinden kaydedilir.',
    caption: 'Kaydedilmiş çalıştırmalar',
    searchLabel: 'Çalıştırmaları konu, soru ya da kimliğe göre arayın',
    searchPlaceholder: 'Konu ve soru ara',
    columns: { kind: 'Tür', run: 'Konular ya da soru', when: 'Zaman', quality: 'Kalite' },
    untitled: 'Başlıksız çalıştırma',
    mock: 'örnek',
    count: (shown: number, total: number, f: (n: number) => string) =>
      shown === total ? `${f(total)} çalıştırma` : `${f(total)} çalıştırmadan ${f(shown)}`,
  },
});
