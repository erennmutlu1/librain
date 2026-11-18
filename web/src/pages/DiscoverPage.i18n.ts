import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    title: 'Discover',
    lede: 'Give LIBRAIN one or two topics. It retrieves evidence for each, proposes a hypothesis that goes beyond the papers, and has a second model check every sentence of the speculative part.',
    hintA: 'For example: weather foundation models',
    hintB: 'For example: renewable energy planning',
    anthropicOnly: 'Generation and claim checks run on Anthropic models.',
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
  },
  tr: {
    title: 'Keşfet',
    lede: 'LIBRAIN’e bir ya da iki konu verin. Her biri için kanıt getirir, makalelerin ötesine geçen bir hipotez önerir ve spekülatif kısmın her cümlesini ikinci bir modele denetletir.',
    hintA: 'Örneğin: hava durumu temel modelleri',
    hintB: 'Örneğin: yenilenebilir enerji planlaması',
    anthropicOnly: 'Üretim ve iddia denetimi Anthropic modelleriyle yapılır.',
    provider: 'Model sağlayıcısı',
    openaiModel: 'OpenAI modeli',
    submit: 'Keşfet',
    submitting: 'Keşfediliyor…',
    modEnterAction: 'Keşfetmek',
    progressTitle: 'Keşif çalışıyor',
    expectation: 'Genellikle 15–30 sn sürer.',
    prefilled: 'Bağlantıdaki değerlerle dolduruldu. Keşfet’e basana kadar hiçbir şey çalışmaz.',
    recordedTip: 'Kayıtlı mod bir çalıştırmayı yalnızca kayıttaki konularla oynatır. Önerilerden bir konu seçin, kayıtlı eşi kendiliğinden dolsun.',
  },
});
