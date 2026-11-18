import { strings } from '../i18n/lang';
import type { KeyCheckStatus } from '../public/clients';

interface Field {
  label: string;
  show: string;
  hide: string;
  getKey: string;
}

export const text = strings({
  en: {
    title: 'Your API keys',
    bothSet: ' (both set)',
    /** First thing in the panel: what Live mode costs, before any key is entered. US$0.066 average over 46 runs (README). */
    cost: 'About US$0.07 per new idea and US$0.03 per question, billed to your Anthropic and OpenAI accounts. Compare runs three systems and costs more than a new idea.',
    intro:
      'Recorded mode needs no keys. Live mode runs on the LIBRAIN API with your own Anthropic API key (writing and checking the hypothesis) and OpenAI API key (making papers and questions searchable).',
    disclaimer:
      'Your keys are sent only with your own requests to the LIBRAIN API, which passes them to Anthropic and OpenAI for that request and does not store or log them. Usage is billed to your accounts. Use keys with a spending limit. LIBRAIN is open source (MIT) and provided as is, without warranty or responsibility for how you use it.',
    anthropic: {
      label: 'Anthropic API key',
      show: 'Show Anthropic API key',
      hide: 'Hide Anthropic API key',
      getKey: 'Get a key at console.anthropic.com',
    } as Field,
    openai: {
      label: 'OpenAI API key',
      show: 'Show OpenAI API key',
      hide: 'Hide OpenAI API key',
      getKey: 'Get a key at platform.openai.com/api-keys',
    } as Field,
    show: 'Show',
    hide: 'Hide',
    newTab: ' (opens in a new tab)',
    hint: {
      anthropic: 'Anthropic keys usually start with sk-ant-.',
      looksAnthropic: 'This looks like an Anthropic key. OpenAI keys start with sk-.',
      openai: 'OpenAI keys usually start with sk-.',
    },
    remember: 'Remember on this device',
    rememberHint: 'Off: kept for this tab only (sessionStorage). On: kept in this browser (localStorage) until you clear them.',
    save: 'Save keys',
    saveLive: 'Save and go Live',
    clear: 'Clear',
    saved: {
      memoryOnly: 'Saved for this tab only: browser storage is unavailable.',
      device: 'Saved on this device until you clear them.',
      tab: 'Saved for this tab only; they are forgotten when it closes.',
      needBoth: 'Live mode needs both keys.',
      liveOn: 'Live mode is on.',
      switchToUse: 'Switch to Live to use them.',
      cleared: 'Cleared from this device.',
      clearedBack: 'Cleared from this device. Back to Recorded mode.',
    },
    facts: { sentTo: 'Keys are sent only to', sameOrigin: 'this site’s own server', source: 'Source code' },
    check: {
      button: 'Check my keys',
      checking: 'Checking…',
      note: 'Free: the API lists each provider’s models with the keys above. It shows whether a key is accepted, not whether your account has credit.',
      results: 'Key check',
      status: {
        valid: 'Accepted',
        invalid: 'Rejected',
        rate_limited: 'Rate limited, so it may still be valid. Try again shortly.',
        unreachable: 'Could not reach the provider. Try again shortly.',
        not_provided: 'Not entered',
      } as Record<KeyCheckStatus, string>,
      waking: 'Waking up the free server. The first request after a quiet spell can take up to a minute.',
      tooMany: (seconds?: number) =>
        seconds ? `Too many checks. Try again in ${seconds} s.` : 'Too many checks. Try again in a minute.',
      noKey: 'Enter at least one key to check.',
      network: 'Could not reach the LIBRAIN API. Check your connection and try again.',
      failed: 'The check did not complete. Try again.',
    },
  },
  tr: {
    title: 'API key’ler',
    bothSet: ' (ikisi de girildi)',
    cost: 'Yeni fikir başına yaklaşık 0,07, soru başına yaklaşık 0,03 ABD doları; ücret Anthropic ve OpenAI hesaplarınıza yansır. Karşılaştır üç sistemi çalıştırır ve yeni bir fikirden daha pahalıdır.',
    intro:
      'Hazır mod API key gerektirmez. Canlı mod, LIBRAIN API’de kendi Anthropic API key’inizle (hipotezi yazma ve denetleme) ve OpenAI API key’inizle (makaleleri ve soruları aranabilir hâle getirme) çalışır.',
    disclaimer:
      'API key’leriniz yalnızca kendi isteklerinizle birlikte LIBRAIN API’ye gönderilir; API bunları yalnızca o istek için Anthropic ve OpenAI’ye iletir, saklamaz ve kaydetmez. Kullanım ücreti hesaplarınıza yansır. Harcama sınırı olan API key’ler kullanın. LIBRAIN açık kaynaktır (MIT) ve olduğu gibi sunulur; hiçbir garanti vermez ve nasıl kullandığınızdan sorumlu değildir.',
    anthropic: {
      label: 'Anthropic API key',
      show: 'Anthropic API key’ini göster',
      hide: 'Anthropic API key’ini gizle',
      getKey: 'console.anthropic.com adresinden API key alın',
    },
    openai: {
      label: 'OpenAI API key',
      show: 'OpenAI API key’ini göster',
      hide: 'OpenAI API key’ini gizle',
      getKey: 'platform.openai.com/api-keys adresinden API key alın',
    },
    show: 'Göster',
    hide: 'Gizle',
    newTab: ' (yeni sekmede açılır)',
    hint: {
      anthropic: 'Anthropic API key’leri genellikle sk-ant- ile başlar.',
      looksAnthropic: 'Bu bir Anthropic API key’ine benziyor. OpenAI API key’leri sk- ile başlar.',
      openai: 'OpenAI API key’leri genellikle sk- ile başlar.',
    },
    remember: 'Bu cihazda hatırla',
    rememberHint: 'Kapalı: yalnızca bu sekmede tutulur (sessionStorage). Açık: siz silene kadar bu tarayıcıda tutulur (localStorage).',
    save: 'API key’leri kaydet',
    saveLive: 'Kaydet ve Canlı moda geç',
    clear: 'Temizle',
    saved: {
      memoryOnly: 'Yalnızca bu sekme için kaydedildi: tarayıcı depolaması kullanılamıyor.',
      device: 'Siz silene kadar bu cihazda kaydedildi.',
      tab: 'Yalnızca bu sekme için kaydedildi; sekme kapanınca unutulur.',
      needBoth: 'Canlı mod için iki API key de gerekli.',
      liveOn: 'Canlı mod açık.',
      switchToUse: 'Kullanmak için Canlı moda geçin.',
      cleared: 'Bu cihazdan silindi.',
      clearedBack: 'Bu cihazdan silindi. Hazır moda dönüldü.',
    },
    facts: { sentTo: 'API key’lerin gönderildiği tek adres', sameOrigin: 'bu sitenin kendi sunucusu', source: 'Kaynak kod' },
    check: {
      button: 'API key’lerimi kontrol et',
      checking: 'Kontrol ediliyor…',
      note: 'Ücretsizdir: API, yukarıdaki API key’lerle her sağlayıcının modellerini listeler. API key’in kabul edilip edilmediğini gösterir, hesabınızda kredi olup olmadığını değil.',
      results: 'API key kontrolü',
      status: {
        valid: 'Kabul edildi',
        invalid: 'Reddedildi',
        rate_limited: 'İstek sınırına takıldı; API key yine de geçerli olabilir. Biraz sonra yeniden deneyin.',
        unreachable: 'Sağlayıcıya ulaşılamadı. Biraz sonra yeniden deneyin.',
        not_provided: 'Girilmedi',
      },
      waking: 'Ücretsiz sunucu uyandırılıyor. Bir süre istek gelmediyse ilk isteğin yanıtı bir dakikayı bulabilir.',
      tooMany: (seconds?: number) =>
        seconds ? `Çok fazla kontrol yapıldı. ${seconds} sn sonra yeniden deneyin.` : 'Çok fazla kontrol yapıldı. Bir dakika sonra yeniden deneyin.',
      noKey: 'Kontrol etmek için en az bir API key girin.',
      network: 'LIBRAIN API’ye ulaşılamadı. Bağlantınızı kontrol edip yeniden deneyin.',
      failed: 'Kontrol tamamlanamadı. Yeniden deneyin.',
    },
  },
});
