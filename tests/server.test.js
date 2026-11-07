import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fork } from 'node:child_process';
import { io } from 'socket.io-client';
import { createTestWorkspace } from './testWorkspace.js';
import { loadAdminToken } from '../src/adminAuth.js';

function waitFor(socket, event, check = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`Timeout waiting for ${event}`)); }, 5000);
    function handler(data) {
      if (!check(data)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    }
    socket.on(event, handler);
  });
}

test('real server enforces admin auth and runs the queued game bridge', { timeout: 30000 }, async t => {
  const workspace = createTestWorkspace('server', { publicFiles: true });
  const token = 'integration-test-admin-token-only';
  const sockets = [];
  const child = fork(path.join(workspace.directory, 'src/server.js'), [], {
    cwd: workspace.directory, silent: true,
    env: { ...process.env, PORT: '0', ADMIN_TOKEN: token, ALLOWED_ORIGINS: '', SIGN_API_KEY: '' }
  });
  let output = '';
  child.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
  child.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
  try {
    const { port, host } = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timeout: ${output}`)), 8000);
      child.once('message', message => { clearTimeout(timer); resolve(message); });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
    });
    assert.equal(host, '127.0.0.1');
    const base = `http://127.0.0.1:${port}`;
    function client(auth = {}, headers = {}) {
      const socket = io(base, { autoConnect: false, reconnection: false, transports: ['websocket'], auth, extraHeaders: headers });
      sockets.push(socket);
      return socket;
    }
    async function connect(socket) {
      const initial = waitFor(socket, 'init_state');
      socket.connect();
      return initial;
    }

    await t.test('HTTP admin pages and reset require credentials; game remains public', async () => {
      assert.equal((await fetch(base + '/game/')).status, 200);
      const page = await fetch(base + '/admin/', { redirect: 'manual' });
      assert.equal(page.status, 303);
      assert.equal(page.headers.get('location'), '/login/');
      assert.equal((await fetch(base + '/admin/admin.js', { redirect: 'manual' })).status, 303);
      assert.notEqual((await fetch(base + '/%61dmin/index.html', { redirect: 'manual' })).status, 200);
      assert.equal((await fetch(base + '/api/reset', { method: 'POST' })).status, 401);
      assert.equal((await fetch(base + '/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: JSON.stringify({ token })
      })).status, 403);
    });

    let cookie;
    await t.test('login issues an HttpOnly session and rejects an invalid token', async () => {
      const wrong = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"token":"wrong"}' });
      assert.equal(wrong.status, 401);
      const response = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) });
      assert.equal(response.status, 200);
      const setCookie = response.headers.get('set-cookie');
      assert.match(setCookie, /HttpOnly/i);
      assert.match(setCookie, /SameSite=Strict/i);
      cookie = setCookie.split(';')[0];
      assert.equal((await fetch(base + '/admin/', { headers: { Cookie: cookie } })).status, 200);
    });

    const viewer = client();
    await connect(viewer);
    await t.test('anonymous sockets can view but cannot issue any admin command', async () => {
      for (const [event, payload] of [
        ['admin:custom_command', { action: 'RESET_MATCH' }],
        ['admin:simulate_chat', { userId: 'intruder', message: '7' }],
        ['admin:reset_session', {}]
      ]) {
        const error = waitFor(viewer, 'admin:error');
        viewer.emit(event, payload);
        assert.equal((await error).code, 'ADMIN_AUTH_REQUIRED');
      }
      const denied = client({ role: 'admin', token: 'wrong' });
      const error = waitFor(denied, 'connect_error');
      denied.connect();
      assert.equal((await error).message, 'ADMIN_AUTH_REQUIRED');
      const foreign = client({ role: 'admin', token }, { Origin: 'https://untrusted.example' });
      const foreignError = waitFor(foreign, 'connect_error');
      foreign.connect();
      await foreignError;
    });

    const admin = client({ role: 'admin' }, { Cookie: cookie });
    await connect(admin);
    await t.test('authenticated controls, 100 gifts, combo dedup and reconnect preserve game state', async () => {
      let pending = waitFor(admin, 'game:state', state => state.phase === 'WAITING');
      admin.emit('admin:custom_command', { action: 'RESET_MATCH' });
      await pending;
      pending = waitFor(admin, 'game:state', state => state.phase === 'PLAYING');
      admin.emit('admin:custom_command', { action: 'START' });
      await pending;
      pending = waitFor(admin, 'game:event', event => event.type === 'team_join' && event.user.userId === 'qa');
      admin.emit('admin:simulate_chat', { userId: 'qa', nickname: 'Test', message: '7' });
      await pending;
      pending = waitFor(admin, 'game:state', state => state.teams.cr7.top3[0]?.coins === 100);
      for (let i = 0; i < 100; i++) admin.emit('admin:simulate_gift', {
        userId: 'qa', nickname: 'Test', giftId: 'rose', giftName: 'Rose', diamondCount: 1,
        repeatCount: 1, repeatEnd: true, groupId: 'gift-' + i
      });
      await pending;
      const combo = { userId: 'qa', giftId: 'rose', diamondCount: 1, groupId: 'combo', repeatEnd: true };
      pending = waitFor(admin, 'game:state', state => state.teams.cr7.top3[0]?.coins === 110);
      admin.emit('admin:simulate_gift', { ...combo, repeatCount: 3 });
      admin.emit('admin:simulate_gift', { ...combo, repeatCount: 10 });
      admin.emit('admin:simulate_gift', { ...combo, repeatCount: 10 });
      const current = await pending;
      const refreshed = await connect(client());
      assert.equal(refreshed.game.matchId, current.matchId);
      assert.equal(refreshed.game.teams.cr7.top3[0].coins, 110);
      const status = await (await fetch(base + '/api/status')).json();
      assert.equal(status.game.queue.dropped, 0);
      assert.ok(status.game.queue.processed >= 103);
      pending = waitFor(admin, 'game:event', event => event.type === 'goal' && event.team === 'm10');
      admin.emit('admin:custom_command', { action: 'FORCE_GOAL', team: 'm10' });
      await pending;
    });

    await t.test('member leave removes game presence; a normal chat restores the same team and donation', async () => {
      let pending = waitFor(admin, 'game:state', state => state.teams.cr7.count === 0 && state.teams.cr7.joinedCount === 1);
      admin.emit('admin:simulate_leave', { userId: 'qa' });
      const left = await pending;
      assert.equal(left.teams.cr7.top3[0].coins, 110);
      pending = waitFor(admin, 'game:state', state => state.teams.cr7.count === 1);
      admin.emit('admin:simulate_chat', { userId: 'qa', nickname: 'Returned', message: 'hello again' });
      const returned = await pending;
      assert.equal(returned.teams.cr7.top3[0].coins, 110);
      assert.equal(returned.teams.cr7.top3[0].nickname, 'Returned');
    });

    await t.test('unassigned gift joins the smaller team and rejected gifts reach public sockets with coins retained', async () => {
      let pending = waitFor(viewer, 'game:event', event => event.type === 'team_join' && event.user?.userId === 'new-donor');
      const gift = { userId: 'new-donor', nickname: 'New donor', giftId: 'skill', giftName: 'Skill', diamondCount: 10, repeatCount: 1, repeatEnd: true };
      admin.emit('admin:simulate_gift', { ...gift, groupId: 'new-donor-1' });
      const joined = await pending;
      assert.equal(joined.viaGift, true);
      assert.equal(joined.team, 'm10');
      pending = waitFor(viewer, 'game:event', event => event.type === 'gift_rejected' && event.user?.userId === 'new-donor');
      const statePromise = waitFor(viewer, 'game:state', state => state.teams.m10.top3[0]?.coins === 20);
      admin.emit('admin:simulate_gift', { ...gift, groupId: 'new-donor-2' });
      const rejected = await pending;
      assert.equal(rejected.reason, 'cooldown_skill');
      assert.equal(rejected.team, 'm10');
      assert.equal(rejected.giftName, 'Skill');
      assert.equal(rejected.deltaCoins, 10);
      const state = await statePromise;
      assert.equal(state.teams.m10.count, 1);
      assert.equal(state.teams.m10.top3[0].coins, 20);
    });

    await t.test('logout revokes the session and direct bearer authorization also works', async () => {
      const disconnected = waitFor(admin, 'disconnect');
      assert.equal((await fetch(base + '/auth/logout', { method: 'POST', headers: { Cookie: cookie } })).status, 200);
      await disconnected;
      assert.equal((await fetch(base + '/api/reset', { method: 'POST', headers: { Cookie: cookie } })).status, 401);
      assert.equal((await fetch(base + '/api/reset', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })).status, 200);
    });

    await t.test('a generated local admin token is reused without changing .env', () => {
      const file = path.join(workspace.directory, 'data/test-token.txt');
      const generated = loadAdminToken(file);
      assert.equal(generated.length, 64);
      assert.equal(loadAdminToken(file), generated);
    });
  } finally {
    for (const socket of sockets) socket.disconnect();
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
    workspace.cleanup();
  }
});
