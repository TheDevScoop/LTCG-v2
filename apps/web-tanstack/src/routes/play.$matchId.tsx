import { convexQuery, useConvexMutation } from '@convex-dev/react-query'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { api } from '~/lib/convexApi'

type Seat = 'host' | 'away'

type MatchMeta = {
  status?: string
  mode?: string
  hostId?: string
  awayId?: string
  winner?: string | null
}

type CurrentUser = {
  _id: string
}

type EventBatch = {
  command: string
  events: string
  seat: string
  version: number
  createdAt: number
}

type CatalogCard = {
  _id: string
  name: string
}

type BoardCard = {
  cardId?: string
  definitionId?: string
  position?: string
  faceDown?: boolean
  attack?: number
  defense?: number
}

type SpellTrapCard = {
  cardId?: string
  definitionId?: string
  faceDown?: boolean
}

type ChainLink = {
  cardId?: string
  activatingPlayer?: Seat
}

type PlayerView = {
  instanceDefinitions: Record<string, string>
  hand: string[]
  board: BoardCard[]
  spellTrapZone: SpellTrapCard[]
  fieldSpell: SpellTrapCard | null
  graveyard: string[]
  banished: string[]
  lifePoints: number | null
  deckCount: number | null
  opponentHandCount: number | null
  opponentBoard: BoardCard[]
  opponentSpellTrapZone: SpellTrapCard[]
  opponentFieldSpell: SpellTrapCard | null
  opponentGraveyard: string[]
  opponentBanished: string[]
  opponentLifePoints: number | null
  opponentDeckCount: number | null
  currentTurnPlayer: string | null
  currentPriorityPlayer: string | null
  turnNumber: number | null
  currentPhase: string | null
  currentChain: ChainLink[]
  gameOver: boolean
  winner: string | null
  topDeckView: string[] | null
}

type OpenPrompt = {
  promptType?: string
  data?: string
}

type ChainPromptTrap = {
  cardId: string
  cardDefinitionId: string | undefined
  name: string | undefined
}

type ChainPromptData = {
  opponentCardName?: string
  activatableTraps: ChainPromptTrap[]
}

function asSeat(value: unknown): Seat | null {
  return value === 'host' || value === 'away' ? value : null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  try {
    const parsed = JSON.parse(value)
    return asRecord(parsed)
  } catch {
    return null
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => asString(entry)).filter((entry): entry is string => entry != null)
}

function asStringRecord(value: unknown): Record<string, string> {
  const record = asRecord(value)
  if (!record) return {}
  const output: Record<string, string> = {}
  for (const [key, entry] of Object.entries(record)) {
    const next = asString(entry)
    if (next != null) output[key] = next
  }
  return output
}

function asBoardCards(value: unknown): BoardCard[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry != null)
    .map((entry) => ({
      cardId: asString(entry.cardId) ?? undefined,
      definitionId: asString(entry.definitionId) ?? undefined,
      position: asString(entry.position) ?? undefined,
      faceDown: asBoolean(entry.faceDown) ?? undefined,
      attack: asNumber(entry.attack) ?? undefined,
      defense: asNumber(entry.defense) ?? undefined,
    }))
}

function asSpellTrapCards(value: unknown): SpellTrapCard[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry != null)
    .map((entry) => ({
      cardId: asString(entry.cardId) ?? undefined,
      definitionId: asString(entry.definitionId) ?? undefined,
      faceDown: asBoolean(entry.faceDown) ?? undefined,
    }))
}

function asChainLinks(value: unknown): ChainLink[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => entry != null)
    .map((entry) => ({
      cardId: asString(entry.cardId) ?? undefined,
      activatingPlayer: asSeat(entry.activatingPlayer) ?? undefined,
    }))
}

