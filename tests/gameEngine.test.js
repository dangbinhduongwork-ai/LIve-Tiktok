import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEngine } from '../src/gameEngine.js';
import { gameConfig } from '../src/gameConfig.js';
import { compareCommentImpact } from './balanceSim.js';

function setup(rng = () => 0.5, config = gameConfig) {
  let clock = 100_000;
  const events = [];
  const engine = new GameEngine({ config, rng, now: () => clock, emit: event => events.push(event) });
  return { engine, events, advanceClock: ms => { clock += ms; } };
}

function join(engine, userId, team, nickname = userId) {
  engine.handleChat({ userId, nickname, message: team });
}

test('team selection is fixed for the match; only keywords join', () => {
  const { engine, events } = setup();
  assert.equal(engine.handleChat({ userId: 'a', message: 'hello' }), false);
  assert.equal(engine.handleChat({ userId: 'a', message: ' CR7 ' }), true);
  assert.equal(engine.handleChat({ userId: 'a', message: 'M10' }), false);
  assert.equal(engine.players.get('a').team, 'cr7');
  assert.equal(events.filter(event => event.type === 'team_join').length, 1);
  engine.reset();
  assert.equal(engine.handleChat({ userId: 'a', message: '10' }), true);
  assert.equal(engine.players.get('a').team, 'm10');
});

test('comment cooldown and small-ball cap', () => {
  const { engine, advanceClock } = setup();
  engine.start();
  join(engine, 'a', '7');
  assert.equal(engine.smallBalls.length, 1);
  assert.equal(engine.handleChat({ userId: 'a', message: '7' }), false);
  advanceClock(gameConfig.comment.cooldownMs);
  assert.equal(engine.handleChat({ userId: 'a', message: 'cr7' }), true);
  for (let i = 0; i < 50; i++) join(engine, `viewer-${i}`, 'M10');
  assert.equal(engine.smallBalls.length, gameConfig.comment.maxSmallBalls);
});

test('likes boost the assigned team, cap, and decay', () => {
  const { engine } = setup();
  engine.start();
  assert.equal(engine.handleLike({ userId: 'none', likeCount: 100 }), false);
  join(engine, 'a', '7');
  engine.handleLike({ userId: 'a', likeCount: 1000 });
  assert.equal(engine.likeBoost.cr7, gameConfig.likes.maxBoost);
  engine.tick(1);
  assert.ok(Math.abs(engine.likeBoost.cr7 - 0.23) < 1e-6);
});

test('gift tiers use deltaCoins, with skill, golden and freeze limits', () => {
  const { engine, events, advanceClock } = setup();
  engine.start();
  join(engine, 'a', '7');
  join(engine, 'b', '10');
  assert.equal(engine.handleGift({ userId: 'a', diamondCount: 1, deltaCoins: 5, giftName: 'Hoa Hồng' }), true);
  assert.equal(events.at(-1).force, gameConfig.gifts.basicForceCap);
  assert.equal(engine.handleGift({ userId: 'a', diamondCount: 1, deltaCoins: 10, giftName: 'Hoa Hồng' }), true);
  assert.equal(events.at(-1).force, gameConfig.gifts.basicForceCap);
  assert.equal(engine.handleGift({ userId: 'a', deltaCoins: 20, giftName: 'Nước Hoa' }), true);
  assert.equal(events.at(-1).force, gameConfig.gifts.skillForce);
  assert.equal(engine.handleGift({ userId: 'a', deltaCoins: 20 }), false);
  advanceClock(3000);
  assert.equal(engine.handleGift({ userId: 'a', deltaCoins: 20 }), true);
  assert.equal(engine.handleGift({ userId: 'a', deltaCoins: 199, giftName: 'Vương Miện' }), true);
  assert.equal(events.at(-1).force, gameConfig.gifts.goldenForce);
  assert.equal(engine.handleGift({ userId: 'a', deltaCoins: 99 }), false);
  assert.equal(engine.handleGift({ userId: 'a', deltaCoins: 1000 }), true);
  assert.equal(engine.freezeLeft.m10, 10);
  assert.equal(engine.handleGift({ userId: 'a', deltaCoins: 1000 }), false);
  assert.equal(events.some(event => event.type === 'freeze' && event.team === 'cr7'), true);
  assert.equal(engine.getState().teams.cr7.top3[0].coins, 2373);
});

