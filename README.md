# Family Wellness Platform

TypeScript + Express service skeleton. Sprint 0 deliberately contains **zero product logic** —
the only route is a health check. The point is that the environment, linting, tests, container
build, and CI are all in place before any feature depends on them.

## Prerequisites

- **Node.js 22+** and npm 10+ (for the local path)
- **Docker** with Compose v2 (for the container path)

You need only one of the two.

## Run it locally

```bash
git clone <repo-url>
cd wellness_platform
npm ci
npm run dev
```

Then, in another terminal:

```bash
curl localhost:3000/healthz
```

Expected:

```json
{ "status": "ok", "uptime": 0 }
```

To use a different port: `PORT=4000 npm run dev`, then curl `localhost:4000/healthz`.

## Run it with Docker Compose

Boots the app plus a Postgres container:

```bash
docker compose up --build
```

Then:

```bash
curl localhost:3000/healthz
```

Compose reads `.env` if present and otherwise falls back to the dev defaults baked into
`docker-compose.yml`, so it boots with no setup. To customise credentials or ports:

```bash
cp .env.example .env   # then edit
```

Shut down with `docker compose down` (add `-v` to also drop the Postgres volume).

> Postgres is **not used by any code yet**. It is running so that Sprint 1 can connect to it
> without changing the topology.

## Run the container on its own

```bash
docker build -t wellness-platform .
docker run --rm -p 3000:3000 wellness-platform
curl localhost:3000/healthz
```

## npm scripts

| Script                 | What it does                                       |
| ---------------------- | -------------------------------------------------- |
| `npm run dev`          | Watch mode via `tsx`, no build step                |
| `npm run build`        | Compiles `src/` to `dist/` (`tsconfig.build.json`) |
| `npm start`            | Runs the compiled `dist/server.js`                 |
| `npm test`             | Jest + Supertest against `app.ts`                  |
| `npm run typecheck`    | `tsc --noEmit` over `src/` **and** `test/`         |
| `npm run lint`         | ESLint, type-aware; fails on warnings              |
| `npm run lint:fix`     | ESLint with `--fix`                                |
| `npm run format`       | Prettier, writes changes                           |
| `npm run format:check` | Prettier, check only — fails instead of rewriting  |

## Layout

```
src/
  app.ts            Express app: middleware + routes. No .listen() — keeps it testable.
  server.ts         Entrypoint: reads PORT, calls .listen().
  routes/
    health.ts       GET /healthz
test/
  health.test.ts    Supertest against app.ts directly, so no port is bound.
```

`app.ts` and `server.ts` are split on purpose: tests import the app and never bind a port, which
avoids "address already in use" and keeps the suite fast.

## Configuration

All config comes from environment variables — see `.env.example` for the full list. `PORT` is the
only one the code reads today, and it falls back to `3000`.

## CI

`.github/workflows/ci.yml` runs on every pull request to `main`: `npm ci` → lint → format check →
`tsc --noEmit` → test. A lint error, formatting drift, type error, or failing test blocks the PR.
