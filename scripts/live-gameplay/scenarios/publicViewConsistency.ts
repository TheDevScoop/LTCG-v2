import type { LtcgAgentApiClient } from "../agentApi";
import { appendTimeline } from "../report";
import type { LiveGameplayAssertion } from "../types";

type PublicEventLike = {
  version?: unknown;
  actor?: unknown;
};

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function runPublicViewConsistencyScenario(args: {
  client: LtcgAgentApiClient;
  timelinePath: string;
  matchId: string;
}): Promise<{ matchId: string; assertions: LiveGameplayAssertion[] }> {
  const assertions: LiveGameplayAssertion[] = [];

  const view = await args.client.getPublicView({ matchId: args.matchId });
  const viewIsObject = typeof view === "object" && view !== null;
  assertions.push({
    id: "public_view_non_null",
    ok: viewIsObject,
    details: viewIsObject ? "public view returned" : "public view was null/invalid",
  });
  if (!viewIsObject) {
    throw new Error("public view did not return an object");
  }

  const seat = (view as Record<string, unknown>).seat;
  const seatIsValid = seat === "host" || seat === "away";
  assertions.push({
    id: "public_view_seat_valid",
    ok: seatIsValid,
    details: `seat=${String(seat)}`,
  });

  const events = await args.client.getPublicEvents({ matchId: args.matchId, sinceVersion: 0 });
  const eventsArray = Array.isArray(events);
  assertions.push({
    id: "public_events_array",
    ok: eventsArray,
    details: eventsArray ? `count=${events.length}` : "events payload was not an array",
  });
  if (!eventsArray) {
    throw new Error("public events endpoint did not return an array");
  }

  let monotonic = true;
  let previousVersion = -Infinity;
  for (const entry of events as PublicEventLike[]) {
    const version = toFiniteNumber(entry?.version);
    if (version === null) {
      monotonic = false;
      break;
    }
    if (version < previousVersion) {
      monotonic = false;
      break;
    }
    previousVersion = version;
  }
  assertions.push({
    id: "public_event_versions_monotonic",
    ok: monotonic,
    details: events.length > 0 ? `lastVersion=${String(previousVersion)}` : "no events",
  });

  if (!monotonic) {
    throw new Error("public event versions are not monotonic");
  }

  const maxVersion = Number.isFinite(previousVersion) ? previousVersion : 0;
  const newerEvents = await args.client.getPublicEvents({
    matchId: args.matchId,
    sinceVersion: maxVersion,
  });
  const strictlyAfter = Array.isArray(newerEvents)
    ? newerEvents.every((entry) => {
        const version = toFiniteNumber((entry as PublicEventLike).version);
        return version !== null && version > maxVersion;
      })
    : false;
  assertions.push({
    id: "public_events_since_version_applied",
    ok: strictlyAfter,
    details: Array.isArray(newerEvents)
      ? `filteredCount=${newerEvents.length} since=${maxVersion}`
      : "filtered payload was not an array",
  });

  if (!strictlyAfter) {
    throw new Error("public events filter by sinceVersion is inconsistent");
  }

  await appendTimeline(args.timelinePath, {
    type: "note",
    message: `public_view_consistency seat=${String(seat)} events=${events.length}`,
  });

  return {
    matchId: args.matchId,
    assertions,
  };
}
