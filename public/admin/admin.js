/**
 * =========================================================================
 * TIKTOK LIVE DATA INGESTION & ADMIN CENTER
 * =========================================================================
 * Trung tâm tiếp nhận và quản trị toàn diện dữ liệu Live Stream TikTok.
 */

const socket = io();

// DOM Elements: Header & Status
const statTiktokStatus = document.getElementById('statTiktokStatus');
const statViewerCount = document.getElementById('statViewerCount');
const statPlayerCount = document.getElementById('statPlayerCount');
const statTotalCoins = document.getElementById('statTotalCoins');
const statTotalLikes = document.getElementById('statTotalLikes');
const statUptime = document.getElementById('statUptime');

const btnHeaderRefresh = document.getElementById('btnHeaderRefresh');
const btnResetSession = document.getElementById('btnResetSession');

// TikTok Connection
const tiktokUsernameInput = document.getElementById('tiktokUsernameInput');
const btnConnectTikTok = document.getElementById('btnConnectTikTok');
const btnDisconnectTikTok = document.getElementById('btnDisconnectTikTok');
const tiktokStatusBadge = document.getElementById('tiktokStatusBadge');
const chkAutoResetNewUser = document.getElementById('chkAutoResetNewUser');
const btnQuickClearData = document.getElementById('btnQuickClearData');

// Event Log & Filters
const eventLogList = document.getElementById('eventLogList');
const btnClearLog = document.getElementById('btnClearLog');
const filterTabs = document.querySelectorAll('.filter-tab');
let activeLogFilter = 'all';

// Simulator Elements
const btnQuickTestNguyễnVănA = document.getElementById('btnQuickTestNguyễnVănA');
const simNickname = document.getElementById('simNickname');
const simUserId = document.getElementById('simUserId');
const btnSimLeave = document.getElementById('btnSimLeave');

const customGiftName = document.getElementById('customGiftName');
const customGiftDiamonds = document.getElementById('customGiftDiamonds');
const btnSendCustomGift = document.getElementById('btnSendCustomGift');

const simComment = document.getElementById('simComment');
const btnSimChat = document.getElementById('btnSimChat');
const btnToggleTraffic = document.getElementById('btnToggleTraffic');

// TikTok Gifts Library Elements
const giftCatTabs = document.querySelectorAll('.gift-cat-tab');
const giftCards = document.querySelectorAll('.gift-card-btn');

// Main Navigation Data Tabs
const dataTabButtons = document.querySelectorAll('.data-tab-btn');
const panelGiftAnalytics = document.getElementById('panelGiftAnalytics');
const panelViewers = document.getElementById('panelViewers');
const dataPanelsContainer = document.getElementById('dataPanelsContainer');
const tabGiftBadge = document.getElementById('tabGiftBadge');
const tabViewerBadge = document.getElementById('tabViewerBadge');

// Player / Viewer Statistics & Ranking Table
const playerTableBody = document.getElementById('playerTableBody');
const playerCountBadge = document.getElementById('playerCountBadge');
const playerSearchInput = document.getElementById('playerSearchInput');
const playerSortSelect = document.getElementById('playerSortSelect');
const btnRefreshPlayers = document.getElementById('btnRefreshPlayers');
const viewerFilterTabs = document.querySelectorAll('.viewer-filter-tab');
const valViewerTotal = document.getElementById('valViewerTotal');
const valViewerOnlineSplit = document.getElementById('valViewerOnlineSplit');
const valViewerDonors = document.getElementById('valViewerDonors');
const valViewerTop1 = document.getElementById('valViewerTop1');
const valViewerEngagement = document.getElementById('valViewerEngagement');
const countFilterAll = document.getElementById('countFilterAll');
const countFilterDonors = document.getElementById('countFilterDonors');
const countFilterOnline = document.getElementById('countFilterOnline');
const countFilterOffline = document.getElementById('countFilterOffline');
let activeViewerFilter = 'all';
let activeViewerSort = 'coins';

// Gift Analytics Elements
const giftTotalBadge = document.getElementById('giftTotalBadge');
const btnExportGiftCsv = document.getElementById('btnExportGiftCsv');
const btnClearGifts = document.getElementById('btnClearGifts');
const valGiftTypes = document.getElementById('valGiftTypes');
const valGiftUnits = document.getElementById('valGiftUnits');
const valGiftCoins = document.getElementById('valGiftCoins');
const valGiftPopular = document.getElementById('valGiftPopular');
const valGiftTopRevenue = document.getElementById('valGiftTopRevenue');
const giftTableBody = document.getElementById('giftTableBody');
const giftTxTableBody = document.getElementById('giftTxTableBody');
const giftSubtabs = document.querySelectorAll('.gift-subtab');
const tabGiftSummary = document.getElementById('tabGiftSummary');
const tabGiftStream = document.getElementById('tabGiftStream');

// Cache
let cachedPlayers = [];
let cachedGiftBreakdown = [];
let cachedGiftTransactions = [];
let isTrafficActive = false;
let startTime = Date.now();
let selectedGiftId = '5655';

// Utility: Escape HTML safely
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper: Render live viewer count
function updateViewerCountDisplay(count) {
  const safeCount = Math.max(0, Number(count) || 0);
  if (statViewerCount) {
    statViewerCount.innerText = `${safeCount.toLocaleString('vi-VN')} mắt xem`;
  }
}

