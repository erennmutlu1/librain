import { strings } from '../i18n/lang';

export const text = strings({
  en: {
    heading: 'Ingest from arXiv',
    label: 'arXiv id or link',
    invalid: 'Not an arXiv id. Use a new-style id such as 2005.11401; a version, an "arXiv:" prefix or an arxiv.org abs/pdf link also work.',
    willIngest: (id: string, existing: boolean) =>
      `Will ingest arXiv ${id}${existing ? ', which is already in the library and will be processed afresh' : ''}.`,
    example: 'For example 2005.11401, arXiv:2005.11401v2 or an arxiv.org/abs link. Title, authors and year come from arXiv.',
    mockNote: 'Mock mode: 2005.11401 returns its recorded result; other ids are simulated without metadata.',
    ingest: 'Ingest',
    ingesting: 'Ingesting…',
    fetching: (id: string) => `Fetching ${id} from arXiv, then extracting the text, splitting it into passages and making them searchable…`,
    seconds: (n: string) => `${n} s`,
    cancel: 'Cancel',
    ingested: (id: string) => `Ingested ${id}`,
    asChunks: (n: string) => `, as ${n} passages.`,
  },
  tr: {
    heading: 'arXiv’den içe aktar',
    label: 'arXiv kimliği ya da bağlantısı',
    invalid: 'Bu bir arXiv kimliği değil. 2005.11401 gibi yeni biçimli bir kimlik kullanın; sürüm eki, "arXiv:" öneki ya da arxiv.org abs/pdf bağlantısı da olur.',
    willIngest: (id: string, existing: boolean) =>
      `İçe aktarılacak arXiv kimliği: ${id}${existing ? '. Zaten kütüphanede olduğu için baştan işlenecek' : ''}.`,
    example: 'Örneğin 2005.11401, arXiv:2005.11401v2 ya da bir arxiv.org/abs bağlantısı. Başlık, yazarlar ve yıl arXiv’den gelir.',
    mockNote: 'Örnek veri modu: 2005.11401 kaydedilmiş sonucunu döndürür; diğer kimlikler üst veri olmadan taklit edilir.',
    ingest: 'İçe aktar',
    ingesting: 'İçe aktarılıyor…',
    fetching: (id: string) => `arXiv’den getiriliyor: ${id}. Ardından metin çıkarılıyor, parçalara bölünüyor ve aranabilir hâle getiriliyor…`,
    seconds: (n: string) => `${n} sn`,
    cancel: 'İptal',
    ingested: (id: string) => `İçe aktarıldı: ${id}`,
    asChunks: (n: string) => ` (${n} parça).`,
  },
});
