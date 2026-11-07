#!/usr/bin/env bash
# Starts a local Supabase API (Auth + PostgREST + gateway) on top of a running
# Postgres, applies the app's migrations, and writes the test settings to
# tests/stack/.env.test. Used by CI and for running the API tests locally.
#
#   PGURL   superuser connection to an empty Postgres (default below)
#   Usage:  bash tests/stack/start.sh && set -a && . tests/stack/.env.test && set +a && npm run test:api
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PGURL="${PGURL:-postgres://postgres@127.0.0.1:54322/postgres}"
BIN="${STACK_BIN:-$HERE/.bin}"
POSTGREST_VERSION=12.2.12
AUTH_VERSION=2.177.0
JWT_SECRET="local-test-jwt-secret-at-least-32-characters-long"

PGHOSTPORT="$(echo "$PGURL" | sed -E 's#^postgres(ql)?://[^@]*@([^/]+)/.*#\2#')"
mkdir -p "$BIN" "$HERE/logs"

# 1. Servers (downloaded once, then cached)
if [ ! -x "$BIN/postgrest" ]; then
  curl -fsSL "https://github.com/PostgREST/postgrest/releases/download/v${POSTGREST_VERSION}/postgrest-v${POSTGREST_VERSION}-linux-static-x86-64.tar.xz" | tar -xJ -C "$BIN"
fi
if [ ! -x "$BIN/auth" ]; then
  curl -fsSL "https://github.com/supabase/auth/releases/download/v${AUTH_VERSION}/auth-v${AUTH_VERSION}-x86.tar.gz" | tar -xz -C "$BIN"
fi

# 2. Supabase roles and schemas
psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$HERE/roles.sql"

# 3. Auth (runs its own migrations, creating the auth schema tables)
(
  export GOTRUE_DB_DRIVER=postgres
  export DATABASE_URL="postgres://supabase_auth_admin:local-test@${PGHOSTPORT}/postgres?sslmode=disable&search_path=auth"
  export GOTRUE_JWT_SECRET="$JWT_SECRET" GOTRUE_JWT_EXP=3600 GOTRUE_JWT_AUD=authenticated
  export GOTRUE_JWT_ADMIN_ROLES=service_role GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
  export GOTRUE_API_HOST=127.0.0.1 PORT=9999
  export API_EXTERNAL_URL=http://127.0.0.1:54321/auth/v1 GOTRUE_SITE_URL=http://127.0.0.1:3000
  export GOTRUE_DISABLE_SIGNUP=false GOTRUE_EXTERNAL_EMAIL_ENABLED=true GOTRUE_MAILER_AUTOCONFIRM=true
  export GOTRUE_DB_MIGRATIONS_PATH="$BIN/migrations" GOTRUE_LOG_LEVEL=warn
  nohup "$BIN/auth" > "$HERE/logs/auth.log" 2>&1 &
)
for i in $(seq 1 60); do curl -fs http://127.0.0.1:9999/health >/dev/null && break; sleep 1; done
curl -fs http://127.0.0.1:9999/health >/dev/null || { echo "Auth didn't start:"; tail -20 "$HERE/logs/auth.log"; exit 1; }
psql "$PGURL" -q -c "grant execute on all functions in schema auth to anon, authenticated, service_role;"

# 4. The app's migrations, in order
for f in "$ROOT"/supabase/migrations/*.sql; do
  psql "$PGURL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
  echo "applied $(basename "$f")"
done

# 5. PostgREST and the gateway
cat > "$HERE/logs/postgrest.conf" <<EOF
db-uri = "postgres://authenticator:local-test@${PGHOSTPORT}/postgres"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "${JWT_SECRET}"
server-host = "127.0.0.1"
server-port = 54330
log-level = "warn"
EOF
nohup "$BIN/postgrest" "$HERE/logs/postgrest.conf" > "$HERE/logs/postgrest.log" 2>&1 &
nohup node "$HERE/gateway.mjs" > "$HERE/logs/gateway.log" 2>&1 &

# 6. API keys signed with the local secret, written for the tests
node -e '
const c = require("crypto"), secret = process.argv[1];
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (p) => { const h = b({ alg: "HS256", typ: "JWT" }), q = b(p); return `${h}.${q}.${c.createHmac("sha256", secret).update(`${h}.${q}`).digest("base64url")}`; };
const exp = Math.floor(Date.now() / 1000) + 86400;
process.stdout.write([
  "TEST_SUPABASE_URL=http://127.0.0.1:54321",
  `TEST_SUPABASE_ANON_KEY=${sign({ role: "anon", iss: "supabase", exp })}`,
  `TEST_SUPABASE_SERVICE_ROLE_KEY=${sign({ role: "service_role", iss: "supabase", exp })}`,
].join("\n") + "\n");' "$JWT_SECRET" > "$HERE/.env.test"

for i in $(seq 1 30); do curl -fs http://127.0.0.1:54321/rest/v1/ -H "apikey: x" >/dev/null 2>&1 && break; sleep 1; done
echo "Local Supabase API ready at http://127.0.0.1:54321 (settings in tests/stack/.env.test)"