// Uptime Clock
setInterval(() => {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const hrs = String(Math.floor(elapsed / 3600)).padStart(2, '0');
  const mins = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');
  if (statUptime) statUptime.innerText = `${hrs}:${mins}:${secs}`;
}, 1000);

// =========================================================================
// 1. SOCKET.IO EVENT HANDLERS
// =========================================================================

socket.on('connect', () => {
  addLog('info', '[CONNECTED] Đã kết nối với máy chủ quản trị Socket.IO');
});

socket.on('disconnect', () => {
  addLog('status', '[DISCONNECTED] Mất kết nối với máy chủ backend');
  updateTikTokBadge('disconnected', 'Mất kết nối server');
});

socket.on('init_state', (data) => {
  if (typeof data.viewerCount === 'number') {
    updateViewerCountDisplay(data.viewerCount);
  }
  if (data.tiktokStatus) {
    handleTikTokStatusUpdate(data.tiktokStatus);
  }
  if (typeof data.trafficActive === 'boolean') {
    updateTrafficButton(data.trafficActive);
  }
  if (Array.isArray(data.allPlayers)) {
    cachedPlayers = data.allPlayers;
    renderPlayerTable(data.allPlayers);
    updateMetrics(data.allPlayers);
  }
  if (Array.isArray(data.giftBreakdown)) {
    cachedGiftBreakdown = data.giftBreakdown;
    renderGiftBreakdown(data.giftBreakdown, data.giftStats);
  }
  if (Array.isArray(data.giftTransactions)) {
    cachedGiftTransactions = data.giftTransactions;
    renderGiftTransactions(data.giftTransactions);
  }
});

socket.on('tiktok_status', (data) => {
  handleTikTokStatusUpdate(data);
  if (typeof data.viewerCount === 'number') {
    updateViewerCountDisplay(data.viewerCount);
  }
});

socket.on('live:viewer_count', (data) => {
  if (data && typeof data.viewerCount === 'number') {
    updateViewerCountDisplay(data.viewerCount);
  }
});

socket.on('admin:event_log', (entry) => {
  addLog(entry.type, `[${entry.time}] ${entry.text}`);
});

socket.on('admin:traffic_status', (data) => {
  updateTrafficButton(data.active);
});

socket.on('admin:players_updated', (players) => {
  cachedPlayers = Array.isArray(players) ? players : [];
  renderPlayerTable(cachedPlayers);
  updateMetrics(cachedPlayers);
});

socket.on('admin:gift_breakdown_updated', (data) => {
  if (Array.isArray(data.breakdown)) {
    cachedGiftBreakdown = data.breakdown;
    renderGiftBreakdown(data.breakdown, data.stats);
  }
  if (Array.isArray(data.recentTransactions)) {
    cachedGiftTransactions = data.recentTransactions;
    renderGiftTransactions(data.recentTransactions);
  }
});

socket.on('live:session_reset', (data) => {
  cachedPlayers = [];
  cachedGiftBreakdown = [];
  cachedGiftTransactions = [];
  renderPlayerTable([]);
  renderGiftBreakdown([], null);
  renderGiftTransactions([]);
  updateMetrics([]);
  updateViewerCountDisplay(0);
  const channelMsg = data?.username ? ` cho phòng live @${data.username}` : '';
  addLog('status', `[RESET] Đã làm mới toàn bộ dữ liệu phiên live${channelMsg}.`);
});

// =========================================================================
// 2. TIKTOK CONNECTION CONTROLS
// =========================================================================

btnConnectTikTok.addEventListener('click', () => {
  const username = tiktokUsernameInput.value.trim().replace(/^@/, '');
  if (!username) {
    alert('Vui lòng nhập TikTok username!');
    return;
  }
  btnConnectTikTok.disabled = true;
  btnDisconnectTikTok.disabled = false;
  updateTikTokBadge('connecting', 'Đang kết nối...');
  socket.emit('admin:tiktok_connect', { username });
  addLog('status', `[CONNECTING] Đang thiết lập kết nối tới kênh @${username}...`);
});

btnDisconnectTikTok.addEventListener('click', () => {
  btnDisconnectTikTok.disabled = true;
  btnConnectTikTok.disabled = false;
  socket.emit('admin:tiktok_disconnect');
  updateTikTokBadge('disconnected', 'Đã dừng kết nối (Giữ nguyên dữ liệu)');
  updateViewerCountDisplay(0);
  addLog('status', '[STOPPED] Đã dừng hẳn phiên live. Toàn bộ dữ liệu khán giả và quà tặng được lưu giữ.');
});

if (btnQuickClearData) {
  btnQuickClearData.addEventListener('click', () => {
    if (confirm('BẠN CÓ CHẮC CHẮN MUỐN XÓA DỮ LIỆU CŨ?\nToàn bộ danh sách người xem, xu donate và quà sẽ được làm mới ngay!')) {
      socket.emit('admin:reset_session');
    }
  });
}

