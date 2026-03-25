import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import type { UploadFormValues } from '@/components/DocumentUploadForm/useDocumentUpload';
import { FilePickerInput } from './FilePickerInput';

const extensions = ['.pdf', '.tif', '.tiff', '.jpg', '.jpeg', '.png'];

// Wrapper that provides a real useForm control.
function FilePickerWrapper({
  error,
  onFileSelect = vi.fn(),
}: {
  error?: string;
  onFileSelect?: (file: File, parsed: unknown) => void;
}) {
  const { control } = useForm<UploadFormValues>();
  return (
    <FilePickerInput
      acceptedExtensions={extensions}
      control={control}
      error={error}
      onFileSelect={onFileSelect}
    />
  );
}

describe('FilePickerInput', () => {
  it('renders a file input', () => {
    render(<FilePickerWrapper />);
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
  });

  it('has an accessible label', () => {
    render(<FilePickerWrapper />);
    const label = screen.getByLabelText('Select document');
    expect(label).toBeDefined();
  });

  it('has the correct accept attribute', () => {
    render(<FilePickerWrapper />);
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput?.getAttribute('accept')).toBe(extensions.join(','));
  });

  it('renders Field.Error message when error prop is passed', () => {
    render(<FilePickerWrapper error="File is required" />);
    expect(screen.getByText('File is required')).toBeDefined();
  });
});
