import { strings, type Lang } from '../i18n/lang';
import type { GlossaryKey } from './model';

type Entry = { term: string; definition: string };

/** One plain sentence per term, shown in Explore's glossary tooltips. */
const glossaryText = strings<Record<GlossaryKey, Entry>>({
  en: {
    novelty: {
      term: 'Novelty',
      definition: 'How far the idea sits from the closest passage in the paper corpus; higher means less like anything already there.',
    },
    plausibility: {
      term: 'Plausibility',
      definition: 'A judge model’s 0 to 1 estimate of how likely the idea is to hold up, given the evidence it cites.',
    },
    coherence: {
      term: 'Coherence',
      definition: 'A judge model’s 0 to 1 score for how well the idea’s steps fit together into one argument.',
    },
    risk: {
      term: 'Claim risk',
      definition: 'The highest chance, over the novel claim’s sentences, that one states something as fact the evidence does not support.',
    },
    grounded: { term: 'Grounded', definition: 'Directly supported by at least one retrieved chunk.' },
    extrapolated: { term: 'Extrapolated', definition: 'Goes beyond the evidence, but is framed as a hypothesis.' },
    risky: {
      term: 'Risky',
      definition: 'States a specific fact (mechanism, number, name, attribution) the evidence does not support.',
    },
  },
  tr: {
    novelty: {
      term: 'Özgünlük',
      definition: 'Fikrin, makale derlemindeki en yakın pasaja ne kadar uzak durduğu; yüksek değer, orada olanlara daha az benzediği anlamına gelir.',
    },
    plausibility: {
      term: 'Akla yatkınlık',
      definition: 'Bir değerlendirici modelin, fikrin alıntıladığı kanıtlara bakarak ne kadar ayakta kalabileceğine dair 0 ile 1 arası tahmini.',
    },
    coherence: {
      term: 'Tutarlılık',
      definition: 'Bir değerlendirici modelin, fikrin adımlarının tek bir argümanda ne kadar iyi birleştiğine verdiği 0 ile 1 arası puan.',
    },
    risk: {
      term: 'İddia riski',
      definition: 'Özgün iddianın cümleleri arasında, birinin kanıtın desteklemediği bir şeyi olgu gibi sunma olasılığının en yükseği.',
    },
    grounded: { term: 'Dayanaklı', definition: 'Getirilen en az bir parça tarafından doğrudan destekleniyor.' },
    extrapolated: { term: 'Çıkarımsal', definition: 'Kanıtın ötesine geçiyor, ancak hipotez olarak sunuluyor.' },
    risky: {
      term: 'Riskli',
      definition: 'Kanıtın desteklemediği belirli bir olguyu (mekanizma, sayı, ad, atıf) kesin gibi söylüyor.',
    },
  },
});

/** The glossary in `lang`. */
export function glossary(lang: Lang): Record<GlossaryKey, Entry> {
  return glossaryText[lang];
}

/** The English glossary. */
export const GLOSSARY = glossaryText.en;
