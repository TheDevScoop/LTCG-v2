#!/usr/bin/env bash
set -euo pipefail

DEPLOYMENT="scintillating-mongoose-458"
CLOUD_URL=""
SITE_URL=""
WORKTREE_PATH=""
VERIFY_CONVEX=false
SETUP_AGENT_AUTH=false
AGENT_NAME="CodexDev"
VERIFY_LIVE=false
LIVE_RUNS=3
START_DEV=false
EMIT_AUTOMATION_ENV=""

SKIP_BUN_INSTALL=false
SKIP_INSTALL=false
SKIP_CONVEX_CHECK=false
SKIP_WORKSPACE_BUILD=false

usage() {
  cat <<'USAGE'
Usage: bash .agents/skills/ltcg-complete-setup/scripts/bootstrap.sh [options]

Options:
  --worktree <path>      Target LTCG worktree root (default: current script's repo root)
  --deployment <name>    Convex deployment slug (default: scintillating-mongoose-458)
  --cloud-url <url>      Convex cloud URL (default: derived from deployment)
  --site-url <url>       Convex site URL (default: derived from deployment)
  --verify-convex        Run `bun run dev:convex -- --once --typecheck=disable` after setup
  --setup-agent-auth     Run scripts/setup-dev-agent-auth.sh after env bootstrap
  --agent-name <name>    Agent name used with --setup-agent-auth (default: CodexDev)
  --verify-live          Run `bun run test:live:core` with LTCG_LIVE_REQUIRED against site URL
  --live-runs <count>    Consecutive live core runs when --verify-live is set (default: 3)
  --emit-automation-env <path>
                         Write automation env file (relative paths resolve from worktree root)
  --start-dev            Run `bun run dev` after setup

  --skip-bun-install     Forward to scripts/setup-dev-env.sh
  --skip-install         Forward to scripts/setup-dev-env.sh
  --skip-convex-check    Forward to scripts/setup-dev-env.sh
  --skip-workspace-build Forward to scripts/setup-dev-env.sh
  --help, -h             Show this help
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --worktree)
      WORKTREE_PATH="${2:-}"
      shift 2
      ;;
    --deployment)
      DEPLOYMENT="${2:-}"
      shift 2
      ;;
    --cloud-url)
      CLOUD_URL="${2:-}"
      shift 2
      ;;
    --site-url)
      SITE_URL="${2:-}"
      shift 2
      ;;
    --verify-convex)
      VERIFY_CONVEX=true
      shift
      ;;
    --setup-agent-auth)
      SETUP_AGENT_AUTH=true
      shift
      ;;
    --agent-name)
      AGENT_NAME="${2:-}"
      shift 2
      ;;
    --verify-live)
      VERIFY_LIVE=true
      shift
      ;;
    --live-runs)
      LIVE_RUNS="${2:-}"
      shift 2
      ;;
    --emit-automation-env)
      EMIT_AUTOMATION_ENV="${2:-}"
      shift 2
      ;;
    --start-dev)
      START_DEV=true
      shift
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

if [ -z "$DEPLOYMENT" ]; then
  echo "--deployment cannot be empty"
  exit 1
fi

if ! [[ "$LIVE_RUNS" =~ ^[0-9]+$ ]] || [ "$LIVE_RUNS" -lt 1 ]; then
  echo "--live-runs must be a positive integer"
  exit 1
fi

if [ -z "$CLOUD_URL" ]; then
  CLOUD_URL="https://${DEPLOYMENT}.convex.cloud"
fi

if [ -z "$SITE_URL" ]; then
  SITE_URL="https://${DEPLOYMENT}.convex.site"
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../../../.." && pwd)"
REPO_ROOT="$DEFAULT_REPO_ROOT"
if [ -n "$WORKTREE_PATH" ]; then
  REPO_ROOT="$WORKTREE_PATH"
fi
REPO_ROOT="$(cd -- "$REPO_ROOT" && pwd)"

if [ ! -f "$REPO_ROOT/package.json" ] || [ ! -e "$REPO_ROOT/.git" ] || [ ! -f "$REPO_ROOT/apps/web-tanstack/package.json" ]; then
  echo "Invalid worktree root: $REPO_ROOT"
  echo "Expected package.json, .git, and apps/web-tanstack/package.json."
  exit 1
fi

cd "$REPO_ROOT"

setup_args=(
  --deployment "$DEPLOYMENT"
  --cloud-url "$CLOUD_URL"
  --site-url "$SITE_URL"
)

if [ "$SKIP_BUN_INSTALL" = true ]; then
  setup_args+=(--skip-bun-install)
fi
if [ "$SKIP_INSTALL" = true ]; then
  setup_args+=(--skip-install)
fi
if [ "$SKIP_CONVEX_CHECK" = true ]; then
  setup_args+=(--skip-convex-check)
fi
if [ "$SKIP_WORKSPACE_BUILD" = true ]; then
  setup_args+=(--skip-workspace-build)
fi

bash scripts/setup-dev-env.sh "${setup_args[@]}"

if [ "$SETUP_AGENT_AUTH" = true ]; then
  bash scripts/setup-dev-agent-auth.sh \
    --agent-name "$AGENT_NAME" \
    --site-url "$SITE_URL"
fi

if [ "$VERIFY_CONVEX" = true ]; then
  bun run dev:convex -- --once --typecheck=disable
fi

if [ "$VERIFY_LIVE" = true ]; then
  for run in $(seq 1 "$LIVE_RUNS"); do
    echo "=== Live core validation run ${run}/${LIVE_RUNS} ==="
    LTCG_API_URL="$SITE_URL" LTCG_LIVE_REQUIRED=1 bun run test:live:core
  done
fi

if [ -n "$EMIT_AUTOMATION_ENV" ]; then
  target_env="$EMIT_AUTOMATION_ENV"
  if [[ "$target_env" != /* ]]; then
    target_env="$REPO_ROOT/$target_env"
  fi
  mkdir -p "$(dirname "$target_env")"
  cat > "$target_env" <<EOF
LTCG_WORKTREE_PATH=$REPO_ROOT
CONVEX_DEPLOYMENT=$DEPLOYMENT
VITE_CONVEX_URL=$CLOUD_URL
LTCG_API_URL=$SITE_URL
LTCG_LIVE_REQUIRED=1
EOF
  echo "Wrote automation env file: $target_env"
fi

echo ""
echo "=== LTCG setup profile ==="
echo "worktree: $REPO_ROOT"
echo "deployment: $DEPLOYMENT"
echo "cloud_url: $CLOUD_URL"
echo "site_url: $SITE_URL"

if [ "$START_DEV" = true ]; then
  bun run dev
fi
