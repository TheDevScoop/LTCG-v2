import { useEffect, useMemo, useRef } from "react";
import { createAgentAdapter } from "../services/agentAdapters";
import type { TTGAgentSession } from "../services/agentAdapters";
import { useActiveProjectDraft, useTTGStudioStore } from "../state/useTTGStudioStore";

export function PlaytestTab() {
  const draft = useActiveProjectDraft();
  const {
    playtestEvents,
    playtestRunning,
    playtestStatus,
    setPlaytestRunning,
    setPlaytestStatus,
    clearPlaytest,
    appendPlaytestEvents,
    appendTranscriptLine,
  } = useTTGStudioStore((state) => ({
    playtestEvents: state.playtestEvents,
    playtestRunning: state.playtestRunning,
    playtestStatus: state.playtestStatus,
    setPlaytestRunning: state.setPlaytestRunning,
    setPlaytestStatus: state.setPlaytestStatus,
    clearPlaytest: state.clearPlaytest,
    appendPlaytestEvents: state.appendPlaytestEvents,
    appendTranscriptLine: state.appendTranscriptLine,
  }));

  const adapterRef = useRef(createAgentAdapter("simulated"));
  const sessionRef = useRef<TTGAgentSession | null>(null);
  const intervalRef = useRef<number | null>(null);

  const step = async () => {
    if (!sessionRef.current) return;
    const events = await adapterRef.current.stepTurn(sessionRef.current);
    appendPlaytestEvents(events);
    events
      .filter((event) => event.type !== "dice")
      .forEach((event) => appendTranscriptLine(event.message));
    const done = events.some((event) => event.type === "end");
    if (done) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setPlaytestRunning(false);
      sessionRef.current = null;
    }
  };

  const start = async () => {
    if (!draft) return;
    clearPlaytest();
    adapterRef.current = createAgentAdapter(draft.agentOps.provider);
    const session = await adapterRef.current.startSession({
      provider: draft.agentOps.provider,
      draft,
      seed: draft.agentOps.sessionSeed,
    });
    sessionRef.current = session;
    setPlaytestStatus(`Running ${session.provider} playtest with seed ${session.seed}.`);
    if (session.status !== "running") {
      setPlaytestRunning(false);
      return;
    }
    setPlaytestRunning(true);
    intervalRef.current = window.setInterval(() => {
      step();
    }, 900);
  };

  const pause = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPlaytestRunning(false);
    setPlaytestStatus("Playtest paused.");
  };

  const stop = async () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (sessionRef.current) {
      const events = await adapterRef.current.stopSession(sessionRef.current);
      appendPlaytestEvents(events);
      sessionRef.current = null;
    }
    setPlaytestRunning(false);
    setPlaytestStatus("Playtest stopped.");
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  const diceTimeline = useMemo(
    () => playtestEvents.filter((event) => event.type === "dice"),
    [playtestEvents],
  );

  const failForwardEvents = useMemo(
    () => playtestEvents.filter((event) => event.type === "fail_forward"),
    [playtestEvents],
  );

  const objectives = useMemo(() => {
    const objectiveMap = new Map<string, boolean>();
    for (const event of playtestEvents) {
      if (event.type === "objective") {
        const objective = String(event.data?.objective ?? "unknown objective");
        objectiveMap.set(objective, Boolean(event.data?.completed));
      }
    }
    return Array.from(objectiveMap.entries());
  }, [playtestEvents]);

  const endEvent = [...playtestEvents].reverse().find((event) => event.type === "end") ?? null;

  if (!draft) {
    return <div className="paper-panel p-6">No active project found.</div>;
  }

  return (
    <div className="space-y-6">
      <section className="paper-panel p-4 md:p-6 space-y-3">
        <h3 className="text-2xl">Deterministic Simulation Loop</h3>
        <p className="text-sm text-[#121212]/70">
          Provider: {draft.agentOps.provider} • Seed: {draft.agentOps.sessionSeed}
        </p>

        <div className="flex flex-wrap gap-2">
          <button className="tcg-button" onClick={start}>
            Start
          </button>
          <button className="tcg-button" onClick={pause} disabled={!playtestRunning}>
            Pause
          </button>
          <button className="tcg-button" onClick={step}>
            Step
          </button>
          <button className="tcg-button" onClick={stop}>
            Stop
          </button>
          <button className="tcg-button" onClick={clearPlaytest}>
            Clear Timeline
          </button>
        </div>

        <p className="text-xs uppercase">Status: {playtestStatus}</p>
      </section>

      <section className="paper-panel p-4 md:p-6 grid gap-4 lg:grid-cols-3">
        <div className="paper-panel-flat p-3">
          <h4 className="text-sm uppercase mb-2">Dice Timeline</h4>
          <div className="max-h-48 overflow-auto space-y-1 text-sm">
            {diceTimeline.map((event) => (
              <p key={event.id}>T{event.turn}: {event.message}</p>
            ))}
            {diceTimeline.length === 0 ? <p className="text-[#121212]/60">No rolls yet.</p> : null}
          </div>
        </div>

        <div className="paper-panel-flat p-3">
          <h4 className="text-sm uppercase mb-2">Objective Progress</h4>
          <div className="space-y-1 text-sm">
            {objectives.map(([objective, done]) => (
              <p key={objective}>{done ? "[done]" : "[open]"} {objective}</p>
            ))}
            {objectives.length === 0 ? <p className="text-[#121212]/60">No objective events yet.</p> : null}
          </div>
        </div>

        <div className="paper-panel-flat p-3">
          <h4 className="text-sm uppercase mb-2">Fail-Forward Feed</h4>
          <div className="max-h-48 overflow-auto space-y-1 text-sm">
            {failForwardEvents.map((event) => (
              <p key={event.id}>T{event.turn}: {event.message}</p>
            ))}
            {failForwardEvents.length === 0 ? <p className="text-[#121212]/60">No fail-forward events yet.</p> : null}
          </div>
        </div>
      </section>

      <section className="paper-panel p-4 md:p-6">
        <h3 className="text-2xl mb-2">End-of-Run Report</h3>
        {endEvent ? (
          <div className="paper-panel-flat p-3 text-sm space-y-1">
            <p>{endEvent.message}</p>
            <p>Total events: {playtestEvents.length}</p>
            <p>Final turn: {endEvent.turn}</p>
          </div>
        ) : (
          <p className="text-sm text-[#121212]/60">Run has not ended yet.</p>
        )}
      </section>
    </div>
  );
}
