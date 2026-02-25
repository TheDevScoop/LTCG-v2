import { lazy, Suspense, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "@/router/react-router";
import { useGameState, type Seat } from "./hooks/useGameState";
import { useGameActions } from "./hooks/useGameActions";
import { useVisualEvents, useScreenShake } from "./hooks/useVisualEvents";
import { useAudio } from "@/components/audio/AudioProvider";
import { apiAny, useConvexQuery } from "@/lib/convexHelpers";
import { LPBar } from "./LPBar";
import { PhaseBar } from "./PhaseBar";
import { PlayerHand } from "./PlayerHand";
import { ChainPrompt } from "./ChainPrompt";
import { CardDetailOverlay } from "./CardDetailOverlay";
import { TributeSelector } from "./TributeSelector";
import { AttackTargetSelector } from "./AttackTargetSelector";
import { TargetSelector, type TargetCandidate } from "./TargetSelector";
import { CostConfirmation, type EffectCost } from "./CostConfirmation";
import { GraveyardBrowser } from "./GraveyardBrowser";
import { GameOverOverlay } from "./GameOverOverlay";
import { RematchOverlay } from "./RematchOverlay";
import { FieldRow } from "./FieldRow";
import { SpellTrapRow } from "./SpellTrapRow";
import { GameMotionOverlay } from "./GameMotionOverlay";
import { GameEffectsLayer } from "./GameEffectsLayer";
import { GameLog } from "./GameLog";
import { TurnBanner } from "./TurnBanner";
import { AnimatePresence } from "framer-motion";
import { BrandedLoader } from "@/components/layout/BrandedLoader";
import type { Phase } from "./types";

const MAX_BOARD_SLOTS = 3;
const MAX_SPELL_TRAP_SLOTS = 3;
const FRAME_MS = 1000 / 60;
const LazyPongOverlay = lazy(async () => {
  const module = await import("./pong/PongOverlay");
  return { default: module.PongOverlay };
});

const AMBIENT_MOTES = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  left: 10 + Math.round((i / 9) * 80),
  delay: Math.round(i * 0.8 * 10) / 10,
  duration: 6 + (i % 5),
  opacity: 0.05 + (i % 3) * 0.05,
}));

type LaneSnapshot = {
  lane: number;
  occupied: boolean;
  cardId?: string;
  definitionId?: string;
  name?: string;
  position?: "attack" | "defense";
  faceDown?: boolean;
  canAttack?: boolean;
  hasAttackedThisTurn?: boolean;
  attack?: number;
  defense?: number;
  viceCounters?: number;
};

type SpellTrapLaneSnapshot = {
  lane: number;
  occupied: boolean;
  cardId?: string;
  definitionId?: string;
  name?: string;
  faceDown?: boolean;
  activated?: boolean;
};

/**
 * Build TargetCandidate[] from the current PlayerView based on an effect's targetFilter.
 */
function buildTargetCandidates(
  view: any,
  filter: { zone?: string; owner?: string; cardType?: string } | undefined,
): TargetCandidate[] {
  if (!view || !filter) return [];
  const candidates: TargetCandidate[] = [];
  const instanceDefinitions =
    typeof view?.instanceDefinitions === "object" && view.instanceDefinitions !== null
      ? (view.instanceDefinitions as Record<string, string>)
      : {};
  const zone = filter.zone ?? "board";
  const owner = filter.owner ?? "opponent";

  const addFromZone = (
    cards: any[],
    ownerLabel: "player" | "opponent",
    zoneLabel: "board" | "spellTrap" | "hand" | "graveyard",
  ) => {
    for (const card of cards) {
      const id = card.cardId ?? card;
      const defId = card.definitionId ?? instanceDefinitions[id] ?? id;
      candidates.push({
        cardId: id,
        definitionId: defId,
        owner: ownerLabel,
        zone: zoneLabel,
        faceDown: card.faceDown,
        position: card.position,
      });
    }
  };

  if (zone === "board") {
    if (owner === "opponent" || owner === "any") addFromZone(view.opponentBoard ?? [], "opponent", "board");
    if (owner === "self" || owner === "any") addFromZone(view.board ?? [], "player", "board");
  } else if (zone === "graveyard") {
    if (owner === "opponent" || owner === "any") {
      addFromZone(
        (view.opponentGraveyard ?? []).map((id: string) => ({
          cardId: id,
          definitionId: instanceDefinitions[id] ?? id,
        })),
        "opponent",
        "graveyard",
      );
    }
    if (owner === "self" || owner === "any") {
      addFromZone(
        (view.graveyard ?? []).map((id: string) => ({
          cardId: id,
          definitionId: instanceDefinitions[id] ?? id,
        })),
        "player",
        "graveyard",
      );
    }
  } else if (zone === "hand") {
    if (owner === "self" || owner === "any") {
      addFromZone(
        (view.hand ?? []).map((id: string) => ({
          cardId: id,
          definitionId: instanceDefinitions[id] ?? id,
        })),
        "player",
        "hand",
      );
    }
  }

  return candidates;
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => Promise<void>;
  }
}

interface GameBoardProps {
  matchId: string;
  seat: Seat;
  actorUserId?: string;
  playerPlatformTag?: string;
  opponentPlatformTag?: string;
  onMatchEnd?: (result: {
    result: "win" | "loss" | "draw";
    winner?: string | null;
    playerLP: number;
    opponentLP: number;
  }) => void;
}

