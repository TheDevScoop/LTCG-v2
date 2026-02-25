---
name: ltcg-complete-setup
description: Reusable LTCG-v2 environment bootstrap. Installs and verifies Bun, installs locked dependencies, builds Convex component workspaces, writes Convex deployment env files, and checks Convex CLI/auth. Use when setting up a new machine/worktree, fixing missing @lunchtable/* convex.config dist errors, or preparing to run bun run dev.
version: 1.1.0
homepage: https://github.com/Dexploarer/LTCG-v2
---

# LTCG Complete Setup

Use this skill to make an LTCG-v2 workspace runnable end-to-end with Bun + Convex.

## What this skill runs

1. Bootstraps local tooling with `scripts/setup-dev-env.sh`.
2. Ensures required workspace package builds exist for Convex components:
   - `@lunchtable/engine`
   - `@lunchtable/cards`
   - `@lunchtable/guilds`
   - `@lunchtable/match`
   - `@lunchtable/story`
3. Writes local env files:
   - `.env.local`
   - `apps/web/.env.local`
4. Optionally provisions local dev agent API auth (`VITE_DEV_AGENT_API_KEY`).
5. Optionally runs repeated live autonomy validation (`test:live:core`).
6. Optionally emits an automation env file for schedulers.

## Quick run

From repo root:

```bash
bash .agents/skills/ltcg-complete-setup/scripts/bootstrap.sh
```

Default target deployment:
- `scintillating-mongoose-458`
- `https://scintillating-mongoose-458.convex.cloud`
- `https://scintillating-mongoose-458.convex.site`

## Common options

```bash
# Override deployment target
bash .agents/skills/ltcg-complete-setup/scripts/bootstrap.sh \
  --deployment my-deployment

# Target a specific worktree path from any cwd
bash .agents/skills/ltcg-complete-setup/scripts/bootstrap.sh \
  --worktree /Users/home/.codex/worktrees/77c3/LTCG-v2

# Explicit URLs
bash .agents/skills/ltcg-complete-setup/scripts/bootstrap.sh \
  --deployment my-deployment \
  --cloud-url https://my-deployment.convex.cloud \
  --site-url https://my-deployment.convex.site

# Also verify Convex function prep
bash .agents/skills/ltcg-complete-setup/scripts/bootstrap.sh --verify-convex

# Setup local dev agent auth key (no Privy weakening)
bash .agents/skills/ltcg-complete-setup/scripts/bootstrap.sh --setup-agent-auth

# Run 3 consecutive live core validations against target Convex site
bash .agents/skills/ltcg-complete-setup/scripts/bootstrap.sh --verify-live --live-runs 3

# Emit env file for automations
bash .agents/skills/ltcg-complete-setup/scripts/bootstrap.sh \
  --emit-automation-env artifacts/automation/worktree.env

# Start full dev stack after setup
bash .agents/skills/ltcg-complete-setup/scripts/bootstrap.sh --start-dev
```

## Automation entrypoint

Use the wrapper when running from schedulers/agents:

```bash
bash scripts/run-worktree-automation.sh \
  --worktree /Users/home/.codex/worktrees/77c3/LTCG-v2 \
  --live-runs 3
```

This command:
- bootstraps env in the target worktree
- provisions a local dev agent API key
- runs `test:live:core` for 3 consecutive passes
- writes `artifacts/automation/worktree.env`

## If Convex auth is missing

Run:

```bash
bunx convex login
```

Then rerun the bootstrap script.

## Validation checklist

```bash
bunx vitest run local-tooling-scripts.test.ts
bun run dev:convex -- --once --typecheck=disable
bun run dev

# Optional full autonomy gate (recommended before deployment)
bash .agents/skills/ltcg-complete-setup/scripts/bootstrap.sh \
  --setup-agent-auth \
  --verify-live \
  --live-runs 3
```

## Troubleshooting

- Error: `Could not resolve "@lunchtable/.../convex.config"`
  - Cause: workspace packages not built.
  - Fix: rerun this skill's bootstrap script (it builds required packages).

- Error: `Bun is required but missing`
  - Cause: Bun not installed and install was skipped.
  - Fix: rerun without skip flags, or install Bun manually.

- Error: Convex auth/login status failure
  - Fix: `bunx convex login`, then rerun bootstrap.