test('a goal resets the ball, pauses play, and doubles only in overtime', () => {
  const { engine, events } = setup();
  engine.start();
  engine.ball.pos = gameConfig.fieldLimit - 0.1;
  join(engine, 'a', '7');
  engine.tick(0.1);
  assert.equal(engine.score.cr7, 1);
  assert.equal(engine.ball.pos, 0);
  assert.ok(engine.goalPauseLeft > 0);
  assert.equal(events.at(-1).type, 'goal');
  engine.players.clear();
  engine.tick(engine.timeLeft);
  assert.equal(engine.phase, 'OVERTIME');
  assert.equal(engine.forceGoal('m10'), true);
  assert.equal(engine.score.m10, 2);
});

test('every match has overtime, then result and a fresh match follow', () => {
  const close = setup().engine;
  close.tick(gameConfig.phases.waiting);
  assert.equal(close.phase, 'PLAYING');
  close.tick(gameConfig.phases.playing);
  assert.equal(close.phase, 'OVERTIME');
  close.tick(gameConfig.phases.overtime);
  assert.equal(close.phase, 'RESULT');
  const priorMatch = close.matchId;
  close.tick(gameConfig.phases.result);
  assert.equal(close.phase, 'WAITING');
  assert.equal(close.matchId, priorMatch + 1);
  assert.deepEqual(close.score, { cr7: 0, m10: 0 });

  const runaway = setup().engine;
  runaway.start();
  runaway.forceGoal('cr7');
  runaway.forceGoal('cr7');
  runaway.tick(gameConfig.phases.playing);
  assert.equal(runaway.phase, 'OVERTIME');
  runaway.tick(gameConfig.phases.overtime);
  assert.equal(runaway.phase, 'RESULT');
});

test('AI uses active joined players; 25 spectators do not reduce it', () => {
  let next = 0;
  const { engine } = setup(() => { next = 1 - next; return next; });
  engine.start();
  engine.tick(1);
  assert.notEqual(engine.ball.pos, 0);
  const noSpectators = engine.ball.pos;
  engine.reset();
  engine.start();
  engine.handleViewerCount(25);
  engine.tick(1);
  assert.equal(engine.ball.pos, noSpectators);
  engine.reset();
  for (let i = 0; i < gameConfig.ai.fullPlayers; i++) join(engine, `p-${i}`, i % 2 ? '7' : '10');
  engine.start();
  engine.handleViewerCount(0);
  engine.tick(1);
  assert.equal(engine.ball.pos, 0);
  const baseForce = gameConfig.ai.fullPlayers / 2 * gameConfig.playerBaseForce;
  assert.deepEqual(engine.forces, { cr7: baseForce, m10: baseForce });
});

test('15 active commenting bots can score while AI is off', () => {
  const { engine, events, advanceClock } = setup();
  engine.start();
  engine.handleViewerCount(75);
  for (let i = 0; i < 15; i++) join(engine, `bot-${i}`, i % 5 < 3 ? 'CR7' : 'M10');
  for (let seconds = 0; seconds < gameConfig.phases.playing; seconds += 2) {
    for (let i = 0; i < 15; i++) join(engine, `bot-${i}`, i % 5 < 3 ? 'CR7' : 'M10');
    advanceClock(2000);
    engine.tick(2);
  }
  assert.ok(events.some(event => event.type === 'goal'));
  assert.ok(engine.score.cr7 > 0);
  assert.equal(engine.phase, 'OVERTIME');
  engine.tick(gameConfig.phases.overtime);
  assert.equal(engine.phase, 'RESULT');
});

