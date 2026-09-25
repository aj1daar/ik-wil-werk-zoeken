#!/usr/bin/env bash
# Dumps the IWWZ Postgres database to a gzipped .sql file and prunes old dumps.
#
# Runs on the server that holds the database credentials — the deploy workflow
# copies it over and calls it right before every backend deploy, so a migration
# that goes wrong always has a dump from minutes earlier to restore from.
#
# The connection details come from DATABASE_URL in the environment file (the same
# value the API uses), so nothing has to be configured twice. Both the Npgsql
# keyword form ("Host=...;Database=...") and the URI form
# ("postgres://user:pass@host:port/db") are understood.
#
# A copy also goes to Cloudflare R2 when /var/www/iwwz/backup.env holds R2
# credentials. That file is deliberately not the deploy env file: the workflow
# rewrites /var/www/iwwz/.env on every deploy and would drop anything added here.
#
#   ./backup-db.sh [--env-file PATH] [--out-dir DIR] [--keep N]
#                  [--r2-env-file PATH] [--no-remote] [--require-remote]
#
# Defaults: --env-file /var/www/iwwz/.env  --out-dir /var/www/iwwz/backups  --keep 10
#           --r2-env-file /var/www/iwwz/backup.env
#
# An upload that fails is a warning, so a Cloudflare outage cannot fail a deploy.
# --require-remote turns it into an error, which is what the nightly cron uses:
# there, nobody is watching and a silent failure is the whole problem.
#
# Restore a dump with:
#   gunzip -c iwwz-20260906-120000.sql.gz | psql "$DATABASE_URL_AS_URI"
#
# Fetch one from R2 with:
#   rclone copy r2:$R2_BUCKET/db/iwwz-20260906-120000.sql.gz .

set -euo pipefail

ENV_FILE="/var/www/iwwz/.env"
OUT_DIR="/var/www/iwwz/backups"
KEEP=10
R2_ENV_FILE="/var/www/iwwz/backup.env"
REMOTE=1
REQUIRE_REMOTE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --out-dir)  OUT_DIR="$2";  shift 2 ;;
    --keep)     KEEP="$2";     shift 2 ;;
    --r2-env-file)    R2_ENV_FILE="$2"; shift 2 ;;
    --no-remote)      REMOTE=0;         shift ;;
    --require-remote) REQUIRE_REMOTE=1; shift ;;
    -h|--help)  sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "backup-db: unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$KEEP" in
  ''|*[!0-9]*) echo "backup-db: --keep must be a number, got '$KEEP'" >&2; exit 2 ;;
esac

# ── connection details ───────────────────────────────────────────────────────

if [ -n "${DATABASE_URL:-}" ]; then
  conn="$DATABASE_URL"
elif [ -f "$ENV_FILE" ]; then
  # Read the line ourselves rather than sourcing the file: it holds every secret
  # the app has, and none of the others belong in this shell.
  conn="$(sed -n 's/^DATABASE_URL=//p' "$ENV_FILE" | head -n 1)"
else
  echo "backup-db: no DATABASE_URL in the environment and no env file at $ENV_FILE" >&2
  exit 1
fi

if [ -z "${conn:-}" ]; then
  echo "backup-db: DATABASE_URL is empty" >&2
  exit 1
fi

conn="${conn%\"}"; conn="${conn#\"}"
conn="${conn%\'}"; conn="${conn#\'}"

db_host=""; db_port=""; db_name=""; db_user=""; db_pass=""

case "$conn" in
  postgres://*|postgresql://*)
    rest="${conn#*://}"
    if [ "${rest%@*}" != "$rest" ]; then
      creds="${rest%%@*}"
      rest="${rest#*@}"
      db_user="${creds%%:*}"
      [ "${creds#*:}" != "$creds" ] && db_pass="${creds#*:}"
    fi
    hostport="${rest%%/*}"
    db_name="${rest#*/}"
    db_name="${db_name%%\?*}"
    db_host="${hostport%%:*}"
    [ "${hostport#*:}" != "$hostport" ] && db_port="${hostport#*:}"
    ;;
  *)
    # Npgsql keyword form; keys are case-insensitive.
    saved_ifs="$IFS"
    IFS=';'
    for pair in $conn; do
      key="${pair%%=*}"
      value="${pair#*=}"
      [ "$key" = "$pair" ] && continue
      key="$(printf '%s' "$key" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')"
      case "$key" in
        host|server)              db_host="$value" ;;
        port)                     db_port="$value" ;;
        database|"initial catalog") db_name="$value" ;;
        username|"user id"|userid|uid|user) db_user="$value" ;;
        password|pwd)             db_pass="$value" ;;
      esac
    done
    IFS="$saved_ifs"
    ;;
esac

db_host="${db_host:-localhost}"
db_port="${db_port:-5432}"

if [ -z "$db_name" ] || [ -z "$db_user" ]; then
  echo "backup-db: could not read the database name and user out of DATABASE_URL" >&2
  exit 1
fi

# ── dump ─────────────────────────────────────────────────────────────────────

mkdir -p "$OUT_DIR"
stamp="$(date -u +%Y%m%d-%H%M%S)"
target="$OUT_DIR/iwwz-$stamp.sql.gz"
partial="$target.partial"

cleanup() { rm -f "$partial"; }
trap cleanup EXIT

