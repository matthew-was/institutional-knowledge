/**
 * Initial vocabulary seed (ADR-028).
 *
 * Inserts placeholder vocabulary terms covering each of the six categories
 * defined in ADR-028. This seed is a no-op if the vocabulary_terms table
 * already contains rows — it must never overwrite a live vocabulary.
 */

import type { Knex } from 'knex';
import { v7 as uuidv7 } from 'uuid';
import { normaliseTermText } from '../../utils/normalise.js';
import type { VocabularyTermInsert } from '../tables.js';

/**
 * Build a seed row.
 *
 * All seed rows share the same source / confidence values; only term,
 * category, and description differ.
 */
function seedRow(
  term: string,
  category: string,
  description: string | null,
): VocabularyTermInsert {
  return {
    id: uuidv7(),
    term,
    normalisedTerm: normaliseTermText(term),
    category,
    description,
    aliases: [],
    source: 'manual',
    confidence: null,
  };
}

export async function seed(knex: Knex): Promise<void> {
  // Guard: do not re-seed if terms are already present.
  // This covers both the server.ts startup path (db._knex.seed.run()) and any
  // direct CLI invocation (knex seed:run).
  const result = await knex('vocabulary_terms').count('id as count').first();
  if (Number(result?.count ?? 0) > 0) {
    return;
  }

  const rows: VocabularyTermInsert[] = [
    // People
    seedRow(
      'Person One',
      'People',
      'Placeholder person — replace with a real name',
    ),
    seedRow(
      'Person Two',
      'People',
      'Placeholder person — replace with a real name',
    ),

    // Organisation
    seedRow(
      'Example Solicitors',
      'Organisation',
      'Placeholder organisation — replace with a real name',
    ),
    seedRow(
      'Example Council',
      'Organisation',
      'Placeholder organisation — replace with a real name',
    ),

    // Land Parcel / Field
    seedRow(
      'Home Farm',
      'Land Parcel / Field',
      'Placeholder land parcel — replace with a real reference',
    ),
    seedRow(
      'North Field',
      'Land Parcel / Field',
      'Placeholder land parcel — replace with a real reference',
    ),
    seedRow(
      'South Meadow',
      'Land Parcel / Field',
      'Placeholder land parcel — replace with a real reference',
    ),

    // Date / Event
    seedRow(
      'Founding Event',
      'Date / Event',
      'Placeholder event — replace with a real event name',
    ),
    seedRow(
      'Transfer Event',
      'Date / Event',
      'Placeholder event — replace with a real event name',
    ),

    // Legal Reference
    seedRow(
      'Deed Reference One',
      'Legal Reference',
      'Placeholder legal reference — replace with a real deed reference',
    ),
    seedRow(
      'Deed Reference Two',
      'Legal Reference',
      'Placeholder legal reference — replace with a real deed reference',
    ),

    // Organisation Role
    seedRow(
      'Estate Management',
      'Organisation Role',
      'Placeholder role — replace with a real organisational role',
    ),
    seedRow(
      'Legal Services',
      'Organisation Role',
      'Placeholder role — replace with a real organisational role',
    ),
  ];

  await knex('vocabulary_terms').insert(rows);
}
