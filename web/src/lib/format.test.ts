import { describe, expect, it } from 'vitest';
import { formatCount, formatDate, formatPercent, formatRelative, formatScore, formatUsd } from './format';
import { discoveryScoreItems, riskBand } from './scoreItems';
import { basisMeta, statusMeta } from './vocabulary';
import { buildSteps, DISCOVER_STAGES, progressMessage } from './stages';

describe('format (English)', () => {
  it('keeps the English output', () => {
    expect(formatScore(0.254)).toBe('0.25');
    expect(formatPercent(0.3)).toBe('30%');
    expect(formatCount(1234)).toBe('1,234');
    expect(formatUsd(0.07)).toBe('$0.07');
    expect(formatRelative('2026-01-01T00:00:00Z', Date.parse('2026-01-01T00:10:00Z'))).toBe('10 min ago');
  });
});

describe('format (Turkish)', () => {
  it('uses Turkish separators, percent sign and month names', () => {
    expect(formatScore(0.254, 2, 'tr')).toBe('0,25');
    expect(formatPercent(0.3, 'tr')).toBe('%30');
    expect(formatCount(1234, 'tr')).toBe('1.234');
  });

  it('localizes dates and relative times via the language table', () => {
    // Module state follows the provider in the app; here we call through the tables directly.
    expect(statusMeta('grounded', 'tr').label).toBe('Dayanaklı');
    expect(statusMeta('extrapolated', 'tr').label).toBe('Çıkarımsal');
    expect(statusMeta('risky', 'tr').label).toBe('Riskli');
    expect(basisMeta('analogy', 'tr').label).toBe('Analoji');
    expect(riskBand(0.8, 'tr').label).toBe('Yüksek');
    expect(discoveryScoreItems(null, 'tr')[1]?.label).toBe('Özgünlük');
    expect(buildSteps(DISCOVER_STAGES, [], 0, false, 'tr')[0]?.label).toBe('Derlemde ara');
    expect(progressMessage('Found 3 distinct passages', 'tr')).toBe('3 farklı pasaj bulundu');
    expect(formatDate('2026-03-05T12:00:00Z')).toMatch(/Mar/);
  });
});
