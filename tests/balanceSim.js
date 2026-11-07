// Run: node tests/balanceSim.js [matches-per-scenario, default 20]
// Pure engine simulation: no socket, network, filesystem writes or real clock.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { GameEngine } from '../src/gameEngine.js';
import { gameConfig } from '../src/gameConfig.js';

export function seededRng(seed) {
  let value = seed >>> 0 || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

export function simulateMatch({ size, share = 0.5, seed, config = gameConfig }) {
  const activityRng = seededRng(seed * 7919);
  let clock = 1_000_000;
  let elapsed = 0;
  let maxDisplacement = 0;
  const goals = [];
  const engine = new GameEngine({ config, rng: seededRng(seed * 104729), now: () => clock, emit: event => {
    if (event.type === 'goal') goals.push(elapsed);
  } });
  // Alternate majority side to avoid hiding an advantage in one team identifier.
  const majorityTeam = seed % 2 ? 'cr7' : 'm10';
  const majoritySize = Math.round(size * share);
  const hasMajority = majoritySize > size - majoritySize;
  const dt = config.tickIntervalMs / 1000;
  const cooldownSteps = Math.round(config.comment.cooldownMs / config.tickIntervalMs);
  const players = Array.from({ length: size }, (_, i) => ({
    userId: `player-${i}`, team: i < majoritySize ? majorityTeam : engine.opponent(majorityTeam),
    commentOffset: Math.floor(activityRng() * cooldownSteps)
  }));
  for (const player of players) engine.handleChat({ ...player, message: player.team });
  engine.handleViewerCount(size || 25); // Spectators must not disable empty-room AI.
  engine.start();

  // Random 10% of participants like (at least one if occupied), 10 likes every 2s.
  const likers = [...players];
  for (let i = likers.length - 1; i > 0; i--) {
    const j = Math.floor(activityRng() * (i + 1));
    [likers[i], likers[j]] = [likers[j], likers[i]];
  }
  likers.length = size ? Math.max(1, Math.round(size * 0.1)) : 0;
  // 18 gifts/match, distributed across all tiers, random donors and arrival times.
  const tiers = [1, 1, 1, 1, 1, 1, 1, 1, 10, 10, 10, 10, 10, 99, 99, 99, 99, 1000];
  for (let i = tiers.length - 1; i > 0; i--) {
    const j = Math.floor(activityRng() * (i + 1));
    [tiers[i], tiers[j]] = [tiers[j], tiers[i]];
  }
  const gifts = size ? tiers.map((coins, i) => ({
    step: Math.floor((i * 10 + 1 + activityRng() * 8) / dt),
    donor: players[Math.floor(activityRng() * size)], coins
  })) : [];
  let giftIndex = 0;
  const duration = config.phases.playing + config.phases.overtime;
  for (let step = 0; step < Math.round(duration / dt); step++) {
    for (const player of players) {
      if (step % cooldownSteps === player.commentOffset) engine.handleChat({ ...player, message: player.team });
    }
    if (step % cooldownSteps === 0) for (const player of likers) engine.handleLike({ ...player, likeCount: 10 });
    while (giftIndex < gifts.length && gifts[giftIndex].step === step) {
      const { donor, coins } = gifts[giftIndex++];
      engine.handleGift({ ...donor, diamondCount: coins, deltaCoins: coins, giftName: `tier-${coins}` });
    }
    clock += config.tickIntervalMs;
    elapsed = (step + 1) * dt;
    engine.tick(dt);
    maxDisplacement = Math.max(maxDisplacement, Math.abs(engine.ball.pos));
  }
  assert.equal(engine.phase, 'RESULT');
  assert.equal(engine.getState().activeJoined, size);
  return {
    goals: goals.length, gaps: goals.slice(1).map((at, i) => at - goals[i]),
    firstGoal: goals[0] ?? null, maxDisplacement, winner: engine.result.winner,
    majorityWon: hasMajority && engine.result.winner === majorityTeam,
    minorityWon: hasMajority && engine.result.winner === engine.opponent(majorityTeam),
    hasMajority, split: `${majoritySize}/${size - majoritySize}`
  };
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function runScenario(size, share, matches = 20, config = gameConfig) {
  const runs = Array.from({ length: matches }, (_, i) => simulateMatch({ size, share, seed: i + 1, config }));
  const gaps = runs.flatMap(run => run.gaps);
  const rate = predicate => 100 * runs.filter(predicate).length / matches;
  return {
    size, ratio: size ? `${share * 100}/${100 - share * 100}` : 'AI', split: runs[0].split,
    avgGoals: runs.reduce((sum, run) => sum + run.goals, 0) / matches,
    maxGoals: Math.max(...runs.map(run => run.goals)),
    minGap: gaps.length ? Math.min(...gaps) : null, medianGap: median(gaps),
    majorityWin: runs[0].hasMajority ? rate(run => run.majorityWon) : null,
    minorityWin: runs[0].hasMajority ? rate(run => run.minorityWon) : null,
    draws: rate(run => !run.winner), scored: rate(run => run.goals > 0),
    moved: rate(run => run.maxDisplacement > 1),
  };
}

export function compareCommentImpact() {
  const config = structuredClone(gameConfig);
  config.ai.baseForce = 0;
  config.ai.variation = 0;
  const duration = 20;
  const run = commenting => {
    let clock = 1_000_000;
    const engine = new GameEngine({ config, now: () => clock, rng: () => 0.5 });
    engine.handleChat({ userId: 'a', message: '7' });
    engine.handleChat({ userId: 'b', message: '10' });
    engine.start();
    let integratedForce = 0;
    for (let step = 0; step < duration * 1000 / config.tickIntervalMs; step++) {
      if (commenting && step * config.tickIntervalMs % config.comment.cooldownMs === 0) engine.handleChat({ userId: 'a', message: '7' });
      clock += config.tickIntervalMs;
      engine.tick(config.tickIntervalMs / 1000);
      integratedForce += engine.forces.cr7 * config.tickIntervalMs / 1000;
    }
    return { integratedForce, ballPos: engine.ball.pos };
  };
  const idle = run(false);
  const commenting = run(true);
  return { idle, commenting, forceRatio: commenting.integratedForce / idle.integratedForce };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const matches = Number(process.argv[2] || 20);
  assert.ok(Number.isInteger(matches) && matches > 0, 'matches must be a positive integer');
  console.log(`${matches} seeds per scenario; 180s; all comment every 2s; 10% like; 18 random gifts (8 basic, 5 skill, 4 golden, 1 freeze).`);
  console.log('2 players cannot represent 60/40: rounded to 1/1, majority win is N/A. Gaps exclude kickoff -> first goal. Goals count events, not doubled overtime points.');
  const rows = [runScenario(0, 0.5, matches)];
  for (const size of [2, 10, 100, 500]) for (const share of [0.5, 0.6]) rows.push(runScenario(size, share, matches));
  const number = value => value === null ? 'N/A' : value.toFixed(2);
  console.table(rows.map(row => ({
    players: row.size, ratio: row.ratio, actual: row.split,
    'goals avg': number(row.avgGoals), 'goals max': row.maxGoals,
    'gap min s': number(row.minGap), 'gap median s': number(row.medianGap),
    'majority win %': number(row.majorityWin), 'minority win %': number(row.minorityWin),
    'draw %': number(row.draws), 'scored %': number(row.scored)
  })));
  for (const row of rows) {
    const checks = [];
    if (!row.size) checks.push(['AI moves in every match and scores in several matches', row.moved === 100 && row.scored >= 20 && row.avgGoals < 3]);
    else if (row.ratio === '50/50') checks.push(['2-8 average goals', row.avgGoals >= 2 && row.avgGoals <= 8]);
    else if (row.majorityWin !== null) checks.push(['majority wins more, below 95%', row.majorityWin > row.minorityWin && row.majorityWin < 95], ['max 15 goals', row.maxGoals <= 15]);
    if (row.size) checks.push(['no goal gaps under 8s', row.minGap === null || row.minGap >= 8]);
    console.log(`${row.size} ${row.ratio}: ${checks.map(([label, ok]) => `${ok ? 'PASS' : 'UNMET'} ${label}`).join('; ')}`);
  }
  const impact = compareCommentImpact();
  assert.ok(impact.forceRatio >= 3, 'Comment contribution must be at least 2x own base (total >=3x)');
  assert.ok(impact.commenting.ballPos > impact.idle.ballPos + 100, 'Comment must move the ball visibly more than idle');
  console.log(`Comment vs idle (AI off, 20s): total force ${impact.forceRatio.toFixed(3)}x; displacement ${impact.commenting.ballPos.toFixed(2)} vs ${impact.idle.ballPos.toFixed(2)}. Soft tuning targets are reported as UNMET; assertions only fail for broken invariants.`);
}
