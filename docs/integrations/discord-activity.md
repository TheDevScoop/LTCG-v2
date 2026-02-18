# Discord Activity Integration

This repo now supports running LTCG as a Discord Activity with shared cross-play against web and Telegram clients.

## What was integrated

- Discord Activity runtime detection in web client.
- Discord Embedded App SDK initialization (`@discord/embedded-app-sdk`).
- Discord-native invite flow (`shareLink`) from PvP lobby screens.
- Discord rich presence updates (`setActivity`) with join secrets per match.
- Auto-routing for invite launches via `custom_id` / `ACTIVITY_JOIN` secret.
- Human PvP lobby + join flow in Convex (`createPvPLobby`, `joinPvPMatch`).
- Match presence tracking with platform tags (`web`, `telegram`, `discord`, etc).
- In-game platform badges shown for both players.

## Required environment

Set in the web app environment:

```bash
VITE_DISCORD_CLIENT_ID=your_discord_application_client_id
```

Existing auth still uses Privy; keep your current Privy env vars configured.

## Discord developer setup

1. Create/select your Discord application in the Developer Portal.
2. Enable Activities / Embedded App support for that application.
3. Add your deployed game URL as an allowed Activity URL.
4. Ensure your OAuth2 settings include the same client id used by `VITE_DISCORD_CLIENT_ID`.

Reference docs:
- [Discord Social SDK overview](https://docs.discord.com/developers/discord-social-sdk/overview)
- [Discord Embedded App SDK README](https://github.com/discord/embedded-app-sdk)

## Embedding policy

`apps/web/vercel.json` now uses `Content-Security-Policy` `frame-ancestors` to allow:

- `discord.com`, `ptb.discord.com`, `canary.discord.com`
- Existing milaidy hosts

Do not re-add `X-Frame-Options: DENY` or Discord Activity embedding will fail.
