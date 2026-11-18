import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    title: 'New idea',
    lede: 'Give LIBRAIN one or two topics. It retrieves evidence for each, proposes a hypothesis that goes beyond the papers, and has a second model check every sentence of the speculative part.',
    hintA: 'For example: weather foundation models',
    hintB: 'For example: renewable energy planning',
    anthropicOnly: 'The hypothesis and the claim checks come from Anthropic models.',
    /** Shown before a paid run. US$0.066 on average over the recorded runs (the batch READMEs: $3.05 for the first 46, $1.598 for the next 24). */
    cost: 'About US$0.07 per new idea, billed to your Anthropic and OpenAI accounts.',
    provider: 'Model provider',
    openaiModel: 'OpenAI model',
    submit: 'Discover',
    submitting: 'Discovering…',
    /** Completes "Ctrl or ⌘ + Enter to …". */
    modEnterAction: 'discover',
    progressTitle: 'Running discovery',
    expectation: 'Usually 15–30 s.',
    prefilled: 'Filled in from the link. Nothing runs until you press Discover.',
    recordedTip: 'Recorded mode replays a run only for its exact topics. Pick a topic from the suggestions and its recorded partner fills in.',
    /** While typing in Recorded mode, when the topics match no recording. */
    noRecordingHint: 'No recording for these topics — pick a suggestion, open Ideas, or switch to Live.',
    noRecordingTitle: 'No recording matches these topics.',
    noRecordingBody:
      'Recorded mode only replays real runs and never swaps in another one. Pick a topic from the suggestions, open Ideas to browse the recorded ones, or switch to Live to run your own topics with your own API keys (about US$0.07 per new idea).',
    switchLive: 'Switch to Live',
    openIdeas: 'Open Ideas',
  },
  tr: {
    title: 'Yeni fikir',
    lede: 'LIBRAIN’e bir ya da iki konu verin. Her biri için kanıt getirir, makalelerin ötesine geçen bir hipotez önerir ve bu hipotezin yeni iddiasındaki her cümleyi ikinci bir modele denetletir.',
    hintA: 'Örneğin: hava durumu temel modelleri',
    hintB: 'Örneğin: yenilenebilir enerji planlaması',
    anthropicOnly: 'Hipotezi yazan model ve iddia denetimi Anthropic modelleridir.',
    cost: 'Yeni fikir başına yaklaşık 0,07 ABD doları; ücret Anthropic ve OpenAI hesaplarınıza yansır.',
    provider: 'Model sağlayıcısı',
    openaiModel: 'OpenAI modeli',
    submit: 'Keşfet',
    submitting: 'Keşfediliyor…',
    modEnterAction: 'Keşfetmek',
    progressTitle: 'Yeni fikir hazırlanıyor',
    expectation: 'Genellikle 15–30 sn sürer.',
    prefilled: 'Bağlantıdaki değerlerle dolduruldu. Keşfet’e basana kadar hiçbir şey çalışmaz.',
    recordedTip: 'Hazır mod bir çalıştırmayı yalnızca kaydedildiği konularla yeniden gösterir. Önerilerden bir konu seçin, eşi kendiliğinden dolsun.',
    noRecordingHint: 'Bu konular için hazır çalıştırma yok. Bir öneri seçin, Fikirler’i açın ya da Canlı moda geçin.',
    noRecordingTitle: 'Bu konularla eşleşen hazır çalıştırma yok.',
    noRecordingBody:
      'Hazır mod yalnızca gerçek çalıştırmaları yeniden gösterir; yerine başka birini koymaz. Önerilerden bir konu seçin, kaydedilmiş fikirlere göz atmak için Fikirler’i açın ya da kendi konularınızı kendi API key’lerinizle çalıştırmak için Canlı moda geçin (yeni fikir başına yaklaşık 0,07 ABD doları).',
    switchLive: 'Canlı moda geç',
    openIdeas: 'Fikirler’i aç',
  },
});
