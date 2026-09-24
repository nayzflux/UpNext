# syntax=docker/dockerfile:1

FROM oven/bun:1.4.0-alpine AS dependencies
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN bun install --frozen-lockfile --filter @upnext/api

FROM dependencies AS builder
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages/contracts ./packages/contracts
RUN bun run --filter @upnext/api build

FROM oven/bun:1.4.0-alpine AS production-dependencies
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN bun install --frozen-lockfile --production --filter @upnext/api

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

RUN addgroup --system upnext && adduser --system --ingroup upnext upnext

COPY --from=production-dependencies --chown=upnext:upnext /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=upnext:upnext /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=upnext:upnext /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=upnext:upnext /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=upnext:upnext /app/apps/api/drizzle ./apps/api/drizzle

USER upnext
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
