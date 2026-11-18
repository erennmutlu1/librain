import { describe, expect, it } from 'vitest';
import { normalizeArxivId } from './arxiv';

// Cases mirror ArxivClient.TryNormalizeId in LIBRAIN/Ingestion/ArxivClient.cs.
describe('normalizeArxivId', () => {
  it.each([
    ['2005.11401', '2005.11401'],
    ['  2005.11401  ', '2005.11401'],
    ['2005.11401v3', '2005.11401'],
    ['arXiv:2005.11401', '2005.11401'],
    ['ARXIV: 2005.11401v2', '2005.11401'],
    ['https://arxiv.org/abs/2005.11401', '2005.11401'],
    ['https://arxiv.org/abs/2005.11401v2/', '2005.11401'],
    ['https://arxiv.org/pdf/2005.11401v2.pdf', '2005.11401'],
    ['http://export.arxiv.org/abs/2503.08979', '2503.08979'],
    ['1501.0001', '1501.0001'],
  ])('accepts %s', (input, expected) => {
    expect(normalizeArxivId(input)).toBe(expected);
  });

  it.each([
    [''],
    ['   '],
    ['hep-th/9901001'], // old-style ids are not supported by the API
    ['2005.114'],
    ['20051.1401'],
    ['arxiv.org/abs/2005.11401'], // no scheme: not an absolute URL, as in .NET
    ['https://example.com/abs/2005.11401'],
    ['2005.11401v'],
    ['graphcast'],
  ])('rejects %j', (input) => {
    expect(normalizeArxivId(input)).toBeNull();
  });
});
