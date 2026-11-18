import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    title: 'Compare',
    lede: 'Run one topic pair through LIBRAIN and the two baselines from the companion paper. All three are scored by the same evaluator, so differences come from the pipeline, not the judge.',
    explainer: 'What differs between the systems',
    hintA: 'For example: drug discovery',
    hintB: 'For example: climate adaptation',
    serverModel: 'LIBRAIN runs with the server’s default model; the baselines use the same evaluator.',
    recordedTip: 'Recorded mode replays only the recorded pairs. Pick a topic from the suggestions and its partner fills in.',
    submit: 'Compare',
    submitting: 'Comparing…',
    modEnterAction: 'compare',
    emptyTitle: 'Nothing compared yet',
    emptyBody:
      'The three systems run at the same time on the server. Scores line up in one table; Naive-RAG citations that point outside the retrieved evidence are marked as fabricated. If one system fails, the other two still show.',
    runningTitle: 'Comparing three systems',
    runningExpectation: 'All three run concurrently; LIBRAIN usually takes the longest, 15–30 s.',
    perTopic: (k: number) => `top ${k} per topic`,
    inTotal: (duration: string) => `${duration} in total`,
    correlationId: 'Correlation ID',
  },
  tr: {
    title: 'Karşılaştır',
    lede: 'Bir konu çiftini LIBRAIN’den ve eşlik eden makaledeki iki temel çizgiden geçirin. Üçünü de aynı değerlendirici puanlar; farklar değerlendiriciden değil, işlem hattından gelir.',
    explainer: 'Sistemler arasındaki farklar',
    hintA: 'Örneğin: ilaç keşfi',
    hintB: 'Örneğin: iklim uyumu',
    serverModel: 'LIBRAIN sunucunun varsayılan modeliyle çalışır; temel çizgiler aynı değerlendiriciyi kullanır.',
    recordedTip: 'Kayıtlı mod yalnızca kayıttaki çiftleri oynatır. Önerilerden bir konu seçin, eşi kendiliğinden dolsun.',
    submit: 'Karşılaştır',
    submitting: 'Karşılaştırılıyor…',
    modEnterAction: 'Karşılaştırmak',
    emptyTitle: 'Henüz bir karşılaştırma yok',
    emptyBody:
      'Üç sistem sunucuda aynı anda çalışır. Puanlar tek bir tabloda yan yana durur; Naive-RAG’in getirilen kanıtın dışını gösteren atıfları uydurma olarak işaretlenir. Bir sistem başarısız olursa diğer ikisi yine gösterilir.',
    runningTitle: 'Üç sistem karşılaştırılıyor',
    runningExpectation: 'Üçü aynı anda çalışır; en uzun süren genellikle LIBRAIN’dir, 15–30 sn.',
    perTopic: (k: number) => `konu başına ilk ${k}`,
    inTotal: (duration: string) => `toplam ${duration}`,
    correlationId: 'Korelasyon kimliği',
  },
});
