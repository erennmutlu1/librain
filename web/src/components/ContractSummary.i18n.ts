import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    title: 'Citation check',
    legacy: (kept: number) =>
      `${kept} supporting ${kept === 1 ? 'passage' : 'passages'} kept. The number of dropped citations was not recorded for this run.`,
    legacyTechnical: 'This run predates the claimed/dropped counters.',
    heading: (dropped: number) => `Citation check ${dropped > 0 ? `dropped ${dropped}` : 'dropped none'}`,
    claimed: (claimed: number) => `The model cited ${claimed} supporting ${claimed === 1 ? 'passage' : 'passages'};`,
    removed: (n: number) =>
      `${n} ${n === 1 ? 'was' : 'were'} not among the retrieved passages and ${n === 1 ? 'was' : 'were'} dropped before you saw ${n === 1 ? 'it' : 'them'}.`,
    allIn: 'every one was among the retrieved passages.',
  },
  tr: {
    title: 'Atıf denetimi',
    legacy: (kept: number) => `${kept} destekleyici parça tutuldu. Bu çalıştırmada silinen atıf sayısı kaydedilmedi.`,
    legacyTechnical: 'Bu çalıştırma, öne sürülen/silinen atıf sayaçlarından önce kaydedildi.',
    heading: (dropped: number) => (dropped > 0 ? `Atıf denetimi ${dropped} atfı sildi` : 'Atıf denetimi hiçbir atfı silmedi'),
    claimed: (claimed: number) => `Model ${claimed} destekleyici parçaya atıf yaptı;`,
    removed: (n: number) => `${n} tanesi getirilen parçalar arasında yoktu ve siz görmeden silindi.`,
    allIn: 'hepsi getirilen parçalar arasındaydı.',
  },
});
