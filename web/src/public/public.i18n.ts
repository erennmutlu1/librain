import { strings } from '../i18n/lang';

/** Text the public build's clients and switch produce outside any one screen. */
export const text = strings({
  en: {
    liveNeedsKeys: 'Live mode runs on your own Anthropic and OpenAI keys. Add both to switch.',
    bothKeys: 'Live mode needs both of your keys.',
    noRun: (id: string) => `No run with id ${id} in this browser.`,
    noKeyToCheck: 'Enter at least one key to check.',
  },
  tr: {
    liveNeedsKeys: 'Canlı mod kendi Anthropic ve OpenAI anahtarlarınızla çalışır. Geçmek için ikisini de ekleyin.',
    bothKeys: 'Canlı mod için iki anahtarınız da gerekli.',
    noRun: (id: string) => `Bu tarayıcıda ${id} kimlikli bir çalıştırma yok.`,
    noKeyToCheck: 'Denetlemek için en az bir anahtar girin.',
  },
});
