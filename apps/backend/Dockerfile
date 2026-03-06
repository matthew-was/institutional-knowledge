# apps/backend/Dockerfile
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
COPY apps/backend/package.json ./apps/backend/package.json

RUN pnpm install --frozen-lockfile

# ── build stage ───────────────────────────────────────────────────────────────
FROM deps AS builder

# Copy shared package source and build it first
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @institutional-knowledge/shared build

# Copy backend source and build
COPY apps/backend/ ./apps/backend/
RUN pnpm --filter backend build

# ── runtime stage ─────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime

RUN corepack enable

WORKDIR /app

ENV NODE_ENV=production

# Copy built application and production node_modules from their workspace paths.
# After the build the compiled output is at /app/apps/backend/dist and
# node_modules are hoisted to /app/node_modules by pnpm.
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json

EXPOSE 4000

CMD ["node", "apps/backend/dist/server.js"]
