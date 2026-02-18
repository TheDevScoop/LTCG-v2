# Discord Activity Integration

This repo now supports running LTCG as a Discord Activity with shared cross-play against web and Telegram clients.

## What is integrated

- Discord Activity runtime detection in web client.
- Discord Embedded App SDK initialization (`@discord/embedded-app-sdk`).
- Discord OAuth scope bootstrap for rich-presence commands:
  - `authorize` -> `/api/discord-token` -> `authenticate`.
- Discord-native invite flow (`shareLink`) from PvP lobby screens.
- Discord rich presence updates (`setActivity`) with join secrets per match.
- Auto-routing for invite launches via `custom_id` / `ACTIVITY_JOIN` secret.
- Discord-first Privy login prompt when opened inside Activity.
- Auto-linking Discord OAuth account in Privy for authenticated users in Activity.
- Human PvP lobby + join flow in Convex (`createPvPLobby`, `joinPvPMatch`).
- Match presence tracking with platform tags (`web`, `telegram`, `discord`, etc).
- In-game platform badges shown for both players.

## Auth model

App auth remains **Privy-first**. Discord OAuth in this integration is used only to enable SDK command scopes needed for rich presence (`setActivity`) inside Activity runtime.

## Required environment

Client env (`apps/web`):

```bash
VITE_DISCORD_CLIENT_ID=your_discord_application_client_id
VITE_DISCORD_URL_MAPPINGS='[{"prefix":"/.proxy/convex","target":"your-deployment.convex.cloud"},{"prefix":"/.proxy/convex-site","target":"your-deployment.convex.site"}]'
```

Server env (Vercel/API functions):

```bash
DISCORD_CLIENT_SECRET=your_discord_oauth_client_secret
# Optional fallback (client id also read from VITE_DISCORD_CLIENT_ID)
DISCORD_CLIENT_ID=your_discord_application_client_id
```

Keep existing Privy env vars configured for app session auth.

## Discord developer setup

1. Create/select your Discord application in the Developer Portal.
2. Enable Activities / Embedded App support for that application.
3. Add your deployed game URL as an allowed Activity URL.
4. Ensure OAuth2 client id matches `VITE_DISCORD_CLIENT_ID`.
5. Ensure the Activity can request these scopes:
   - `identify`
   - `rpc.activities.write`
   - `shareLink` is used for invites and does not require additional scopes.
6. Configure URL mappings for external domains used inside Activity iframe:
   - `/.proxy/convex` -> `<your convex cloud host>`
   - `/.proxy/convex-site` -> `<your convex site host>`
   - Any extra hosts can be added via `VITE_DISCORD_URL_MAPPINGS` JSON.

Reference docs:
- [Discord Social SDK overview](https://docs.discord.com/developers/discord-social-sdk/overview)
- [Discord Embedded App SDK README](https://github.com/discord/embedded-app-sdk)

## Embedding policy

`apps/web/vercel.json` now uses `Content-Security-Policy` `frame-ancestors` to allow:

- `discord.com`, `ptb.discord.com`, `canary.discord.com`
- Existing milaidy hosts

Do not re-add `X-Frame-Options: DENY` or Discord Activity embedding will fail.

## Failure behavior

- If Discord scope auth fails, gameplay still works (Privy + Convex unaffected).
- `setActivity` rich-presence updates are disabled until scope auth succeeds.
- `shareLink` invite flow remains available even if rich-presence scope auth fails.
- UI surfaces non-fatal status/error text in Activity lobby screens.
