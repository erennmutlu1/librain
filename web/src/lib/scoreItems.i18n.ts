import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    discovery: {
      qualityScore: { label: 'Quality', hint: 'Mean of the three axes' },
      noveltyScore: { label: 'Novelty', hint: 'Cosine distance to nearest chunk' },
      plausibilityScore: { label: 'Plausibility', hint: 'LLM judge' },
      structuralCoherenceScore: { label: 'Structural coherence', hint: 'LLM judge' },
    },
    ask: {
      quality: { label: 'Quality', hint: 'Overall judge score' },
      groundedness: { label: 'Groundedness', hint: 'Supported by the cited sources' },
      relevance: { label: 'Relevance', hint: 'Answers the question asked' },
      completeness: { label: 'Completeness', hint: 'Covers what the sources allow' },
    },
    band: { low: 'Low', mid: 'Moderate', high: 'High' },
  },
  tr: {
    discovery: {
      qualityScore: { label: 'Kalite', hint: 'Üç eksenin ortalaması' },
      noveltyScore: { label: 'Özgünlük', hint: 'En yakın parçaya kosinüs uzaklığı' },
      plausibilityScore: { label: 'Akla yatkınlık', hint: 'LLM hakemi' },
      structuralCoherenceScore: { label: 'Yapısal tutarlılık', hint: 'LLM hakemi' },
    },
    ask: {
      quality: { label: 'Kalite', hint: 'Hakemin genel puanı' },
      groundedness: { label: 'Dayanaklılık', hint: 'Atıf yapılan kaynaklarca destekleniyor' },
      relevance: { label: 'Alaka', hint: 'Sorulan soruyu yanıtlıyor' },
      completeness: { label: 'Bütünlük', hint: 'Kaynakların izin verdiği her şeyi kapsıyor' },
    },
    band: { low: 'Düşük', mid: 'Orta', high: 'Yüksek' },
  },
});
