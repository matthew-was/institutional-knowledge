import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';
import { describe, expect, it } from 'vitest';

import type { AddTermValues } from '@/components/AddVocabularyTermForm/useAddVocabularyTerm';
import { TermRelationshipsInput } from './TermRelationshipsInput';

/**
 * Wrapper provides a real react-hook-form control so TermRelationshipsInput
 * can be rendered in isolation with static prop values.
 */
function Wrapper({
  defaultRelationships = [],
}: {
  defaultRelationships?: Array<{
    targetTermId: string;
    relationshipType: string;
  }>;
}) {
  const {
    control,
    formState: { errors },
  } = useForm<AddTermValues>({
    defaultValues: {
      term: '',
      category: '',
      description: '',
      aliases: '',
      relationships: defaultRelationships,
    },
    mode: 'onBlur',
  });

  return <TermRelationshipsInput control={control} errors={errors} />;
}

describe('TermRelationshipsInput — empty state', () => {
  it('renders the Add relationship button with no entries initially', () => {
    render(<Wrapper />);

    const addButton = screen.getByRole('button', { name: /Add relationship/i });
    expect(addButton.textContent).toBe('Add relationship');
    // No entry rows should be present yet.
    expect(screen.queryByLabelText(/Target term ID/i)).toBeNull();
    expect(screen.queryByLabelText(/Relationship type/i)).toBeNull();
  });
});

describe('TermRelationshipsInput — pre-populated entry', () => {
  it('renders targetTermId and relationshipType fields for an existing entry', () => {
    render(
      <Wrapper
        defaultRelationships={[
          {
            targetTermId: '01927c3a-5b2e-7000-8000-000000000001',
            relationshipType: 'owned_by',
          },
        ]}
      />,
    );

    const targetIdInput = screen.getByLabelText(
      /Target term ID/i,
    ) as HTMLInputElement;
    expect(targetIdInput.value).toBe('01927c3a-5b2e-7000-8000-000000000001');

    const relTypeInput = screen.getByLabelText(
      /Relationship type/i,
    ) as HTMLInputElement;
    expect(relTypeInput.value).toBe('owned_by');
  });
});

describe('TermRelationshipsInput — add control', () => {
  it('adds a new entry row when Add relationship is clicked', async () => {
    render(<Wrapper />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /Add relationship/i }));

    // After clicking add, both fields should be present and start empty.
    const targetIdInput = screen.getByLabelText(
      /Target term ID/i,
    ) as HTMLInputElement;
    expect(targetIdInput.value).toBe('');

    const relTypeInput = screen.getByLabelText(
      /Relationship type/i,
    ) as HTMLInputElement;
    expect(relTypeInput.value).toBe('');
  });
});

describe('TermRelationshipsInput — remove control', () => {
  it('removes the entry row when Remove is clicked', async () => {
    render(
      <Wrapper
        defaultRelationships={[
          { targetTermId: 'some-id', relationshipType: 'owned_by' },
        ]}
      />,
    );
    const user = userEvent.setup();

    // Entry is present before removal.
    expect(screen.queryByLabelText(/Target term ID/i)).not.toBeNull();

    await user.click(
      screen.getByRole('button', { name: /Remove relationship 1/i }),
    );

    // After removal, no entry fields should remain.
    expect(screen.queryByLabelText(/Target term ID/i)).toBeNull();
    expect(screen.queryByLabelText(/Relationship type/i)).toBeNull();
  });
});
