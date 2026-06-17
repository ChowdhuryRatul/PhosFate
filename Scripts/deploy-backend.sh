#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/chowdhurylab01/Desktop/phosfate-backend/PhosFate}"
BACKEND_DIR="${BACKEND_DIR:-$APP_DIR/backend}"
LOCK_FILE="${LOCK_FILE:-/tmp/phosfate-backend-deploy.lock}"
PUBLIC_API_URL="${PUBLIC_API_URL:-https://phosfate-api.structf.studio}"
PM2_APP="${PM2_APP:-phosfate-runtime}"

RSYNC="${RSYNC:-/usr/bin/rsync}"
PM2="${PM2:-/home/chowdhurylab01/.local/bin/pm2}"

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

wait_for_url() {
  local url="$1"
  local output="$2"
  local attempts="${3:-30}"
  local delay="${4:-2}"

  for attempt in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >"$output"; then
      return 0
    fi
    if [ "$attempt" -lt "$attempts" ]; then
      sleep "$delay"
    fi
  done

  echo "Timed out waiting for $url" >&2
  return 1
}

exec 9>"$LOCK_FILE"
flock -n 9 || {
  echo "Another PhosFate backend deploy is already running."
  exit 1
}

echo ">>> Deploying PhosFate backend from $SOURCE_DIR"
echo ">>> Production backend dir: $BACKEND_DIR"

test -x "$RSYNC"
test -x "$PM2"
test -d "$SOURCE_DIR/backend"
mkdir -p "$BACKEND_DIR"

if [ -f "$BACKEND_DIR/server.js" ]; then
  cp "$BACKEND_DIR/server.js" "$BACKEND_DIR/server.js.bak-github-actions-$(date +%Y%m%d-%H%M%S)"
fi

echo ">>> Syncing backend source"
"$RSYNC" -a \
  "$SOURCE_DIR/backend/server.js" \
  "$SOURCE_DIR/backend/package.json" \
  "$SOURCE_DIR/backend/package-lock.json" \
  "$SOURCE_DIR/backend/phosfate_runner.py" \
  "$SOURCE_DIR/backend/requirements-phosfate.txt" \
  "$BACKEND_DIR"/

echo ">>> Installing Node dependencies"
cd "$BACKEND_DIR"
npm ci

echo ">>> Checking runtime syntax"
node --check server.js
python3 -m py_compile phosfate_runner.py

echo ">>> Restarting PM2 app"
"$PM2" restart "$PM2_APP" --update-env

echo ">>> Verifying local API"
wait_for_url "http://127.0.0.1:3001/api/health" /tmp/phosfate-health.json
wait_for_url "http://127.0.0.1:3001/api/binding-sites?limit=25&offset=0" /tmp/phosfate-binding-sites.json
node - <<'NODE'
const fs = require("fs");
const data = JSON.parse(fs.readFileSync("/tmp/phosfate-binding-sites.json", "utf8"));
if (!Number.isFinite(data.totalSites) || data.totalSites <= 0) {
  throw new Error("binding-sites totalSites is missing or zero");
}
if (!Array.isArray(data.sites) || data.sites.length === 0 || data.sites.length > 25) {
  throw new Error("binding-sites did not return a compact first page");
}
console.log(`Binding site page check passed: ${data.sites.length}/${data.totalSites}`);
NODE

echo ">>> Verifying public Cloudflare route"
wait_for_url "$PUBLIC_API_URL/api/binding-sites?limit=25&offset=0" /tmp/phosfate-public-binding-sites.json

echo ">>> PhosFate backend deploy complete"
