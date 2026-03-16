/**
 * Test database configuration.
 *
 * Single source of truth for the test DB connection details.
 * Matches docker-compose.test.yml credentials and port.
 * Import TEST_DB_CONFIG in integration test files; use createTestKnexConfig()
 * in globalSetup.ts which needs a raw Knex config rather than a DbInstance.
 */

export const TEST_DB_CONFIG = {
  host: 'localhost',
  port: 5433,
  database: 'ik_test',
  user: 'ik_test',
  password: 'ik_test',
} as const;

export function createTestKnexConfig() {
  return {
    client: 'pg',
    connection: TEST_DB_CONFIG,
  };
}
