'use strict';

const MINUTES = 60 * 1000;
const HOURS = 60 * MINUTES;
const DAYS = 24 * HOURS;

const TYPE_CODE = {
  approve: "a",
  reject: "r",
  close: "c",
  selfClose: "s",
};

const TYPE_MULTIPLIER = {
  approve: 1,
  reject: -1,
  close: 0,
  selfClose: 0,
};

const CATEGORY_WEIGHTS = {
  security: 1.8,
  "critical-fix": 1.5,
  core: 1.3,
  feature: 1.1,
  bugfix: 1.0,
  refactor: 0.9,
  test: 0.8,
  docs: 0.6,
  chore: 0.5,
  aesthetic: 0.4,
  default: 0.8,
};

const SEVERITY_WEIGHTS = {
  critical: 1.8,
  major: 1.3,
  normal: 1.0,
  minor: 0.5,
  trivial: 0.3,
};

const BASE_POINTS = {
  approve: 12,
  reject: -8,
  close: 0,
  selfClose: 0,
};

const TIERS = [
  { max: 100, min: 90, tier: "legendary", label: "Auto-merge eligible" },
  { max: 89, min: 75, tier: "trusted", label: "Expedited review" },
  { max: 74, min: 60, tier: "established", label: "Proven track record" },
  { max: 59, min: 45, tier: "contributing", label: "Standard review" },
  { max: 44, min: 30, tier: "probationary", label: "Closer scrutiny" },
  { max: 29, min: 15, tier: "untested", label: "New contributor" },
  { max: 14, min: 0, tier: "restricted", label: "Trust deficit" },
];

const DEFAULT_CONFIG = {
  initialScore: 35,
  diminishingRate: 0.2,
  recencyHalfLifeDays: 45,
  dailyPointCap: 35,
  velocity: {
    softCapPRs: 10,
    hardCapPRs: 25,
    penaltyPerExcess: 0.15,
    windowDays: 7,
  },
  streaks: {
    approvalBonusPct: 0.08,
    approvalCap: 0.5,
    rejectionPenaltyPct: 0.15,
    rejectionCap: 2.5,
  },
  complexityBuckets: [
    { max: 10, multiplier: 0.4 },
    { max: 50, multiplier: 0.7 },
    { max: 150, multiplier: 1.0 },
    { max: 500, multiplier: 1.3 },
    { max: 1500, multiplier: 1.5 },
  ],
  antiGaming: {
    massiveMultiplier: 1.2,
    massiveThreshold: 1500,
  },
  decay: {
    gracePeriodDays: 10,
    ratePerDay: 0.005,
    floor: 30,
    target: 40,
  },
  bounds: {
    minScore: 0,
    maxScore: 100,
  },
};

function createContributorState(contributorId) {
  return {
    c: String(contributorId),
    t: Date.now(),
    m: 0,
    e: [],
  };
}