test('freeze is blocked during the last 20 seconds', () => {
  const { engine } = setup();
  engine.start();
  join(engine, 'a', '7');
  engine.phase = 'OVERTIME';
  engine.timeLeft = 20;
  assert.equal(engine.handleGift({ userId: 'a', deltaCoins: 1000 }), false);
  assert.equal(engine.freezeUsed.cr7, false);
});

test('the last twenty seconds of regulation still have overtime ahead', () => {
  const { engine } = setup();
  engine.start();
  join(engine, 'a', '7');
  engine.timeLeft = 20;
  assert.equal(engine.handleGift({ userId: 'a', deltaCoins: 1000 }), true);
});

test('freeze lasts ten seconds and expires during play', () => {
  const { engine } = setup();
  engine.start();
  join(engine, 'a', '7');
  join(engine, 'b', '10');
  engine.handleViewerCount(30);
  engine.handleGift({ userId: 'a', diamondCount: 1000, deltaCoins: 1000 });
  engine.tick(6);
  assert.ok(engine.getState().teams.m10.frozen);
  assert.ok(Math.abs(engine.freezeLeft.m10 - 4) < 1e-6);
  engine.tick(4.1);
  assert.equal(engine.getState().teams.m10.frozen, false);
});

test('large gift bursts keep bounded force and retain donation totals', () => {
  const { engine } = setup();
  engine.start();
  join(engine, 'a', '7');
  for (let i = 0; i < 1000; i++) engine.handleGift({ userId: 'a', diamondCount: 1, deltaCoins: 1 });
  assert.ok(engine.bursts.length <= gameConfig.forceLimits.maxActiveBursts);
  engine.tick(0.05);
  assert.ok(engine.forces.cr7 <= gameConfig.forceLimits.maxEffectiveForcePerTeam);
  assert.equal(engine.getState().teams.cr7.top3[0].coins, 1000);
});

test('one delayed tick crosses exact 180s and 200s boundaries without an extra second', () => {
  const { engine } = setup();
  engine.start();
  engine.tick(180);
  assert.equal(engine.phase, 'RESULT');
  assert.equal(engine.getState().timeLeft, 15);
  engine.reset();
  const matchId = engine.matchId;
  engine.tick(200);
  assert.equal(engine.phase, 'WAITING');
  assert.equal(engine.matchId, matchId + 1);
  assert.equal(engine.getState().timeLeft, 5);
});

test('a burst flood cannot take the other team slots or bypass freeze', () => {
  const { engine } = setup();
  engine.start();
  join(engine, 'a', '7');
  for (let i = 0; i < 1000; i++) engine.handleGift({ userId: 'a', diamondCount: 1, deltaCoins: 1 });
  join(engine, 'b', '10');
  for (let i = 0; i < 1000; i++) engine.handleGift({ userId: 'b', diamondCount: 1, deltaCoins: 1 });
  engine.handleGift({ userId: 'a', diamondCount: 1000, deltaCoins: 1000 });
  engine.handleViewerCount(30);
  engine.tick(0.05);
  assert.equal(engine.forces.cr7, gameConfig.forceLimits.maxEffectiveForcePerTeam);
  assert.equal(engine.forces.m10, gameConfig.forceLimits.maxEffectiveForcePerTeam * gameConfig.gifts.freezeMultiplier);
  assert.ok(engine.bursts.length <= gameConfig.forceLimits.maxActiveBursts);
});

