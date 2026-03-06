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

# Copy workspace manifests needed for frozen install
COPY pnpm-workspace.yaml ../../pnpm-workspace.yaml
COPY package.json ../../package.json
COPY pnpm-lock.yaml ../../pnpm-lock.yaml
COPY packages/shared/package.json ../../packages/shared/package.json
COPY apps/frontend/package.json ./package.json

RUN pnpm install --frozen-lockfile

# ── build stage ───────────────────────────────────────────────────────────────
FROM deps AS builder

# Copy shared package source and build it first
COPY packages/shared/ ../../packages/shared/
RUN pnpm --filter @institutional-knowledge/shared build

# Copy frontend source and build
COPY apps/frontend/ ./
RUN pnpm --filter frontend build

# ── runtime stage ─────────────────────────────────────────────────────────────
FROM node:24-slim AS runtime

RUN corepack enable

WORKDIR /app

ENV NODE_ENV=production

# Copy built application and production node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["node", "server.js"]
