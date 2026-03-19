/**
 * HTTP client for calling the Python processing service.
 *
 * Uses the Node.js 24 native fetch API — no additional HTTP client dependency
 * is required. Sends the document reference and incomplete step list to the
 * Python /process endpoint (PROC-003) and returns the parsed response body,
 * which matches the ProcessingResultsRequest shape (PROC-002).
 */

import { ProcessingResultsRequest } from '@institutional-knowledge/shared/schemas/processing';

/**
 * Request body for PROC-003: Express calls Python to process a document.
 * Mirrors the ProcessDocumentRequest interface in integration-lead-contracts.md.
 */
interface ProcessDocumentRequest {
  documentId: string;
  fileReference: string | null;
  incompleteSteps: string[];
  previousOutputs: null; // Phase 1: step outputs are not persisted to DB
}

export async function callPythonProcess(
  baseUrl: string,
  apiKey: string,
  payload: ProcessDocumentRequest,
): Promise<ProcessingResultsRequest> {
  const res = await fetch(`${baseUrl}/process`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(
      `Python /process returned ${res.status}: ${await res.text()}`,
    );
  }

  const body: unknown = await res.json();
  try {
    return ProcessingResultsRequest.parse(body);
  } catch (err) {
    throw new Error(
      `Python /process response failed schema validation: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
