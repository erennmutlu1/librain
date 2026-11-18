import { strings } from '../i18n/lang';

/** Plain-language names for the backend's claim and basis vocabulary, in both languages. */
interface Meta {
  label: string;
  description: string;
}

export const text = strings({
  en: {
    status: {
      grounded: { label: 'Grounded', description: 'Directly supported by at least one retrieved chunk.' },
      extrapolated: { label: 'Extrapolated', description: 'Goes beyond the evidence, but is framed as a hypothesis.' },
      risky: {
        label: 'Risky',
        description: 'States a specific fact (mechanism, number, name, attribution) the evidence does not support.',
      },
    } as Record<'grounded' | 'extrapolated' | 'risky', Meta>,
    basis: {
      generalization: { label: 'Generalization', description: 'Extends retrieved evidence to a new case.' },
      analogy: { label: 'Analogy', description: 'Transfers a mechanism from a related domain.' },
      pure_speculation: { label: 'Speculation', description: 'Not derivable from the retrieved chunks.' },
    } as Record<string, Meta>,
    unknownBasis: 'Unknown',
    basisFallback: 'Basis type reported by the model.',
    systems: {
      librain: {
        name: 'LIBRAIN',
        summary:
          'Retrieves evidence for each topic, makes the model cite only retrieved chunks (anything else is dropped), fences speculation into a separate novel claim, then checks that claim sentence by sentence.',
      },
      naiveRag: {
        name: 'Naive-RAG',
        summary:
          'Retrieves the same evidence and asks for cited output in one call, but keeps every citation the model claims, so citations that point outside the retrieved set survive as fabrications.',
      },
      singleLlm: {
        name: 'Single-LLM',
        summary: 'One model call with only the topic names: no retrieval, no citations, no checks. The lower bound.',
      },
    },
  },
  tr: {
    status: {
      grounded: { label: 'Dayanaklı', description: 'Getirilen en az bir parça tarafından doğrudan destekleniyor.' },
      extrapolated: { label: 'Çıkarımsal', description: 'Kanıtın ötesine geçiyor ama hipotez olarak çerçevelenmiş.' },
      risky: {
        label: 'Riskli',
        description: 'Kanıtın desteklemediği belirli bir olgu (mekanizma, sayı, ad, atıf) öne sürüyor.',
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
          'Her konu için kanıt getirir, modelin yalnızca getirilen parçalara atıf yapmasını sağlar (diğer her şey atılır), spekülasyonu ayrı bir özgün iddiaya hapseder, sonra bu iddiayı cümle cümle denetler.',
      },
      naiveRag: {
        name: 'Naive-RAG',
        summary:
          'Aynı kanıtı getirir ve atıflı çıktıyı tek çağrıda ister; ancak modelin öne sürdüğü her atfı tutar, böylece getirilen kümenin dışına işaret eden atıflar uydurma olarak kalır.',
      },
      singleLlm: {
        name: 'Single-LLM',
        summary: 'Yalnızca konu adlarıyla tek bir model çağrısı: getirme yok, atıf yok, denetim yok. Alt sınır.',
      },
    },
  },
});
