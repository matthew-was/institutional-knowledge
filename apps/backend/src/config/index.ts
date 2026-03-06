/**
 * Configuration module for the Express backend.
 *
 * nconf is a CommonJS module. In ESM projects it must be imported via a
 * dynamic import() or a createRequire wrapper. We use createRequire here so
 * the module is loaded synchronously before startup validation runs.
 *
 * Knex is configured programmatically from the nconf config singleton at
 * runtime (see src/db/index.ts). No knexfile.js is used. This avoids a
 * separate config file and keeps the database connection string in one place.
 *
 * nconf hierarchy (highest priority first):
 *   1. CLI arguments
 *   2. Environment variables prefixed IK_ (__ as nested-key separator)
 *   3. config.override.json (git-ignored, per-developer overrides)
 *   4. config.json (committed, safe local defaults)
 *   5. nconf defaults
 */

import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const require = createRequire(import.meta.url);
// biome-ignore lint/suspicious/noExplicitAny: nconf is CJS; dynamic require returns any
const nconf = require("nconf") as any;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve config files relative to the apps/backend/ root (two levels up from src/config/)
const backendRoot = path.resolve(__dirname, "..", "..");

nconf
	.argv()
	.env({ prefix: "IK_", separator: "__", lowerCase: true })
	.file("override", { file: path.join(backendRoot, "config.override.json") })
	.file("base", { file: path.join(backendRoot, "config.json") });

// ---------------------------------------------------------------------------
// Zod schema — all required config keys
// ---------------------------------------------------------------------------

const ConfigSchema = z.object({
	server: z.object({
		port: z.coerce.number().int().positive().default(4000),
	}),
	db: z.object({
		host: z.string().min(1),
		port: z.coerce.number().int().positive().default(5432),
		database: z.string().min(1),
		user: z.string().min(1),
		password: z.string().min(1),
	}),
	auth: z.object({
		frontendKey: z.string().min(1),
		pythonKey: z.string().min(1),
		pythonServiceKey: z.string().min(1),
	}),
	storage: z.object({
		provider: z.string().min(1),
		local: z.object({
			basePath: z.string().min(1),
			stagingPath: z.string().min(1),
		}),
	}),
	upload: z.object({
		maxFileSizeMb: z.coerce.number().positive(),
		acceptedExtensions: z.array(z.string().min(1)),
	}),
	pipeline: z.object({
		runningStepTimeoutMinutes: z.coerce.number().positive(),
		maxRetries: z.coerce.number().int().nonnegative(),
	}),
	python: z.object({
		baseUrl: z.string().url(),
	}),
	vectorStore: z.object({
		provider: z.string().min(1).default("pgvector"),
	}),
	graph: z.object({
		provider: z.string().min(1).default("postgresql"),
	}),
	embedding: z.object({
		dimension: z.coerce.number().int().positive(),
	}),
	ingestion: z.object({
		partialAuditReport: z.coerce.boolean(),
		reportOutputDirectory: z.string().min(1),
	}),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

// ---------------------------------------------------------------------------
// Validated singleton — throws at startup if config is invalid
// ---------------------------------------------------------------------------

function loadConfig(): AppConfig {
	const raw = {
		server: nconf.get("server"),
		db: nconf.get("db"),
		auth: nconf.get("auth"),
		storage: nconf.get("storage"),
		upload: nconf.get("upload"),
		pipeline: nconf.get("pipeline"),
		python: nconf.get("python"),
		vectorStore: nconf.get("vectorStore"),
		graph: nconf.get("graph"),
		embedding: nconf.get("embedding"),
		ingestion: nconf.get("ingestion"),
	};

	const result = ConfigSchema.safeParse(raw);
	if (!result.success) {
		throw new Error(
			`Invalid configuration:\n${result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`,
		);
	}
	return result.data;
}

export const config: AppConfig = loadConfig();
