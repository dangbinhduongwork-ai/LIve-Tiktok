import { Stadium } from './stadium.js';
import { viewConfig } from './view.config.js';

const params = new URLSearchParams(location.search);
const quality = params.get('quality') === 'low' ? 'low' : 'normal';
const debug = params.has('debug'), preview = params.get('preview') === '1';
const $ = id => document.getElementById(id);
const stage = $('broadcast');
for (const [side, value] of Object.entries(viewConfig.safeArea)) stage.style.setProperty(`--safe-${side}`, `${value}px`);
for (const [area, values] of Object.entries(viewConfig.layout)) for (const [key, value] of Object.entries(values)) stage.style.setProperty(`--${area}-${key}`, `${value}px`);
stage.style.setProperty('--gold', viewConfig.palette.gold); stage.style.setProperty('--neon', viewConfig.palette.lines);
const profiles = new Map(), failedAvatars = new Set(), warnings = [];
let state = null, stadium = null, connected = false, lastMatch = null, phaseKey = '', bannerLeft = 0, goalLeft = 0, rendererFailed = false;
let elapsed = 0, previousFrame = performance.now(), fpsFrames = 0, fpsTime = 0, fps = 0;
const frameTimes = new Float32Array(600); let frameIndex = 0, frameCount = 0;
const donorRows = {}, lastDonors = { cr7: [], m10: [] };
const formatter = new Intl.NumberFormat('vi-VN');
const effectPool = [];
let effectCursor = 0;

function warn(message) { warnings.push(message); if (warnings.length > 6) warnings.shift(); }
function text(id, value) { const element = $(id); if (element.textContent !== String(value)) element.textContent = String(value); }
function teamName(team) { return state?.teams[team]?.name || team || ''; }
function resize() {
  stage.style.transform = `scale(${Math.min(innerWidth / viewConfig.width, innerHeight / viewConfig.height)})`;
  stadium?.resize();
}
addEventListener('resize', resize); resize();

function avatarUrl(userId, supplied) {
  const raw = supplied || profiles.get(String(userId))?.avatarUrl;
  if (!raw || failedAvatars.has(raw)) return viewConfig.avatarFallback;
  try { const url = new URL(raw, location.origin); return ['http:', 'https:', 'data:'].includes(url.protocol) ? url.href : viewConfig.avatarFallback; }
  catch { return viewConfig.avatarFallback; }
}
function setAvatar(img, userId, url) {
  const next = avatarUrl(userId, url);
  if (img.dataset.url === next) return;
  img.dataset.url = next; img.src = next;
}
function makeAvatar() {
  const img = document.createElement('img'); img.alt = ''; img.decoding = 'async';
  img.onerror = () => { if (img.dataset.url !== viewConfig.avatarFallback) { failedAvatars.add(img.dataset.url); img.dataset.url = viewConfig.avatarFallback; img.src = viewConfig.avatarFallback; } };
  return img;
}
function rememberProfile(data) {
  if (!data?.userId) return;
  const key = String(data.userId), previous = profiles.get(key);
  profiles.set(key, { nickname: data.nickname || previous?.nickname, avatarUrl: data.avatarUrl || previous?.avatarUrl });
  if (profiles.size > 3000) profiles.delete(profiles.keys().next().value);
}

for (const team of ['cr7', 'm10']) {
  donorRows[team] = Array.from({ length: 3 }, (_, i) => {
    const row = document.createElement('li'); row.className = 'donor-row empty';
    const rank = document.createElement('span'); rank.className = 'donor-rank'; rank.textContent = i + 1;
    const avatar = makeAvatar(), name = document.createElement('span'), coins = document.createElement('span');
    name.className = 'donor-name'; coins.className = 'donor-coins';
    const amount = document.createElement('span'), unit = document.createElement('small'); unit.textContent = 'XU'; coins.append(amount, unit);
    row.append(rank, avatar, name, coins); $(`donors-${team}`).append(row);
    return { row, avatar, name, coins, amount };
  });
}
for (let i = 0; i < 12; i++) {
  const element = document.createElement('div'); element.className = 'floating-effect';
  const avatar = makeAvatar(), label = document.createElement('span'); element.append(avatar, label); $('dom-effects').append(element);
  effectPool.push({ element, avatar, label, left: 0 });
}

