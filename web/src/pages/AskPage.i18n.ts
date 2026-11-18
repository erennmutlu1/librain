import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    title: 'Ask',
    lede: 'Ask a question about the library. LIBRAIN answers only from the passages it retrieves, cites them by number, and an evaluator scores how well the answer holds up.',
    noRecordingsTitle: 'Ask has no recorded runs.',
    noRecordingsBody:
      'Recorded mode only replays real runs, and none were recorded for Ask. Switch to Live to ask the corpus a question with your own Anthropic and OpenAI keys.',
    switchLive: 'Switch to Live',
    question: 'Question',
    placeholder: 'How does retrieval-augmented generation mitigate hallucination?',
    charsLeft: (n: string) => `${n} characters left`,
    recent: 'Your recent questions',
    submit: 'Ask',
    submitting: 'Asking…',
    modEnterAction: 'ask',
    emptyTitle: 'Nothing asked yet',
    emptyBody:
      'Answers come back with numbered source chips. Select one to read the cited passage and see which paper, section and page it comes from. The evaluator’s scores, critique and any unsupported claims sit beside the answer.',
    progressTitle: 'Answering',
    expectation: 'Usually about 15 s.',
  },
  tr: {
    title: 'Sor',
    lede: 'Kütüphane hakkında bir soru sorun. LIBRAIN yalnızca getirdiği pasajlardan yanıt verir, onları numarayla kaynak gösterir ve bir değerlendirici yanıtın ne kadar sağlam olduğunu puanlar.',
    noRecordingsTitle: 'Sor için kayıtlı çalıştırma yok.',
    noRecordingsBody:
      'Kayıtlı mod yalnızca gerçek çalıştırmaları yeniden oynatır ve Sor için hiç kayıt yapılmadı. Derleme kendi Anthropic ve OpenAI anahtarlarınızla soru sormak için Canlı moda geçin.',
    switchLive: 'Canlıya geç',
    question: 'Soru',
    placeholder: 'Getirmeyle zenginleştirilmiş üretim halüsinasyonu nasıl azaltır?',
    charsLeft: (n: string) => `${n} karakter kaldı`,
    recent: 'Son sorularınız',
    submit: 'Sor',
    submitting: 'Soruluyor…',
    modEnterAction: 'Sormak',
    emptyTitle: 'Henüz bir soru sorulmadı',
    emptyBody:
      'Yanıtlar numaralı kaynak etiketleriyle gelir. Alıntılanan pasajı okumak ve hangi makalenin hangi bölümünden ve sayfasından geldiğini görmek için birini seçin. Değerlendiricinin puanları, eleştirisi ve dayanaksız iddialar yanıtın yanında durur.',
    progressTitle: 'Yanıtlanıyor',
    expectation: 'Genellikle 15 sn kadar sürer.',
  },
});
