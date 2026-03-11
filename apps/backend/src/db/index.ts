/**
 * Database initialisation module.
 *
 * createDb(config) is async. It:
 *   1. Constructs the Knex instance with camelCase↔snake_case conversion hooks
 *   2. Confirms PostgreSQL connectivity (throws if unreachable)
 *   3. Runs migrate.latest() (throws on migration failure)
 *
 * Keeping connection and migration inside createDb means server.ts has no
 * database lifecycle logic; it simply awaits a ready DbInstance.
 *
 * createDb returns a DbInstance containing:
 *   - embeddings:  embeddings repository
 *   - chunks:      chunks repository
 *   - _knex:       raw Knex instance (for transactions; prefer repositories)
 *   - destroy():   releases the connection pool on graceful shutdown
 *
 * The Knex instance is configured with wrapIdentifier and postProcessResponse
 * so that all query-builder calls use camelCase field names throughout the
 * application. Conversion to/from snake_case happens automatically:
 *   - wrapIdentifier:      camelCase → snake_case before sending to PostgreSQL
 *   - postProcessResponse: snake_case → camelCase after receiving from PostgreSQL
 *
 * IMPORTANT: knex.raw strings bypass wrapIdentifier. Column names inside raw
 * SQL must be written in snake_case manually. See repository files for examples.
 *
 * Knex is configured programmatically from the nconf config singleton (F-002
 * resolution from backend-tasks.md). No knexfile.js is used in production.
 * A knexfile.ts is provided for developer CLI convenience (e.g. knex migrate:rollback).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Knex as KnexNS } from 'knex';
import Knex from 'knex';
import type { AppConfig } from '../config/index.js';
import {
  createChunksRepository,
  createEmbeddingsRepository,
} from './repositories/index.js';
import { camelCase, snakeCase } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Construct a Knex instance with the shared camelCase↔snake_case conversion
 * hooks and an optional migrations/seeds configuration.
 *
 * Called by createDb (with migrations + seeds) and createTestDb (without,
 * because schema is managed by globalSetup.ts in the test environment).
 */
function createKnexInstance(
  dbConfig: AppConfig['db'],
  migrations?: KnexNS.MigratorConfig,
  seeds?: KnexNS.SeederConfig,
): ReturnType<typeof Knex> {
  return Knex({
    client: 'pg',
    connection: {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
    },
    migrations,
    seeds,
    // Convert camelCase JS identifiers to snake_case before sending to PostgreSQL.
    // The '*' wildcard is passed through unchanged.
    wrapIdentifier: (value, wrap) => wrap(snakeCase(value)),
    // Convert snake_case column names from PostgreSQL results to camelCase.
    postProcessResponse: (result: unknown) => {
      const toCamel = (row: Record<string, unknown>) =>
        Object.fromEntries(
          Object.entries(row).map(([key, val]) => [camelCase(key), val]),
        );

      if (Array.isArray(result)) return result.map(toCamel);
      if (typeof result === 'object' && result !== null)
        return toCamel(result as Record<string, unknown>);
      return result;
    },
  });
}

export async function createDb(dbConfig: AppConfig['db']) {
  const knex = createKnexInstance(
    dbConfig,
    {
      directory: path.join(__dirname, 'migrations'),
      // Knex uses commonjs extension detection; extension must match compiled output
      extension: 'js',
    },
    {
      directory: path.join(__dirname, 'seeds'),
      extension: 'js',
    },
  );

  await knex.raw('SELECT 1');
  await knex.migrate.latest();

  return buildDbInstance(knex);
}

function buildDbInstance(knex: ReturnType<typeof Knex>) {
  return {
    /**
     * Raw Knex instance — use for transactions and any operation not covered
     * by a repository. Prefer repository methods where available.
     */
    _knex: knex,

    /** Embeddings table repository. */
    embeddings: createEmbeddingsRepository(knex),

    /** Chunks table repository. */
    chunks: createChunksRepository(knex),

    /** Release the connection pool. Call on graceful shutdown. */
    async destroy(): Promise<void> {
      await knex.destroy();
    },
  };
}

/**
 * Create a DbInstance for integration tests.
 *
 * Skips the connectivity check and migrate.latest() — schema is managed by
 * globalSetup.ts in the test environment. Use this in integration test files
 * instead of createDb so that production migration logic is not exercised
 * in tests, and createDb's extension: 'js' config remains correct for
 * production builds.
 *
 * @internal test use only
 */
export function createTestDb(dbConfig: AppConfig['db']): DbInstance {
  return buildDbInstance(createKnexInstance(dbConfig));
}

/** The full typed database object returned by createDb. */
export type DbInstance = ReturnType<typeof buildDbInstance>;
