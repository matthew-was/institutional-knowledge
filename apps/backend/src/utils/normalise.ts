/**
 * Text normalisation utilities.
 *
 * normaliseTermText() is the canonical normalisation function for vocabulary
 * term matching. It must be used wherever a normalised_term value is computed —
 * in writeEntity (GraphStore), receiveProcessingResults (processing handler),
 * createVocabularyTerm (curation handler) — to guarantee that deduplication
 * lookups against vocabulary_terms.normalised_term always produce matching values.
 *
 * ADR-028: normalised_term is "lowercase, punctuation stripped".
 */

/**
 * Normalise a vocabulary term for deduplication.
 *
 * Lowercases the input and strips all punctuation characters (everything that
 * is not a letter, digit, or whitespace). Whitespace is collapsed to a single
 * space and trimmed.
 *
 * @example normaliseTermText('John Smith')   // 'john smith'
 * @example normaliseTermText("O'Brien")      // 'obrien'
 * @example normaliseTermText('Acme & Co.')   // 'acme co'
 * @example normaliseTermText('  West Farm ') // 'west farm'
 */
export function normaliseTermText(term: string): string {
  return term
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}