test('unassigned gifts auto-balance by active people and emit team_join before skill', () => {
  const { engine, events, advanceClock } = setup();
  join(engine, 'old-a', '7');
  join(engine, 'old-b', '7');
  advanceClock(gameConfig.activeWindowSeconds * 1000);
  join(engine, 'active', '10');
  engine.start();
  assert.equal(engine.handleGift({ userId: 'new', nickname: 'New donor', diamondCount: 1, deltaCoins: 3 }), true);
  assert.equal(engine.players.get('new').team, 'cr7');
  assert.equal(engine.getState().teams.cr7.count, 1);
  assert.equal(engine.getState().teams.cr7.joinedCount, 3);
  assert.equal(engine.getState().teams.cr7.top3[0].coins, 3);
  assert.deepEqual(events.slice(-2).map(event => [event.type, event.team]), [['team_join', 'cr7'], ['gift_skill', 'cr7']]);
  assert.equal(events.at(-2).viaGift, true);
  const other = setup().engine;
  join(other, 'left', '7');
  other.handleMemberLeave({ userId: 'left' });
  join(other, 'active', '10');
  other.handleGift({ userId: 'gift', deltaCoins: 1 });
  assert.equal(other.players.get('gift').team, 'cr7');
});

test('hash gift policy is stable across matches and independent of population', () => {
  const config = structuredClone(gameConfig);
  config.unassignedGift.policy = 'hash';
  const { engine } = setup(() => 0.1, config);
  const choices = new Map();
  for (let i = 0; i < 20; i++) {
    engine.handleGift({ userId: `donor-${i}`, deltaCoins: 1 });
    choices.set(`donor-${i}`, engine.players.get(`donor-${i}`).team);
  }
  assert.equal(new Set(choices.values()).size, 2);
  engine.reset();
  for (let i = 0; i < 30; i++) join(engine, `other-${i}`, '7');
  for (const [userId, team] of [...choices].reverse()) {
    engine.handleGift({ userId, deltaCoins: 1 });
    assert.equal(engine.players.get(userId).team, team);
  }
});

test('ignore policy retains unassigned donations and transfers them exactly once after team selection', () => {
  const config = structuredClone(gameConfig);
  config.unassignedGift.policy = 'ignore';
  const { engine, events } = setup(() => 0.5, config);
  engine.start();
  assert.equal(engine.handleGift({ userId: 'donor', nickname: 'Donor', deltaCoins: 20 }), false);
  engine.handleGift({ userId: 'donor', deltaCoins: 5 });
  assert.equal(engine.players.size, 0);
  assert.equal(engine.bursts.length, 0);
  assert.equal(events.length, 0);
  let state = engine.getState();
  assert.deepEqual(state.unassignedDonations, { count: 1, totalCoins: 25, top3: [{ userId: 'donor', nickname: 'Donor', coins: 25 }] });
  state.unassignedDonations.top3[0].coins = 999;
  join(engine, 'donor', '10');
  engine.handleGift({ userId: 'donor', deltaCoins: 2 });
  state = engine.getState();
  assert.equal(state.unassignedDonations.totalCoins, 0);
  assert.equal(state.teams.m10.top3[0].coins, 27);
  engine.reset();
  assert.equal(engine.getState().unassignedDonations.count, 0);
});

test('invalid unassigned gifts neither assign a team nor record donations', () => {
  const { engine, events } = setup();
  for (const deltaCoins of [0, -1, NaN, Infinity, 'bad']) {
    assert.equal(engine.handleGift({ userId: 'invalid', deltaCoins }), false);
  }
  assert.equal(engine.handleGift({ deltaCoins: 1 }), false);
  assert.equal(engine.players.size, 0);
  assert.equal(events.length, 0);
});

test('all four gift rejection reasons retain coins and identify the donor and gift', () => {
  const cases = [
    { reason: 'cooldown_skill', coins: 10 },
    { reason: 'cooldown_golden', coins: 99 },
    { reason: 'freeze_used', coins: 1000 },
    { reason: 'freeze_locked', coins: 1000, locked: true }
  ];
  for (const { reason, coins, locked } of cases) {
    const { engine, events } = setup();
    engine.start();
    join(engine, 'donor', '7', 'Donor');
    if (locked) { engine.phase = 'OVERTIME'; engine.timeLeft = 20; }
    else engine.handleGift({ userId: 'donor', deltaCoins: coins });
    const before = engine.bursts.length;
    assert.equal(engine.handleGift({ userId: 'donor', deltaCoins: coins, giftName: 'Test gift' }), false);
    assert.deepEqual(events.at(-1), {
      type: 'gift_rejected', reason, team: 'cr7', user: { userId: 'donor', nickname: 'Donor' }, giftName: 'Test gift', deltaCoins: coins
    });
    assert.equal(engine.getState().teams.cr7.top3[0].coins, coins * (locked ? 1 : 2));
    assert.equal(engine.bursts.length, before);
  }
});

