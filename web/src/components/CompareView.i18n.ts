import { strings } from '../i18n/lang';

type Lead = { name: string; scores: string };

export const text = strings({
  en: {
    loading: 'Loading',
    failed: 'Failed',
    notScored: 'Not scored',
    highest: ' (highest)',
    kept: (n: number) => `${n} kept`,
    keptDropped: (kept: number, dropped: number) => ({ kept: `${kept} kept, `, dropped: `${dropped} dropped` }),
    claimed: (n: number) => `${n} claimed,`,
    fabricated: (n: number) => `${n} fabricated`,
    noRetrieval: 'None (no passages)',
    caption: 'Scores by system, 0 to 1. Higher is better, except for claim risk.',
    axis: 'Score, 0–1',
    risk: 'Claim risk',
    riskHint: 'Highest sentence probability; lower is better',
    validationFailed: ' (validation failed)',
    notMeasured: 'Not measured',
    citations: 'Citations',
    claimChecked: 'Novel claim, checked',
    supportingKept: (n: number) => `${n} supporting ${n === 1 ? 'passage' : 'passages'} kept`,
    claimedCitations: 'Claimed citations',
    noRetrievalNote: 'No passages are retrieved, so there is nothing to cite and nothing to check against.',
    takeawayTitle: 'What this pair shows',
    leads: (leads: Lead[]) => `Highest scores: ${leads.map((l) => `${l.name} for ${l.scores}`).join('; ')}.`,
    ties: (scores: string) => `Tied at the top: ${scores}.`,
    allTied: (scores: string) => `No system leads: the top score is shared on ${scores}.`,
    naiveCitations: (fabricated: number, total: number) =>
      total === 0
        ? 'Naive RAG gave no citations.'
        : fabricated > 0
          ? `Naive RAG kept ${fabricated} fabricated ${fabricated === 1 ? 'citation' : 'citations'} out of ${total}.`
          : `All ${total} of Naive RAG’s citations were among its retrieved passages.`,
    librainCitations: (dropped: number) =>
      dropped > 0
        ? `LIBRAIN’s citation check dropped ${dropped} ${dropped === 1 ? 'citation that pointed' : 'citations that pointed'} outside its retrieved passages.`
        : 'LIBRAIN’s model cited only retrieved passages.',
    riskOnlyLibrain: (value: string, baselines: boolean) =>
      `Claim risk is measured only for LIBRAIN (${value}).${baselines ? ' The baselines get no sentence-by-sentence check, so their risk is unknown, not lower.' : ''}`,
    riskFailed: 'LIBRAIN’s sentence check failed, so its claim risk is set to 1.0 (unverified).',
  },
  tr: {
    loading: 'Yükleniyor',
    failed: 'Başarısız',
    notScored: 'Puanlanmadı',
    highest: ' (en yüksek)',
    kept: (n: number) => `${n} tutuldu`,
    keptDropped: (kept: number, dropped: number) => ({ kept: `${kept} tutuldu, `, dropped: `${dropped} silindi` }),
    claimed: (n: number) => `${n} öne sürüldü,`,
    fabricated: (n: number) => `${n} uydurma`,
    noRetrieval: 'Yok (parça getirilmez)',
    caption: 'Sisteme göre puanlar, 0–1. İddia riski dışında yüksek daha iyi.',
    axis: 'Puan, 0–1',
    risk: 'İddia riski',
    riskHint: 'En yüksek cümle olasılığı; düşük daha iyi',
    validationFailed: ' (doğrulama başarısız)',
    notMeasured: 'Ölçülmedi',
    citations: 'Atıflar',
    claimChecked: 'Denetlenen yeni iddia',
    supportingKept: (n: number) => `${n} destekleyici parça tutuldu`,
    claimedCitations: 'Öne sürülen atıflar',
    noRetrievalNote: 'Parça getirilmediği için atıf yapılacak ya da karşılaştırılacak bir şey yok.',
    takeawayTitle: 'Bu çiftte ne görülüyor?',
    leads: (leads: Lead[]) => `En yüksek puanlar: ${leads.map((l) => `${l.name} (${l.scores})`).join('; ')}.`,
    ties: (scores: string) => `En yüksekte eşitlik: ${scores}.`,
    allTied: (scores: string) => `Hiçbir sistem öne çıkmıyor; en yüksek puan paylaşılıyor: ${scores}.`,
    naiveCitations: (fabricated: number, total: number) =>
      total === 0
        ? 'Basit RAG hiç atıf vermedi.'
        : fabricated > 0
          ? `Basit RAG, verdiği ${total} atıftan ${fabricated} uydurma atfı tuttu.`
          : `Basit RAG’in verdiği ${total} atfın tamamı getirdiği parçalar arasındaydı.`,
    librainCitations: (dropped: number) =>
      dropped > 0
        ? `LIBRAIN’in atıf denetimi, getirilen parçaların dışını gösteren ${dropped} atfı sildi.`
        : 'LIBRAIN’in modeli yalnızca getirilen parçalara atıf yaptı.',
    riskOnlyLibrain: (value: string, baselines: boolean) =>
      `İddia riski yalnızca LIBRAIN için ölçülür (${value}).${baselines ? ' Referans sistemler cümle cümle denetlenmez; bu yüzden riskleri daha düşük değil, bilinmiyor.' : ''}`,
    riskFailed: 'LIBRAIN’in cümle denetimi başarısız oldu; bu yüzden iddia riski 1,0 (doğrulanmadı) olarak ayarlandı.',
  },
});
