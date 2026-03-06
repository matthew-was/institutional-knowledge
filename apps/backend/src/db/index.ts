/**
 * Knex database initialisation module.
 *
 * Knex is configured programmatically from the nconf config singleton (F-002
 * resolution from backend-tasks.md). No knexfile.js is used in production.
 * Programmatic configuration is preferred because it keeps the database
 * connection in the same nconf hierarchy as all other config, avoids a
 * separate config file, and works cleanly with ESM.
 *
 * A knexfile.ts is provided alongside this module for developer CLI convenience
 * (e.g. `knex migrate:rollback`). It re-exports the same knex instance.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Knex from 'knex';
import type { AppConfig } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create and return a Knex instance configured from the provided app config.
 * The migrations directory is resolved relative to this file so it works both
 * in development (src/) and after compilation (dist/).
 */
export function createKnex(dbConfig: AppConfig['db']) {
  return Knex({
    client: 'pg',
    connection: {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
      password: dbConfig.password,
    },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      // Knex uses commonjs extension detection; extension must match compiled output
      extension: 'js',
    },
    seeds: {
      directory: path.join(__dirname, 'seeds'),
      extension: 'js',
    },
  });
}

export type KnexInstance = ReturnType<typeof createKnex>;
