#!/usr/bin/env bash
#
# Pings the API so Render's free instance never sits idle for the 15 minutes
# that trigger a spin-down. Meant to be called by an external scheduler every
# 14 minutes; the "Keep it awake" section of README.md has the schedule config
# and explains why the scheduler cannot live in this repo.
#
# It hits /readyz rather than /healthz deliberately. /readyz opens a database
# connection, so one ping warms the Prisma pool AND counts as activity against
# the free Supabase project's 7-day auto-pause. /healthz would wake the
# container and still leave the first real visitor paying to open the
# connection — half a fix.
#
# Exits non-zero with a distinct code per failure so the scheduler's
# notification tells you which thing broke:
#   1  misconfigured (no URL given)
#   2  unreachable — DNS, TLS, connection refused, or slower than the timeout
#   3  reached, but the database is down (503 from /readyz)
#   4  reached, but answered something nobody expected
set -euo pipefail

say()  { printf '\033[1;32m▸\033[0m %s\n' "$1"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$1" >&2; }
die()  { printf '\033[1;31m✗\033[0m %s\n' "$2" >&2; exit "$1"; }

# --- 1. Target -------------------------------------------------------------
# Positional arg wins so the script can be pointed at a staging URL by hand
# without exporting anything.
BASE_URL="${1:-${API_BASE_URL:-}}"
[ -n "$BASE_URL" ] ||
  die 1 "No URL. Pass one (scripts/keep-warm.sh https://wellness-api-u1uo.onrender.com) or set API_BASE_URL."

# A trailing slash would produce '//readyz', which Express does not route.
BASE_URL="${BASE_URL%/}"
TARGET="${BASE_URL}/readyz"

# --- 2. Timeouts -----------------------------------------------------------
# A cold start on Render's free instance takes tens of seconds (15.4s measured
# on this one, and it can be worse under load). A short timeout would fail
# precisely on the ping that found the service asleep and had real work to do,
# so this is deliberately generous — a slow success is the whole point.
CONNECT_TIMEOUT=15
MAX_TIME=90

# Above this, the ping is treated as having woken a sleeping instance rather
# than found a live one. Measured against the deployed service: warm responses
# land at 0.2-0.6s, a wake-up took 15.4s. 5s sits in the empty gap between
# those clusters, with room for a slow-but-warm reply.
COLD_START_THRESHOLD=5

# --- 3. Ping ---------------------------------------------------------------
# --write-out appends a machine-readable trailer after the body. The body is
# kept because /readyz names which check failed, which is the useful half of a
# 503. No --fail: it collapses every HTTP error into exit 22 and discards the
# body, losing exactly that detail.
curl_status=0
response="$(
  curl --silent --show-error \
    --connect-timeout "$CONNECT_TIMEOUT" \
    --max-time "$MAX_TIME" \
    --write-out '\n%{http_code} %{time_total}' \
    "$TARGET" 2>&1
)" || curl_status=$?

if [ "$curl_status" -ne 0 ]; then
  # curl still emits the --write-out trailer on failure, where it is all zeroes
  # and pure noise in an alert. Drop it and keep curl's own message.
  die 2 "Could not reach ${TARGET} (curl exit ${curl_status}): $(printf '%s' "$response" | sed '$d')"
fi

trailer="$(printf '%s' "$response" | tail -n 1)"
body="$(printf '%s' "$response" | sed '$d')"
http_code="${trailer%% *}"
elapsed="${trailer##* }"

# --- 4. Verdict ------------------------------------------------------------
case "$http_code" in
  200)
    say "ready in $(printf '%.2f' "$elapsed")s — ${body}"
    # Anything this slow means the ping arrived after a spin-down, so the
    # schedule is not actually holding the instance open. A warning, not a
    # failure: the service is up, the cadence is what is wrong.
    #
    # Written as if/fi rather than `awk && warn` because awk exits 1 on the
    # healthy path, and as the branch's last command that became the script's
    # exit status — reporting every successful ping as a failure.
    if awk -v t="$elapsed" -v limit="$COLD_START_THRESHOLD" 'BEGIN { exit !(t > limit) }'; then
      warn "That was a cold start — the schedule is not holding the instance open. See \"Keep it awake\" in README.md."
    fi
    exit 0
    ;;
  503)
    # Observed on the deployed service: the first request after a spin-down
    # gets 503 from /readyz while the Postgres connection is still being
    # opened, and the database is fine — reachable from elsewhere in the same
    # moment. Treating that as an outage pages somebody for a healthy service,
    # which trains them to ignore this alert.
    #
    # So the 503 is confirmed rather than believed. The API retries its own
    # ping now, but this second call also gives the instance the wall-clock it
    # needs, and it costs one extra request on the rare occasion it fires.
    warn "Not ready on the first ping. Confirming before calling it a failure…"
    sleep 5
    confirm="$(
      curl --silent --show-error \
        --connect-timeout "$CONNECT_TIMEOUT" \
        --max-time "$MAX_TIME" \
        --write-out '\n%{http_code}' \
        "$TARGET" 2>&1
    )" || die 2 "Could not reach ${TARGET} on the retry: $(printf '%s' "$confirm" | sed '$d')"

    confirm_code="$(printf '%s' "$confirm" | tail -n 1)"
    confirm_body="$(printf '%s' "$confirm" | sed '$d')"

    if [ "$confirm_code" = "200" ]; then
      say "ready on the second ping — the first was a cold start, not an outage"
      exit 0
    fi

    die 3 "Instance is up but not ready on two consecutive pings — database is down. Response: ${confirm_body}"
    ;;
  *)
    die 4 "Unexpected HTTP ${http_code} from ${TARGET}. Response: ${body}"
    ;;
esac
