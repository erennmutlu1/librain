import { strings, type Lang } from '../i18n/lang';
import type { GlossaryKey } from './model';

/** One plain sentence (and, where it helps, an everyday example) per term. */
export interface GlossaryEntry {
  term: string;
  definition: string;
  example?: string;
}

/**
 * Every metric and verdict the results show. The first seven are Explore's
 * glossary terms (GlossaryKey); the rest are used by the ⓘ help on result
 * screens (InfoTip).
 */
export type GlossaryTermKey =
  | GlossaryKey
  | 'quality'
  | 'hallucinationProbability'
  | 'basis'
  | 'answerQuality'
  | 'groundedness'
  | 'relevance'
  | 'completeness'
  | 'confidence'
  | 'citationCheck'
  | 'fabricated'
  | 'baseline'
  | 'notMeasured';

/*
 * Facts behind the wording (LIBRAIN backend):
 *   Novelty = 1 − similarity of the novel claim to its nearest passage (NoveltyScorer).
 *   Plausibility, coherence: the judge model (DiscoveryEvaluatorAgent); quality = their mean with novelty (DiscoveryScoring).
 *   Claim risk = the maximum per-sentence probability (ClaimValidationScoring.AggregateRisk); 1.0 when validation fails.
 *   Verdict bands: GROUNDED ≈ 0, EXTRAPOLATED ≈ 0.1–0.3, RISKY ≈ 0.6–1.0 (ClaimValidatorAgent).
 *   Ask: quality = mean of groundedness, relevance, completeness (EvaluatorAgent); confidence is self-reported (SynthesisAgent).
 */
