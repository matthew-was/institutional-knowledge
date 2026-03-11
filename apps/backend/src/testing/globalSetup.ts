/**
 * Vitest global setup / teardown for integration tests.
 *
 * Runs migrate.latest() once before the full test suite and
 * migrate.rollback() once after, so individual test files do not need to
 * manage schema lifecycle. All data cleanup between tests is handled by
 * dbCleanup.ts (afterEach calls within each test file).
 *
 * Connection string matches docker-compose.test.yml.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import knex, { type Knex } from 'knex';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationsDir = path.resolve(__dirname, '../db/migrations');

let db: Knex;

export async function setup(): Promise<void> {
  db = knex({
    client: 'pg',
    connection: 'postgresql://ik_test:ik_test@localhost:5433/ik_test',
    migrations: {
      directory: migrationsDir,
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
  });
  await db.migrate.latest();
}

export async function teardown(): Promise<void> {
  await db.migrate.rollback(undefined, true);
  await db.destroy();
}
