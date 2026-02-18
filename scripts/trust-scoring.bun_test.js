import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addEvent,
  compactContributorState,
  compactState,
  computeTrustScore,
  createContributorState,
  expandState,
  expandStateMap,
} from "../.github/trust-scoring.js";

function fixedNow(base = 1_700_000_000_000) {
  return base;
}

function createApproveEvent(index, timestamp) {
  return {
    type: "approve",
    timestamp,
    linesChanged: 120,
    labels: ["bugfix"],
    prNumber: index,
  };
}

test("compact state round-trips event types and fields", () => {
  let state = createContributorState("agent-roundtrip");
  state = addEvent(state, createApproveEvent(1, fixedNow()));
  state = addEvent(state, {
    type: "reject",
    timestamp: fixedNow() + 60_000,
    linesChanged: 50,
    labels: ["core"],
    reviewSeverity: "major",
    prNumber: 2,
  });

  const compacted = compactState({ [state.c]: state });
  assert.equal(state.c, "agent-roundtrip");
  assert.equal(compacted["agent-roundtrip"].c, "agent-roundtrip");
  assert.equal(compacted["agent-roundtrip"].e[1].y, "r");

  const expanded = expandStateMap(compacted);
  assert.equal(expanded["agent-roundtrip"].e[1].type, "reject");
  assert.equal(expanded["agent-roundtrip"].e[1].reviewSeverity, "major");
  assert.equal(expanded["agent-roundtrip"].e[1].prNumber, 2);
});

test("reject severity changes score impact", () => {
  const baseTs = fixedNow();
  const baseConfig = {
    recencyHalfLifeDays: 10_000,
    velocity: {
      softCapPRs: 100,
      hardCapPRs: 200,
      penaltyPerExcess: 0,
      windowDays: 7,
    },
    decay: { gracePeriodDays: 0, ratePerDay: 0, floor: 0, target: 0 },
    initialScore: 0,
  };

  let normal = createContributorState("agent-severity-normal");
  normal = addEvent(normal, createApproveEvent(1, baseTs));
  normal = addEvent(normal, {
    type: "reject",
    timestamp: baseTs + 1,
    linesChanged: 20,
    reviewSeverity: "normal",
    prNumber: 2,
  });
  const normalScore = computeTrustScore(normal, baseConfig).score;

  let major = createContributorState("agent-severity-major");
  major = addEvent(major, createApproveEvent(1, baseTs));
  major = addEvent(major, {
    type: "reject",
    timestamp: baseTs + 1,
    linesChanged: 20,
    reviewSeverity: "major",
    prNumber: 2,
  });
  const majorScore = computeTrustScore(major, baseConfig).score;

  assert(majorScore < normalScore, "major severity should penalize more than normal");
});

test("daily positive cap applies and truncates within a day", () => {
  const baseTs = fixedNow();
  const nowState = {
    initialScore: 0,
    dailyPointCap: 5,
    decay: {
      gracePeriodDays: 0,
      ratePerDay: 0,
      floor: 0,
      target: 0,
    },
    velocity: {
      softCapPRs: 100,
      hardCapPRs: 200,
      penaltyPerExcess: 0,
      windowDays: 7,
    },
    decay: { gracePeriodDays: 0, ratePerDay: 0, floor: 0, target: 0 },
  };

  let state = createContributorState("agent-daily");
  state = addEvent(state, {
    ...createApproveEvent(1, baseTs),
    linesChanged: 200,
  });
  state = addEvent(state, {
    ...createApproveEvent(2, baseTs + 1_000),
    linesChanged: 200,
  });

  const result = computeTrustScore(state, {
    ...nowState,
    recencyHalfLifeDays: 10_000,
  });
  assert.equal(result.breakdown.positivePoints, 5);
  assert.equal(
    result.breakdown.warnings.filter((warning) => warning.includes("Daily cap truncated")).length,
    1,
  );
  assert.equal(
    result.breakdown.warnings.filter((warning) => warning.includes("Daily cap reached")).length,
    1,
  );
});

test("velocity hard cap zeros additional positive contribution", () => {
  const baseTs = fixedNow();
  let state = createContributorState("agent-velocity");
  state = addEvent(state, createApproveEvent(1, baseTs));
  state = addEvent(state, createApproveEvent(2, baseTs + 1_000));
  state = addEvent(state, createApproveEvent(3, baseTs + 2_000));

  const config = {
    initialScore: 0,
    dailyPointCap: 1000,
    velocity: {
      softCapPRs: 2,
      hardCapPRs: 2,
      penaltyPerExcess: 0.0,
      windowDays: 7,
    },
    decay: { gracePeriodDays: 0, ratePerDay: 0, floor: 0, target: 0 },
    recencyHalfLifeDays: 10_000,
    diminishingRate: 0,
  };
  const result = computeTrustScore(state, config);
  assert.equal(result.breakdown.totalApprovals, 3);
  assert.equal(result.breakdown.velocityGateHits, 1);
  assert.equal(result.warnings.filter((warning) => warning.includes("Daily cap")).length, 0);
});

test("compactContributorState preserves mixed event shapes", () => {
  const eventStyle = {
    type: "approve",
    ts: fixedNow(),
    linesChanged: 12,
    labels: ["bugfix"],
    reviewSeverity: "normal",
    prNumber: 99,
  };
  const expandedState = expandState({
    c: "agent-mixed",
    t: fixedNow(),
    m: 1,
    e: [eventStyle],
  });
  const compact = compactContributorState(expandedState);
  assert.equal(compact.e.length, 1);
  assert.equal(compact.e[0].y, "a");
});
