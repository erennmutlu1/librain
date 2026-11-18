import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    optional: '(optional)',
    showSuggestions: (label: string) => `Show suggestions for ${label}`,
    suggestionsFor: (label: string) => `Suggestions for ${label}`,
    count: (n: number) => (n === 0 ? 'No suggestions' : n === 1 ? '1 suggestion' : `${n} suggestions`),
    groups: {
      partner: 'Recorded with the other topic',
      recent: 'Your recent topics',
      recorded: 'Recorded topics',
      paper: 'Papers in the library',
    },
  },
  tr: {
    optional: '(isteğe bağlı)',
    showSuggestions: (label: string) => `${label} için önerileri göster`,
    suggestionsFor: (label: string) => `${label} için öneriler`,
    count: (n: number) => (n === 0 ? 'Öneri yok' : `${n} öneri`),
    groups: {
      partner: 'Diğer konuyla kaydedilmiş',
      recent: 'Son konularınız',
      recorded: 'Hazır konular',
      paper: 'Kütüphanedeki makaleler',
    },
  },
});
