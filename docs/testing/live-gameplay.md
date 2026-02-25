# Live Gameplay Validation

This repo includes a live gameplay harness that validates real match flows end-to-end:

- Drive gameplay via the Convex HTTP Agent API (`/api/agent/...`)
- Observe the running match via the web spectator UI (Playwright + `window.render_spectator_to_text()`)
- Emit machine-readable artifacts for CI triage

API contract notes:
- `POST /api/agent/game/action` requires `expectedVersion` (number). Missing/invalid values return `422`.
- `GET /api/agent/game/match-status` includes `latestSnapshotVersion` for optimistic concurrency.

## What Runs

`core` suite:
- Start + complete story stage 1
- Start + finish a quick duel
- Start + finish an agent-vs-agent PvP lobby match
- Validate public spectator endpoints return consistent seat + event ordering
- Validate invalid seat actions are rejected with a 422 contract

Story stage validation also asserts story mode is CPU-opponent (`mode=story`, one seat is `cpu`).

`full` suite:
- `core`, plus additional story stages (default 3 total stages; controlled by `LTCG_FULL_STAGES`)

Artifacts are written to `artifacts/live-gameplay/<runId>/`.

## Environment Variables

- `LTCG_API_URL` (recommended): Convex site URL (example: `https://<deployment>.convex.site`)
- `LTCG_WEB_URL` (optional): web app URL for spectator mode (example: `http://localhost:3334`)
- `VITE_CONVEX_URL` (optional): Convex cloud URL (example: `https://<deployment>.convex.cloud`)
  - If omitted, the harness derives it from `LTCG_API_URL`.
- `LTCG_RUN_ID` (optional): override artifacts run id (defaults to `Date.now()`).
- `LTCG_NO_BROWSER=1` (optional): run API-only (skips Playwright spectator observer).
- `LTCG_FULL_STAGES` (optional): stages to run in `full`/`soak` suites (default `3`).
- `LTCG_SOAK_STAGES` (optional): stages to run in `soak` suite (default `10`).
- `LTCG_LIVE_REQUIRED=1` (optional): fail the run if no API URL is configured (default is skip).
  - The suite also skips by default if the API URL is configured but not reachable.
  - Skip runs still emit `report.json` with `status: "skip"` and `skipReason`.
- `LTCG_SCENARIO_TIMEOUT_MS` (optional): per-scenario wall-clock timeout in milliseconds (default `120000`).
  - Prevents non-terminating live scenarios from hanging CI/local runs.
- `LTCG_SCENARIO_RETRIES` (optional): retries per scenario after a timeout/failure (default `1`).
  - Helps absorb transient Convex scheduler variance in live runs.

## Local Validation

1. Start the web app on the standard dev port (`3334`):

```bash
bun run dev:web
```

2. Run the live gameplay suite:

```bash
LTCG_API_URL="https://<deployment>.convex.site" \
LTCG_WEB_URL="http://localhost:3334" \
bun run test:live:core
```

Optional CLI override:

```bash
bun run test:live:core -- --scenario-timeout-ms=120000

# Optional: increase retries for noisy environments
bun run test:live:core -- --scenario-timeout-ms=120000 --retries=2
```

Recommended pre-deploy reliability gate (3 consecutive full passes):

```bash
for run in 1 2 3; do
  echo "=== live core run ${run}/3 ==="
  LTCG_API_URL="https://<deployment>.convex.site" \
  LTCG_LIVE_REQUIRED=1 \
  bun run test:live:core
done
```

Passing means no scenario timeout and no `stalled_opponent_turn` failures.

API-only mode:

```bash
LTCG_API_URL="https://<deployment>.convex.site" \
LTCG_NO_BROWSER=1 \
bun run test:live:core
```

## Worktree Automation Recipe

For automation that must run against a specific worktree path, bootstrap first:

```bash
bash /Users/home/.codex/worktrees/77c3/LTCG-v2/scripts/run-worktree-automation.sh \
  --worktree /Users/home/.codex/worktrees/77c3/LTCG-v2 \
  --deployment scintillating-mongoose-458 \
  --live-runs 3
```

Then source the generated env profile:

```bash
set -a
source /Users/home/.codex/worktrees/77c3/LTCG-v2/artifacts/automation/worktree.env
set +a
```

The env file contains:
- `LTCG_WORKTREE_PATH`
- `CONVEX_DEPLOYMENT`
- `VITE_CONVEX_URL`
- `LTCG_API_URL`
- `LTCG_LIVE_REQUIRED`

## CI Notes

The spectator observer opens:

`/stream-overlay?apiKey=<ltcg_key>&embedded=true`

No `postMessage` auth handshake is required for this harness path.

## Artifacts

Per run:
- `artifacts/live-gameplay/<runId>/report.json`
- `artifacts/live-gameplay/<runId>/timeline.ndjson`
- `artifacts/live-gameplay/<runId>/*.png` (only on failure)

`report.json` includes `status` (`pass`, `fail`, or `skip`) and a `skipReason` when status is `skip`.

`timeline.ndjson` is append-only and intended for automation and CI attachment.
