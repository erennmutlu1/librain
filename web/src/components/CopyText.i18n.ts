import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    copy: (label: string) => `Copy ${label.toLowerCase()}`,
    copied: 'Copied',
    failed: 'Copy failed',
  },
  tr: {
    // "Etiket: değer" keeps suffixes off the label (and JS lower-casing would mangle "I"/"İ").
    copy: (label: string) => `Kopyala: ${label}`,
    copied: 'Kopyalandı',
    failed: 'Kopyalanamadı',
  },
});
