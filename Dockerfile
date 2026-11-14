# Multi-stage production Dockerfile for EvenRegMan & ResMesh
# Builds distinct targets for:
# 1. 'web'    -> Stateless Next.js App Router server (serves UI, API routes, Server Actions)
# 2. 'worker' -> Stateful background daemon (runs Outbox Relay, CDC listener, Lease Reaper)

# ----------------------------------------------------
# Stage 1: Base dependencies
# ----------------------------------------------------
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./

# ----------------------------------------------------
# Stage 2: Install dependencies
# ----------------------------------------------------
FROM base AS deps
RUN npm ci

# ----------------------------------------------------
# Stage 3: Builder
# ----------------------------------------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ----------------------------------------------------
# Target A: Web Runner (Stateless HTTP / UI)
# ----------------------------------------------------
FROM node:20-alpine AS web
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3000

CMD ["npm", "run", "start"]

# ----------------------------------------------------
# Target B: Worker Runner (Stateful Daemons)
# ----------------------------------------------------
FROM node:20-alpine AS worker
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 workeruser

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json

USER workeruser

# Executes Outbox Relay, CDC Listener, and Lease Reaper
CMD ["npm", "run", "worker:outbox"]

