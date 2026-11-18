import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    title: 'Compare',
    lede: 'Run one topic pair through LIBRAIN and two simpler systems to compare against (baselines) from the companion paper. All three are scored by the same judge model, so differences come from the systems, not the judge.',
    explainer: 'What differs between the systems',
    hintA: 'For example: drug discovery',
    hintB: 'For example: climate adaptation',
    serverModel: 'LIBRAIN runs with the server’s default model; the baselines are scored by the same judge model.',
    recordedTip: 'Recorded mode replays only the recorded pairs. Pick a topic from the suggestions and its partner fills in.',
    liveCost: 'Live mode: Compare runs three systems with your API keys, so it costs more than a single idea.',
    submit: 'Compare',
    submitting: 'Comparing…',
    modEnterAction: 'compare',
    emptyTitle: 'Nothing compared yet',
    emptyBody:
      'The three systems run at the same time on the server. Scores line up in one table; Naive RAG citations that point outside its retrieved passages are marked as fabricated. If one system fails, the other two still show.',
    runningTitle: 'Comparing three systems',
    runningExpectation: 'All three run at the same time; LIBRAIN usually takes the longest, 15–30 s.',
    perTopic: (k: number) => `${k} passages per topic`,
    inTotal: (duration: string) => `${duration} in total`,
  },
  tr: {
    title: 'Karşılaştır',
    lede: 'Bir konu çiftini LIBRAIN’den ve eşlik eden makaledeki iki referans sistemden (karşılaştırma için kullanılan daha basit sistemler) geçirin. Üçünü de aynı değerlendirici model puanlar; farklar değerlendiriciden değil, sistemlerden gelir.',
    explainer: 'Sistemler arasındaki farklar',
    hintA: 'Örneğin: ilaç keşfi',
    hintB: 'Örneğin: iklim uyumu',
    serverModel: 'LIBRAIN sunucunun varsayılan modeliyle çalışır; referans sistemleri de aynı değerlendirici model puanlar.',
    recordedTip: 'Hazır mod yalnızca kaydedilmiş çiftleri gösterir. Önerilerden bir konu seçin; eşi kendiliğinden dolar.',
    liveCost: 'Canlı mod: Karşılaştır, üç sistemi API key’lerinizle çalıştırır; bu yüzden tek bir fikirden daha pahalıdır.',
    submit: 'Karşılaştır',
    submitting: 'Karşılaştırılıyor…',
    modEnterAction: 'Karşılaştırmak',
    emptyTitle: 'Henüz bir karşılaştırma yok',
    emptyBody:
      'Üç sistem sunucuda aynı anda çalışır. Puanlar tek bir tabloda yan yana durur; Basit RAG’in, getirdiği parçaların dışını gösteren atıfları uydurma olarak işaretlenir. Bir sistem başarısız olursa diğer ikisi yine gösterilir.',
    runningTitle: 'Üç sistem karşılaştırılıyor',
    runningExpectation: 'Üçü aynı anda çalışır; en uzun süren genellikle LIBRAIN’dir, 15–30 sn.',
    perTopic: (k: number) => `konu başına ${k} parça`,
    inTotal: (duration: string) => `toplam ${duration}`,
  },
});