function updateDonors(team, donors) {
  const previous = lastDonors[team];
  donorRows[team].forEach((entry, i) => {
    const donor = donors[i]; entry.row.classList.toggle('empty', !donor);
    entry.name.textContent = donor?.nickname || (i === 0 ? 'Chờ bạn tiếp lửa' : 'Vị trí đang chờ');
    entry.name.title = donor?.nickname || '';
    entry.amount.textContent = donor ? formatter.format(donor.coins) : '—';
    entry.coins.lastChild.hidden = !donor;
    setAvatar(entry.avatar, donor?.userId, donor?.avatarUrl);
    const before = previous[i];
    if (donor && (!before || donor.userId !== before.userId || donor.coins !== before.coins)) {
      const from = previous.findIndex(item => item.userId === donor.userId);
      entry.row.style.setProperty('--rank-shift', `${from < 0 ? 7 : (from - i) * 48}px`);
      entry.row.classList.remove('rank-change'); void entry.row.offsetWidth; entry.row.classList.add('rank-change');
    }
  });
  lastDonors[team] = donors.map(({ userId, coins }) => ({ userId, coins }));
}

function banner(element, kind, kicker, title, subtitle) {
  element.className = `${element.id} ${kind}`;
  element.querySelector('.banner-kicker').textContent = kicker;
  element.querySelector('strong').textContent = title;
  element.querySelector('p').textContent = subtitle;
  element.hidden = false;
}
function updatePhase() {
  const key = `${state.matchId}:${state.phase}:${state.result?.winner || 'draw'}`;
  const element = $('phase-banner');
  const result = state.phase === 'RESULT';
  $('result-score').hidden = $('result-donor').hidden = !result;
  if (result) {
    text('result-score', `${state.score.cr7} : ${state.score.m10}`);
    const top = state.teams[state.result?.winner]?.top3?.[0];
    text('result-donor', top ? `✦ ${top.nickname} · ${formatter.format(top.coins)} XU` : state.result?.winner ? 'Cảm ơn những người đã tiếp lửa!' : 'Hai khán đài · Cùng một đam mê');
  }
  if (key === phaseKey) {
    if (state.phase === 'WAITING') element.querySelector('p').textContent = `Bắt đầu sau ${state.timeLeft} giây · Chọn đội ngay`;
    if (state.phase === 'RESULT') element.querySelector('p').textContent = `Trận tiếp theo sau ${state.timeLeft} giây`;
    return;
  }
  phaseKey = key; element.hidden = true;
  if (state.phase === 'WAITING') banner(element, 'waiting', 'HAI HUYỀN THOẠI · MỘT SÂN ĐẤU', 'SẴN SÀNG RA SÂN', `Bắt đầu sau ${state.timeLeft} giây · Chọn đội ngay`);
  if (state.phase === 'OVERTIME') banner(element, 'overtime', '', 'BÙ GIỜ ×2', '');
  if (state.phase === 'RESULT') banner(element, 'result', 'TIẾNG CÒI MÃN CUỘC', state.result?.winner ? `${teamName(state.result.winner)} CHIẾN THẮNG` : 'BẤT PHÂN THẮNG BẠI', `Trận tiếp theo sau ${state.timeLeft} giây`);
  if (state.phase === 'RESULT') text('latest-event', state.result?.winner ? `${teamName(state.result.winner)} giành chiến thắng!` : 'Hai đội bất phân thắng bại');
}

function ensureStadium() {
  if (stadium || !state || rendererFailed) return;
  try { stadium = new Stadium($('gameCanvas'), state.teams, { quality, warn }); stadium.setState(state, true); }
  catch (error) { rendererFailed = true; $('render-error').hidden = false; warn(error.message); console.warn('[Game renderer]', error.message); }
}

