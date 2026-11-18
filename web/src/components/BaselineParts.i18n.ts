import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    noCitations: 'The model claimed no citations.',
    fabricated: (n: number, total: number) => `${n} of ${total} citations fabricated`,
    allIn: (total: number) => `All ${total} citations are in the retrieved set`,
    inconsistent: (reported: number | null, marked: number) =>
      `The API reported ${reported ?? 0} fabricated, but ${marked} citations are marked unresolved.`,
    resolved: 'In retrieved set',
    unresolved: 'Fabricated: not in the retrieved set',
    retrieved: (n: string) => `${n} chunks retrieved`,
    tokens: (i: string, o: string) => `${i} in / ${o} out tokens`,
  },
  tr: {
    noCitations: 'Model hiç atıf öne sürmedi.',
    fabricated: (n: number, total: number) => `${total} atıfın ${n} tanesi uydurma`,
    allIn: (total: number) => `${total} atfın tamamı getirilen kümede`,
    inconsistent: (reported: number | null, marked: number) =>
      `API ${reported ?? 0} uydurma bildirdi, ancak ${marked} atıf çözümsüz olarak işaretli.`,
    resolved: 'Getirilen kümede',
    unresolved: 'Uydurma: getirilen kümede yok',
    retrieved: (n: string) => `${n} parça getirildi`,
    tokens: (i: string, o: string) => `${i} girdi / ${o} çıktı belirteci`,
  },
});
