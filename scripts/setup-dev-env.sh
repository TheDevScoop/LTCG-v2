#!/usr/bin/env bash
# Bootstrap local LTCG-v2 dev environment:
# - Ensures Bun exists (installs if needed)
# - Installs dependencies from lockfile
# - Verifies Convex CLI availability
# - Writes local Convex env values for root + apps/web-tanstack

set -euo pipefail

DEPLOYMENT="${CONVEX_DEPLOYMENT:-}"
CONVEX_CLOUD_URL="${VITE_CONVEX_URL:-}"
CONVEX_SITE_URL="${LTCG_API_URL:-}"

SKIP_BUN_INSTALL=false
SKIP_INSTALL=false
SKIP_CONVEX_CHECK=false
SKIP_WORKSPACE_BUILD=false

usage() {
  cat <<'EOF'
Usage: bash scripts/setup-dev-env.sh [options]

Options:
  --deployment <name>      Convex deployment slug (example: scintillating-mongoose-458)
  --cloud-url <url>        Convex cloud URL (example: https://<deployment>.convex.cloud)
  --site-url <url>         Convex HTTP Actions URL (example: https://<deployment>.convex.site)
  --skip-bun-install       Do not auto-install Bun if missing
  --skip-install           Skip `bun install --frozen-lockfile`
  --skip-convex-check      Skip Convex CLI + auth checks
  --skip-workspace-build   Skip building Convex component workspace packages
  --help, -h               Show this help
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --deployment)
      DEPLOYMENT="${2:-}"
      shift 2
      ;;
    --cloud-url)
      CONVEX_CLOUD_URL="${2:-}"
      shift 2
      ;;
    --site-url)
      CONVEX_SITE_URL="${2:-}"
      shift 2
      ;;
    --skip-bun-install)
      SKIP_BUN_INSTALL=true
      shift
      ;;
    --skip-install)
      SKIP_INSTALL=true
      shift
      ;;
    --skip-convex-check)
      SKIP_CONVEX_CHECK=true
      shift
      ;;
    --skip-workspace-build)
      SKIP_WORKSPACE_BUILD=true
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

ensure_bun() {
  if command -v bun >/dev/null 2>&1; then
    return
  fi

  if [ "$SKIP_BUN_INSTALL" = true ]; then
    echo "Bun is required but missing and --skip-bun-install was provided."
    exit 1
  fi

  echo "Bun not found. Installing via https://bun.sh/install ..."
  curl -fsSL https://bun.sh/install | bash

  export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
  export PATH="$BUN_INSTALL/bin:$PATH"

  if ! command -v bun >/dev/null 2>&1; then
    echo "Bun installation succeeded but bun is still not on PATH."
    echo "Open a new shell, or run: export PATH=\"\$HOME/.bun/bin:\$PATH\""
    exit 1
  fi
}

ensure_dependencies() {
  if [ "$SKIP_INSTALL" = true ]; then
    echo "Skipping dependency install (--skip-install)."
    return
  fi

  ensure_bun
  echo "Installing dependencies with lockfile..."
  bun install --frozen-lockfile
}

build_workspace_components() {
  if [ "$SKIP_WORKSPACE_BUILD" = true ]; then
    echo "Skipping workspace package builds (--skip-workspace-build)."
    return
  fi

  ensure_bun
  echo "Building workspace packages required by Convex components..."
  bun run --filter @lunchtable/engine build
  bun run --filter @lunchtable/cards build
  bun run --filter @lunchtable/guilds build
  bun run --filter @lunchtable/match build
  bun run --filter @lunchtable/story build
}

ensure_convex_cli() {
  if [ "$SKIP_CONVEX_CHECK" = true ]; then
    echo "Skipping Convex checks (--skip-convex-check)."
    return
  fi

  ensure_bun

  if [ ! -x "node_modules/.bin/convex" ]; then
    echo "Convex CLI not found at node_modules/.bin/convex."
    echo "Run setup again without --skip-install, or run: bun install --frozen-lockfile"
    exit 1
  fi

  local convex_version
  convex_version="$(bunx convex --version)"
  echo "Convex CLI: ${convex_version}"

  if bunx convex login status >/dev/null 2>&1; then
    echo "Convex auth: OK"
  else
    echo "⚠ Convex auth not configured yet. Run: bunx convex login"
  fi
}

derive_convex_urls() {
  if [ -n "$DEPLOYMENT" ]; then
    if [ -z "$CONVEX_CLOUD_URL" ]; then
      CONVEX_CLOUD_URL="https://${DEPLOYMENT}.convex.cloud"
    fi
    if [ -z "$CONVEX_SITE_URL" ]; then
      CONVEX_SITE_URL="https://${DEPLOYMENT}.convex.site"
    fi
  fi

  if [ -n "$CONVEX_CLOUD_URL" ] && [ -z "$CONVEX_SITE_URL" ]; then
    CONVEX_SITE_URL="${CONVEX_CLOUD_URL/.convex.cloud/.convex.site}"
  fi

  if [ -n "$CONVEX_SITE_URL" ] && [ -z "$CONVEX_CLOUD_URL" ]; then
    CONVEX_CLOUD_URL="${CONVEX_SITE_URL/.convex.site/.convex.cloud}"
  fi
}

upsert_env_var() {
  local file="$1"
  local key="$2"
  local value="$3"

  if [ -z "$value" ]; then
    return
  fi

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
        if (updated == 0) {
          print k "=" v
        }
      }
    ' "$file" > "$tmp_file"
  else
    printf "%s=%s\n" "$key" "$value" > "$tmp_file"
  fi

  mv "$tmp_file" "$file"
}

write_env_files() {
  local root_env_file=".env.local"
  local primary_web_env_file="apps/web-tanstack/.env.local"

  if [ -n "$DEPLOYMENT" ]; then
    upsert_env_var "$root_env_file" "CONVEX_DEPLOYMENT" "$DEPLOYMENT"
  fi

  if [ -n "$CONVEX_CLOUD_URL" ]; then
    upsert_env_var "$root_env_file" "VITE_CONVEX_URL" "$CONVEX_CLOUD_URL"
    upsert_env_var "$primary_web_env_file" "VITE_CONVEX_URL" "$CONVEX_CLOUD_URL"
  fi

  if [ -n "$CONVEX_SITE_URL" ]; then
    upsert_env_var "$root_env_file" "LTCG_API_URL" "$CONVEX_SITE_URL"
  fi
}

echo "=== LTCG-v2 Environment Bootstrap ==="
derive_convex_urls
ensure_dependencies
build_workspace_components
ensure_convex_cli
write_env_files

if command -v bun >/dev/null 2>&1; then
  echo "Bun: $(bun --version)"
fi

echo ""
echo "Configured local env files:"
echo "  - .env.local"
echo "  - apps/web-tanstack/.env.local"
if [ -n "$DEPLOYMENT" ]; then
  echo "CONVEX_DEPLOYMENT=${DEPLOYMENT}"
fi
if [ -n "$CONVEX_CLOUD_URL" ]; then
  echo "VITE_CONVEX_URL=${CONVEX_CLOUD_URL}"
fi
if [ -n "$CONVEX_SITE_URL" ]; then
  echo "LTCG_API_URL=${CONVEX_SITE_URL}"
fi

echo ""
echo "Next: bun run dev"
