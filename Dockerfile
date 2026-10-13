# syntax=docker/dockerfile:1
# Production image: Next.js standalone server + bundled migration runner.
#   docker run IMAGE                      → node server.js  (port 3000)
#   docker run IMAGE node migrate.mjs     → apply DB migrations from /app/drizzle, exit non-zero on failure
ARG NODE_IMAGE=node:24-alpine

# ---------------------------------------------------------------- deps
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------- build
FROM ${NODE_IMAGE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build && npm run build:migrate

# ---------------------------------------------------------------- runtime
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    UPLOAD_DIR=/data/uploads

RUN addgroup -S -g 1001 nodejs && adduser -S -u 1001 -G nodejs nextjs \
 && mkdir -p /data/uploads && chown 1001:1001 /data/uploads

COPY --from=build --chown=1001:1001 /app/.next/standalone ./
COPY --from=build --chown=1001:1001 /app/.next/static ./.next/static
COPY --from=build --chown=1001:1001 /app/public ./public
COPY --from=build --chown=1001:1001 /app/dist/migrate.mjs ./migrate.mjs
COPY --from=build --chown=1001:1001 /app/drizzle ./drizzle

USER 1001:1001
EXPOSE 3000
CMD ["node", "server.js"]
