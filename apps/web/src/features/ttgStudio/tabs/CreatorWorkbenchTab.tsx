import { useEffect, useMemo, useState } from "react";
import { compilePrompt } from "@/lib/ttrpgStudio";
import { useActiveProjectDraft, useTTGStudioStore } from "../state/useTTGStudioStore";

type GeneratedCharacter = {
  name: string;
  archetype: string;
  pitch: string;
  signatureMove: string;
  flaw: string;
  goal: string;
  stats: Array<{ label: string; value: number }>;
};

const FLAWS = [
  "trusts bad intel under pressure",
  "pushes too far to prove a point",
  "keeps vital secrets too long",
  "ignores retreat windows",
  "underestimates social consequences",
];

const GOALS = [
  "break a faction retaliation loop",
  "secure leverage for crew survival",
  "redeem a failed mission",
  "expose the hidden architect",
  "protect an at-risk district",
];

function hash(input: string) {
  let value = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function CreatorWorkbenchTab() {
  const draft = useActiveProjectDraft();
  const updateActiveProject = useTTGStudioStore((state) => state.updateActiveProject);

  const [selectedArchetypeId, setSelectedArchetypeId] = useState("");
  const [selectedArcId, setSelectedArcId] = useState("");
  const [selectedBeatId, setSelectedBeatId] = useState("");
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [nameSeed, setNameSeed] = useState("Echo Vale");
  const [focus, setFocus] = useState("high-pressure tactical play");
  const [newMove, setNewMove] = useState("Flash Counter");
  const [newGear, setNewGear] = useState("Emergency Signal")
  const [generated, setGenerated] = useState<GeneratedCharacter | null>(null);

  useEffect(() => {
    if (!draft) return;
    setSelectedArchetypeId(draft.world.archetypes[0]?.id ?? "");
    setSelectedArcId(draft.world.campaign[0]?.id ?? "");
    setSelectedBeatId(draft.world.campaign[0]?.beats[0]?.id ?? "");
    setSelectedPromptId(draft.world.creationKit.corePrompts[0]?.id ?? "");
    setGenerated(null);
  }, [draft?.id]);

  const archetype = useMemo(
    () => draft?.world.archetypes.find((entry) => entry.id === selectedArchetypeId) ?? null,
    [draft, selectedArchetypeId],
  );

  const arc = useMemo(
    () => draft?.world.campaign.find((entry) => entry.id === selectedArcId) ?? null,
    [draft, selectedArcId],
  );

  const beat = useMemo(
    () => arc?.beats.find((entry) => entry.id === selectedBeatId) ?? null,
    [arc, selectedBeatId],
  );

  const prompt = useMemo(
    () => draft?.world.creationKit.corePrompts.find((entry) => entry.id === selectedPromptId) ?? null,
    [draft, selectedPromptId],
  );

  const compiledPrompt = useMemo(() => {
    if (!prompt || !archetype) return "";
    return compilePrompt(prompt, {
      archetype: archetype.title,
      player_style: focus,
      campaign_arc: arc?.title ?? "",
      risk_tolerance: "balanced",
      world_name: draft?.world.name ?? "",
      genre: draft?.world.genre ?? "",
      tone: draft?.world.mood ?? "",
      themes: draft?.world.tagline ?? "",
      factions: draft?.world.viralityHooks.join(", "),
      tech_or_magic_level: draft?.world.rules.name ?? "",
      party_level: arc?.levelRange ?? "",
      party_size: draft?.world.recommendedPartySize ?? "",
      goal: beat?.objective ?? "",
      world_constraint: draft?.world.rules.failForwardPolicy ?? "",
      party_profile: focus,
      threat_budget: "medium",
      environment: draft?.world.maps[0]?.biome ?? "",
      stakes: beat?.objective ?? "",
      biome: draft?.world.maps[0]?.biome ?? "",
      objective: beat?.objective ?? "",
      enemy_style: "adaptive",
      time_pressure: "high",
    });
  }, [prompt, archetype, focus, arc, beat, draft]);

  if (!draft) {
    return <div className="paper-panel p-6">No active project found.</div>;
  }

  const generateCharacter = () => {
    if (!archetype) return;
    const seed = hash(`${nameSeed}|${focus}|${archetype.id}|${draft.world.id}`);
    const nextStats = archetype.stats.map((stat, index) => ({
      label: stat.label,
      value: Math.max(stat.min, Math.min(stat.max, stat.base + ((seed >> index) % 3) - 1)),
    }));

    setGenerated({
      name: nameSeed.trim() || "Unnamed Operative",
      archetype: archetype.title,
      pitch: `${archetype.fantasy} Tuned for ${focus}.`,
      signatureMove: archetype.startingMoves[seed % archetype.startingMoves.length] ?? "Adaptive stance",
      flaw: FLAWS[seed % FLAWS.length],
      goal: GOALS[(seed >> 3) % GOALS.length],
      stats: nextStats,
    });
  };

  return (
    <div className="space-y-6">
      <section className="paper-panel p-4 md:p-6 grid gap-4 lg:grid-cols-3">
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase font-bold">Archetype</span>
          <select
            value={selectedArchetypeId}
            onChange={(event) => setSelectedArchetypeId(event.target.value)}
            className="border-2 border-[#121212] px-3 py-2 bg-white"
          >
            {draft.world.archetypes.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase font-bold">Character Seed</span>
          <input
            value={nameSeed}
            onChange={(event) => setNameSeed(event.target.value)}
            className="border-2 border-[#121212] px-3 py-2 bg-white"
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase font-bold">Playstyle Focus</span>
          <input
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            className="border-2 border-[#121212] px-3 py-2 bg-white"
          />
        </label>

        <button className="tcg-button" onClick={generateCharacter}>
          Generate Character
        </button>
      </section>

      {generated && (
        <section className="paper-panel p-4 md:p-6">
          <h3 className="text-2xl">Character Forge Output</h3>
          <p className="text-sm text-[#121212]/70">{generated.pitch}</p>
          <p className="mt-2 text-sm">Signature Move: {generated.signatureMove}</p>
          <p className="text-sm">Flaw: {generated.flaw}</p>
          <p className="text-sm">Goal: {generated.goal}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {generated.stats.map((stat) => (
              <span key={stat.label} className="paper-panel-flat px-3 py-1 text-xs uppercase">
                {stat.label}: {stat.value}
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="paper-panel p-4 md:p-6 space-y-4">
        <h3 className="text-2xl">Archetype Remix + Stat Tuning</h3>
        {archetype ? (
          <>
            <p className="text-sm text-[#121212]/70">{archetype.fantasy}</p>
            <div className="grid gap-3 md:grid-cols-3">
              {archetype.stats.map((stat) => (
                <label key={stat.key} className="flex flex-col gap-2 paper-panel-flat p-3">
                  <span className="text-xs uppercase">{stat.label}</span>
                  <input
                    type="range"
                    min={stat.min}
                    max={stat.max}
                    value={stat.base}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      updateActiveProject((next) => {
                        const target = next.world.archetypes.find((entry) => entry.id === archetype.id);
                        const targetStat = target?.stats.find((entry) => entry.key === stat.key);
                        if (targetStat) targetStat.base = nextValue;
                        return next;
                      });
                    }}
                  />
                  <span className="text-xs">Base: {stat.base}</span>
                </label>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-xs uppercase">Add Starting Move</span>
                <input
                  value={newMove}
                  onChange={(event) => setNewMove(event.target.value)}
                  className="border-2 border-[#121212] px-3 py-2 bg-white"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs uppercase">Add Starting Gear</span>
                <input
                  value={newGear}
                  onChange={(event) => setNewGear(event.target.value)}
                  className="border-2 border-[#121212] px-3 py-2 bg-white"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="tcg-button"
                onClick={() => {
                  if (!newMove.trim()) return;
                  updateActiveProject((next) => {
                    const target = next.world.archetypes.find((entry) => entry.id === archetype.id);
                    if (target && !target.startingMoves.includes(newMove.trim())) {
                      target.startingMoves.push(newMove.trim());
                    }
                    return next;
                  });
                  setNewMove("");
                }}
              >
                Add Move
              </button>
              <button
                className="tcg-button"
                onClick={() => {
                  if (!newGear.trim()) return;
                  updateActiveProject((next) => {
                    const target = next.world.archetypes.find((entry) => entry.id === archetype.id);
                    if (target && !target.startingGear.includes(newGear.trim())) {
                      target.startingGear.push(newGear.trim());
                    }
                    return next;
                  });
                  setNewGear("");
                }}
              >
                Add Gear
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm">Select an archetype to tune.</p>
        )}
      </section>

      <section className="paper-panel p-4 md:p-6 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-2xl">Rules + Dice Editor</h3>
          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase">Rules Summary</span>
            <textarea
              value={draft.world.rules.summary}
              onChange={(event) => {
                const value = event.target.value;
                updateActiveProject((next) => {
                  next.world.rules.summary = value;
                  return next;
                });
              }}
              className="border-2 border-[#121212] p-3 bg-white min-h-24"
            />
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase">Fail Forward Policy</span>
            <textarea
              value={draft.world.rules.failForwardPolicy}
              onChange={(event) => {
                const value = event.target.value;
                updateActiveProject((next) => {
                  next.world.rules.failForwardPolicy = value;
                  return next;
                });
              }}
              className="border-2 border-[#121212] p-3 bg-white min-h-20"
            />
          </label>

          <div className="space-y-2">
            {draft.world.diceMoves.map((move) => (
              <label key={move.id} className="flex flex-col gap-1 paper-panel-flat p-2">
                <span className="text-xs uppercase">{move.label}</span>
                <input
                  value={move.expression}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateActiveProject((next) => {
                      const target = next.world.diceMoves.find((entry) => entry.id === move.id);
                      if (target) target.expression = value;
                      return next;
                    });
                  }}
                  className="border border-[#121212] px-2 py-1 bg-white"
                />
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-2xl">Story Beat Planner</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-xs uppercase">Campaign Arc</span>
              <select
                value={selectedArcId}
                onChange={(event) => setSelectedArcId(event.target.value)}
                className="border-2 border-[#121212] px-3 py-2 bg-white"
              >
                {draft.world.campaign.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs uppercase">Beat</span>
              <select
                value={selectedBeatId}
                onChange={(event) => setSelectedBeatId(event.target.value)}
                className="border-2 border-[#121212] px-3 py-2 bg-white"
              >
                {arc?.beats.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {beat && (
            <div className="space-y-2">
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase">Objective</span>
                <textarea
                  value={beat.objective}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateActiveProject((next) => {
                      const targetArc = next.world.campaign.find((entry) => entry.id === arc?.id);
                      const targetBeat = targetArc?.beats.find((entry) => entry.id === beat.id);
                      if (targetBeat) targetBeat.objective = value;
                      return next;
                    });
                  }}
                  className="border-2 border-[#121212] bg-white p-2"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs uppercase">Fail Forward</span>
                <textarea
                  value={beat.failForward}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateActiveProject((next) => {
                      const targetArc = next.world.campaign.find((entry) => entry.id === arc?.id);
                      const targetBeat = targetArc?.beats.find((entry) => entry.id === beat.id);
                      if (targetBeat) targetBeat.failForward = value;
                      return next;
                    });
                  }}
                  className="border-2 border-[#121212] bg-white p-2"
                />
              </label>
            </div>
          )}
        </div>
      </section>

      <section className="paper-panel p-4 md:p-6 space-y-3">
        <h3 className="text-2xl">Prompt-Assisted Generation Preview</h3>
        <label className="flex flex-col gap-2 md:max-w-lg">
          <span className="text-xs uppercase">Prompt Template</span>
          <select
            value={selectedPromptId}
            onChange={(event) => setSelectedPromptId(event.target.value)}
            className="border-2 border-[#121212] px-3 py-2 bg-white"
          >
            {draft.world.creationKit.corePrompts.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>

        <pre className="paper-panel-flat p-3 text-xs whitespace-pre-wrap overflow-x-auto">{compiledPrompt}</pre>
      </section>
    </div>
  );
}
