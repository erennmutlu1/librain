import { strings } from '../i18n/lang';

/*
 * Each step is checked against the backend:
 *   retrieval per topic (DiscoveryAgent, topK per topic, de-duplicated);
 *   citations outside the retrieved set are dropped (DiscoveryContract.ValidateEvidence);
 *   the validator labels each novel-claim sentence with a status, a probability and a rationale,
 *   in the bands GROUNDED ≈ 0, EXTRAPOLATED ≈ 0.1–0.3, RISKY ≈ 0.6–1.0 (ClaimValidatorAgent,
 *   judge model Claude Haiku 4.5 for the recorded runs);
 *   claim risk is the maximum of the probabilities, and 1.0 when validation fails (ClaimValidationScoring).
 */
export const text = strings({
  en: {
    title: 'How a sentence is checked',
    steps: [
      'LIBRAIN searches the paper library (55 papers today) for the passages closest to each topic.',
      'The model that wrote the hypothesis may cite only those passages. A citation to any other passage is dropped before you see the result.',
      'It sets its most speculative part apart as the novel claim.',
      'A second model, the validator (Claude Haiku 4.5 for the recorded runs), reads each sentence of the novel claim next to the passages.',
      'It labels each sentence Grounded (≈ 0), Extrapolated (≈ 0.1–0.3) or Risky (≈ 0.6–1.0), with a hallucination probability and a one-line reason.',
      'Claim risk is the highest of those probabilities, so one Risky sentence is enough to raise it.',
      'If the check fails, claim risk is set to 1.0: an unchecked claim never looks safe.',
    ],
  },
  tr: {
    title: 'Bir cümle nasıl denetlenir?',
    steps: [
      'LIBRAIN, makale kütüphanesinde (bugün 55 makale) her konuya en yakın metin parçalarını arar.',
      'Hipotezi yazan model yalnızca bu parçalara atıf yapabilir. Başka bir parçaya yapılan atıf, siz sonucu görmeden silinir.',
      'Model, hipotezin en spekülatif kısmını yeni iddia olarak ayırır.',
      'İkinci bir model, yani doğrulayıcı model (kaydedilen çalıştırmalarda Claude Haiku 4.5), yeni iddianın her cümlesini parçalarla yan yana okur.',
      'Her cümleyi Dayanaklı (≈ 0), Varsayımsal (≈ 0,1–0,3) ya da Riskli (≈ 0,6–1,0) olarak etiketler; bir uydurma olasılığı ve tek satırlık bir gerekçe verir.',
      'İddia riski bu olasılıkların en yükseğidir; tek bir riskli cümle onu yükseltmeye yeter.',
      'Denetim başarısız olursa iddia riski 1,0 olur: denetlenmemiş bir iddia hiçbir zaman güvenli görünmez.',
    ],
  },
});
