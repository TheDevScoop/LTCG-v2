# LTCG TanStack Start Migration Shell

This app is the initial TanStack Start migration target for the existing
LunchTable TCG web client.

Current scope:

- Stand up a parallel TanStack Start app in the monorepo.
- Wire TanStack Router + React Query + Convex query subscriptions.
- Keep existing `apps/web` unchanged while migration proceeds incrementally.
- Port the first read-only gameplay data surfaces (`/` and `/cards` routes).

## Development

From your terminal:

```sh
bun install
bun run dev:tanstack
```

The TanStack app expects `VITE_CONVEX_URL` to be configured.

## Build + typecheck

```sh
bun run build:web:tanstack
bun run --cwd apps/web-tanstack type-check
```

## References

- [TanStack Start docs](https://tanstack.com/start/latest)
- [Convex TanStack Start quickstart](https://docs.convex.dev/quickstart/tanstack-start)

## Migration checkpoints

- `/` now acts as a migration launchpad with auth-aware route cards and Convex summary stats.
- `/cards` lists a subset of cards from `api.cards.getAllCards`.
- `/cards/$cardId` loads details via `api.cards.getCard`.
- `/leaderboard` loads ranked data from `api.ranked.getLeaderboard` and `api.ranked.getRankDistribution`.
- `/about` includes the first converted static marketing/about route.
- `/privacy` and `/terms` are now converted into TanStack legal pages.
- `/token` now includes the migrated Solana token info entry point.
- `/watch` now fetches and displays live retake.tv stream status.
- `/collection`, `/decks`, `/decks/$deckId`, `/onboarding`, `/profile`, `/settings` now exist as migrated route shells.
- `/pvp` now supports PvP lobby create/join/cancel flows and join-by-code.
- `/duel` now supports direct lobby create/join flow and invite link generation.
- `/story` + `/story/$chapterId` now support chapter/stage browsing and story battle start actions.
- `/play/$matchId` now loads match meta/snapshot/story context (board rendering still pending).
- `/cliques`, `/studio`, `/agent-dev` route shells are now migrated.
- `/stream-overlay` now resolves an agent/match and renders spectator+chat diagnostics for capture migration.
- `/discord-callback` now handles OAuth callback status and popup auto-close flow.
