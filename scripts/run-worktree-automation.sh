#!/usr/bin/env bash
set -euo pipefail

WORKTREE_PATH=""
DEPLOYMENT="scintillating-mongoose-458"
CLOUD_URL=""
SITE_URL=""
AGENT_NAME="CodexDev"
LIVE_RUNS=3
VERIFY_LIVE=true
SETUP_AGENT_AUTH=true
VERIFY_CONVEX=false
EMIT_AUTOMATION_ENV="artifacts/automation/worktree.env"
SKIP_BUN_INSTALL=false
SKIP_INSTALL=false
SKIP_CONVEX_CHECK=false
SKIP_WORKSPACE_BUILD=false

usage() {
  cat <<'USAGE'
Usage: bash scripts/run-worktree-automation.sh [options]

Runs the complete setup skill against a specific worktree with automation-safe defaults.

Defaults:
  deployment: scintillating-mongoose-458
  setup-agent-auth: enabled
  verify-live: enabled (3 consecutive runs)
  emit-automation-env: artifacts/automation/worktree.env

Options:
  --worktree <path>      Target worktree path (default: current working directory)
  --deployment <name>    Convex deployment slug
  --cloud-url <url>      Convex cloud URL override
  --site-url <url>       Convex site URL override
  --agent-name <name>    Agent name for setup-dev-agent-auth.sh (default: CodexDev)
  --live-runs <count>    Consecutive runs for --verify-live flow (default: 3)
  --skip-live            Disable live core validation loop
  --skip-agent-auth      Disable agent auth bootstrap
  --verify-convex        Enable one-shot Convex verification
  --emit-automation-env <path>
                         Env output path (relative to worktree if not absolute)
  --skip-bun-install     Forward to setup script
  --skip-install         Forward to setup script
  --skip-convex-check    Forward to setup script
  --skip-workspace-build Forward to setup script
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
    --agent-name)
      AGENT_NAME="${2:-}"
      shift 2
      ;;
    --live-runs)
      LIVE_RUNS="${2:-}"
      shift 2
      ;;
    --skip-live)
      VERIFY_LIVE=false
      shift
      ;;
    --skip-agent-auth)
      SETUP_AGENT_AUTH=false
      shift
      ;;
    --verify-convex)
      VERIFY_CONVEX=true
      shift
      ;;
    --emit-automation-env)
      EMIT_AUTOMATION_ENV="${2:-}"
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

if [ -z "$WORKTREE_PATH" ]; then
  WORKTREE_PATH="$(pwd)"
fi
WORKTREE_PATH="$(cd -- "$WORKTREE_PATH" && pwd)"

BOOTSTRAP_SCRIPT="$WORKTREE_PATH/.agents/skills/ltcg-complete-setup/scripts/bootstrap.sh"
if [ ! -f "$BOOTSTRAP_SCRIPT" ]; then
  echo "Missing bootstrap skill script: $BOOTSTRAP_SCRIPT"
  exit 1
fi

bootstrap_args=(
  --worktree "$WORKTREE_PATH"
  --deployment "$DEPLOYMENT"
  --live-runs "$LIVE_RUNS"
  --emit-automation-env "$EMIT_AUTOMATION_ENV"
)

if [ -n "$CLOUD_URL" ]; then
  bootstrap_args+=(--cloud-url "$CLOUD_URL")
fi
if [ -n "$SITE_URL" ]; then
  bootstrap_args+=(--site-url "$SITE_URL")
fi
if [ "$SETUP_AGENT_AUTH" = true ]; then
  bootstrap_args+=(--setup-agent-auth --agent-name "$AGENT_NAME")
fi
if [ "$VERIFY_LIVE" = true ]; then
  bootstrap_args+=(--verify-live)
fi
if [ "$VERIFY_CONVEX" = true ]; then
  bootstrap_args+=(--verify-convex)
fi
if [ "$SKIP_BUN_INSTALL" = true ]; then
  bootstrap_args+=(--skip-bun-install)
fi
if [ "$SKIP_INSTALL" = true ]; then
  bootstrap_args+=(--skip-install)
fi
if [ "$SKIP_CONVEX_CHECK" = true ]; then
  bootstrap_args+=(--skip-convex-check)
fi
if [ "$SKIP_WORKSPACE_BUILD" = true ]; then
  bootstrap_args+=(--skip-workspace-build)
fi

echo "Running worktree automation bootstrap:"
echo "  worktree: $WORKTREE_PATH"
echo "  deployment: $DEPLOYMENT"

bash "$BOOTSTRAP_SCRIPT" "${bootstrap_args[@]}"
