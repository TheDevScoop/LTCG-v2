# LTCG Web Client (TanStack Start)

This app is the primary LunchTable web frontend.

Stack:

- TanStack Start + TanStack Router
- React Query + Convex subscriptions
- Vite 7 + React 19 + Tailwind 4

## Development

From your terminal:

```sh
bun install
bun run dev:web
```

The TanStack app expects `VITE_CONVEX_URL` to be configured.

## Build + typecheck

```sh
bun run build:web:tanstack
bun run --cwd apps/web-tanstack type-check
```

## References

- [TanStack Start docs](https://tanstack.com/start/latest/docs/framework/react/overview)
- [Convex TanStack Start quickstart](https://docs.convex.dev/quickstart/tanstack-start)

## Route coverage

- Core play loop: `/pvp`, `/duel`, `/play/$matchId`
- Story flow: `/story`, `/story/$chapterId`
- Deck + collection flow: `/collection`, `/decks`, `/decks/$deckId`
- Account + utility flow: `/onboarding`, `/profile`, `/settings`, `/agent-dev`, `/stream-overlay`
- Discovery + marketing flow: `/`, `/cards`, `/cards/$cardId`, `/cliques`, `/leaderboard`, `/watch`, `/about`, `/privacy`, `/terms`, `/token`
