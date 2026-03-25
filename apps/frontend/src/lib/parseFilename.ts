/**
 * Pure utility for parsing filename stems against the project naming convention.
 *
 * Pattern: YYYY-MM-DD - short description
 *
 * Rules per UR-006:
 * - Pattern matches + valid calendar date  → { date: isoString, description }
 * - Pattern matches + invalid calendar date → { date: null, description }
 * - Pattern does not match                 → null
 */

import { Temporal } from './temporal';

export interface ParsedFilename {
  date: string | null;
  description: string;
}

// Matches: "YYYY-MM-DD - description" where description is non-empty.
const FILENAME_PATTERN = /^(\d{4}-\d{2}-\d{2}) - (.+)$/;

export function parseFilename(stem: string): ParsedFilename | null {
  const match = FILENAME_PATTERN.exec(stem);
  if (match === null) {
    return null;
  }

  const rawDate = match[1];
  const description = match[2];

  let validDate: string | null;
  try {
    const plain = Temporal.PlainDate.from(rawDate);
    validDate = plain.toString();
  } catch {
    validDate = null;
  }

  return { date: validDate, description };
}
