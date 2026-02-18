# LTCG-v2 Convex Backend

## Structure

```
convex/
├── _generated/              # Auto-generated Convex types
├── auth.ts                  # Privy auth integration
├── agentAuth.ts             # ElizaOS agent authentication
├── cardData.ts              # 132 card definitions (~71K)
├── game.ts                  # Main API orchestration (~18K)
├── http.ts                  # HTTP endpoints for agents (~15K)
├── seed.ts                  # Seeds cards, decks, story content (~62K)
├── schema.ts                # Users table definition
├── auth.config.ts           # Auth configuration
├── crons.ts                 # Scheduled jobs
└── convex.config.ts         # Component configuration
```

## Key Functions

- `api.game.*` - Main game orchestration (story battle flow, AI turns, secure action flow)
- `api.cards.*` - Full cards/decks host wrappers (including rename/delete/duplicate + admin internals)
- `api.match.*` - Match lifecycle + utility wrappers (`createMatch`, `joinMatch`, lobby queries)
- `api.story.*` - Story content/progress wrappers + admin seed/update internals
- `api.guilds.*` - Guild host wrappers over `@lunchtable-tcg/guilds`
- `api.auth.*` - User authentication
- Internal functions for AI turn execution

## White-Label Components

Uses `@lunchtable-tcg/*` component packages:
- `lunchtable-tcg-cards` - Card inventory & decks
- `lunchtable-tcg-match` - Match lifecycle & state
- `lunchtable-tcg-story` - Story mode progression
- `lunchtable-tcg-guilds` - Guild management, invites, chat, discovery

See `.claude/skills/convex-*` for patterns.
