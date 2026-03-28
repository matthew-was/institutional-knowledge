/**
 * Configuration module for the Hono frontend server.
 *
 * nconf is a CommonJS module. In ESM projects it must be loaded via
 * createRequire so it is available synchronously before startup validation.
 *
 * nconf hierarchy (highest priority first):
 *   1. CLI arguments
 *   2. Environment variables prefixed IK_ (__ as nested-key separator)
 *   3. config.override.json5 (git-ignored, per-developer overrides)
 *   4. config.json5 (committed, safe local defaults)
 *   5. nconf defaults
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSON5 from 'json5';
import type { Provider } from 'nconf';
import { z } from 'zod';

const require = createRequire(import.meta.url);
const nconf = require('nconf') as Provider;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve config files relative to apps/frontend/ root (two levels up from server/config/)
const frontendRoot = path.resolve(__dirname, '..', '..');

const overridePath = path.join(frontendRoot, 'config.override.json5');
const overrideIsFile =
  fs.existsSync(overridePath) && fs.statSync(overridePath).isFile();

const nconfBase = nconf
  .argv()
  .env({ prefix: 'IK_', separator: '__', lowerCase: true });

if (overrideIsFile) {
  nconfBase.file('override', { file: overridePath, format: JSON5 });
}

nconfBase.file('base', {
  file: path.join(frontendRoot, 'config.json5'),
  format: JSON5,
});

// ---------------------------------------------------------------------------
// Zod schema — all required config keys
// ---------------------------------------------------------------------------

const ConfigSchema = z.object({
  server: z.object({
    host: z.string().min(1),
    port: z.coerce.number().int().positive(),
  }),
  express: z.object({
    baseUrl: z.url(),
    internalKey: z.string().min(1),
  }),
  upload: z.object({
    maxFileSizeMb: z.coerce.number().positive(),
    acceptedExtensions: z.array(z.string().min(1)),
  }),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

// ---------------------------------------------------------------------------
// parseConfig — pure Zod validation against a plain object.
//
// Exported for use in tests only. Production code must import the `config`
// singleton exported at the bottom of this file — that is the correct export
// for all application use. Do not call parseConfig in application code: it
// bypasses the nconf loading hierarchy and will produce an incomplete config
// object.
// ---------------------------------------------------------------------------

export function parseConfig(raw: unknown): AppConfig {
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Invalid configuration:\n${result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }
  return result.data;
}

// ---------------------------------------------------------------------------
// Validated singleton — throws at startup if config is invalid
// ---------------------------------------------------------------------------

function loadConfig(): AppConfig {
  return parseConfig({
    server: nconf.get('server'),
    express: nconf.get('express'),
    upload: nconf.get('upload'),
  });
}

export const config: AppConfig = loadConfig();
