# syntax=docker/dockerfile:1

# Install dependencies only after copying manifests, so this layer is reused while
# application source files change.
FROM oven/bun:1.4.0-alpine AS dependencies
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN bun install --frozen-lockfile

FROM dependencies AS production-dependencies
RUN rm -rf node_modules \
  && bun install --frozen-lockfile --production --filter @upnext/api

FROM dependencies AS builder
COPY . .

ARG API_URL=http://api:3001
ENV API_URL=${API_URL}

RUN bun run --filter @upnext/api build \
  && bun run --filter @upnext/web build

FROM node:24-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup --system upnext && adduser --system --ingroup upnext upnext

COPY --from=production-dependencies --chown=upnext:upnext /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=upnext:upnext /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=upnext:upnext /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=upnext:upnext /app/apps/api/drizzle ./apps/api/drizzle

USER upnext
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]

FROM node:24-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system upnext && adduser --system --ingroup upnext upnext

# Next's standalone output retains the monorepo directory structure.
COPY --from=builder --chown=upnext:upnext /app/apps/web/.next/standalone ./
COPY --from=builder --chown=upnext:upnext /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=upnext:upnext /app/apps/web/public ./apps/web/public

USER upnext
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
