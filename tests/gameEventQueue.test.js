import test from 'node:test';
import assert from 'node:assert/strict';
import { GameEventQueue } from '../src/gameEventQueue.js';
import { GameEngine } from '../src/gameEngine.js';
import { gameConfig } from '../src/gameConfig.js';

test('100 simultaneous gifts drain in bounded FIFO batches without losing coins', () => {
  const engine = new GameEngine({ rng: () => 0.5 });
  engine.start();
  const queue = new GameEventQueue({ ...gameConfig.queue, maxPerTick: 20 });
  queue.enqueue('chat_received', { userId: 'a', message: '7' }, engine.matchId);
  for (let i = 0; i < 100; i++) queue.enqueue('gift_received', { userId: 'a', diamondCount: 1, deltaCoins: 1 }, engine.matchId);
  let batches = 0;
  while (queue.size) {
    const count = queue.drain(engine.matchId, event => {
      if (event.type === 'chat_received') engine.handleChat(event.data, event.receivedAt);
      else engine.handleGift(event.data, event.receivedAt);
    });
    assert.ok(count <= 20);
    batches += 1;
  }
  assert.equal(batches, 6);
  assert.equal(engine.getState().teams.cr7.top3[0].coins, 100);
  assert.equal(queue.getStats().dropped, 0);
});

test('cooldown uses arrival time even if processing is delayed', () => {
  let clock = 1000;
  const engine = new GameEngine({ now: () => clock });
  engine.start();
  const queue = new GameEventQueue({ ...gameConfig.queue, now: () => clock });
  queue.enqueue('chat_received', { userId: 'a', message: '7' }, engine.matchId);
  clock += 100;
  queue.enqueue('chat_received', { userId: 'a', message: '7' }, engine.matchId);
  clock += 10_000;
  queue.drain(engine.matchId, event => engine.handleChat(event.data, event.receivedAt));
  assert.equal(engine.smallBalls.length, 1);
});

test('queue reserves gift capacity and exposes overload counters', () => {
  const queue = new GameEventQueue({ maxPending: 4, maxPerTick: 2, reservedGiftSlots: 1 });
  for (let i = 0; i < 3; i++) assert.equal(queue.enqueue('chat_received', { userId: i }, 1), true);
  assert.equal(queue.enqueue('chat_received', { userId: 4 }, 1), false);
  assert.equal(queue.enqueue('gift_received', { deltaCoins: 1 }, 1), true);
  assert.equal(queue.enqueue('gift_received', { deltaCoins: 1 }, 1), false);
  assert.equal(queue.size, 4);
  assert.equal(queue.getStats().droppedGifts, 1);
  assert.equal(queue.getStats().dropped, 2);
});

test('likes coalesce in place and old match events never reach a new match', () => {
  const queue = new GameEventQueue(gameConfig.queue);
  queue.enqueue('chat_received', { userId: 'a', message: '7' }, 1);
  queue.enqueue('like_received', { userId: 'a', likeCount: 3 }, 1);
  queue.enqueue('like_received', { userId: 'a', likeCount: 7 }, 1);
  const output = [];
  queue.drain(1, event => output.push(event));
  assert.deepEqual(output.map(event => event.type), ['chat_received', 'like_received']);
  assert.equal(output[1].data.likeCount, 10);
  queue.enqueue('gift_received', { deltaCoins: 1000 }, 1);
  queue.drain(2, () => assert.fail('Old gift applied to a new match'));
  assert.equal(queue.size, 0);
});

test('queued member events preserve leave/join order and original activity times', () => {
  let clock = 1000;
  const engine = new GameEngine({ now: () => clock });
  const queue = new GameEventQueue({ ...gameConfig.queue, maxPerTick: 1, now: () => clock });
  engine.handleChat({ userId: 'a', message: '7' });
  queue.enqueue('member_leave', { userId: 'a' }, engine.matchId);
  clock += 500;
  queue.enqueue('member_join', { userId: 'a' }, engine.matchId);
  clock += 500;
  const handle = event => event.type === 'member_leave'
    ? engine.handleMemberLeave(event.data, event.receivedAt)
    : engine.handleMemberJoin(event.data, event.receivedAt);
  queue.drain(engine.matchId, handle);
  assert.equal(engine.getState().activeJoined, 0);
  queue.drain(engine.matchId, handle);
  assert.equal(engine.getState().activeJoined, 1);
  assert.equal(engine.players.get('a').lastActiveAt, 1500);
  clock = 1500 + gameConfig.activeWindowSeconds * 1000;
  assert.equal(engine.getState().activeJoined, 0);
});
