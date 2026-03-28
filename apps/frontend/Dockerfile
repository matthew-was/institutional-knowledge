# apps/frontend/Dockerfile
#
# The Node.js version is sourced from .nvmrc at the repository root.
# The FROM version below must match .nvmrc. Update both together.
# GitHub Actions ci.yml reads .nvmrc via node-version-file so CI stays in sync.

FROM node:24-slim AS base

# Enable corepack for pnpm
RUN corepack enable

WORKDIR /app

# ── dependency install stage ───────────────────────────────────────────────────
FROM base AS deps

# Copy workspace manifests needed for frozen install.
# The monorepo root sits at /app; pnpm requires the workspace file and all
# package.json manifests to be present at their real workspace-relative paths
# before running --frozen-lockfile.
COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json

RUN pnpm install --frozen-lockfile

# ── dev-deps stage ────────────────────────────────────────────────────────────
# Extends deps with a built packages/shared so tsx can resolve sub-path exports
# (e.g. @institutional-knowledge/shared/schemas) during hot-reload development.
# Also copies the Next.js config files that must be present at startup —
# next.config.ts, tsconfig.json, and tailwind.config.ts are read before any
# source bind-mount is applied and are not hot-reloaded, so baking them into
# the image is correct. The frontend source (src/, server/) is bind-mounted.
FROM deps AS devdeps

COPY tsconfig.json ./
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @institutional-knowledge/shared build

COPY apps/frontend/tsconfig.json ./apps/frontend/tsconfig.json
COPY apps/frontend/next.config.ts ./apps/frontend/next.config.ts
COPY apps/frontend/tailwind.config.ts ./apps/frontend/tailwind.config.ts

# ── build stage ───────────────────────────────────────────────────────────────
# Extends devdeps (shared already compiled) so the shared build step is not
# duplicated between stages.
FROM devdeps AS builder

# Copy frontend source and build Next.js
COPY apps/frontend/ ./apps/frontend/
RUN pnpm --filter frontend build

# ── runtime stage ─────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime

RUN corepack enable

WORKDIR /app

ENV NODE_ENV=production
# Tell the Hono custom server where apps/frontend/ root is so Next.js can
# locate the .next/ build output. WORKDIR is /app but server/server.ts is
# resolved relative to apps/frontend/ — NEXT_DIR bridges the gap.
ENV NEXT_DIR=/app/apps/frontend

# Copy built application and production node_modules from their workspace paths.
# node_modules are hoisted to /app/node_modules by pnpm.
#
# .next/ — Next.js build output (needed by the Hono custom server at runtime)
# server/ — Hono custom server TypeScript source (run via tsx at startup)
# config.json5 — base configuration (overridden at runtime via volume mount)
COPY --from=builder /app/apps/frontend/.next ./apps/frontend/.next
COPY --from=builder /app/apps/frontend/server ./apps/frontend/server
COPY --from=builder /app/apps/frontend/config.json5 ./apps/frontend/config.json5
COPY --from=builder /app/apps/frontend/tsconfig.json ./apps/frontend/tsconfig.json
COPY --from=builder /app/apps/frontend/package.json ./apps/frontend/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json

EXPOSE 3000

# Run the Hono custom server via tsx (transpile-only, no watch mode).
# tsx handles extensionless imports and ESM TypeScript without a compile step.
# The server mounts Next.js and dispatches /api/* to Hono.
# An optional config.override.json5 may be volume-mounted at
# apps/frontend/config.override.json5 to supply environment-specific values
# (e.g. express.internalKey, express.baseUrl). See config.docker.json5 for the
# Docker Compose override.
CMD ["node_modules/.bin/tsx", "apps/frontend/server/server.ts"]
