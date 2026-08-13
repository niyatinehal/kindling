# syntax=docker/dockerfile:1

# ---------- Builder: full deps, compile TypeScript -> JavaScript ----------
# Pinned tag, never :latest — reproducible builds and supply-chain hygiene.
FROM node:22-alpine AS builder

WORKDIR /app

# Manifests first, install second, source last. Editing a source file then
# leaves the slow `npm ci` layer cached.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# Drop devDependencies in place so the runtime stage can copy node_modules
# wholesale. TypeScript itself never reaches the final image.
RUN npm prune --omit=dev

# ---------- Runtime: compiled output + production deps only ----------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# `node` is an unprivileged user baked into the official image.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1

CMD ["node", "dist/server.js"]
