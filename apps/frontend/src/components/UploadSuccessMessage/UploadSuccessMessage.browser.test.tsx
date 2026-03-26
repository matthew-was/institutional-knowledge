import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UploadSuccessMessage } from './UploadSuccessMessage';

describe('UploadSuccessMessage', () => {
  it('renders description and archive reference', () => {
    render(
      <UploadSuccessMessage
        description="Family portrait 1965"
        date="1965-07-04"
        archiveReference="REF-001"
      />,
    );

    expect(screen.getByText(/Family portrait 1965/)).toBeDefined();
    expect(screen.getByText(/REF-001/)).toBeDefined();
  });

  it('renders "Undated" when date is null', () => {
    render(
      <UploadSuccessMessage
        description="Unknown document"
        date={null}
        archiveReference="REF-002"
      />,
    );

    expect(screen.getByText(/Undated/)).toBeDefined();
  });

  it('renders the date string when date is non-null', () => {
    render(
      <UploadSuccessMessage
        description="Estate inventory"
        date="1972-03-15"
        archiveReference="REF-003"
      />,
    );

    expect(screen.getByText(/1972-03-15/)).toBeDefined();
  });
});