function updateState(next, snap = false) {
  if (!next?.teams?.cr7 || !next?.teams?.m10) return;
  if (lastMatch !== next.matchId) {
    bannerLeft = goalLeft = 0; $('effect-banner').hidden = $('goal-banner').hidden = true;
    lastDonors.cr7 = []; lastDonors.m10 = []; phaseKey = '';
    for (const slot of effectPool) { slot.left = 0; slot.element.classList.remove('active'); }
    text('latest-event', 'Trận mới đã sẵn sàng · Chọn đội và tiếp lửa!');
  }
  lastMatch = next.matchId; state = next;
  for (const team of ['cr7', 'm10']) {
    const info = state.teams[team];
    stage.style.setProperty(`--${team}`, info.color);
    stage.style.setProperty(`--${team}-light`, info.lightColor || '#eff8ff');
    for (const id of ['name', 'goal', 'power-name', 'donor-title']) text(`${id}-${team}`, info.name);
    text(`shirt-${team}`, info.shirtNumber); text(`score-${team}`, state.score[team]);
    text(`count-${team}`, formatter.format(info.count)); text(`star-name-${team}`, info.name);
    text(`boost-${team}`, `+${Math.round((info.likeBoost || 0) * 100)}%`);
    const leading = state.forces[team] > state.forces[team === 'cr7' ? 'm10' : 'cr7'];
    text(`star-status-${team}`, info.frozen ? 'ĐÓNG BĂNG' : state.phase === 'RESULT' ? (state.result?.winner === team ? 'NHÀ VÔ ĐỊCH' : state.result?.winner ? 'HẸN TRẬN SAU' : 'BẤT PHÂN THẮNG BẠI') : goalLeft > 0 && stadium?.goalTeams[team] ? (team === 'cr7' ? 'SIUUU!' : 'VÀOOO!') : state.phase === 'WAITING' ? 'SẴN SÀNG' : leading ? 'TIẾP LỬA NÀO!' : 'KHÔNG BỎ CUỘC');
    text(`power-${team}`, Math.round(state.forces[team] || 0));
    updateDonors(team, info.top3 || []);
    const freeze = $(`freeze-${team}`); freeze.hidden = !info.frozen;
    if (info.frozen) { freeze.querySelector('b').textContent = `${Math.ceil(info.freezeLeft)}s`; freeze.style.setProperty('--freeze', `${Math.min(100, info.freezeLeft * 10)}%`); }
  }
  text('clock', `${String(Math.floor(state.timeLeft / 60)).padStart(2, '0')}:${String(state.timeLeft % 60).padStart(2, '0')}`);
  text('phase', { WAITING: 'CHUẨN BỊ', PLAYING: 'HIỆP CHÍNH', OVERTIME: 'BÙ GIỜ · BÀN THẮNG ×2', RESULT: 'KẾT QUẢ' }[state.phase] || state.phase);
  text('match-number', `TRẬN ${String(state.matchId).padStart(2, '0')}`);
  text('audience', `${formatter.format(state.viewerCount)} ĐANG XEM`);
  text('activity', `${state.teams.cr7.count} ${teamName('cr7')}  /  ${state.teams.m10.count} ${teamName('m10')}`);
  const total = state.forces.cr7 + state.forces.m10;
  const red = total > 0 ? state.forces.cr7 / total * 100 : 50;
  $('power-red').style.width = `${red}%`; $('power-blue').style.width = `${100 - red}%`;
  $('power-ball').style.left = `${(Math.max(-1, Math.min(1, state.ballPos / state.fieldLimit)) + 1) * 50}%`;
  const guideKey = ['cr7', 'm10'].map(team => `${state.teams[team].name}:${state.teams[team].keywords?.[0] || ''}`).join('|');
  if ($('join-guide').dataset.key !== guideKey) {
    $('join-guide').replaceChildren(); $('join-guide').dataset.key = guideKey;
    for (const [i, team] of ['cr7', 'm10'].entries()) {
      if (i) { const divider = document.createElement('em'); divider.textContent = '·'; $('join-guide').append(divider); }
      const part = document.createElement('span'); part.className = team;
      const key = document.createElement('kbd'); key.textContent = state.teams[team].keywords?.[0] || '—';
      part.append('GÕ ', key, ` = ${teamName(team)}`); $('join-guide').append(part);
    }
  }
  $('empty-room').hidden = state.teams.cr7.count + state.teams.m10.count > 0 || !['PLAYING', 'OVERTIME'].includes(state.phase);
  updatePhase(); ensureStadium(); stadium?.setState(state, snap);
}

function floatLabel(label, event, kind = '') {
  const slot = effectPool[effectCursor++ % effectPool.length];
  slot.element.className = `floating-effect ${kind}`; slot.label.textContent = label; slot.left = 1.5;
  slot.avatar.hidden = kind !== 'join';
  if (kind === 'join') setAvatar(slot.avatar, event.user?.userId, event.user?.avatarUrl);
  slot.element.style.setProperty('--event-color', state?.teams[event.team]?.color || '#e3cd92');
  slot.element.style.setProperty('--fly-x', event.team === 'cr7' ? '-300px' : '330px');
  slot.element.style.setProperty('--fly-y', '210px');
  slot.element.style.left = kind === 'rejected' ? '250px' : `${370 + (effectCursor % 3) * 20}px`;
  slot.element.style.top = `${viewConfig.layout.arena.top + (kind === 'rejected' ? 390 : 240 + (effectCursor % 3) * 30)}px`;
  void slot.element.offsetWidth; slot.element.classList.add('active');
}

