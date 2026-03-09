/**
 * Derives the display archive reference from a document's date and description.
 * Format: "YYYY-MM-DD — [description]" or "[undated] — [description]"
 * See ADR-023.
 */
export function archiveReference(
  date: string | null,
  description: string,
): string {
  if (date !== null && date.length > 0) {
    return `${date} — ${description}`;
  }
  return `[undated] — ${description}`;
}
