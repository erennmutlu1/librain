import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    decrease: (label: string) => `Decrease ${label}`,
    increase: (label: string) => `Increase ${label}`,
    range: (min: string, max: string) => `${min} to ${max}`,
  },
  tr: {
    decrease: (label: string) => `${label}: azalt`,
    increase: (label: string) => `${label}: artır`,
    range: (min: string, max: string) => `${min} ile ${max} arası`,
  },
});
