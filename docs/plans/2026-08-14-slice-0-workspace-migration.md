# Slice 0 — Workspace Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the backend into `api/` under npm workspaces, leaving CI green and a Docker image that builds **and boots**.

**Architecture:** The entire backend tree moves as a unit, so every path _inside_ it stays valid — `src/db/prisma.ts`'s `../../generated/prisma/client.js` still resolves, and `tsconfig.build.json`'s `rootDir: "."` still emits the same `dist/src` shape, now rooted at `api/`. Only things referencing the old root break: the Dockerfile, CI, the ignore files, and the docs. Shared infrastructure — the Supabase stack, both compose files, Prettier — stays at the root because `web/` will need it too.

**Tech Stack:** npm workspaces (npm 10.8), TypeScript 6, Prisma 7, Jest 30, Docker, GitHub Actions.

**Spec:** `docs/specs/2026-08-14-frontend-foundations-design.md` (slice 0 of two)

## Global Constraints

- **No behaviour changes.** This slice moves files and rewires paths. If a test's expectations change, something is wrong.
- The bar is a container that **boots and serves `/readyz`**, not one that compiles. A wrong path here fails at container start, not at build time.
- Baseline that must still hold at the end: **unit 40, integration 23, `test:all` 63**, lint / format / typecheck clean.
- `workspaces` lists **only `api`** in this slice. `web/` does not exist yet, and npm errors on a workspace directory that is missing. Slice 1 adds it.
- Use `git mv` for tracked files so history follows.
- Never edit an applied migration — all six have checksums in `_prisma_migrations`.
- Conventional Commits. Commit locally only; do not push.

## What stays at the root, and why

| Stays                                           | Reason                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `supabase/`                                     | The local stack serves both workspaces — `web/` authenticates against it |
| `docker-compose.yml`, `docker-compose.test.yml` | Shared infrastructure                                                    |
| `.prettierrc`, `.prettierignore`                | One formatter across both workspaces                                     |
| `.gitignore`, `.dockerignore`                   | Repo-wide                                                                |
| `package-lock.json`                             | Workspaces keep a single lockfile at the root                            |
| `docs/`, `README.md`, `scripts/`, `.github/`    | Repo-wide                                                                |

## What moves into `api/`

`src/`, `test/`, `prisma/`, `jest.config.js`, `tsconfig.json`, `tsconfig.build.json`, `eslint.config.js`, `prisma.config.ts`, `package.json`, and the untracked `.env`.

The untracked `dist/` and `generated/` are **deleted, not moved** — both are regenerable build output and Task 1 Step 3 removes them.

---

## File Structure

