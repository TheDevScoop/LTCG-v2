'use strict';

const scoring = require('./trust-scoring.js');

const HIGH_VELOCITY_CONFIG = {
  initialScore: 40,
  diminishingRate: 0.08,
  dailyPointCap: 80,
  velocity: {
    softCapPRs: 80,
    hardCapPRs: 200,
    penaltyPerExcess: 0.12,
    windowDays: 7,
  },
  decay: {
    gracePeriodDays: 14,
    ratePerDay: 0.003,
    floor: 35,
    target: 45,
  },
};

function computeTrustScore(state, config = {}, now = Date.now()) {
  return scoring.computeTrustScore(
    state,
    {
      ...HIGH_VELOCITY_CONFIG,
      ...config,
      velocity: {
        ...(scoring.DEFAULT_CONFIG.velocity || {}),
        ...(HIGH_VELOCITY_CONFIG.velocity || {}),
        ...(config.velocity || {}),
      },
      decay: {
        ...(scoring.DEFAULT_CONFIG.decay || {}),
        ...(HIGH_VELOCITY_CONFIG.decay || {}),
        ...(config.decay || {}),
      },
    },
    now,
  );
}

module.exports = {
  ...scoring,
  HIGH_VELOCITY_CONFIG,
  computeTrustScore,
};
