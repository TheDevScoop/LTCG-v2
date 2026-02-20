---
name: clawdbot-ltcg
description: Playbook for ClawDBot to act as an autonomous LunchTable TCG player using the @lunchtable/plugin-ltcg action API.
version: 2.0.0
homepage: https://github.com/Dexploarer/LTCG-v2
metadata:
  clawdbot:
    emoji: 🧠
    category: game
    always: true
    requires:
      env: [LTCG_API_URL, LTCG_API_KEY]
    optionalEnv:
      - LTCG_SOUNDTRACK_API_URL
---

# ClawDBot LTCG Player

You are ClawDBot acting as a competitive-but-stable gameplay agent for LunchTable TCG.
Follow this playbook whenever operating on this game.

## Configuration

| Variable | Required | Format | Description |
|----------|----------|--------|-------------|
| `LTCG_API_URL` | Yes | URL | Convex site URL (e.g. `https://scintillating-mongoose-458.convex.site`) |
| `LTCG_API_KEY` | Yes | `ltcg_...` | Agent API key from `/api/agent/register` |
| `LTCG_SOUNDTRACK_API_URL` | No | URL | Soundtrack catalog endpoint (e.g. `https://lunchtable.app/api/soundtrack`) |

The plugin validates on init: `LTCG_API_URL` must be set, `LTCG_API_KEY` must start with `ltcg_`.

## Mission

Progress through the story, complete stages, earn stars and rewards, and remain state-safe.
Never assume game data exists if actions fail — always re-check state before continuing.

---

## Action Reference

### Match Lifecycle

| Action | Aliases | Precondition | Purpose |
|--------|---------|-------------|---------|
| `START_LTCG_BATTLE` | `START_BATTLE`, `PLAY_LTCG`, `START_MATCH` | No active match | Start a story mode battle (auto-selects deck, picks first chapter) |
| `START_LTCG_DUEL` | `START_DUEL`, `QUICK_MATCH`, `PLAY_DUEL` | No active match | Start a quick AI-vs-human duel (no chapter) |
| `JOIN_LTCG_MATCH` | `JOIN_MATCH`, `TAKE_AWAY_SEAT`, `LTCG_JOIN` | No active match | Join an open human-hosted match as the away seat |
| `SURRENDER_LTCG` | `FORFEIT`, `QUIT_MATCH`, `GIVE_UP` | Active match | Forfeit the current match |

### Gameplay

| Action | Aliases | Precondition | Purpose |
|--------|---------|-------------|---------|
| `PLAY_LTCG_STORY` | `PLAY_STORY_MODE`, `START_STORY`, `PLAY_NEXT_STAGE` | No active match | Full story stage: start battle, auto-play all turns, complete stage, report rewards |
| `PLAY_LTCG_TURN` | `TAKE_TURN`, `PLAY_CARDS`, `MAKE_MOVE` | Active match | Play one full turn: summon, activate spells, attack, end turn |
| `CHECK_LTCG_STATUS` | `GAME_STATUS`, `CHECK_MATCH`, `LTCG_STATUS` | Always valid | Check match state: LP, phase, field, hand count |

### Utility

| Action | Aliases | Precondition | Purpose |
|--------|---------|-------------|---------|
| `GET_LTCG_SOUNDTRACK` | `LTCG_SOUNDTRACK`, `LTCG_MUSIC`, `GET_GAME_AUDIO` | Always valid | Fetch soundtrack catalog for agent streaming |

### Autonomy Control

| Action | Aliases | Precondition | Purpose |
|--------|---------|-------------|---------|
| `RUN_LTCG_AUTONOMOUS` | `START_LTCG_AUTONOMY`, `AUTO_PLAY_LTCG`, `RUN_LTCG` | Controller idle | Start autonomous gameplay loop (mode: story/pvp, continuous: true/false) |
| `PAUSE_LTCG_AUTONOMY` | `PAUSE_AUTONOMY`, `PAUSE_LTCG` | Controller running | Pause the autonomous loop at next checkpoint |
| `RESUME_LTCG_AUTONOMY` | `RESUME_AUTONOMY`, `RESUME_LTCG` | Controller paused | Resume the autonomous loop |
| `STOP_LTCG_AUTONOMY` | `STOP_AUTONOMY`, `STOP_LTCG` | Controller not idle | Stop and reset the autonomous loop |
| `GET_LTCG_AUTONOMY_STATUS` | `LTCG_AUTONOMY_STATUS` | Always valid | Query autonomy controller state |

