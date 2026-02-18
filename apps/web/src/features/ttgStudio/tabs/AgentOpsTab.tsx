import { useMemo, useRef, useState } from "react";
import { createAgentAdapter } from "../services/agentAdapters";
import type { TTGAgentSession } from "../services/agentAdapters";
import { useActiveProjectDraft, useTTGStudioStore } from "../state/useTTGStudioStore";

export function AgentOpsTab() {
  const draft = useActiveProjectDraft();
  const {
    updateActiveProject,
    appendPlaytestEvents,
    appendTranscriptLine,
    clearTranscript,
    setPlaytestRunning,
    setPlaytestStatus,
  } = useTTGStudioStore((state) => ({
    updateActiveProject: state.updateActiveProject,
    appendPlaytestEvents: state.appendPlaytestEvents,
    appendTranscriptLine: state.appendTranscriptLine,
    clearTranscript: state.clearTranscript,
    setPlaytestRunning: state.setPlaytestRunning,
    setPlaytestStatus: state.setPlaytestStatus,
  }));

  const adapterRef = useRef(createAgentAdapter("simulated"));
  const sessionRef = useRef<TTGAgentSession | null>(null);
  const [healthStatus, setHealthStatus] = useState("unchecked");

  const narrator = useMemo(
    () =>
      draft?.world.hostedAgents.find((entry) => entry.id === draft.agentOps.narratorId) ??
      draft?.world.hostedAgents[0] ??
      null,
    [draft],
  );

  if (!draft) {
    return <div className="paper-panel p-6">No active project found.</div>;
  }

  const stepSession = async () => {
    if (!sessionRef.current) {
      setPlaytestStatus("No active session. Start one first.");
      return;
    }
    const events = await adapterRef.current.stepTurn(sessionRef.current);
    appendPlaytestEvents(events);
    events
      .filter((event) => event.type !== "dice")
      .forEach((event) => appendTranscriptLine(event.message));
    if (events.some((event) => event.type === "end")) {
      setPlaytestRunning(false);
      sessionRef.current = null;
    }
  };

  return (
    <div className="space-y-6">
      <section className="paper-panel p-4 md:p-6 grid gap-4 lg:grid-cols-3">
        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase font-bold">Provider Mode</span>
          <select
            value={draft.agentOps.provider}
            onChange={(event) => {
              const provider = event.target.value as "simulated" | "hosted" | "eliza";
              updateActiveProject((next) => {
                next.agentOps.provider = provider;
                return next;
              });
            }}
            className="border-2 border-[#121212] px-3 py-2 bg-white"
          >
            <option value="simulated">Simulated</option>
            <option value="hosted">Hosted</option>
            <option value="eliza">ElizaOS</option>
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase font-bold">Narrator Agent</span>
          <select
            value={draft.agentOps.narratorId}
            onChange={(event) => {
              const narratorId = event.target.value;
              updateActiveProject((next) => {
                next.agentOps.narratorId = narratorId;
                return next;
              });
            }}
            className="border-2 border-[#121212] px-3 py-2 bg-white"
          >
            {draft.world.hostedAgents.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-xs uppercase font-bold">Session Seed</span>
          <input
            type="number"
            value={draft.agentOps.sessionSeed}
            onChange={(event) => {
              const seed = Number(event.target.value) || 1;
              updateActiveProject((next) => {
                next.agentOps.sessionSeed = seed;
                return next;
              });
            }}
            className="border-2 border-[#121212] px-3 py-2 bg-white"
          />
        </label>
      </section>

      <section className="paper-panel p-4 md:p-6 space-y-3">
        <h3 className="text-2xl">Role Assignment</h3>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {draft.world.playerAgentTemplates.map((agent) => {
            const checked = draft.agentOps.playerAgentIds.includes(agent.id);
            return (
              <label key={agent.id} className="paper-panel-flat p-3 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    const value = event.target.checked;
                    updateActiveProject((next) => {
                      const list = new Set(next.agentOps.playerAgentIds);
                      if (value) list.add(agent.id);
                      else list.delete(agent.id);
                      next.agentOps.playerAgentIds = Array.from(list);
                      return next;
                    });
                  }}
                />
                <span>
                  <strong className="block">{agent.name}</strong>
                  <span className="text-xs text-[#121212]/70">{agent.voice}</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="paper-panel p-4 md:p-6 space-y-3">
        <h3 className="text-2xl">Directive Editor</h3>

        {narrator ? (
          <label className="flex flex-col gap-2">
            <span className="text-xs uppercase font-bold">Narrator Directives ({narrator.name})</span>
            <textarea
              value={narrator.directives.join("\n")}
              onChange={(event) => {
                const value = event.target.value;
                updateActiveProject((next) => {
                  const target = next.world.hostedAgents.find((entry) => entry.id === narrator.id);
                  if (target) target.directives = value.split("\n").map((line) => line.trim()).filter(Boolean);
                  return next;
                });
              }}
              className="border-2 border-[#121212] p-3 bg-white min-h-28"
            />
          </label>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          {draft.world.playerAgentTemplates
            .filter((agent) => draft.agentOps.playerAgentIds.includes(agent.id))
            .map((agent) => (
              <label key={agent.id} className="flex flex-col gap-2">
                <span className="text-xs uppercase font-bold">{agent.name} Directives</span>
                <textarea
                  value={agent.directives.join("\n")}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateActiveProject((next) => {
                      const target = next.world.playerAgentTemplates.find((entry) => entry.id === agent.id);
                      if (target) {
                        target.directives = value
                          .split("\n")
                          .map((line) => line.trim())
                          .filter(Boolean);
                      }
                      return next;
                    });
                  }}
                  className="border-2 border-[#121212] p-3 bg-white min-h-24"
                />
              </label>
            ))}
        </div>
      </section>

      <section className="paper-panel p-4 md:p-6 space-y-3">
        <h3 className="text-2xl">Session Controls + Transcript</h3>
        <div className="flex flex-wrap gap-2">
          <button
            className="tcg-button"
            onClick={async () => {
              adapterRef.current = createAgentAdapter(draft.agentOps.provider);
              const health = await adapterRef.current.healthCheck();
              setHealthStatus(`${health.status}${health.details ? ` • ${health.details}` : ""}`);

              const session = await adapterRef.current.startSession({
                provider: draft.agentOps.provider,
                draft,
                seed: draft.agentOps.sessionSeed,
              });
              sessionRef.current = session;
              setPlaytestRunning(session.status === "running");
              setPlaytestStatus(`Session ${session.sessionId} started on ${session.provider}.`);
            }}
          >
            Start Session
          </button>
          <button className="tcg-button" onClick={stepSession}>
            Step Turn
          </button>
          <button
            className="tcg-button"
            onClick={async () => {
              if (!sessionRef.current) return;
              const events = await adapterRef.current.stopSession(sessionRef.current);
              appendPlaytestEvents(events);
              sessionRef.current = null;
              setPlaytestRunning(false);
              setPlaytestStatus("Session stopped.");
            }}
          >
            Stop Session
          </button>
          <button
            className="tcg-button"
            onClick={async () => {
              const health = await createAgentAdapter(draft.agentOps.provider).healthCheck();
              setHealthStatus(`${health.status}${health.details ? ` • ${health.details}` : ""}`);
            }}
          >
            Health Check
          </button>
          <button className="tcg-button" onClick={() => clearTranscript()}>
            Clear Transcript
          </button>
        </div>

        <p className="text-xs uppercase text-[#121212]/70">Health: {healthStatus}</p>

        <div className="paper-panel-flat p-3 max-h-72 overflow-auto space-y-1 text-sm">
          {draft.agentOps.transcript.length ? (
            draft.agentOps.transcript.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)
          ) : (
            <p className="text-[#121212]/60">No transcript yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
