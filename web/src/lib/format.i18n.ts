import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    justNow: 'just now',
    minutesAgo: (n: number) => `${n} min ago`,
    hoursAgo: (n: number) => `${n} h ago`,
    daysAgo: (n: number) => `${n} d ago`,
    ms: 'ms',
    s: 's',
    etAl: 'et al.',
  },
  tr: {
    justNow: 'az önce',
    minutesAgo: (n: number) => `${n} dk önce`,
    hoursAgo: (n: number) => `${n} sa önce`,
    daysAgo: (n: number) => `${n} gün önce`,
    ms: 'ms',
    s: 'sn',
    etAl: 've ark.',
  },
});