test('skill cooldown is per player, golden cooldown per team, and their boundaries reopen', () => {
  const { engine, advanceClock } = setup();
  engine.start();
  join(engine, 'a', '7'); join(engine, 'b', '7'); join(engine, 'c', '10');
  assert.equal(engine.handleGift({ userId: 'a', deltaCoins: 10 }), true);
  assert.equal(engine.handleGift({ userId: 'b', deltaCoins: 10 }), true);
  assert.equal(engine.handleGift({ userId: 'a', deltaCoins: 10 }), false);
  advanceClock(gameConfig.gifts.skillCooldownMs);
  assert.equal(engine.handleGift({ userId: 'a', deltaCoins: 10 }), true);
  assert.equal(engine.handleGift({ userId: 'a', deltaCoins: 99 }), true);
  assert.equal(engine.handleGift({ userId: 'b', deltaCoins: 99 }), false);
  assert.equal(engine.handleGift({ userId: 'c', deltaCoins: 99 }), true);
  advanceClock(gameConfig.gifts.goldenCooldownMs);
  assert.equal(engine.handleGift({ userId: 'b', deltaCoins: 99 }), true);
});

test('inactivity removes base force and active counts but retains team and donations', () => {
  const config = structuredClone(gameConfig);
  config.ai.baseForce = 0;
  config.ai.variation = 0;
  const { engine, advanceClock } = setup(() => 0.5, config);
  join(engine, 'a', '7');
  engine.handleGift({ userId: 'a', deltaCoins: 5 });
  engine.start();
  advanceClock(config.activeWindowSeconds * 1000 - 1);
  engine.tick(0.05);
  assert.equal(engine.getState().teams.cr7.count, 1);
  assert.equal(engine.forces.cr7, config.playerBaseForce);
  advanceClock(1);
  engine.tick(0.05);
  assert.equal(engine.getState().teams.cr7.count, 0);
  assert.equal(engine.forces.cr7, 0);
  assert.equal(engine.getState().teams.cr7.joinedCount, 1);
  assert.equal(engine.getState().teams.cr7.top3[0].coins, 5);
  assert.equal(engine.players.get('a').team, 'cr7');
});

test('leave removes presence; chat, like, gift or member_join can restore it without switching teams', () => {
  for (const interact of [
    engine => engine.handleChat({ userId: 'a', message: 'hello' }),
    engine => engine.handleChat({ userId: 'a', message: '10' }),
    engine => engine.handleLike({ userId: 'a', likeCount: 1 }),
    engine => engine.handleGift({ userId: 'a', deltaCoins: 1 }),
    engine => engine.handleMemberJoin({ userId: 'a', nickname: 'Returned' })
  ]) {
    const { engine, advanceClock, events } = setup();
    join(engine, 'a', '7');
    engine.handleGift({ userId: 'a', deltaCoins: 10 });
    engine.handleMemberLeave({ userId: 'a' });
    assert.equal(engine.getState().activeJoined, 0);
    advanceClock(1);
    interact(engine);
    assert.equal(engine.getState().activeJoined, 1);
    assert.equal(engine.players.get('a').team, 'cr7');
    assert.ok(engine.getState().teams.cr7.top3[0].coins >= 10);
    assert.equal(events.filter(event => event.type === 'team_join').length, 1);
  }
  const { engine } = setup();
  assert.equal(engine.handleMemberJoin({ userId: 'spectator' }), false);
  assert.equal(engine.handleMemberLeave({ userId: 'spectator' }), false);
  assert.equal(engine.players.size, 0);
});