function handleTikTokStatusUpdate(data) {
  if (!data) return;
  if (typeof data.viewerCount === 'number') {
    updateViewerCountDisplay(data.viewerCount);
  }

  const isConnected = data.isConnected === true || data.status === 'connected';
  const isConnecting = data.isConnecting === true || data.status === 'connecting' || data.status === 'reconnecting';

  if (isConnected) {
    const channelName = data.username ? `@${data.username}` : '';
    const roomStr = data.roomId ? ` (Phòng: ${data.roomId})` : '';
    updateTikTokBadge('connected', `Đang Live: ${channelName}${roomStr}`);
    if (statTiktokStatus) statTiktokStatus.innerText = channelName || 'Đã kết nối';
    btnConnectTikTok.disabled = true;
    btnDisconnectTikTok.disabled = false;
  } else if (isConnecting) {
    updateTikTokBadge('connecting', data.message || 'Đang kết nối...');
    if (statTiktokStatus) statTiktokStatus.innerText = 'Đang kết nối...';
    btnConnectTikTok.disabled = true;
    btnDisconnectTikTok.disabled = false;
  } else {
    updateTikTokBadge('disconnected', data.message || 'Chưa kết nối');
    if (statTiktokStatus) statTiktokStatus.innerText = 'Chưa kết nối';
    btnConnectTikTok.disabled = false;
    btnDisconnectTikTok.disabled = true;
  }
}

function updateTikTokBadge(type, text) {
  if (!tiktokStatusBadge) return;
  tiktokStatusBadge.className = `status-badge ${type}`;
  tiktokStatusBadge.innerText = text;
}

// =========================================================================
// 3. EVENT LOG TERMINAL & FILTER TABS (OPTIMIZED DOM PRUNING)
// =========================================================================

filterTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    filterTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeLogFilter = tab.getAttribute('data-filter') || 'all';
    applyLogFilter();
  });
});

function addLog(type, text) {
  if (!eventLogList) return;
  const item = document.createElement('div');
  item.className = `log-item ${type}`;
  item.setAttribute('data-type', type);
  item.innerText = text;

  if (activeLogFilter !== 'all' && activeLogFilter !== type) {
    item.style.display = 'none';
  }

  eventLogList.appendChild(item);
  eventLogList.scrollTop = eventLogList.scrollHeight;

  // Prune old logs to avoid DOM memory leaks (keep max 100)
  if (eventLogList.children.length > 100) {
    eventLogList.removeChild(eventLogList.firstChild);
  }
}

function applyLogFilter() {
  const items = eventLogList.querySelectorAll('.log-item');
  items.forEach((item) => {
    const type = item.getAttribute('data-type');
    if (activeLogFilter === 'all' || activeLogFilter === type) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  });
}

btnClearLog.addEventListener('click', () => {
  if (eventLogList) eventLogList.innerHTML = '';
});

// =========================================================================
// 4. AUTHENTIC TIKTOK GIFTS PICKER & SIMULATOR
// =========================================================================

// Category Tab Filtering
if (giftCatTabs) {
  giftCatTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      giftCatTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const category = tab.getAttribute('data-cat') || 'all';

      giftCards.forEach((card) => {
        const cardCat = card.getAttribute('data-cat');
        if (category === 'all' || category === cardCat) {
          card.style.display = 'flex';
        } else {
          card.style.display = 'none';
        }
      });
    });
  });
}

// Gift Card Click Handler
if (giftCards) {
  giftCards.forEach((card) => {
    card.addEventListener('click', () => {
      giftCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');

      const name = card.getAttribute('data-gift');
      const diamonds = card.getAttribute('data-diamonds');
      const id = card.getAttribute('data-id') || 'gift';

      selectedGiftId = id;
      if (customGiftName) customGiftName.value = name;
      if (customGiftDiamonds) customGiftDiamonds.value = diamonds;
    });
  });
}

// Test Case Cốt Lõi: Nguyễn Văn A tặng 5 bông hoa = 5 Xu
btnQuickTestNguyễnVănA.addEventListener('click', () => {
  const payload = {
    userId: 'nguyenvana_01',
    nickname: 'Nguyễn Văn A',
    avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
    giftName: 'Hoa Hồng',
    diamondCount: 1,
    repeatCount: 5,
    repeatEnd: true,
    giftId: '5655',
    groupId: `test_${Date.now()}`
  };
  socket.emit('admin:simulate_gift', payload);
  addLog('gift', '[TEST CA] Nguyễn Văn A tặng 5 Hoa Hồng (Chuẩn 5 Xu)');
});

// Send Selected Gift with Streak
if (btnSendCustomGift) {
  btnSendCustomGift.addEventListener('click', () => {
    const name = customGiftName.value.trim() || 'Hoa Hồng';
    const diamonds = Math.max(1, Number(customGiftDiamonds.value) || 1);
    const selectedStreak = document.querySelector('input[name="simStreak"]:checked');
    const streak = selectedStreak ? Number(selectedStreak.value) : 1;
    const userId = simUserId.value.trim() || 'nguyenvana_01';
    const nickname = simNickname.value.trim() || 'Khán Giả';

    const payload = {
      userId,
      nickname,
      giftName: name,
      diamondCount: diamonds,
      repeatCount: streak,
      repeatEnd: true,
      giftId: selectedGiftId || 'gift',
      groupId: `sim_custom_${Date.now()}`
    };
    socket.emit('admin:simulate_gift', payload);
    addLog('gift', `[SIMULATOR] ${nickname} tặng ${name} x${streak} (${diamonds * streak} Xu)`);
  });
}