function handleEvent(event) {
  if (!state) return;
  const name = event.user?.nickname || teamName(event.team);
  const rejection = { freeze_used: 'Chiêu đóng băng đã dùng', freeze_locked: 'Đóng băng đã khóa cuối trận', cooldown_skill: 'Tuyệt kỹ đang hồi', cooldown_golden: 'Bóng vàng đang hồi' };
  const lines = {
    team_join: `${name} gia nhập ${teamName(event.team)}${event.viaGift ? ' qua quà tặng' : ''}`,
    gift_skill: `${name} tặng ${event.giftName || 'quà'} · +${formatter.format(event.deltaCoins || 0)} xu`,
    freeze: `${name} đóng băng nửa sân đối thủ!`, goal: `${teamName(event.team)} GHI BÀN!`,
    overtime: 'Bù giờ ×2 · Mỗi bàn thắng được nhân đôi', result: event.team ? `${teamName(event.team)} giành chiến thắng!` : 'Hai đội bất phân thắng bại',
    gift_rejected: `${name} · ${rejection[event.reason] || 'Chiêu chưa sẵn sàng'} · Quà vẫn được ghi nhận`
  };
  text('latest-event', lines[event.type] || 'Cùng tiếp lửa cho đội của bạn');
  stadium?.event(event);
  const element = $('effect-banner'); element.style.setProperty('--event-color', state.teams[event.team]?.color || '#ddc78b');
  if (event.type === 'team_join') floatLabel(name, event, 'join');
  if (event.type === 'gift_rejected') floatLabel(rejection[event.reason] || 'Chiêu đang hồi', event, 'rejected');
  if (event.type === 'gift_skill') {
    if (event.skill === 'basic') floatLabel(`+${event.force || 0} LỰC`, event);
    else { banner(element, event.skill === 'golden' ? 'golden' : 'special', name, event.skill === 'golden' ? 'BÓNG VÀNG' : 'TUYỆT KỸ!', event.giftName || 'Tiếp lửa cho đội của bạn'); bannerLeft = viewConfig.effects.bannerSeconds; }
  }
  if (event.type === 'goal') {
    $('goal-banner').style.setProperty('--event-color', state.teams[event.team]?.color || viewConfig.palette.gold);
    banner($('goal-banner'), 'goal', `${teamName(event.team)} · GHI BÀN`, 'GOAL!', 'Khán đài bùng nổ!'); goalLeft = viewConfig.effects.goalSeconds;
    if (event.team === 'cr7' || event.team === 'm10') text(`star-status-${event.team}`, event.team === 'cr7' ? 'SIUUU!' : 'VÀOOO!');
    banner(element, 'goal', teamName(event.team), 'GOAL!', 'Cùng ăn mừng bàn thắng!'); bannerLeft = viewConfig.effects.goalSeconds;
  }
  if (event.type === 'freeze') { banner(element, 'freeze', name, 'ĐÓNG BĂNG', '10 giây thay đổi cục diện'); bannerLeft = 1.8; }
  if (event.type === 'overtime') { banner(element, 'overtime', 'THỜI KHẮC QUYẾT ĐỊNH', 'BÙ GIỜ ×2', 'Mỗi bàn thắng · Nhân đôi điểm'); bannerLeft = 2.5; }
}

function setConnected(value) { connected = value; text('connection', preview ? 'BẢN XEM THỬ' : value ? '● TRỰC TIẾP' : 'ĐANG NỐI LẠI…'); $('connection').classList.toggle('offline', !value && !preview); }
const socket = preview ? null : io({ reconnection: true });
socket?.on('connect', () => setConnected(true));
socket?.on('disconnect', () => setConnected(false));
socket?.on('connect_error', () => setConnected(false));
socket?.on('init_state', data => { for (const profile of data.allPlayers || []) rememberProfile(profile); if (data.game) updateState(data.game, true); });
socket?.on('game:state', next => updateState(next));
socket?.on('game:event', handleEvent);
for (const event of ['live:gift', 'live:chat', 'live:like', 'live:member_join']) socket?.on(event, rememberProfile);
socket?.on('live:chat', () => stadium?.interaction('chat'));
socket?.on('live:like', data => stadium?.interaction('like', data.likeCount || 1));
socket?.on('live:session_reset', () => profiles.clear());
setConnected(false);

