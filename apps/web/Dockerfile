# syntax=docker/dockerfile:1

FROM oven/bun:1.4.0-alpine AS dependencies
WORKDIR /app

COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN bun install --frozen-lockfile --filter @upnext/web

FROM dependencies AS builder
COPY tsconfig.base.json ./
COPY apps/web ./apps/web
COPY packages/contracts ./packages/contracts

ARG API_URL=http://api:3001
ENV API_URL=${API_URL}
RUN bun run --filter @upnext/web build

FROM node:24-alpine
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
