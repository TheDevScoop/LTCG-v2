import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { useGameState, type Seat } from "./hooks/useGameState";
import { useGameActions } from "./hooks/useGameActions";
import { useAudio } from "@/components/audio/AudioProvider";
import { LPBar } from "./LPBar";
import { PhaseBar } from "./PhaseBar";
import { FieldRow } from "./FieldRow";
import { PlayerHand } from "./PlayerHand";
import { ChainPrompt } from "./ChainPrompt";
import { ActionSheet } from "./ActionSheet";
import { TributeSelector } from "./TributeSelector";
import { AttackTargetSelector } from "./AttackTargetSelector";
import { GraveyardBrowser } from "./GraveyardBrowser";
import { GameOverOverlay } from "./GameOverOverlay";
import { GameMotionOverlay } from "./GameMotionOverlay";
import { AnimatePresence } from "framer-motion";
import type { Phase } from "./types";

const MAX_BOARD_SLOTS = 3;
const MAX_SPELL_TRAP_SLOTS = 3;

interface GameBoardProps {
  matchId: string;
  seat: Seat;
  onMatchEnd?: (result: {
    result: "win" | "loss" | "draw";
    winner?: string | null;
    playerLP: number;
    opponentLP: number;
  }) => void;
}

export function GameBoard({ matchId, seat, onMatchEnd }: GameBoardProps) {
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
    isLoading,
    notFound,
    openPrompt,
    latestSnapshotVersion,
  } = useGameState(matchId, seat);
  const actions = useGameActions(matchId, seat, latestSnapshotVersion);
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
  const playerLP = view?.lifePoints ?? 0;
  const opponentLP = view?.opponentLifePoints ?? 0;
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

  const chainOpponentCardName = (() => {
    if (activeChainLink?.cardId) {
      const cardInZones =
        view?.board?.find((c: any) => c.cardId === activeChainLink.cardId) ??
        view?.spellTrapZone?.find((c: any) => c.cardId === activeChainLink.cardId) ??
        view?.opponentBoard?.find((c: any) => c.cardId === activeChainLink.cardId) ??
        view?.opponentSpellTrapZone?.find((c: any) => c.cardId === activeChainLink.cardId);
      const definitionId = cardInZones?.definitionId ?? activeChainLink.cardId;
      const definition = cardLookup[definitionId];
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
      if (opponentCard?.definitionId) {
        const definition = cardLookup[opponentCard.definitionId];
        if (definition) return definition.name ?? "Opponent Card";
      }
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
          const definitionId = stCard?.definitionId ?? entry;
          return {
            cardId: entry,
            name: stCard?.faceDown
              ? "Set Trap"
              : (cardLookup[definitionId]?.name ?? "Set Trap"),
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
              : cardId;
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

  // Selection state
  const [selectedHandCard, setSelectedHandCard] = useState<string | null>(null);
  const [selectedBoardCard, setSelectedBoardCard] = useState<string | null>(null);
  const [showActionSheet, setShowActionSheet] = useState(false);
  const [showTributeSelector, setShowTributeSelector] = useState(false);
  const [showAttackTargets, setShowAttackTargets] = useState(false);
  const [showGraveyard, setShowGraveyard] = useState<{
    zone: "graveyard" | "banished";
    owner: "player" | "opponent";
  } | null>(null);
  const [pendingSummonPosition, setPendingSummonPosition] = useState<"attack" | "defense" | null>(
    null,
  );
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

  // Click handlers
  const handleHandCardClick = useCallback(
    (cardId: string) => {
      if (isChainPromptOpen) return;
      if (!playableIds.has(cardId)) return;
      setSelectedHandCard(cardId);
      setShowActionSheet(true);
    },
    [isChainPromptOpen, playableIds],
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
    },
    [isChainPromptOpen, phase, attackableIds, flipSummonIds, actions],
  );

  // ActionSheet callbacks (stubbed until ActionSheet exists)
  const handleActionSheetSummon = useCallback(
    (position: "attack" | "defense") => {
      if (isChainPromptOpen) return;
      if (!selectedHandCard) return;
      const summonInfo = validActions.canSummon.get(selectedHandCard);
      if (!summonInfo) return;

      if (summonInfo.needsTribute) {
        setPendingSummonPosition(position);
        setShowActionSheet(false);
        setShowTributeSelector(true);
      } else {
        actions.summon(selectedHandCard, position);
        setSelectedHandCard(null);
        setShowActionSheet(false);
      }
    },
    [isChainPromptOpen, selectedHandCard, validActions, actions],
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
    actions.activateSpell(selectedHandCard);
    setSelectedHandCard(null);
    setShowActionSheet(false);
  }, [isChainPromptOpen, selectedHandCard, actions]);

  const handleActionSheetActivateTrap = useCallback(() => {
    if (isChainPromptOpen) return;
    if (!selectedHandCard) return;
    actions.activateTrap(selectedHandCard);
    setSelectedHandCard(null);
    setShowActionSheet(false);
  }, [isChainPromptOpen, selectedHandCard, actions]);

  const handleActionSheetClose = useCallback(() => {
    setSelectedHandCard(null);
    setShowActionSheet(false);
  }, []);

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

  // AttackTargetSelector callbacks (stubbed until AttackTargetSelector exists)
  const handleAttackTarget = useCallback(
    (targetId?: string) => {
      if (isChainPromptOpen) return;
      if (!selectedBoardCard) return;
      actions.declareAttack(selectedBoardCard, targetId);
      setSelectedBoardCard(null);
      setShowAttackTargets(false);
    },
    [isChainPromptOpen, selectedBoardCard, actions],
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
    setShowSurrenderConfirm(false);
    setPendingSummonPosition(null);
    setShowGraveyard(null);
  }, [isChainPromptOpen]);

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

  // Loading/error states
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#fdfdfb]">
        <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#fdfdfb]">
        <p className="text-[#666] font-bold uppercase text-sm">Match not found.</p>
      </div>
    );
  }

  if (!view) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#fdfdfb]">
        <p className="text-[#666] font-bold uppercase text-sm">Failed to load game state.</p>
      </div>
    );
  }

  if (ended) {
    if (onMatchEnd) {
      return <div className="h-screen flex items-center justify-center bg-[#fdfdfb]">
        <div className="w-8 h-8 border-4 border-[#121212] border-t-transparent rounded-full animate-spin" />
      </div>;
    }

    return (
      <AnimatePresence>
        <GameOverOverlay
          result={result}
          playerLP={playerLP}
          opponentLP={opponentLP}
          onExit={() => navigate("/story")}
        />
      </AnimatePresence>
    );
  }

  // Extract field data from view
  const playerBoard = view.board ?? [];
  const opponentBoard = view.opponentBoard ?? [];
  const playerSpellTraps = view.spellTrapZone ?? [];
  const opponentSpellTraps = view.opponentSpellTrapZone ?? [];
  const hand = view.hand ?? [];
  const playerGraveyard = view.graveyard ?? [];
  const playerBanished = view.banished ?? [];
  const opponentGraveyard = view.opponentGraveyard ?? [];
  const opponentBanished = view.opponentBanished ?? [];

  return (
    <div className="relative h-screen flex flex-col bg-[#fdfdfb]">
      <GameMotionOverlay phase={phase as Phase} isMyTurn={isMyTurn} />

      {/* Opponent LP Bar */}
      <div className="px-4 pt-2">
        <LPBar lp={view.opponentLifePoints ?? 8000} maxLp={8000} label="Opponent" side="opponent" />
      </div>

      {/* Opponent Field */}
      <div className="px-4 py-1">
        <div className="flex flex-col gap-1">
          <FieldRow
            cards={opponentBoard}
            cardLookup={cardLookup}
            maxSlots={maxBoardSlots}
            reversed
          />
          {/* Spell/Trap row — cast to BoardCard-like shape */}
          <div className="flex gap-1 justify-center">
            {Array.from({ length: maxSpellTrapSlots }).map((_, i) => {
              const st = opponentSpellTraps[i];
              return (
                <div
                  key={i}
                  className={`w-[60px] h-[40px] flex items-center justify-center text-[10px] border-2 ${
                    st ? (st.faceDown ? "border-[#121212] bg-[#121212] text-white" : "border-[#121212] bg-white") : "border-dashed border-[#999] opacity-30"
                  }`}
                  style={{ fontFamily: "Special Elite, cursive" }}
                >
                  {st ? (st.faceDown ? "SET" : (cardLookup[st.definitionId]?.name ?? "S/T").slice(0, 6)) : "S/T"}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Phase Bar */}
      <div className="px-4 py-2">
        <PhaseBar
          currentPhase={phase as Phase}
          isMyTurn={isMyTurn}
          onAdvance={isChainPromptOpen ? () => {} : actions.advancePhase}
        />
      </div>

      {/* Player Field */}
      <div className="px-4 py-1">
        <div className="flex flex-col gap-1">
          <FieldRow
            cards={playerBoard}
            cardLookup={cardLookup}
            maxSlots={maxBoardSlots}
            highlightIds={new Set([...attackableIds, ...flipSummonIds])}
            onSlotClick={handleBoardCardClick}
          />
          {/* Spell/Trap row */}
          <div className="flex gap-1 justify-center">
            {Array.from({ length: maxSpellTrapSlots }).map((_, i) => {
              const st = playerSpellTraps[i];
              return (
                <div
                  key={i}
                  className={`w-[60px] h-[40px] flex items-center justify-center text-[10px] border-2 ${
                    st ? (st.faceDown ? "border-[#121212] bg-[#121212] text-white" : "border-[#121212] bg-white") : "border-dashed border-[#999] opacity-30"
                  }`}
                  style={{ fontFamily: "Special Elite, cursive" }}
                >
                  {st ? (st.faceDown ? "SET" : (cardLookup[st.definitionId]?.name ?? "S/T").slice(0, 6)) : "S/T"}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Player LP Bar */}
      <div className="px-4 pb-1">
        <LPBar lp={view.lifePoints ?? 8000} maxLp={8000} label="You" side="player" />
      </div>

      {/* Player Hand */}
      <div className="px-4 pb-4 flex-shrink-0">
        <PlayerHand
          hand={hand}
          cardLookup={cardLookup}
          playableIds={playableIds}
          onCardClick={handleHandCardClick}
        />
      </div>

      {/* GY/Banished Buttons */}
      <div className="fixed left-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowGraveyard({ zone: "graveyard", owner: "player" })}
          className="tcg-button px-2 py-1 text-xs"
          title="Your Graveyard"
        >
          GY ({playerGraveyard.length})
        </button>
        <button
          type="button"
          onClick={() => setShowGraveyard({ zone: "banished", owner: "player" })}
          className="tcg-button px-2 py-1 text-xs"
          title="Your Banished"
        >
          BAN ({playerBanished.length})
        </button>
      </div>

      <div className="fixed right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setShowGraveyard({ zone: "graveyard", owner: "opponent" })}
          className="tcg-button px-2 py-1 text-xs"
          title="Opponent Graveyard"
        >
          OPP GY ({opponentGraveyard.length})
        </button>
        <button
          type="button"
          onClick={() => setShowGraveyard({ zone: "banished", owner: "opponent" })}
          className="tcg-button px-2 py-1 text-xs"
          title="Opponent Banished"
        >
          OPP BAN ({opponentBanished.length})
        </button>
      </div>

      {/* End Turn / Surrender Buttons */}
      <div className="fixed bottom-4 right-4 flex gap-2">
        <button
          type="button"
          onClick={() => setShowSurrenderConfirm(true)}
          className={`text-xs text-[#666] hover:text-[#121212] underline ${
            showSurrenderConfirm ? "hidden" : ""
          }`}
          disabled={actions.submitting || isChainPromptOpen}
        >
          Surrender
        </button>
        {showSurrenderConfirm && (
          <div className="flex gap-2 items-center">
            <span className="text-xs text-[#666]">Confirm surrender?</span>
            <button
              type="button"
              onClick={handleSurrender}
              disabled={isChainPromptOpen}
              className="tcg-button-primary px-3 py-1 text-xs"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setShowSurrenderConfirm(false)}
              disabled={isChainPromptOpen}
              className="tcg-button px-3 py-1 text-xs"
            >
              No
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={actions.endTurn}
          disabled={!isMyTurn || actions.submitting || isChainPromptOpen}
          className={`tcg-button-primary px-6 py-2 text-sm disabled:opacity-30 disabled:cursor-not-allowed ${
            isMyTurn && !isChainPromptOpen ? "animate-effect-pulse" : ""
          }`}
        >
          End Turn
        </button>
      </div>

      {isChainPromptOpen && (
        <ChainPrompt
          opponentCardName={chainOpponentCardName}
          activatableTraps={chainActivatableTraps}
          onActivate={handleChainActivate}
          onPass={handleChainPass}
        />
      )}

      {/* Error Display */}
      {actions.error && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 paper-panel bg-red-50 border-2 border-red-600 px-4 py-2 max-w-md">
          <p className="text-xs text-red-600 font-bold uppercase">{actions.error}</p>
          <button
            type="button"
            onClick={actions.clearError}
            className="text-[10px] underline text-red-600 mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Action Sheet */}
      {showActionSheet && selectedHandCard && (
        <ActionSheet
          cardId={selectedHandCard}
          cardDef={cardLookup[selectedHandCard] ?? {}}
          location="hand"
          validActions={{
            canSummon: validActions.canSummon.get(selectedHandCard),
            canSetMonster: validActions.canSetMonster.has(selectedHandCard),
            canSetSpellTrap: validActions.canSetSpellTrap.has(selectedHandCard),
            canActivateSpell: validActions.canActivateSpell.has(selectedHandCard),
          }}
          onSummon={handleActionSheetSummon}
          onSetMonster={handleActionSheetSetMonster}
          onSetSpellTrap={handleActionSheetSetSpellTrap}
          onActivateSpell={handleActionSheetActivateSpell}
          onActivateTrap={handleActionSheetActivateTrap}
          onTributeRequired={() => {
            setPendingSummonPosition("attack");
            setShowActionSheet(false);
            setShowTributeSelector(true);
          }}
          onClose={handleActionSheetClose}
        />
      )}

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
        const attackerDef = attackerCard ? cardLookup[attackerCard.definitionId] : null;
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
          onClose={() => setShowGraveyard(null)}
        />
      )}
    </div>
  );
}
