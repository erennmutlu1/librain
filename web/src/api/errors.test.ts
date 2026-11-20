import { describe, expect, it } from 'vitest';
import { ApiError, describeError, isNoRecording, localizeServerText, NO_RECORDING } from './errors';

const err = (init: Partial<ConstructorParameters<typeof ApiError>[0]> & { status: number; title: string }) =>
  new ApiError({ kind: 'http', ...init });

describe('describeError in Turkish', () => {
  it('maps the provider-keys problem and offers the keys action', () => {
    const d = describeError(err({ status: 401, title: 'provider keys required' }), Date.now(), { publicDemo: true, lang: 'tr' });
    expect(d.title).toBe('Canlı mod kendi API key’lerinizi gerektirir.');
    expect(d.detail).toContain('API key’lerinizi kullanır');
    expect(d.action).toEqual({ kind: 'provider-keys' });
  });

  it('translates the provider-named rejection the API sends in English', () => {
    const d = describeError(
      err({
        status: 401,
        title: 'Anthropic rejected the key',
        detail: 'Anthropic did not accept the API key. Check that it is complete and still active.',
        provider: 'anthropic',
      }),
      Date.now(),
      { publicDemo: true, lang: 'tr' },
    );
    expect(d.title).toBe('Anthropic API key’inizi reddetti');
    expect(d.detail).toContain('API key’inizi kabul etmedi');
    expect(d.detail).toContain('Hazır modda API key gerekmez.');
    expect(d.detail).toContain('console.anthropic.com');
    expect(d.action).toEqual({ kind: 'provider-keys' });
  });

  it('formats the 429 retry time and falls back to the server text for unknown messages', () => {
    const d = describeError(err({ status: 429, title: 'whatever', retryAfterSeconds: 120 }), 0, { lang: 'tr' });
    expect(d.title).toBe('İstek sınırına ulaşıldı.');
    expect(d.detail).toContain('Yaklaşık 2 dk sonra');
    expect(describeError(err({ status: 500, title: 'Totally new problem', detail: 'odd' }), 0, { lang: 'tr' })).toMatchObject({
      title: 'Totally new problem',
      detail: 'odd',
    });
  });

  it('translates network errors and plain Errors; English stays unchanged', () => {
    expect(describeError(new ApiError({ kind: 'network', title: 'Network error' }), 0, { lang: 'tr' }).title).toBe('LIBRAIN API’sine ulaşılamıyor.');
    expect(describeError(new Error('No result was returned.'), 0, { lang: 'tr' }).title).toBe('Sonuç döndürülmedi.');
    expect(describeError(new Error('No result was returned.'), 0, { lang: 'en' }).title).toBe('No result was returned.');
    expect(localizeServerText('Unexpected response', 'tr')).toBe('Beklenmeyen yanıt');
  });

  it('words provider refusals and failures without English leaking in', () => {
    const pub = { publicDemo: true, lang: 'tr' as const };
    // A key rejection the API did not word itself names the provider and says "your key".
    const raw = describeError(err({ status: 401, title: 'Anthropic returned 401', detail: 'invalid x-api-key' }), 0, pub);
    expect(raw.title).toBe('Anthropic API key’inizi reddetti: invalid x-api-key');
    expect(localizeServerText('OpenAI refused the request', 'tr')).toBe('İstek OpenAI tarafından reddedildi');
    expect(localizeServerText('The discovery pipeline failed: HttpRequestException', 'tr')).toBe('İşlem başarısız oldu: HttpRequestException');
    expect(localizeServerText('Upstream API error', 'tr')).toBe('Sağlayıcı API hatası');
    const upstream = describeError(err({ status: 502, title: 'Upstream API error', detail: 'The query pipeline failed: HttpRequestException' }), 0, { lang: 'tr' });
    expect(upstream.title).toBe('Yapay zekâ sağlayıcısına yapılan bir çağrı başarısız oldu.');
    expect(upstream.detail).toBe('İşlem başarısız oldu: HttpRequestException');
    expect(`${upstream.title} ${upstream.detail}`).not.toMatch(/pipeline|discovery|query|Üst akış|işlem hattı/);
    expect(localizeServerText('Anthropic rate limit reached', 'tr')).toBe('Anthropic istek sınırına ulaşıldı');
    expect(describeError(err({ status: 401, title: 'x' }), 0, { lang: 'tr' }).title).toBe('Sunucu bir API key istiyor.');
  });

  it('says what to do when Recorded mode has no recording, in both languages', () => {
    const none = err({ status: 404, title: NO_RECORDING, detail: 'No recorded comparison matches these inputs.' });
    expect(isNoRecording(none)).toBe(true);
    expect(isNoRecording(new Error(NO_RECORDING))).toBe(false);
    const en = describeError(none, 0, { publicDemo: true, lang: 'en' });
    expect(en).toMatchObject({ tone: 'info', retryable: false, action: { kind: 'go-live' } });
    expect(en.detail).toMatch(/pick a suggested topic or question, open Explore .*, or switch to Live .*API keys \(billed to you\)/);
    const tr = describeError(none, 0, { publicDemo: true, lang: 'tr' });
    expect(tr.title).toBe('Hazır modda bu girdilerle eşleşen bir çalıştırma yok.');
    expect(tr.detail).toMatch(/önerilen bir konu ya da soru seçin, .*Fikirler sayfasını açın ya da .*API key’lerinizle .*Canlı moda geçin \(ücret size yansır\)/);
    expect(tr.detail).not.toMatch(/Kayıtlı|anahtar/);
  });
});