$('gameCanvas').addEventListener('webglcontextlost', event => { event.preventDefault(); $('render-error').hidden = false; warn('WebGL tạm ngắt; đang chờ trình duyệt khôi phục.'); });
$('gameCanvas').addEventListener('webglcontextrestored', () => { stadium?.dispose(); stadium = null; rendererFailed = false; $('render-error').hidden = true; ensureStadium(); });

function metrics() {
  const samples = [...frameTimes.subarray(0, frameCount)].sort((a, b) => a - b);
  const average = samples.reduce((sum, n) => sum + n, 0) / (samples.length || 1);
  const gl = stadium?.renderer.getContext(); const extension = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    fps, averageFps: average ? 1000 / average : 0, p95FrameMs: samples[Math.floor(samples.length * 0.95)] || 0,
    samples: samples.length, quality, pixelRatio: stadium?.renderer.getPixelRatio(), drawCalls: stadium?.renderer.info.render.calls,
    triangles: stadium?.renderer.info.render.triangles, gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable',
    connected, renderer: !!stadium, characters: stadium ? Object.fromEntries(Object.entries(stadium.characters).map(([team, char]) => [team, { kind: char.kind, ...char.diagnostics }])) : {},
    minis: stadium ? Object.fromEntries(Object.entries(stadium.minis).map(([team, minis]) => [team, minis.map(mini => ({ kind: mini.kind, ...mini.diagnostics }))])) : {}, ledBars: stadium?.ledData.length, warnings: [...warnings]
  };
}
if (debug || preview) {
  $('debug-panel').hidden = !debug;
  window.__gameView = { updateState, handleEvent, rememberProfile, metrics, resetMetrics() { frameIndex = frameCount = fpsFrames = fpsTime = 0; previousFrame = performance.now(); }, get state() { return state; }, get stadium() { return stadium; }, get socket() { return socket; } };
}
function frame(now) {
  const rawDt = Math.max(0.001, (now - previousFrame) / 1000); previousFrame = now;
  const dt = Math.min(rawDt, 0.1); elapsed += dt;
  if (!document.hidden) { frameTimes[frameIndex++ % frameTimes.length] = rawDt * 1000; frameCount = Math.min(frameTimes.length, frameCount + 1); }
  fpsFrames++; fpsTime += rawDt;
  if (fpsTime >= 1) {
    fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0;
    if (debug) $('debug-panel').textContent = `${quality.toUpperCase()} · ${fps} FPS · DPR 1 · ${stadium?.renderer.info.render.calls || 0} draw calls\n${Object.entries(stadium?.characters || {}).map(([id, char]) => `${id}: ${char.kind}`).join(' / ')}\n${warnings.join('\n')}`;
  }
  if (bannerLeft > 0) { bannerLeft -= dt; if (bannerLeft <= 0) $('effect-banner').hidden = true; }
  if (goalLeft > 0) { goalLeft -= dt; if (goalLeft <= 0) $('goal-banner').hidden = true; }
  for (const slot of effectPool) if (slot.left > 0) { slot.left -= dt; if (slot.left <= 0) slot.element.classList.remove('active'); }
  stadium?.update(dt);
  if (stadium) for (const team of ['cr7', 'm10']) {
    const point = stadium.project((team === 'cr7' ? -1 : 1) * (viewConfig.field.length / 2 - .33), 2.4, 0);
    const tag = $(`goal-${team}`).parentElement;
    tag.style.left = `${point.x - 26}px`; tag.style.top = `${point.y - 27}px`; tag.style.right = 'auto'; tag.style.transform = 'translateX(-50%)';
    const caption = $(`star-name-${team}`).parentElement;
    caption.style.left = `${stadium.characters[team].object3d.position.x - 116}px`; caption.style.right = 'auto';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (preview) {
  import('./tests/scenarios.js').then(({ scenario }) => {
    const fixture = scenario(params.get('scene') || 'playing');
    updateState(fixture.state, true);
    for (const event of fixture.events) handleEvent(event);
  }).catch(error => warn(`Không nạp được bản xem thử: ${error.message}`));
}
addEventListener('pagehide', () => { socket?.disconnect(); stadium?.dispose(); }, { once: true });