test('queued activity uses arrival time and an old event cannot undo a newer leave or interaction', () => {
  const { engine, advanceClock } = setup();
  join(engine, 'a', '7');
  advanceClock(gameConfig.activeWindowSeconds * 1000 + 1);
  engine.handleChat({ userId: 'a', message: 'hello' }, 100_000);
  assert.equal(engine.getState().activeJoined, 0);
  engine.handleMemberJoin({ userId: 'a' });
  assert.equal(engine.getState().activeJoined, 1);
  assert.equal(engine.handleMemberLeave({ userId: 'a' }, 100_000), false);
  engine.handleMemberLeave({ userId: 'a' });
  engine.handleLike({ userId: 'a', likeCount: 1 }, 100_000);
  assert.equal(engine.getState().activeJoined, 0);
});

test('AI resumes when joined players expire or leave', () => {
  let next = 0;
  const { engine, advanceClock } = setup(() => { next = 1 - next; return next; });
  for (let i = 0; i < gameConfig.ai.fullPlayers; i++) join(engine, `p-${i}`, i % 2 ? '7' : '10');
  engine.start();
  engine.tick(0.05);
  assert.equal(engine.ball.pos, 0);
  advanceClock(gameConfig.activeWindowSeconds * 1000);
  engine.tick(0.05);
  assert.equal(engine.getState().activeJoined, 0);
  assert.notEqual(engine.ball.pos, 0);
  assert.ok(engine.forces.cr7 + engine.forces.m10 > 0);
});

test('normalized speed stays bounded under a force flood and scales by ratio', () => {
  const velocities = [];
  for (const size of [20, 200, 500]) {
    const { engine } = setup();
    for (let i = 0; i < size; i++) join(engine, `p-${i}`, i < size * 0.6 ? '7' : '10');
    engine.start();
    engine.tick(0.05);
    const { cr7, m10 } = engine.forces;
    const expected = gameConfig.movement.maxSpeed * (cr7 - m10) / (cr7 + m10 + gameConfig.movement.damping);
    const velocity = engine.ball.pos / 0.05;
    assert.ok(Math.abs(velocity - expected) < 1e-9);
    velocities.push(velocity);
    for (let i = 0; i < 1000; i++) engine.handleGift({ userId: 'p-0', diamondCount: 1, deltaCoins: 5 });
    const before = engine.ball.pos;
    engine.tick(0.05);
    assert.ok(Math.abs(engine.ball.pos - before) <= gameConfig.movement.maxSpeed * 0.05);
  }
  assert.ok(velocities[2] / velocities[0] < 1.5, '25x population must not cause 25x speed');
});

test('commenting on cooldown contributes over twice own base and moves the ball more than idle', () => {
  const impact = compareCommentImpact();
  assert.ok(impact.forceRatio >= 3); // Total >=3x means comment alone >=2x base.
  assert.ok(impact.commenting.ballPos > impact.idle.ballPos + 100);
});

test('crowded comment streams share deadlines without prolonging old force at the burst cap', () => {
  const { engine, advanceClock } = setup();
  for (let i = 0; i < 600; i++) join(engine, `p-${i}`, i % 2 ? '7' : '10');
  engine.start();
  for (let step = 0; step < 200; step++) {
    for (let i = step % 40; i < 300; i += 40) {
      join(engine, `p-${i * 2}`, '10');
      join(engine, `p-${i * 2 + 1}`, '7');
    }
    advanceClock(50);
    engine.tick(0.05);
    assert.ok(engine.bursts.length <= gameConfig.forceLimits.maxActiveBursts);
    assert.ok(engine.forces.cr7 <= 300 * (gameConfig.playerBaseForce + gameConfig.comment.force));
    assert.equal(engine.forces.cr7, engine.forces.m10);
  }
  advanceClock(2100);
  engine.tick(2.1);
  assert.equal(engine.bursts.length, 0);
  assert.deepEqual(engine.forces, { cr7: 300, m10: 300 });
});
