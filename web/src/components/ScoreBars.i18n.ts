import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    scale: '0–1, higher is better',
    notScored: 'Not scored',
    claimRisk: 'Claim risk',
    unverified: 'Unverified',
    failedHint: 'The validator model returned no usable verdicts, so claim risk is set to 1.0. Treat the whole claim as unverified.',
    hint: '0–1, lower is better: the highest hallucination probability among the novel claim’s sentences.',
  },
  tr: {
    scale: '0–1, yüksek daha iyi',
    notScored: 'Puanlanmadı',
    claimRisk: 'İddia riski',
    unverified: 'Doğrulanmadı',
    failedHint: 'Doğrulayıcı model kullanılabilir bir karar döndürmedi; bu yüzden iddia riski 1,0 olarak ayarlandı. İddianın tamamını doğrulanmamış sayın.',
    hint: '0–1, düşük daha iyi: yeni iddianın cümleleri arasındaki en yüksek uydurma olasılığı.',
  },
});
