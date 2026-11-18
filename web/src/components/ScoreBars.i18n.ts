import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    notScored: 'Not scored',
    aggregateRisk: 'Aggregate risk',
    unverified: 'Unverified',
    failedHint: 'The validator returned no usable verdicts, so treat the whole claim as unverified.',
    hint: 'Highest hallucination probability among the novel-claim sentences.',
  },
  tr: {
    notScored: 'Puanlanmadı',
    aggregateRisk: 'Toplam risk',
    unverified: 'Doğrulanmadı',
    failedHint: 'Doğrulayıcı kullanılabilir bir hüküm üretmedi; iddianın tamamını doğrulanmamış sayın.',
    hint: 'Özgün iddia cümleleri arasındaki en yüksek halüsinasyon olasılığı.',
  },
});