if command -v pg_dump >/dev/null 2>&1; then
  echo "backup-db: dumping $db_name from $db_host:$db_port with the local pg_dump"
  PGPASSWORD="$db_pass" pg_dump \
    --host="$db_host" --port="$db_port" --username="$db_user" \
    --no-owner --no-privileges --format=plain "$db_name" | gzip -9 > "$partial"
else
  # No client on the host: borrow the one inside the running Postgres container.
  container="${PG_CONTAINER:-}"
  if [ -z "$container" ] && command -v docker >/dev/null 2>&1; then
    container="$(docker ps --filter "ancestor=postgres" --format '{{.Names}}' | head -n 1)"
    [ -z "$container" ] && container="$(docker ps --format '{{.Names}} {{.Image}}' \
      | awk '$2 ~ /postgres/ { print $1; exit }')"
  fi
  if [ -z "$container" ]; then
    echo "backup-db: no pg_dump on this host and no Postgres container found — install postgresql-client or set PG_CONTAINER" >&2
    exit 1
  fi
  echo "backup-db: dumping $db_name with pg_dump inside container $container"
  docker exec -e PGPASSWORD="$db_pass" "$container" pg_dump \
    --host=localhost --port=5432 --username="$db_user" \
    --no-owner --no-privileges --format=plain "$db_name" | gzip -9 > "$partial"
fi

# A dump that failed halfway still leaves a file behind, so check it before it
# replaces anything and before old dumps are pruned on the strength of it.
if ! gzip -t "$partial" 2>/dev/null; then
  echo "backup-db: the dump is not a readable gzip file — keeping the old backups and failing" >&2
  exit 1
fi
# Read the header into a variable rather than piping into grep: grep -q closes the
# pipe on the first match, which fails the whole pipeline under `set -o pipefail`.
header="$(gunzip -c "$partial" 2>/dev/null | head -n 40 || true)"
case "$header" in
  *"PostgreSQL database dump"*) ;;
  *)
    echo "backup-db: the dump does not look like a pg_dump output — keeping the old backups and failing" >&2
    exit 1
    ;;
esac

mv "$partial" "$target"
trap - EXIT

size="$(du -h "$target" | cut -f1)"
echo "backup-db: wrote $target ($size)"

# ── offsite copy ─────────────────────────────────────────────────────────────

# A backup on the same disk as the database survives a bad migration but not a
# lost server, so the dump goes to Cloudflare R2 as well.
remote_failed=0

if [ "$REMOTE" -eq 1 ] && [ -f "$R2_ENV_FILE" ]; then
  # Same reasoning as the main env file: read the four values, leave the rest.
  r2_account="$(sed -n 's/^R2_ACCOUNT_ID=//p'        "$R2_ENV_FILE" | head -n 1)"
  r2_key="$(sed -n 's/^R2_ACCESS_KEY_ID=//p'         "$R2_ENV_FILE" | head -n 1)"
  r2_secret="$(sed -n 's/^R2_SECRET_ACCESS_KEY=//p'  "$R2_ENV_FILE" | head -n 1)"
  r2_bucket="$(sed -n 's/^R2_BUCKET=//p'             "$R2_ENV_FILE" | head -n 1)"

  if [ -z "$r2_account" ] || [ -z "$r2_key" ] || [ -z "$r2_secret" ] || [ -z "$r2_bucket" ]; then
    echo "backup-db: $R2_ENV_FILE is missing one of R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET" >&2
    remote_failed=1
  elif ! command -v rclone >/dev/null 2>&1; then
    echo "backup-db: rclone is not installed, cannot copy the dump offsite" >&2
    remote_failed=1
  else
    # Configured through the environment rather than a config file, so the
    # secrets exist only for the length of this command and never land on disk
    # in a second place.
    echo "backup-db: uploading $(basename "$target") to r2:$r2_bucket/db/"
    if RCLONE_CONFIG_R2_TYPE=s3        RCLONE_CONFIG_R2_PROVIDER=Cloudflare        RCLONE_CONFIG_R2_ACCESS_KEY_ID="$r2_key"        RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$r2_secret"        RCLONE_CONFIG_R2_ENDPOINT="https://$r2_account.r2.cloudflarestorage.com"        RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true        rclone copy --s3-no-check-bucket --retries 3 --low-level-retries 3          "$target" "r2:$r2_bucket/db/"
    then
      echo "backup-db: uploaded to r2:$r2_bucket/db/$(basename "$target")"
    else
      echo "backup-db: the upload to R2 failed" >&2
      remote_failed=1
    fi
  fi
elif [ "$REMOTE" -eq 1 ]; then
  echo "backup-db: no $R2_ENV_FILE, keeping this dump on the server only"
  [ "$REQUIRE_REMOTE" -eq 1 ] && remote_failed=1
fi

# ── prune ────────────────────────────────────────────────────────────────────

if [ "$KEEP" -gt 0 ]; then
  # Names are timestamped, so a plain reverse sort is newest-first.
  ls -1 "$OUT_DIR"/iwwz-*.sql.gz 2>/dev/null | sort -r | tail -n "+$((KEEP + 1))" | while read -r old; do
    echo "backup-db: pruning $old"
    rm -f "$old"
  done
fi

# The local dump is already written and verified by this point, so a failed
# upload never throws away a good backup. It only decides the exit status.
if [ "$REQUIRE_REMOTE" -eq 1 ] && [ "$remote_failed" -eq 1 ]; then
  echo "backup-db: no offsite copy was made and --require-remote was given" >&2
  exit 1
fi