function parsePlayerView(value: unknown): PlayerView | null {
  const view = parseJsonRecord(value)
  if (!view) return null

  return {
    instanceDefinitions: asStringRecord(view.instanceDefinitions),
    hand: asStringArray(view.hand),
    board: asBoardCards(view.board),
    spellTrapZone: asSpellTrapCards(view.spellTrapZone),
    fieldSpell: asRecord(view.fieldSpell)
      ? {
          cardId: asString(asRecord(view.fieldSpell)?.cardId) ?? undefined,
          definitionId: asString(asRecord(view.fieldSpell)?.definitionId) ?? undefined,
          faceDown: asBoolean(asRecord(view.fieldSpell)?.faceDown) ?? undefined,
        }
      : null,
    graveyard: asStringArray(view.graveyard),
    banished: asStringArray(view.banished),
    lifePoints: asNumber(view.lifePoints),
    deckCount: asNumber(view.deckCount),
    opponentHandCount: asNumber(view.opponentHandCount),
    opponentBoard: asBoardCards(view.opponentBoard),
    opponentSpellTrapZone: asSpellTrapCards(view.opponentSpellTrapZone),
    opponentFieldSpell: asRecord(view.opponentFieldSpell)
      ? {
          cardId: asString(asRecord(view.opponentFieldSpell)?.cardId) ?? undefined,
          definitionId: asString(asRecord(view.opponentFieldSpell)?.definitionId) ?? undefined,
          faceDown: asBoolean(asRecord(view.opponentFieldSpell)?.faceDown) ?? undefined,
        }
      : null,
    opponentGraveyard: asStringArray(view.opponentGraveyard),
    opponentBanished: asStringArray(view.opponentBanished),
    opponentLifePoints: asNumber(view.opponentLifePoints),
    opponentDeckCount: asNumber(view.opponentDeckCount),
    currentTurnPlayer: asString(view.currentTurnPlayer),
    currentPriorityPlayer: asString(view.currentPriorityPlayer),
    turnNumber: asNumber(view.turnNumber),
    currentPhase: asString(view.currentPhase),
    currentChain: asChainLinks(view.currentChain),
    gameOver: view.gameOver === true,
    winner: asString(view.winner),
    topDeckView: Array.isArray(view.topDeckView) ? asStringArray(view.topDeckView) : null,
  }
}

function parseChainPromptData(prompt: OpenPrompt | null | undefined): ChainPromptData | null {
  if (!prompt || prompt.promptType !== 'chain_response') return null
  const payload = parseJsonRecord(prompt.data)
  if (!payload) {
    return {
      activatableTraps: [],
    }
  }

  const activatableTraps = Array.isArray(payload.activatableTraps)
    ? payload.activatableTraps
        .map((entry) => asRecord(entry))
        .filter((entry): entry is Record<string, unknown> => entry != null)
        .map((entry) => {
          const cardId = asString(entry.cardId)
          if (!cardId) return null
          return {
            cardId,
            cardDefinitionId: asString(entry.cardDefinitionId) ?? undefined,
            name: asString(entry.name) ?? undefined,
          }
        })
        .filter((entry): entry is ChainPromptTrap => entry != null)
    : []

  return {
    opponentCardName: asString(payload.opponentCardName) ?? undefined,
    activatableTraps,
  }
}

function resolveSeat(meta: MatchMeta | null | undefined, userId: string | undefined): Seat | null {
  if (!meta || !userId) return null
  if (meta.hostId === userId) return 'host'
  if (meta.awayId === userId) return 'away'
  return null
}

function parseCommandType(batch: EventBatch): string {
  const command = parseJsonRecord(batch.command)
  return asString(command?.type) ?? 'UNKNOWN'
}

