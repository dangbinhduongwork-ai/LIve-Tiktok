import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import { stateManager } from './stateManager.js';
import { tiktokHandler } from './tiktokHandler.js';
import { GameEngine } from './gameEngine.js';
import { gameConfig } from './gameConfig.js';
import { createAdminAuth, loadAdminToken } from './adminAuth.js';
import { GameEventQueue } from './gameEventQueue.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const PORT = Number(process.env.PORT || 3000);
// This application is a local OBS/admin server, including with older .env files.
const HOST = '127.0.0.1';
const adminTokenFile = path.resolve(__dirname, '../data/admin-token.txt');
const allowedOrigins = [
  `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`,
  ...String(process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean)
];
const adminAuth = createAdminAuth({ token: loadAdminToken(adminTokenFile, process.env.ADMIN_TOKEN), allowedOrigins });

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => callback(null, adminAuth.originAllowed(origin)),
    credentials: true,
    methods: ['GET', 'POST']
  },
  allowRequest: (req, callback) => callback(null, adminAuth.originAllowed(req.headers.origin))
});
adminAuth.attachSockets(io);
const gameEngine = new GameEngine({ config: gameConfig, emit: event => io.emit('game:event', event) });
const gameQueue = new GameEventQueue(gameConfig.queue);
let lastQueueWarningAt = -Infinity;
function resetGame() {
  gameQueue.clear();
  gameEngine.reset();
}

// Auto-traffic simulation handle
let trafficInterval = null;
let trafficActive = false;

// Middleware
app.use(adminAuth.originGuard);
app.use(cors({ origin: (origin, callback) => callback(null, adminAuth.originAllowed(origin)), credentials: true }));
app.use(express.json({ limit: '16kb' }));
app.post('/auth/login', adminAuth.login);
app.post('/auth/logout', adminAuth.requireAdmin, adminAuth.logout);
app.use('/login', express.static(path.join(PUBLIC_DIR, 'login')));
app.use('/admin', adminAuth.requirePage, express.static(path.join(PUBLIC_DIR, 'admin')));
app.use('/game', express.static(path.join(PUBLIC_DIR, 'game')));

// Routes
app.get('/', (req, res) => {
  res.redirect('/admin');
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    uptime: Math.floor(process.uptime()),
    viewerCount: tiktokHandler.viewerCount,
    playerCount: stateManager.getOnlineCount(),
    onlinePlayerCount: stateManager.getOnlineCount(),
    totalHistoricalPlayers: stateManager.players.size,
    sessionTotals: stateManager.getSessionTotals(),
    topPlayers: stateManager.getTopPlayers(5),
    tiktok: tiktokHandler.getStatus(),
    trafficActive,
    giftStats: stateManager.getGiftStats(),
    game: { matchId: gameEngine.matchId, phase: gameEngine.phase, queue: gameQueue.getStats() }
  });
});

app.get('/api/players', (req, res) => {
  res.json({
    total: stateManager.players.size,
    onlineCount: stateManager.getOnlineCount(),
    sessionTotals: stateManager.getSessionTotals(),
    players: stateManager.getAllPlayers()
  });
});

