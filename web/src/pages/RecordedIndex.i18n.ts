import { strings } from '../i18n/lang';

export const recordedText = strings({
  en: {
    baseline: 'Baseline comparison (the 4 extra runs)',
    openai: 'OpenAI runs',
    snapshot: 'API snapshots',
    other: 'Other recordings',
    recordedRuns: 'Recorded runs',
    groups: (n: number) => `${n} groups. `,
    pickOne: 'Pick one to show it again.',
    countNote: (total: number, ideas: number, base: number) =>
      `${total} recorded runs = the ${ideas} ideas + ${base} from the baseline comparison (a simpler system run on the same topics).`,
  },
  tr: {
    baseline: 'Referans sistem karşılaştırması',
    openai: 'OpenAI çalıştırmaları',
    snapshot: 'API anlık görüntüleri',
    other: 'Diğer kayıtlar',
    recordedRuns: 'Kayıtlı çalıştırmalar',
    groups: (n: number) => `${n} grup. `,
    pickOne: 'Yeniden göstermek için birini seçin.',
    countNote: (total: number, ideas: number, base: number) =>
      `Kayıtlı çalıştırma sayısı: ${total} = ${ideas} fikir + referans sistem karşılaştırmasından ${base} çalıştırma (aynı konularda çalışan daha basit bir sistem).`,
  },
});
