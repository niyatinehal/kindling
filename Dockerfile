# syntax=docker/dockerfile:1

# ---------- Builder: full deps, compile TypeScript -> JavaScript ----------
# Pinned tag, never :latest — reproducible builds and supply-chain hygiene.
FROM node:22-alpine AS builder

WORKDIR /app

# Manifests first — the root one declares the workspace, api's declares the
# backend's dependencies. Editing source then leaves `npm ci` cached.
COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
RUN npm ci

COPY api ./api
# No separate generate step: `build` generates the Prisma client itself, the
# same way `typecheck` does, so a fresh checkout compiles without one. Splitting
# it out bought nothing here anyway — the COPY above invalidates every layer
# below it, so both would rebuild on any source change.
RUN npm run build -w api

# Drop devDependencies. With workspaces these are hoisted to the root
# node_modules, so the prune runs from the root and covers the whole tree.
RUN npm prune --omit=dev

# @prisma/client declares `prisma` (the CLI) as an optional peer, so the prune
# keeps it. Strip the ~40MB CLI explicitly. Task 1 confirmed full hoisting, so
# the CLI is at the root; the api/ path is kept only as a cheap safety net.
RUN rm -rf node_modules/prisma api/node_modules/prisma

# ---------- Runtime: compiled output + production deps only ----------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Every dependency is hoisted to the root node_modules by npm workspaces, so
# this single copy covers the api workspace too. There is deliberately no
# COPY of api/node_modules: that directory does not exist and copying it would
# fail the build. If a future version conflict between workspaces ever forces
# a nested install, this stage must gain that copy back — the symptom would be
# a container that builds and then exits with ERR_MODULE_NOT_FOUND.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
# api/tsconfig.build.json pins rootDir to "." (the api workspace root, one
# level above both src/ and generated/) because api/src/db/prisma.ts imports
# the generated Prisma client from ../../generated/prisma/client.js. That
# produces api/dist/src/* and api/dist/generated/* under one outDir. Copied
# wholesale and unpromoted so this layout matches api/package.json's
# "main"/"start" exactly — dev (`npm start`) and prod (this image) agree on
# one path. generated/'s raw output (schema.prisma sets
# generatedFileExtension = "ts") has no runnable .js of its own;
# api/dist/generated is tsc's compiled copy, which is what's needed here, and
# it rides along in this single COPY.
COPY --from=builder --chown=node:node /app/api/dist ./api/dist
COPY --chown=node:node package.json ./
COPY --chown=node:node api/package.json ./api/package.json

# `node` is an unprivileged user baked into the official image.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1

CMD ["node", "api/dist/src/server.js"]
