# syntax=docker/dockerfile:1

# ---------- builder ----------
FROM node:24-slim AS builder
WORKDIR /app

# openssl needed by prisma engine
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# install full deps (dev included) for build + prisma cli
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# prisma client + build
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN yarn build

# ---------- runner ----------
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable

# bring built app + deps + generated prisma client (kept for `db push` at start)
COPY package.json yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 9070

# apply schema (no migrations in repo -> db push), then start
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server.js"]
