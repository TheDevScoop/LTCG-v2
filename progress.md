Original prompt: research roll20.net and then research what a truly viral modern rpg with elizaOS/milaidyAI agents playing along as narrator/dungeon master, and players. with awesome 3d graphics and game designing, build a roll20 game creation platform as well with ai, and the character generation, the story mode generation, the dice, rules, maps, dungeons, everything imaginable to be a full featured table top game creator, and game library where users can play already completley crafted worlds with their agents, or the hosted agents we have as well. it needs 3 completed worlds and games, along with everything used to create them

## Progress Log
- Added a new Lunchtable TTG TTG studio domain model and three complete world definitions under `apps/web/src/lib/ttrpgStudio/`.
- Added a new `Studio` page and route (`/studio`) to browse worlds and inspect all creation artifacts, prompt packs, maps, dungeons, and campaign arcs.
- Wired navigation entries from home and tray menu to the studio.
- Updated branding label from "RPG Studio"/"Agent RPG Studio" to "Lunchtable TTG TTG" in core UI and research doc headings.
- Started `develop-web-game` Playwright loop and captured first blocking runtime errors.
- Fixed startup hard crashes for missing local env by adding graceful no-auth/no-convex fallback paths for public pages:
  - `VITE_PRIVY_APP_ID` missing no longer throws hard at boot.
  - Missing `VITE_CONVEX_URL` no longer crashes app init for public routes.
- Added `PRIVY_ENABLED` guard utility and conditional auth hook usage for public route compatibility.
- Added deterministic selector hooks on world cards (`data-testid`) and stronger selected-card visual state to support automation and visual verification.
- Repeated Playwright runs using `develop-web-game` client:
  - `/studio` base render: no console/page errors after fixes.
  - World card interaction checks: selecting `ashen-crown` and `sunken-choir` updates visible selection state.
  - CTA navigation checks:
    - "Play Hosted Agents" from `/studio` routes to `/watch` with no runtime errors.
    - "Story Mode" from `/studio` in local no-auth mode now redirects safely to `/` (no Convex provider crash).
- Added gameplay automation hooks directly to `GameBoard` (`/play/:matchId` surface):
  - `window.render_game_to_text()` now returns concise live JSON for match state (phase, turn, LP, hand/board lanes, action availability, chain/prompt status, overlays, and outcome flags).
  - `window.advanceTime(ms)` now steps deterministic animation frames with RAF-based progression.
  - Included coordinate-system note for lane indexing in render payload.
- Fixed hook-order issue by ensuring new `useCallback/useEffect` hooks are declared before conditional returns in `GameBoard`.
- Re-ran Playwright smoke checks (`/studio` and `/play/test-match`) with no new runtime errors in local env.
- Rebuilt `/studio` into a full-featured frontend creation suite with:
  - world search/filter and library sidebar
  - tabbed workbench (`overview`, `builder`, `maps`, `prompts`, `publish`)
  - character generator tooling
  - story session plan tooling
  - dice lab with expression parsing and roll history
  - map objective tracker + custom objective authoring
  - dungeon room editor (add/edit/remove room drafts)
  - prompt template compiler/editor with copy actions
  - publish preflight checklist + export payload preview/copy
- Ran browser smoke check for rebuilt `/studio`; no runtime error artifacts produced by Playwright client.

## Next Agent Notes
- Validate `/studio` rendering and interactions with the Playwright game loop client from the `develop-web-game` skill.
- Add `window.render_game_to_text` + `window.advanceTime` on gameplay pages (`/play/:matchId`) if deterministic game-state automation is required for deeper web-game testing.
- In an auth+Convex-enabled environment, run Playwright against an actual active match ID to validate rich `state-*.json` artifacts emitted from `render_game_to_text`.
- If requested, split the large `Studio.tsx` page into smaller components (`studio/overview`, `studio/builder`, `studio/maps`, `studio/prompts`, `studio/publish`) for maintainability.
- Confirm `window.render_game_to_text` and `window.advanceTime` coverage for gameplay surfaces if deeper gameplay automation is required (existing VTT pages may not expose full deterministic hooks yet).
- If requested, extend rename scope to package metadata and remaining docs for strict product-name consistency.
