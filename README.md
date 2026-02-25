# LunchTable: School of Hard Knocks (LTCG-v2)

White-label trading card game built for both humans and ElizaOS agents. Embedded as iframe in the milaidy Electron app. Agents stream gameplay via retake.tv.

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Bun 1.3.5 |
| Frontend | TanStack Start + React 19 + TanStack Router |
| Styling | Tailwind CSS 4 |
| Backend | Convex 1.31.6 (white-label components) |
| Auth | Privy 3.12 |
| State | Zustand 5.0 |
| Animation | Framer Motion 12 |
| UI | Radix UI + custom zine components |
| AI Agents | ElizaOS 1.7.2 |
| Streaming | retake.tv |


## Development Rules

> [!IMPORTANT]
> **Use Bun Exclusively**
> This project uses [Bun](https://bun.sh) for everything.
> - **Install**: `bun install`
> - **Run**: `bun run <script>`
> - **Add**: `bun add <package>`
> - **Do NOT use**: `npm`, `yarn`, or `pnpm`.

## Quick Start


```bash
# Bootstrap Bun + dependencies + Convex env files
bash scripts/setup-dev-env.sh --deployment scintillating-mongoose-458

# Start development (Convex + Web)
bun run dev

# Or run individually:
bun run dev:convex  # Backend only
bun run dev:web     # Frontend only (port 3334)
```

The setup script is idempotent and also builds local workspace packages required by Convex components.
Re-run it any time after cloning a new worktree or machine.
To change targets, pass `--deployment`, `--cloud-url`, or `--site-url`.

For a reusable one-command setup skill (env bootstrap + optional agent auth + optional live validation loop):

```bash
bash .agents/skills/ltcg-complete-setup/scripts/bootstrap.sh \
  --setup-agent-auth \
  --verify-live \
  --live-runs 3
```

### Worktree Automation (Pinned Path)

Use this for schedulers/agents that must target one exact checkout:

```bash
bash /Users/home/.codex/worktrees/77c3/LTCG-v2/scripts/run-worktree-automation.sh \
  --worktree /Users/home/.codex/worktrees/77c3/LTCG-v2 \
  --deployment scintillating-mongoose-458 \
  --live-runs 3
```

When already inside the target worktree, you can use:

```bash
bun run setup:worktree:auto -- --worktree "$(pwd)"
```

This flow writes `artifacts/automation/worktree.env` in the target worktree.
Automations can source it before running game agents:

```bash
set -a
source /Users/home/.codex/worktrees/77c3/LTCG-v2/artifacts/automation/worktree.env
set +a
```

### Local Agent Access (No Privy Login)

For local automation and agent-driven testing, use the API-key path instead of weakening Privy auth:

```bash
# Register a local agent key and write apps/web-tanstack/.env.local
bun run setup:agent-auth -- --agent-name CodexDev

# Start web app
bun run dev:web
```

Then open:

`http://localhost:3334/?devAgent=1`

Security boundaries:
- only active in Vite dev mode (`import.meta.env.DEV`)
- only active on `localhost` / `127.0.0.1`
- requires `VITE_DEV_AGENT_API_KEY` in local env (not committed)

### Agent API Match Modes

- Story mode remains CPU-opponent for agent HTTP start flows (`POST /api/agent/game/start`).
- Agent-vs-agent is explicit PvP:
  - create lobby: `POST /api/agent/game/pvp/create`
  - join waiting lobby: `POST /api/agent/game/join`
- `GET /api/agent/game/view` keeps the same payload shape and now issues a safe internal AI nudge if a CPU turn appears stalled.

## Telegram Cross-Play Setup

Set these environment variables before enabling Telegram inline + Mini App gameplay:

```bash
# Convex runtime
TELEGRAM_BOT_TOKEN=123456:your_bot_token
TELEGRAM_WEBHOOK_SECRET=your_random_secret
TELEGRAM_BOT_USERNAME=YourBot
TELEGRAM_WEB_APP_URL=https://your-web-app.example/ # used for Games launch URLs

# Optional but recommended: direct mini app links (works even if Main Mini App isn't enabled yet)
TELEGRAM_MINIAPP_SHORT_NAME=your_mini_app_short_name

# Optional: Telegram Games API
TELEGRAM_GAME_SHORT_NAME=your_game_short_name

# Web runtime
VITE_TELEGRAM_BOT_USERNAME=YourBot
VITE_TELEGRAM_MINIAPP_SHORT_NAME=your_mini_app_short_name
VITE_TELEGRAM_GAME_SHORT_NAME=your_game_short_name
```

BotFather checklist:
- Enable inline mode: `/setinline`
- Set Menu Button URL: `/mybots` -> Bot Settings -> Menu Button
- Configure Main Mini App: `/mybots` -> Bot Settings -> Configure Mini App (enables `?startapp=` links)
- (Optional) Create a Direct Mini App short name: `/newapp` (use for `t.me/<bot>/<short_name>?startapp=...`)
- (Optional) Create a Game: `/newgame` (set `TELEGRAM_GAME_SHORT_NAME`)

Webhook setup:

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url":"https://<your-convex-site>/api/telegram/webhook",
    "secret_token":"'"${TELEGRAM_WEBHOOK_SECRET}"'"
  }'
```

## Project Structure

```
LTCG-v2/
├── convex/                    # Convex backend (host layer)
├── apps/web-tanstack/         # Primary frontend (TanStack Start)
├── apps/web/                  # Legacy archive (React Router; excluded from default flows)
├── packages/
│   ├── engine/                # Pure TS game engine
│   ├── plugin-ltcg/           # ElizaOS plugin
│   ├── lunchtable-tcg-cards/  # Card inventory + decks
│   ├── lunchtable-tcg-match/  # Event-sourced matches
│   └── lunchtable-tcg-story/  # Story mode progression
└── docs/                      # Architecture + agent docs
```

## Discord Activity

- Setup guide: `docs/integrations/discord-activity.md`
- Required client env: `VITE_DISCORD_CLIENT_ID`
- Required server env for OAuth code exchange: `DISCORD_CLIENT_SECRET`
- Required server env for interactions verification: `DISCORD_PUBLIC_KEY`
- Optional client env for URL mappings: `VITE_DISCORD_URL_MAPPINGS`
- Discord mobile deep-link path: `/_discord/join`
- Discord interactions endpoint: `/api/interactions`

## Audio Soundtrack

- Manifest file: `apps/web-tanstack/public/soundtrack.in`
- Agent-readable endpoint: `GET /api/soundtrack` (optional `?context=play`)
- Plugin env (optional): `LTCG_SOUNDTRACK_API_URL=https://your-app.com/api/soundtrack`

`soundtrack.in` supports:
- Playlist sections like `[landing]`, `[play]`, `[story]`, `[watch]`, `[default]`
- SFX section `[sfx]` with key/value pairs like `attack=/audio/sfx/attack.wav`

Landing context is shuffled automatically; other contexts loop in order.

## Game

A vice-themed trading card game with 6 archetypes:
- **Dropout** (Red) - Aggro
- **Prep** (Blue) - Midrange  
- **Geek** (Yellow) - Combo
- **Freak** (Purple) - Chaos
- **Nerd** (Green) - Control
- **Goodie Two-Shoes** (White) - Attrition

## Development

```bash
# Run tests
bun run test        # Watch mode
bun run test:once   # Single run
```

## License

Proprietary - All rights reserved.
