import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const SESSION_FILE = path.join(DATA_DIR, 'session.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Basic bad words filter
const BLOCKED_WORDS = [
  'fuck', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'scam', 'dm', 'clm', 'vcl', 'dkm', 'đkm', 'đụ', 'lồn', 'cặc', 'chửi'
];

function sanitizeMessage(msg) {
  if (!msg || typeof msg !== 'string') return '';
  let cleaned = msg.trim().slice(0, 100);
  for (const word of BLOCKED_WORDS) {
    const reg = new RegExp(`\\b${word}\\b|${word}`, 'gi');
    cleaned = cleaned.replace(reg, '***');
  }
  return cleaned;
}

class StateManager {
  constructor() {
    this.players = new Map(); // userId -> Player
    this.giftSummary = new Map(); // giftName -> GiftSummaryItem
    this.giftTransactions = []; // Recent individual gift events
    this.saveTimeout = null;
    this.loadSession();
  }

  /**
   * Get or create player. When interacting, player is marked as online (in room).
   */
  getOrCreatePlayer(userId, nickname, avatarUrl = '', markOnline = true) {
    if (!userId) {
      userId = `guest_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    }
    const cleanId = String(userId);
    let player = this.players.get(cleanId);

    if (!player) {
      player = {
        userId: cleanId,
        nickname: nickname || `Khán Giả_${cleanId.slice(-4)}`,
        avatarUrl: avatarUrl || '',
        coins: 0,
        likes: 0,
        chatsCount: 0,
        lastMessage: '',
        isOnline: markOnline,
        leftAt: null,
        createdAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString()
      };
      this.players.set(cleanId, player);
      this.scheduleSave();
    } else {
      if (nickname && nickname !== player.nickname) {
        player.nickname = nickname;
      }
      if (avatarUrl && avatarUrl !== player.avatarUrl) {
        player.avatarUrl = avatarUrl;
      }
      if (markOnline) {
        player.isOnline = true;
        player.leftAt = null;
        player.lastActiveAt = new Date().toISOString();
      }
    }
    return player;
  }

  /**
   * Add coins to player when receiving gifts
   */
  addCoins(userId, nickname, avatarUrl, amount) {
    const delta = Math.max(0, Number(amount) || 0);
    if (delta <= 0) return null;

    const player = this.getOrCreatePlayer(userId, nickname, avatarUrl, true);
    player.coins += delta;
    player.lastActiveAt = new Date().toISOString();

    const topPlayers = this.getTopPlayers(1);
    const isTop1 = topPlayers.length > 0 && topPlayers[0].userId === player.userId && player.coins > 0;

    this.scheduleSave();

    return {
      player,
      deltaCoins: delta,
      isTop1
    };
  }

  /**
   * Add likes to player
   */
  addLikes(userId, nickname, avatarUrl, count = 1) {
    const delta = Math.max(1, Number(count) || 1);
    const player = this.getOrCreatePlayer(userId, nickname, avatarUrl, true);
    player.likes += delta;
    player.lastActiveAt = new Date().toISOString();

    this.scheduleSave();

    return {
      player,
      deltaLikes: delta
    };
  }

  /**
   * Record chat from player
   */
  recordChat(userId, nickname, avatarUrl, rawMessage) {
    const player = this.getOrCreatePlayer(userId, nickname, avatarUrl, true);
    const cleanMessage = sanitizeMessage(rawMessage);
    player.chatsCount = (player.chatsCount || 0) + 1;
    player.lastMessage = cleanMessage;
    player.lastActiveAt = new Date().toISOString();

    this.scheduleSave();

    return {
      player,
      message: cleanMessage
    };
  }

  /**
   * Mark a player as having left the live room (out phòng live).
   * Decreases active interactive viewer count, while preserving 100% of their coins, likes, and chat history.
   */
  setPlayerOffline(userId) {
    const player = this.players.get(String(userId));
    if (!player) return null;
    const wasOnline = player.isOnline !== false;
    player.isOnline = false;
    player.leftAt = new Date().toISOString();
    this.scheduleSave();
    return { player, wasOnline };
  }

  /**
   * Mark a player as back online in the room
   */
  setPlayerOnline(userId, nickname, avatarUrl) {
    const player = this.getOrCreatePlayer(userId, nickname, avatarUrl, true);
    this.scheduleSave();
    return player;
  }

  /**
   * Sync online interactive players with live room viewer count & inactivity timeout.
   * Viewers who leave the stream are marked isOnline = false while keeping all their coins & likes intact.
   */
  syncWithRoomViewers(viewerCount, activeUserIds = [], inactivityMs = 180000) {
    const now = Date.now();
    const activeSet = new Set(activeUserIds.map(id => String(id)));
    const leftPlayers = [];

    // 1. Check players who exceeded inactivity timeout and are not in active rank list
    for (const player of this.players.values()) {
      if (player.isOnline === false) continue;
      if (activeSet.has(player.userId)) {
        player.lastActiveAt = new Date().toISOString();
        continue;
      }
      const lastActive = new Date(player.lastActiveAt).getTime() || 0;
      if (inactivityMs > 0 && now - lastActive > inactivityMs) {
        player.isOnline = false;
        player.leftAt = new Date().toISOString();
        leftPlayers.push(player);
      }
    }

    // 2. If room viewerCount dropped below current online interactive count,
    // mark the oldest-inactive online players as having left the room
    const onlineList = this.getOnlinePlayers();
    if (typeof viewerCount === 'number' && viewerCount >= 0 && onlineList.length > viewerCount) {
      const excessCount = onlineList.length - viewerCount;
      // Sort online players by oldest activity first (excluding those explicitly in activeSet)
      const candidates = onlineList
        .filter(p => !activeSet.has(p.userId))
        .sort((a, b) => new Date(a.lastActiveAt) - new Date(b.lastActiveAt));

      for (let i = 0; i < Math.min(excessCount, candidates.length); i++) {
        const p = candidates[i];
        p.isOnline = false;
        p.leftAt = new Date().toISOString();
        leftPlayers.push(p);
      }
    }

    if (leftPlayers.length > 0) {
      this.scheduleSave();
    }

    return leftPlayers;
  }

  /**
   * Get count of interactive viewers currently in the live room (isOnline !== false)
   */
  getOnlineCount() {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.isOnline !== false) count++;
    }
    return count;
  }

  /**
   * Get list of interactive viewers currently in the live room
   */
  getOnlinePlayers() {
    return Array.from(this.players.values())
      .filter(p => p.isOnline !== false)
      .sort((a, b) => {
        if (b.coins !== a.coins) return b.coins - a.coins;
        if (b.likes !== a.likes) return b.likes - a.likes;
        return new Date(b.lastActiveAt) - new Date(a.lastActiveAt);
      });
  }

  /**
   * Get session totals:
   * - onlineCount: only viewers currently in the room
   * - totalHistoricalCount: all viewers who ever interacted
   * - totalCoins: sum of ALL coins (including viewers who left the room)
   * - totalLikes: sum of ALL likes (including viewers who left the room)
   */
  getSessionTotals() {
    let onlineCount = 0;
    let offlineCount = 0;
    let donorCount = 0;
    let totalCoins = 0;
    let totalLikes = 0;
    let totalChats = 0;

    for (const p of this.players.values()) {
      if (p.isOnline !== false) {
        onlineCount++;
      } else {
        offlineCount++;
      }
      if ((Number(p.coins) || 0) > 0) {
        donorCount++;
      }
      totalCoins += Number(p.coins) || 0;
      totalLikes += Number(p.likes) || 0;
      totalChats += Number(p.chatsCount) || 0;
    }

    return {
      onlineCount,
      offlineCount,
      donorCount,
      totalHistoricalCount: this.players.size,
      totalCoins,
      totalLikes,
      totalChats
    };
  }

  /**
   * Get sorted leaderboard (sorted by coins, then likes, then chats - includes all donors even if offline)
   */
  getTopPlayers(limit = 10) {
    return this.getAllPlayers().slice(0, limit);
  }

  /**
   * Get all viewers who have interacted since connecting to the live stream,
   * strictly sorted descending by donated coins (coins -> likes -> chatsCount -> lastActiveAt)
   * with rank (#1, #2, ...) and coin contribution percentage.
   */
  getAllPlayers() {
    let totalCoins = 0;
    for (const p of this.players.values()) {
      totalCoins += Number(p.coins) || 0;
    }

    return Array.from(this.players.values())
      .sort((a, b) => {
        const coinsA = Number(a.coins) || 0;
        const coinsB = Number(b.coins) || 0;
        if (coinsB !== coinsA) return coinsB - coinsA;

        const likesA = Number(a.likes) || 0;
        const likesB = Number(b.likes) || 0;
        if (likesB !== likesA) return likesB - likesA;

        const chatsA = Number(a.chatsCount) || 0;
        const chatsB = Number(b.chatsCount) || 0;
        if (chatsB !== chatsA) return chatsB - chatsA;

        return new Date(b.lastActiveAt) - new Date(a.lastActiveAt);
      })
      .map((p, index) => ({
        ...p,
        rank: index + 1,
        coinPercentage: totalCoins > 0 ? Number((((Number(p.coins) || 0) / totalCoins) * 100).toFixed(1)) : 0
      }));
  }

  getPlayer(userId) {
    return this.players.get(String(userId)) || null;
  }

  modifyCoins(userId, delta) {
    const player = this.players.get(String(userId));
    if (!player) return null;
    player.coins = Math.max(0, player.coins + Number(delta));
    player.lastActiveAt = new Date().toISOString();
    this.scheduleSave();
    return { player, deltaCoins: Number(delta) };
  }

  deletePlayer(userId) {
    const deleted = this.players.delete(String(userId));
    if (deleted) {
      this.scheduleSave();
    }
    return deleted;
  }

  /**
   * =========================================================================
   * GIFT INVENTORY & DETAILED DONATION TRACKING
   * =========================================================================
   */

  recordGift(giftData) {
    if (!giftData) return null;

    const userId = String(giftData.userId || `guest_${Date.now()}`);
    const nickname = giftData.nickname || 'Khán Giả';
    const avatarUrl = giftData.avatarUrl || '';
    const giftId = String(giftData.giftId || 'gift');
    const giftName = String(giftData.giftName || 'Món Quà').trim();
    const giftPictureUrl = giftData.giftPictureUrl || '';
    const diamondCount = Math.max(1, Number(giftData.diamondCount) || 1);

    const count = Math.max(1, Number(giftData.count) || Math.round((Number(giftData.deltaCoins) || diamondCount) / diamondCount) || 1);
    const deltaCoins = Math.max(1, Number(giftData.deltaCoins) || (count * diamondCount));
    const timestamp = giftData.timestamp || new Date().toISOString();

    // 1. Update Per-Gift Summary Item
    let item = this.giftSummary.get(giftName);
    if (!item) {
      item = {
        giftId,
        giftName,
        giftPictureUrl,
        diamondCount,
        totalCount: 0,
        totalCoins: 0,
        donors: new Map()
      };
      this.giftSummary.set(giftName, item);
    }

    item.totalCount += count;
    item.totalCoins += deltaCoins;
    if (giftPictureUrl && !item.giftPictureUrl) {
      item.giftPictureUrl = giftPictureUrl;
    }
    if (diamondCount > item.diamondCount) {
      item.diamondCount = diamondCount;
    }

    // Update donor ranking for this specific gift
    let donor = item.donors.get(userId);
    if (!donor) {
      donor = {
        userId,
        nickname,
        avatarUrl,
        count: 0,
        coins: 0
      };
      item.donors.set(userId, donor);
    }
    donor.count += count;
    donor.coins += deltaCoins;
    if (nickname) donor.nickname = nickname;
    if (avatarUrl) donor.avatarUrl = avatarUrl;

    // 2. Add to Gift Transactions Log (Keep last 200)
    const tx = {
      id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp,
      timeFormatted: new Date(timestamp).toLocaleTimeString('vi-VN'),
      userId,
      nickname,
      avatarUrl,
      giftId,
      giftName,
      giftPictureUrl: giftPictureUrl || item.giftPictureUrl || '',
      diamondCount,
      count,
      deltaCoins
    };

    this.giftTransactions.unshift(tx);
    if (this.giftTransactions.length > 200) {
      this.giftTransactions.length = 200;
    }

    this.scheduleSave();

    return {
      transaction: tx,
      summary: this.getGiftSummaryItem(giftName),
      stats: this.getGiftStats()
    };
  }

  getGiftSummaryItem(giftName) {
    const item = this.giftSummary.get(giftName);
    if (!item) return null;

    let topDonor = null;
    let maxCoins = -1;
    for (const donor of item.donors.values()) {
      if (donor.coins > maxCoins) {
        maxCoins = donor.coins;
        topDonor = { ...donor };
      }
    }

    return {
      giftId: item.giftId,
      giftName: item.giftName,
      giftPictureUrl: item.giftPictureUrl,
      diamondCount: item.diamondCount,
      totalCount: item.totalCount,
      totalCoins: item.totalCoins,
      donorCount: item.donors.size,
      topDonor
    };
  }

  getGiftBreakdown() {
    const list = [];
    let grandTotalCoins = 0;

    for (const [name] of this.giftSummary.entries()) {
      const summary = this.getGiftSummaryItem(name);
      if (summary) {
        grandTotalCoins += summary.totalCoins;
        list.push(summary);
      }
    }

    list.sort((a, b) => {
      if (b.totalCoins !== a.totalCoins) return b.totalCoins - a.totalCoins;
      return b.totalCount - a.totalCount;
    });

    return list.map(item => ({
      ...item,
      percentage: grandTotalCoins > 0 ? Math.round((item.totalCoins / grandTotalCoins) * 100) : 0
    }));
  }

  getGiftStats() {
    let totalTypes = this.giftSummary.size;
    let totalUnits = 0;
    let totalCoins = 0;
    let mostPopular = null;
    let topRevenue = null;

    for (const [name] of this.giftSummary.entries()) {
      const item = this.getGiftSummaryItem(name);
      if (!item) continue;
      totalUnits += item.totalCount;
      totalCoins += item.totalCoins;

      if (!mostPopular || item.totalCount > mostPopular.totalCount) {
        mostPopular = { giftName: item.giftName, totalCount: item.totalCount, giftPictureUrl: item.giftPictureUrl };
      }
      if (!topRevenue || item.totalCoins > topRevenue.totalCoins) {
        topRevenue = { giftName: item.giftName, totalCoins: item.totalCoins, giftPictureUrl: item.giftPictureUrl };
      }
    }

    return {
      totalTypes,
      totalUnits,
      totalCoins,
      mostPopular: mostPopular || { giftName: 'Chưa có', totalCount: 0, giftPictureUrl: '' },
      topRevenue: topRevenue || { giftName: 'Chưa có', totalCoins: 0, giftPictureUrl: '' }
    };
  }

  getRecentGiftTransactions(limit = 50) {
    return this.giftTransactions.slice(0, limit);
  }

  clearGifts() {
    this.giftSummary.clear();
    this.giftTransactions = [];
    this.scheduleSave();
  }

  resetSession() {
    this.players.clear();
    this.giftSummary.clear();
    this.giftTransactions = [];
    try {
      fs.writeFileSync(SESSION_FILE, JSON.stringify({
        players: [],
        giftSummary: [],
        giftTransactions: [],
        resetAt: new Date().toISOString()
      }, null, 2), 'utf-8');
      console.log('[StateManager] Session reset successfully.');
    } catch (err) {
      console.error('[StateManager] Error resetting session file:', err.message);
    }
  }

  scheduleSave() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveSessionSync();
    }, 1000);
  }

  saveSessionSync() {
    try {
      const giftSummaryList = Array.from(this.giftSummary.values()).map(item => ({
        giftId: item.giftId,
        giftName: item.giftName,
        giftPictureUrl: item.giftPictureUrl,
        diamondCount: item.diamondCount,
        totalCount: item.totalCount,
        totalCoins: item.totalCoins,
        donors: Array.from(item.donors.values())
      }));

      const data = {
        updatedAt: new Date().toISOString(),
        onlinePlayerCount: this.getOnlineCount(),
        playerCount: this.players.size,
        players: Array.from(this.players.values()),
        giftSummary: giftSummaryList,
        giftTransactions: this.giftTransactions
      };
      fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[StateManager] Error saving session.json:', err.message);
    }
  }

  loadSession() {
    if (fs.existsSync(SESSION_FILE)) {
      try {
        const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.players)) {
          for (const p of parsed.players) {
            if (p && p.userId) {
              this.players.set(String(p.userId), {
                userId: String(p.userId),
                nickname: p.nickname || `Khán Giả_${String(p.userId).slice(-4)}`,
                avatarUrl: p.avatarUrl || '',
                coins: Number(p.coins) || 0,
                likes: Number(p.likes) || 0,
                chatsCount: Number(p.chatsCount) || 0,
                lastMessage: p.lastMessage || '',
                isOnline: p.isOnline !== undefined ? Boolean(p.isOnline) : true,
                leftAt: p.leftAt || null,
                createdAt: p.createdAt || new Date().toISOString(),
                lastActiveAt: p.lastActiveAt || new Date().toISOString()
              });
            }
          }
          console.log(`[StateManager] Loaded ${this.players.size} viewers (${this.getOnlineCount()} online) from ${SESSION_FILE}`);
        }
        if (Array.isArray(parsed.giftSummary)) {
          for (const item of parsed.giftSummary) {
            const donorsMap = new Map();
            if (Array.isArray(item.donors)) {
              for (const d of item.donors) {
                if (d && d.userId) donorsMap.set(String(d.userId), d);
              }
            }
            this.giftSummary.set(item.giftName, {
              giftId: item.giftId || 'gift',
              giftName: item.giftName,
              giftPictureUrl: item.giftPictureUrl || '',
              diamondCount: item.diamondCount || 1,
              totalCount: item.totalCount || 0,
              totalCoins: item.totalCoins || 0,
              donors: donorsMap
            });
          }
          console.log(`[StateManager] Loaded ${this.giftSummary.size} gift types from ${SESSION_FILE}`);
        }
        if (Array.isArray(parsed.giftTransactions)) {
          this.giftTransactions = parsed.giftTransactions;
        }
      } catch (err) {
        console.error('[StateManager] Failed to parse session.json, starting fresh:', err.message);
      }
    }
  }
}

export const stateManager = new StateManager();
export default stateManager;
