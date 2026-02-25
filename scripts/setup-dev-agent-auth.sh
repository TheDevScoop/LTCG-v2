#!/usr/bin/env bash
# Create/update a local agent API key for dev-only auth bypass (no Privy login).
# Writes VITE_DEV_AGENT_API_KEY to apps/web-tanstack/.env.local

set -euo pipefail

AGENT_NAME="CodexDev"
SITE_URL="${LTCG_API_URL:-}"
ROTATE_KEY=false
PRIMARY_WEB_ENV="apps/web-tanstack/.env.local"

usage() {
  cat <<'EOF'
Usage: bash scripts/setup-dev-agent-auth.sh [options]

Options:
  --agent-name <name>  Agent display name used for /api/agent/register (default: CodexDev)
  --site-url <url>     Convex site URL (default: LTCG_API_URL from .env.local/env)
  --rotate-key         Ignore existing VITE_DEV_AGENT_API_KEY and issue a fresh key
  --help, -h           Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --agent-name)
      AGENT_NAME="${2:-}"
      shift 2
      ;;
    --site-url)
      SITE_URL="${2:-}"
      shift 2
      ;;
    --rotate-key)
      ROTATE_KEY=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [ ! -f "package.json" ] || [ ! -e ".git" ] || [ ! -f "apps/web-tanstack/package.json" ]; then
  echo "Run this script from the LTCG-v2 repository root."
  exit 1
fi

if [ -z "$SITE_URL" ] && [ -f ".env.local" ]; then
  SITE_URL="$(awk -F= '/^LTCG_API_URL=/{print $2}' .env.local | tail -n 1)"
fi

if [ -z "$SITE_URL" ]; then
  echo "Missing Convex site URL. Pass --site-url or set LTCG_API_URL in .env.local."
  exit 1
fi

if [ -z "$AGENT_NAME" ]; then
  echo "--agent-name cannot be empty."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required."
  exit 1
fi

existing_key=""
if [ "$ROTATE_KEY" = false ] && [ -f "$PRIMARY_WEB_ENV" ]; then
  existing_key="$(awk -F= '/^VITE_DEV_AGENT_API_KEY=/{print $2}' "$PRIMARY_WEB_ENV" | tail -n 1)"
fi

if [ "$ROTATE_KEY" = false ] && [ -n "$existing_key" ]; then
  if [ -n "$existing_key" ] && [ "${existing_key#ltcg_}" != "$existing_key" ]; then
    existing_status="$(
      curl -s -o /dev/null -w '%{http_code}' "${SITE_URL%/}/api/agent/me" \
        -H "Authorization: Bearer ${existing_key}" \
        -H "Content-Type: application/json" || true
    )"
    if [ "$existing_status" -ge 200 ] && [ "$existing_status" -lt 300 ]; then
      echo "Existing VITE_DEV_AGENT_API_KEY is valid; no rotation needed."
      echo "Open http://localhost:3334/?devAgent=1 after bun run dev:web"
      exit 0
    fi
  fi
fi

register_response="$(
  curl -sS -X POST "${SITE_URL%/}/api/agent/register" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"${AGENT_NAME}\"}" \
    -w $'\n%{http_code}'
)"

http_code="$(printf "%s" "$register_response" | tail -n 1)"
body="$(printf "%s" "$register_response" | sed '$d')"

if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
  echo "Agent registration failed (HTTP $http_code)."
  printf "%s\n" "$body"
  exit 1
fi

api_key="$(
  node -e '
    let payload = "";
    process.stdin.on("data", (chunk) => (payload += chunk));
    process.stdin.on("end", () => {
      try {
        const parsed = JSON.parse(payload);
        const key = typeof parsed.apiKey === "string" ? parsed.apiKey : "";
        if (!key.startsWith("ltcg_")) process.exit(2);
        process.stdout.write(key);
      } catch {
        process.exit(2);
      }
    });
  ' <<<"$body"
)" || {
  echo "Could not parse apiKey from /api/agent/register response."
  printf "%s\n" "$body"
  exit 1
}

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"

  mkdir -p "$(dirname "$file")"
  local tmp_file
  tmp_file="$(mktemp)"

  if [ -f "$file" ]; then
    awk -v k="$key" -v v="$value" '
      BEGIN { updated = 0 }
      $0 ~ "^" k "=" {
        print k "=" v
        updated = 1
        next
      }
      { print }
      END {
        if (updated == 0) print k "=" v
      }
    ' "$file" > "$tmp_file"
  else
    printf "%s=%s\n" "$key" "$value" > "$tmp_file"
  fi

  mv "$tmp_file" "$file"
}

upsert_env_var "$PRIMARY_WEB_ENV" "VITE_DEV_AGENT_API_KEY" "$api_key"

echo "Wrote VITE_DEV_AGENT_API_KEY to $PRIMARY_WEB_ENV"
echo ""
echo "Dev-only auth path:"
echo "  1) bun run dev:web"
echo "  2) open http://localhost:3334/?devAgent=1"
echo ""
echo "Security model:"
echo "  - Active only in Vite dev mode (import.meta.env.DEV)"
echo "  - Active only on localhost/127.0.0.1"
echo "  - Requires local env key (not committed)"