// Chat Simulation
btnSimChat.addEventListener('click', () => {
  const message = simComment.value.trim();
  if (!message) return;

  const payload = {
    userId: simUserId.value.trim() || 'user_test',
    nickname: simNickname.value.trim() || 'Người Xem',
    message
  };
  socket.emit('admin:simulate_chat', payload);
  addLog('chat', `[SIMULATOR] ${payload.nickname} bình luận: "${message}"`);
});

// Chat Chips quick fill
document.querySelectorAll('.chip-btn').forEach((chip) => {
  chip.addEventListener('click', () => {
    const text = chip.getAttribute('data-text');
    if (simComment) simComment.value = text;
    btnSimChat.click();
  });
});

// Like Simulation
document.querySelectorAll('.btn-like-count').forEach((btn) => {
  btn.addEventListener('click', () => {
    const count = Number(btn.getAttribute('data-count')) || 1;
    const payload = {
      userId: simUserId.value.trim() || 'user_test',
      nickname: simNickname.value.trim() || 'Người Xem',
      count
    };
    socket.emit('admin:simulate_like', payload);
    addLog('like', `[SIMULATOR] ${payload.nickname} thả ${count} tim`);
  });
});

// Viewer Leave Simulation ("Out Phòng Live" - subtracts viewer count, keeps coins & likes)
if (btnSimLeave) {
  btnSimLeave.addEventListener('click', () => {
    const userId = simUserId.value.trim() || 'nguyenvana_01';
    const nickname = simNickname.value.trim() || 'Người Xem';
    socket.emit('admin:simulate_leave', { userId, nickname });
  });
}

// Auto Traffic Toggle (15 Bots)
btnToggleTraffic.addEventListener('click', () => {
  isTrafficActive = !isTrafficActive;
  socket.emit('admin:simulate_traffic', { enable: isTrafficActive });
});

function updateTrafficButton(active) {
  isTrafficActive = active;
  if (active) {
    btnToggleTraffic.className = 'btn btn-sm btn-danger';
    btnToggleTraffic.innerText = 'Dừng Test Tải';
  } else {
    btnToggleTraffic.className = 'btn btn-sm btn-outline';
    btnToggleTraffic.innerText = 'Bật Test Tải';
  }
}

// Reset Session
btnResetSession.addEventListener('click', () => {
  if (confirm('BẠN CÓ CHẮC CHẮN MUỐN RESET TOÀN BỘ PHIÊN LIVE?\nToàn bộ xu, lượt tương tác và người xem cũ sẽ được làm mới!')) {
    socket.emit('admin:reset_session');
  }
});

// Refresh Data Buttons
if (btnHeaderRefresh) {
  btnHeaderRefresh.addEventListener('click', () => {
    socket.emit('admin:get_players');
    addLog('status', '[REFRESH] Đang làm mới dữ liệu hệ thống...');
  });
}

// =========================================================================
// 5. MAIN NAVIGATION DATA TABS (FAST VIEW SWITCHING)
// =========================================================================

if (dataTabButtons) {
  dataTabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      dataTabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const view = btn.getAttribute('data-view');
      if (view === 'all') {
        if (panelViewers) panelViewers.classList.remove('hidden');
        if (panelGiftAnalytics) panelGiftAnalytics.classList.remove('hidden');
        if (dataPanelsContainer) dataPanelsContainer.className = '';
      } else if (view === 'gifts') {
        if (panelGiftAnalytics) panelGiftAnalytics.classList.remove('hidden');
        if (panelViewers) panelViewers.classList.add('hidden');
        if (dataPanelsContainer) dataPanelsContainer.className = '';
      } else if (view === 'viewers') {
        if (panelGiftAnalytics) panelGiftAnalytics.classList.add('hidden');
        if (panelViewers) panelViewers.classList.remove('hidden');
        if (dataPanelsContainer) dataPanelsContainer.className = '';
      } else if (view === 'split') {
        if (panelGiftAnalytics) panelGiftAnalytics.classList.remove('hidden');
        if (panelViewers) panelViewers.classList.remove('hidden');
        if (dataPanelsContainer) dataPanelsContainer.className = 'split-view-active';
      }
    });
  });
}

// =========================================================================
// 6. ALL-TIME VIEWER STATISTICS & DONATION LEADERBOARD TABLE
// =========================================================================

