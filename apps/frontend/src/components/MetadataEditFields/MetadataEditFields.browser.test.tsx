import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import type { MetadataEditValues } from '@/components/DocumentMetadataForm/useDocumentMetadata';
import { MetadataEditFields } from './MetadataEditFields';

/**
 * Wrapper component that provides a real react-hook-form `control` and `errors`
 * so MetadataEditFields can be rendered in isolation with static prop values.
 *
 * MetadataEditValues stores array fields as comma-separated strings (the form's
 * working representation). The schema preprocesses them into arrays on submit.
 */
function Wrapper({
  defaultValues,
}: {
  defaultValues: Partial<MetadataEditValues>;
}) {
  const {
    control,
    formState: { errors },
  } = useForm<MetadataEditValues>({
    defaultValues,
    mode: 'onBlur',
  });

  return <MetadataEditFields control={control} errors={errors} />;
}

describe('MetadataEditFields', () => {
  it('renders all six metadata fields', () => {
    render(
      <Wrapper
        defaultValues={{
          date: '1987-06-15',
          description: 'Wedding photograph',
          documentType: 'photograph',
          // Array fields stored as comma-separated strings in the form.
          people: 'Alice Smith, Bob Jones',
          organisations: 'Estate of John Smith',
          landReferences: 'North Field',
        }}
      />,
    );

    expect(screen.getByLabelText(/Date/i)).toBeDefined();
    expect(screen.getByLabelText(/Description/i)).toBeDefined();
    expect(screen.getByLabelText(/Document type/i)).toBeDefined();
    expect(screen.getByLabelText(/People/i)).toBeDefined();
    expect(screen.getByLabelText(/Organisations/i)).toBeDefined();
    expect(screen.getByLabelText(/Land references/i)).toBeDefined();
  });

  it('displays array fields as comma-separated strings', () => {
    render(
      <Wrapper
        defaultValues={{
          people: 'Alice Smith, Bob Jones',
          organisations: 'Estate of John Smith',
          landReferences: 'North Field, Home Farm',
        }}
      />,
    );

    const peopleInput = screen.getByLabelText(/People/i) as HTMLInputElement;
    expect(peopleInput.value).toBe('Alice Smith, Bob Jones');

    const orgsInput = screen.getByLabelText(
      /Organisations/i,
    ) as HTMLInputElement;
    expect(orgsInput.value).toBe('Estate of John Smith');

    const landInput = screen.getByLabelText(
      /Land references/i,
    ) as HTMLInputElement;
    expect(landInput.value).toBe('North Field, Home Farm');
  });

  it('renders the date field as empty with no error when initial date is empty string', () => {
    // Simulate an undated document: API date null → form default ''
    render(
      <Wrapper
        defaultValues={{
          date: '',
          description: 'Undated receipt',
        }}
      />,
    );

    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    // The date field is empty — not treated as a validation error on initial render.
    expect(dateInput.value).toBe('');
    // No error message is visible for the date field on initial render.
    // Field.Error only renders when match={true} and the field has an error;
    // without interacting with the form no error should be present.
    expect(screen.queryByText(/Date must be/i)).toBeNull();
    expect(screen.queryByText(/not a valid calendar/i)).toBeNull();
  });

  it('renders the date field with a pre-populated value when date is provided', () => {
    render(
      <Wrapper
        defaultValues={{
          date: '1987-06-15',
        }}
      />,
    );

    const dateInput = screen.getByLabelText(/Date/i) as HTMLInputElement;
    expect(dateInput.value).toBe('1987-06-15');
  });
});
