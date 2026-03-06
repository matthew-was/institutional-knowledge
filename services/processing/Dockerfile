# services/processing/Dockerfile
#
# The Python version is sourced from services/processing/.python-version.
# To keep the base image in sync, update .python-version and rebuild.
# The ARG below must be passed at build time when the version changes:
#   docker build --build-arg PYTHON_VERSION=$(cat .python-version) .
# docker-compose.yml reads .python-version via the build arg at compose build time.
#
# If you change the Python version, also update:
#   - services/processing/.python-version  (canonical source)
#   - ruff.toml target-version             (set to match)
#   - .github/workflows/ci.yml uses python-version-file: pointing at .python-version
#     so the CI workflow picks up the change automatically.

ARG PYTHON_VERSION=3.13

# ── builder stage ─────────────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency manifest first (layer cache)
COPY requirements.txt ./

RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── runtime stage ─────────────────────────────────────────────────────────────
FROM python:${PYTHON_VERSION}-slim AS runtime

WORKDIR /app

# Copy only installed packages from builder — keeps image small
COPY --from=builder /install /usr/local

# Runtime system dependencies (e.g. libpq for psycopg2 — remove if not needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    && rm -rf /var/lib/apt/lists/*

# Copy application source
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