function updateMetrics(players) {
  if (!Array.isArray(players)) return;
  // Active interactive viewers currently in the live room (decreases when a viewer leaves)
  const onlineCount = players.filter((p) => p.isOnline !== false).length;
  const offlineCount = players.length - onlineCount;
  const totalCount = players.length;
  const donorCount = players.filter((p) => (Number(p.coins) || 0) > 0).length;

  // Total donated coins, likes & chats across the entire session (NEVER subtracted when a viewer leaves!)
  const totalCoins = players.reduce((sum, p) => sum + (Number(p.coins) || 0), 0);
  const totalLikes = players.reduce((sum, p) => sum + (Number(p.likes) || 0), 0);
  const totalChats = players.reduce((sum, p) => sum + (Number(p.chatsCount) || 0), 0);

  // Top 1 Donor
  const sortedByCoins = [...players].sort((a, b) => {
    if ((Number(b.coins) || 0) !== (Number(a.coins) || 0)) return (Number(b.coins) || 0) - (Number(a.coins) || 0);
    return (Number(b.likes) || 0) - (Number(a.likes) || 0);
  });
  const top1 = sortedByCoins[0];

  // Top Header Metrics
  if (statPlayerCount) {
    statPlayerCount.innerText = `${onlineCount} người`;
    statPlayerCount.title = `${onlineCount} đang trong phòng / ${totalCount} tổng người đã tương tác từ lúc Live`;
  }
  if (statTotalCoins) statTotalCoins.innerText = `${totalCoins.toLocaleString('vi-VN')} Xu`;
  if (statTotalLikes) statTotalLikes.innerText = `${totalLikes.toLocaleString('vi-VN')} Tim`;
  if (playerCountBadge) playerCountBadge.innerText = `${onlineCount} trong phòng / ${totalCount} tổng từ lúc Live`;
  if (tabViewerBadge) tabViewerBadge.innerText = `${totalCount} tổng (${onlineCount} online)`;

  // 5 Viewer Analytics Summary Cards
  if (valViewerTotal) valViewerTotal.innerText = `${totalCount.toLocaleString('vi-VN')} người`;
  if (valViewerOnlineSplit) valViewerOnlineSplit.innerText = `${onlineCount} đang xem • ${offlineCount} đã out`;
  if (valViewerDonors) valViewerDonors.innerText = `${donorCount.toLocaleString('vi-VN')} người (${totalCoins.toLocaleString('vi-VN')} Xu)`;
  if (valViewerTop1) {
    if (top1 && (Number(top1.coins) || 0) > 0) {
      valViewerTop1.innerText = `${top1.nickname} (${Number(top1.coins).toLocaleString('vi-VN')} Xu)`;
      valViewerTop1.title = `Hạng 1: ${top1.nickname} - ${top1.coins} Xu, ${top1.likes || 0} Tim`;
    } else if (top1) {
      valViewerTop1.innerText = `${top1.nickname} (0 Xu)`;
    } else {
      valViewerTop1.innerText = 'Chưa có';
    }
  }
  if (valViewerEngagement) {
    valViewerEngagement.innerText = `${totalChats.toLocaleString('vi-VN')} Chat • ${totalLikes.toLocaleString('vi-VN')} Tim`;
  }

  // Filter Badge Counts
  if (countFilterAll) countFilterAll.innerText = totalCount;
  if (countFilterDonors) countFilterDonors.innerText = donorCount;
  if (countFilterOnline) countFilterOnline.innerText = onlineCount;
  if (countFilterOffline) countFilterOffline.innerText = offlineCount;
}

// Viewer Filter Tabs (All / Donors / Online / Offline)
if (viewerFilterTabs) {
  viewerFilterTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      viewerFilterTabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      activeViewerFilter = tab.getAttribute('data-vfilter') || 'all';
      renderPlayerTable(cachedPlayers);
    });
  });
}

// Sort Select (Default: Coins Descending)
if (playerSortSelect) {
  playerSortSelect.addEventListener('change', () => {
    activeViewerSort = playerSortSelect.value || 'coins';
    renderPlayerTable(cachedPlayers);
  });
}

// Instant Fast Search
let searchTimeout = null;
playerSearchInput.addEventListener('input', () => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    renderPlayerTable(cachedPlayers);
  }, 100);
});

btnRefreshPlayers.addEventListener('click', () => {
  socket.emit('admin:get_players');
  addLog('status', '[REFRESH] Đang làm mới bảng thống kê khán giả...');
});

