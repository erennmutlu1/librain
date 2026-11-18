import { strings } from '../i18n/lang';

/** Sentences model.ts generates from the numbers. */
export const modelText = strings({
  en: {
    evidence: (passages: number, papers: number) =>
      `Backed by ${passages} ${passages === 1 ? 'passage' : 'passages'} from ${papers} ${papers === 1 ? 'paper' : 'papers'}:`,
    noEvidence: 'No supporting passage survived the citation contract.',
    plausibility: 'Plausibility',
    novelty: 'Novelty',
    coherence: 'Coherence',
    claimRisk: 'Claim risk',
    top: (top: string, n: number) => `top ${top} of all ${n} ideas`,
    higher: (below: string, n: number) => `higher than ${below} of all ${n} ideas`,
    median: (n: number) => `the median of all ${n} ideas`,
    belowMedian: (n: number, mid: string) => `below the median of all ${n} ideas (${mid})`,
    lowest: (n: number) => `the lowest of all ${n} ideas`,
    lower: (fewer: string, n: number) => `lower than ${fewer} of all ${n} ideas`,
    checkFailed: 'The claim check failed, so no sentence has a verdict.',
    noRisky: (checked: number) => `No sentence stated as unsupported fact (${checked} checked).`,
    someRisky: (n: number) => `${n} ${n === 1 ? 'sentence' : 'sentences'} flagged risky — see below.`,
    sorts: {
      rating: 'Highest rating',
      novelty: 'Most novel',
      plausibility: 'Most plausible',
      risk: 'Lowest claim risk',
    },
  },
  tr: {
    evidence: (passages: number, papers: number) => `${papers} makaleden ${passages} pasajla destekleniyor:`,
    noEvidence: 'Alıntı sözleşmesinden hiçbir destekleyici pasaj geçemedi.',
    plausibility: 'Akla yatkınlık',
    novelty: 'Özgünlük',
    coherence: 'Tutarlılık',
    claimRisk: 'İddia riski',
    top: (top: string, n: number) => `tüm ${n} fikir içinde ilk ${top}`,
    higher: (below: string, n: number) => `tüm ${n} fikrin ${below} kadarından yüksek`,
    median: (n: number) => `tüm ${n} fikrin ortancası`,
    belowMedian: (n: number, mid: string) => `tüm ${n} fikrin ortancasının altında (${mid})`,
    lowest: (n: number) => `tüm ${n} fikir içinde en düşük`,
    lower: (fewer: string, n: number) => `tüm ${n} fikrin ${fewer} kadarından düşük`,
    checkFailed: 'İddia kontrolü başarısız oldu, bu yüzden hiçbir cümlenin hükmü yok.',
    noRisky: (checked: number) => `Hiçbir cümle desteklenmeyen bir şeyi olgu gibi sunmuyor (${checked} cümle denetlendi).`,
    someRisky: (n: number) => `${n} cümle riskli olarak işaretlendi, aşağıya bakın.`,
    sorts: {
      rating: 'En yüksek puan',
      novelty: 'En özgün',
      plausibility: 'En akla yatkın',
      risk: 'En düşük iddia riski',
    },
  },
});