function cloneDeep(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function toCompactEvent(event) {
  const type = normalizeType(event.type);
  if (!type) {
    throw new Error(`Unsupported event type: ${String(event.type)}`);
  }

  const timestamp = Number(event.timestamp) || Date.now();
  const linesChanged = Number(event.linesChanged) || 0;
  const labels = normalizeLabels(event.labels);
  const severity = normalizeSeverity(event.reviewSeverity);
  const prNumber = event.prNumber == null ? undefined : Number(event.prNumber);

  return {
    y: TYPE_CODE[type],
    ts: timestamp,
    l: linesChanged,
    lb: labels,
    s: severity,
    p: prNumber,
  };
}

function fromCompactEvent(event) {
  const y = String(event.y || "").toLowerCase();
  const type = Object.entries(TYPE_CODE).find(([, code]) => code === y)?.[0];
  return {
    type,
    ts: Number(event.ts || 0),
    linesChanged: Number(event.l || 0),
    labels: Array.isArray(event.lb) ? event.lb.slice() : [],
    reviewSeverity: event.s || "normal",
    prNumber: event.p,
  };
}

function normalizeType(type) {
  if (type == null) return null;
  const value = String(type);
  if (value === "selfClose") {
    return "selfClose";
  }
  const lower = value.toLowerCase();
  if (lower === "approve") {
    return "approve";
  }
  if (lower === "reject") return "reject";
  if (lower === "close") return "close";
  if (lower === "selfclose") return "selfClose";
  return null;
}

function normalizeLabels(labels) {
  if (!Array.isArray(labels)) {
    return [];
  }
  return labels
    .map((label) => String(label).toLowerCase().trim())
    .filter(Boolean)
    .filter((label, i, arr) => arr.indexOf(label) === i)
    .slice(0, 8);
}

function normalizeSeverity(value) {
  const severity = String(value || "normal").toLowerCase();
  return SEVERITY_WEIGHTS[severity] ? severity : "normal";
}

function normalizeConfig(overrides = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...overrides,
    velocity: {
      ...DEFAULT_CONFIG.velocity,
      ...(overrides.velocity || {}),
    },
    streaks: {
      ...DEFAULT_CONFIG.streaks,
      ...(overrides.streaks || {}),
    },
    antiGaming: {
      ...DEFAULT_CONFIG.antiGaming,
      ...(overrides.antiGaming || {}),
    },
    decay: {
      ...DEFAULT_CONFIG.decay,
      ...(overrides.decay || {}),
    },
    bounds: {
      ...DEFAULT_CONFIG.bounds,
      ...(overrides.bounds || {}),
    },
  };
}

function addEvent(state, event) {
  const contributorState = expandState(state);
  const compact = toCompactEvent(event);

  const updated = cloneDeep(contributorState);
  updated.e.push({
    type: normalizeType(event.type),
    ts: compact.ts,
    linesChanged: compact.l,
    labels: compact.lb,
    reviewSeverity: compact.s,
    prNumber: compact.p,
  });
  updated.t = Math.max(updated.t || 0, compact.ts);
  updated.m += 1;
  updated.e.sort((a, b) => a.ts - b.ts);

  return compactContributorState(updated);
}

function expandState(state) {
  if (!state || typeof state !== "object") {
    throw new Error("State must be an object.");
  }

  if (Array.isArray(state.e)) {
    if (state.c == null) {
      throw new Error("Contributor state must include identifier `c`.");
    }
    return {
      c: String(state.c),
      t: Number(state.t || 0),
      m: Number(state.m || 0),
      e: state.e.map(fromCompactEvent),
    };
  }

  if (state.id && Array.isArray(state.events)) {
    return {
      c: String(state.id),
      t: Number(state.t || Date.now()),
      m: Number(state.m || 0),
      e: state.events.map((evt) => ({
        type: evt.type,
        ts: Number(evt.ts || 0),
        linesChanged: Number(evt.linesChanged || 0),
        labels: evt.labels || [],
        reviewSeverity: evt.reviewSeverity || "normal",
        prNumber: evt.prNumber,
      })),
    };
  }

  throw new Error("Unsupported contributor state shape.");
}

function compactContributorState(state) {
  return {
    c: String(state.c),
    t: Number(state.t || 0),
    m: Number(state.m || 0),
    e: state.e.map((evt) => {
      const type = evt.y
        ? Object.entries(TYPE_CODE).find(([, code]) => code === evt.y)?.[0]
        : normalizeType(evt.type);
      const code = TYPE_CODE[type || "approve"];
      return {
        y: code || TYPE_CODE.approve,
        ts: Number(evt.ts || 0),
        l: Number(evt.l || evt.linesChanged || 0),
        lb: normalizeLabels(evt.lb || evt.labels),
        s: normalizeSeverity(evt.s || evt.reviewSeverity),
        p: evt.p || evt.prNumber,
      };
    }),
  };
}

