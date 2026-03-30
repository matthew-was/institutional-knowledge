import { pino } from 'pino';
import { v7 as uuidv7 } from 'uuid';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createTestDb, type DbInstance } from '../../db/index.js';
import { cleanAllTables } from '../../testing/dbCleanup.js';
import { TEST_DB_CONFIG } from '../../testing/testDb.js';
import { PostgresGraphStore } from '../PostgresGraphStore.js';

/**
 * Integration tests: PostgresGraphStore against a real PostgreSQL instance.
 *
 * Acceptance condition coverage:
 *   (a) writeEntity + getEntity round-trip; entity with no occurrences returns null
 *   (b) writeRelationship + getRelationships; duplicate insert does not throw
 *   (c) traverse depth 1, 2, 3 on a three-hop chain
 *   (d) findEntitiesByType filtering by category
 *   (e) findDocumentsByEntity join returns correct DocumentReference; date: null when no date
 *
 * Schema lifecycle (migrate.latest / rollback) is managed by
 * src/testing/globalSetup.ts. Data isolation between tests is handled by
 * afterEach(cleanAllTables).
 *
 * Requires the test database container to be running:
 *   docker compose -f apps/backend/docker-compose.test.yml up -d
 *   pnpm --filter backend test
 *   docker compose -f apps/backend/docker-compose.test.yml down -v
 */

const silentLog = pino({ level: 'silent' });

// ---------------------------------------------------------------------------
// Shared database connection — schema managed by globalSetup.ts
// ---------------------------------------------------------------------------

const db: DbInstance = createTestDb(TEST_DB_CONFIG);

afterAll(async () => {
  await db.destroy();
});

afterEach(async () => {
  await cleanAllTables(db._knex);
});

// ---------------------------------------------------------------------------
// Test data helpers
// ---------------------------------------------------------------------------

async function insertDocument(
  id: string,
  description = 'Test doc',
): Promise<void> {
  await db._knex('documents').insert({
    id,
    status: 'finalized',
    filename: 'test.pdf',
    content_type: 'application/pdf',
    description,
    submitter_identity: 'test',
    created_at: db._knex.fn.now(),
    updated_at: db._knex.fn.now(),
  });
}

async function insertOccurrence(
  termId: string,
  documentId: string,
): Promise<void> {
  await db._knex('entity_document_occurrences').insert({
    id: uuidv7(),
    term_id: termId,
    document_id: documentId,
  });
}

function makeStore(): PostgresGraphStore {
  return new PostgresGraphStore(db, silentLog);
}

// ---------------------------------------------------------------------------
// (a) writeEntity + getEntity round-trip
// ---------------------------------------------------------------------------

describe('PostgresGraphStore — writeEntity + getEntity', () => {
  it('(a) round-trip: written entity with occurrence is returned by getEntity', async () => {
    const store = makeStore();
    const entityId = uuidv7();
    const docId = uuidv7();

    await store.writeEntity({
      entityId,
      term: 'John Smith',
      category: 'person',
      confidence: 0.9,
    });

    // Before adding an occurrence, getEntity must return null (ADR-037)
    const beforeOccurrence = await store.getEntity(entityId);
    expect(beforeOccurrence).toBeNull();

    // Insert a document and link the entity to it
    await insertDocument(docId);
    await insertOccurrence(entityId, docId);

    const entity = await store.getEntity(entityId);
    expect(entity).not.toBeNull();
    expect(entity?.entityId).toBe(entityId);
    expect(entity?.term).toBe('John Smith');
    expect(entity?.category).toBe('person');
    expect(entity?.confidence).toBeCloseTo(0.9);
  });

  it('(a) entity with no occurrences returns null from getEntity', async () => {
    const store = makeStore();
    const entityId = uuidv7();

    await store.writeEntity({
      entityId,
      term: 'Orphaned Entity',
      category: 'place',
      confidence: null,
    });

    const result = await store.getEntity(entityId);
    expect(result).toBeNull();
  });

  it('(a) upsert on id conflict updates term and category', async () => {
    const store = makeStore();
    const entityId = uuidv7();
    const docId = uuidv7();

    await store.writeEntity({
      entityId,
      term: 'Original Term',
      category: 'person',
      confidence: 0.5,
    });
    await store.writeEntity({
      entityId,
      term: 'Updated Term',
      category: 'organisation',
      confidence: 0.8,
    });

    await insertDocument(docId);
    await insertOccurrence(entityId, docId);

    const entity = await store.getEntity(entityId);
    expect(entity?.term).toBe('Updated Term');
    expect(entity?.category).toBe('organisation');
  });
});

// ---------------------------------------------------------------------------
// (b) writeRelationship + getRelationships
// ---------------------------------------------------------------------------