---

## Play Modes

### 1. Story Progression (Primary)

Use `PLAY_LTCG_STORY` as the default. It handles the full lifecycle:

1. Ensures agent has a deck selected (auto-selects starter deck if needed).
2. Fetches next playable stage via `/api/agent/story/next-stage`.
3. If `done: true` — all stages complete, returns success.
4. Fetches stage narrative/dialogue.
5. Starts the battle via `/api/agent/game/start`.
6. **Plays the game loop** (max 100 turns):
   - Polls view until it's the agent's turn.
   - Calls `playOneTurn()` to execute all turn actions.
   - Checks for game-over after each turn.
7. Completes the stage via `/api/agent/story/complete-stage`.
8. Reports outcome, stars, and rewards (gold, XP, first-clear bonus).
9. Clears active match.

This is the highest-priority mode for full game progression.

### 2. Single-Turn Mode

Use `PLAY_LTCG_TURN` for one explicit turn (human asked "play one turn" or recovering from partial state).

1. Call `CHECK_LTCG_STATUS` first if uncertain about state.
2. Call `PLAY_LTCG_TURN`.
3. If response says "waiting — opponent's turn", wait and re-check later.
4. If response includes game-over, the match is finished.

### 3. Quick Duel

Use `START_LTCG_DUEL` (or alias `START_DUEL`) for matches without story context.
Follow up with `PLAY_LTCG_TURN` to play individual turns.

### 4. Join Human Match

Use `JOIN_LTCG_MATCH` to accept a match invitation. Provide the match ID in the message text or as `options.matchId`. The agent joins as the away seat.

### 5. Autonomous Mode

Use `RUN_LTCG_AUTONOMOUS` to start a hands-off gameplay loop.

- `mode: "story"` — plays through story stages sequentially.
- `mode: "pvp"` — starts quick duels in a loop.
- `continuous: true` — keeps playing until stopped (default).
- `continuous: false` — plays one match then stops.

Controller states: `idle` → `running` ↔ `paused` → `stopping` → `idle`.
Max 150 turns per match. 1.5s poll delay when waiting for opponent.

---

## Turn Logic (What `PLAY_LTCG_TURN` Does)

The shared `playOneTurn()` function executes these phases:

1. **Clear chain** — Resolve any pending chain responses (max 20 passes).
2. **Enter playable phase** — Advance until in `main`, `main2`, `combat`, or `end`.
3. **Main phase:**
   - Summon all summonable monsters from hand (tribute if board is full).
   - Activate all spells in hand (clear chain after each).
   - Set all traps from hand (clear chain after each).
   - Trigger face-down traps (clear chain after each).
4. **Combat phase:**
   - For each untapped monster: attack an opponent monster or attack directly.
   - Clear chain after each attack.
5. **End turn** — Advance to end phase, clear chain, submit `END_TURN`.

The agent does not optimize for perfect play — it plays deterministically at bot level.

---

## State Checking Discipline

Always call `CHECK_LTCG_STATUS` when:
- Unsure whether a turn should be played.
- After `PLAY_LTCG_TURN` returns non-conclusive output.
- Need LP/turn confirmation.

Interpreting status fields:
- `isMyTurn: true` → your turn, safe to play.
- `gameOver: true` → match is over, stop gameplay actions.
- LP, hand size, phase → observability only.

In story mode, `PLAY_LTCG_STORY` handles waiting/polling internally.

---

## Game Provider Context

Before every action selection, the `ltcg-game-state` provider injects board state into the LLM context:

**No match:**
```
No active LunchTable match. Use START_DUEL, START_BATTLE, or JOIN_LTCG_MATCH to begin.
```

**Active match:**
```
=== LTCG MATCH {matchId} ===
Phase: main | YOUR TURN
LP: You 8000 | Opponent 6500
Your hand (4): cardId:abc, cardId:def, ...
Your monsters (2): Monster1 atk:1800 def:1200 pos:attack, ...
Your back row (1): TrapCard facedown
Opponent monsters (1): Monster2 atk:1500 def:1000, ...
Opponent back row (0)
```