| File                       | Responsibility after the move                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` (root)      | Workspace declaration; shared infra scripts (`db:start`, `test:db:up`, `format`); thin delegates to `api` so `npm test` still works from the root |
| `api/package.json`         | The backend's own scripts and dependencies — the current root file, moved                                                                         |
| `api/prisma.config.ts`     | Unchanged content; its `schema: "prisma/schema.prisma"` is already relative and now resolves inside `api/`                                        |
| `Dockerfile`               | Workspace-aware: copies the root manifests plus `api/package.json`, installs with `npm ci`, builds `-w api`                                       |
| `.github/workflows/ci.yml` | Runs backend commands with `-w api` from the repo root                                                                                            |
| `.dockerignore`            | Path prefixes updated to `api/`                                                                                                                   |
| `README.md`                | Every command re-checked against the new layout                                                                                                   |

Dependency order: T1 → T2 → T3 → T4 → T5.

---

### Task 1: Create the workspace and move the backend

**Files:**

- Create: `package.json` (new root)
- Move: `src/`, `test/`, `prisma/`, `jest.config.js`, `tsconfig.json`, `tsconfig.build.json`, `eslint.config.js`, `prisma.config.ts`, `package.json` → `api/`

**Interfaces:**

- Consumes: nothing.
- Produces: a root workspace exposing `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` as delegates to `api`, and the same scripts directly on `api`. Tasks 3–5 rely on `npm ci` at the root installing the `api` workspace.

- [ ] **Step 1: Record the baseline you must restore**

```bash
npm run test:db:up
DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54329/wellness_test npx prisma migrate deploy
npm run test:all 2>&1 | grep -aE "Test Suites:|Tests:"
npm run lint && npm run format:check && npm run typecheck && echo "BASELINE CLEAN"
```

Expected: `Tests: 63 passed`, then `BASELINE CLEAN`. Write both down. Every later step compares against these numbers.

- [ ] **Step 2: Move the tracked files**

```bash
mkdir -p api
git mv src test prisma jest.config.js tsconfig.json tsconfig.build.json eslint.config.js prisma.config.ts package.json api/
```

- [ ] **Step 3: Move the untracked files and clear build output**

`.env` holds your real local values and is gitignored; it must travel with the backend because `npm run dev` loads it with `--env-file=.env` relative to the working directory.

```bash
mv .env api/.env
rm -rf dist generated node_modules
```

`.gitignore`'s `.env` pattern has no slash, so it matches at any depth — `api/.env` stays ignored. Verify: `git check-ignore -v api/.env`.

- [ ] **Step 4: Write the root `package.json`**

```json
{
  "name": "wellness-platform",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["api"],
  "engines": {
    "node": ">=22"
  },
  "scripts": {
    "dev": "npm run dev -w api",
    "build": "npm run build -w api",
    "start": "npm run start -w api",
    "test": "npm run test -w api",
    "test:integration": "npm run test:integration -w api",
    "test:all": "npm run test:all -w api",
    "typecheck": "npm run typecheck -w api",
    "lint": "npm run lint -w api",
    "lint:fix": "npm run lint:fix -w api",
    "prisma:generate": "npm run prisma:generate -w api",
    "prisma:migrate": "npm run prisma:migrate -w api",
    "prisma:studio": "npm run prisma:studio -w api",
    "db:seed": "npm run db:seed -w api",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "db:status": "supabase status",
    "test:db:up": "docker compose -f docker-compose.test.yml up -d --wait",
    "test:db:down": "docker compose -f docker-compose.test.yml down"
  },
  "devDependencies": {
    "prettier": "^3.9.6",
    "supabase": "^2.114.0"
  }
}
```

This block is **not** Prettier-formatted as written — the repo's config expands
`"workspaces": ["api"]` across multiple lines. Run `npx prettier --write package.json`
immediately after saving it, or Step 7's `format:check` gate fails.

Formatting and the Supabase CLI move to the root because both span workspaces: Prettier formats `web/` too, and `web/` authenticates against the same local stack.

- [ ] **Step 5: Strip the root-only scripts and deps from `api/package.json`**

In `api/package.json`, delete these scripts — they now live at the root: `format`, `format:check`, `db:start`, `db:stop`, `db:status`, `test:db:up`, `test:db:down`. Keep everything else exactly as it is.

Also remove `prettier` and `supabase` from `api`'s `devDependencies` (they are now root devDependencies), and set `"name": "api"`.

Leave `api`'s `main` as `dist/src/server.js` — the emit layout is unchanged, just rooted at `api/`.

- [ ] **Step 6: Install and regenerate**

```bash
npm install
npm run prisma:generate
```

Expected: `npm install` writes a lockfile covering the `api` workspace and creates a hoisted root `node_modules`. `prisma generate` writes to `api/generated/prisma`.

Verify the generated client landed inside the workspace, not at the root:

```bash
ls api/generated/prisma/client.ts && echo "generated inside api/ — correct"
ls generated 2>/dev/null && echo "WRONG: generated at repo root"
```

- [ ] **Step 7: Restore the baseline**

```bash
npm run lint && npm run format:check && npm run typecheck
npm test 2>&1 | grep -aE "Tests:"
npm run test:db:up
( cd api && DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54329/wellness_test npx prisma migrate deploy )
npm run test:all 2>&1 | grep -aE "Tests:"
```

Expected: unit **40**, `test:all` **63**, all three checks clean — identical to Step 1. If any number differs, stop and find out why before continuing; a migration that changes test counts has changed behaviour.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: move the backend into the api workspace"
```

