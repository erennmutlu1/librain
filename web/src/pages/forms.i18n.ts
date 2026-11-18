import { strings } from '../i18n/lang';

/** Strings the Discover, Compare and Ask forms share. */
export const text = strings({
  en: {
    topicA: 'Topic A',
    topicB: 'Topic B',
    passagesPerTopic: 'Passages per topic',
    passagesToRetrieve: 'Passages to retrieve',
    swap: 'Swap topics',
    modEnter: (action: string) => `Ctrl or ⌘ + Enter to ${action}`,
    errors: {
      topicRequired: 'Enter at least Topic A.',
      topicTooLong: (max: number) => `Topics can be at most ${max} characters.`,
      topicsSame: 'Topic B must differ from Topic A.',
      topKRange: 'Passages per topic must be a whole number from 1 to 20.',
      queryRequired: 'Type a question first.',
      queryTooLong: (max: number) => `Questions can be at most ${max} characters.`,
      queryTopKRange: 'Passages to retrieve must be a whole number from 1 to 20.',
    },
  },
  tr: {
    topicA: 'Konu A',
    topicB: 'Konu B',
    passagesPerTopic: 'Konu başına pasaj',
    passagesToRetrieve: 'Getirilecek pasaj',
    swap: 'Konuların yerini değiştir',
    modEnter: (action: string) => `${action} için Ctrl ya da ⌘ + Enter`,
    errors: {
      topicRequired: 'En azından Konu A’yı girin.',
      topicTooLong: (max: number) => `Konular en fazla ${max} karakter olabilir.`,
      topicsSame: 'Konu B, Konu A’dan farklı olmalı.',
      topKRange: 'Konu başına pasaj sayısı 1 ile 20 arasında bir tam sayı olmalı.',
      queryRequired: 'Önce bir soru yazın.',
      queryTooLong: (max: number) => `Sorular en fazla ${max} karakter olabilir.`,
      queryTopKRange: 'Getirilecek pasaj sayısı 1 ile 20 arasında bir tam sayı olmalı.',
    },
  },
});

export type FormError = keyof (typeof text)['en']['errors'];
