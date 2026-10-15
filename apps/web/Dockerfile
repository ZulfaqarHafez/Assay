# syntax=docker/dockerfile:1
# Assay web app as a self-contained Next.js server.
#
# Build context is the REPOSITORY ROOT (npm workspaces + the root lockfile):
#   docker build -f apps/web/Dockerfile -t assay-web .
#
# The browser calls the API at NEXT_PUBLIC_API_BASE_URL, which Next.js bakes in
# at build time (default: an API on http://localhost:8000). Server rendering
# reads ASSAY_API_BASE_URL at runtime, so inside a Docker network you can point
# it at the API container while browsers keep using the public URL.

FROM node:22-alpine AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY apps/web apps/web
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_OUTPUT_STANDALONE=1
RUN npm --workspace apps/web run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN addgroup -S assay && adduser -S assay -G assay
COPY --from=build --chown=assay:assay /repo/apps/web/.next/standalone ./
COPY --from=build --chown=assay:assay /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=assay:assay /repo/apps/web/public ./apps/web/public
USER assay
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/" >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
