/**
 * TikTok Live Data Ingestion & Admin Center - Automated Smoke Test Suite
 * Tests live webcast processing, combo streak anti-duplication, chat/likes, analytics & persistence
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { io as ClientIO } from 'socket.io-client';

import { stateManager } from '../src/stateManager.js';
import { tiktokHandler } from '../src/tiktokHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const SESSION_FILE = path.join(DATA_DIR, 'session.json');

const TEST_PORT = 3099;
const SERVER_URL = `http://localhost:${TEST_PORT}`;

let app, server, ioServer;

async function startTestServer() {
  app = express();
  app.use(express.json());

  // Expose test REST APIs
  app.get('/api/status', (req, res) => {
    res.json({
      status: 'online',
      playerCount: stateManager.players.size,
      tiktok: tiktokHandler.getStatus()
    });
  });

  app.get('/api/players', (req, res) => {
    res.json({
      total: stateManager.players.size,
      players: stateManager.getAllPlayers()
    });
  });

  app.get('/api/gifts', (req, res) => {
    res.json({
      stats: stateManager.getGiftStats(),
      breakdown: stateManager.getGiftBreakdown()
    });
  });

  app.get('/api/gifts/export.csv', (req, res) => {
    const breakdown = stateManager.getGiftBreakdown();
    let csv = '\uFEFFTên Món Quà,Đơn Giá (Xu),Số Lượng Đã Nhận,Tổng Doanh Thu (Xu)\n';
    for (const item of breakdown) {
      csv += `"${item.giftName}",${item.diamondCount},${item.totalCount},${item.totalCoins}\n`;
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(csv);
  });

  server = http.createServer(app);
  ioServer = new SocketIOServer(server, {
    cors: { origin: '*' }
  });

  tiktokHandler.setEventCallback((eventName, data) => {
    ioServer.emit(eventName, data);
    if (eventName === 'gift_received') {
      const giftUnits = Math.max(1, Math.round((Number(data.deltaCoins) || Number(data.diamondCount) || 1) / (Number(data.diamondCount) || 1)) || 1);
      stateManager.recordGift({
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
      ioServer.emit('live:gift', data);
    } else if (eventName === 'chat_received') {
      ioServer.emit('live:chat', data);
    } else if (eventName === 'like_received') {
      ioServer.emit('live:like', data);
    }
  });

  ioServer.on('connection', (socket) => {
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
  });

  return new Promise((resolve) => {
    server.listen(TEST_PORT, () => {
      resolve();
    });
  });
}

async function stopTestServer() {
  if (ioServer) ioServer.close();
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function runTests() {
  console.log('========================================================');
  console.log('🧪 BẮT ĐẦU CHẠY KIỂM THỬ TỰ ĐỘNG (SMOKE TEST SUITE)...');
  console.log('========================================================\n');

  // Clear existing session for clean test run
  stateManager.resetSession();

  await startTestServer();
  console.log(`[Setup] Test server running on port ${TEST_PORT}`);

  const client = ClientIO(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true
  });

  await new Promise((resolve) => client.on('connect', resolve));
  console.log('[Setup] Test client connected via Socket.IO');

  let passedTests = 0;
  let totalTests = 9;

  try {
    // -------------------------------------------------------------------------
    // TEST CASE 1: Nguyễn Văn A donate 5 bông hoa -> Xu = 5, isTop1
    // -------------------------------------------------------------------------
    console.log('\n[Test 1] Kiểm tra: Khán giả "Nguyễn Văn A" donate 5 bông Hoa Hồng (1 xu/bông)...');

    const test1Promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for Test 1 gift event')), 4000);

      client.on('live:gift', (data) => {
        if (data.userId === 'nguyenvana_01') {
          clearTimeout(timeout);
          resolve(data);
        }
      });

      client.emit('admin:simulate_gift', {
        userId: 'nguyenvana_01',
        nickname: 'Nguyễn Văn A',
        avatarUrl: 'https://avatar.test/a.png',
        diamondCount: 1,
        repeatCount: 5,
        giftName: 'Hoa Hồng',
        giftId: 'rose_gift',
        groupId: 'test1_group',
        repeatEnd: true
      });
    });

    const res1 = await test1Promise;
    const playerA = stateManager.getPlayer('nguyenvana_01');

    if (!playerA || playerA.coins !== 5) {
      throw new Error(`Test 1 Thất bại: Kỳ vọng coins = 5, thực tế coins = ${playerA?.coins}`);
    }
    console.log(`✅ [Test 1 ĐẠT] Nguyễn Văn A nhận chính xác 5 Xu (Coins: ${playerA.coins})`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST CASE 2: Chống cộng trùng Combo Streak (Nguyễn Văn A tặng tiếp streak x3 rồi x5)
    // -------------------------------------------------------------------------
    console.log('\n[Test 2] Kiểm tra: Chống cộng trùng combo quà trong cùng groupId...');

    const streakGroupId = `streak_group_${Date.now()}`;

    // Lần 1: repeatCount = 3 -> deltaCoins = 3
    tiktokHandler.handleGift({
      userId: 'user_streak_test',
      nickname: 'Bạn Streak',
      giftId: 'rose_01',
      giftName: 'Hoa Hồng',
      diamondCount: 1,
      repeatCount: 3,
      repeatEnd: false,
      groupId: streakGroupId
    });

    let playerStreak = stateManager.getPlayer('user_streak_test');
    if (playerStreak.coins !== 3) {
      throw new Error(`Test 2 Bước 1 Thất bại: Kỳ vọng 3 coins, thực tế ${playerStreak.coins}`);
    }

    // Lần 2: repeatCount = 5 -> deltaCoins phải là 5 - 3 = 2! Tổng = 5
    tiktokHandler.handleGift({
      userId: 'user_streak_test',
      nickname: 'Bạn Streak',
      giftId: 'rose_01',
      giftName: 'Hoa Hồng',
      diamondCount: 1,
      repeatCount: 5,
      repeatEnd: true,
      groupId: streakGroupId
    });

    playerStreak = stateManager.getPlayer('user_streak_test');
    if (playerStreak.coins !== 5) {
      throw new Error(`Test 2 Bước 2 Thất bại: Chống cộng dồn lỗi! Kỳ vọng 5 coins, thực tế ${playerStreak.coins}`);
    }
    console.log(`✅ [Test 2 ĐẠT] Combo Streak x3 rồi x5 tính chuẩn xác 5 Xu (Không bị nhảy vọt thành 8 hay 15)`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST CASE 3: Chat recording & Bad words filter
    // -------------------------------------------------------------------------
    console.log('\n[Test 3] Kiểm tra: Tiếp nhận bình luận & Lọc từ ngữ phản cảm...');

    const test3Promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for chat event')), 4000);
      client.on('live:chat', (data) => {
        if (data.userId === 'user_chat_test') {
          clearTimeout(timeout);
          resolve(data);
        }
      });

      client.emit('admin:simulate_chat', {
        userId: 'user_chat_test',
        nickname: 'Người Bình Luận',
        message: 'Livestream này vcl hay quá shop ơi!'
      });
    });

    const chatRes = await test3Promise;
    const playerChat = stateManager.getPlayer('user_chat_test');

    if (!playerChat || playerChat.chatsCount < 1) {
      throw new Error('Test 3 Thất bại: Không ghi nhận chatsCount cho khán giả!');
    }
    if (chatRes.message.includes('vcl')) {
      throw new Error(`Test 3 Thất bại: Từ ngữ phản cảm chưa được che! Message: "${chatRes.message}"`);
    }
    console.log(`✅ [Test 3 ĐẠT] Bình luận được ghi nhận và lọc từ bậy: "${chatRes.message}" (Chats: ${playerChat.chatsCount})`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST CASE 4: Thả Tim (Likes recording)
    // -------------------------------------------------------------------------
    console.log('\n[Test 4] Kiểm tra: Tiếp nhận lượt thả tim...');

    const test4Promise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for like event')), 4000);
      client.on('live:like', (data) => {
        if (data.userId === 'user_like_test') {
          clearTimeout(timeout);
          resolve(data);
        }
      });

      client.emit('admin:simulate_like', {
        userId: 'user_like_test',
        nickname: 'Người Thả Tim',
        count: 20
      });
    });

    await test4Promise;
    const playerLike = stateManager.getPlayer('user_like_test');

    if (!playerLike || playerLike.likes !== 20) {
      throw new Error(`Test 4 Thất bại: Kỳ vọng 20 tim, thực tế ${playerLike?.likes}`);
    }
    console.log(`✅ [Test 4 ĐẠT] Tiếp nhận 20 tim chuẩn xác cho ${playerLike.nickname}`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST CASE 5: Session Persistence (session.json)
    // -------------------------------------------------------------------------
    console.log('\n[Test 5] Kiểm tra: Lưu trữ trạng thái phiên live vào session.json...');
    stateManager.saveSessionSync();

    if (!fs.existsSync(SESSION_FILE)) {
      throw new Error(`Test 5 Thất bại: Không tìm thấy file ${SESSION_FILE}`);
    }

    const savedContent = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    if (!Array.isArray(savedContent.players) || savedContent.players.length === 0) {
      throw new Error('Test 5 Thất bại: Danh sách players rỗng trong session.json');
    }
    console.log(`✅ [Test 5 ĐẠT] session.json lưu trữ thành công ${savedContent.players.length} người xem`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST CASE 6: Gift Analytics Breakdown & Donor Ranking
    // -------------------------------------------------------------------------
    console.log('\n[Test 6] Kiểm tra: Thống kê chi tiết món quà & xếp hạng người tặng...');

    // Simulate another gift with high diamond count
    stateManager.recordGift({
      userId: 'whale_user_01',
      nickname: 'Đại Gia Phố Cổ',
      avatarUrl: '',
      giftId: 'crown_gift',
      giftName: 'Vương Miện',
      diamondCount: 199,
      count: 2,
      deltaCoins: 398,
      timestamp: new Date().toISOString()
    });

    const breakdown = stateManager.getGiftBreakdown();
    const stats = stateManager.getGiftStats();

    if (!breakdown || breakdown.length === 0) {
      throw new Error('Test 6 Thất bại: Bảng kê chi tiết quà rỗng');
    }

    const topGift = breakdown[0];
    if (topGift.giftName !== 'Vương Miện') {
      throw new Error(`Test 6 Thất bại: Quà doanh thu cao nhất phải là Vương Miện, nhận được: ${topGift.giftName}`);
    }

    if (!topGift.topDonor || topGift.topDonor.userId !== 'whale_user_01') {
      throw new Error('Test 6 Thất bại: Sai người tặng nhiều nhất');
    }

    console.log(`✅ [Test 6 ĐẠT] Bảng kê quà chuẩn xác: Top 1 = ${topGift.giftName} (${topGift.totalCoins} Xu, Top Donor: ${topGift.topDonor.nickname})`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST CASE 7: REST APIs verification
    // -------------------------------------------------------------------------
    console.log('\n[Test 7] Kiểm tra: REST APIs (/api/status, /api/players, /api/gifts, /api/gifts/export.csv)...');

    const statusRes = await fetch(`${SERVER_URL}/api/status`).then(r => r.json());
    if (statusRes.status !== 'online') {
      throw new Error('Test 7 Thất bại: /api/status không online');
    }

    const playersRes = await fetch(`${SERVER_URL}/api/players`).then(r => r.json());
    if (typeof playersRes.total !== 'number' || playersRes.total === 0) {
      throw new Error('Test 7 Thất bại: /api/players không trả về danh sách khán giả');
    }

    const giftsRes = await fetch(`${SERVER_URL}/api/gifts`).then(r => r.json());
    if (!giftsRes.breakdown || giftsRes.breakdown.length === 0) {
      throw new Error('Test 7 Thất bại: /api/gifts không trả về breakdown');
    }

    const csvRes = await fetch(`${SERVER_URL}/api/gifts/export.csv`).then(r => r.text());
    if (!csvRes.includes('Tên Món Quà')) {
      throw new Error('Test 7 Thất bại: /api/gifts/export.csv không trả về CSV hợp lệ');
    }

    console.log(`✅ [Test 7 ĐẠT] Toàn bộ 4 REST APIs phản hồi đúng chuẩn dữ liệu`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST CASE 8: Khán giả tương tác Out Phòng Live -> Trừ số người, GIỮ NGUYÊN Xu & Tim
    // -------------------------------------------------------------------------
    console.log('\n[Test 8] Kiểm tra: Khán giả out phòng live -> Trừ khán giả tương tác nhưng giữ nguyên 100% Xu & Tim...');

    // Nguyễn Văn A thả thêm 15 tim trước khi out phòng
    tiktokHandler.handleLike({
      userId: 'nguyenvana_01',
      nickname: 'Nguyễn Văn A',
      likeCount: 15
    });

    const beforeLeaveTotals = stateManager.getSessionTotals();
    const beforePlayerA = stateManager.getPlayer('nguyenvana_01');

    // Khán giả Nguyễn Văn A rời phòng live
    tiktokHandler.handleMemberLeave('nguyenvana_01');

    const afterLeaveTotals = stateManager.getSessionTotals();
    const afterPlayerA = stateManager.getPlayer('nguyenvana_01');

    if (afterLeaveTotals.onlineCount !== beforeLeaveTotals.onlineCount - 1) {
      throw new Error(`Test 8 Thất bại: Số khán giả tương tác không giảm! Trước: ${beforeLeaveTotals.onlineCount}, Sau: ${afterLeaveTotals.onlineCount}`);
    }
    if (afterPlayerA.isOnline !== false) {
      throw new Error('Test 8 Thất bại: Trạng thái isOnline của khán giả rời phòng chưa chuyển thành false');
    }
    if (afterPlayerA.coins !== beforePlayerA.coins || afterPlayerA.likes !== beforePlayerA.likes) {
      throw new Error(`Test 8 Thất bại: Xu hoặc Tim cá nhân bị trừ khi out phòng! Xu: ${afterPlayerA.coins}/${beforePlayerA.coins}, Tim: ${afterPlayerA.likes}/${beforePlayerA.likes}`);
    }
    if (afterLeaveTotals.totalCoins !== beforeLeaveTotals.totalCoins || afterLeaveTotals.totalLikes !== beforeLeaveTotals.totalLikes) {
      throw new Error(`Test 8 Thất bại: Tổng Xu hoặc Tổng Tim toàn phiên bị trừ khi khán giả out phòng!`);
    }

    console.log(`✅ [Test 8 ĐẠT] Out phòng giảm chuẩn 1 người (${beforeLeaveTotals.onlineCount} -> ${afterLeaveTotals.onlineCount}), giữ nguyên 100% Xu (${afterLeaveTotals.totalCoins} Xu) & Tim (${afterLeaveTotals.totalLikes} Tim)`);
    passedTests++;

    // -------------------------------------------------------------------------
    // TEST CASE 9: Kết nối với username mới -> Tự động xóa sạch dữ liệu khán giả cũ
    // -------------------------------------------------------------------------
    console.log('\n[Test 9] Kiểm tra: Kết nối với username mới -> Tự động xóa sạch dữ liệu khán giả cũ...');

    tiktokHandler.lastConnectedUsername = 'streamer_cu';
    tiktokHandler.currentUsername = 'streamer_cu';
    if (stateManager.players.size === 0) {
      stateManager.getOrCreatePlayer('user_cu_01', 'Khán Giả Cũ', '');
    }
    const countBeforeSwitch = stateManager.players.size;

    try {
      await tiktokHandler.connect('streamer_moi_999');
    } catch {
      // Expected to fail network connection since 'streamer_moi_999' is not a live stream
    } finally {
      tiktokHandler.disconnect();
    }

    if (stateManager.players.size !== 0) {
      throw new Error(`Test 9 Thất bại: Dữ liệu user cũ chưa được xóa khi kết nối username mới! Còn ${stateManager.players.size} người.`);
    }
    if (stateManager.giftSummary.size !== 0) {
      throw new Error(`Test 9 Thất bại: Dữ liệu quà cũ chưa được xóa khi kết nối username mới!`);
    }

    console.log(`✅ [Test 9 ĐẠT] Đã tự động xóa sạch ${countBeforeSwitch} khán giả và dữ liệu quà cũ khi kết nối sang username mới!`);
    passedTests++;

    console.log('\n========================================================');
    console.log(`🎉 HOÀN THÀNH TẤT CẢ ${passedTests}/${totalTests} BÀI TEST THÀNH CÔNG RỰC RỠ!`);
    console.log('========================================================\n');

  } catch (err) {
    console.error('\n❌ BÀI TEST THẤT BẠI:', err.message);
    process.exitCode = 1;
  } finally {
    client.disconnect();
    await stopTestServer();
  }
}

runTests();
