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

  it('paints flat in currentColor, with no gradient, filter or halo', () => {
    const { container } = render(<LibrainLogo />);
    const svg = container.querySelector('svg')!;
    expect(svg.querySelector('linearGradient, radialGradient, filter, mask')).toBeNull();
    expect(svg.outerHTML).not.toMatch(/url\(#/);
    const paths = svg.querySelectorAll('path');
    expect(paths.length).toBeGreaterThan(1);
    for (const p of paths) expect(p.closest('[stroke]')).toHaveAttribute('stroke', 'currentColor');
    // The i's dot and the node over the alpha.
    const dots = svg.querySelectorAll('circle');
    expect(dots).toHaveLength(2);
    for (const c of dots) expect(c.closest('[fill]')).toHaveAttribute('fill', 'currentColor');
  });

  it('gives each instance its own title id', () => {
    render(
      <>
        <LibrainLogo />
        <LibrainLogo variant="mark" title="LIBRAIN home" />
      </>,
    );
    const ids = screen.getAllByRole('img').map((svg) => svg.getAttribute('aria-labelledby'));
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
    expect(screen.getByRole('img', { name: 'LIBRAIN home' })).toBeInTheDocument();
  });
});
