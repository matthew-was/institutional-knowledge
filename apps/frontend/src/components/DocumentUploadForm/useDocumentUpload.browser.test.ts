import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDocumentUpload } from './useDocumentUpload';

const MAX_FILE_SIZE_MB = 10;
const ACCEPTED_EXTENSIONS = ['.pdf', '.jpg'];

function makeHook() {
  return renderHook(() =>
    useDocumentUpload(MAX_FILE_SIZE_MB, ACCEPTED_EXTENSIONS),
  );
}

describe('useDocumentUpload', () => {
  it('handleFileSelect pre-fills date and description from a parsed filename', () => {
    const { result } = makeHook();

    const file = new File(['content'], '1965-07-04 Family portrait.pdf', {
      type: 'application/pdf',
    });
    const parsed = { date: '1965-07-04', description: 'Family portrait' };

    act(() => {
      result.current.handleFileSelect(file, parsed);
    });

    expect(result.current.getValues('date')).toBe('1965-07-04');
    expect(result.current.getValues('description')).toBe('Family portrait');
    expect(result.current.serverError).toBeNull();
    expect(result.current.duplicateRecord).toBeNull();
  });

  it('handleFileSelect clears serverError and duplicateRecord', () => {
    const { result } = makeHook();

    const file = new File(['content'], '1965-07-04 Family portrait.pdf', {
      type: 'application/pdf',
    });

    act(() => {
      result.current.handleFileSelect(file, null);
    });

    expect(result.current.serverError).toBeNull();
    expect(result.current.duplicateRecord).toBeNull();
  });

  it('handleSubmit does not proceed when form data fails Zod validation', async () => {
    const { result } = makeHook();

    // Submit without setting any values — the form is empty and invalid.
    await act(async () => {
      // handleSubmit wraps RHF's handleSubmit; a failed validation means onSubmit
      // is never called, so isSubmitting stays false and serverError stays null.
      await result.current.handleSubmit();
    });

    // Form was invalid; isSubmitting should be false after the failed submit attempt
    expect(result.current.isSubmitting).toBe(false);
    // No server error set — the submission did not progress past Zod validation
    expect(result.current.serverError).toBeNull();
  });
});