export function GameBoard({
  matchId,
  seat,
  actorUserId,
  playerPlatformTag,
  opponentPlatformTag,
  onMatchEnd,
}: GameBoardProps) {
  const navigate = useNavigate();
  const { playSfx } = useAudio();
  const {
    meta,
    view,
    cardLookup,
    isMyTurn,
    phase,
    gameOver,
    validActions,
    parseError,
    isLoading,
    notFound,
    openPrompt,
    latestSnapshotVersion,
  } = useGameState(matchId, seat, actorUserId);
  const actions = useGameActions(matchId, seat, latestSnapshotVersion);
  const vfx = useVisualEvents();
  const playerLP = view?.lifePoints ?? 0;
  const opponentLP = view?.opponentLifePoints ?? 0;
  const isShaking = useScreenShake(playerLP);
  const prevBoardRef = useRef<Set<string>>(new Set());
  const prevOpponentBoardRef = useRef<Set<string>>(new Set());
  const endSfxPlayedRef = useRef(false);
  const matchEndNotifiedRef = useRef(false);
  const pendingMatchEndRef = useRef(onMatchEnd);

  const isCanonicalChainPromptOpen =
    (view?.currentChain?.length ?? 0) > 0 &&
    view?.currentPriorityPlayer === view?.mySeat;
  const isChainPromptOpen = isCanonicalChainPromptOpen || Boolean(openPrompt);
  const chainData = (openPrompt?.data ?? {}) as Record<string, unknown>;
  const activeChainLink =
    isCanonicalChainPromptOpen && Array.isArray(view?.currentChain) && view.currentChain.length > 0
      ? view.currentChain[view.currentChain.length - 1]
      : null;
  const maxBoardSlots = view?.maxBoardSlots ?? MAX_BOARD_SLOTS;
  const maxSpellTrapSlots = view?.maxSpellTrapSlots ?? MAX_SPELL_TRAP_SLOTS;
  const playerSeat = view?.mySeat;
  const winner = view?.winner ?? meta?.winner;
  const ended = gameOver || meta?.status === "ended";
  const result: "win" | "loss" | "draw" =
    winner && playerSeat
      ? winner === playerSeat
        ? "win"
        : "loss"
      : playerLP > opponentLP
        ? "win"
        : playerLP < opponentLP
          ? "loss"
          : "draw";

  pendingMatchEndRef.current = onMatchEnd;

  const instanceDefinitions = view?.instanceDefinitions ?? {};
  const resolveDefinitionId = useCallback(
    (cardId: string | null | undefined, fallbackDefinitionId?: string | null) => {
      if (!cardId && !fallbackDefinitionId) return undefined;
      if (fallbackDefinitionId && fallbackDefinitionId !== "hidden") {
        return fallbackDefinitionId;
      }
      if (cardId && instanceDefinitions[cardId]) {
        return instanceDefinitions[cardId];
      }
      return cardId ?? undefined;
    },
    [instanceDefinitions],
  );
  const getDefinitionById = useCallback(
    (cardId: string | null | undefined, fallbackDefinitionId?: string | null) => {
      const definitionId = resolveDefinitionId(cardId, fallbackDefinitionId);
      if (!definitionId) return undefined;
      return cardLookup[definitionId];
    },
    [cardLookup, resolveDefinitionId],
  );

  const chainOpponentCardName = (() => {
    if (activeChainLink?.cardId) {
      const cardInZones =
        view?.board?.find((c: any) => c.cardId === activeChainLink.cardId) ??
        view?.spellTrapZone?.find((c: any) => c.cardId === activeChainLink.cardId) ??
        view?.opponentBoard?.find((c: any) => c.cardId === activeChainLink.cardId) ??
        view?.opponentSpellTrapZone?.find((c: any) => c.cardId === activeChainLink.cardId);
      const definition = getDefinitionById(
        activeChainLink.cardId,
        cardInZones?.definitionId ?? null,
      );
      if (definition?.name) return definition.name;
    }

    const directName = chainData.opponentCardName;
    if (typeof directName === "string" && directName.trim()) return directName;

    const directDefId =
      typeof chainData.opponentCardDefinitionId === "string"
        ? chainData.opponentCardDefinitionId
        : typeof chainData.opponentDefinitionId === "string"
          ? chainData.opponentDefinitionId
          : undefined;
    if (directDefId) {
      const definition = cardLookup[directDefId];
      if (definition) return definition.name ?? "Opponent Card";
    }

    const directCardId =
      typeof chainData.opponentCardId === "string"
        ? chainData.opponentCardId
        : typeof chainData.cardId === "string"
          ? chainData.cardId
          : undefined;
    if (directCardId) {
      const opponentCard =
        view?.opponentBoard?.find((c: any) => c.cardId === directCardId) ??
        view?.opponentSpellTrapZone?.find((c: any) => c.cardId === directCardId);
      const definition = getDefinitionById(
        directCardId,
        opponentCard?.definitionId ?? null,
      );
      if (definition) return definition.name ?? "Opponent Card";
    }

    return "Opponent Card";
  })();

  const chainActivatableTraps = (() => {
    if (isCanonicalChainPromptOpen && Array.isArray(view?.spellTrapZone)) {
      return view.spellTrapZone
        .filter((card: any) => card?.faceDown)
        .map((card: any) => {
          const definition = cardLookup[card.definitionId];
          if (!definition) return null;
          if (definition.type !== "trap" && definition.cardType !== "trap") return null;
          return { cardId: card.cardId, name: "Set Trap" };
        })
        .filter((entry): entry is { cardId: string; name: string } => Boolean(entry));
    }

    let rawTraps = chainData.activatableTraps;
    if (!Array.isArray(rawTraps)) {
      rawTraps = chainData.activatableTrapIds;
    }
    if (!Array.isArray(rawTraps)) return [];

    return rawTraps
      .map((entry: unknown) => {
        if (typeof entry === "string") {
          const stCard = view?.spellTrapZone?.find((st: any) => st.cardId === entry);
          const definitionId = resolveDefinitionId(entry, stCard?.definitionId ?? null);
          return {
            cardId: entry,
            name: stCard?.faceDown
              ? "Set Trap"
              : (definitionId ? cardLookup[definitionId]?.name : undefined) ?? "Set Trap",
          };
        }

        if (!entry || typeof entry !== "object") return null;
        const entryObj = entry as Record<string, unknown>;
        const cardId = typeof entryObj.cardId === "string" ? entryObj.cardId : undefined;
        const definitionId =
          typeof entryObj.cardDefinitionId === "string"
            ? entryObj.cardDefinitionId
            : typeof entryObj.definitionId === "string"
              ? entryObj.definitionId
              : resolveDefinitionId(cardId, null);
        if (!cardId) return null;

        return {
          cardId,
          name:
            (typeof entryObj.name === "string" && entryObj.name.trim()) ||
            (definitionId ? cardLookup[definitionId]?.name : undefined) ||
            "Set Trap",
        };
      })
      .filter((entry): entry is { cardId: string; name: string } => Boolean(entry));
  })();

  // Quick-play spells activatable during chain
  const chainActivatableQuickPlays = useMemo(() => {
    if (!isCanonicalChainPromptOpen || !Array.isArray(view?.spellTrapZone)) return [];
    return view.spellTrapZone
      .filter((card: any) => card?.faceDown)
      .map((card: any) => {
        const definition = cardLookup[card.definitionId];
        if (!definition) return null;
        const isSpell = definition.type === "spell" || definition.cardType === "spell";
        const isQuickPlay = (definition as any).spellType === "quick-play" || (definition as any).spellType === "quickplay";
        if (!isSpell || !isQuickPlay) return null;
        return { cardId: card.cardId, name: definition.name ?? "Quick-Play Spell" };
      })
      .filter((entry): entry is { cardId: string; name: string } => Boolean(entry));
  }, [isCanonicalChainPromptOpen, view?.spellTrapZone, cardLookup]);

  // Current user for rematch overlay
  const currentUser = useConvexQuery(apiAny.auth.currentUser, {}) as
    | { _id: string }
    | null
    | undefined;

  // Check if this is a PvP match (for rematch feature)
  const isPvpMatch = meta?.mode === "pvp";

  // Selection state
  const [selectedHandCard, setSelectedHandCard] = useState<string | null>(null);
  const [selectedBoardCard, setSelectedBoardCard] = useState<string | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showTributeSelector, setShowTributeSelector] = useState(false);
  const [showAttackTargets, setShowAttackTargets] = useState(false);
  const [showTargetSelector, setShowTargetSelector] = useState(false);
  const [targetSelectorContext, setTargetSelectorContext] = useState<{
    candidates: TargetCandidate[];
    targetCount: number;
    effectDescription: string;
    callback: (targetIds: string[]) => void;
  } | null>(null);
  const [showCostConfirmation, setShowCostConfirmation] = useState(false);
  const [costConfirmContext, setCostConfirmContext] = useState<{
    cardName: string;
    cost: EffectCost;
    callback: () => void;
  } | null>(null);
  const [showGraveyard, setShowGraveyard] = useState<{
    zone: "graveyard" | "banished";
    owner: "player" | "opponent";
  } | null>(null);
  const [pendingSummonPosition, setPendingSummonPosition] = useState<"attack" | "defense" | null>(
    null,
  );
  const [showBoardCardDetail, setShowBoardCardDetail] = useState(false);
  const [showSurrenderConfirm, setShowSurrenderConfirm] = useState(false);

  // Compute playable card IDs for hand highlighting
  const playableIds = new Set<string>();
  for (const [id] of validActions.canSummon) playableIds.add(id);
  for (const id of validActions.canSetMonster) playableIds.add(id);
  for (const id of validActions.canSetSpellTrap) playableIds.add(id);
  for (const id of validActions.canActivateSpell) playableIds.add(id);

  // Compute attackable monster IDs for board highlighting
  const attackableIds = new Set(validActions.canAttack.keys());

  // Compute flip-summonable monster IDs for board highlighting
  const flipSummonIds = validActions.canFlipSummon;

  // Compute effect-activatable monster IDs for board highlighting
  const effectActivatableIds = new Set(validActions.canActivateEffect.keys());

  // Compute activatable set spell/trap IDs for backrow highlighting
  const activatableSTIds = new Set([
    ...validActions.canActivateSpell,
    ...validActions.canActivateTrap,
  ]);

  // Click handlers
  const handleHandCardClick = useCallback(
    (cardId: string) => {
      if (isChainPromptOpen) return;
      setSelectedHandCard(cardId);
      setShowActionSheet(true);
    },
    [isChainPromptOpen],
  );

  const handleBoardCardClick = useCallback(
    (cardId: string) => {
      if (isChainPromptOpen) return;
      // Combat phase: declare attack
      if (phase === "combat" && attackableIds.has(cardId)) {
        setSelectedBoardCard(cardId);
        setShowAttackTargets(true);
        return;
      }

      // Main phase: flip summon
      if ((phase === "main" || phase === "main2") && flipSummonIds.has(cardId)) {
        actions.flipSummon(cardId);
        return;
      }

      // Any phase: open board card detail (shows card info + activate effect)
      setSelectedBoardCard(cardId);
      setShowBoardCardDetail(true);
    },
    [isChainPromptOpen, phase, attackableIds, flipSummonIds, actions],
  );

  // ActionSheet callbacks (stubbed until ActionSheet exists)
  const handleActionSheetSummon = useCallback(
    (position: "attack" | "defense") => {
      if (isChainPromptOpen) return;
      if (!selectedHandCard) return;
      actions.summon(selectedHandCard, position);
      setSelectedHandCard(null);
      setShowActionSheet(false);
    },
    [isChainPromptOpen, selectedHandCard, actions],
  );

  const handleActionSheetSetMonster = useCallback(() => {
    if (isChainPromptOpen) return;
    if (!selectedHandCard) return;
    actions.setMonster(selectedHandCard);
    setSelectedHandCard(null);
    setShowActionSheet(false);
  }, [isChainPromptOpen, selectedHandCard, actions]);

  const handleActionSheetSetSpellTrap = useCallback(() => {
    if (isChainPromptOpen) return;
    if (!selectedHandCard) return;
    actions.setSpellTrap(selectedHandCard);
    setSelectedHandCard(null);
    setShowActionSheet(false);
  }, [isChainPromptOpen, selectedHandCard, actions]);

  const handleActionSheetActivateSpell = useCallback(() => {
    if (isChainPromptOpen) return;
    if (!selectedHandCard) return;

    // Check if this spell has effects that require targets
    const def = getDefinitionById(selectedHandCard, null);
    const spellName = def?.name ?? "Spell";
    const effectDef = def?.effects?.[0];
    if (effectDef?.targetFilter && (effectDef.targetCount ?? 0) > 0) {
      const candidates = buildTargetCandidates(view, effectDef.targetFilter);
      if (candidates.length > 0) {
        const cardId = selectedHandCard;
        setShowActionSheet(false);
        setSelectedHandCard(null);
        setTargetSelectorContext({
          candidates,
          targetCount: effectDef.targetCount ?? 1,
          effectDescription: effectDef.description ?? def?.shortEffect ?? "Select a target",
          callback: (targetIds: string[]) => {
            vfx.push("spell_flash", { cardName: spellName });
            actions.activateSpell(cardId, targetIds);
          },
        });
        setShowTargetSelector(true);
        return;
      }
    }

    vfx.push("spell_flash", { cardName: spellName });
    actions.activateSpell(selectedHandCard);
    setSelectedHandCard(null);
    setShowActionSheet(false);
  }, [isChainPromptOpen, selectedHandCard, actions, cardLookup, view, vfx]);

  const handleActionSheetClose = useCallback(() => {
    setSelectedHandCard(null);
    setShowActionSheet(false);
  }, []);

  const handleBoardCardDetailClose = useCallback(() => {
    setSelectedBoardCard(null);
    setShowBoardCardDetail(false);
  }, []);

  const handleActivateEffect = useCallback(
    (effectIndex: number) => {
      if (isChainPromptOpen || !selectedBoardCard) return;

      // Check if this effect needs targets
      const boardCard = (view?.board ?? []).find((c: any) => c.cardId === selectedBoardCard);
      const def = boardCard ? cardLookup[boardCard.definitionId] : null;
      const effectName = def?.name ?? "Effect";
      const effectDef = def?.effects?.[effectIndex];
      if (effectDef?.targetFilter && (effectDef.targetCount ?? 0) > 0) {
        const candidates = buildTargetCandidates(view, effectDef.targetFilter);
        if (candidates.length > 0) {
          const cardId = selectedBoardCard;
          setShowBoardCardDetail(false);
          setSelectedBoardCard(null);
          setTargetSelectorContext({
            candidates,
            targetCount: effectDef.targetCount ?? 1,
            effectDescription: effectDef.description ?? def?.shortEffect ?? "Select a target",
            callback: (targetIds: string[]) => {
              vfx.push("effect_burst", { cardName: effectName });
              actions.activateEffect(cardId, effectIndex, targetIds);
            },
          });
          setShowTargetSelector(true);
          return;
        }
      }

      vfx.push("effect_burst", { cardName: effectName });
      actions.activateEffect(selectedBoardCard, effectIndex);
      setSelectedBoardCard(null);
      setShowBoardCardDetail(false);
    },
    [isChainPromptOpen, selectedBoardCard, actions, cardLookup, view, vfx],
  );

  const handleChangePosition = useCallback(() => {
    if (isChainPromptOpen || !selectedBoardCard) return;
    actions.changePosition(selectedBoardCard);
    setSelectedBoardCard(null);
    setShowBoardCardDetail(false);
  }, [isChainPromptOpen, selectedBoardCard, actions]);

  // TributeSelector callback (stubbed until TributeSelector exists)
  const handleTributeConfirm = useCallback(
    (tributeIds: string[]) => {
      if (isChainPromptOpen) return;
      if (!selectedHandCard || !pendingSummonPosition) return;
      actions.summon(selectedHandCard, pendingSummonPosition, tributeIds);
      setSelectedHandCard(null);
      setPendingSummonPosition(null);
      setShowTributeSelector(false);
    },
    [isChainPromptOpen, selectedHandCard, pendingSummonPosition, actions],
  );

  // AttackTargetSelector callbacks
  const handleAttackTarget = useCallback(
    (targetId?: string) => {
      if (isChainPromptOpen) return;
      if (!selectedBoardCard) return;
      vfx.push("attack_slash", undefined, 800);
      actions.declareAttack(selectedBoardCard, targetId);
      setSelectedBoardCard(null);
      setShowAttackTargets(false);
    },
    [isChainPromptOpen, selectedBoardCard, actions, vfx],
  );

  const handleSurrender = useCallback(() => {
    if (isChainPromptOpen) return;
    if (!showSurrenderConfirm) {
      setShowSurrenderConfirm(true);
      return;
    }
    actions.surrender();
    setShowSurrenderConfirm(false);
  }, [isChainPromptOpen, showSurrenderConfirm, actions]);

  const handleChainActivate = useCallback(
    (cardId: string) => {
      actions.chainResponse(cardId, false);
    },
    [actions],
  );

  const handleChainPass = useCallback(() => {
    actions.chainResponse(undefined, true);
  }, [actions]);

  useEffect(() => {
    if (!isChainPromptOpen) return;
    setSelectedHandCard(null);
    setSelectedBoardCard(null);
    setShowActionSheet(false);
    setShowTributeSelector(false);
    setShowAttackTargets(false);
    setShowBoardCardDetail(false);
    setShowSurrenderConfirm(false);
    setPendingSummonPosition(null);
    setShowGraveyard(null);
    setShowTargetSelector(false);
    setTargetSelectorContext(null);
    setShowCostConfirmation(false);
    setCostConfirmContext(null);
  }, [isChainPromptOpen]);

  // Auto-advance non-interactive phases
  const autoAdvancePhases = new Set(["draw", "standby", "breakdown_check", "end"]);
  useEffect(() => {
    if (!isMyTurn || ended || isChainPromptOpen || actions.submitting) return;

    // Auto-skip draw, standby, breakdown_check, end phases
    if (autoAdvancePhases.has(phase)) {
      const timer = setTimeout(() => actions.advancePhase(), 400);
      return () => clearTimeout(timer);
    }

    // Auto-skip combat if player has no attackable monsters
    if (phase === "combat") {
      const hasAttacker = validActions.canAttack.size > 0;
      if (!hasAttacker) {
        const timer = setTimeout(() => actions.advancePhase(), 400);
        return () => clearTimeout(timer);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isMyTurn, ended, isChainPromptOpen, actions.submitting, validActions.canAttack.size]);

  useEffect(() => {
    if (!ended) {
      endSfxPlayedRef.current = false;
      return;
    }
    if (endSfxPlayedRef.current) return;

    if (winner && playerSeat) {
      if (winner === playerSeat) playSfx("victory");
      else playSfx("defeat");
    } else {
      playSfx("draw");
    }

    endSfxPlayedRef.current = true;
  }, [ended, winner, playerSeat, playSfx]);

  useEffect(() => {
    if (!ended || !playerSeat || !pendingMatchEndRef.current) return;
    if (matchEndNotifiedRef.current) return;

    matchEndNotifiedRef.current = true;
    pendingMatchEndRef.current({
      result,
      winner,
      playerLP,
      opponentLP,
    });
  }, [ended, playerSeat, result, winner, playerLP, opponentLP]);

  // Extract field data from view (safe defaults keep hook order stable before early returns)
  const playerBoard = view?.board ?? [];
  const opponentBoard = view?.opponentBoard ?? [];
  const playerSpellTraps = view?.spellTrapZone ?? [];
  const opponentSpellTraps = view?.opponentSpellTrapZone ?? [];
  const hand = view?.hand ?? [];
  const playerGraveyard = view?.graveyard ?? [];
  const playerBanished = view?.banished ?? [];
  const opponentGraveyard = view?.opponentGraveyard ?? [];
  const opponentBanished = view?.opponentBanished ?? [];

  // Detect card destruction from board state changes
  useEffect(() => {
    const currentPlayerIds = new Set(playerBoard.map((c: any) => c.cardId));
    const currentOpponentIds = new Set(opponentBoard.map((c: any) => c.cardId));

    // Player board cards that disappeared
    for (const id of prevBoardRef.current) {
      if (!currentPlayerIds.has(id)) {
        const defId = resolveDefinitionId(
          id,
          playerBoard.find?.((c: any) => c.cardId === id)?.definitionId ?? null,
        );
        const name = (defId ? cardLookup[defId]?.name : undefined) ?? "Card";
        vfx.push("card_destroyed", { cardName: name }, 1200);
      }
    }

    // Opponent board cards that disappeared
    for (const id of prevOpponentBoardRef.current) {
      if (!currentOpponentIds.has(id)) {
        const prevCard = opponentBoard.find?.((c: any) => c.cardId === id);
        const defId = resolveDefinitionId(id, prevCard?.definitionId ?? null);
        const name = (defId ? cardLookup[defId]?.name : undefined) ?? "Card";
        vfx.push("card_destroyed", { cardName: name }, 1200);
      }
    }

    prevBoardRef.current = currentPlayerIds;
    prevOpponentBoardRef.current = currentOpponentIds;
  }, [playerBoard, opponentBoard, cardLookup, resolveDefinitionId, vfx]);

  const renderGameToText = useCallback(() => {
    if (!view) {
      return JSON.stringify({
        mode: "ltcg_play_match",
        match: {
          matchId,
          seat,
          status: meta?.status ?? "unknown",
          loading: isLoading,
          notFound,
        },
      });
    }

    const payload = {
      mode: "ltcg_play_match",
      coordinateSystem: {
        boardLaneIndex: "0..2 left-to-right from the local player's perspective",
        spellTrapLaneIndex: "0..2 left-to-right from the local player's perspective",
      },
      match: {
        matchId,
        seat,
        mySeat: playerSeat ?? null,
        status: meta?.status ?? "unknown",
        phase,
        turnNumber: view.turnNumber,
        isMyTurn,
        latestSnapshotVersion: latestSnapshotVersion ?? null,
      },
      player: {
        lifePoints: playerLP,
        deckCount: view.deckCount,
        handCount: hand.length,
          hand: hand.map((cardId, handIndex) => ({
          handIndex,
          cardId,
          name: getDefinitionById(cardId, null)?.name ?? "Unknown",
          playable: playableIds.has(cardId),
        })),
        board: serializeBoardLanes(playerBoard, cardLookup, MAX_BOARD_SLOTS),
        spellTrapZone: serializeSpellTrapLanes(playerSpellTraps, cardLookup, MAX_SPELL_TRAP_SLOTS),
        graveyardCount: playerGraveyard.length,
        banishedCount: playerBanished.length,
      },
      opponent: {
        lifePoints: opponentLP,
        deckCount: view.opponentDeckCount,
        handCount: view.opponentHandCount,
        board: serializeBoardLanes(opponentBoard, cardLookup, MAX_BOARD_SLOTS),
        spellTrapZone: serializeSpellTrapLanes(opponentSpellTraps, cardLookup, MAX_SPELL_TRAP_SLOTS),
        graveyardCount: opponentGraveyard.length,
        banishedCount: opponentBanished.length,
      },
      chain: {
        promptOpen: isChainPromptOpen,
        promptType: openPrompt?.promptType ?? null,
        chainDepth: view.currentChain.length,
        activatableTrapCount: chainActivatableTraps.length,
      },
      actions: {
        canEndTurn: isMyTurn && !actions.submitting && !isChainPromptOpen,
        canSurrender: !actions.submitting && !isChainPromptOpen,
        actionCounts: {
          summon: validActions.canSummon.size,
          setMonster: validActions.canSetMonster.size,
          setSpellTrap: validActions.canSetSpellTrap.size,
          activateSpell: validActions.canActivateSpell.size,
          activateTrap: validActions.canActivateTrap.size,
          canAttackWith: validActions.canAttack.size,
          flipSummon: validActions.canFlipSummon.size,
        },
      },
      overlays: {
        actionSheetOpen: showActionSheet,
        tributeSelectorOpen: showTributeSelector,
        attackTargetSelectorOpen: showAttackTargets,
        graveyardBrowserOpen: showGraveyard
          ? `${showGraveyard.owner}:${showGraveyard.zone}`
          : null,
        surrenderConfirmOpen: showSurrenderConfirm,
      },
      result: {
        ended,
        winner: winner ?? null,
        outcome: result,
      },
    };

    return JSON.stringify(payload);
  }, [
    actions.submitting,
    cardLookup,
    chainActivatableTraps.length,
    ended,
    getDefinitionById,
    hand,
    isChainPromptOpen,
    isLoading,
    isMyTurn,
    latestSnapshotVersion,
    matchId,
    meta?.status,
    notFound,
    openPrompt?.promptType,
    opponentBanished.length,
    opponentBoard,
    opponentGraveyard.length,
    opponentLP,
    opponentSpellTraps,
    phase,
    playableIds,
    playerBanished.length,
    playerBoard,
    playerGraveyard.length,
    playerLP,
    playerSeat,
    playerSpellTraps,
    result,
    seat,
    showActionSheet,
    showAttackTargets,
    showGraveyard,
    showSurrenderConfirm,
    showTributeSelector,
    validActions.canActivateSpell.size,
    validActions.canActivateTrap.size,
    validActions.canAttack.size,
    validActions.canFlipSummon.size,
    validActions.canSetMonster.size,
    validActions.canSetSpellTrap.size,
    validActions.canSummon.size,
    view,
    winner,
  ]);

  useEffect(() => {
    window.render_game_to_text = renderGameToText;
    return () => {
      if (window.render_game_to_text === renderGameToText) {
        delete window.render_game_to_text;
      }
    };
  }, [renderGameToText]);

  useEffect(() => {
    const advance = async (ms: number) => {
      const safeMs = Number.isFinite(ms) && ms > 0 ? ms : FRAME_MS;
      const steps = Math.max(1, Math.round(safeMs / FRAME_MS));
      for (let index = 0; index < steps; index += 1) {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
      }
    };

    window.advanceTime = advance;

    return () => {
      if (window.advanceTime === advance) {
        delete window.advanceTime;
      }
    };
  }, []);

  // Loading/error states
  if (isLoading) {
    return <BrandedLoader variant="dark" message="Loading match..." />;
  }

  if (notFound) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-[#1a1816]">
        <p className="text-white/40 font-bold uppercase text-sm">Match not found.</p>
        <button
          onClick={() => navigate(-1)}
          className="tcg-button mt-4 px-6 py-2 text-sm"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (!view) {
    const isWaitingMatch = meta?.status === "waiting";
    if (isWaitingMatch) {
      return (
        <div className="h-dvh flex flex-col items-center justify-center bg-[#1a1816]">
          <p className="text-white/70 font-bold uppercase text-sm">Waiting for opponent…</p>
          <p className="mt-2 text-xs text-white/40 font-mono">{matchId}</p>
          <button
            onClick={() => navigate(-1)}
            className="tcg-button mt-4 px-6 py-2 text-sm"
          >
            Back
          </button>
        </div>
      );
    }

    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-[#1a1816]">
        <p className="text-white/40 font-bold uppercase text-sm">
          {parseError ? "Game state parse error." : "Failed to load game state."}
        </p>
        {parseError && (
          <p className="mt-2 max-w-md text-center text-xs text-white/30">{parseError}</p>
        )}
        <div className="flex gap-3 mt-4">
          <button
            onClick={() => window.location.reload()}
            className="tcg-button-primary px-6 py-2 text-sm"
          >
            Retry
          </button>
          <button
            onClick={() => navigate(-1)}
            className="tcg-button px-6 py-2 text-sm"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (ended) {
    if (onMatchEnd) {
      return <BrandedLoader variant="dark" message="Finishing match..." />;
    }

    return (
      <AnimatePresence>
        <GameOverOverlay
          result={result}
          playerLP={playerLP}
          opponentLP={opponentLP}
          onExit={() => navigate(isPvpMatch ? "/pvp" : "/story")}
        >
          {isPvpMatch && matchId && currentUser?._id && (
            <RematchOverlay matchId={matchId} currentUserId={currentUser._id} />
          )}
        </GameOverOverlay>
      </AnimatePresence>
    );
  }

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      {/* Atmosphere overlay */}
      <GameMotionOverlay phase={phase as Phase} isMyTurn={isMyTurn} />

      {/* Board playmat */}
      <div className={`board-playmat absolute inset-0 ${isShaking ? "animate-combat-impact-shake" : ""}`}>
        <div className="board-scanlines absolute inset-0 pointer-events-none" />

        {/* Ambient floating motes */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
          {AMBIENT_MOTES.map((mote) => (
            <div
              key={mote.id}
              className="board-ambient-mote"
              style={{
                left: `${mote.left}%`,
                ["--mote-delay" as string]: `${mote.delay}s`,
                ["--mote-duration" as string]: `${mote.duration}s`,
                ["--mote-opacity" as string]: mote.opacity,
              }}
            />
          ))}
        </div>

        {/* Perspective board container */}
        <div
          className="absolute inset-0 flex flex-col justify-center items-center px-4"
          style={{
            perspective: "900px",
          }}
        >
          <div
            className="w-full max-w-2xl flex flex-col gap-2"
            style={{
              transform: "rotateX(18deg)",
              transformStyle: "preserve-3d",
            }}
          >
            {/* Opponent spell/trap row */}
            <SpellTrapRow
              cards={opponentSpellTraps.map((c: any) => ({
                cardId: c.cardId,
                definitionId: c.definitionId,
                faceDown: Boolean(c.faceDown),
                activated: Boolean(c.activated),
              }))}
              cardLookup={cardLookup}
              maxSlots={maxSpellTrapSlots}
            />

            {/* Opponent monster row */}
            <FieldRow
              cards={opponentBoard}
              cardLookup={cardLookup}
              maxSlots={maxBoardSlots}
              reversed
            />

            {/* Center divider */}
            <div className="board-center-line my-1" />

            {/* Player monster row */}
            <FieldRow
              cards={playerBoard}
              cardLookup={cardLookup}
              maxSlots={maxBoardSlots}
              highlightIds={new Set([...attackableIds, ...flipSummonIds, ...effectActivatableIds])}
              onSlotClick={handleBoardCardClick}
            />

            {/* Player spell/trap row */}
            <SpellTrapRow
              cards={playerSpellTraps.map((c: any) => ({
                cardId: c.cardId,
                definitionId: c.definitionId,
                faceDown: Boolean(c.faceDown),
                activated: Boolean(c.activated),
              }))}
              cardLookup={cardLookup}
              maxSlots={maxSpellTrapSlots}
              interactive
              highlightIds={activatableSTIds}
              onSlotClick={(cardId: string) => {
                const stCard = playerSpellTraps.find((c: any) => c.cardId === cardId);
                if (!stCard) return;
                const def = cardLookup[stCard.definitionId];
                if (!def) return;

                const isTrap = stCard.faceDown && (def.type === "trap" || def.cardType === "trap");
                const isSpellBackrow = stCard.faceDown && (def.type === "spell" || def.cardType === "spell");
                const activateFn = isTrap
                  ? actions.activateTrap
                  : isSpellBackrow
                    ? actions.activateSpell
                    : null;
                if (!activateFn) return;

                const vfxType = isTrap ? "trap_snap" : "spell_flash";
                const stName = def.name ?? (isTrap ? "Trap" : "Spell");

                // Check if effect needs targets
                const effectDef = def.effects?.[0];
                if (effectDef?.targetFilter && (effectDef.targetCount ?? 0) > 0) {
                  const candidates = buildTargetCandidates(view, effectDef.targetFilter);
                  if (candidates.length > 0) {
                    setTargetSelectorContext({
                      candidates,
                      targetCount: effectDef.targetCount ?? 1,
                      effectDescription: effectDef.description ?? def?.shortEffect ?? "Select a target",
                      callback: (targetIds: string[]) => {
                        vfx.push(vfxType, { cardName: stName });
                        activateFn(cardId, targetIds);
                      },
                    });
                    setShowTargetSelector(true);
                    return;
                  }
                }

                vfx.push(vfxType, { cardName: stName });
                activateFn(cardId);
              }}
            />
          </div>
        </div>

        {/* Active field glow */}
        {isMyTurn && <div className="board-field-active absolute inset-0 pointer-events-none" />}
      </div>

      {/* === DOM Overlays === */}

      {/* Visual effects layer — attack slash, spell flash, destruction burst */}
      <GameEffectsLayer events={vfx.events} />

      {/* Turn announcement banner */}
      <TurnBanner turnNumber={view.turnNumber} isMyTurn={isMyTurn} />

      {/* === OPPONENT LP — top-center shield === */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4">
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-['Special_Elite'] text-[9px] text-white/25 uppercase">Hand {view.opponentHandCount}</span>
          <span className="font-['Special_Elite'] text-[9px] text-white/25 uppercase">Deck {view.opponentDeckCount}</span>
        </div>
        <div className="lp-shield">
          <span className="lp-shield-label">{opponentPlatformTag || "OPP"}</span>
          <LPBar lp={view.opponentLifePoints ?? 8000} maxLp={8000} label="" side="opponent" />
        </div>
        <span className="font-['Outfit'] font-black uppercase tracking-tighter text-[10px] text-white/30">
          T{view.turnNumber}
        </span>
      </div>

      {/* Phase Bar — centered overlay */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
        <PhaseBar
          currentPhase={phase as Phase}
          isMyTurn={isMyTurn}
          onAdvance={isChainPromptOpen ? () => {} : actions.advancePhase}
        />
      </div>

      {/* === PLAYER LP — bottom-left corner overlay === */}
      <div className="absolute bottom-[clamp(70px,11vh,110px)] left-3 z-20 flex items-center gap-2">
        <div className="lp-corner">
          <span className="lp-corner-label">{playerPlatformTag ? `YOU · ${playerPlatformTag}` : "YOU"}</span>
          <LPBar lp={view.lifePoints ?? 8000} maxLp={8000} label="" side="player" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="font-['Special_Elite'] text-[10px] text-white/30">DECK {view.deckCount}</span>
          <span className="font-['Special_Elite'] text-[10px] text-white/30">HAND {hand.length}</span>
        </div>
      </div>

      {/* === PLAYER HAND — docked to bottom edge === */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-2 overflow-visible">
        <PlayerHand
          hand={hand}
          cardLookup={cardLookup}
          instanceDefinitions={instanceDefinitions}
          playableIds={playableIds}
          onCardClick={handleHandCardClick}
        />
      </div>

      {/* Game Log */}
      <GameLog matchId={matchId} seat={seat} />

      {/* GY/Banished — left edge */}
      <div className="absolute left-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-20">
        <button type="button" onClick={() => setShowGraveyard({ zone: "graveyard", owner: "player" })} className="gy-btn relative w-9 h-9 flex items-center justify-center" title="Your Graveyard">
          <span className="font-['Outfit'] font-black text-[9px] text-white/60">GY</span>
          {playerGraveyard.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-white/80 text-[#121212] text-[7px] font-black flex items-center justify-center">{playerGraveyard.length}</span>}
        </button>
        <button type="button" onClick={() => setShowGraveyard({ zone: "banished", owner: "player" })} className="gy-btn relative w-9 h-9 flex items-center justify-center" title="Your Banished">
          <span className="font-['Outfit'] font-black text-[8px] text-white/60">BAN</span>
          {playerBanished.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-white/50 text-[#121212] text-[7px] font-black flex items-center justify-center">{playerBanished.length}</span>}
        </button>
      </div>

      {/* GY/Banished — right edge */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-1.5 z-20">
        <button type="button" onClick={() => setShowGraveyard({ zone: "graveyard", owner: "opponent" })} className="gy-btn relative w-9 h-9 flex items-center justify-center" title="Opponent GY">
          <span className="font-['Outfit'] font-black text-[8px] text-white/40">OGY</span>
          {opponentGraveyard.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-white/80 text-[#121212] text-[7px] font-black flex items-center justify-center">{opponentGraveyard.length}</span>}
        </button>
        <button type="button" onClick={() => setShowGraveyard({ zone: "banished", owner: "opponent" })} className="gy-btn relative w-9 h-9 flex items-center justify-center" title="Opponent Banished">
          <span className="font-['Outfit'] font-black text-[7px] text-white/40">OBAN</span>
          {opponentBanished.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-white/50 text-[#121212] text-[7px] font-black flex items-center justify-center">{opponentBanished.length}</span>}
        </button>
      </div>

      {/* End Turn / Surrender — bottom-right overlay */}
      <div className="absolute bottom-[clamp(70px,11vh,110px)] right-3 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setShowSurrenderConfirm(true)}
          className={`text-[10px] text-white/30 hover:text-white/60 underline ${showSurrenderConfirm ? "hidden" : ""}`}
          disabled={actions.submitting || isChainPromptOpen}
        >
          Surrender
        </button>
        {showSurrenderConfirm && (
          <div className="flex gap-2 items-center">
            <span className="text-[10px] text-white/40">Confirm?</span>
            <button type="button" onClick={handleSurrender} disabled={isChainPromptOpen} className="tcg-button-primary px-2 py-1 text-[10px]">Yes</button>
            <button type="button" onClick={() => setShowSurrenderConfirm(false)} disabled={isChainPromptOpen} className="tcg-button px-2 py-1 text-[10px]">No</button>
          </div>
        )}
        <button
          type="button"
          onClick={actions.endTurn}
          disabled={!isMyTurn || actions.submitting || isChainPromptOpen}
          className={`end-turn-btn px-5 py-1.5 text-xs font-black uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed ${
            isMyTurn && !isChainPromptOpen ? "end-turn-glow" : ""
          }`}
        >
          End Turn
        </button>
      </div>

      {isChainPromptOpen && (
        <ChainPrompt
          opponentCardName={chainOpponentCardName}
          activatableTraps={chainActivatableTraps}
          activatableQuickPlays={chainActivatableQuickPlays}
          chainLinks={view?.currentChain ?? []}
          cardLookup={cardLookup}
          onActivate={handleChainActivate}
          onPass={handleChainPass}
        />
      )}

      {/* Error Display */}
      {actions.error && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 paper-panel bg-red-50 border-2 border-red-600 px-4 py-2 max-w-md">
          <p className="text-xs text-red-600 font-bold uppercase">{actions.error}</p>
          <button type="button" onClick={actions.clearError} className="text-[10px] underline text-red-600 mt-1">Dismiss</button>
        </div>
      )}

      {/* Card Detail Overlay (hand card actions) */}
      {showActionSheet && selectedHandCard && (
        <CardDetailOverlay
          cardDef={getDefinitionById(selectedHandCard, null) ?? {}}
          location="hand"
          phase={phase}
          isMyTurn={isMyTurn}
          onSummon={handleActionSheetSummon}
          onSetMonster={handleActionSheetSetMonster}
          onSetSpellTrap={handleActionSheetSetSpellTrap}
          onActivateSpell={handleActionSheetActivateSpell}
          onClose={handleActionSheetClose}
        />
      )}

      {/* Board Card Detail Overlay */}
      {showBoardCardDetail && selectedBoardCard && (() => {
        const boardCard = playerBoard.find((c: any) => c.cardId === selectedBoardCard);
        if (!boardCard) return null;
        const def = cardLookup[boardCard.definitionId];
        return (
          <CardDetailOverlay
            cardDef={def ?? {}}
            location="board"
            phase={phase}
            isMyTurn={isMyTurn}
            onActivateEffect={handleActivateEffect}
            activatableEffects={validActions.canActivateEffect.get(selectedBoardCard!) ?? []}
            onChangePosition={handleChangePosition}
            canChangePosition={validActions.canChangePosition.has(selectedBoardCard!)}
            onClose={handleBoardCardDetailClose}
          />
        );
      })()}

      {/* Tribute Selector */}
      {showTributeSelector && (
        <TributeSelector
          board={playerBoard.map((card) => ({
            cardId: card.cardId,
            definitionId: card.definitionId,
            faceDown: Boolean(card.faceDown),
          }))}
          cardLookup={cardLookup}
          requiredCount={1}
          onConfirm={handleTributeConfirm}
          onCancel={() => {
            setShowTributeSelector(false);
            setPendingSummonPosition(null);
          }}
        />
      )}

      {/* Attack Target Selector */}
      {showAttackTargets && selectedBoardCard && (() => {
        const targets = validActions.canAttack.get(selectedBoardCard) ?? [];
        const attackerCard = playerBoard.find((c: any) => c.cardId === selectedBoardCard);
        const attackerDef = attackerCard
          ? getDefinitionById(attackerCard.cardId, attackerCard.definitionId)
          : null;
        const attackerAtk = (attackerDef?.attack ?? 0) + (attackerCard?.temporaryBoosts?.attack ?? 0);
        const opponentTargets = opponentBoard
          .filter((c: any) => targets.includes(c.cardId))
          .map((c: any) => ({
            cardId: c.cardId,
            definitionId: c.definitionId,
            faceDown: Boolean(c.faceDown),
            position: c.position ?? "attack",
          }));
        const canDirectAttack = targets.includes("");
        return (
          <AttackTargetSelector
            targets={opponentTargets}
            cardLookup={cardLookup}
            attackerAtk={attackerAtk}
            canDirectAttack={canDirectAttack}
            onSelectTarget={(targetId) => handleAttackTarget(targetId)}
            onDirectAttack={() => handleAttackTarget()}
            onCancel={() => {
              setSelectedBoardCard(null);
              setShowAttackTargets(false);
            }}
          />
        );
      })()}

      {/* Graveyard Browser */}
      {showGraveyard && (
        <GraveyardBrowser
          title={`${showGraveyard.owner === "player" ? "Your" : "Opponent"} ${showGraveyard.zone === "graveyard" ? "Graveyard" : "Banished Zone"}`}
          cardIds={
            showGraveyard.owner === "player"
              ? (showGraveyard.zone === "graveyard" ? playerGraveyard : playerBanished)
              : (showGraveyard.zone === "graveyard" ? opponentGraveyard : opponentBanished)
          }
          cardLookup={cardLookup}
          instanceDefinitions={instanceDefinitions}
          onClose={() => setShowGraveyard(null)}
        />
      )}

      {/* Beer Pong Overlay */}
      {view.pendingPong && view.pendingPong.seat === seat && (
        <Suspense fallback={null}>
          <LazyPongOverlay
            mode="combat"
            cardName={getDefinitionById(view.pendingPong.destroyedCardId, null)?.name ?? "Unknown Card"}
            onResult={(result) => actions.pongShoot(view.pendingPong!.destroyedCardId, result)}
            onDecline={() => actions.pongDecline(view.pendingPong!.destroyedCardId)}
          />
        </Suspense>
      )}
      {view.pendingRedemption && view.pendingRedemption.seat === seat && (
        <Suspense fallback={null}>
          <LazyPongOverlay
            mode="redemption"
            cardName=""
            onResult={(result) => actions.redemptionShoot(result)}
            onDecline={() => actions.redemptionDecline()}
          />
        </Suspense>
      )}

      {/* Target Selector Overlay */}
      {showTargetSelector && targetSelectorContext && (
        <TargetSelector
          effectDescription={targetSelectorContext.effectDescription}
          targets={targetSelectorContext.candidates}
          cardLookup={cardLookup}
          targetCount={targetSelectorContext.targetCount}
          onConfirm={(targetIds) => {
            targetSelectorContext.callback(targetIds);
            setShowTargetSelector(false);
            setTargetSelectorContext(null);
          }}
          onCancel={() => {
            setShowTargetSelector(false);
            setTargetSelectorContext(null);
          }}
        />
      )}

      {/* Cost Confirmation Overlay */}
      {showCostConfirmation && costConfirmContext && (
        <CostConfirmation
          cardName={costConfirmContext.cardName}
          cost={costConfirmContext.cost}
          onConfirm={() => {
            costConfirmContext.callback();
            setShowCostConfirmation(false);
            setCostConfirmContext(null);
          }}
          onCancel={() => {
            setShowCostConfirmation(false);
            setCostConfirmContext(null);
          }}
        />
      )}
    </div>
  );
}

function serializeBoardLanes(
  cards: Array<{
    cardId: string;
    definitionId: string;
    position?: "attack" | "defense";
    faceDown?: boolean;
    canAttack?: boolean;
    hasAttackedThisTurn?: boolean;
    viceCounters?: number;
    temporaryBoosts?: {
      attack?: number;
      defense?: number;
    };
  }>,
  cardLookup: Record<string, { name: string; attack?: number; defense?: number }>,
  laneCount: number,
): LaneSnapshot[] {
  return Array.from({ length: laneCount }, (_, lane) => {
    const card = cards[lane];
    if (!card) return { lane, occupied: false };

    const definition = cardLookup[card.definitionId];
    const attack = (definition?.attack ?? 0) + (card.temporaryBoosts?.attack ?? 0);
    const defense = (definition?.defense ?? 0) + (card.temporaryBoosts?.defense ?? 0);

    return {
      lane,
      occupied: true,
      cardId: card.cardId,
      definitionId: card.definitionId,
      name: definition?.name ?? "Unknown",
      position: card.position ?? "attack",
      faceDown: Boolean(card.faceDown),
      canAttack: Boolean(card.canAttack),
      hasAttackedThisTurn: Boolean(card.hasAttackedThisTurn),
      attack,
      defense,
      viceCounters: card.viceCounters ?? 0,
    };
  });
}

function serializeSpellTrapLanes(
  cards: Array<{
    cardId: string;
    definitionId: string;
    faceDown?: boolean;
    activated?: boolean;
  }>,
  cardLookup: Record<string, { name: string }>,
  laneCount: number,
): SpellTrapLaneSnapshot[] {
  return Array.from({ length: laneCount }, (_, lane) => {
    const card = cards[lane];
    if (!card) return { lane, occupied: false };

    return {
      lane,
      occupied: true,
      cardId: card.cardId,
      definitionId: card.definitionId,
      name: cardLookup[card.definitionId]?.name ?? "Set Spell/Trap",
      faceDown: Boolean(card.faceDown),
      activated: Boolean(card.activated),
    };
  });
}
