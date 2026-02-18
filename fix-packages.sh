#!/usr/bin/env bash
# fix-packages.sh — remove transient package artifacts and reinstall deterministically.
# Default mode is dry-run. Use --apply to execute changes.

set -euo pipefail

APPLY=false
AUTO_CONFIRM=false
SKIP_INSTALL=false

usage() {
  cat <<'EOF'
Usage: bash fix-packages.sh [--apply] [--yes] [--skip-install]

Options:
  --apply       Execute removals and install. Default is dry-run.
  --yes, -y     Skip confirmation prompt when using --apply.
  --skip-install
                Skip `bun install --frozen-lockfile` (useful for CI/test runs).
  --help        Show this help.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --apply)
      APPLY=true
      ;;
    --yes|-y)
      AUTO_CONFIRM=true
      ;;
    --skip-install)
      SKIP_INSTALL=true
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
  shift
done

if [ ! -f "package.json" ] || [ ! -d ".git" ]; then
  echo "Run this script from the repository root."
  exit 1
fi

if [ "$APPLY" = true ] && [ "$AUTO_CONFIRM" = false ]; then
  printf "This will remove node_modules directories. Continue? [y/N] "
  read -r reply
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

if [ "$APPLY" = false ]; then
  echo "Running in dry-run mode. No files will be removed."
fi

remove_path() {
  local target="$1"
  if [ -e "$target" ]; then
    if [ "$APPLY" = true ]; then
      rm -rf -- "$target"
      echo "✓ Removed $target"
    else
      echo "• Would remove $target"
    fi
  fi
}

echo "=== LTCG-v2 Package Cleanup ==="

echo "[1/4] Removing known transient directories..."
remove_path "./--with-vercel-json"
remove_path "./tools/promo-video"
if [ -d "./tools" ] && [ -z "$(find "./tools" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null || true)" ]; then
  remove_path "./tools"
fi

echo "[2/4] Removing node_modules + stale bun.lockb..."
while IFS= read -r -d '' modules_dir; do
  remove_path "$modules_dir"
done < <(find . -type d -name node_modules -prune -print0)
remove_path "bun.lockb"

echo "[3/4] Installing dependencies..."
if [ "$APPLY" = true ] && [ "$SKIP_INSTALL" = false ]; then
  bun install --frozen-lockfile
elif [ "$SKIP_INSTALL" = true ]; then
  echo "✓ Skipped bun install (--skip-install)."
else
  echo "• Would run bun install --frozen-lockfile"
fi

echo "[4/4] Verifying runtime platform..."
if command -v bun >/dev/null 2>&1; then
  ESBUILD_PLATFORM=$(bun -e "console.log(process.arch + '-' + process.platform)")
  echo "Platform: $ESBUILD_PLATFORM"
else
  echo "⚠ bun not found on PATH."
fi

echo ""
echo "=== Done! ==="
