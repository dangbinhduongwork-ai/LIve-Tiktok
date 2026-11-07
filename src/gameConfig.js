// All match rules and presentation values live here so the engine stays reusable.
export const gameConfig = {
  teams: {
    cr7: {
      name: 'CR7', color: '#ef4444', lightColor: '#fff1f2',
      shirtNumber: 7, keywords: ['7', 'cr7']
    },
    m10: {
      name: 'M10', color: '#3b82f6', lightColor: '#eff6ff',
      shirtNumber: 10, keywords: ['10', 'm10']
    }
  },
  phases: { waiting: 5, playing: 150, overtime: 30, result: 15 },
  overtime: { always: true, maxScoreGap: 1 },
  fieldLimit: 1000,
  tickIntervalMs: 50,
  stateIntervalMs: 100,
  movement: { maxSpeed: 60, damping: 8 },
  playerBaseForce: 1,
  activeWindowSeconds: 120,
  unassignedGift: { policy: 'auto_balance' }, // auto_balance | hash | ignore
  queue: { maxPending: 4096, maxPerTick: 100, reservedGiftSlots: 512, warningIntervalMs: 5000 },
  forceLimits: { maxActiveBursts: 512, maxEffectiveForcePerTeam: 1500 },
  comment: { force: 3, cooldownMs: 2000, burstSeconds: 2, maxSmallBalls: 30, smallBallSeconds: 1.2 },
  likes: { boostPerLike: 0.001, maxBoost: 0.25, decayPerSecond: 0.02 },
  gifts: {
    basicForcePerCoin: 5, basicForceCap: 25,
    skillMinCoins: 10, skillForce: 40, skillCooldownMs: 3000,
    goldenMinCoins: 99, goldenForce: 120, goldenCooldownMs: 60000,
    freezeMinCoins: 1000, freezeMultiplier: 0.3, freezeSeconds: 10,
    freezeBlockLastSeconds: 20, burstSeconds: 1
  },
  goal: { pauseSeconds: 3, overtimeScore: 2 },
  comeback: { positionThreshold: 400, forceBonus: 0.15 },
  // Hold each AI push long enough to move the ball instead of cancelling every tick.
  ai: { baseForce: 6, variation: 6, fullPlayers: 12, decisionSeconds: 40 },
  topDonorCount: 3
};