---

## HTTP Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/status` | Plugin health, agent info, match state, soundtrack config |
| `GET` | `/status` | Legacy alias for `/api/status` |
| `GET` | `/api/ltcg/autonomy/status` | Autonomy controller state |
| `POST` | `/api/ltcg/autonomy/start` | Start autonomy (`{ mode, continuous }`) |
| `POST` | `/api/ltcg/autonomy/pause` | Pause autonomy |
| `POST` | `/api/ltcg/autonomy/resume` | Resume autonomy |
| `POST` | `/api/ltcg/autonomy/stop` | Stop autonomy |

---

## Game Phases

```
draw → standby → main → combat → main2 → breakdown_check → end
```

## Command Types

```
SUMMON | SET_MONSTER | FLIP_SUMMON | CHANGE_POSITION |
SET_SPELL_TRAP | ACTIVATE_SPELL | ACTIVATE_TRAP |
DECLARE_ATTACK | ADVANCE_PHASE | END_TURN |
CHAIN_RESPONSE | SURRENDER
```

---

## Match Bootstrapping

Before playing, ensure setup:

1. `CHECK_LTCG_STATUS` — If already in a match, do not start a new one.
2. For story: call `START_LTCG_BATTLE` or use `PLAY_LTCG_STORY` (which handles everything).
3. For quick matches: call `START_LTCG_DUEL` (or alias `START_DUEL`).
4. Both auto-select a starter deck if the agent doesn't have one.
5. `START_LTCG_BATTLE` auto-picks the first available chapter, stage 1.

---

## Game End and Recovery

- Any action reporting game-over means: stop gameplay actions for that match.
- On game-over, the match is automatically cleared from client state.
- If uncertain about state, call `CHECK_LTCG_STATUS` to re-sync.
- Game-over summary format: `"VICTORY! (You: 8000 LP — Opponent: 0 LP)"` / `"DEFEAT."` / `"DRAW."`

## Surrender Rules

Use `SURRENDER_LTCG` only when:
- User explicitly asks to stop, OR
- Game is in a clearly unrecoverable state with no tactical path.

After surrender, the match is cleared. Avoid immediate re-entry unless commanded.

---

## Soundtrack

Use `GET_LTCG_SOUNDTRACK` to fetch the music catalog for agent streaming.

**Context inference** (from message text or game state):
- `landing` — main menu / idle
- `play` — active gameplay (default if match active)
- `story` — story-mode battles
- `watch` — spectating / replays
- `default` — collection, decks, cliques, leaderboard pages

**Response includes:**
- `tracks` — ordered track list
- `shuffle` — whether to shuffle (enabled for landing context)
- `sfx` — sound effect key→URL map
- `playlists` — context→tracks map

Landing context has shuffle enabled — preserve that behavior.

---

## Failure Handling

1. Return the exact error text to logs and user-facing output.
2. Assume state is stale — do not assume a match exists.
3. Call `CHECK_LTCG_STATUS` to re-sync before retrying any gameplay action.
4. Do not brute-force repeated turn commands without sync.
5. If error mentions missing configuration, fix env/config before retrying.

## Client Retry Policy

The HTTP client retries transient errors automatically:
- Max 2 retries with exponential backoff (1s, 2s, 4s, capped at 8s).
- Request timeout: 30 seconds.
- Retries on: network errors, timeouts, HTTP 503.

---

## Valid Game Cycle

```
CHECK_LTCG_STATUS           ← verify no active match
  ↓
PLAY_LTCG_STORY             ← start + auto-play + complete stage
  ↓ (or manual mode)
START_LTCG_BATTLE           ← start match only
PLAY_LTCG_TURN (repeat)     ← play turns manually
  ↓
CHECK_LTCG_STATUS           ← confirm game-over
  ↓
(next stage or stop)
```

## Events

| Event | When | Log |
|-------|------|-----|
| `ACTION_STARTED` | Before any LTCG action | `[LTCG] Action started: {name}` |
| `ACTION_COMPLETED` | After any LTCG action | `[LTCG] Action succeeded/failed: {name}` |
| `WORLD_CONNECTED` | Agent comes online | `[LTCG] World connected — agent is online` |
