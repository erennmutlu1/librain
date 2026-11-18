import { strings } from '../../i18n/lang';

const ideasEn = (n: number) => `${n} ${n === 1 ? 'idea' : 'ideas'}`;
const ideasTr = (n: number) => `${n} fikir`;

export const chartText = strings({
  en: {
    hideTable: 'Hide the table',
    showTable: 'Show as a table',
    ideas: ideasEn,
    // Rating histogram
    histTitle: 'Rating distribution',
    histCaption: (total: number, lo: string, hi: string, peakFrom: string, peakTo: string, peakCount: number) =>
      `${total} ideas in half-point bins. Every rating falls between ${lo} and ${hi}; the most common bin is ${peakFrom}–${peakTo} (${ideasEn(peakCount)}).`,
    colRating: 'Rating',
    colIdeas: 'Ideas',
    colRuns: 'Runs',
    binRange: (from: string, to: string) => `${from} to ${to}`,
    histAria: (parts: string) => `Histogram of ratings: ${parts}.`,
    histAriaPart: (count: number, from: string, to: string) => `${count} between ${from} and ${to}`,
    barTitle: (from: string, to: string, count: number, ids: string) => `${from}–${to}: ${ideasEn(count)} (${ids})`,
    // Category bars
    catTitle: 'Average rating by category',
    catCaption: (best: string, avg: string) => `Bars run from 0 to 10. ${best} has the highest average (${avg}).`,
    colCategory: 'Category',
    colAverage: 'Average',
    colBest: 'Best',
    catAria: (parts: string) => `Average rating by category: ${parts}.`,
    catAriaPart: (name: string, avg: string, count: number) => `${name} ${avg} from ${count} ideas`,
    // Scatter
    scatterTitle: 'Novelty against plausibility',
    scatterCaption:
      'One dot per idea, coloured by category. Up and to the right is more novel and more plausible. Select a dot to open its idea; pick a category below to pick it out.',
    colIdea: 'Idea',
    colNovelty: 'Novelty',
    colPlausibility: 'Plausibility',
    scatterAria: 'Scatter plot: one link per idea',
    axisNovelty: 'Novelty →',
    axisPlausibility: 'Plausibility →',
    dotAria: (id: string, category: string, topic: string, nov: string, pla: string, rating: string) =>
      `${id}, ${category}: ${topic}. Novelty ${nov}, plausibility ${pla}, rated ${rating} out of 10.`,
    tooltip: (nov: string, pla: string, rating: string) => `Novelty ${nov} · plausibility ${pla} · ${rating}/10`,
    legend: 'Pick out a category',
  },
  tr: {
    hideTable: 'Tabloyu gizle',
    showTable: 'Tablo olarak göster',
    ideas: ideasTr,
    histTitle: 'Puan dağılımı',
    histCaption: (total: number, lo: string, hi: string, peakFrom: string, peakTo: string, peakCount: number) =>
      `Yarım puanlık aralıklarda ${total} fikir. Tüm puanlar ${lo} ile ${hi} arasında; en sık aralık ${peakFrom}–${peakTo} (${ideasTr(peakCount)}).`,
    colRating: 'Puan',
    colIdeas: 'Fikir',
    colRuns: 'Çalıştırmalar',
    binRange: (from: string, to: string) => `${from} – ${to}`,
    histAria: (parts: string) => `Puan histogramı: ${parts}.`,
    histAriaPart: (count: number, from: string, to: string) => `${from} ile ${to} arasında ${count}`,
    barTitle: (from: string, to: string, count: number, ids: string) => `${from}–${to}: ${ideasTr(count)} (${ids})`,
    catTitle: 'Kategoriye göre ortalama puan',
    catCaption: (best: string, avg: string) => `Çubuklar 0 ile 10 arasında uzanır. En yüksek ortalama ${best} kategorisinde (${avg}).`,
    colCategory: 'Kategori',
    colAverage: 'Ortalama',
    colBest: 'En iyi',
    catAria: (parts: string) => `Kategoriye göre ortalama puan: ${parts}.`,
    catAriaPart: (name: string, avg: string, count: number) => `${name} ${avg}, ${count} fikir`,
    scatterTitle: 'Özgünlük ve akla yatkınlık',
    scatterCaption:
      'Her fikir için bir nokta, kategoriye göre renklendirilmiş. Yukarı ve sağa gitmek daha özgün ve daha akla yatkın demektir. Fikrini açmak için bir noktayı seçin; öne çıkarmak için aşağıdan bir kategori seçin.',
    colIdea: 'Fikir',
    colNovelty: 'Özgünlük',
    colPlausibility: 'Akla yatkınlık',
    scatterAria: 'Dağılım grafiği: her fikir için bir bağlantı',
    axisNovelty: 'Özgünlük →',
    axisPlausibility: 'Akla yatkınlık →',
    dotAria: (id: string, category: string, topic: string, nov: string, pla: string, rating: string) =>
      `${id}, ${category}: ${topic}. Özgünlük ${nov}, akla yatkınlık ${pla}, 10 üzerinden ${rating} puan.`,
    tooltip: (nov: string, pla: string, rating: string) => `Özgünlük ${nov} · akla yatkınlık ${pla} · ${rating}/10`,
    legend: 'Bir kategoriyi öne çıkar',
  },
});