function renderPlayerTable(players) {
  if (!playerTableBody) return;
  const sourceList = Array.isArray(players) ? players : [];

  // 1. Compute canonical rank by donated coins across ALL session viewers
  const totalSessionCoins = sourceList.reduce((sum, p) => sum + (Number(p.coins) || 0), 0);
  const canonicalSorted = [...sourceList].sort((a, b) => {
    const cA = Number(a.coins) || 0;
    const cB = Number(b.coins) || 0;
    if (cB !== cA) return cB - cA;
    const lA = Number(a.likes) || 0;
    const lB = Number(b.likes) || 0;
    if (lB !== lA) return lB - lA;
    const chA = Number(a.chatsCount) || 0;
    const chB = Number(b.chatsCount) || 0;
    if (chB !== chA) return chB - chA;
    return new Date(b.lastActiveAt || 0) - new Date(a.lastActiveAt || 0);
  });

  const enriched = canonicalSorted.map((p, idx) => {
    const coins = Number(p.coins) || 0;
    const pct = totalSessionCoins > 0 ? Number(((coins / totalSessionCoins) * 100).toFixed(1)) : 0;
    return {
      ...p,
      rank: idx + 1,
      coinPercentage: pct
    };
  });

  // 2. Apply Status / Donor Filter
  let filtered = enriched.filter((p) => {
    if (activeViewerFilter === 'donors') return (Number(p.coins) || 0) > 0;
    if (activeViewerFilter === 'online') return p.isOnline !== false;
    if (activeViewerFilter === 'offline') return p.isOnline === false;
    return true;
  });

  // 3. Apply Search Query
  const query = playerSearchInput ? playerSearchInput.value.trim().toLowerCase() : '';
  if (query) {
    filtered = filtered.filter(
      (p) =>
        (p.nickname && p.nickname.toLowerCase().includes(query)) ||
        (p.userId && p.userId.toLowerCase().includes(query))
    );
  }

  // 4. Apply Sort Selection (Default: 'coins' -> sorted descending by donated coins)
  if (activeViewerSort === 'likes') {
    filtered.sort((a, b) => (Number(b.likes) || 0) - (Number(a.likes) || 0) || a.rank - b.rank);
  } else if (activeViewerSort === 'chats') {
    filtered.sort((a, b) => (Number(b.chatsCount) || 0) - (Number(a.chatsCount) || 0) || a.rank - b.rank);
  } else if (activeViewerSort === 'recent') {
    filtered.sort((a, b) => new Date(b.lastActiveAt || 0) - new Date(a.lastActiveAt || 0));
  } else {
    // Strictly sorted by Donated Coins descending (canonical rank)
    filtered.sort((a, b) => a.rank - b.rank);
  }

  if (filtered.length === 0) {
    playerTableBody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding: 30px; color: #94a3b8;">Không có khán giả nào khớp với bộ lọc hiện tại.</td></tr>`;
    return;
  }

  playerTableBody.innerHTML = '';

  filtered.forEach((player) => {
    const tr = document.createElement('tr');

    const safeNick = escapeHtml(player.nickname || 'Khán Giả');
    const safeUserId = escapeHtml(player.userId || 'N/A');
    const safeInitial = safeNick.charAt(0).toUpperCase();
    const joinedFormatted = player.createdAt ? new Date(player.createdAt).toLocaleTimeString('vi-VN') : '-';
    const lastActiveFormatted = player.lastActiveAt ? new Date(player.lastActiveAt).toLocaleTimeString('vi-VN') : 'Vừa xong';
    const safeLastMsg = escapeHtml(player.lastMessage || '-');

    const rank = player.rank || 1;
    let rankBadgeClass = '';
    let rankIconHtml = '';
    if (rank === 1) {
      rankBadgeClass = 'top-1';
      rankIconHtml = `<svg class="svg-icon sm"><use href="#icon-crown"/></svg>`;
    } else if (rank === 2) {
      rankBadgeClass = 'top-2';
    } else if (rank === 3) {
      rankBadgeClass = 'top-3';
    }

    const isOnline = player.isOnline !== false;
    const statusBadgeHtml = isOnline
      ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3);">● Đang xem</span>`
      : `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;background:rgba(148,163,184,0.12);color:#94a3b8;border:1px solid rgba(148,163,184,0.25);" title="Đã rời phòng nhưng vẫn giữ nguyên 100% Xu & Tim">○ Đã out phòng</span>`;

    if (!isOnline) {
      tr.style.opacity = '0.82';
    }

    const avatarHtml = player.avatarUrl
      ? `<img src="${player.avatarUrl}" class="table-avatar-img" onerror="this.outerHTML='<div class=\\'table-avatar-fallback\\'>${safeInitial}</div>'" alt="Avatar" />`
      : `<div class="table-avatar-fallback">${safeInitial}</div>`;

    const coins = Number(player.coins) || 0;
    const pct = player.coinPercentage || 0;
    const barWidth = coins > 0 ? Math.min(100, Math.max(4, pct)) : 0;

    tr.innerHTML = `
      <td>
        <span class="rank-badge ${rankBadgeClass}">
          ${rankIconHtml} #${rank}
        </span>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 10px;">
          ${avatarHtml}
          <div>
            <div style="font-weight: 800; color: #f8fafc;">${safeNick}</div>
            <code style="color: #64748b; font-size: 11px;">@${safeUserId}</code>
          </div>
        </div>
      </td>
      <td>${statusBadgeHtml}</td>
      <td>
        <span style="color: #fbbf24; font-weight: 800; font-size: 14px; display: inline-flex; align-items: center; gap: 5px;">
          <svg class="svg-icon sm"><use href="#icon-coins"/></svg> ${coins.toLocaleString('vi-VN')} Xu
        </span>
      </td>
      <td>
        <div class="revenue-bar-wrap">
          <div class="revenue-bar-bg">
            <div class="revenue-bar-fill" style="width: ${barWidth}%;"></div>
          </div>
          <span class="revenue-pct-text">${pct}%</span>
        </div>
      </td>
      <td>
        <span style="color: #fb7185; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
          <svg class="svg-icon sm"><use href="#icon-heart"/></svg> ${(Number(player.likes) || 0).toLocaleString('vi-VN')}
        </span>
      </td>
      <td>
        <span style="color: #38bdf8; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
          <svg class="svg-icon sm"><use href="#icon-message"/></svg> ${(Number(player.chatsCount) || 0).toLocaleString('vi-VN')}
        </span>
      </td>
      <td style="max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: #cbd5e1;" title="${safeLastMsg}">${safeLastMsg}</td>
      <td style="color: #94a3b8; font-size: 11px;">
        <div>Vào: <span style="color:#cbd5e1;">${joinedFormatted}</span></div>
        <div>Cuối: <span style="color:#94a3b8;">${lastActiveFormatted}</span></div>
      </td>
      <td>
        <div class="action-btn-group">
          <button class="btn btn-sm btn-outline btn-add-coins" data-id="${player.userId}" title="Cộng 10 Xu">+10 Xu</button>
          ${isOnline ? `<button class="btn btn-sm btn-outline btn-leave-player" data-id="${player.userId}" title="Đánh dấu rời phòng live (Trừ 1 khán giả đang xem nhưng giữ nguyên Xu & Tim)">Out phòng</button>` : ''}
          <button class="btn btn-sm btn-outline-danger btn-del-player" data-id="${player.userId}" title="Xóa vĩnh viễn bản ghi">
            <svg class="svg-icon sm"><use href="#icon-x"/></svg>
          </button>
        </div>
      </td>
    `;

    playerTableBody.appendChild(tr);
  });
}

