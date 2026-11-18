import { strings } from '../i18n/lang';

/** Text the public build's clients and switch produce outside any one screen. */
export const text = strings({
  en: {
    liveNeedsKeys: 'Live mode runs on your own Anthropic and OpenAI API keys. Add both to switch.',
    bothKeys: 'Live mode needs both of your keys.',
    noRun: (id: string) => `No run with id ${id} in this browser.`,
    noKeyToCheck: 'Enter at least one key to check.',
  },
  tr: {
    liveNeedsKeys: 'Canlı mod kendi Anthropic ve OpenAI API key’lerinizle çalışır. Geçmek için ikisini de ekleyin.',
    bothKeys: 'Canlı mod için iki API key’iniz de gerekli.',
    noRun: (id: string) => `Bu tarayıcıda ${id} kimlikli bir çalıştırma yok.`,
    noKeyToCheck: 'Kontrol etmek için en az bir API key girin.',
  },
});