function parseEventCount(batch: EventBatch): number {
  try {
    const parsed = JSON.parse(batch.events)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

function resolveCardLabel(args: {
  cardId: string
  definitionId: string | null
  instanceDefinitions: Record<string, string>
  cardNamesById: Map<string, string>
}): string {
  const resolvedDefinition =
    args.definitionId ?? args.instanceDefinitions[args.cardId] ?? args.cardId

  if (resolvedDefinition === 'hidden') {
    return 'Hidden card'
  }

  return args.cardNamesById.get(resolvedDefinition) ?? resolvedDefinition
}

export const Route = createFileRoute('/play/$matchId')({
  loader: async ({ context }) => {
    if (!context.convexConfigured) return
    await context.queryClient.ensureQueryData(convexQuery(api.auth.currentUser, {}))
  },
  component: PlayRoute,
})

function PlayRoute() {
  const { convexConfigured } = Route.useRouteContext()
  const { matchId } = Route.useParams()

  const [actionMessage, setActionMessage] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [customCommand, setCustomCommand] = useState('{\n  "type": "ADVANCE_PHASE"\n}')

  const submitAction = useConvexMutation(api.game.submitAction)

  const currentUser = useQuery({
    ...convexQuery(api.auth.currentUser, {}),
    enabled: convexConfigured,
  })
  const meta = useQuery({
    ...convexQuery(api.game.getMatchMeta, { matchId }),
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
    refetchInterval: 2000,
  })

  const seat = useMemo(
    () =>
      resolveSeat(
        (meta.data ?? null) as MatchMeta | null,
        (currentUser.data as CurrentUser | undefined)?._id,
      ),
    [meta.data, currentUser.data],
  )

  const storyContext = useQuery({
    ...convexQuery(api.game.getStoryMatchContext, { matchId }),
    enabled:
      convexConfigured &&
      currentUser.data != null &&
      (meta.data as MatchMeta | undefined)?.mode === 'story',
    retry: false,
  })
  const snapshotVersion = useQuery({
    ...convexQuery(api.game.getLatestSnapshotVersion, { matchId }),
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
    refetchInterval: 1200,
  })
  const playerView = useQuery({
    ...convexQuery(api.game.getPlayerView, { matchId, seat: seat ?? 'host' }),
    enabled: convexConfigured && currentUser.data != null && seat != null,
    retry: false,
    refetchInterval: 1000,
  })
  const openPrompt = useQuery({
    ...convexQuery(api.game.getOpenPrompt, { matchId, seat: seat ?? 'host' }),
    enabled: convexConfigured && currentUser.data != null && seat != null,
    retry: false,
    refetchInterval: 1000,
  })

  const sinceVersion = useMemo(() => {
    if (typeof snapshotVersion.data !== 'number') return 0
    return Math.max(snapshotVersion.data - 40, 0)
  }, [snapshotVersion.data])

  const recentEvents = useQuery({
    ...convexQuery(api.game.getRecentEvents, { matchId, sinceVersion }),
    enabled: convexConfigured && currentUser.data != null,
    retry: false,
    refetchInterval: 1000,
  })

  const catalogCards = useQuery({
    ...convexQuery(api.game.getCatalogCards, {}),
    enabled: convexConfigured,
    retry: false,
  })

  const parsedView = useMemo(() => parsePlayerView(playerView.data), [playerView.data])

  const cardNamesById = useMemo(() => {
    const map = new Map<string, string>()
    for (const card of (catalogCards.data ?? []) as CatalogCard[]) {
      if (typeof card._id === 'string' && typeof card.name === 'string') {
        map.set(card._id, card.name)
      }
    }
    return map
  }, [catalogCards.data])

  const chainPrompt = useMemo(
    () => parseChainPromptData((openPrompt.data ?? null) as OpenPrompt | null),
    [openPrompt.data],
  )

  const eventRows = useMemo(
    () => ((recentEvents.data as EventBatch[] | undefined) ?? []).slice(-30).reverse(),
    [recentEvents.data],
  )

  const submitCommand = async (command: Record<string, unknown>, successMessage: string) => {
    if (!seat) {
      setActionMessage('You are not seated in this match.')
      return
    }
    if (typeof snapshotVersion.data !== 'number' || snapshotVersion.data < 0) {
      setActionMessage('State not synced yet. Wait and retry.')
      return
    }

    setActionBusy(true)
    setActionMessage('')
    try {
      await submitAction({
        matchId,
        seat,
        expectedVersion: snapshotVersion.data,
        command: JSON.stringify(command),
      })
      setActionMessage(successMessage)
      await Promise.all([
        meta.refetch(),
        snapshotVersion.refetch(),
        playerView.refetch(),
        openPrompt.refetch(),
        recentEvents.refetch(),
      ])
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Action failed.')
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Play Match</h1>
      <p className="text-xs text-stone-400">matchId: {matchId}</p>

      {!convexConfigured ? (
        <p className="text-sm text-amber-300">
          Add <code>VITE_CONVEX_URL</code> to load match data.
        </p>
      ) : currentUser.data == null ? (
        <p className="text-sm text-amber-300">Sign in to access this match.</p>
      ) : meta.isLoading ? (
        <p className="text-sm text-stone-400">Loading match meta…</p>
      ) : meta.isError ? (
        <p className="text-sm text-rose-300">Match unavailable or you are not a participant.</p>
      ) : seat == null ? (
        <p className="text-sm text-rose-300">You are not a participant in this match.</p>
      ) : (
        <>
          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Match state</h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Seat" value={seat} />
              <Stat
                label="Status"
                value={String((meta.data as MatchMeta | undefined)?.status ?? 'unknown')}
              />
              <Stat label="Phase" value={parsedView?.currentPhase ?? 'loading'} />
              <Stat label="Turn" value={String(parsedView?.turnNumber ?? '-')} />
              <Stat label="My LP" value={String(parsedView?.lifePoints ?? '-')} />
              <Stat label="Opponent LP" value={String(parsedView?.opponentLifePoints ?? '-')} />
              <Stat
                label="My Deck/Hand"
                value={`${parsedView?.deckCount ?? '-'} / ${parsedView?.hand.length ?? '-'}`}
              />
              <Stat
                label="Opp Deck/Hand"
                value={`${parsedView?.opponentDeckCount ?? '-'} / ${parsedView?.opponentHandCount ?? '-'}`}
              />
            </div>
            <p className="mt-2 text-xs text-stone-400">
              Snapshot version: {String(snapshotVersion.data ?? 'n/a')} · turn:
              {' '}
              {parsedView?.currentTurnPlayer ?? 'unknown'} · priority:
              {' '}
              {parsedView?.currentPriorityPlayer ?? 'none'}
            </p>
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Board + zones</h2>
            {!parsedView ? (
              <p className="mt-2 text-stone-400">Loading player view…</p>
            ) : (
              <div className="mt-2 grid gap-3 lg:grid-cols-2">
                <ZoneList
                  title={`Hand (${parsedView.hand.length})`}
                  items={parsedView.hand.map((cardId) =>
                    resolveCardLabel({
                      cardId,
                      definitionId: null,
                      instanceDefinitions: parsedView.instanceDefinitions,
                      cardNamesById,
                    }),
                  )}
                />
                <ZoneList
                  title={`Top Deck Preview (${parsedView.topDeckView?.length ?? 0})`}
                  items={(parsedView.topDeckView ?? []).map((cardId) =>
                    resolveCardLabel({
                      cardId,
                      definitionId: null,
                      instanceDefinitions: parsedView.instanceDefinitions,
                      cardNamesById,
                    }),
                  )}
                  emptyLabel="Top deck not revealed"
                />
                <CardZone
                  title={`Board (${parsedView.board.length})`}
                  cards={parsedView.board.map((card, index) => {
                    const cardId = card.cardId ?? 'unknown'
                    return {
                      key: `${cardId}-${index}`,
                      name: resolveCardLabel({
                        cardId,
                        definitionId: card.definitionId ?? null,
                        instanceDefinitions: parsedView.instanceDefinitions,
                        cardNamesById,
                      }),
                      detail: [
                        card.position ? `Position: ${card.position}` : null,
                        typeof card.attack === 'number' ? `ATK ${card.attack}` : null,
                        typeof card.defense === 'number' ? `DEF ${card.defense}` : null,
                      ]
                        .filter((entry): entry is string => entry != null)
                        .join(' · '),
                    }
                  })}
                />
                <CardZone
                  title={`Spell/Trap (${parsedView.spellTrapZone.length})`}
                  cards={parsedView.spellTrapZone.map((card, index) => {
                    const cardId = card.cardId ?? 'unknown'
                    return {
                      key: `${cardId}-${index}`,
                      name: resolveCardLabel({
                        cardId,
                        definitionId: card.definitionId ?? null,
                        instanceDefinitions: parsedView.instanceDefinitions,
                        cardNamesById,
                      }),
                      detail: card.faceDown ? 'Set' : 'Face up',
                    }
                  })}
                />
                <CardZone
                  title="Field Spell"
                  cards={
                    parsedView.fieldSpell
                      ? [
                          {
                            key: parsedView.fieldSpell.cardId ?? 'field-spell',
                            name: resolveCardLabel({
                              cardId: parsedView.fieldSpell.cardId ?? 'field-spell',
                              definitionId: parsedView.fieldSpell.definitionId ?? null,
                              instanceDefinitions: parsedView.instanceDefinitions,
                              cardNamesById,
                            }),
                            detail: parsedView.fieldSpell.faceDown ? 'Set' : 'Face up',
                          },
                        ]
                      : []
                  }
                />
                <CardZone
                  title={`Opponent Board (${parsedView.opponentBoard.length})`}
                  cards={parsedView.opponentBoard.map((card, index) => {
                    const cardId = card.cardId ?? `opponent-${index}`
                    return {
                      key: cardId,
                      name: resolveCardLabel({
                        cardId,
                        definitionId: card.definitionId ?? null,
                        instanceDefinitions: parsedView.instanceDefinitions,
                        cardNamesById,
                      }),
                      detail: [
                        card.position ? `Position: ${card.position}` : null,
                        typeof card.attack === 'number' ? `ATK ${card.attack}` : null,
                        typeof card.defense === 'number' ? `DEF ${card.defense}` : null,
                      ]
                        .filter((entry): entry is string => entry != null)
                        .join(' · '),
                    }
                  })}
                />
                <CardZone
                  title={`Opponent Spell/Trap (${parsedView.opponentSpellTrapZone.length})`}
                  cards={parsedView.opponentSpellTrapZone.map((card, index) => {
                    const cardId = card.cardId ?? `opponent-spell-${index}`
                    return {
                      key: cardId,
                      name: resolveCardLabel({
                        cardId,
                        definitionId: card.definitionId ?? null,
                        instanceDefinitions: parsedView.instanceDefinitions,
                        cardNamesById,
                      }),
                      detail: card.faceDown ? 'Set' : 'Face up',
                    }
                  })}
                />
                <CardZone
                  title="Opponent Field Spell"
                  cards={
                    parsedView.opponentFieldSpell
                      ? [
                          {
                            key: parsedView.opponentFieldSpell.cardId ?? 'opponent-field-spell',
                            name: resolveCardLabel({
                              cardId: parsedView.opponentFieldSpell.cardId ?? 'opponent-field-spell',
                              definitionId: parsedView.opponentFieldSpell.definitionId ?? null,
                              instanceDefinitions: parsedView.instanceDefinitions,
                              cardNamesById,
                            }),
                            detail: parsedView.opponentFieldSpell.faceDown ? 'Set' : 'Face up',
                          },
                        ]
                      : []
                  }
                />
                <ZoneList
                  title={`Graveyard (${parsedView.graveyard.length})`}
                  items={parsedView.graveyard.map((cardId) =>
                    resolveCardLabel({
                      cardId,
                      definitionId: null,
                      instanceDefinitions: parsedView.instanceDefinitions,
                      cardNamesById,
                    }),
                  )}
                />
                <ZoneList
                  title={`Banished (${parsedView.banished.length})`}
                  items={parsedView.banished.map((cardId) =>
                    resolveCardLabel({
                      cardId,
                      definitionId: null,
                      instanceDefinitions: parsedView.instanceDefinitions,
                      cardNamesById,
                    }),
                  )}
                />
              </div>
            )}
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Chain prompt</h2>
            {openPrompt.isLoading ? (
              <p className="mt-2 text-stone-400">Checking prompt…</p>
            ) : openPrompt.isError ? (
              <p className="mt-2 text-rose-300">Failed to load open prompt.</p>
            ) : !openPrompt.data ? (
              <p className="mt-2 text-stone-400">No open prompt.</p>
            ) : (
              <div className="mt-2 space-y-2">
                <p className="text-xs text-stone-300">
                  Prompt type: {(openPrompt.data as OpenPrompt).promptType ?? 'unknown'}
                </p>
                {chainPrompt ? (
                  <>
                    <p className="text-xs text-stone-400">
                      Last opposing chain card: {chainPrompt.opponentCardName ?? 'Unknown card'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          void submitCommand(
                            { type: 'CHAIN_RESPONSE', pass: true },
                            'Passed chain response.',
                          )
                        }}
                        disabled={actionBusy}
                        className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
                      >
                        Pass Chain
                      </button>
                      {chainPrompt.activatableTraps.map((trap) => (
                        <button
                          key={trap.cardId}
                          onClick={() => {
                            void submitCommand(
                              { type: 'CHAIN_RESPONSE', pass: false, cardId: trap.cardId },
                              `Activated trap response: ${trap.name ?? trap.cardId}`,
                            )
                          }}
                          disabled={actionBusy}
                          className="rounded border border-cyan-700/60 px-3 py-1 text-xs text-cyan-200 disabled:opacity-50"
                        >
                          Respond: {trap.name ?? trap.cardId}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <pre className="overflow-x-auto rounded border border-stone-700/40 p-2 text-xs text-stone-300">
                    {JSON.stringify(openPrompt.data, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Core actions</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  void submitCommand({ type: 'ADVANCE_PHASE' }, 'ADVANCE_PHASE submitted.')
                }}
                disabled={actionBusy}
                className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
              >
                Advance Phase
              </button>
              <button
                onClick={() => {
                  void submitCommand({ type: 'END_TURN' }, 'END_TURN submitted.')
                }}
                disabled={actionBusy}
                className="rounded border border-stone-600 px-3 py-1 text-xs disabled:opacity-50"
              >
                End Turn
              </button>
              <button
                onClick={() => {
                  void submitCommand({ type: 'SURRENDER' }, 'SURRENDER submitted.')
                }}
                disabled={actionBusy}
                className="rounded border border-rose-700/60 px-3 py-1 text-xs text-rose-300 disabled:opacity-50"
              >
                Surrender
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <p className="text-xs text-stone-400">Custom command JSON</p>
              <textarea
                value={customCommand}
                onChange={(event) => setCustomCommand(event.target.value)}
                rows={5}
                className="w-full rounded border border-stone-700/50 bg-stone-950/40 p-2 text-xs text-stone-200"
              />
              <button
                onClick={() => {
                  let parsed: Record<string, unknown>
                  try {
                    const next = JSON.parse(customCommand)
                    const record = asRecord(next)
                    if (!record) {
                      setActionMessage('Custom command must be a JSON object.')
                      return
                    }
                    parsed = record
                  } catch {
                    setActionMessage('Custom command is not valid JSON.')
                    return
                  }
                  void submitCommand(parsed, `${String(parsed.type ?? 'CUSTOM')} submitted.`)
                }}
                disabled={actionBusy}
                className="rounded border border-amber-700/60 px-3 py-1 text-xs text-amber-200 disabled:opacity-50"
              >
                Submit Custom Command
              </button>
            </div>

            {actionMessage ? <p className="mt-2 text-xs text-stone-300">{actionMessage}</p> : null}
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Current chain stack</h2>
            {!parsedView ? (
              <p className="mt-2 text-stone-400">Loading chain state…</p>
            ) : parsedView.currentChain.length === 0 ? (
              <p className="mt-2 text-stone-400">No chain links active.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs">
                {parsedView.currentChain.map((link, index) => (
                  <li
                    key={`${link.cardId ?? 'link'}-${index}`}
                    className="rounded border border-stone-700/40 px-2 py-1 text-stone-300"
                  >
                    Link {index + 1}: {link.activatingPlayer ?? 'unknown'} ·{' '}
                    {link.cardId
                      ? resolveCardLabel({
                          cardId: link.cardId,
                          definitionId: null,
                          instanceDefinitions: parsedView.instanceDefinitions,
                          cardNamesById,
                        })
                      : 'unknown card'}
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="rounded border border-stone-700/40 p-3 text-sm">
            <h2 className="text-xs uppercase tracking-wide text-stone-400">Recent events</h2>
            {recentEvents.isLoading ? (
              <p className="mt-2 text-stone-400">Loading events…</p>
            ) : recentEvents.isError ? (
              <p className="mt-2 text-rose-300">Failed to load events.</p>
            ) : eventRows.length === 0 ? (
              <p className="mt-2 text-stone-400">No events yet.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs">
                {eventRows.map((row) => (
                  <li
                    key={`${row.version}:${row.createdAt}`}
                    className="rounded border border-stone-700/40 px-2 py-1 text-stone-300"
                  >
                    <span className="text-stone-500">v{row.version}</span>{' '}
                    <span className="text-stone-400">{row.seat}</span>{' '}
                    <span>{parseCommandType(row)}</span>{' '}
                    <span className="text-stone-500">({parseEventCount(row)} events)</span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          {(meta.data as MatchMeta | undefined)?.mode === 'story' ? (
            <article className="rounded border border-stone-700/40 p-3 text-sm">
              <h2 className="text-xs uppercase tracking-wide text-stone-400">Story Context</h2>
              {storyContext.isLoading ? (
                <p className="mt-2 text-stone-400">Loading story context…</p>
              ) : storyContext.isError ? (
                <p className="mt-2 text-rose-300">Failed to load story context.</p>
              ) : (
                <pre className="mt-2 overflow-x-auto text-xs text-stone-300">
                  {JSON.stringify(storyContext.data, null, 2)}
                </pre>
              )}
            </article>
          ) : null}

          {parsedView?.gameOver ? (
            <article className="rounded border border-emerald-700/50 p-3 text-sm text-emerald-200">
              Match complete. Winner: {parsedView.winner ?? 'none'}
            </article>
          ) : null}
        </>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-stone-700/40 p-2">
      <p className="text-[10px] uppercase tracking-wide text-stone-500">{label}</p>
      <p className="text-sm text-stone-200">{value}</p>
    </div>
  )
}

function ZoneList({
  title,
  items,
  emptyLabel = 'No cards in this zone',
}: {
  title: string
  items: string[]
  emptyLabel?: string
}) {
  return (
    <div className="rounded border border-stone-700/40 p-2">
      <p className="text-[11px] uppercase tracking-wide text-stone-400">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-stone-500">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs text-stone-200">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="truncate">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CardZone({
  title,
  cards,
}: {
  title: string
  cards: Array<{ key: string; name: string; detail?: string }>
}) {
  return (
    <div className="rounded border border-stone-700/40 p-2">
      <p className="text-[11px] uppercase tracking-wide text-stone-400">{title}</p>
      {cards.length === 0 ? (
        <p className="mt-2 text-xs text-stone-500">No cards in this zone</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs text-stone-200">
          {cards.map((card) => (
            <li key={card.key}>
              <p>{card.name}</p>
              {card.detail ? <p className="text-stone-500">{card.detail}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
