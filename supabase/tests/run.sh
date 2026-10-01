#!/usr/bin/env bash
# Runs the schema's security tests on a throwaway local Postgres (16+).
# Usage: supabase/tests/run.sh
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
bin="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
bin="${bin:-$(dirname "$(command -v initdb)")}"
dir="$(mktemp -d)"
port=54329
as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }

cleanup() { as_pg "'$bin/pg_ctl' -D '$dir' -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$dir"; }
trap cleanup EXIT

[ "$(id -u)" = 0 ] && chown postgres "$dir"
as_pg "'$bin/initdb' -D '$dir' -U postgres --auth=trust" >/dev/null
as_pg "'$bin/pg_ctl' -D '$dir' -o '-p $port -k /tmp' -l '$dir/log' start -w" >/dev/null

psql=(psql -h /tmp -p "$port" -U postgres -v ON_ERROR_STOP=1 -q)
"${psql[@]}" -c 'create database crewpay'
"${psql[@]}" -d crewpay -f "$here/shim.sql"
"${psql[@]}" -d crewpay -f "$here/../migrations/0001_init.sql"
"${psql[@]}" -d crewpay -f "$here/../migrations/0002_live_actions.sql"
"${psql[@]}" -d crewpay -f "$here/rls.test.sql" 2>&1 | sed 's/^psql:[^:]*:[0-9]*: NOTICE:  /  /' | grep -v '^$'
"${psql[@]}" -d crewpay -f "$here/actions.test.sql" 2>&1 | sed 's/^psql:[^:]*:[0-9]*: NOTICE:  /  /' | grep -v '^$'
