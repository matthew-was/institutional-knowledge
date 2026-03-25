import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FilePickerInput } from './FilePickerInput';

describe('FilePickerInput', () => {
  const extensions = ['.pdf', '.tif', '.tiff', '.jpg', '.jpeg', '.png'];

  it('renders a file input', () => {
    render(
      <FilePickerInput
        acceptedExtensions={extensions}
        onFileSelect={vi.fn()}
      />,
    );
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
  });

  it('has an accessible label', () => {
    render(
      <FilePickerInput
        acceptedExtensions={extensions}
        onFileSelect={vi.fn()}
      />,
    );
    const label = screen.getByLabelText('Select document');
    expect(label).toBeDefined();
  });

  it('has the correct accept attribute', () => {
    render(
      <FilePickerInput
        acceptedExtensions={extensions}
        onFileSelect={vi.fn()}
      />,
    );
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput?.getAttribute('accept')).toBe(extensions.join(','));
  });
});
