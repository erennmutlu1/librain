import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    title: 'Ask',
    lede: 'Ask a question about the library. LIBRAIN answers only from the passages it retrieves, cites them by number, and an evaluator scores how well the answer holds up.',
    noRecordingsTitle: 'Ask has no recorded runs.',
    someRecordingsTitle: (n: number) => `${n} questions are ready to replay.`,
    someRecordingsBody:
      'Pick one below to see the answer with its sources and the evaluator’s notes. Free, no API keys. To ask your own question, switch to Live.',
    noRecordingsBody:
      'Recorded mode only replays real runs, and none were recorded for Ask. Switch to Live to ask the paper library a question with your own Anthropic and OpenAI API keys.',
    switchLive: 'Switch to Live',
    question: 'Question',
    placeholder: 'How does retrieval-augmented generation (RAG) reduce hallucination?',
    charsLeft: (n: string) => `${n} characters left`,
    recent: 'Your recent questions',
    submit: 'Ask',
    submitting: 'Asking…',
    modEnterAction: 'ask',
    /** While typing in Recorded mode: Ask has no recordings at all. */
    noRecordingHint: 'No recording for this question: pick one of the ready questions below, or switch to Live to ask it.',
    noRecordingTitle: 'No recording for this question.',
    noRecordingBody:
      'Recorded mode only replays the questions that were recorded; pick one below. To ask this one, switch to Live and use your own API keys: a recorded question cost about US$0.03.',
    /** Shown in Live mode, before a paid run. */
    liveCost: 'Billed to your Anthropic and OpenAI accounts: about US$0.03 per question (measured on the five recorded ones).',
    emptyTitle: 'Nothing asked yet',
    emptyBody:
      'Answers come back with numbered source chips. Select one to read the cited passage and see which paper, section and page it comes from. The evaluator’s scores, critique and any unsupported claims sit beside the answer.',
    progressTitle: 'Answering',
    expectation: 'Usually about 15 s.',
  },
  tr: {
    title: 'Sor',
    lede: 'Makale kütüphanesi hakkında bir soru sorun. LIBRAIN yalnızca getirdiği parçalara dayanarak yanıt verir, bu parçalara numarayla atıf yapar ve değerlendirici model yanıtın ne kadar sağlam olduğunu puanlar.',
    noRecordingsTitle: 'Sor için hazır çalıştırma yok.',
    someRecordingsTitle: (n: number) => `Hazır soru sayısı: ${n}`,
    someRecordingsBody:
      'Yanıtı kaynaklarıyla ve değerlendiricinin notlarıyla görmek için aşağıdan birini seçin. Ücretsizdir, API key gerekmez. Kendi sorunuzu sormak için Canlı moda geçin.',
    noRecordingsBody:
      'Hazır mod yalnızca gerçek çalıştırmaları yeniden gösterir ve Sor için hiç çalıştırma kaydedilmedi. Makale kütüphanesine kendi Anthropic ve OpenAI API key’lerinizle soru sormak için Canlı moda geçin.',
    switchLive: 'Canlı moda geç',
    question: 'Soru',
    placeholder: 'Erişim destekli üretim (RAG) halüsinasyonu nasıl azaltır?',
    charsLeft: (n: string) => `${n} karakter kaldı`,
    recent: 'Son sorularınız',
    submit: 'Sor',
    submitting: 'Soruluyor…',
    modEnterAction: 'Sormak',
    noRecordingHint: 'Bu soru için hazır çalıştırma yok: aşağıdaki hazır sorulardan birini seçin ya da sormak için Canlı moda geçin.',
    noRecordingTitle: 'Bu soru için hazır çalıştırma yok.',
    noRecordingBody:
      'Hazır mod yalnızca kaydedilmiş soruları yeniden gösterir; aşağıdan birini seçin. Bu soruyu sormak için Canlı moda geçip kendi API key’lerinizi kullanın: kayıtlı bir soru yaklaşık 0,03 ABD doları tuttu.',
    liveCost: 'Ücret Anthropic ve OpenAI hesaplarınıza yansır: soru başına yaklaşık 0,03 ABD doları (kayıtlı beş soruda ölçüldü).',
    emptyTitle: 'Henüz bir soru sorulmadı',
    emptyBody:
      'Yanıtlar numaralı kaynak etiketleriyle gelir. Atıf yapılan parçayı okumak ve hangi makalenin hangi bölümünden ve sayfasından geldiğini görmek için birini seçin. Değerlendiricinin puanları, eleştirisi ve dayanaksız iddialar yanıtın yanında durur.',
    progressTitle: 'Yanıtlanıyor',
    expectation: 'Genellikle 15 sn kadar sürer.',
  },
});