---

### Task 2: Restore the developer loop

**Files:**

- Verify (and fix only if broken): `api/prisma.config.ts`, `api/package.json` scripts

**Interfaces:**

- Consumes: the workspace from Task 1.
- Produces: working `npm run dev`, `npx prisma migrate deploy`, `npx prisma db seed` from the new layout. Task 5 documents whatever you confirm here.

- [ ] **Step 1: Confirm the Prisma CLI resolves its config from `api/`**

```bash
cd api && npx prisma validate && cd ..
```

Expected: "The schema at prisma/schema.prisma is valid". `prisma.config.ts` uses relative paths, so it needs no edit — confirm rather than assume.

- [ ] **Step 2: Confirm migrations and the seed work**

```bash
npx supabase start
cd api && npx prisma migrate deploy && npx prisma db seed && cd ..
```

Expected: "No pending migrations to apply" (they are already applied to your dev database) and `seeded demo family <uuid>`. The seed needs `SUPABASE_SERVICE_ROLE_KEY` in `api/.env` — it moved there in Task 1 Step 3.

- [ ] **Step 3: Confirm `npm run dev` boots and serves**

```bash
npm run dev &
sleep 4
curl -s -w ' [%{http_code}]\n' localhost:3000/healthz
curl -s -w ' [%{http_code}]\n' localhost:3000/readyz
kill %1
```

Expected: `{"status":"ok",...} [200]` and `{"status":"ready","checks":{"database":"up"}} [200]`.

This is the step that proves `--env-file=.env` resolves: `npm run dev -w api` sets the working directory to `api/`, so it loads `api/.env`. If you get `Invalid environment` or `node: .env: not found`, the file did not move — go back to Task 1 Step 3.

- [ ] **Step 4: Commit only if you had to change something**

If Steps 1–3 all passed with no edits, there is nothing to commit — say so in your report and move on. If you fixed something:

```bash
git add -A
git commit -m "fix: restore the developer loop after the workspace move"
```

---

### Task 3: Make the Docker image workspace-aware

**Files:**

- Modify: `Dockerfile`
- Modify: `.dockerignore`

**Interfaces:**

- Consumes: the workspace layout from Task 1.
- Produces: an image that boots and serves `/readyz`. Task 5's README documents the run command.

- [ ] **Step 1: Rewrite the builder stage**

The build context stays the repo root. Replace the builder stage's copy-and-build sequence with:

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Manifests first — the root one declares the workspace, api's declares the
# backend's dependencies. Editing source then leaves `npm ci` cached.
COPY package.json package-lock.json ./
COPY api/package.json ./api/package.json
RUN npm ci

COPY api ./api
RUN npm run prisma:generate -w api
RUN npm run build -w api

# Drop devDependencies. With workspaces these are hoisted to the root
# node_modules, so the prune runs from the root and covers the whole tree.
RUN npm prune --omit=dev

# @prisma/client declares `prisma` (the CLI) as an optional peer, so the prune
# keeps it. Strip the ~40MB CLI explicitly. Task 1 confirmed full hoisting, so
# the CLI is at the root; the api/ path is kept only as a cheap safety net.
RUN rm -rf node_modules/prisma api/node_modules/prisma
```

- [ ] **Step 2: Rewrite the runtime stage**

```dockerfile
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/api/dist ./api/dist
COPY --chown=node:node package.json ./
COPY --chown=node:node api/package.json ./api/package.json

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" > /dev/null || exit 1

