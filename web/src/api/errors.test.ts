import { describe, expect, it } from 'vitest';
import { ApiError, describeError, localizeServerText } from './errors';

const err = (init: Partial<ConstructorParameters<typeof ApiError>[0]> & { status: number; title: string }) =>
  new ApiError({ kind: 'http', ...init });

describe('describeError in Turkish', () => {
  it('maps the provider-keys problem and offers the keys action', () => {
    const d = describeError(err({ status: 401, title: 'provider keys required' }), Date.now(), { publicDemo: true, lang: 'tr' });
    expect(d.title).toBe('Canlı mod kendi API anahtarlarınızı gerektirir.');
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
    expect(d.title).toBe('Anthropic anahtarı reddetti');
    expect(d.detail).toContain('API anahtarını kabul etmedi');
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
    expect(describeError(new ApiError({ kind: 'network', title: 'Network error' }), 0, { lang: 'tr' }).title).toBe('LIBRAIN API\'sine ulaşılamıyor.');
    expect(describeError(new Error('No result was returned.'), 0, { lang: 'tr' }).title).toBe('Sonuç döndürülmedi.');
    expect(describeError(new Error('No result was returned.'), 0, { lang: 'en' }).title).toBe('No result was returned.');
    expect(localizeServerText('Unexpected response', 'tr')).toBe('Beklenmeyen yanıt');
  });
});