app.get('/api/players/export.csv', (req, res) => {
  const players = stateManager.getAllPlayers();
  let csv = '\uFEFF'; // UTF-8 BOM for Excel
  csv += 'Hạng,Tên Khán Giả,User ID,Trạng Thái Phòng,Số Xu Donate,Tỷ Trọng Xu (%),Lượt Thả Tim,Lượt Bình Luận,Bình Luận Gần Nhất,Thời Gian Tham Gia,Hoạt Động Cuối\n';

  for (const p of players) {
    const nick = `"${String(p.nickname || 'Khán Giả').replace(/"/g, '""')}"`;
    const uid = `"${String(p.userId || '').replace(/"/g, '""')}"`;
    const status = p.isOnline !== false ? 'Đang trong phòng' : 'Đã out phòng';
    const lastMsg = `"${String(p.lastMessage || '').replace(/"/g, '""')}"`;
    const joinedAt = p.createdAt ? new Date(p.createdAt).toLocaleString('vi-VN') : '';
    const lastActive = p.lastActiveAt ? new Date(p.lastActiveAt).toLocaleString('vi-VN') : '';
    csv += `${p.rank},${nick},${uid},"${status}",${p.coins || 0},${p.coinPercentage || 0}%,${p.likes || 0},${p.chatsCount || 0},${lastMsg},"${joinedAt}","${lastActive}"\n`;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tiktok_viewers_ranking_${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

app.get('/api/gifts', (req, res) => {
  res.json({
    stats: stateManager.getGiftStats(),
    breakdown: stateManager.getGiftBreakdown(),
    recentTransactions: stateManager.getRecentGiftTransactions(100)
  });
});

app.get('/api/gifts/export.csv', (req, res) => {
  const breakdown = stateManager.getGiftBreakdown();
  let csv = '\uFEFF'; // UTF-8 BOM for Excel
  csv += 'Tên Món Quà,Đơn Giá (Xu),Số Lượng Đã Nhận,Tổng Doanh Thu (Xu),Tỷ Trọng Doanh Thu (%),Khán Giả Tặng Nhiều Nhất,Số Quà Người Đó Tặng,Xu Đóng Góp\n';
  
  for (const item of breakdown) {
    const topName = item.topDonor ? `"${item.topDonor.nickname.replace(/"/g, '""')}"` : '""';
    const topCount = item.topDonor ? item.topDonor.count : 0;
    const topCoins = item.topDonor ? item.topDonor.coins : 0;
    csv += `"${item.giftName.replace(/"/g, '""')}",${item.diamondCount},${item.totalCount},${item.totalCoins},${item.percentage}%,${topName},${topCount},${topCoins}\n`;
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="tiktok_gifts_${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});

app.post('/api/reset', adminAuth.requireAdmin, (req, res) => {
  stateManager.resetSession();
  resetGame();
  io.emit('live:session_reset', { timestamp: Date.now() });
  io.to('admin').emit('admin:players_updated', []);
  io.to('admin').emit('admin:gift_breakdown_updated', {
    breakdown: [],
    stats: stateManager.getGiftStats(),
    recentTransactions: []
  });
  res.json({ success: true, message: 'Đã thiết lập lại dữ liệu phiên live.' });
});

// Snappy debounced broadcast of player updates (120ms for fast feedback)
let updatePlayersTimeout = null;
function broadcastPlayerUpdates() {
  if (updatePlayersTimeout) return;
  updatePlayersTimeout = setTimeout(() => {
    updatePlayersTimeout = null;
    const allPlayers = stateManager.getAllPlayers();
    io.to('admin').emit('admin:players_updated', allPlayers);
  }, 120);
}

// TikTok Event bridge to Socket.IO & State Manager
tiktokHandler.setEventCallback((eventName, data) => {
  // The bridge remains immediate; game work is bounded to one batch per tick.
  if (['gift_received', 'chat_received', 'like_received', 'viewer_count', 'member_join', 'member_leave'].includes(eventName)) {
    if (!gameQueue.enqueue(eventName, data, gameEngine.matchId) && Date.now() - lastQueueWarningAt >= gameConfig.queue.warningIntervalMs) {
      lastQueueWarningAt = Date.now();
      io.to('admin').emit('admin:event_log', {
        type: 'status', text: '[GAME] Hàng đợi quá tải; xem bộ đếm dropped trong /api/status. Dữ liệu quà của bridge vẫn được ghi nhận.',
        time: new Date().toLocaleTimeString('vi-VN')
      });
    }
  } else if (eventName === 'session_reset') resetGame();

  switch (eventName) {
    case 'gift_received': {
      const giftUnits = Math.max(1, Math.round((Number(data.deltaCoins) || Number(data.diamondCount) || 1) / (Number(data.diamondCount) || 1)) || 1);
      const recordedGift = stateManager.recordGift({
        userId: data.userId,
        nickname: data.nickname,
        avatarUrl: data.avatarUrl,
        giftId: data.giftId,
        giftName: data.giftName,
        giftPictureUrl: data.giftPictureUrl,
        diamondCount: data.diamondCount,
        count: giftUnits,
        deltaCoins: data.deltaCoins,
        timestamp: new Date().toISOString()
      });

      io.emit('live:gift', data);
      io.to('admin').emit('admin:gift_breakdown_updated', {
        breakdown: stateManager.getGiftBreakdown(),
        stats: stateManager.getGiftStats(),
        recentTransactions: stateManager.getRecentGiftTransactions(30),
        latest: recordedGift?.transaction
      });
      io.to('admin').emit('admin:event_log', {
        type: 'gift',
        text: `[QUÀ] ${data.nickname} tặng ${data.giftName} x${data.repeatCount} (+${data.deltaCoins} Xu)`,
        time: new Date().toLocaleTimeString('vi-VN')
      });
      broadcastPlayerUpdates();
      break;
    }

    case 'chat_received': {
      io.emit('live:chat', data);
      io.to('admin').emit('admin:event_log', {
        type: 'chat',
        text: `[CHAT] ${data.nickname}: ${data.message}`,
        time: new Date().toLocaleTimeString('vi-VN')
      });
      broadcastPlayerUpdates();
      break;
    }

    case 'like_received': {
      io.emit('live:like', data);
      io.to('admin').emit('admin:event_log', {
        type: 'like',
        text: `[TIM] ${data.nickname} thả ${data.likeCount} tim (Tổng: ${data.totalLikes} tim)`,
        time: new Date().toLocaleTimeString('vi-VN')
      });
      broadcastPlayerUpdates();
      break;
    }

    case 'member_join': {
      io.emit('live:member_join', data);
      if (data.rejoined) {
        io.to('admin').emit('admin:event_log', {
          type: 'status',
          text: `[VÀO LẠI] ${data.nickname} đã quay lại phòng live`,
          time: new Date().toLocaleTimeString('vi-VN')
        });
        broadcastPlayerUpdates();
      }
      break;
    }

    case 'member_leave': {
      io.emit('live:member_leave', data);
      io.to('admin').emit('admin:event_log', {
        type: 'status',
        text: `[OUT PHÒNG] ${data.nickname} đã rời phòng live (-1 khán giả | Giữ nguyên ${data.coins} Xu, ${data.likes} Tim)`,
        time: new Date().toLocaleTimeString('vi-VN')
      });
      broadcastPlayerUpdates();
      break;
    }

    case 'viewer_count': {
      io.emit('live:viewer_count', data);
      break;
    }

    case 'session_reset': {
      io.emit('live:session_reset', data);
      io.to('admin').emit('admin:players_updated', []);
      io.to('admin').emit('admin:gift_breakdown_updated', {
        breakdown: [],
        stats: stateManager.getGiftStats(),
        recentTransactions: []
      });
      io.to('admin').emit('admin:event_log', {
        type: 'status',
        text: `[KÊNH MỚI] Đã làm mới toàn bộ dữ liệu khán giả cũ để kết nối phòng live @${data.username}`,
        time: new Date().toLocaleTimeString('vi-VN')
      });
      break;
    }

    case 'tiktok_status': {
      io.emit('tiktok_status', data);
      io.to('admin').emit('admin:event_log', {
        type: 'status',
        text: `[LIVE] TikTok: ${data.message}`,
        time: new Date().toLocaleTimeString('vi-VN')
      });
      if (data.status === 'connected') {
        broadcastPlayerUpdates();
      }
      break;
    }

    default:
      io.emit(eventName, data);
  }
});

// Authentic TikTok Live Gifts for Auto-Traffic Simulation
const BOT_NAMES = [
  'Minh Hoàng', 'Ánh Tuyết', 'Bảo Long', 'Phương Thảo', 'Quốc Huy',
  'Khánh Linh', 'Tuấn Kiệt', 'Thanh Hằng', 'Văn Dũng', 'Mai Lan',
  'Đức Anh', 'Hồng Ngọc', 'Trọng Hiếu', 'Yến Nhi', 'Gia Huy'
];

const BOT_COMMENTS = [
  'Chào streamer và cả nhà nha!', 'Thả tim nè mn ơi!',
  'Phòng live hôm nay đông vui quá', 'Chúc streamer live bùng nổ mắt xem nha',
  'Tặng quà ủng hộ nè!', 'Âm thanh hình ảnh nét căng luôn shop ơi',
  'Hello mn!', 'Thả tim mỏi tay luôn nè!'
];

// Exact Real TikTok Live Gifts with Official Diamond Counts
const BOT_GIFTS = [
  { name: 'Hoa Hồng', diamonds: 1, giftId: '5655' },
  { name: 'Kem Ốc Quế', diamonds: 1, giftId: '5827' },
  { name: 'Ngón Tay Tim', diamonds: 5, giftId: '5487' },
  { name: 'Gấu Trúc', diamonds: 5, giftId: '5269' },
  { name: 'Nước Hoa', diamonds: 20, giftId: '5585' },
  { name: 'Bánh Donut', diamonds: 30, giftId: '5650' },
  { name: 'Mũ & Kính Mát', diamonds: 99, giftId: '5656' },
  { name: 'Vương Miện Mini', diamonds: 199, giftId: '5879' },
  { name: 'Thiên Nga', diamonds: 699, giftId: '5337' },
  { name: 'Xe Thể Thao', diamonds: 1000, giftId: '6017' },
  { name: 'Cá Voi Bay', diamonds: 2150, giftId: '5880' },
  { name: 'Sư Tử TikTok', diamonds: 29999, giftId: '6059' },
  { name: 'Vũ Trụ TikTok (Universe)', diamonds: 34999, giftId: '6064' }
];

let trafficSeededMatchId = null;
function seedTrafficPlayers() {
  if (!trafficActive || trafficSeededMatchId === gameEngine.matchId) return;
  trafficSeededMatchId = gameEngine.matchId;
  const favored = gameEngine.matchId % 2 ? 'cr7' : 'm10';
  const other = favored === 'cr7' ? 'm10' : 'cr7';
  BOT_NAMES.forEach((nickname, index) => {
    const userId = `bot_${nickname.toLowerCase().replace(/\s+/g, '_')}`;
    const team = index % 5 < 3 ? favored : other;
    gameEngine.handleChat({ userId, nickname, message: gameConfig.teams[team].keywords[0] });
  });
}

function startTrafficSimulation() {
  if (trafficInterval) clearInterval(trafficInterval);
  trafficActive = true;
  io.to('admin').emit('admin:traffic_status', { active: true });

  // Their normal bridge events then exercise the match without changing admin data.
  seedTrafficPlayers();

  // Simulate initial viewer count if not connected to real live
  if (!tiktokHandler.isConnected) {
    tiktokHandler.handleRoomUser({ viewerCount: Math.floor(Math.random() * 60) + 45 });
  }

  trafficInterval = setInterval(() => {
    const randomBotName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const randomBotId = `bot_${randomBotName.toLowerCase().replace(/\s+/g, '_')}`;
    const actionDice = Math.random();

    // Fluctuate viewer count slightly during auto-traffic simulation if not connected to real TikTok
    if (!tiktokHandler.isConnected) {
      const currentV = tiktokHandler.viewerCount || 50;
      const deltaV = Math.floor(Math.random() * 9) - 4;
      tiktokHandler.handleRoomUser({ viewerCount: Math.max(15, currentV + deltaV), syncInteractive: false });
    }

    if (actionDice < 0.50) {
      const count = Math.floor(Math.random() * 5) + 1;
      tiktokHandler.handleLike({
        userId: randomBotId,
        nickname: randomBotName,
        likeCount: count
      });
    } else if (actionDice < 0.78) {
      const comment = BOT_COMMENTS[Math.floor(Math.random() * BOT_COMMENTS.length)];
      tiktokHandler.handleChat({
        userId: randomBotId,
        nickname: randomBotName,
        comment
      });
    } else if (actionDice < 0.90) {
      const gift = BOT_GIFTS[Math.floor(Math.random() * BOT_GIFTS.length)];
      const streak = Math.random() < 0.7 ? 1 : (Math.random() < 0.8 ? 5 : 10);
      const groupId = `sim_${Date.now()}`;

      tiktokHandler.handleGift({
        userId: randomBotId,
        nickname: randomBotName,
        giftId: gift.giftId,
        giftName: gift.name,
        diamondCount: gift.diamonds,
        repeatCount: streak,
        repeatEnd: true,
        groupId
      });
    } else {
      // Simulate an online interactive viewer leaving the room (preserving coins & likes)
      const onlineList = stateManager.getOnlinePlayers();
      if (onlineList.length >= 3) {
        const leavingPlayer = onlineList[Math.floor(Math.random() * onlineList.length)];
        tiktokHandler.handleMemberLeave(leavingPlayer.userId);
      } else {
        tiktokHandler.handleLike({
          userId: randomBotId,
          nickname: randomBotName,
          likeCount: 3
        });
      }
    }
  }, 2000);
}

function stopTrafficSimulation() {
  if (trafficInterval) {
    clearInterval(trafficInterval);
    trafficInterval = null;
  }
  trafficActive = false;
  io.to('admin').emit('admin:traffic_status', { active: false });
}

// Socket.IO Communication
io.on('connection', (socket) => {
  // Send complete initial state to client
  socket.emit('init_state', {
    viewerCount: tiktokHandler.viewerCount,
    onlinePlayerCount: stateManager.getOnlineCount(),
    sessionTotals: stateManager.getSessionTotals(),
    allPlayers: stateManager.getAllPlayers(),
    topPlayers: stateManager.getTopPlayers(5),
    tiktokStatus: tiktokHandler.getStatus(),
    trafficActive,
    giftBreakdown: stateManager.getGiftBreakdown(),
    giftStats: stateManager.getGiftStats(),
    giftTransactions: stateManager.getRecentGiftTransactions(50),
    game: gameEngine.getState()
  });
  socket.emit('game:state', gameEngine.getState());

  socket.on('admin:custom_command', (payload = {}) => {
    if (!payload || typeof payload !== 'object') return;
    const action = String(payload.action || '').toUpperCase();
    let accepted = false;
    if (action === 'START') accepted = gameEngine.start();
    else if (action === 'RESET_MATCH') {
      resetGame();
      accepted = true;
    } else if (action === 'FORCE_GOAL') accepted = gameEngine.forceGoal(String(payload.team || '').toLowerCase());
    if (accepted) {
      io.emit('game:custom_command', { action, team: payload.team || null });
    }
  });

  // Admin: Connect to TikTok
  socket.on('admin:tiktok_connect', async (data) => {
    try {
      const username = String(data?.username || '').replace(/^@/, '').trim();
      const resetSession = data?.resetSession !== false;
      await tiktokHandler.connect(username, { resetSession });
    } catch (err) {
      socket.emit('admin:error', { message: err.message });
    }
  });

  // Admin: Disconnect from TikTok
  socket.on('admin:tiktok_disconnect', () => {
    tiktokHandler.disconnect();
  });

  // Admin: Simulation actions
  socket.on('admin:simulate_gift', (data) => {
    tiktokHandler.handleGift(data);
  });

  socket.on('admin:simulate_chat', (data) => {
    tiktokHandler.handleChat({
      userId: data.userId,
      nickname: data.nickname,
      avatarUrl: data.avatarUrl,
      comment: data.message
    });
  });

  socket.on('admin:simulate_like', (data) => {
    tiktokHandler.handleLike({
      userId: data.userId,
      nickname: data.nickname,
      avatarUrl: data.avatarUrl,
      likeCount: data.count || 5
    });
  });

  socket.on('admin:simulate_viewer_count', (data) => {
    const count = Math.max(0, Number(data?.viewerCount) || 0);
    tiktokHandler.handleRoomUser({ viewerCount: count, syncInteractive: true });
  });

  socket.on('admin:simulate_leave', (data) => {
    if (data && data.userId) {
      tiktokHandler.handleMemberLeave(data.userId);
    }
  });

  socket.on('admin:player_leave', (data) => {
    if (data && data.userId) {
      tiktokHandler.handleMemberLeave(data.userId);
    }
  });

  socket.on('admin:simulate_traffic', (data) => {
    if (data && data.enable) {
      startTrafficSimulation();
    } else {
      stopTrafficSimulation();
    }
  });

  // Admin: Player management
  socket.on('admin:modify_coins', (data) => {
    const res = stateManager.modifyCoins(data.userId, data.delta);
    if (res) {
      socket.emit('admin:player_modified', res.player);
      broadcastPlayerUpdates();
    }
  });

  socket.on('admin:delete_player', (data) => {
    const deleted = stateManager.deletePlayer(data.userId);
    if (deleted) {
      socket.emit('admin:player_deleted', { userId: data.userId });
      broadcastPlayerUpdates();
    }
  });

  socket.on('admin:get_players', () => {
    socket.emit('admin:players_updated', stateManager.getAllPlayers());
  });

  socket.on('admin:reset_session', () => {
    stateManager.resetSession();
    resetGame();
    io.emit('live:session_reset', { timestamp: Date.now() });
    io.to('admin').emit('admin:players_updated', []);
    io.to('admin').emit('admin:gift_breakdown_updated', {
      breakdown: [],
      stats: stateManager.getGiftStats(),
      recentTransactions: []
    });
  });

  socket.on('admin:clear_gifts', () => {
    stateManager.clearGifts();
    io.to('admin').emit('admin:gift_breakdown_updated', {
      breakdown: [],
      stats: stateManager.getGiftStats(),
      recentTransactions: []
    });
    io.to('admin').emit('admin:event_log', {
      type: 'status',
      text: `[SYS] Streamer đã làm mới toàn bộ bảng kê quà tặng!`,
      time: new Date().toLocaleTimeString('vi-VN')
    });
  });
});

// The clock is monotonic; a delayed interval advances by actual elapsed time.
let lastGameTickAt = performance.now();
let lastGameStateAt = lastGameTickAt;
setInterval(() => {
  const now = performance.now();
  gameQueue.drain(gameEngine.matchId, ({ type, data, receivedAt }) => {
    if (type === 'chat_received') gameEngine.handleChat(data, receivedAt);
    else if (type === 'gift_received') gameEngine.handleGift(data, receivedAt);
    else if (type === 'like_received') gameEngine.handleLike(data, receivedAt);
    else if (type === 'viewer_count') gameEngine.handleViewerCount(data.viewerCount);
    else if (type === 'member_join') gameEngine.handleMemberJoin(data, receivedAt);
    else if (type === 'member_leave') gameEngine.handleMemberLeave(data, receivedAt);
  });
  const previousMatchId = gameEngine.matchId;
  gameEngine.tick((now - lastGameTickAt) / 1000);
  if (previousMatchId !== gameEngine.matchId) gameQueue.clear();
  lastGameTickAt = now;
  seedTrafficPlayers();
  if (now - lastGameStateAt >= gameConfig.stateIntervalMs) {
    io.emit('game:state', gameEngine.getState());
    lastGameStateAt = now;
  }
}, gameConfig.tickIntervalMs);

// Start Server
server.listen(PORT, HOST, () => {
  const port = server.address().port;
  allowedOrigins.push(`http://localhost:${port}`, `http://127.0.0.1:${port}`);
  console.log('========================================================');
  console.log('TIKTOK LIVE DATA INGESTION & ADMIN CENTER DA SAN SANG');
  console.log(`Trang Quan Tri & Tiep Nhan: http://localhost:${port}/admin`);
  console.log(`Trang Game:                http://localhost:${port}/game`);
  console.log(`Trang Thai He Thong:        http://localhost:${port}/api/status`);
  if (!process.env.ADMIN_TOKEN?.trim()) console.log(`Ma quan tri luu tai:        ${adminTokenFile}`);
  console.log('========================================================');
  if (process.send) process.send({ type: 'listening', port, host: HOST });
});
