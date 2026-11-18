import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    discover: {
      retrieving: 'Search the paper library',
      retrieved: 'Collect passages',
      generating: 'Write a hypothesis',
      validated: 'Check the citations',
      scoring: 'Score it and check every sentence',
    } as Record<string, string>,
    query: {
      retrieving: 'Search the paper library',
      retrieved: 'Collect passages',
      generating: 'Write the answer',
      validated: 'Check the citations',
      evaluating: 'Score the answer',
    } as Record<string, string>,
    /** Stages some backends report on top of the fixed list. */
    extra: { reranking: 'Reranking' } as Record<string, string>,
  },
  tr: {
    discover: {
      retrieving: 'Makale kütüphanesinde ara',
      retrieved: 'Parçaları topla',
      generating: 'Hipotezi yaz',
      validated: 'Atıfları denetle',
      scoring: 'Puanla ve her cümleyi denetle',
    },
    query: {
      retrieving: 'Makale kütüphanesinde ara',
      retrieved: 'Parçaları topla',
      generating: 'Yanıtı yaz',
      validated: 'Atıfları denetle',
      evaluating: 'Yanıtı puanla',
    },
    extra: { reranking: 'Yeniden sıralama' },
  },
});
