import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { CurationNav } from './CurationNav';

describe('CurationNav', () => {
  it('renders a nav element with correct aria-label', () => {
    render(<CurationNav />);
    const nav = screen.getByRole('navigation', { name: 'Curation navigation' });
    expect(nav).toBeDefined();
  });

  it('renders a link to /curation/documents labelled Documents', () => {
    render(<CurationNav />);
    const link = screen.getByRole('link', { name: 'Documents' });
    expect(link.getAttribute('href')).toBe('/curation/documents');
  });

  it('renders a link to /curation/vocabulary labelled Vocabulary', () => {
    render(<CurationNav />);
    const link = screen.getByRole('link', { name: 'Vocabulary' });
    expect(link.getAttribute('href')).toBe('/curation/vocabulary');
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<CurationNav />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
