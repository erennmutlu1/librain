import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    topK: (k: number) => `${k} passages per topic`,
    hypothesis: 'Hypothesis',
    scores: 'Scores',
    discoveryScores: 'Scores',
    notScored: 'This run was not scored.',
    claim: 'Novel claim, checked sentence by sentence',
    evidence: 'Supporting evidence',
    basis: 'Extrapolation basis',
    basisNote: 'How the model that wrote the hypothesis says it reached each novel-claim sentence.',
    noBasis: 'The model that wrote the hypothesis did not annotate its sentences.',
    from: 'from',
    noSource: 'no source passage',
    reasoning: 'Model’s reasoning',
  },
  tr: {
    topK: (k: number) => `konu başına ${k} parça`,
    hypothesis: 'Hipotez',
    scores: 'Puanlar',
    discoveryScores: 'Puanlar',
    notScored: 'Bu çalıştırma puanlanmadı.',
    claim: 'Cümle cümle denetlenen yeni iddia',
    evidence: 'Destekleyen kanıt',
    basis: 'Dayanak',
    basisNote: 'Hipotezi yazan modelin, yeni iddianın her cümlesine nasıl vardığını söylediği yol.',
    noBasis: 'Hipotezi yazan model cümlelerini açıklamadı.',
    from: 'kaynak:',
    noSource: 'kaynak parça yok',
    reasoning: 'Modelin akıl yürütmesi',
  },
});
