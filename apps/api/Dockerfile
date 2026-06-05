# syntax=docker/dockerfile:1
# Build context = repository ROOT (needs packages/shared + the root lockfile):
#   docker build -f apps/api/Dockerfile -t ticketing-api .

# ---- builder: install all deps, build shared + api, drop dev deps ----
FROM node:22-slim AS builder
WORKDIR /app

# Install deps first (cached unless manifests change).
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci

# Build the shared package then the API.
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm run build:shared && npm run build -w @ticketing/api

# Keep production dependencies only.
RUN npm prune --omit=dev

# ---- runner: minimal runtime ----
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# Run as a non-root user.
RUN useradd --uid 1001 --create-home appuser

# node_modules (with workspace symlinks), built output and manifests.
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/package.json ./package.json
COPY --from=builder --chown=appuser:appuser /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=appuser:appuser /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=appuser:appuser /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=appuser:appuser /app/apps/api/dist ./apps/api/dist

USER appuser

# Cloud Run injects PORT (defaults to 8080); the server reads it.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "apps/api/dist/server.js"]
