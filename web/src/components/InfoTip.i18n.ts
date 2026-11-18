import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    about: (term: string) => `About ${term}`,
    example: 'Example:',
  },
  tr: {
    about: (term: string) => `${term} hakkında`,
    example: 'Örnek:',
  },
});
