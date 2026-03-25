import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubmitButton } from './SubmitButton';

describe('SubmitButton', () => {
  it('renders in enabled state', () => {
    render(<SubmitButton disabled={false} submitting={false} />);
    const button = screen.getByRole('button', { name: 'Upload' });
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it('renders in disabled state when disabled prop is true', () => {
    render(<SubmitButton disabled={true} submitting={false} />);
    const button = screen.getByRole('button');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });

  it('renders in loading state when submitting is true', () => {
    render(<SubmitButton disabled={false} submitting={true} />);
    const button = screen.getByRole('button', { name: 'Uploading…' });
    expect(button).toBeDefined();
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('is disabled when submitting even if disabled prop is false', () => {
    render(<SubmitButton disabled={false} submitting={true} />);
    const button = screen.getByRole('button');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute('aria-disabled')).toBe('true');
  });
});