CMD ["node", "api/dist/src/server.js"]
```

There is deliberately **no** `COPY` of `api/node_modules`. Task 1 confirmed npm hoists every dependency to the root `node_modules`, so that directory does not exist and copying it would fail the build. If a future dependency ever forces a nested install (a version conflict between workspaces), this stage must gain that copy back — the symptom would be a container that builds and then exits with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Update `.dockerignore`**

Change `generated/` to `api/generated/`, and `test/` to `api/test/`. Add `web/` so slice 1's app never enters the backend's build context. Leave the rest.

- [ ] **Step 4: Build and — the part that matters — boot it**

```bash
docker build -t wellness-platform:ws .
npx supabase start
docker run -d --name wp-ws -p 3000:3000 \
  --add-host host.docker.internal:host-gateway \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres \
  -e DIRECT_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres \
  -e SUPABASE_URL=http://host.docker.internal:54321 \
  wellness-platform:ws
sleep 5
curl -s -w ' [%{http_code}]\n' localhost:3000/healthz
curl -s -w ' [%{http_code}]\n' localhost:3000/readyz
docker inspect --format '{{.State.Health.Status}}' wp-ws
```

Expected: both 200, health `healthy`. A build that succeeds and a container that exits is a failed task — read `docker logs wp-ws` and fix the path.

- [ ] **Step 5: Confirm the image is still lean**

```bash
docker run --rm wellness-platform:ws sh -c 'ls node_modules/prisma 2>/dev/null && echo "PRISMA CLI PRESENT — BAD" || echo "prisma CLI absent — good"'
docker run --rm wellness-platform:ws sh -c 'ls node_modules/@prisma/client >/dev/null && echo "@prisma/client present — good"'
docker images wellness-platform:ws --format '{{.Size}}'
```

Expected: CLI absent, `@prisma/client` present. Record the size and compare it to the pre-migration image if you noted it.

- [ ] **Step 6: Confirm Compose still resolves — it should need no edit**

`docker-compose.yml` uses `build: context: .`, and the context is still the
repo root, so the move should not touch it. Confirm rather than assume:

```bash
docker compose config -q && echo "compose valid"
DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres \
DIRECT_URL=postgresql://postgres:postgres@host.docker.internal:54322/postgres \
SUPABASE_URL=http://host.docker.internal:54321 \
docker compose up -d --build
sleep 6
curl -s -w ' [%{http_code}]\n' localhost:3000/readyz
docker compose down
```

Expected: `compose valid`, then `{"status":"ready",...} [200]`. If Compose needs
a change after all, make it here and say so in your report — the spec predicted
this file would need rewriting and being wrong about that is worth recording.

- [ ] **Step 7: Clean up and commit**

```bash
docker rm -f wp-ws 2>/dev/null || true
git add Dockerfile .dockerignore docker-compose.yml
git commit -m "build: make the Docker image workspace-aware"
```

---

### Task 4: Update CI

**Files:**

- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: the root delegate scripts from Task 1.
- Produces: a workflow that runs from the repo root using `-w api`.

- [ ] **Step 1: Update the `verify` job**

`npm ci` at the root already installs the workspace, so that step is unchanged. Change the Prisma step from `npx prisma generate` to:

```yaml
- name: Generate Prisma client
  run: npm run prisma:generate -w api
```

`npm run lint`, `npm run format:check`, `npm run typecheck` and `npm test` all stay as they are — the root delegates handle them. `format:check` genuinely runs at the root, which is correct: Prettier should see both workspaces.

- [ ] **Step 2: Update the `integration` job**

Change its `Generate Prisma client` step the same way. Then change the three Prisma CLI steps to run inside the workspace, because they invoke the CLI directly rather than through a script:

```yaml
- name: Check for migration drift
  working-directory: api
  run: |
    npx prisma migrate diff \
      --from-migrations prisma/migrations \
      --to-schema prisma/schema.prisma \
      --exit-code

- name: Apply migrations
  working-directory: api
  run: npx prisma migrate deploy

- name: Integration tests
  run: npm run test:integration -w api
```

Leave the `services:` block, the `env:` block and the `Create shadow database` step exactly as they are — they use absolute connection strings and are unaffected by the move.

- [ ] **Step 3: Run CI's exact commands locally**

You cannot run GitHub Actions here, so run precisely what each job runs, from the repo root:

```bash
npm ci
npm run prisma:generate -w api
npm run lint
npm run format:check
npm run typecheck
npm test
npm run test:db:up
( cd api && npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code ); echo "drift exit=$?"
( cd api && DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:54329/wellness_test npx prisma migrate deploy )
npm run test:integration -w api
```

Expected: every command exits 0, drift exit 0, unit 40, integration 23.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run backend jobs through the api workspace"
```