// Delegated Table Actions
if (playerTableBody) {
  playerTableBody.addEventListener('click', (e) => {
    const btnAddCoins = e.target.closest('.btn-add-coins');
    const btnLeave = e.target.closest('.btn-leave-player');
    const btnDel = e.target.closest('.btn-del-player');

    if (btnAddCoins) {
      const userId = btnAddCoins.getAttribute('data-id');
      socket.emit('admin:modify_coins', { userId, delta: 10 });
      addLog('gift', `[COINS] Đã cộng +10 Xu thủ công cho User ID: ${userId}`);
    } else if (btnLeave) {
      const userId = btnLeave.getAttribute('data-id');
      socket.emit('admin:player_leave', { userId });
    } else if (btnDel) {
      const userId = btnDel.getAttribute('data-id');
      if (confirm(`Bạn có chắc muốn xóa hẳn bản ghi khán giả ${userId}? (Nếu chỉ muốn đánh dấu rời phòng mà giữ nguyên Xu/Tim, hãy bấm "Out phòng")`)) {
        socket.emit('admin:delete_player', { userId });
        addLog('status', `[DELETE] Đã xóa khán giả User ID: ${userId}`);
      }
    }
  });
}

// =========================================================================
// 7. SIMPLE VECTOR ICON MAPPING FOR GIFTS & ANALYTICS
// =========================================================================

function getGiftIconId(name = '') {
  const lower = name.toLowerCase();
  if (lower.includes('hoa hồng') || lower.includes('rose') || lower.includes('tim') || lower.includes('finger heart')) return 'icon-heart';
  if (lower.includes('vương miện') || lower.includes('crown') || lower.includes('sư tử') || lower.includes('vũ trụ') || lower.includes('lâu đài') || lower.includes('rồng') || lower.includes('chim ưng') || lower.includes('kỳ lân')) return 'icon-crown';
  if (lower.includes('xe') || lower.includes('tên lửa') || lower.includes('rocket')) return 'icon-zap';
  if (lower.includes('nước hoa') || lower.includes('thiên nga') || lower.includes('pháo hoa') || lower.includes('cá voi') || lower.includes('mũ')) return 'icon-star';
  return 'icon-gift';
}

function renderGiftBreakdown(breakdown, stats) {
  if (!giftTableBody) return;

  // 1. Update Metrics Cards
  const totalTypes = stats?.totalTypes ?? (Array.isArray(breakdown) ? breakdown.length : 0);
  const totalUnits = stats?.totalUnits ?? (Array.isArray(breakdown) ? breakdown.reduce((acc, g) => acc + g.totalCount, 0) : 0);
  const totalCoins = stats?.totalCoins ?? (Array.isArray(breakdown) ? breakdown.reduce((acc, g) => acc + g.totalCoins, 0) : 0);

  if (valGiftTypes) valGiftTypes.innerText = `${totalTypes} loại`;
  if (valGiftUnits) valGiftUnits.innerText = `${totalUnits.toLocaleString('vi-VN')} món`;
  if (valGiftCoins) valGiftCoins.innerText = `${totalCoins.toLocaleString('vi-VN')} Xu`;

  if (valGiftPopular) {
    if (stats?.mostPopular?.giftName && stats.mostPopular.totalCount > 0) {
      valGiftPopular.innerText = `${stats.mostPopular.giftName} (${stats.mostPopular.totalCount})`;
      valGiftPopular.title = `${stats.mostPopular.giftName} (Tổng: ${stats.mostPopular.totalCount} món)`;
    } else {
      valGiftPopular.innerText = 'Chưa có';
    }
  }

  if (valGiftTopRevenue) {
    if (stats?.topRevenue?.giftName && stats.topRevenue.totalCoins > 0) {
      valGiftTopRevenue.innerText = `${stats.topRevenue.giftName} (${stats.topRevenue.totalCoins} Xu)`;
      valGiftTopRevenue.title = `${stats.topRevenue.giftName} (Tổng: ${stats.topRevenue.totalCoins} Xu)`;
    } else {
      valGiftTopRevenue.innerText = 'Chưa có';
    }
  }

  const badgeText = `${totalTypes} loại quà • ${totalCoins.toLocaleString('vi-VN')} Xu`;
  if (giftTotalBadge) giftTotalBadge.innerText = badgeText;
  if (tabGiftBadge) tabGiftBadge.innerText = badgeText;

  // 2. Render Table Rows
  if (!Array.isArray(breakdown) || breakdown.length === 0) {
    giftTableBody.innerHTML = `<tr><td colspan="7" class="text-center" style="padding: 24px; color: #94a3b8;">Chưa có dữ liệu quà tặng trong phiên này. Hãy tặng quà hoặc dùng bộ giả lập để xem số liệu!</td></tr>`;
    return;
  }

  giftTableBody.innerHTML = '';

  breakdown.forEach((item) => {
    const tr = document.createElement('tr');
    const safeName = escapeHtml(item.giftName);
    const iconId = getGiftIconId(item.giftName);
    const svgHtml = `<svg class="svg-icon"><use href="#${iconId}"/></svg>`;

    const iconHtml = item.giftPictureUrl
      ? `<img src="${item.giftPictureUrl}" class="gift-icon-img" onerror="this.outerHTML='<div class=\\'gift-icon-fallback\\'>${svgHtml}</div>'" alt="${safeName}" />`
      : `<div class="gift-icon-fallback">${svgHtml}</div>`;

    const donorHtml = item.topDonor
      ? `<div class="donor-badge">
           ${item.topDonor.avatarUrl ? `<img src="${item.topDonor.avatarUrl}" class="donor-badge-avatar" onerror="this.style.display='none'">` : '<svg class="svg-icon sm" style="color:#fbbf24;"><use href="#icon-crown"/></svg>'}
           <strong>${escapeHtml(item.topDonor.nickname)}</strong>
           <span style="color: #94a3b8;">(${item.topDonor.count} món • ${item.topDonor.coins} Xu)</span>
         </div>`
      : `<span style="color: #64748b;">-</span>`;

    tr.innerHTML = `
      <td>${iconHtml}</td>
      <td><strong>${safeName}</strong></td>
      <td><span style="color: #f59e0b; font-weight: 700;">${item.diamondCount} Xu</span></td>
      <td><span style="color: #38bdf8; font-weight: 800;">${item.totalCount.toLocaleString('vi-VN')}</span></td>
      <td><span style="color: #fbbf24; font-weight: 800;">${item.totalCoins.toLocaleString('vi-VN')} Xu</span></td>
      <td>
        <div class="revenue-bar-wrap">
          <div class="revenue-bar-bg">
            <div class="revenue-bar-fill" style="width: ${Math.min(100, Math.max(2, item.percentage))}%;"></div>
          </div>
          <span class="revenue-pct-text">${item.percentage}%</span>
        </div>
      </td>
      <td>${donorHtml}</td>
    `;

    giftTableBody.appendChild(tr);
  });
}

