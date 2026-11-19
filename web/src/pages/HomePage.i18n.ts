import { strings } from '../i18n/lang';
import type { ClaimStatus } from '../api/types';
import { RECORDED_IDEA_COUNT } from '../explore/ideaCount';
import { libraryCounts } from '../lib/library';

type Verdict = { label: string; line: string };

const en = libraryCounts('en');
const tr = libraryCounts('tr');

/*
 * The home page. Every number here is checked against the repository: the
 * library size (src/lib/library.ts), the recorded ideas (counted from
 * src/explore/data at build time, see explore/ideaCount.ts), about US$0.07 an idea
 * (README: $0.066 on average), and the human-rating figures from
 * experiments/hallucination-pilot/combined-n30-per-system.csv. The example's
 * sentences, verdicts and reason are read from the recorded run itself.
 */
export const text = strings({
  en: {
    hero: {
      eyebrow: 'Open-source research demo',
      title: 'An AI that suggests research ideas, and shows where it’s guessing',
      lede: `LIBRAIN reads ${en.papers} scientific papers. Give it two topics and it suggests a research idea that links them, or ask it a question and it answers with the passages it used. A second AI then checks every sentence: backed by the papers, a reasoned guess, or risky.`,
      primary: `See ${RECORDED_IDEA_COUNT} checked ideas`,
      secondary: 'Try your own topics',
      free: 'Free to browse. No account, no key.',
    },
    example: {
      title: 'Example: the checker catches a bold number',
      topicsLabel: 'Topics',
      topics: [
        { name: 'Self-RAG', gloss: 'an AI that critiques its own answers' },
        { name: 'PharmAgents', gloss: 'AI agents for drug discovery' },
      ],
      claimLabel: 'The idea’s new claim, as the checker marked it',
      probability: (percent: string) => `Hallucination probability: ${percent}`,
      sentence: (n: number) => `Sentence ${n}`,
      reasonFor: (n: number) => `The checker’s reason for sentence ${n}`,
      translated: '',
      credit: 'A recorded run: written by Claude Sonnet 4.6, checked by Claude Haiku 4.5.',
      open: 'Open this idea with its sources',
    },
    how: {
      title: 'How it works',
      steps: [
        { title: 'Pick two topics, or ask a question', body: 'Choose from the suggestions or type your own.' },
        {
          title: 'LIBRAIN finds passages and suggests an idea',
          body: `It searches the ${en.papers} papers for the passages that matter. Every source it cites is a real passage you can open.`,
        },
        { title: 'A second AI checks every sentence', body: 'It marks each sentence of the new claim and gives its reason.' },
      ],
      legendTitle: 'What the marks mean',
      verdicts: {
        grounded: { label: 'Grounded', line: 'Backed by a passage in the papers.' },
        extrapolated: { label: 'Extrapolated', line: 'A reasoned guess that goes beyond the papers, and says so.' },
        risky: { label: 'Risky', line: 'States a specific fact the papers do not back up.' },
      } as Record<ClaimStatus, Verdict>,
    },
    modes: {
      title: 'Ready-made or live',
      intro: 'Switch any time with Recorded | Live at the top of the page.',
      recorded: {
        title: 'Recorded',
        lede: `${RECORDED_IDEA_COUNT} real runs from the project’s experiments, ready to read.`,
        points: ['Free: nothing is billed', 'No account, no API key', 'Opens instantly: no server call'],
      },
      live: {
        title: 'Live',
        lede: 'Your own topics and questions, run on the server when you ask.',
        points: [
          'Uses your own Anthropic and OpenAI API keys',
          'Your keys go only with your request and are never stored',
          'One idea costs about US$0.07 on your accounts',
          'The first request can take up to a minute while the free server wakes up',
        ],
        go: 'Switch to Live',
      },
      caveat:
        `This is a research demo, not a finished product: the checker can be wrong too, and ${en.papers} papers cover a limited set of topics.`,
    },
    inside: {
      title: 'What’s inside',
    },
    about: {
      title: 'About the project',
      evidence:
        'In a blind test by two panels of three human raters, LIBRAIN’s new claims were rated the most novel (4.47 out of 5, against 2.47 and 1.80 for two simpler systems), and its outputs drew no flags for made-up facts (0 of 30 ratings).',
      paper: 'Companion paper on Zenodo',
      doi: 'DOI 10.5281/zenodo.20745782',
      source: 'Source code on GitHub',
      licence: 'MIT licence',
      author: 'Made by Eren Mutlu',
      newTab: ' (opens in a new tab)',
    },
  },
  tr: {
    hero: {
      eyebrow: 'Açık kaynaklı araştırma demosu',
      title: 'Araştırma fikirleri öneren ve nerede tahmin yürüttüğünü gösteren bir yapay zekâ',
      lede: `LIBRAIN ${tr.papers} bilimsel makaleyi okur. İki konu verin, onları birbirine bağlayan bir araştırma fikri önersin; ya da bir soru sorun, dayandığı parçaları göstererek yanıtlasın. Ardından ikinci bir yapay zekâ her cümleyi kontrol eder: makalelerde dayanağı var, makul bir tahmin ya da riskli.`,
      primary: `Kontrol edilmiş ${RECORDED_IDEA_COUNT} fikri görün`,
      secondary: 'Kendi konularınızı deneyin',
      free: 'Göz atmak ücretsiz. Hesap ya da API key gerekmez.',
    },
    example: {
      title: 'Örnek: denetleyici iddialı bir sayıyı yakalıyor',
      topicsLabel: 'Konular',
      topics: [
        { name: 'Self-RAG', gloss: 'kendi yanıtlarını eleştiren bir yapay zekâ' },
        { name: 'PharmAgents', gloss: 'ilaç keşfi için yapay zekâ ajanları' },
      ],
      claimLabel: 'Fikrin yeni iddiası, denetleyicinin işaretleriyle',
      probability: (percent: string) => `Uydurma olasılığı: ${percent}`,
      sentence: (n: number) => `Cümle ${n}`,
      reasonFor: (n: number) => `Denetleyicinin gerekçesi (cümle ${n})`,
      translated: 'Modelin yazdığı metin İngilizceden çevrildi; aslı fikrin sayfasında.',
      credit: 'Kayıtlı bir çalıştırma: Claude Sonnet 4.6 yazdı, Claude Haiku 4.5 kontrol etti.',
      open: 'Bu fikri kaynaklarıyla açın',
    },
    how: {
      title: 'Nasıl çalışır?',
      steps: [
        { title: 'İki konu seçin ya da bir soru sorun', body: 'Önerilerden seçin ya da kendiniz yazın.' },
        {
          title: 'LIBRAIN parçaları bulur ve bir fikir önerir',
          body: `${tr.papers} makalede ilgili metin parçalarını arar. Gösterdiği her kaynak, açıp okuyabileceğiniz gerçek bir parçadır.`,
        },
        { title: 'İkinci bir yapay zekâ her cümleyi kontrol eder', body: 'Yeni iddianın her cümlesini işaretler ve gerekçesini yazar.' },
      ],
      legendTitle: 'İşaretlerin anlamı',
      verdicts: {
        grounded: { label: 'Dayanaklı', line: 'Makalelerdeki bir parçaya dayanıyor.' },
        extrapolated: { label: 'Varsayımsal', line: 'Makalelerin ötesine geçen ve bunu açıkça belirten makul bir tahmin.' },
        risky: { label: 'Riskli', line: 'Makalelerin desteklemediği belirli bir bilgiyi kesinmiş gibi sunuyor.' },
      },
    },
    modes: {
      title: 'Hazır mı, canlı mı?',
      intro: 'Sayfanın üstündeki Hazır | Canlı düğmesiyle istediğiniz zaman geçebilirsiniz.',
      recorded: {
        title: 'Hazır',
        lede: `Projenin deneylerinden ${RECORDED_IDEA_COUNT} gerçek çalıştırma, okumaya hazır.`,
        points: ['Ücretsiz: hiçbir ücret alınmaz', 'Hesap ya da API key gerekmez', 'Anında açılır: sunucuya istek gitmez'],
      },
      live: {
        title: 'Canlı',
        lede: 'Kendi konularınız ve sorularınız, siz sorduğunuzda sunucuda çalışır.',
        points: [
          'Kendi Anthropic ve OpenAI API key’lerinizle çalışır',
          'API key’leriniz yalnızca isteğinizle gönderilir, saklanmaz',
          'Bir fikir, hesaplarınıza yaklaşık 0,07 ABD doları tutar',
          'Ücretsiz sunucu uyanırken ilk isteğin yanıtı bir dakikayı bulabilir',
        ],
        go: 'Canlı moda geç',
      },
      caveat:
        `Bu bir araştırma demosu, bitmiş bir ürün değil: denetleyici de yanılabilir ve ${tr.papers} makale yalnızca sınırlı sayıda konuyu kapsar.`,
    },
    inside: {
      title: 'Neler var?',
    },
    about: {
      title: 'Proje hakkında',
      evidence:
        'Üçer kişilik iki insan değerlendirici grubunun yaptığı kör testte LIBRAIN’in yeni iddiaları en özgün bulundu (5 üzerinden 4,47; iki basit referans sistemde 2,47 ve 1,80) ve çıktılarında hiç uydurma bilgi işaretlenmedi (30 değerlendirmede 0).',
      paper: 'Zenodo’daki proje makalesi',
      doi: 'DOI 10.5281/zenodo.20745782',
      source: 'GitHub’da kaynak kod',
      licence: 'MIT lisansı',
      author: 'Hazırlayan: Eren Mutlu',
      newTab: ' (yeni sekmede açılır)',
    },
  },
});
