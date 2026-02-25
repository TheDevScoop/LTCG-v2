/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentApiKey from "../agentApiKey.js";
import type * as agentAuth from "../agentAuth.js";
import type * as agentRouteHelpers from "../agentRouteHelpers.js";
import type * as agentSeed from "../agentSeed.js";
import type * as agentTelemetry from "../agentTelemetry.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as cardData from "../cardData.js";
import type * as cards from "../cards.js";
import type * as cliqueBonus from "../cliqueBonus.js";
import type * as cliques from "../cliques.js";
import type * as crons from "../crons.js";
import type * as dailyBriefing from "../dailyBriefing.js";
import type * as game from "../game.js";
import type * as guilds from "../guilds.js";
import type * as http from "../http.js";
import type * as match from "../match.js";
import type * as matchAccess from "../matchAccess.js";
import type * as matchmaking from "../matchmaking.js";
import type * as packs from "../packs.js";
import type * as publicSpectator from "../publicSpectator.js";
import type * as ranked from "../ranked.js";
import type * as rematch from "../rematch.js";
import type * as seed from "../seed.js";
import type * as signupAvatar from "../signupAvatar.js";
import type * as story from "../story.js";
import type * as streamChat from "../streamChat.js";
import type * as telegram from "../telegram.js";
import type * as telegramInline from "../telegramInline.js";
import type * as telegramLinks from "../telegramLinks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentApiKey: typeof agentApiKey;
  agentAuth: typeof agentAuth;
  agentRouteHelpers: typeof agentRouteHelpers;
  agentSeed: typeof agentSeed;
  agentTelemetry: typeof agentTelemetry;
  analytics: typeof analytics;
  auth: typeof auth;
  cardData: typeof cardData;
  cards: typeof cards;
  cliqueBonus: typeof cliqueBonus;
  cliques: typeof cliques;
  crons: typeof crons;
  dailyBriefing: typeof dailyBriefing;
  game: typeof game;
  guilds: typeof guilds;
  http: typeof http;
  match: typeof match;
  matchAccess: typeof matchAccess;
  matchmaking: typeof matchmaking;
  packs: typeof packs;
  publicSpectator: typeof publicSpectator;
  ranked: typeof ranked;
  rematch: typeof rematch;
  seed: typeof seed;
  signupAvatar: typeof signupAvatar;
  story: typeof story;
  streamChat: typeof streamChat;
  telegram: typeof telegram;
  telegramInline: typeof telegramInline;
  telegramLinks: typeof telegramLinks;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  lunchtable_tcg_cards: {
    cards: {
      addCardsToInventory: FunctionReference<
        "mutation",
        "internal",
        {
          cardDefinitionId: string;
          quantity: number;
          serialNumber?: number;
          source?: string;
          userId: string;
          variant?: "standard" | "foil" | "alt_art" | "full_art" | "numbered";
        },
        { newQuantity: number; success: boolean }
      >;
      createCardDefinition: FunctionReference<
        "mutation",
        "internal",
        {
          ability?: any;
          archetype: string;
          attack?: number;
          attribute?: string;
          cardType: string;
          cost: number;
          defense?: number;
          flavorText?: string;
          imageUrl?: string;
          isActive?: boolean;
          level?: number;
          name: string;
          rarity: string;
          spellType?: string;
          trapType?: string;
        },
        string
      >;
      getAllCards: FunctionReference<"query", "internal", {}, any>;
      getCard: FunctionReference<"query", "internal", { cardId: string }, any>;
      getCardsBatch: FunctionReference<
        "query",
        "internal",
        { cardIds: Array<string> },
        any
      >;
      getCollectionStats: FunctionReference<
        "query",
        "internal",
        { userId: string },
        { favoriteCount: number; totalCards: number; uniqueCards: number }
      >;
      getUserCards: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
      getUserFavoriteCards: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
      removeCardsFromInventory: FunctionReference<
        "mutation",
        "internal",
        { cardDefinitionId: string; quantity: number; userId: string },
        { remainingQuantity: number; success: boolean }
      >;
      toggleCardActive: FunctionReference<
        "mutation",
        "internal",
        { cardId: string },
        { isActive: boolean }
      >;
      toggleFavorite: FunctionReference<
        "mutation",
        "internal",
        { playerCardId: string; userId: string },
        { isFavorite: boolean }
      >;
      updateCardDefinition: FunctionReference<
        "mutation",
        "internal",
        {
          ability?: any;
          archetype?: string;
          attack?: number;
          attribute?: string;
          cardId: string;
          cardType?: string;
          cost?: number;
          defense?: number;
          flavorText?: string;
          imageUrl?: string;
          isActive?: boolean;
          level?: number;
          name?: string;
          rarity?: string;
          spellType?: string;
          trapType?: string;
        },
        { success: boolean }
      >;
    };
    decks: {
      createDeck: FunctionReference<
        "mutation",
        "internal",
        {
          deckArchetype?: string;
          description?: string;
          maxDecks?: number;
          name: string;
          userId: string;
        },
        string
      >;
      deleteDeck: FunctionReference<
        "mutation",
        "internal",
        { deckId: string },
        any
      >;
      duplicateDeck: FunctionReference<
        "mutation",
        "internal",
        { deckId: string; maxDecks?: number; name: string },
        string
      >;
      getDeckStats: FunctionReference<
        "query",
        "internal",
        { deckId: string },
        {
          averageCost: number;
          cardsByRarity: {
            common: number;
            epic: number;
            legendary: number;
            rare: number;
            uncommon: number;
          };
          cardsByType: {
            class: number;
            spell: number;
            stereotype: number;
            trap: number;
          };
          totalCards: number;
        }
      >;
      getDeckWithCards: FunctionReference<
        "query",
        "internal",
        { deckId: string },
        any
      >;
      getUserDecks: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          cardCount: number;
          createdAt: number;
          deckArchetype?: string;
          deckId: string;
          description?: string;
          name: string;
          updatedAt: number;
        }>
      >;
      renameDeck: FunctionReference<
        "mutation",
        "internal",
        { deckId: string; name: string },
        any
      >;
      saveDeck: FunctionReference<
        "mutation",
        "internal",
        {
          cards: Array<{ cardDefinitionId: string; quantity: number }>;
          deckId: string;
          maxCopies?: number;
          maxLegendaryCopies?: number;
          maxSize?: number;
          minSize?: number;
        },
        any
      >;
      selectStarterDeck: FunctionReference<
        "mutation",
        "internal",
        {
          deckCode: string;
          starterCards: Array<{
            ability?: any;
            archetype: string;
            attack?: number;
            attribute?: string;
            cardType: string;
            cost: number;
            defense?: number;
            flavorText?: string;
            imageUrl?: string;
            level?: number;
            name: string;
            rarity: string;
            spellType?: string;
            trapType?: string;
          }>;
          userId: string;
        },
        { cardsReceived: number; deckId: string; deckSize: number }
      >;
      setActiveDeck: FunctionReference<
        "mutation",
        "internal",
        {
          deckId: string;
          maxCopies?: number;
          maxLegendaryCopies?: number;
          maxSize?: number;
          minSize?: number;
          userId: string;
        },
        string
      >;
      validateDeck: FunctionReference<
        "query",
        "internal",
        {
          deckId: string;
          maxCopies?: number;
          maxLegendaryCopies?: number;
          maxSize?: number;
          minSize?: number;
        },
        {
          errors: Array<string>;
          isValid: boolean;
          totalCards: number;
          warnings: Array<string>;
        }
      >;
    };
    seeds: {
      seedCardDefinitions: FunctionReference<
        "mutation",
        "internal",
        {
          cards: Array<{
            ability?: any;
            archetype: string;
            attack?: number;
            attribute?: string;
            breakdownEffect?: any;
            breakdownFlavorText?: string;
            cardType: string;
            cost: number;
            defense?: number;
            flavorText?: string;
            imageUrl?: string;
            level?: number;
            name: string;
            rarity: string;
            spellType?: string;
            trapType?: string;
            viceType?: string;
          }>;
        },
        { created: number; skipped: number }
      >;
      seedStarterDecks: FunctionReference<
        "mutation",
        "internal",
        {
          decks: Array<{
            archetype: string;
            cardCount: number;
            deckCode: string;
            description: string;
            name: string;
            playstyle: string;
          }>;
        },
        { created: number; skipped: number }
      >;
    };
  };
  lunchtable_tcg_guilds: {
    chat: {
      deleteMessage: FunctionReference<
        "mutation",
        "internal",
        { deletedBy: string; messageId: string },
        null
      >;
      getMessages: FunctionReference<
        "query",
        "internal",
        { before?: number; guildId: string; limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          guildId: string;
          isSystem: boolean;
          message: string;
          userId: string;
          username: string;
        }>
      >;
      getRecentMessages: FunctionReference<
        "query",
        "internal",
        { count?: number; guildId: string },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          guildId: string;
          isSystem: boolean;
          message: string;
          userId: string;
          username: string;
        }>
      >;
      sendMessage: FunctionReference<
        "mutation",
        "internal",
        {
          guildId: string;
          isSystem?: boolean;
          message: string;
          userId: string;
          username: string;
        },
        string
      >;
    };
    discovery: {
      approveJoinRequest: FunctionReference<
        "mutation",
        "internal",
        { approvedBy: string; requestId: string },
        null
      >;
      getJoinRequests: FunctionReference<
        "query",
        "internal",
        { guildId: string },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          guildId: string;
          message?: string;
          respondedAt?: number;
          respondedBy?: string;
          status: "pending" | "approved" | "rejected" | "cancelled";
          userId: string;
        }>
      >;
      getPlayerRequests: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          guildId: string;
          message?: string;
          respondedAt?: number;
          respondedBy?: string;
          status: "pending" | "approved" | "rejected" | "cancelled";
          userId: string;
        }>
      >;
      rejectJoinRequest: FunctionReference<
        "mutation",
        "internal",
        { rejectedBy: string; requestId: string },
        null
      >;
      searchGuilds: FunctionReference<
        "query",
        "internal",
        { limit?: number; searchTerm: string },
        Array<{
          _creationTime: number;
          _id: string;
          bannerImageId?: string;
          createdAt: number;
          description?: string;
          memberCount: number;
          name: string;
          ownerId: string;
          profileImageId?: string;
          updatedAt: number;
          visibility: "public" | "private";
        }>
      >;
      submitJoinRequest: FunctionReference<
        "mutation",
        "internal",
        { guildId: string; message?: string; userId: string },
        string
      >;
    };
    guilds: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          bannerImageId?: string;
          description?: string;
          name: string;
          ownerId: string;
          profileImageId?: string;
          visibility?: "public" | "private";
        },
        string
      >;
      disband: FunctionReference<
        "mutation",
        "internal",
        { id: string; ownerId: string },
        null
      >;
      getById: FunctionReference<
        "query",
        "internal",
        { id: string },
        {
          _creationTime: number;
          _id: string;
          bannerImageId?: string;
          createdAt: number;
          description?: string;
          memberCount: number;
          name: string;
          ownerId: string;
          profileImageId?: string;
          updatedAt: number;
          visibility: "public" | "private";
        } | null
      >;
      getByOwner: FunctionReference<
        "query",
        "internal",
        { ownerId: string },
        Array<{
          _creationTime: number;
          _id: string;
          bannerImageId?: string;
          createdAt: number;
          description?: string;
          memberCount: number;
          name: string;
          ownerId: string;
          profileImageId?: string;
          updatedAt: number;
          visibility: "public" | "private";
        }>
      >;
      getPublicGuilds: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        Array<{
          _creationTime: number;
          _id: string;
          bannerImageId?: string;
          createdAt: number;
          description?: string;
          memberCount: number;
          name: string;
          ownerId: string;
          profileImageId?: string;
          updatedAt: number;
          visibility: "public" | "private";
        }>
      >;
      update: FunctionReference<
        "mutation",
        "internal",
        {
          bannerImageId?: string;
          description?: string;
          id: string;
          name?: string;
          ownerId: string;
          profileImageId?: string;
          visibility?: "public" | "private";
        },
        null
      >;
    };
    invites: {
      acceptInvite: FunctionReference<
        "mutation",
        "internal",
        { inviteId: string; userId: string },
        string
      >;
      cancelInvite: FunctionReference<
        "mutation",
        "internal",
        { cancelledBy: string; inviteId: string },
        null
      >;
      createInvite: FunctionReference<
        "mutation",
        "internal",
        {
          expiresIn?: number;
          guildId: string;
          invitedBy: string;
          invitedUserId: string;
        },
        string
      >;
      createInviteLink: FunctionReference<
        "mutation",
        "internal",
        {
          createdBy: string;
          expiresIn?: number;
          guildId: string;
          maxUses?: number;
        },
        string
      >;
      declineInvite: FunctionReference<
        "mutation",
        "internal",
        { inviteId: string; userId: string },
        null
      >;
      deleteInviteLink: FunctionReference<
        "mutation",
        "internal",
        { deletedBy: string; linkId: string },
        null
      >;
      getGuildInviteLinks: FunctionReference<
        "query",
        "internal",
        { activeOnly?: boolean; guildId: string },
        Array<{
          _creationTime: number;
          _id: string;
          code: string;
          createdAt: number;
          createdBy: string;
          expiresAt: number;
          guildId: string;
          isActive: boolean;
          maxUses?: number;
          uses: number;
        }>
      >;
      getGuildInvites: FunctionReference<
        "query",
        "internal",
        {
          guildId: string;
          status?: "pending" | "accepted" | "declined" | "expired";
        },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          expiresAt: number;
          guildId: string;
          invitedBy: string;
          invitedUserId: string;
          respondedAt?: number;
          status: "pending" | "accepted" | "declined" | "expired";
        }>
      >;
      getPendingInvites: FunctionReference<
        "query",
        "internal",
        { userId: string },
        Array<{
          _creationTime: number;
          _id: string;
          createdAt: number;
          expiresAt: number;
          guildId: string;
          invitedBy: string;
          invitedUserId: string;
          respondedAt?: number;
          status: "pending" | "accepted" | "declined" | "expired";
        }>
      >;
      useInviteLink: FunctionReference<
        "mutation",
        "internal",
        { code: string; userId: string },
        string
      >;
    };
    members: {
      getMemberCount: FunctionReference<
        "query",
        "internal",
        { guildId: string },
        number
      >;
      getMembers: FunctionReference<
        "query",
        "internal",
        { guildId: string },
        Array<{
          _creationTime: number;
          _id: string;
          guildId: string;
          joinedAt: number;
          lastActiveAt?: number;
          role: "owner" | "member";
          userId: string;
        }>
      >;
      getPlayerGuild: FunctionReference<
        "query",
        "internal",
        { userId: string },
        {
          guild: {
            _creationTime: number;
            _id: string;
            bannerImageId?: string;
            createdAt: number;
            description?: string;
            memberCount: number;
            name: string;
            ownerId: string;
            profileImageId?: string;
            updatedAt: number;
            visibility: "public" | "private";
          };
          membership: {
            _creationTime: number;
            _id: string;
            guildId: string;
            joinedAt: number;
            lastActiveAt?: number;
            role: "owner" | "member";
            userId: string;
          };
        } | null
      >;
      join: FunctionReference<
        "mutation",
        "internal",
        { guildId: string; userId: string },
        string
      >;
      kick: FunctionReference<
        "mutation",
        "internal",
        { guildId: string; kickedBy: string; targetUserId: string },
        null
      >;
      leave: FunctionReference<
        "mutation",
        "internal",
        { guildId: string; userId: string },
        null
      >;
      transferOwnership: FunctionReference<
        "mutation",
        "internal",
        { currentOwnerId: string; guildId: string; newOwnerId: string },
        null
      >;
      updateRole: FunctionReference<
        "mutation",
        "internal",
        {
          guildId: string;
          newRole: "owner" | "member";
          targetUserId: string;
          updatedBy: string;
        },
        null
      >;
    };
  };
  lunchtable_tcg_match: {
    mutations: {
      cancelMatch: FunctionReference<
        "mutation",
        "internal",
        { matchId: string },
        null
      >;
      createMatch: FunctionReference<
        "mutation",
        "internal",
        {
          awayDeck?: Array<string>;
          awayId?: string;
          hostDeck: Array<string>;
          hostId: string;
          isAIOpponent: boolean;
          mode: "pvp" | "story";
        },
        string
      >;
      joinMatch: FunctionReference<
        "mutation",
        "internal",
        { awayDeck: Array<string>; awayId: string; matchId: string },
        null
      >;
      startMatch: FunctionReference<
        "mutation",
        "internal",
        {
          configAllowlist?: {
            pongEnabled?: boolean;
            redemptionEnabled?: boolean;
          };
          initialState: string;
          matchId: string;
        },
        null
      >;
      submitAction: FunctionReference<
        "mutation",
        "internal",
        {
          cardLookup?: string;
          command: string;
          expectedVersion: number;
          matchId: string;
          seat: "host" | "away";
        },
        { events: string; version: number }
      >;
    };
    queries: {
      getActiveMatchByHost: FunctionReference<
        "query",
        "internal",
        { hostId: string },
        {
          _creationTime: number;
          _id: string;
          awayDeck: Array<string> | null;
          awayId: string | null;
          createdAt: number;
          endReason?: string;
          endedAt?: number;
          hostDeck: Array<string>;
          hostId: string;
          isAIOpponent: boolean;
          mode: "pvp" | "story";
          startedAt?: number;
          status: "waiting" | "active" | "ended";
          winner?: "host" | "away";
        } | null
      >;
      getLatestSnapshotVersion: FunctionReference<
        "query",
        "internal",
        { matchId: string },
        number
      >;
      getMatchMeta: FunctionReference<
        "query",
        "internal",
        { matchId: string },
        {
          _creationTime: number;
          _id: string;
          awayDeck: Array<string> | null;
          awayId: string | null;
          createdAt: number;
          endReason?: string;
          endedAt?: number;
          hostDeck: Array<string>;
          hostId: string;
          isAIOpponent: boolean;
          mode: "pvp" | "story";
          startedAt?: number;
          status: "waiting" | "active" | "ended";
          winner?: "host" | "away";
        } | null
      >;
      getOpenLobbyByHost: FunctionReference<
        "query",
        "internal",
        { hostId: string },
        {
          _creationTime: number;
          _id: string;
          awayDeck: Array<string> | null;
          awayId: string | null;
          createdAt: number;
          endReason?: string;
          endedAt?: number;
          hostDeck: Array<string>;
          hostId: string;
          isAIOpponent: boolean;
          mode: "pvp" | "story";
          startedAt?: number;
          status: "waiting" | "active" | "ended";
          winner?: "host" | "away";
        } | null
      >;
      getOpenPrompt: FunctionReference<
        "query",
        "internal",
        { matchId: string; seat: "host" | "away" },
        {
          _creationTime: number;
          _id: string;
          createdAt: number;
          data?: string;
          matchId: string;
          promptType:
            | "chain_response"
            | "optional_trigger"
            | "replay_decision"
            | "discard";
          resolved: boolean;
          resolvedAt?: number;
          seat: "host" | "away";
        } | null
      >;
      getPlayerView: FunctionReference<
        "query",
        "internal",
        { matchId: string; seat: "host" | "away" },
        string | null
      >;
      getRecentEvents: FunctionReference<
        "query",
        "internal",
        { matchId: string; sinceVersion: number },
        Array<{
          command: string;
          createdAt: number;
          events: string;
          seat: "host" | "away";
          version: number;
        }>
      >;
      getRecentEventsPaginated: FunctionReference<
        "query",
        "internal",
        {
          matchId: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
    };
  };
  lunchtable_tcg_story: {
    chapters: {
      createChapter: FunctionReference<
        "mutation",
        "internal",
        {
          actNumber?: number;
          aiDifficulty?:
            | "easy"
            | "medium"
            | "hard"
            | "boss"
            | { hard: number; legendary: number; normal: number };
          aiOpponentDeckCode?: string;
          archetype?: string;
          archetypeImageUrl?: string;
          baseRewards?: { gems?: number; gold: number; xp: number };
          battleCount?: number;
          chapterNumber?: number;
          description: string;
          imageUrl?: string;
          isActive?: boolean;
          loreText?: string;
          number?: number;
          status?: "draft" | "published";
          storyText?: string;
          title: string;
          unlockCondition?: {
            requiredChapterId?: string;
            requiredLevel?: number;
            type: "chapter_complete" | "player_level" | "none";
          };
          unlockRequirements?: {
            minimumLevel?: number;
            previousChapter?: boolean;
          };
        },
        string
      >;
      getChapter: FunctionReference<
        "query",
        "internal",
        { chapterId: string },
        any
      >;
      getChapterByNumber: FunctionReference<
        "query",
        "internal",
        { actNumber: number; chapterNumber: number },
        any
      >;
      getChapters: FunctionReference<
        "query",
        "internal",
        { actNumber?: number; status?: "draft" | "published" },
        any
      >;
      updateChapter: FunctionReference<
        "mutation",
        "internal",
        { chapterId: string; updates: any },
        null
      >;
    };
    progress: {
      getBattleAttempts: FunctionReference<
        "query",
        "internal",
        { limit?: number; userId: string },
        any
      >;
      getChapterProgress: FunctionReference<
        "query",
        "internal",
        { actNumber: number; chapterNumber: number; userId: string },
        any
      >;
      getProgress: FunctionReference<
        "query",
        "internal",
        { userId: string },
        any
      >;
      getStageProgress: FunctionReference<
        "query",
        "internal",
        { stageId?: string; userId: string },
        any
      >;
      recordBattleAttempt: FunctionReference<
        "mutation",
        "internal",
        {
          actNumber: number;
          chapterNumber: number;
          difficulty: "normal" | "hard" | "legendary";
          finalLP: number;
          outcome: "won" | "lost" | "abandoned";
          progressId: string;
          rewardsEarned: { cards?: Array<string>; gold: number; xp: number };
          starsEarned: number;
          userId: string;
        },
        string
      >;
      upsertProgress: FunctionReference<
        "mutation",
        "internal",
        {
          actNumber: number;
          bestScore?: number;
          chapterNumber: number;
          difficulty: "normal" | "hard" | "legendary";
          firstCompletedAt?: number;
          lastAttemptedAt?: number;
          starsEarned: number;
          status: "locked" | "available" | "in_progress" | "completed";
          timesAttempted: number;
          timesCompleted: number;
          userId: string;
        },
        string
      >;
      upsertStageProgress: FunctionReference<
        "mutation",
        "internal",
        {
          bestScore?: number;
          chapterId: string;
          firstClearClaimed: boolean;
          lastCompletedAt?: number;
          stageId: string;
          stageNumber: number;
          starsEarned: number;
          status: "locked" | "available" | "completed" | "starred";
          timesCompleted: number;
          userId: string;
        },
        string
      >;
    };
    seeds: {
      seedChapters: FunctionReference<
        "mutation",
        "internal",
        { chapters: Array<any> },
        number
      >;
      seedStages: FunctionReference<
        "mutation",
        "internal",
        { stages: Array<any> },
        number
      >;
    };
    stages: {
      createStage: FunctionReference<
        "mutation",
        "internal",
        {
          aiDifficulty?: "easy" | "medium" | "hard" | "boss";
          cardRewardId?: string;
          chapterId: string;
          description: string;
          difficulty?: "easy" | "medium" | "hard" | "boss";
          firstClearBonus?:
            | { gems?: number; gold?: number; xp?: number }
            | number;
          firstClearGems?: number;
          firstClearGold?: number;
          name?: string;
          opponentDeckArchetype?: string;
          opponentDeckId?: string;
          opponentName?: string;
          postMatchLoseDialogue?: Array<{ speaker: string; text: string }>;
          postMatchWinDialogue?: Array<{ speaker: string; text: string }>;
          preMatchDialogue?: Array<{
            imageUrl?: string;
            speaker: string;
            text: string;
          }>;
          repeatGold?: number;
          rewardGold?: number;
          rewardXp?: number;
          stageNumber: number;
          status?: "draft" | "published";
          title?: string;
        },
        string
      >;
      getStage: FunctionReference<
        "query",
        "internal",
        { stageId: string },
        any
      >;
      getStages: FunctionReference<
        "query",
        "internal",
        { chapterId: string },
        any
      >;
      updateStage: FunctionReference<
        "mutation",
        "internal",
        { stageId: string; updates: any },
        null
      >;
    };
  };
};
