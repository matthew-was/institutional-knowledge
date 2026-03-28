/**
 * E2E — C1 Document intake scenarios.
 *
 * Tier 3 tests: Playwright drives a real browser against the Hono custom server
 * (which mounts Next.js). The mock Express server running on port 4000 intercepts
 * outbound calls from the Hono custom server to Express.
 *
 * MSW intercept boundary: custom server → Express (http://localhost:4000/api/*)
 *
 * Note on React 19 + Playwright file inputs:
 * Playwright's setInputFiles dispatches an untrusted change event. React 19
 * ignores untrusted events on file inputs, so filename auto-population (which
 * relies on the React onChange handler) does not trigger via setInputFiles alone.
 * Filename auto-population is covered at Tier 2 in useDocumentUpload tests.
 * These E2E tests fill date and description manually to verify the full
 * upload lifecycle from form submission through to the success page.
 */

import { expect, test } from '@playwright/test';

const MOCK_PORT = 4000;

test.beforeEach(async () => {
  await fetch(`http://localhost:${MOCK_PORT}/test-reset`, { method: 'POST' });
});

/**
 * Sets the file on the file input, then manually fills date and description so
 * that RHF has all required field values and the form becomes valid.
 *
 * React 19 does not fire onChange for untrusted file input events, so filename
 * auto-population cannot be triggered via setInputFiles. Filling the fields
 * manually is the reliable path for E2E form submission.
 */
async function fillUploadForm(
  page: import('@playwright/test').Page,
  filename: string,
  date: string,
  description: string,
): Promise<void> {
  await page.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test content'),
  });

  // React Hook Form uses onBlur mode. Fill each field and blur to trigger
  // validation so that isValid becomes true and the submit button is enabled.
  await page.locator('#document-date').fill(date);
  await page.locator('#document-date').blur();

  await page.locator('#document-description').fill(description);
  await page.locator('#document-description').blur();

  // Wait for the submit button to become enabled.
  await page.locator('button[type="submit"]:not([disabled])').waitFor();
}

test('C1 — upload happy path: form submission succeeds; success page shows archive reference', async ({
  page,
}) => {
  await page.goto('/upload');

  await fillUploadForm(
    page,
    '2024-01-15 -- Family letter.pdf',
    '2024-01-15',
    'Family letter',
  );

  // Verify the form values before submitting.
  const dateValue = await page.locator('#document-date').inputValue();
  expect(dateValue).toBe('2024-01-15');

  const descriptionValue = await page
    .locator('#document-description')
    .inputValue();
  expect(descriptionValue).toBe('Family letter');

  // Submit — the Hono server calls Express initiate/upload/finalize.
  await page.locator('button[type="submit"]').click();

  // Redirect to success page.
  await page.waitForURL('**/upload/success**');

  // The archive reference from the mock finalize response is shown.
  const archiveItem = page.getByText(/^Archive reference:/);
  await archiveItem.waitFor();
  expect(await archiveItem.textContent()).toBe(
    'Archive reference: 2024-01-15 — Family letter',
  );
});

test('C1 — duplicate detection: 409 from Express renders DuplicateConflictAlert with existingRecord data', async ({
  page,
}) => {
  // Configure mock Express to return 409 for the upload (DOC-002) step.
  await fetch(`http://localhost:${MOCK_PORT}/test-set-duplicate`, {
    method: 'POST',
  });

  await page.goto('/upload');

  await fillUploadForm(
    page,
    '2024-01-15 -- Family letter.pdf',
    '2024-01-15',
    'Family letter',
  );

  // Submit — the Hono server calls Express initiate/upload; Express returns 409.
  await page.locator('button[type="submit"]').click();

  // DuplicateConflictAlert renders with the existingRecord data from the 409 response.
  // The component renders `role="alert" aria-live="assertive"` containing a paragraph
  // "A document with this file already exists:" and a list of record details.
  // Wait for the specific paragraph text to be visible, then assert the full alert content.
  await page.waitForSelector('text=A document with this file already exists:');
  const alert = page.locator('[role="alert"][aria-live="assertive"]').first();

  const alertText = await alert.textContent();
  expect(alertText).toContain('Duplicate family letter');
  expect(alertText).toContain('2024-01-15');
  expect(alertText).toContain('2024-01-15 — Duplicate family letter');

  // Form remains interactive after a duplicate error — isMutating is false so
  // the submit button should not have aria-disabled="true".
  const submitButton = page.locator('button[type="submit"]');
  const ariaDisabled = await submitButton.getAttribute('aria-disabled');
  expect(ariaDisabled).not.toBe('true');
});