const glossaryText = strings<Record<GlossaryTermKey, GlossaryEntry>>({
  en: {
    novelty: {
      term: 'Novelty',
      definition: 'How far the novel claim sits from the closest passage in the paper library, from 0 to 1; higher means less like anything already there.',
      example: 'A claim that repeats a passage almost word for word scores close to 0.',
    },
    plausibility: {
      term: 'Plausibility',
      definition: 'A judge model’s 0 to 1 estimate of how well the novel claim follows from the evidence it cites.',
      example: 'Like asking whether a detective’s conclusion follows from the clues. A claim with no logical link to the passages scores below 0.3.',
    },
    coherence: {
      term: 'Coherence',
      definition: 'A judge model’s 0 to 1 score for how precise and testable the hypothesis is.',
      example: '“Weather models could help biology” is vague and scores low. A claim a scientist could design an experiment from scores high.',
    },
    quality: {
      term: 'Quality',
      definition: 'The average of novelty, plausibility and coherence, from 0 to 1.',
      example: 'Novelty 0.40, plausibility 0.70 and coherence 0.80 give quality 0.63.',
    },
    risk: {
      term: 'Claim risk',
      definition: 'The highest hallucination probability among the novel claim’s sentences, from 0 to 1; lower is better. One Risky sentence is enough to raise it.',
      example: 'Sentences at 0.05, 0.15 and 0.70 give a claim risk of 0.70, not their average.',
    },
    hallucinationProbability: {
      term: 'Hallucination probability',
      definition: 'The validator model’s 0 to 1 estimate that a sentence states something as fact that the passages do not support.',
      example: 'A made-up statistic, such as “98% accuracy”, sits near the top of the scale.',
    },
    grounded: {
      term: 'Grounded',
      definition: 'Directly supported by at least one retrieved passage. Hallucination probability ≈ 0.',
      example: '“GraphCast forecasts weather with graph neural networks”, when a passage says just that.',
    },
    extrapolated: {
      term: 'Extrapolated',
      definition: 'Goes beyond the passages, but is framed as a hypothesis (“could”, “may”). Hallucination probability ≈ 0.1–0.3.',
      example: '“Weather-forecasting methods could plausibly transfer to protein folding.”',
    },
    risky: {
      term: 'Risky',
      definition: 'States a specific fact (a mechanism, number, name or attribution) that no passage supports. Hallucination probability ≈ 0.6–1.0.',
      example: '“GraphCast achieves 98% accuracy on protein folding”: a made-up number.',
    },
    basis: {
      term: 'Basis',
      definition: 'How the model that wrote the hypothesis says it reached a novel-claim sentence: by generalization, by analogy or by speculation.',
      example: 'Analogy: “this worked for weather maps, so it may work for protein shapes.”',
    },
    answerQuality: {
      term: 'Quality',
      definition: 'The average of groundedness, relevance and completeness, from 0 to 1.',
      example: 'Groundedness 0.90, relevance 0.80 and completeness 0.70 give quality 0.80.',
    },
    groundedness: {
      term: 'Groundedness',
      definition: 'A judge model’s 0 to 1 score for whether every claim in the answer traces back to a cited source.',
      example: 'One made-up claim in an otherwise sound answer should pull it below 0.5.',
    },
    relevance: {
      term: 'Relevance',
      definition: 'A judge model’s 0 to 1 score for whether the answer addresses the question asked.',
      example: 'An answer that drifts to a related but different topic scores low.',
    },
    completeness: {
      term: 'Completeness',
      definition: 'A judge model’s 0 to 1 score for whether the answer uses all the relevant sources, rather than picking one and ignoring the rest.',
      example: 'Citing one of five relevant passages scores low.',
    },
    confidence: {
      term: 'Model confidence',
      definition: 'The answering model’s own 0 to 1 rating of how sure it is. It should be lower when sources are few or disagree. Nothing checks it.',
      example: 'Like a student guessing their own exam mark.',
    },
    citationCheck: {
      term: 'Citation check',
      definition: 'The model may cite only the passages it was given. A citation to any other passage is dropped before you see the result.',
      example: 'Like checking a reference list against the books on the shelf and crossing out the ones that are not there.',
    },
    fabricated: {
      term: 'Fabricated citation',
      definition: 'A citation to a passage the system never retrieved, so nothing it was given backs it up.',
      example: 'A footnote that points to a page nobody opened.',
    },
    baseline: {
      term: 'Baseline',
      definition: 'A simpler system to compare against.',
      example: 'Naive RAG and Single LLM are LIBRAIN’s baselines.',
    },
    notMeasured: {
      term: 'Not measured',
      definition:
        'The baselines do not set apart a novel claim and get no sentence-by-sentence check, so they have no claim risk. Unknown is not the same as low.',
    },
  },
  tr: {
    novelty: {
      term: 'Özgünlük',
      definition: 'Yeni iddianın makale kütüphanesindeki en yakın parçadan ne kadar uzak olduğu (0–1); yüksek puan, kütüphanedeki hiçbir şeye pek benzemediği anlamına gelir.',
      example: 'Bir parçayı neredeyse kelimesi kelimesine tekrarlayan bir iddia 0’a yakın puan alır.',
    },
    plausibility: {
      term: 'Akla yatkınlık',
      definition: 'Bir değerlendirici modelin, yeni iddianın atıf yaptığı kanıttan ne kadar mantıklı biçimde çıktığına dair 0–1 arası tahmini.',
      example: 'Bir dedektifin vardığı sonucun ipuçlarından çıkıp çıkmadığını sormak gibi. Parçalarla mantıksal bağı olmayan bir iddia 0,3’ün altında puan alır.',
    },
    coherence: {
      term: 'Tutarlılık',
      definition: 'Bir değerlendirici modelin, hipotezin ne kadar net ve sınanabilir olduğuna verdiği 0–1 arası puan.',
      example: '“Hava modelleri biyolojiye yardımcı olabilir” belirsizdir ve düşük puan alır. Bir bilim insanının deney tasarlayabileceği bir iddia yüksek puan alır.',
    },
    quality: {
      term: 'Kalite',
      definition: 'Özgünlük, akla yatkınlık ve tutarlılık puanlarının ortalaması (0–1).',
      example: 'Özgünlük 0,40, akla yatkınlık 0,70 ve tutarlılık 0,80 ise kalite 0,63 olur.',
    },
    risk: {
      term: 'İddia riski',
      definition: 'Yeni iddianın cümleleri arasındaki en yüksek uydurma olasılığı (0–1, düşük daha iyi). Tek bir riskli cümle onu yükseltmeye yeter.',
      example: 'Cümleler 0,05, 0,15 ve 0,70 ise iddia riski ortalama değil, 0,70 olur.',
    },
    hallucinationProbability: {
      term: 'Uydurma olasılığı',
      definition: 'Doğrulayıcı modelin, bir cümlenin parçaların desteklemediği bir şeyi olgu gibi sunduğuna dair 0–1 arası tahmini.',
      example: '“%98 doğruluk” gibi uydurma bir istatistik ölçeğin üst ucuna yakın durur.',
    },
    grounded: {
      term: 'Dayanaklı',
      definition: 'Getirilen en az bir parça tarafından doğrudan destekleniyor. Uydurma olasılığı ≈ 0.',
      example: 'Bir parça tam olarak bunu söylüyorsa: “GraphCast, hava durumunu graf sinir ağlarıyla tahmin eder.”',
    },
    extrapolated: {
      term: 'Varsayımsal',
      definition: 'Parçaların ötesine geçiyor ama hipotez olarak sunuluyor (“olabilir”, “-ebilir”). Uydurma olasılığı ≈ 0,1–0,3.',
      example: '“Hava tahmini yöntemleri protein katlanmasına aktarılabilir.”',
    },
    risky: {
      term: 'Riskli',
      definition: 'Hiçbir parçanın desteklemediği belirli bir olguyu (mekanizma, sayı, ad, atıf) kesinmiş gibi söylüyor. Uydurma olasılığı ≈ 0,6–1,0.',
      example: '“GraphCast protein katlanmasında %98 doğruluğa ulaşır”: uydurma bir sayı.',
    },
    basis: {
      term: 'Dayanak',
      definition: 'Hipotezi yazan modelin, yeni iddiadaki bir cümleye nasıl vardığını söylediği yol: genelleme, analoji ya da spekülasyon.',
      example: 'Analoji: “Bu yöntem hava haritalarında işe yaradı, protein şekillerinde de yarayabilir.”',
    },
    answerQuality: {
      term: 'Kalite',
      definition: 'Dayanaklılık, ilgililik ve eksiksizlik puanlarının ortalaması (0–1).',
      example: 'Dayanaklılık 0,90, ilgililik 0,80 ve eksiksizlik 0,70 ise kalite 0,80 olur.',
    },
    groundedness: {
      term: 'Dayanaklılık',
      definition: 'Bir değerlendirici modelin, yanıttaki her iddianın atıf yapılan bir kaynağa dayanıp dayanmadığına verdiği 0–1 arası puan.',
      example: 'Başka açılardan sağlam bir yanıttaki tek bir uydurma iddia bile puanı 0,5’in altına çekmelidir.',
    },
    relevance: {
      term: 'İlgililik',
      definition: 'Bir değerlendirici modelin, yanıtın sorulan soruyu karşılayıp karşılamadığına verdiği 0–1 arası puan.',
      example: 'Benzer ama farklı bir konuya kayan bir yanıt düşük puan alır.',
    },
    completeness: {
      term: 'Eksiksizlik',
      definition: 'Bir değerlendirici modelin, yanıtın ilgili kaynakların hepsini kullanıp kullanmadığına (birini seçip gerisini yok saymadığına) verdiği 0–1 arası puan.',
      example: 'İlgili beş parçadan yalnızca birine atıf yapan bir yanıt düşük puan alır.',
    },
    confidence: {
      term: 'Model güveni',
      definition: 'Yanıtı yazan modelin ne kadar emin olduğuna kendi verdiği 0–1 arası puan. Kaynaklar az ya da çelişkiliyse düşük olmalıdır. Bunu hiçbir şey denetlemez.',
      example: 'Bir öğrencinin sınavdan alacağı notu kendisinin tahmin etmesi gibi.',
    },
    citationCheck: {
      term: 'Atıf denetimi',
      definition: 'Model yalnızca kendisine verilen parçalara atıf yapabilir. Başka bir parçaya yapılan atıf, siz sonucu görmeden silinir.',
      example: 'Kaynakçayı raftaki kitaplarla karşılaştırıp rafta olmayanların üstünü çizmek gibi.',
    },
    fabricated: {
      term: 'Uydurma atıf',
      definition: 'Sistemin hiç getirmediği bir parçaya yapılan atıf; sisteme verilen hiçbir şey onu desteklemez.',
      example: 'Kimsenin açmadığı bir sayfayı gösteren bir dipnot gibi.',
    },
    baseline: {
      term: 'Referans sistem',
      definition: 'Karşılaştırma için kullanılan daha basit bir sistem.',
      example: 'Basit RAG ve Tek model, LIBRAIN’in referans sistemleridir.',
    },
    notMeasured: {
      term: 'Ölçülmedi',
      definition:
        'Referans sistemler ayrı bir yeni iddia üretmez ve cümle cümle denetlenmez; bu yüzden iddia riskleri yoktur. Bilinmemesi, düşük olduğu anlamına gelmez.',
    },
  },
});

/** The glossary in `lang` (Explore's terms and every result metric). */
export function glossary(lang: Lang): Record<GlossaryTermKey, GlossaryEntry> {
  return glossaryText[lang];
}

/** One entry in `lang`. */
export function glossaryEntry(key: GlossaryTermKey, lang: Lang): GlossaryEntry {
  return glossaryText[lang][key];
}

/** The English glossary. */
export const GLOSSARY = glossaryText.en;
