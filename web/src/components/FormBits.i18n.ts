import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    recordedRuns: 'Recorded runs',
    noMatch: 'No recording matches these inputs.',
    showingInstead: (label: string) => `Mock mode is showing the recorded run for “${label}” instead.`,
    recordedOutput: 'Recorded output:',
  },
  tr: {
    recordedRuns: 'Hazır çalıştırmalar',
    noMatch: 'Bu girdilerle eşleşen bir kayıt yok.',
    showingInstead: (label: string) => `Örnek veri modu bunun yerine “${label}” için kaydedilmiş çalıştırmayı gösteriyor.`,
    recordedOutput: 'Kaydedilmiş çıktı:',
  },
});
