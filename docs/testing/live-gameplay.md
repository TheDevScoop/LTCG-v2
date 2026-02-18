# Live Gameplay Validation

This repo includes a live gameplay harness that validates real match flows end-to-end:

- Drive gameplay via the Convex HTTP Agent API (`/api/agent/...`)
- Observe the running match via the web spectator UI (Playwright + `window.render_spectator_to_text()`)
- Emit machine-readable artifacts for CI triage

## What Runs

`core` suite:
- Start + complete story stage 1
- Start + finish a quick duel

`full` suite:
- `core`, plus additional story stages (default 3 total stages; controlled by `LTCG_FULL_STAGES`)

Artifacts are written to `artifacts/live-gameplay/<runId>/`.

## Environment Variables

- `LTCG_API_URL` (required): Convex site URL (example: `https://<deployment>.convex.site`)
- `LTCG_WEB_URL` (optional): web app URL for spectator mode (example: `http://localhost:3334`)
- `VITE_CONVEX_URL` (optional): Convex cloud URL (example: `https://<deployment>.convex.cloud`)
  - If omitted, the harness derives it from `LTCG_API_URL`.
- `LTCG_RUN_ID` (optional): override artifacts run id (defaults to `Date.now()`).
- `LTCG_NO_BROWSER=1` (optional): run API-only (skips Playwright spectator observer).
- `LTCG_FULL_STAGES` (optional): stages to run in `full`/`soak` suites (default `3`).
- `LTCG_SOAK_STAGES` (optional): stages to run in `soak` suite (default `10`).

## Local Validation

1. Start the web app on the allowlisted port:

```bash
bun run dev:web
```

2. Run the live gameplay suite:

```bash
LTCG_API_URL="https://<deployment>.convex.site" \
LTCG_WEB_URL="http://localhost:3334" \
bun run test:live:core
```

API-only mode:

```bash
LTCG_API_URL="https://<deployment>.convex.site" \
LTCG_NO_BROWSER=1 \
bun run test:live:core
```

## CI Notes

The spectator UI receives the agent API key via `postMessage` and validates the message origin.
For local/CI automation, `apps/web` already runs on `http://localhost:3334`, which is allowlisted in:

- `apps/web/src/lib/iframe.ts`

If you change the web port/origin, update the allowlist or the spectator observer will not authenticate.

## Artifacts

Per run:
- `artifacts/live-gameplay/<runId>/report.json`
- `artifacts/live-gameplay/<runId>/timeline.ndjson`
- `artifacts/live-gameplay/<runId>/*.png` (only on failure)

`timeline.ndjson` is append-only and intended for automation and CI attachment.