---

### Task 5: Documentation and the fresh-clone gate

**Files:**

- Modify: `README.md`
- Modify: `.prettierignore` if any path is now wrong

**Interfaces:**

- Consumes: everything above.
- Produces: a README a stranger can follow on the new layout.

- [ ] **Step 1: Re-check every command in the README**

The layout changed, so every command needs re-checking, not just editing. Specifically:

- The local-run block: `npm ci` and `npm run dev` still work from the root. `npx prisma migrate deploy` and `npx prisma db seed` now need `cd api` first, or the `-w api` delegates (`npm run prisma:generate -w api`, `npm run db:seed`).
- `cp .env.example .env` must become `cp .env.example api/.env` — `.env.example` stays at the root as the documented template, but the file the backend loads lives in `api/`.
- The `Layout` block must show the new tree: `api/` containing `src/`, `test/`, `prisma/`, and a note that `web/` arrives in slice 1.
- The npm-scripts table: mark which scripts live at the root and which delegate to `api`.
- The `docker run` command needs the same three `-e` variables Task 3 Step 4 used, including `SUPABASE_URL`.

- [ ] **Step 2: Add a short "Repository layout" section**

```markdown
## Repository layout

This is an npm workspaces monorepo.
```

wellness_platform/
package.json workspace root — shared infra scripts, Prettier
api/ the backend service (Express, Prisma, Jest)
src/ test/ prisma/
supabase/ local Supabase stack, shared by both workspaces
docker-compose.yml app container
docker-compose.test.yml disposable Postgres for integration tests

```

Backend commands run from the root and delegate — `npm test`, `npm run lint`,
`npm run typecheck` — or directly with `-w api`. Prisma CLI commands that are
not wrapped in a script need `cd api` first, because the CLI resolves
`prisma.config.ts` from the working directory.
```

- [ ] **Step 3: Verify from a genuinely fresh clone**

```bash
cd "$(mktemp -d)" && git clone /home/makima/wellness_platform fresh && cd fresh
npm ci
npm run prisma:generate -w api
cp .env.example api/.env
# add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY per the README
npx supabase start
( cd api && npx prisma migrate deploy && npx prisma db seed )
npm run dev &
sleep 4
curl -s -w ' [%{http_code}]\n' localhost:3000/readyz
kill %1
```

Expected: `{"status":"ready","checks":{"database":"up"}} [200]`.

Follow only what your README says. If a step is missing or wrong, that is a README bug — fix it in the real repo and start over from a fresh clone. Report how many bugs this exposed; the last three walkthroughs on this repo each found at least one, so zero is a result worth double-checking.

- [ ] **Step 4: Final verification and commit**

```bash
npm run lint && npm run format:check && npm run typecheck
npm test 2>&1 | grep -aE "Tests:"
npm run test:all 2>&1 | grep -aE "Tests:"
git add -A
git commit -m "docs: document the workspace layout"
```

Expected: unit 40, `test:all` 63 — the Task 1 Step 1 baseline, unchanged.

---

## Verification Summary

| Claim                                | Command                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------- |
| No behaviour changed                 | unit 40, integration 23, `test:all` 63 — same as the pre-migration baseline |
| Gates still clean                    | `npm run lint && npm run format:check && npm run typecheck`                 |
| The developer loop works             | Task 2 Step 3 — `npm run dev` serves `/readyz`                              |
| The image **boots**, not just builds | Task 3 Step 4 — container healthy, both endpoints 200                       |
| The image is still lean              | Task 3 Step 5 — Prisma CLI absent, `@prisma/client` present                 |
| CI's exact commands pass locally     | Task 4 Step 3                                                               |
| A stranger can follow the README     | Task 5 Step 3                                                               |
