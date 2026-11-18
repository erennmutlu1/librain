import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    discover: {
      retrieving: 'Search the corpus',
      retrieved: 'Collect passages',
      generating: 'Generate a hypothesis',
      validated: 'Enforce the citation contract',
      scoring: 'Score it and check every claim',
    } as Record<string, string>,
    query: {
      retrieving: 'Search the corpus',
      retrieved: 'Collect passages',
      generating: 'Write the answer',
      validated: 'Check the citations',
      evaluating: 'Evaluate the answer',
    } as Record<string, string>,
    /** Stages some backends report on top of the fixed list. */
    extra: { reranking: 'Reranking' } as Record<string, string>,
  },
  tr: {
    discover: {
      retrieving: 'Derlemde ara',
      retrieved: 'Pasajları topla',
      generating: 'Hipotez üret',
      validated: 'Atıf sözleşmesini uygula',
      scoring: 'Puanla ve her iddiayı denetle',
    },
    query: {
      retrieving: 'Derlemde ara',
      retrieved: 'Pasajları topla',
      generating: 'Yanıtı yaz',
      validated: 'Atıfları denetle',
      evaluating: 'Yanıtı değerlendir',
    },
    extra: { reranking: 'Yeniden sıralama' },
  },
});
