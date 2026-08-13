# syntax=docker/dockerfile:1

# ---------- Builder: full deps, compile TypeScript -> JavaScript ----------
# Pinned tag, never :latest — reproducible builds and supply-chain hygiene.
FROM node:22-alpine AS builder

WORKDIR /app

# Manifests first, install second, source last. Editing a source file then
# leaves the slow `npm ci` layer cached.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build

# Drop devDependencies in place so the runtime stage can copy node_modules
# wholesale. TypeScript itself never reaches the final image.
RUN npm prune --omit=dev

# @prisma/client declares `prisma` (the CLI) as a peerDependency, so
# `npm prune --omit=dev` keeps it installed even though it is only a
# devDependency here — nothing in @prisma/client or the generated client
# actually imports it at runtime. Strip it explicitly so the ~40MB CLI
# doesn't ride along into the runtime image.
RUN rm -rf node_modules/prisma

# ---------- Runtime: compiled output + production deps only ----------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
# tsc's rootDir is inferred (not pinned to src/) because src/db/prisma.ts
# imports the generated Prisma client from outside src/; that nests emitted
# output one level deeper than before: dist/src/* (not dist/*) mirrors the
# previous dist/ layout that package.json's "main" and this image's CMD
# expect, and dist/generated/* is the compiled client. The raw generated/
# directory (schema.prisma sets generatedFileExtension = "ts") never
# contains runnable .js on its own — only tsc's compile of it does, so the
# compiled copy, not the raw one, is what the runtime stage needs.
COPY --from=builder --chown=node:node /app/dist/src ./dist
COPY --from=builder --chown=node:node /app/dist/generated ./generated
COPY --chown=node:node package.json ./

# `node` is an unprivileged user baked into the official image.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1

CMD ["node", "dist/server.js"]
