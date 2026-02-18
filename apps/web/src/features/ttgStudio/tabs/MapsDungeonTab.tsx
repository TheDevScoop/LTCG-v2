import { useEffect, useMemo, useState } from "react";
import type { TTGMapToken } from "@/lib/ttrpgStudio";
import { useActiveProjectDraft, useTTGStudioStore } from "../state/useTTGStudioStore";

const layerDepth: Record<TTGMapToken["layer"], number> = {
  ground: 0,
  mid: 20,
  air: 40,
};

export function MapsDungeonTab() {
  const draft = useActiveProjectDraft();
  const updateActiveProject = useTTGStudioStore((state) => state.updateActiveProject);

  const [selectedSceneId, setSelectedSceneId] = useState("");
  const [selectedTokenId, setSelectedTokenId] = useState("");
  const [customObjective, setCustomObjective] = useState("Track faction reinforcements");
  const [selectedDungeonId, setSelectedDungeonId] = useState("");
  const [newRoomName, setNewRoomName] = useState("Anomaly Chamber");
  const [newRoomChallenge, setNewRoomChallenge] = useState("Unstable objective with escalating hazard.");
  const [linkFrom, setLinkFrom] = useState("");
  const [linkTo, setLinkTo] = useState("");
  const [linkLabel, setLinkLabel] = useState("Hidden passage");

  useEffect(() => {
    if (!draft) return;
    setSelectedSceneId(draft.world.maps[0]?.id ?? "");
    setSelectedDungeonId(draft.world.dungeons[0]?.id ?? "");
  }, [draft?.id]);

  const scene = useMemo(
    () => draft?.world.maps.find((entry) => entry.id === selectedSceneId) ?? null,
    [draft, selectedSceneId],
  );

  const dungeon = useMemo(
    () => draft?.world.dungeons.find((entry) => entry.id === selectedDungeonId) ?? null,
    [draft, selectedDungeonId],
  );

  const sceneTokens = draft?.mapTokens[selectedSceneId] ?? [];
  const selectedToken = sceneTokens.find((token) => token.id === selectedTokenId) ?? sceneTokens[0] ?? null;

  if (!draft) {
    return <div className="paper-panel p-6">No active project found.</div>;
  }

  const objectives = [
    ...(scene?.objectives ?? []),
    ...(draft.customSceneObjectives[selectedSceneId] ?? []),
  ];

  return (
    <div className="space-y-6">
      <section className="paper-panel p-4 md:p-6 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-3">
          <h3 className="text-xl">Map + Scene Controls</h3>
          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase">Scene</span>
            <select
              value={selectedSceneId}
              onChange={(event) => setSelectedSceneId(event.target.value)}
              className="border-2 border-[#121212] px-3 py-2 bg-white"
            >
              {draft.world.maps.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase">Token</span>
            <select
              value={selectedToken?.id ?? ""}
              onChange={(event) => setSelectedTokenId(event.target.value)}
              className="border-2 border-[#121212] px-3 py-2 bg-white"
            >
              {sceneTokens.map((token) => (
                <option key={token.id} value={token.id}>
                  {token.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button
              className="tcg-button"
              onClick={() => {
                if (!selectedToken) return;
                updateActiveProject((next) => {
                  const token = next.mapTokens[selectedSceneId]?.find((entry) => entry.id === selectedToken.id);
                  if (token) token.y = Math.max(4, token.y - 4);
                  return next;
                });
              }}
            >
              Move Up
            </button>
            <button
              className="tcg-button"
              onClick={() => {
                if (!selectedToken) return;
                updateActiveProject((next) => {
                  const token = next.mapTokens[selectedSceneId]?.find((entry) => entry.id === selectedToken.id);
                  if (token) token.y = Math.min(96, token.y + 4);
                  return next;
                });
              }}
            >
              Move Down
            </button>
            <button
              className="tcg-button"
              onClick={() => {
                if (!selectedToken) return;
                updateActiveProject((next) => {
                  const token = next.mapTokens[selectedSceneId]?.find((entry) => entry.id === selectedToken.id);
                  if (token) token.x = Math.max(4, token.x - 4);
                  return next;
                });
              }}
            >
              Move Left
            </button>
            <button
              className="tcg-button"
              onClick={() => {
                if (!selectedToken) return;
                updateActiveProject((next) => {
                  const token = next.mapTokens[selectedSceneId]?.find((entry) => entry.id === selectedToken.id);
                  if (token) token.x = Math.min(96, token.x + 4);
                  return next;
                });
              }}
            >
              Move Right
            </button>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase">Scene Notes</span>
            <textarea
              value={draft.sceneNotes[selectedSceneId] ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                updateActiveProject((next) => {
                  next.sceneNotes[selectedSceneId] = value;
                  return next;
                });
              }}
              className="border-2 border-[#121212] bg-white p-2 min-h-24"
            />
          </label>
        </div>

        <div className="space-y-3">
          <div
            className="relative h-[360px] md:h-[420px] overflow-hidden border-4 border-[#121212]"
            style={{ perspective: "960px" }}
            onClick={(event) => {
              if (!selectedToken) return;
              const target = event.currentTarget.getBoundingClientRect();
              const x = ((event.clientX - target.left) / target.width) * 100;
              const y = ((event.clientY - target.top) / target.height) * 100;
              updateActiveProject((next) => {
                const token = next.mapTokens[selectedSceneId]?.find((entry) => entry.id === selectedToken.id);
                if (token) {
                  token.x = Math.max(4, Math.min(96, Math.round(x)));
                  token.y = Math.max(4, Math.min(96, Math.round(y)));
                }
                return next;
              });
            }}
          >
            <div
              className="absolute inset-0"
              style={{
                transform: "rotateX(18deg) translateY(24px)",
                transformStyle: "preserve-3d",
                background:
                  "linear-gradient(145deg, rgba(51,51,51,0.8), rgba(18,18,18,0.95)), repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 32px), repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 32px)",
              }}
            >
              {sceneTokens.map((token) => (
                <button
                  key={token.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedTokenId(token.id);
                  }}
                  className={`absolute h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-[#121212] text-[11px] font-black uppercase text-[#121212] shadow-[3px_3px_0_#121212] ${
                    selectedToken?.id === token.id ? "ring-2 ring-[#ffcc00]" : ""
                  }`}
                  style={{
                    left: `${token.x}%`,
                    top: `${token.y}%`,
                    background: token.color ?? "#fff",
                    transform: `translate(-50%, -50%) translateZ(${layerDepth[token.layer]}px)`,
                  }}
                >
                  {token.name.slice(0, 5)}
                </button>
              ))}
            </div>
            <div className="absolute left-3 top-3 paper-panel-flat px-2 py-1 text-xs uppercase">
              {scene?.name} • {scene?.camera}
            </div>
          </div>

          <div className="paper-panel-flat p-3">
            <h4 className="text-sm uppercase mb-2">Objectives</h4>
            <div className="space-y-2">
              {objectives.map((objective) => {
                const checked = Boolean(draft.sceneObjectiveState[selectedSceneId]?.[objective]);
                return (
                  <label key={objective} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const value = event.target.checked;
                        updateActiveProject((next) => {
                          next.sceneObjectiveState[selectedSceneId] = {
                            ...(next.sceneObjectiveState[selectedSceneId] ?? {}),
                            [objective]: value,
                          };
                          return next;
                        });
                      }}
                    />
                    <span>{objective}</span>
                  </label>
                );
              })}
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={customObjective}
                onChange={(event) => setCustomObjective(event.target.value)}
                className="flex-1 border border-[#121212] px-2 py-1 bg-white"
                placeholder="new objective"
              />
              <button
                className="tcg-button"
                onClick={() => {
                  if (!customObjective.trim()) return;
                  updateActiveProject((next) => {
                    const current = next.customSceneObjectives[selectedSceneId] ?? [];
                    next.customSceneObjectives[selectedSceneId] = [...current, customObjective.trim()];
                    next.sceneObjectiveState[selectedSceneId] = {
                      ...(next.sceneObjectiveState[selectedSceneId] ?? {}),
                      [customObjective.trim()]: false,
                    };
                    return next;
                  });
                  setCustomObjective("");
                }}
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="paper-panel p-4 md:p-6 space-y-4">
        <h3 className="text-2xl">Dungeon Room Lab + Linker</h3>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-2 lg:col-span-2">
            <span className="text-xs uppercase">Dungeon</span>
            <select
              value={selectedDungeonId}
              onChange={(event) => setSelectedDungeonId(event.target.value)}
              className="border-2 border-[#121212] px-3 py-2 bg-white"
            >
              {draft.world.dungeons.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase">New Room Name</span>
            <input
              value={newRoomName}
              onChange={(event) => setNewRoomName(event.target.value)}
              className="border-2 border-[#121212] px-3 py-2 bg-white"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase">Challenge</span>
            <input
              value={newRoomChallenge}
              onChange={(event) => setNewRoomChallenge(event.target.value)}
              className="border-2 border-[#121212] px-3 py-2 bg-white"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            className="tcg-button"
            onClick={() => {
              if (!dungeon || !newRoomName.trim()) return;
              updateActiveProject((next) => {
                const target = next.world.dungeons.find((entry) => entry.id === dungeon.id);
                target?.rooms.push({
                  id: `room-${Date.now().toString(36)}`,
                  name: newRoomName.trim(),
                  challenge: newRoomChallenge.trim() || "Challenge pending",
                  checks: ["Action Check DC 12"],
                  failForward: "Progress with complication.",
                  rewards: ["Momentum"],
                });
                return next;
              });
              setNewRoomName("");
              setNewRoomChallenge("");
            }}
          >
            Add Room
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {dungeon?.rooms.map((room) => (
            <div key={room.id} className="paper-panel-flat p-3 space-y-2">
              <input
                value={room.name}
                onChange={(event) => {
                  const value = event.target.value;
                  updateActiveProject((next) => {
                    const target = next.world.dungeons
                      .find((entry) => entry.id === dungeon.id)
                      ?.rooms.find((entry) => entry.id === room.id);
                    if (target) target.name = value;
                    return next;
                  });
                }}
                className="w-full border border-[#121212] px-2 py-1 bg-white font-bold"
              />
              <textarea
                value={room.challenge}
                onChange={(event) => {
                  const value = event.target.value;
                  updateActiveProject((next) => {
                    const target = next.world.dungeons
                      .find((entry) => entry.id === dungeon.id)
                      ?.rooms.find((entry) => entry.id === room.id);
                    if (target) target.challenge = value;
                    return next;
                  });
                }}
                className="w-full border border-[#121212] px-2 py-1 bg-white text-sm"
              />
              <button
                className="tcg-button"
                onClick={() => {
                  updateActiveProject((next) => {
                    const target = next.world.dungeons.find((entry) => entry.id === dungeon.id);
                    if (!target) return next;
                    target.rooms = target.rooms.filter((entry) => entry.id !== room.id);
                    next.roomLinks[dungeon.id] = (next.roomLinks[dungeon.id] ?? []).filter(
                      (link) => link.fromRoomId !== room.id && link.toRoomId !== room.id,
                    );
                    return next;
                  });
                }}
              >
                Remove Room
              </button>
            </div>
          ))}
        </div>

        <div className="paper-panel-flat p-3 space-y-2">
          <h4 className="text-sm uppercase">Room Linking</h4>
          <div className="grid gap-2 md:grid-cols-4">
            <select
              value={linkFrom}
              onChange={(event) => setLinkFrom(event.target.value)}
              className="border border-[#121212] px-2 py-1 bg-white"
            >
              <option value="">From room</option>
              {dungeon?.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            <select
              value={linkTo}
              onChange={(event) => setLinkTo(event.target.value)}
              className="border border-[#121212] px-2 py-1 bg-white"
            >
              <option value="">To room</option>
              {dungeon?.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
            <input
              value={linkLabel}
              onChange={(event) => setLinkLabel(event.target.value)}
              className="border border-[#121212] px-2 py-1 bg-white"
              placeholder="link label"
            />
            <button
              className="tcg-button"
              onClick={() => {
                if (!dungeon || !linkFrom || !linkTo) return;
                updateActiveProject((next) => {
                  next.roomLinks[dungeon.id] = [
                    ...(next.roomLinks[dungeon.id] ?? []),
                    {
                      id: `link-${Date.now().toString(36)}`,
                      fromRoomId: linkFrom,
                      toRoomId: linkTo,
                      label: linkLabel.trim() || "Path",
                    },
                  ];
                  return next;
                });
                setLinkFrom("");
                setLinkTo("");
              }}
            >
              Link
            </button>
          </div>

          <div className="space-y-1 text-sm">
            {(draft.roomLinks[selectedDungeonId] ?? []).map((link) => {
              const from = dungeon?.rooms.find((room) => room.id === link.fromRoomId)?.name ?? link.fromRoomId;
              const to = dungeon?.rooms.find((room) => room.id === link.toRoomId)?.name ?? link.toRoomId;
              return (
                <p key={link.id}>
                  {from} → {to} ({link.label})
                </p>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
