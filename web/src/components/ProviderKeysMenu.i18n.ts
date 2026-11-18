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
    intro:
      'Recorded mode needs no keys. Live mode runs on the LIBRAIN API with your own Anthropic key (generation and checks) and OpenAI key (embeddings).',
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
    facts: { sentTo: 'Keys are sent only to', sameOrigin: 'this site’s own origin', source: 'Source code' },
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
    title: 'API anahtarlarınız',
    bothSet: ' (ikisi de girildi)',
    intro:
      'Kayıtlı mod anahtar gerektirmez. Canlı mod, LIBRAIN API’de kendi Anthropic anahtarınızla (üretim ve denetimler) ve OpenAI anahtarınızla (gömmeler) çalışır.',
    disclaimer:
      'Anahtarlarınız yalnızca kendi isteklerinizle birlikte LIBRAIN API’ye gönderilir; API bunları yalnızca o istek için Anthropic ve OpenAI’ye iletir, saklamaz ve kaydetmez. Kullanım ücreti hesaplarınıza yansır. Harcama sınırı olan anahtarlar kullanın. LIBRAIN açık kaynaktır (MIT) ve olduğu gibi sunulur; hiçbir garanti vermez ve nasıl kullandığınızdan sorumlu değildir.',
    anthropic: {
      label: 'Anthropic API anahtarı',
      show: 'Anthropic API anahtarını göster',
      hide: 'Anthropic API anahtarını gizle',
      getKey: 'console.anthropic.com adresinden anahtar alın',
    },
    openai: {
      label: 'OpenAI API anahtarı',
      show: 'OpenAI API anahtarını göster',
      hide: 'OpenAI API anahtarını gizle',
      getKey: 'platform.openai.com/api-keys adresinden anahtar alın',
    },
    show: 'Göster',
    hide: 'Gizle',
    newTab: ' (yeni sekmede açılır)',
    hint: {
      anthropic: 'Anthropic anahtarları genellikle sk-ant- ile başlar.',
      looksAnthropic: 'Bu bir Anthropic anahtarına benziyor. OpenAI anahtarları sk- ile başlar.',
      openai: 'OpenAI anahtarları genellikle sk- ile başlar.',
    },
    remember: 'Bu cihazda hatırla',
    rememberHint: 'Kapalı: yalnızca bu sekmede tutulur (sessionStorage). Açık: siz silene kadar bu tarayıcıda tutulur (localStorage).',
    save: 'Anahtarları kaydet',
    saveLive: 'Kaydet ve Canlı’ya geç',
    clear: 'Temizle',
    saved: {
      memoryOnly: 'Yalnızca bu sekme için kaydedildi: tarayıcı depolaması kullanılamıyor.',
      device: 'Siz silene kadar bu cihazda kaydedildi.',
      tab: 'Yalnızca bu sekme için kaydedildi; sekme kapanınca unutulur.',
      needBoth: 'Canlı mod için iki anahtar da gerekli.',
      liveOn: 'Canlı mod açık.',
      switchToUse: 'Kullanmak için Canlı moda geçin.',
      cleared: 'Bu cihazdan silindi.',
      clearedBack: 'Bu cihazdan silindi. Kayıtlı moda dönüldü.',
    },
    facts: { sentTo: 'Anahtarların gönderildiği tek adres', sameOrigin: 'bu sitenin kendi kaynağı', source: 'Kaynak kod' },
    check: {
      button: 'Anahtarlarımı denetle',
      checking: 'Denetleniyor…',
      note: 'Ücretsizdir: API, yukarıdaki anahtarlarla her sağlayıcının modellerini listeler. Anahtarın kabul edilip edilmediğini gösterir, hesabınızda kredi olup olmadığını değil.',
      results: 'Anahtar denetimi',
      status: {
        valid: 'Kabul edildi',
        invalid: 'Reddedildi',
        rate_limited: 'Hız sınırına takıldı; anahtar yine de geçerli olabilir. Biraz sonra yeniden deneyin.',
        unreachable: 'Sağlayıcıya ulaşılamadı. Biraz sonra yeniden deneyin.',
        not_provided: 'Girilmedi',
      },
      waking: 'Ücretsiz sunucu uyandırılıyor. Bir süre istek gelmediyse ilk isteğin yanıtı bir dakikayı bulabilir.',
      tooMany: (seconds?: number) =>
        seconds ? `Çok fazla denetim yapıldı. ${seconds} sn sonra yeniden deneyin.` : 'Çok fazla denetim yapıldı. Bir dakika sonra yeniden deneyin.',
      noKey: 'Denetlemek için en az bir anahtar girin.',
      network: 'LIBRAIN API’ye ulaşılamadı. Bağlantınızı denetleyip yeniden deneyin.',
      failed: 'Denetim tamamlanamadı. Yeniden deneyin.',
    },
  },
});
