import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    discovery: {
      qualityScore: { label: 'Quality', hint: 'Average of the other three' },
      noveltyScore: { label: 'Novelty', hint: 'Distance from the closest passage' },
      plausibilityScore: { label: 'Plausibility', hint: 'Judge model' },
      structuralCoherenceScore: { label: 'Coherence', hint: 'Judge model' },
    },
    ask: {
      quality: { label: 'Quality', hint: 'Average of the other three' },
      groundedness: { label: 'Groundedness', hint: 'Supported by the cited sources' },
      relevance: { label: 'Relevance', hint: 'Answers the question asked' },
      completeness: { label: 'Completeness', hint: 'Uses all the relevant sources' },
    },
    band: { low: 'Low', mid: 'Moderate', high: 'High' },
  },
  tr: {
    discovery: {
      qualityScore: { label: 'Kalite', hint: 'Diğer üç puanın ortalaması' },
      noveltyScore: { label: 'Özgünlük', hint: 'En yakın parçaya uzaklık' },
      plausibilityScore: { label: 'Akla yatkınlık', hint: 'Değerlendirici model' },
      structuralCoherenceScore: { label: 'Tutarlılık', hint: 'Değerlendirici model' },
    },
    ask: {
      quality: { label: 'Kalite', hint: 'Diğer üç puanın ortalaması' },
      groundedness: { label: 'Dayanaklılık', hint: 'Atıf yapılan kaynaklarca destekleniyor' },
      relevance: { label: 'İlgililik', hint: 'Sorulan soruyu yanıtlıyor' },
      completeness: { label: 'Eksiksizlik', hint: 'İlgili kaynakların hepsini kullanıyor' },
    },
    band: { low: 'Düşük', mid: 'Orta', high: 'Yüksek' },
  },
});
