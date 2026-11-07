import { TikTokLiveConnection, WebcastEvent } from 'tiktok-live-connector';
import { stateManager } from './stateManager.js';

class TikTokHandler {
  constructor() {
    this.connection = null;
    this.currentUsername = '';
    this.lastConnectedUsername = '';
    this.isManualDisconnect = false;
    this.isConnected = false;
    this.isConnecting = false;
    this.viewerCount = 0;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectDelay = 30000;
    this.onEventCallback = null;

    // Map of active gift streaks: key = `${userId}_${giftId}_${groupId}`
    // Value = { lastProcessedRepeatCount: number, timer: NodeJS.Timeout, diamondCount: number }
    this.activeStreaks = new Map();
  }

  setEventCallback(cb) {
    this.onEventCallback = cb;
  }

  emitEvent(eventName, payload) {
    if (typeof this.onEventCallback === 'function') {
      this.onEventCallback(eventName, payload);
    }
  }

  /**
   * Clear all active combo streak timers and memory
   */
  clearActiveStreaks() {
    for (const streak of this.activeStreaks.values()) {
      if (streak && streak.timer) {
        clearTimeout(streak.timer);
      }
    }
    this.activeStreaks.clear();
  }

  /**
   * Connect to a TikTok channel by username.
   * Only connects when explicitly requested by user.
   * Automatically resets old session data only when connecting to a DIFFERENT/NEW user.
   */
  async connect(username, options = {}) {
    if (!username || typeof username !== 'string') {
      throw new Error('Vui lòng cung cấp TikTok username hợp lệ');
    }

    const cleanUsername = username.replace(/^@/, '').trim();
    if (!cleanUsername) {
      throw new Error('Username TikTok không được để trống');
    }

    // Reset manual disconnect flag on explicit connect
    this.isManualDisconnect = false;

    // Check if connecting to a DIFFERENT user than previous session
    const previousUsername = this.lastConnectedUsername || this.currentUsername;
    const isNewUser = Boolean(
      previousUsername &&
      previousUsername.toLowerCase() !== cleanUsername.toLowerCase()
    );
    const shouldReset = options.resetSession ?? isNewUser;

    // Disconnect previous live connection if active
    if (this.connection) {
      this.disconnect();
      this.isManualDisconnect = false;
    }

    // Only wipe old session data if connecting to a DIFFERENT user
    if (shouldReset) {
      console.log(`[TikTok] Kết nối user mới @${cleanUsername} (user cũ: ${previousUsername}). Đang làm mới dữ liệu live cũ...`);
      this.clearActiveStreaks();
      stateManager.resetSession();
      this.viewerCount = 0;
      this.emitEvent('session_reset', {
        username: cleanUsername,
        previousUsername,
        reason: 'new_user_switch',
        timestamp: Date.now()
      });
    }

    this.currentUsername = cleanUsername;
    this.isConnecting = true;
    this.emitEvent('tiktok_status', {
      status: 'connecting',
      isConnected: false,
      isConnecting: true,
      username: this.currentUsername,
      viewerCount: this.viewerCount,
      message: `Đang kết nối tới @${this.currentUsername}...`
    });

    try {
      this.connection = new TikTokLiveConnection(this.currentUsername, {
        processInitialData: false,
        enableExtendedGiftInfo: false
      });

      this.setupListeners();

      const state = await this.connection.connect();
      this.isConnected = true;
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.lastConnectedUsername = cleanUsername; // Save as last connected user

      const initialViewers =
        state?.roomInfo?.user_count ??
        state?.roomInfo?.data?.stats?.userCount ??
        state?.roomInfo?.liveRoom?.liveRoomStats?.userCount;
      if (initialViewers != null) {
        this.viewerCount = Math.max(0, Number(initialViewers) || 0);
        this.emitEvent('viewer_count', {
          viewerCount: this.viewerCount,
          timestamp: Date.now()
        });
      }

      console.log(`[TikTok] Kết nối thành công tới phòng live của @${this.currentUsername} (RoomId: ${state.roomId})`);
      this.emitEvent('tiktok_status', {
        status: 'connected',
        isConnected: true,
        isConnecting: false,
        username: this.currentUsername,
        roomId: state.roomId,
        viewerCount: this.viewerCount,
        message: `Đã kết nối với @${this.currentUsername} (RoomId: ${state.roomId})`
      });

      return { success: true, roomId: state.roomId, username: this.currentUsername };
    } catch (err) {
      this.isConnected = false;
      this.isConnecting = false;
      console.error(`[TikTok] Lỗi kết nối tới @${this.currentUsername}:`, err.message);

      let friendlyMsg = err.message || 'Lỗi kết nối không xác định';
      if (friendlyMsg.includes('rate_limit') || friendlyMsg.includes('Rate Limited') || friendlyMsg.includes('eulerstream')) {
        friendlyMsg = 'Đã đạt giới hạn kết nối trong 1 giờ (Rate Limit EulerStream). Vui lòng đợi ít phút hoặc thêm SIGN_API_KEY miễn phí từ eulerstream.com vào file .env';
      } else if (friendlyMsg.includes('Failed to retrieve Room ID') || friendlyMsg.includes("isn't online")) {
        friendlyMsg = `Không tìm thấy phòng live của @${this.currentUsername} (Có thể kênh chưa phát trực tiếp)`;
      }

      this.emitEvent('tiktok_status', {
        status: 'error',
        isConnected: false,
        isConnecting: false,
        username: this.currentUsername,
        viewerCount: this.viewerCount,
        message: friendlyMsg,
        rawError: err.message
      });

      // Do NOT auto-reconnect when initial connection fails!
      throw err;
    }
  }

