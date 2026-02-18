# Roll20-Inspired LunchTable TTG Research
Date: February 18, 2026

## 1) What Roll20 still does well
- Roll20 keeps onboarding simple with a fast game-lobby creation flow and campaign setup defaults.
- Roll20's `Pro` tier supports Mod Scripts (API), which validates demand for creator-side automation and extensibility.
- Roll20 has continued engine modernization (Jumpgate), signaling that VTT performance and rendering quality matter for retention.
- Roll20's social discovery (`Looking for Group`) supports discovery loops but is still mostly host-first, not creator-economy-first.
- Roll20's own partner materials emphasize large network effects and marketplace-style publishing opportunities.

## 2) What modern users now expect (beyond classic VTT)
- Strong dynamic lighting, walls/LOS, and ambient audio as default capabilities, not premium add-ons.
- 3D or pseudo-3D immersion options for social/stream-heavy campaigns.
- AI-assisted content generation and AI NPC/GM behavior for faster world production and lower prep cost.
- Native co-op and social graph loops (friends, invites, shared sessions) integrated into session startup.

## 3) Viral model for LunchTable TTG
- UGC loop: creators publish worlds and forks, not only run private campaigns.
- Social loop: every session outputs clip-ready highlights and invite links.
- Agent loop: hosted GM + player agents enable always-on sessions and async participation.
- Economy loop: reward top creators by playtime engagement and reuse of their world templates.
- Event loop: weekly world mutations and limited-time district/season states drive urgency.

## 4) Product architecture for this repo
- `apps/web/src/lib/ttrpgStudio/types.ts` defines the full creator data model:
  rulesets, dice moves, archetypes, agent profiles, maps, dungeons, campaign arcs, and creation kits.
- `apps/web/src/lib/ttrpgStudio/generatorAssets.ts` defines reusable AI prompt recipes and export contracts.
- `apps/web/src/lib/ttrpgStudio/worlds.ts` ships three complete worlds with playable campaign scaffolds and asset manifests.
- `apps/web/src/pages/Studio.tsx` is the user-facing world library + creator panel.
- Routing/nav integration:
  - `apps/web/src/App.tsx`
  - `apps/web/src/pages/Home.tsx`
  - `apps/web/src/components/layout/TrayNav.tsx`

## 5) Three completed worlds included
- `Neon Borough: Vice Circuit` (cyberpunk urban fantasy)
  - Heat-based fail-forward system, corporate district campaign, tactical vault dungeon.
- `Ashen Crown Academy` (dark fantasy academy)
  - Ruin clock magic system, house politics campaign, ritual dungeon progression.
- `Sunken Choir of Nacre` (mythic ocean science-fantasy)
  - Dice-pool expedition system, pressure clock exploration, abyssal objective dungeon.

Each world includes:
- Rules and dice definitions
- Character generation archetypes
- Hosted narrator + player agent templates
- Maps and dungeon blueprints
- Story mode campaign beats
- Prompt pack, session-zero checklist, playtest matrix, and export package manifest

## 6) Implementation note
- This is a production-grade foundation for LunchTable TTG: a Roll20-class creator platform with agent-native workflows.
- Next step for full live operations is adding Convex-backed persistence + publish/fork/rating APIs for creator worlds.

## Sources
- Roll20 game creation flow: [https://help.roll20.net/hc/en-us/articles/29257513100183-1-Creating-your-game-lobby-on-Roll20](https://help.roll20.net/hc/en-us/articles/29257513100183-1-Creating-your-game-lobby-on-Roll20)
- Roll20 Jumpgate: [https://help.roll20.net/hc/en-us/articles/21569402281495-Jumpgate](https://help.roll20.net/hc/en-us/articles/21569402281495-Jumpgate)
- Roll20 Mod Scripts/API intro: [https://help.roll20.net/hc/en-us/articles/360037256714-Introduction-to-Mod-Scripts-API](https://help.roll20.net/hc/en-us/articles/360037256714-Introduction-to-Mod-Scripts-API)
- Roll20 LFG: [https://help.roll20.net/hc/en-us/articles/360037774473-How-to-Use-Looking-for-Group](https://help.roll20.net/hc/en-us/articles/360037774473-How-to-Use-Looking-for-Group)
- Roll20 partner ecosystem: [https://help.roll20.net/hc/en-us/articles/360037254374-Partner-FAQs](https://help.roll20.net/hc/en-us/articles/360037254374-Partner-FAQs)
- Foundry dynamic lighting: [https://foundryvtt.com/article/lighting/](https://foundryvtt.com/article/lighting/)
- Foundry walls and LOS: [https://foundryvtt.com/article/walls/](https://foundryvtt.com/article/walls/)
- Foundry ambient sound: [https://foundryvtt.com/article/ambient-sound/](https://foundryvtt.com/article/ambient-sound/)
- Alchemy VTT: [https://www.alchemyrpg.com/](https://www.alchemyrpg.com/)
- TaleSpire (3D VTT reference): [https://store.steampowered.com/app/720620/TaleSpire/](https://store.steampowered.com/app/720620/TaleSpire/)
- ElizaOS docs: [https://docs.elizaos.ai/](https://docs.elizaos.ai/)
- Eliza plugin quickstart reference: [https://github.com/elizaos/eliza/blob/develop/docs/docs/quickstart/create-plugin.md](https://github.com/elizaos/eliza/blob/develop/docs/docs/quickstart/create-plugin.md)
- Epic creator economy model: [https://www.epicgames.com/site/en-US/news/introducing-unreal-editor-for-fortnite-creator-economy-2-0-fab-and-more](https://www.epicgames.com/site/en-US/news/introducing-unreal-editor-for-fortnite-creator-economy-2-0-fab-and-more)
- Roblox creator rewards: [https://create.roblox.com/docs/production/creator-rewards](https://create.roblox.com/docs/production/creator-rewards)
- Discord Social SDK: [https://discord.com/developers/docs/social-sdk/index.html](https://discord.com/developers/docs/social-sdk/index.html)
- Convai AI NPC docs/home: [https://convai.com/](https://convai.com/) and [https://docs.convai.com/api-docs/plugins-and-integrations/unreal-engine/npc2npc](https://docs.convai.com/api-docs/plugins-and-integrations/unreal-engine/npc2npc)
