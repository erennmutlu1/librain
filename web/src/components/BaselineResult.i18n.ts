import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    baseline: (name: string) => `${name} baseline`,
    correlationId: 'Correlation ID',
    hypothesis: 'Hypothesis',
    claimed: 'Claimed citations',
    scores: 'Scores',
    scoresLabel: 'Baseline scores',
    notScored: 'This run was not scored.',
  },
  tr: {
    baseline: (name: string) => `${name} temel çizgisi`,
    correlationId: 'Korelasyon kimliği',
    hypothesis: 'Hipotez',
    claimed: 'Öne sürülen atıflar',
    scores: 'Puanlar',
    scoresLabel: 'Temel çizgi puanları',
    notScored: 'Bu çalıştırma puanlanmadı.',
  },
});