  /**
   * Disconnect completely from live stream.
   * Completely stops connection without auto-reconnect loops,
   * while keeping 100% of player and gift data intact in stateManager.
   */
  disconnect() {
    this.isManualDisconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.clearActiveStreaks();

    if (this.connection) {
      try {
        // Strip listeners to prevent 'disconnected' event from triggering reconnect
        this.connection.removeAllListeners();
        this.connection.disconnect();
      } catch (err) {
        console.warn('[TikTok] Error on disconnect:', err.message);
      }
      this.connection = null;
    }

    this.isConnected = false;
    this.isConnecting = false;
    this.viewerCount = 0;

    this.emitEvent('viewer_count', {
      viewerCount: 0,
      timestamp: Date.now()
    });

    this.emitEvent('tiktok_status', {
      status: 'disconnected',
      isConnected: false,
      isConnecting: false,
      username: this.currentUsername,
      viewerCount: 0,
      message: 'Đã dừng kết nối (Dữ liệu đã được lưu giữ)'
    });

    console.log('[TikTok] Đã dừng hẳn kết nối phiên live. Dữ liệu khán giả & quà được bảo toàn.');
  }

  scheduleReconnect() {
    if (!this.currentUsername || this.reconnectTimer) return;

    this.reconnectAttempts++;
    const delay = Math.min(3000 * Math.pow(1.5, this.reconnectAttempts - 1), this.maxReconnectDelay);
    console.log(`[TikTok] Lên lịch kết nối lại lần ${this.reconnectAttempts} sau ${Math.round(delay / 1000)}s...`);

    this.emitEvent('tiktok_status', {
      status: 'reconnecting',
      isConnected: false,
      isConnecting: true,
      username: this.currentUsername,
      attempt: this.reconnectAttempts,
      viewerCount: this.viewerCount,
      message: `Tự động kết nối lại sau ${Math.round(delay / 1000)}s...`
    });

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.connect(this.currentUsername, { isAutoReconnect: true, resetSession: false });
      } catch {
        // Will auto reschedule inside connect error handler
      }
    }, delay);
  }

  setupListeners() {
    if (!this.connection) return;

    // Chat event
    this.connection.on(WebcastEvent.CHAT, (data) => {
      this.handleChat(data);
    });

    // Gift event
    this.connection.on(WebcastEvent.GIFT, (data) => {
      this.handleGift(data);
    });

    // Like event
    this.connection.on(WebcastEvent.LIKE, (data) => {
      this.handleLike(data);
    });

    // Member join event
    this.connection.on(WebcastEvent.MEMBER, (data) => {
      this.handleMember(data);
    });

    // Room user / viewer count update
    this.connection.on(WebcastEvent.ROOM_USER, (data) => {
      this.handleRoomUser(data);
    });

    // Stream end
    this.connection.on(WebcastEvent.STREAM_END, () => {
      console.log(`[TikTok] Phiên live của @${this.currentUsername} đã kết thúc.`);
      this.viewerCount = 0;
      this.emitEvent('viewer_count', {
        viewerCount: 0,
        timestamp: Date.now()
      });
      this.emitEvent('tiktok_status', {
        status: 'ended',
        isConnected: false,
        isConnecting: false,
        username: this.currentUsername,
        viewerCount: 0,
        message: 'Phiên live đã kết thúc (Dữ liệu đã được lưu giữ)'
      });
      this.disconnect();
    });

    // Disconnected unexpected
    this.connection.on('disconnected', () => {
      if (this.isManualDisconnect) return;
      console.warn(`[TikTok] Bị mất kết nối với @${this.currentUsername}.`);
      this.isConnected = false;
      this.isConnecting = false;
      this.emitEvent('tiktok_status', {
        status: 'disconnected',
        isConnected: false,
        isConnecting: false,
        username: this.currentUsername,
        viewerCount: 0,
        message: 'Bị mất kết nối với TikTok'
      });
    });

    // Error
    this.connection.on('error', (err) => {
      console.error('[TikTok Connection Error]:', err);
    });
  }

  /**
   * Process Room User / Live Viewer Count & Sync Active Interactive Viewers
   */
  handleRoomUser(data) {
    if (!data) return;
    const rawCount = data.viewerCount ?? data.total ?? data.popularity;
    if (rawCount != null) {
      const count = Number(rawCount);
      if (!Number.isNaN(count) && count >= 0) {
        this.viewerCount = count;

        // Extract active user IDs in room from TikTok ROOM_USER ranks/seats if available
        const activeUserIds = [];
        const rankLists = [data.ranks, data.topViewers, data.seats];
        for (const list of rankLists) {
          if (Array.isArray(list)) {
            for (const item of list) {
              const uid = item?.user?.id || item?.user?.displayId || item?.userId;
              if (uid) activeUserIds.push(String(uid));
            }
          }
        }

        // Sync interactive online viewers with current room viewer count & active list
        if (data.syncInteractive !== false) {
          const leftPlayers = stateManager.syncWithRoomViewers(this.viewerCount, activeUserIds);
          for (const p of leftPlayers) {
            this.emitEvent('member_leave', {
              userId: p.userId,
              nickname: p.nickname,
              avatarUrl: p.avatarUrl,
              coins: p.coins,
              likes: p.likes,
              chatsCount: p.chatsCount,
              wasOnline: true,
              onlineCount: stateManager.getOnlineCount(),
              timestamp: Date.now()
            });
          }
        }

        this.emitEvent('viewer_count', {
          viewerCount: this.viewerCount,
          onlinePlayerCount: stateManager.getOnlineCount(),
          totalUser: Number(data.totalUser) || 0,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Process Gift Event with Strict Combo Anti-Duplication
   * Rule: Delta coins = (currentRepeatCount - lastProcessedRepeatCount) * diamondCount
   */
  handleGift(data) {
    if (!data) return;

    const userId = String(data.user?.id || data.user?.displayId || data.userId || data.uniqueId || `guest_${Date.now()}`);
    const nickname = data.user?.nickname || data.user?.displayId || data.nickname || data.uniqueId || 'Khán Giả';
    const avatarUrl = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || data.avatarUrl || '';
    const giftId = String(data.giftId || data.gift?.id || 'gift');
    const groupId = String(data.groupId || 'single');
    const giftName = data.gift?.name || data.giftName || 'Món Quà';
    const giftPictureUrl = data.gift?.image?.urlList?.[0] || data.gift?.icon?.urlList?.[0] || data.giftPictureUrl || '';
    const diamondCount = Math.max(1, Number(data.gift?.diamondCount || data.diamondCount) || 1);
    const currentRepeat = Math.max(1, Number(data.repeatCount) || 1);
    const repeatEnd = Boolean(data.repeatEnd);

    const streakKey = `${userId}_${giftId}_${groupId}`;
    let streak = this.activeStreaks.get(streakKey);

    if (!streak) {
      streak = {
        lastProcessedRepeatCount: 0,
        diamondCount,
        timer: null
      };
      this.activeStreaks.set(streakKey, streak);
    }

    if (streak.timer) {
      clearTimeout(streak.timer);
    }

    let deltaCoins = 0;
    if (currentRepeat > streak.lastProcessedRepeatCount) {
      const deltaUnits = currentRepeat - streak.lastProcessedRepeatCount;
      deltaCoins = deltaUnits * diamondCount;
      streak.lastProcessedRepeatCount = currentRepeat;
    }

    if (repeatEnd) {
      streak.timer = setTimeout(() => {
        this.activeStreaks.delete(streakKey);
      }, 10000);
    } else {
      streak.timer = setTimeout(() => {
        this.activeStreaks.delete(streakKey);
      }, 30000);
    }

    if (deltaCoins > 0) {
      const result = stateManager.addCoins(userId, nickname, avatarUrl, deltaCoins);

      if (result) {
        const payload = {
          userId,
          nickname,
          avatarUrl: result.player.avatarUrl,
          giftId,
          giftName,
          giftPictureUrl,
          diamondCount,
          repeatCount: currentRepeat,
          repeatEnd,
          deltaCoins,
          totalCoins: result.player.coins,
          isTop1: result.isTop1,
          topPlayers: stateManager.getTopPlayers(5)
        };

        this.emitEvent('gift_received', payload);
        this.emitEvent('leaderboard_updated', stateManager.getTopPlayers(5));
      }
    }
  }

  handleChat(data) {
    if (!data) return;

    const userId = String(data.user?.id || data.user?.displayId || data.userId || data.uniqueId || `guest_${Date.now()}`);
    const nickname = data.user?.nickname || data.user?.displayId || data.nickname || data.uniqueId || 'Khán Giả';
    const avatarUrl = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || data.avatarUrl || '';
    const message = data.content || data.comment || data.message || '';

    const { player, message: cleanMessage } = stateManager.recordChat(userId, nickname, avatarUrl, message);

    const payload = {
      userId: player.userId,
      nickname: player.nickname,
      avatarUrl: player.avatarUrl,
      message: cleanMessage,
      coins: player.coins,
      likes: player.likes,
      chatsCount: player.chatsCount,
      time: new Date().toLocaleTimeString('vi-VN')
    };

    this.emitEvent('chat_received', payload);
  }

  handleLike(data) {
    if (!data) return;

    const userId = String(data.user?.id || data.user?.displayId || data.userId || data.uniqueId || `guest_${Date.now()}`);
    const nickname = data.user?.nickname || data.user?.displayId || data.nickname || data.uniqueId || 'Khán Giả';
    const avatarUrl = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || data.avatarUrl || '';
    const likeCount = Math.max(1, Number(data.count || data.likeCount) || 1);

    const result = stateManager.addLikes(userId, nickname, avatarUrl, likeCount);

    const payload = {
      userId: result.player.userId,
      nickname: result.player.nickname,
      avatarUrl: result.player.avatarUrl,
      likeCount,
      totalLikes: result.player.likes,
      coins: result.player.coins
    };

    this.emitEvent('like_received', payload);
  }

  handleMember(data) {
    if (!data) return;
    const userId = String(data.user?.id || data.user?.displayId || data.userId || data.uniqueId || '');
    const nickname = data.user?.nickname || data.user?.displayId || data.nickname || data.uniqueId || 'Khách viếng thăm';
    const avatarUrl = data.user?.avatarThumb?.urlList?.[0] || data.profilePictureUrl || data.avatarUrl || '';

    let rejoined = false;
    if (userId && stateManager.players.has(userId)) {
      const existing = stateManager.players.get(userId);
      if (existing && !existing.isOnline) {
        rejoined = true;
      }
      stateManager.setPlayerOnline(userId, nickname, avatarUrl);
    }

    this.emitEvent('member_join', {
      userId,
      nickname,
      avatarUrl,
      rejoined,
      onlineCount: stateManager.getOnlineCount(),
      timestamp: Date.now()
    });
  }

  /**
   * Handle when an interactive viewer leaves the live room ("Out phòng live").
   * Decrements active interactive viewer count (isOnline = false),
   * while preserving 100% of their donated coins, likes, and chat history.
   */
  handleMemberLeave(data) {
    if (!data) return null;
    const userId = typeof data === 'string' ? data : String(data.userId || data.user?.id || '');
    if (!userId) return null;

    const res = stateManager.setPlayerOffline(userId);
    if (!res) return null;

    const payload = {
      userId: res.player.userId,
      nickname: res.player.nickname,
      avatarUrl: res.player.avatarUrl,
      coins: res.player.coins,
      likes: res.player.likes,
      chatsCount: res.player.chatsCount,
      wasOnline: res.wasOnline,
      onlineCount: stateManager.getOnlineCount(),
      timestamp: Date.now()
    };

    if (res.wasOnline) {
      this.emitEvent('member_leave', payload);
    }
    return res.player;
  }

  getStatus() {
    return {
      status: this.isConnected ? 'connected' : (this.isConnecting ? 'connecting' : 'disconnected'),
      isConnected: this.isConnected,
      isConnecting: this.isConnecting,
      username: this.currentUsername,
      reconnectAttempts: this.reconnectAttempts,
      viewerCount: this.viewerCount
    };
  }
}

export const tiktokHandler = new TikTokHandler();
export default tiktokHandler;