describe('PostgresGraphStore — writeRelationship + getRelationships', () => {
  it('(b) outgoing relationships from source entity are returned correctly', async () => {
    const store = makeStore();
    const sourceId = uuidv7();
    const targetId = uuidv7();
    const docId = uuidv7();

    await store.writeEntity({
      entityId: sourceId,
      term: 'Alice',
      category: 'person',
      confidence: null,
    });
    await store.writeEntity({
      entityId: targetId,
      term: 'Acme Farm',
      category: 'place',
      confidence: null,
    });
    await insertDocument(docId);
    await insertOccurrence(sourceId, docId);
    await insertOccurrence(targetId, docId);

    await store.writeRelationship({
      sourceEntityId: sourceId,
      targetEntityId: targetId,
      relationshipType: 'associated_with',
      confidence: 0.75,
    });

    const outgoing = await store.getRelationships(sourceId, 'outgoing');
    expect(outgoing).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    const rel = outgoing[0]!;
    expect(rel.sourceEntityId).toBe(sourceId);
    expect(rel.targetEntityId).toBe(targetId);
    expect(rel.relationshipType).toBe('associated_with');
  });

  it('(b) incoming relationships are returned for target entity', async () => {
    const store = makeStore();
    const sourceId = uuidv7();
    const targetId = uuidv7();
    const docId = uuidv7();

    await store.writeEntity({
      entityId: sourceId,
      term: 'Alice',
      category: 'person',
      confidence: null,
    });
    await store.writeEntity({
      entityId: targetId,
      term: 'Acme Farm',
      category: 'place',
      confidence: null,
    });
    await insertDocument(docId);
    await insertOccurrence(sourceId, docId);
    await insertOccurrence(targetId, docId);

    await store.writeRelationship({
      sourceEntityId: sourceId,
      targetEntityId: targetId,
      relationshipType: 'associated_with',
      confidence: null,
    });

    const incoming = await store.getRelationships(targetId, 'incoming');
    expect(incoming).toHaveLength(1);
    expect(incoming[0]?.targetEntityId).toBe(targetId);
  });

  it('(b) duplicate insert on same composite key does not throw', async () => {
    const store = makeStore();
    const sourceId = uuidv7();
    const targetId = uuidv7();

    await store.writeEntity({
      entityId: sourceId,
      term: 'Alice',
      category: 'person',
      confidence: null,
    });
    await store.writeEntity({
      entityId: targetId,
      term: 'Acme Farm',
      category: 'place',
      confidence: null,
    });

    const rel = {
      sourceEntityId: sourceId,
      targetEntityId: targetId,
      relationshipType: 'associated_with',
      confidence: null,
    };

    await expect(store.writeRelationship(rel)).resolves.not.toThrow();
    await expect(store.writeRelationship(rel)).resolves.not.toThrow();

    // Only one relationship should exist
    const all = await store.getRelationships(sourceId, 'outgoing');
    expect(all).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// (c) traverse depth 1, 2, 3
// ---------------------------------------------------------------------------

/**
 * Build a three-hop chain A → B → C → D in the database.
 * All entities are document-evidenced. Returns the four node IDs.
 */
async function buildChain(
  store: PostgresGraphStore,
): Promise<[string, string, string, string]> {
  const docId = uuidv7();
  await insertDocument(docId);

  const [idA, idB, idC, idD] = [uuidv7(), uuidv7(), uuidv7(), uuidv7()];

  for (const [id, term] of [
    [idA, 'A'],
    [idB, 'B'],
    [idC, 'C'],
    [idD, 'D'],
  ] as const) {
    await store.writeEntity({
      entityId: id,
      term,
      category: 'node',
      confidence: null,
    });
    await insertOccurrence(id, docId);
  }

  for (const [src, tgt] of [
    [idA, idB],
    [idB, idC],
    [idC, idD],
  ] as const) {
    await store.writeRelationship({
      sourceEntityId: src,
      targetEntityId: tgt,
      relationshipType: 'link',
      confidence: null,
    });
  }

  return [idA, idB, idC, idD];
}

describe('PostgresGraphStore — traverse', () => {
  it.each([
    {
      depth: 1,
      expectedRelCount: 1,
      expectedSources: (ids: [string, string, string, string]) => [ids[0]],
    },
    {
      depth: 2,
      expectedRelCount: 2,
      expectedSources: (ids: [string, string, string, string]) => [
        ids[0],
        ids[1],
      ],
    },
    {
      depth: 3,
      expectedRelCount: 3,
      expectedSources: (ids: [string, string, string, string]) => [
        ids[0],
        ids[1],
        ids[2],
      ],
    },
  ])('(c) traverse depth $depth returns $expectedRelCount relationship(s)', async ({
    depth,
    expectedRelCount,
    expectedSources,
  }) => {
    const store = makeStore();
    const ids = await buildChain(store);

    const result = await store.traverse(ids[0], depth);

    expect(result.relationships).toHaveLength(expectedRelCount);
    expect(result.depth).toBe(depth);
    const relSources = result.relationships.map((r) => r.sourceEntityId);
    for (const src of expectedSources(ids)) {
      expect(relSources).toContain(src);
    }

    // Assert all raw SQL columns are mapped (guards against silent column remapping errors)
    for (const rel of result.relationships) {
      expect(rel.sourceEntityId).toBeDefined();
      expect(rel.targetEntityId).toBeDefined();
      expect(rel.relationshipType).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// (d) findEntitiesByType filtering
// ---------------------------------------------------------------------------

describe('PostgresGraphStore — findEntitiesByType', () => {
  it('(d) returns only entities of the specified category', async () => {
    const store = makeStore();
    const docId = uuidv7();
    await insertDocument(docId);

    const personId = uuidv7();
    const placeId = uuidv7();
    const place2Id = uuidv7();

    await store.writeEntity({
      entityId: personId,
      term: 'Alice',
      category: 'person',
      confidence: null,
    });
    await store.writeEntity({
      entityId: placeId,
      term: 'Acme Farm',
      category: 'place',
      confidence: null,
    });
    await store.writeEntity({
      entityId: place2Id,
      term: 'Old Mill',
      category: 'place',
      confidence: null,
    });

    // All have occurrences so they appear in results
    await insertOccurrence(personId, docId);
    await insertOccurrence(placeId, docId);
    await insertOccurrence(place2Id, docId);

    const people = await store.findEntitiesByType('person');
    expect(people).toHaveLength(1);
    expect(people[0]?.entityId).toBe(personId);
    expect(people[0]?.category).toBe('person');

    const places = await store.findEntitiesByType('place');
    expect(places).toHaveLength(2);
    expect(places.map((p) => p.entityId)).toContain(placeId);
    expect(places.map((p) => p.entityId)).toContain(place2Id);
  });

  it('(d) entities without occurrences are excluded', async () => {
    const store = makeStore();

    const withOccurrenceId = uuidv7();
    const withoutOccurrenceId = uuidv7();
    const docId = uuidv7();

    await store.writeEntity({
      entityId: withOccurrenceId,
      term: 'Alice',
      category: 'person',
      confidence: null,
    });
    await store.writeEntity({
      entityId: withoutOccurrenceId,
      term: 'Bob',
      category: 'person',
      confidence: null,
    });

    await insertDocument(docId);
    await insertOccurrence(withOccurrenceId, docId);
    // withoutOccurrenceId intentionally has no occurrence

    const people = await store.findEntitiesByType('person');
    expect(people).toHaveLength(1);
    expect(people[0]?.entityId).toBe(withOccurrenceId);
  });
});

// ---------------------------------------------------------------------------
// (e) findDocumentsByEntity join
// ---------------------------------------------------------------------------

describe('PostgresGraphStore — findDocumentsByEntity', () => {
  it('(e) returns DocumentReference with correct description and date', async () => {
    const store = makeStore();
    const entityId = uuidv7();
    const docId = uuidv7();

    await store.writeEntity({
      entityId,
      term: 'Alice',
      category: 'person',
      confidence: null,
    });

    await db._knex('documents').insert({
      id: docId,
      status: 'finalized',
      filename: 'family-photo.jpg',
      content_type: 'image/jpeg',
      description: 'Family at the farm, summer 1962',
      date: '1962-06-15',
      submitter_identity: 'test',
      created_at: db._knex.fn.now(),
      updated_at: db._knex.fn.now(),
    });
    await insertOccurrence(entityId, docId);

    const refs = await store.findDocumentsByEntity(entityId);
    expect(refs).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    const ref = refs[0]!;
    expect(ref.documentId).toBe(docId);
    expect(ref.description).toBe('Family at the farm, summer 1962');
    expect(ref.date).toBe('1962-06-15');
  });

  it('(e) returns date: null when document has no date', async () => {
    const store = makeStore();
    const entityId = uuidv7();
    const docId = uuidv7();

    await store.writeEntity({
      entityId,
      term: 'Alice',
      category: 'person',
      confidence: null,
    });

    // insertDocument helper does not set date — column defaults to null.
    await insertDocument(docId, 'Undated family photograph');
    await insertOccurrence(entityId, docId);

    const refs = await store.findDocumentsByEntity(entityId);
    expect(refs).toHaveLength(1);
    // biome-ignore lint/style/noNonNullAssertion: length asserted above
    const ref = refs[0]!;
    expect(ref.date).toBeNull();
  });

  it('(e) returns empty array when entity has no document occurrences', async () => {
    const store = makeStore();
    const entityId = uuidv7();

    await store.writeEntity({
      entityId,
      term: 'Alice',
      category: 'person',
      confidence: null,
    });

    const refs = await store.findDocumentsByEntity(entityId);
    expect(refs).toEqual([]);
  });
});
