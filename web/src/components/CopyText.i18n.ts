import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    copy: (label: string) => `Copy ${label.toLowerCase()}`,
    copied: 'Copied',
    failed: 'Copy failed',
  },
  tr: {
    // Not lower-cased: JS lower-casing mangles Turkish "I" and "İ".
    copy: (label: string) => `${label} kopyala`,
    copied: 'Kopyalandı',
    failed: 'Kopyalanamadı',
  },
});
