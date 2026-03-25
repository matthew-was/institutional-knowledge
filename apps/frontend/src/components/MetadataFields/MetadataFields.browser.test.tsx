import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import type { UploadFormValues } from '@/components/DocumentUploadForm/useDocumentUpload';
import { MetadataFields } from './MetadataFields';

// Wrapper component that provides a real useForm control to MetadataFields.
function MetadataFieldsWrapper({
  dateError,
  descriptionError,
}: {
  dateError?: string;
  descriptionError?: string;
}) {
  const { control, formState } = useForm<UploadFormValues>({
    defaultValues: { date: '', description: '' },
  });

  // Manually inject errors into the errors object for testing.
  const errors = {
    ...formState.errors,
    ...(dateError
      ? { date: { type: 'manual', message: dateError } as never }
      : {}),
    ...(descriptionError
      ? {
          description: {
            type: 'manual',
            message: descriptionError,
          } as never,
        }
      : {}),
  };

  return <MetadataFields control={control} errors={errors} />;
}

describe('MetadataFields', () => {
  it('renders both the date and description inputs', () => {
    render(<MetadataFieldsWrapper />);
    expect(document.querySelector('input[type="date"]')).not.toBeNull();
    expect(document.querySelector('input[type="text"]')).not.toBeNull();
  });

  it('sets aria-invalid on the date input when errors.date is present', () => {
    render(<MetadataFieldsWrapper dateError="Date is required" />);
    const dateInput = document.querySelector('input[type="date"]');
    expect(dateInput?.getAttribute('aria-invalid')).toBe('true');
  });

  it('sets aria-invalid on the description input when errors.description is present', () => {
    render(
      <MetadataFieldsWrapper descriptionError="Description is required" />,
    );
    const descInput = document.querySelector('input[type="text"]');
    expect(descInput?.getAttribute('aria-invalid')).toBe('true');
  });

  it('renders the Field.Error message when errors.date is present', () => {
    render(<MetadataFieldsWrapper dateError="Date is not valid" />);
    expect(screen.getByText('Date is not valid')).toBeDefined();
  });

  it('renders the Field.Error message when errors.description is present', () => {
    render(
      <MetadataFieldsWrapper descriptionError="Description is required" />,
    );
    expect(screen.getByText('Description is required')).toBeDefined();
  });
});
