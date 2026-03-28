/**
 * E2E — Curation scenarios (document queue, metadata edit, vocabulary queue).
 *
 * Tier 3 tests: Playwright drives a real browser against the Hono custom server
 * (which mounts Next.js). The mock Express server running on port 4000 intercepts
 * outbound calls from the Hono custom server to Express.
 *
 * MSW intercept boundary: custom server → Express (http://localhost:4000/api/*)
 */

import { expect, test } from '@playwright/test';
import { MOCK_QUEUE_DOC_ID } from './mockExpressServer';

const MOCK_PORT = 4000;

test.beforeEach(async () => {
  await fetch(`http://localhost:${MOCK_PORT}/test-reset`, { method: 'POST' });
});

test('Curation — document queue happy path: queue renders with mock items; Clear flag removes item', async ({
  page,
}) => {
  await page.goto('/curation/documents');

  // Queue renders with the mock item from the Express response.
  await page.waitForSelector('text=Family letter from grandmother');
  const queueText = await page.locator('body').textContent();
  expect(queueText).toContain('Family letter from grandmother');
  expect(queueText).toContain('OCR quality below threshold');

  // Click "Clear flag" on the item — sends POST /api/curation/documents/:id/clear-flag
  // to Hono which calls Express POST /api/documents/:id/clear-flag.
  await page.locator('[aria-label="Clear flag"]').click();

  // After success, the hook calls mutate() which re-fetches the queue.
  // The mock Express now returns an empty list (cleared doc filtered out).
  await page.waitForSelector(
    'text=No documents are currently flagged for review.',
  );
  const updatedText = await page.locator('body').textContent();
  expect(updatedText).toContain(
    'No documents are currently flagged for review.',
  );
  expect(updatedText).not.toContain('Family letter from grandmother');
});

test('Curation — metadata edit happy path: form pre-populated; save shows success message', async ({
  page,
}) => {
  // Navigate to the document detail page.
  // The RSC page fetches from Hono (self-call) which calls Express GET /api/documents/:id.
  await page.goto(`/curation/documents/${MOCK_QUEUE_DOC_ID}`);

  // Form is pre-populated from the mock document detail response.
  await page.waitForSelector('text=Edit document metadata');

  // The MetadataEditFields component uses Field.Control with a textarea for description.
  // Value is set as a React controlled value so we read the textarea's value.
  const textareaValue = await page
    .locator('textarea')
    .evaluate((el) => (el as HTMLTextAreaElement).value);
  expect(textareaValue).toBe('Family letter from grandmother');

  // Edit the description.
  await page.locator('textarea').clear();
  await page.locator('textarea').fill('Updated family letter description');

  // Save — sends PATCH /api/curation/documents/:id/metadata to Hono which calls
  // Express PATCH /api/documents/:id/metadata.
  await page.locator('button[type="submit"]').click();

  // Success message is rendered in a [role="status"] element.
  const status = page.locator('[role="status"]');
  await status.waitFor();
  const statusText = await status.textContent();
  expect(statusText).toBe('Changes saved successfully.');
});

test('Curation — vocabulary queue happy path: candidates render; Accept removes item from queue', async ({
  page,
}) => {
  await page.goto('/curation/vocabulary');

  // Queue renders with mock candidates.
  await page.waitForSelector('text=Home Farm');
  const initialText = await page.locator('body').textContent();
  expect(initialText).toContain('Home Farm');
  expect(initialText).toContain('Grandmother Smith');

  // Click "Accept" on the first term (Home Farm).
  // There are two items each with an "Accept" button — click the first one.
  await page.locator('[aria-label="Accept term"]').first().click();

  // After accept, the hook calls mutate() which re-fetches the vocabulary queue.
  // The mock Express now excludes the accepted term from the response.
  await page.waitForFunction(() => {
    return !document.body.textContent?.includes('Home Farm');
  });

  const updatedText = await page.locator('body').textContent();
  expect(updatedText).not.toContain('Home Farm');
  // Second term is still present.
  expect(updatedText).toContain('Grandmother Smith');
});
