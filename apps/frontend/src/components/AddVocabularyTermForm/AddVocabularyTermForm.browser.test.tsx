import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AddVocabularyTermForm } from './AddVocabularyTermForm';

describe('AddVocabularyTermForm — static rendering', () => {
  it('renders the term name field with an accessible label', () => {
    render(<AddVocabularyTermForm />);

    const termInput = screen.getByLabelText(/Term name/i) as HTMLInputElement;
    // Field is present and starts empty.
    expect(termInput.value).toBe('');
  });

  it('renders the category field with an accessible label', () => {
    render(<AddVocabularyTermForm />);

    const categoryInput = screen.getByLabelText(
      /Category/i,
    ) as HTMLInputElement;
    expect(categoryInput.value).toBe('');
  });

  it('renders the description field with an accessible label', () => {
    render(<AddVocabularyTermForm />);

    const descInput = screen.getByLabelText(/Description/i) as HTMLInputElement;
    expect(descInput.value).toBe('');
  });

  it('renders the aliases field with an accessible label', () => {
    render(<AddVocabularyTermForm />);

    const aliasesInput = screen.getByLabelText(/Aliases/i) as HTMLInputElement;
    expect(aliasesInput.value).toBe('');
  });

  it('renders the Add relationship button for the relationships section', () => {
    render(<AddVocabularyTermForm />);

    const addRelButton = screen.getByRole('button', {
      name: /Add relationship/i,
    });
    expect(addRelButton.textContent).toBe('Add relationship');
  });

  it('renders an accessible submit button that is enabled on initial render', () => {
    render(<AddVocabularyTermForm />);

    const submitButton = screen.getByRole('button', {
      name: /Add term/i,
    }) as HTMLButtonElement;
    // Button is enabled because the form is not submitting on initial render.
    expect(submitButton.disabled).toBe(false);
  });
});
