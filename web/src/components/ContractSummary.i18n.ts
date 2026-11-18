import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    title: 'Citation contract',
    legacy: (kept: number) =>
      `${kept} supporting ${kept === 1 ? 'chunk' : 'chunks'} kept. This run predates the claimed/dropped counters, so the number dropped is not recorded.`,
    heading: (dropped: number) => `Citation contract ${dropped > 0 ? `dropped ${dropped}` : 'dropped none'}`,
    claimed: (claimed: number) => `The model claimed ${claimed} supporting ${claimed === 1 ? 'chunk' : 'chunks'};`,
    removed: (n: number) =>
      `${n} ${n === 1 ? 'was' : 'were'} not in the retrieved set and ${n === 1 ? 'was' : 'were'} removed before you saw them.`,
    allIn: 'every one was in the retrieved set.',
  },
  tr: {
    title: 'Atıf sözleşmesi',
    legacy: (kept: number) =>
      `${kept} destekleyici parça tutuldu. Bu çalıştırma, öne sürülen/atılan sayaçlarından önce kaydedildiği için atılan sayısı bilinmiyor.`,
    heading: (dropped: number) => (dropped > 0 ? `Atıf sözleşmesi ${dropped} atıf attı` : 'Atıf sözleşmesi hiçbir atıf atmadı'),
    claimed: (claimed: number) => `Model ${claimed} destekleyici parça öne sürdü;`,
    removed: (n: number) => `${n} tanesi getirilen kümede yoktu ve siz görmeden kaldırıldı.`,
    allIn: 'hepsi getirilen kümedeydi.',
  },
});
