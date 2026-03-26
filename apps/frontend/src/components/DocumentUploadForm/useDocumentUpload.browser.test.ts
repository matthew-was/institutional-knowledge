import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Mock next/navigation — useRouter requires the App Router context which is not
// available in jsdom. A no-op mock is sufficient for the unit tests here.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock swr/mutation — the hook's network behaviour is not under test here.
vi.mock('swr/mutation', () => ({
  default: () => ({ trigger: vi.fn(), isMutating: false }),
}));

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

  it('handleFileSelect sets the file value on the form', () => {
    const { result } = makeHook();

    const file = new File(['content'], '1965-07-04 Family portrait.pdf', {
      type: 'application/pdf',
    });

    act(() => {
      result.current.handleFileSelect(file, null);
    });

    // getValues('file') returns the File set by setValue — would be undefined if
    // handleFileSelect did not call setValue.
    expect(result.current.getValues('file')).toBe(file);
  });

  it('handleSubmit does not proceed when form data fails Zod validation', async () => {
    const { result } = makeHook();

    // Submit without setting any values — the form is empty and invalid.
    await act(async () => {
      await result.current.handleSubmit();
    });

    // RHF sets field-level errors when validation fails. These would be absent if
    // handleSubmit was never called or Zod validation was never exercised.
    expect(result.current.errors.file).toBeDefined();
  });
});
