import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LibrainLogo } from './LibrainLogo';

describe('LibrainLogo', () => {
  it('renders the wordmark as an image named LIBRAIN, sized from its height', () => {
    render(<LibrainLogo variant="wordmark" height={28} />);
    const logo = screen.getByRole('img', { name: 'LIBRAIN' });
    expect(logo).toHaveAttribute('height', '28');
    expect(Number(logo.getAttribute('width'))).toBeGreaterThan(28);
    expect(logo.querySelector('text')).toBeNull();
  });

  it('renders the mark with a custom accessible name', () => {
    render(<LibrainLogo variant="mark" height={20} title="LIBRAIN home" />);
    const mark = screen.getByRole('img', { name: 'LIBRAIN home' });
    expect(mark).toHaveAttribute('width', '20');
  });

  it('hides a decorative logo from assistive tech', () => {
    const { container } = render(<LibrainLogo variant="mark" height={20} decorative />);
    expect(screen.queryByRole('img')).toBeNull();
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg?.querySelector('title')).toBeNull();
  });

  it('gives each instance its own gradient and filter ids', () => {
    const { container } = render(
      <>
        <LibrainLogo />
        <LibrainLogo variant="mark" decorative />
      </>,
    );
    const gradients = [...container.querySelectorAll('linearGradient')].map((g) => g.id);
    const filters = [...container.querySelectorAll('filter')].map((f) => f.id);
    expect(gradients).toHaveLength(2);
    expect(new Set(gradients).size).toBe(2);
    expect(new Set(filters).size).toBe(2);
    // Every url(#id) reference resolves inside the same svg.
    for (const svg of container.querySelectorAll('svg')) {
      const refs = [...svg.outerHTML.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!);
      expect(refs.length).toBeGreaterThan(0);
      for (const id of refs) expect(svg.querySelector(`[id="${id}"]`)).not.toBeNull();
    }
  });
});