function renderGiftTransactions(transactions) {
  if (!giftTxTableBody) return;
  if (!Array.isArray(transactions) || transactions.length === 0) {
    giftTxTableBody.innerHTML = `<tr><td colspan="5" class="text-center" style="padding: 24px; color: #94a3b8;">Chưa có giao dịch quà tặng nào trong phiên này.</td></tr>`;
    return;
  }

  giftTxTableBody.innerHTML = '';

  transactions.forEach((tx) => {
    const tr = document.createElement('tr');
    const safeNick = escapeHtml(tx.nickname || 'Khán Giả');
    const safeUserId = escapeHtml(tx.userId || '');
    const safeGiftName = escapeHtml(tx.giftName || 'Món Quà');
    const iconId = getGiftIconId(tx.giftName);
    const svgHtml = `<svg class="svg-icon sm" style="color:#fbbf24;"><use href="#${iconId}"/></svg>`;
    const timeFormatted = tx.timeFormatted || (tx.timestamp ? new Date(tx.timestamp).toLocaleTimeString('vi-VN') : 'Vừa xong');

    const avatarHtml = tx.avatarUrl
      ? `<img src="${tx.avatarUrl}" class="table-avatar-img" onerror="this.outerHTML='<span class=\\'donor-badge\\'><svg class=\\'svg-icon sm\\'><use href=\\'#icon-user\\'/></svg></span>'" alt="" />`
      : `<span style="color: #94a3b8;"><svg class="svg-icon sm"><use href="#icon-user"/></svg></span>`;

    const giftIconHtml = tx.giftPictureUrl
      ? `<img src="${tx.giftPictureUrl}" class="gift-icon-img" onerror="this.outerHTML='<span>${svgHtml}</span>'" alt="" />`
      : `<span>${svgHtml}</span>`;

    tr.innerHTML = `
      <td style="color: #94a3b8; font-size: 12px; font-family: monospace;">${timeFormatted}</td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${avatarHtml}
          <div>
            <strong>${safeNick}</strong>
            <div style="font-size: 10px; color: #64748b;">${safeUserId}</div>
          </div>
        </div>
      </td>
      <td>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${giftIconHtml}
          <strong>${safeGiftName}</strong>
          <span style="font-size: 11px; color: #94a3b8;">(${tx.diamondCount} Xu)</span>
        </div>
      </td>
      <td><span style="color: #38bdf8; font-weight: 800; font-size: 14px;">+${tx.count}</span></td>
      <td><span style="color: #fbbf24; font-weight: 800; font-size: 14px;">+${tx.deltaCoins} Xu</span></td>
    `;

    giftTxTableBody.appendChild(tr);
  });
}

// Sub-tabs Toggle Logic
if (giftSubtabs) {
  giftSubtabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      giftSubtabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      const subtab = tab.getAttribute('data-subtab');
      if (subtab === 'summary') {
        if (tabGiftSummary) tabGiftSummary.style.display = 'block';
        if (tabGiftStream) tabGiftStream.style.display = 'none';
      } else {
        if (tabGiftSummary) tabGiftSummary.style.display = 'none';
        if (tabGiftStream) tabGiftStream.style.display = 'block';
      }
    });
  });
}

// Clear Gifts Button Logic
if (btnClearGifts) {
  btnClearGifts.addEventListener('click', () => {
    if (confirm('Bạn có chắc chắn muốn xóa và làm mới toàn bộ bảng kê chi tiết quà tặng?')) {
      socket.emit('admin:clear_gifts');
    }
  });
}
