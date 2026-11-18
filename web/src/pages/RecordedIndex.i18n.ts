import { strings } from '../i18n/lang';

export const recordedText = strings({
  en: {
    baseline: 'Baseline comparison',
    openai: 'OpenAI runs',
    snapshot: 'API snapshots',
    other: 'Other recordings',
    recordedRuns: 'Recorded runs',
    groups: (n: number) => `${n} groups. `,
    pickOne: 'Pick one to replay it.',
  },
  tr: {
    baseline: 'Temel karşılaştırma',
    openai: 'OpenAI çalıştırmaları',
    snapshot: 'API anlık görüntüleri',
    other: 'Diğer kayıtlar',
    recordedRuns: 'Kayıtlı çalıştırmalar',
    groups: (n: number) => `${n} grup. `,
    pickOne: 'Yeniden oynatmak için birini seçin.',
  },
});
