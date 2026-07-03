# syntax=docker/dockerfile:1
# Long-lived-host image for the Assay API (Render / Railway / Fly / any container
# host). Use this rather than Vercel serverless for *live* OpenAI runs, where
# POST /runs/{id}/start can exceed a serverless function's time limit.
#
# Build context is apps/api:  docker build -t assay-api apps/api
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    ASSAY_ENV=production \
    PORT=8000

WORKDIR /app

# curl is only for the container healthcheck.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first so the layer caches across code changes.
COPY requirements.txt ./
RUN pip install -r requirements.txt

# TraceRazor is optional: the platform wheel bundles the auditor binary. If no
# wheel exists for this platform the API still boots and reports the trace audit
# as "unavailable", so never fail the build on it.
RUN pip install "tracerazor>=1.0.3" \
    || echo "tracerazor unavailable for this platform; trace audit will report unavailable"

# Application code (tests, local db, and caches are excluded via .dockerignore).
COPY . .

# Drop root.
RUN useradd -m -u 10001 assay && chown -R assay:assay /app
USER assay

EXPOSE 8000

# Most hosts inject $PORT; default to 8000 for a plain `docker run`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fsS "http://127.0.0.1:${PORT:-8000}/health" || exit 1

CMD ["sh", "-c", "python -m uvicorn assay_api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
