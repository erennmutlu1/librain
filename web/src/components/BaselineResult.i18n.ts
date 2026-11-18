import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    baseline: (name: string) => `${name} baseline`,
    hypothesis: 'Hypothesis',
    claimed: 'Claimed citations',
    scores: 'Scores',
    scoresLabel: 'Baseline scores',
    notScored: 'This run was not scored.',
  },
  tr: {
    baseline: (name: string) => `Referans sistem: ${name}`,
    hypothesis: 'Hipotez',
    claimed: 'Öne sürülen atıflar',
    scores: 'Puanlar',
    scoresLabel: 'Referans sistem puanları',
    notScored: 'Bu çalıştırma puanlanmadı.',
  },
});
