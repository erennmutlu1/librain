import { strings } from '../i18n/lang';

/** Plain-language names for the backend's claim and basis vocabulary, in both languages. */
interface Meta {
  label: string;
  description: string;
}

export const text = strings({
  en: {
    status: {
      grounded: { label: 'Grounded', description: 'Directly supported by at least one retrieved passage.' },
      extrapolated: { label: 'Extrapolated', description: 'Goes beyond the passages, but is framed as a hypothesis.' },
      risky: {
        label: 'Risky',
        description: 'States a specific fact (mechanism, number, name, attribution) that no passage supports.',
      },
    } as Record<'grounded' | 'extrapolated' | 'risky', Meta>,
    basis: {
      generalization: { label: 'Generalization', description: 'Extends retrieved evidence to a new case.' },
      analogy: { label: 'Analogy', description: 'Transfers a mechanism from a related domain.' },
      pure_speculation: { label: 'Speculation', description: 'Not derivable from the retrieved passages.' },
    } as Record<string, Meta>,
    unknownBasis: 'Unknown',
    basisFallback: 'Basis type reported by the model.',
    systems: {
      librain: {
        name: 'LIBRAIN',
        summary:
          'Finds passages for each topic, lets the model cite only those passages (any other citation is dropped), keeps speculation in a separate novel claim, then checks that claim sentence by sentence.',
      },
      naiveRag: {
        name: 'Naive RAG',
        summary:
          'Finds the same passages and asks for a cited hypothesis in one call, but keeps every citation the model gives, so citations to passages it never retrieved stay in as fabrications.',
      },
      singleLlm: {
        name: 'Single LLM',
        summary: 'One model call with only the topic names: no passages, no citations, no checks. The simplest point of comparison.',
      },
    },
  },
  tr: {
    status: {
      grounded: { label: 'Dayanaklı', description: 'Getirilen en az bir parça tarafından doğrudan destekleniyor.' },
      extrapolated: { label: 'Varsayımsal', description: 'Parçaların ötesine geçiyor ama hipotez olarak sunuluyor.' },
      risky: {
        label: 'Riskli',
        description: 'Hiçbir parçanın desteklemediği belirli bir olguyu (mekanizma, sayı, ad, atıf) kesinmiş gibi söylüyor.',
      },
    },
    basis: {
      generalization: { label: 'Genelleme', description: 'Getirilen kanıtı yeni bir duruma genişletiyor.' },
      analogy: { label: 'Analoji', description: 'Bir mekanizmayı ilişkili bir alandan aktarıyor.' },
      pure_speculation: { label: 'Spekülasyon', description: 'Getirilen parçalardan çıkarılamıyor.' },
    },
    unknownBasis: 'Bilinmiyor',
    basisFallback: 'Model tarafından bildirilen dayanak türü.',
    systems: {
      librain: {
        name: 'LIBRAIN',
        summary:
          'Her konu için metin parçaları getirir, modelin yalnızca bu parçalara atıf yapmasına izin verir (diğer atıflar silinir), spekülasyonu ayrı bir yeni iddiada toplar, sonra bu iddiayı cümle cümle denetler.',
      },
      naiveRag: {
        name: 'Basit RAG',
        summary:
          'Aynı parçaları getirir ve atıflı bir hipotezi tek çağrıda ister; ancak modelin verdiği her atfı tutar. Böylece hiç getirilmemiş parçalara yapılan atıflar uydurma olarak kalır.',
      },
      singleLlm: {
        name: 'Tek model',
        summary: 'Yalnızca konu adlarıyla tek bir model çağrısı: parça yok, atıf yok, denetim yok. En basit karşılaştırma noktası.',
      },
    },
  },
});