function applyComplexityMultiplier(linesChanged, config) {
  const bucket = config.complexityBuckets.find((entry) => linesChanged <= entry.max);
  if (bucket) {
    return bucket.multiplier;
  }
  return config.antiGaming.massiveMultiplier;
}

function applyCategoryMultiplier(labels) {
  if (!Array.isArray(labels) || labels.length === 0) {
    return CATEGORY_WEIGHTS.default;
  }

  let max = CATEGORY_WEIGHTS.default;
  for (const label of labels) {
    const value = CATEGORY_WEIGHTS[label];
    if (typeof value === "number" && value > max) {
      max = value;
    }
  }
  return max;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTier(score) {
  for (const item of TIERS) {
    if (score >= item.min && score <= item.max) {
      return item;
    }
  }
  return TIERS[TIERS.length - 1];
}

function computeTrustScore(state, configOverrides = {}, now = Date.now()) {
  const config = normalizeConfig(configOverrides);
  const parsed = expandState(state);
  const events = parsed.e
    .map((event) => ({ ...event, type: normalizeType(event.type) }))
    .filter((event) => event.type)
    .sort((a, b) => a.ts - b.ts);

  const breakdown = {
    totalApprovals: 0,
    totalRejections: 0,
    totalClose: 0,
    totalSelfClose: 0,
    positivePoints: 0,
    negativePoints: 0,
    cappedPositivePoints: 0,
    currentStreak: {
      approvals: 0,
      rejections: 0,
    },
    warnings: [],
    velocityGateHits: 0,
  };

  let score = config.initialScore;
  let approvalsSeen = 0;

  const recentPositive = [];
  const windowMs = config.velocity.windowDays * DAYS;
  const sevenDayMax = 24 * 3600 * 1000 * 7;

  const dailyPositive = new Map();
  let streakApprovals = 0;
  let streakRejections = 0;

  for (const raw of events) {
    const type = raw.type;
    const ts = Number(raw.ts || 0);
    const linesChanged = Number(raw.linesChanged || 0);
    const labels = Array.isArray(raw.labels) ? raw.labels : normalizeLabels(raw.labels);
    const severity = normalizeSeverity(raw.reviewSeverity);

    if (type === "approve") {
      breakdown.totalApprovals += 1;
    } else if (type === "reject") {
      breakdown.totalRejections += 1;
    } else if (type === "close") {
      breakdown.totalClose += 1;
    } else if (type === "selfClose") {
      breakdown.totalSelfClose += 1;
    }

    const base = BASE_POINTS[type];
    if (!Number.isFinite(base)) {
      continue;
    }

    if (base <= 0) {
      const negativeDelta = base;
      let adjustedDelta = negativeDelta;

      if (type === "reject") {
        const rejectionPenalty = Math.min(
          config.streaks.rejectionCap,
          1 + config.streaks.rejectionPenaltyPct * streakRejections,
        );
        adjustedDelta = base * SEVERITY_WEIGHTS[severity] * rejectionPenalty;
        streakRejections += 1;
        streakApprovals = 0;
      }

      score += adjustedDelta;
      breakdown.negativePoints += adjustedDelta;
      continue;
    }

    approvalsSeen += 1;

    const daysSinceEvent = Math.max(0, (now - ts) / DAYS);
    const recencyWeight = Math.pow(0.5, daysSinceEvent / config.recencyHalfLifeDays);
    const diminishing = 1 / (1 + config.diminishingRate * Math.log1p(Math.max(0, approvalsSeen - 1)));

    const complexityWeight = applyComplexityMultiplier(linesChanged, config);
    const categoryWeight = applyCategoryMultiplier(labels);

    streakApprovals += 1;
    streakRejections = 0;
    const approvalStreakBonus = Math.min(
      1 + config.streaks.approvalBonusPct * streakApprovals,
      1 + config.streaks.approvalCap,
    );

    const window = ts - windowMs;
    while (recentPositive.length > 0 && recentPositive[0] < window) {
      recentPositive.shift();
    }

    const projectedWindowCount = recentPositive.length + 1;
    let velocityMultiplier = 1;
    if (projectedWindowCount > config.velocity.softCapPRs) {
      if (projectedWindowCount > config.velocity.hardCapPRs) {
        velocityMultiplier = 0;
        breakdown.velocityGateHits += 1;
      } else {
        const excess = projectedWindowCount - config.velocity.softCapPRs;
        velocityMultiplier = Math.max(0, 1 - config.velocity.penaltyPerExcess * excess);
        if (velocityMultiplier <= 0) {
          velocityMultiplier = 0;
          breakdown.velocityGateHits += 1;
        }
      }
    }

    if (velocityMultiplier > 0) {
      recentPositive.push(ts);
    }

    let contribution =
      base *
      TYPE_MULTIPLIER[type] *
      recencyWeight *
      diminishing *
      complexityWeight *
      categoryWeight *
      approvalStreakBonus *
      velocityMultiplier;

    const dayKey = new Date(ts).toISOString().slice(0, 10);
    const alreadyUsed = dailyPositive.get(dayKey) || 0;
    const availableCap = Math.max(0, config.dailyPointCap - alreadyUsed);
    if (availableCap <= 0) {
      breakdown.warnings.push(`Daily cap reached for ${dayKey}`);
      contribution = 0;
    } else if (contribution > availableCap) {
      const truncated = contribution - availableCap;
      contribution = availableCap;
      breakdown.warnings.push(`Daily cap truncated ${truncated.toFixed(2)} points on ${dayKey}`);
    }

    dailyPositive.set(dayKey, (dailyPositive.get(dayKey) || 0) + contribution);

    score += contribution;
    breakdown.positivePoints += contribution;
    breakdown.cappedPositivePoints += contribution;
    breakdown.currentStreak.approvals = streakApprovals;
    breakdown.currentStreak.rejections = streakRejections;
  }

  score = clamp(score, config.bounds.minScore, config.bounds.maxScore);

  if (events.length > 0) {
    const lastEventTs = parsed.t || events[events.length - 1].ts || 0;
    const inactivityDays = Math.max(0, (now - lastEventTs) / DAYS);

    if (inactivityDays > config.decay.gracePeriodDays) {
      const decayDays = inactivityDays - config.decay.gracePeriodDays;
      const target = config.decay.target;
      const rate = config.decay.ratePerDay;
      score = target + (score - target) * Math.exp(-rate * decayDays);
    }
  }

  score = clamp(score, config.bounds.minScore, config.bounds.maxScore);
  score = Math.max(score, config.decay.floor);

  const rounded = Math.round(score);
  const normalizedScore = clamp(rounded, config.bounds.minScore, config.bounds.maxScore);
  const tier = getTier(normalizedScore);

  const final = {
    score: normalizedScore,
    tier: tier.tier,
    tierInfo: {
      ...tier,
      trustFloor: config.decay.floor,
    },
    breakdown: {
      ...breakdown,
      eventCount: events.length,
      lastEventTs: parsed.t || 0,
      computedWithConfig: normalizeConfig(configOverrides),
    },
    warnings: breakdown.warnings,
  };

  return final;
}

function compactState(stateMap) {
  const output = {};
  for (const [contributorId, contributorState] of Object.entries(stateMap || {})) {
    output[contributorId] = compactContributorState(
      contributorState.c ? contributorState : createContributorState(contributorId),
    );
  }
  return output;
}

function expandStateMap(stateMap) {
  const output = {};
  for (const [contributorId, contributorState] of Object.entries(stateMap || {})) {
    output[contributorId] = expandState(
      contributorState.c == null
        ? createContributorState(contributorId)
        : contributorState,
    );
  }
  return output;
}

module.exports = {
  DEFAULT_CONFIG,
  createContributorState,
  addEvent,
  computeTrustScore,
  compactState,
  compactContributorState,
  expandState,
  expandStateMap,
};
