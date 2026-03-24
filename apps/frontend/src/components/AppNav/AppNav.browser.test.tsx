import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { AppNav } from './AppNav';

describe('AppNav', () => {
  it('renders a nav element with correct aria-label', () => {
    render(<AppNav />);
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    expect(nav).toBeDefined();
  });

  it('renders a link to /upload labelled Document Intake', () => {
    render(<AppNav />);
    const link = screen.getByRole('link', { name: 'Document Intake' });
    expect(link.getAttribute('href')).toBe('/upload');
  });

  it('renders a link to /curation labelled Curation', () => {
    render(<AppNav />);
    const link = screen.getByRole('link', { name: 'Curation' });
    expect(link.getAttribute('href')).toBe('/curation');
  });

  it('has no axe accessibility violations', async () => {
    const { container } = render(<AppNav />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
