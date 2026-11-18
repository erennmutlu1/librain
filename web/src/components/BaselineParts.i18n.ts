import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    noCitations: 'The model gave no citations.',
    fabricated: (n: number, total: number) => `${n} of ${total} citations fabricated`,
    allIn: (total: number) => `All ${total} citations are among the retrieved passages`,
    inconsistent: (reported: number | null, marked: number) =>
      `The API reported ${reported ?? 0} fabricated, but ${marked} citations are marked as not retrieved.`,
    resolved: 'Among the retrieved passages',
    unresolved: 'Fabricated: not in the retrieved set',
    retrieved: (n: string) => `${n} passages retrieved`,
    tokens: (i: string, o: string) => `${i} in / ${o} out tokens`,
  },
  tr: {
    noCitations: 'Model hiç atıf vermedi.',
    fabricated: (n: number, total: number) => `${total} atfın ${n} tanesi uydurma`,
    allIn: (total: number) => `${total} atfın tamamı getirilen parçalar arasında`,
    inconsistent: (reported: number | null, marked: number) =>
      `API ${reported ?? 0} uydurma atıf bildirdi, ancak ${marked} atıf getirilmemiş olarak işaretli.`,
    resolved: 'Getirilen parçalar arasında',
    unresolved: 'Uydurma: getirilen parçalar arasında yok',
    retrieved: (n: string) => `${n} parça getirildi`,
    tokens: (i: string, o: string) => `${i} girdi / ${o} çıktı token`,
  },
});
