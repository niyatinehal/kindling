#!/usr/bin/env bash
#
# The one command. Every step below is a no-op when it is already satisfied,
# so this is both the fresh-clone command and the everyday one — there is no
# second command with different preconditions to remember.
#
# It deliberately does NOT seed: `prisma db seed` creates real Supabase auth
# accounts and is not verified idempotent, so it stays `npm run db:seed`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_PORT=3000
WEB_PORT=3001

say() { printf '\033[1;32m▸\033[0m %s\n' "$1"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$1" >&2; exit 1; }

# Bash's /dev/tcp is used rather than lsof/ss/netstat: those differ across
# Linux and macOS and are not all installed by default.
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1; }

# --- 1. Docker -------------------------------------------------------------
docker info >/dev/null 2>&1 ||
  die "Docker is not running. Start Docker Desktop (or: sudo systemctl start docker) and re-run."

# --- 2. Ports --------------------------------------------------------------
# Checked before anything is started. Without this the API dies on EADDRINUSE
# and Next silently drifts to 3002, leaving a working app at an address the
# user was never told about.
for port in "$API_PORT" "$WEB_PORT"; do
  port_busy "$port" &&
    die "Port $port is already in use. Find it with 'lsof -i :$port', stop it, and re-run."
done

# --- 3. Supabase -----------------------------------------------------------
db_container() { docker ps --filter "name=supabase_db_" --format '{{.Names}}' | head -1; }

if [ -z "$(db_container)" ]; then
  say "Starting Supabase (the first run pulls images and can take a few minutes)…"
  npx supabase start
else
  say "Supabase is already running."
fi

# Waits for Postgres to ANSWER, not merely for the port to be open or for
# `supabase start` to have returned. Migrations run in the next step and fail
# confusingly against a database that is still coming up.
say "Waiting for Postgres…"
for _ in $(seq 1 90); do
  container="$(db_container)"
  if [ -n "$container" ] && docker exec "$container" pg_isready -U postgres -q 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done
[ "${ready:-0}" = "1" ] || die "Postgres did not become ready within 90s. Try: npx supabase stop && npm run dev"

# --- 4. Env files ----------------------------------------------------------
if [ ! -f api/.env ]; then
  say "Creating api/.env from .env.example"
  cp .env.example api/.env
fi

if [ ! -f web/.env.local ]; then
  say "Creating web/.env.local"
  cat > web/.env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
API_BASE_URL=http://127.0.0.1:${API_PORT}
EOF
fi

# --- 5. Keys ---------------------------------------------------------------
# Copying these out of `supabase status` by hand is the step most likely to
# break a fresh clone. Both target files are gitignored (.gitignore:6-7).
read_key() {
  printf '%s' "$1" | node -e '
    let raw = "";
    process.stdin.on("data", (d) => (raw += d)).on("end", () => {
      const key = process.argv[1];
      const value = JSON.parse(raw)[key];
      if (typeof value !== "string" || value === "") process.exit(1);
      process.stdout.write(value);
    });
  ' "$2"
}

# Only rewrites a key that is absent or empty, so a hand-edited value is never
# clobbered. The old line is filtered out and a new one appended rather than
# sed-ed: these values are JWTs full of . / - and _, every one a quoting hazard.
set_env_var() {
  local file="$1" key="$2" value="$3"
  grep -qE "^${key}=." "$file" && return 0
  grep -vE "^#? *${key}=" "$file" > "${file}.tmp" && mv "${file}.tmp" "$file"
  printf '%s=%s\n' "$key" "$value" >> "$file"
  say "Wrote ${key} into ${file}"
}

status_json="$(npx supabase status -o json)"
anon_key="$(read_key "$status_json" ANON_KEY)" ||
  die "Could not read ANON_KEY from 'supabase status -o json'. The CLI output format may have changed."
service_key="$(read_key "$status_json" SERVICE_ROLE_KEY)" ||
  die "Could not read SERVICE_ROLE_KEY from 'supabase status -o json'. The CLI output format may have changed."

set_env_var web/.env.local NEXT_PUBLIC_SUPABASE_ANON_KEY "$anon_key"
set_env_var api/.env SUPABASE_SERVICE_ROLE_KEY "$service_key"

# --- 6. Prisma client ------------------------------------------------------
if [ ! -d api/generated/prisma ]; then
  say "Generating the Prisma client…"
  npm run prisma:generate -w api
fi

# --- 7. Migrations ---------------------------------------------------------
say "Applying migrations…"
( cd api && npx prisma migrate deploy )

# --- 8. Run ----------------------------------------------------------------
say "API  → http://localhost:${API_PORT}"
say "Web  → http://localhost:${WEB_PORT}"
say "Supabase Studio → http://127.0.0.1:54323"
echo

# --kill-others: if the API dies at boot, a web server left running alone
# serves a site whose every call 502s. Failing together is louder and truer.
exec npx concurrently \
  --names "api,web" \
  --prefix-colors "green,cyan" \
  --kill-others \
  "npm run dev:api" \
  "npm run dev:web"
