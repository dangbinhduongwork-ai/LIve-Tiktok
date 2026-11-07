import { gameConfig } from './gameConfig.js';

const TEAM_IDS = ['cr7', 'm10'];
const ACTIVE_PHASES = new Set(['PLAYING', 'OVERTIME']);
const TIME_EPSILON = 1e-9;

export class GameEngine {
  constructor({ config = gameConfig, rng = Math.random, now = Date.now, emit = () => {} } = {}) {
    this.config = config;
    this.rng = rng;
    this.now = now;
    this.emit = emit;
    this.matchId = 0;
    this.viewerCount = 0;
    this.reset();
  }

  reset() {
    this.matchId += 1;
    this.phase = 'WAITING';
    this.timeLeft = this.config.phases.waiting;
    this.score = { cr7: 0, m10: 0 };
    this.ball = { pos: 0 };
    this.forces = { cr7: 0, m10: 0 };
    this.players = new Map();
    this.donations = { cr7: new Map(), m10: new Map() };
    this.unassignedDonations = new Map();
    this.bursts = [];
    this.smallBalls = [];
    this.nextSmallBallId = 0;
    this.likeBoost = { cr7: 0, m10: 0 };
    this.freezeLeft = { cr7: 0, m10: 0 };
    this.freezeUsed = { cr7: false, m10: false };
    this.goldenAt = { cr7: -Infinity, m10: -Infinity };
    this.goalPauseLeft = 0;
    this.result = null;
    this.aiForces = { cr7: 0, m10: 0 };
    this.aiDecisionLeft = 0;
  }

  start() {
    if (this.phase !== 'WAITING') return false;
    this.phase = 'PLAYING';
    this.timeLeft = this.config.phases.playing;
    return true;
  }

  resetMatch() {
    this.reset();
  }

  forceGoal(team) {
    if (!ACTIVE_PHASES.has(this.phase) || !TEAM_IDS.includes(team)) return false;
    this.recordGoal(team);
    return true;
  }

  handleChat(data = {}, receivedAt = this.now()) {
    const userId = String(data.userId || '').trim();
    if (!userId) return false;
    let player = this.players.get(userId);
    // Every chat refreshes presence, even ordinary text or a comment on cooldown.
    if (player) this.touchPlayer(player, data, receivedAt);
    const message = String(data.message || '').trim().toLowerCase();
    const team = TEAM_IDS.find(id => this.config.teams[id].keywords.includes(message));
    if (!team) return false;

    if (!player) {
      player = this.assignPlayer(userId, team, data, receivedAt);
    } else if (player.team !== team) {
      return false;
    }

    if (!ACTIVE_PHASES.has(this.phase)) return true;
    const now = receivedAt;
    if (now - player.lastCommentAt < this.config.comment.cooldownMs) return false;
    player.lastCommentAt = now;
    this.addBurst(team, this.config.comment.force, this.config.comment.burstSeconds);
    this.smallBalls.push({
      id: ++this.nextSmallBallId, team, lane: this.rng(), progress: 0,
      lifeLeft: this.config.comment.smallBallSeconds
    });
    if (this.smallBalls.length > this.config.comment.maxSmallBalls) this.smallBalls.shift();
    return true;
  }

  handleLike(data = {}, receivedAt = this.now()) {
    const player = this.players.get(String(data.userId || '').trim());
    if (!player) return false;
    const count = Number(data.likeCount);
    if (!Number.isFinite(count) || count <= 0) return false;
    this.touchPlayer(player, data, receivedAt);
    if (!ACTIVE_PHASES.has(this.phase)) return false;
    const rule = this.config.likes;
    this.likeBoost[player.team] = Math.min(rule.maxBoost, this.likeBoost[player.team] + count * rule.boostPerLike);
    return true;
  }

  handleGift(data = {}, receivedAt = this.now()) {
    const userId = String(data.userId || '').trim();
    const coins = Number(data.deltaCoins);
    if (!userId || !Number.isFinite(coins) || coins <= 0) return false;
    let player = this.players.get(userId);
    if (!player) {
      const policy = this.config.unassignedGift.policy;
      if (policy === 'ignore') {
        const donor = this.unassignedDonations.get(userId) || { userId, nickname: userId, coins: 0 };
        if (data.nickname) donor.nickname = String(data.nickname);
        donor.coins += coins;
        this.unassignedDonations.set(userId, donor);
        return false;
      }
      const counts = this.getActiveCounts();
      // Stable hash also breaks equal-count ties without favouring a fixed team.
      const team = policy === 'hash' || counts.cr7 === counts.m10
        ? this.hashedTeam(userId) : counts.cr7 < counts.m10 ? 'cr7' : 'm10';
      player = this.assignPlayer(userId, team, data, receivedAt, true);
    }
    this.touchPlayer(player, data, receivedAt);
    // The gift's unit price selects its skill; only deltaCoins supplies new power.
    const unitPrice = Number(data.diamondCount);
    const tierCoins = Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : coins;
    player.coins += coins;
    this.donations[player.team].set(player.userId, player);
    if (!ACTIVE_PHASES.has(this.phase)) return true;

    const rule = this.config.gifts;
    const team = player.team;
    const now = receivedAt;
    let skill = '';
    let force = 0;
    if (tierCoins >= rule.freezeMinCoins) {
      const matchTimeLeft = this.timeLeft + (this.phase === 'PLAYING' && this.config.overtime.always ? this.config.phases.overtime : 0);
      if (this.freezeUsed[team]) return this.rejectGift('freeze_used', player, data, coins);
      if (matchTimeLeft <= rule.freezeBlockLastSeconds) return this.rejectGift('freeze_locked', player, data, coins);
      this.freezeUsed[team] = true;
      const opponent = this.opponent(team);
      this.freezeLeft[opponent] = rule.freezeSeconds;
      skill = 'freeze';
    } else if (tierCoins >= rule.goldenMinCoins) {
      if (now - this.goldenAt[team] < rule.goldenCooldownMs) return this.rejectGift('cooldown_golden', player, data, coins);
      this.goldenAt[team] = now;
      force = rule.goldenForce;
      skill = 'golden';
    } else if (tierCoins >= rule.skillMinCoins) {
      if (now - player.lastSkillAt < rule.skillCooldownMs) return this.rejectGift('cooldown_skill', player, data, coins);
      player.lastSkillAt = now;
      force = rule.skillForce;
      skill = 'special';
    } else {
      force = Math.min(coins * rule.basicForcePerCoin, rule.basicForceCap);
      skill = 'basic';
    }
    if (force > 0) this.addBurst(team, force, rule.burstSeconds);
    this.emitGameEvent(skill === 'freeze' ? 'freeze' : 'gift_skill', team, player, {
      giftName: data.giftName || '', deltaCoins: coins, skill, force
    });
    return true;
  }

  rejectGift(reason, player, data, coins) {
    this.emitGameEvent('gift_rejected', player.team, player, {
      reason, giftName: data.giftName || '', deltaCoins: coins
    });
    return false;
  }

  hashedTeam(userId) {
    // FNV-1a over UTF-16 code units; independent of match, RNG and process.
    let hash = 2166136261;
    for (let i = 0; i < userId.length; i++) hash = Math.imul(hash ^ userId.charCodeAt(i), 16777619);
    return TEAM_IDS[(hash >>> 0) % TEAM_IDS.length];
  }

  assignPlayer(userId, team, data, receivedAt, viaGift = false) {
    const donor = this.unassignedDonations.get(userId);
    const player = {
      userId, nickname: String(data.nickname || donor?.nickname || userId), team, coins: donor?.coins || 0,
      lastCommentAt: -Infinity, lastSkillAt: -Infinity, lastActiveAt: receivedAt, leftAt: -Infinity, left: false
    };
    this.players.set(userId, player);
    if (donor) {
      this.donations[team].set(userId, player);
      this.unassignedDonations.delete(userId);
    }
    this.emitGameEvent('team_join', team, player, { viaGift });
    return player;
  }

  touchPlayer(player, data, receivedAt) {
    if (receivedAt < player.lastActiveAt || receivedAt < player.leftAt) return;
    player.lastActiveAt = receivedAt;
    player.left = false;
    if (data.nickname) player.nickname = String(data.nickname);
  }

  handleMemberJoin(data = {}, receivedAt = this.now()) {
    const player = this.players.get(String(data.userId || '').trim());
    if (!player) return false; // Entering the room alone does not choose a team.
    this.touchPlayer(player, data, receivedAt);
    return true;
  }

  handleMemberLeave(data = {}, receivedAt = this.now()) {
    const player = this.players.get(String(data.userId || '').trim());
    if (!player || receivedAt < player.lastActiveAt || receivedAt < player.leftAt) return false;
    player.left = true;
    player.leftAt = receivedAt;
    return true;
  }

  getActiveCounts(at = this.now()) {
    const counts = { cr7: 0, m10: 0 };
    for (const player of this.players.values()) {
      if (!player.left && at - player.lastActiveAt < this.config.activeWindowSeconds * 1000) counts[player.team] += 1;
    }
    return counts;
  }

  handleViewerCount(n) {
    const count = Number(n);
    if (Number.isFinite(count)) this.viewerCount = Math.max(0, count);
  }

  addBurst(team, force, lifeLeft) {
    const teamBursts = this.bursts.filter(item => item.team === team);
    const teamLimit = Math.max(1, Math.floor(this.config.forceLimits.maxActiveBursts / TEAM_IDS.length));
    // Same-deadline bursts can share a slot without changing their impulse.
    // Extending an old slot on every new comment would keep its force alive forever.
    let burst = teamBursts.find(item => Math.abs(item.lifeLeft - lifeLeft) < TIME_EPSILON);
    if (!burst && teamBursts.length >= teamLimit) {
      burst = teamBursts.reduce((earliest, item) => item.lifeLeft < earliest.lifeLeft ? item : earliest);
    }
    if (burst) {
      burst.force = Math.min(burst.force + force, this.config.forceLimits.maxEffectiveForcePerTeam);
      burst.lifeLeft = Math.min(burst.lifeLeft, lifeLeft);
      return;
    }
    this.bursts.push({ team, force, lifeLeft });
  }

  opponent(team) {
    return team === 'cr7' ? 'm10' : 'cr7';
  }

  emitGameEvent(type, team = null, player = null, extra = {}) {
    this.emit({
      type, team,
      user: player ? { userId: player.userId, nickname: player.nickname } : null,
      giftName: null, deltaCoins: null,
      ...extra
    });
  }

  recordGoal(team) {
    this.score[team] += this.phase === 'OVERTIME' ? this.config.goal.overtimeScore : 1;
    this.ball.pos = 0;
    this.goalPauseLeft = this.config.goal.pauseSeconds;
    this.bursts = [];
    this.smallBalls = [];
    this.forces = { cr7: 0, m10: 0 };
    this.emitGameEvent('goal', team, null, { score: { ...this.score } });
  }

  advancePhase() {
    if (this.phase === 'WAITING') {
      this.start();
    } else if (this.phase === 'PLAYING') {
      if (this.config.overtime.always || Math.abs(this.score.cr7 - this.score.m10) <= this.config.overtime.maxScoreGap) {
        this.phase = 'OVERTIME';
        this.timeLeft = this.config.phases.overtime;
        this.emitGameEvent('overtime');
      } else {
        this.finish();
      }
    } else if (this.phase === 'OVERTIME') {
      this.finish();
    } else {
      this.reset();
    }
  }

  finish() {
    this.phase = 'RESULT';
    this.timeLeft = this.config.phases.result;
    this.forces = { cr7: 0, m10: 0 };
    const winner = this.score.cr7 === this.score.m10 ? null : this.score.cr7 > this.score.m10 ? 'cr7' : 'm10';
    this.result = { winner, score: { ...this.score } };
    this.emitGameEvent('result', winner, null, { score: { ...this.score } });
  }

  tick(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Small internal steps make a delayed interval behave like normal play.
    let remaining = dt;
    while (remaining > TIME_EPSILON) {
      const step = Math.min(remaining, this.config.tickIntervalMs / 1000, this.timeLeft);
      remaining -= step;
      this.tickStep(step);
    }
  }

  tickStep(dt) {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.likeBoost.cr7 = Math.max(0, this.likeBoost.cr7 - this.config.likes.decayPerSecond * dt);
    this.likeBoost.m10 = Math.max(0, this.likeBoost.m10 - this.config.likes.decayPerSecond * dt);
    this.freezeLeft.cr7 = Math.max(0, this.freezeLeft.cr7 - dt);
    this.freezeLeft.m10 = Math.max(0, this.freezeLeft.m10 - dt);
    this.goalPauseLeft = Math.max(0, this.goalPauseLeft - dt);
    for (const burst of this.bursts) burst.lifeLeft -= dt;
    this.bursts = this.bursts.filter(burst => burst.lifeLeft > 0);
    for (const ball of this.smallBalls) {
      ball.lifeLeft -= dt;
      ball.progress = Math.min(1, ball.progress + dt / this.config.comment.smallBallSeconds);
    }
    this.smallBalls = this.smallBalls.filter(ball => ball.lifeLeft > 0);

    if (ACTIVE_PHASES.has(this.phase) && this.goalPauseLeft <= 0) {
      const count = this.getActiveCounts();
      const aiScale = Math.max(0, Math.min(1, 1 - (count.cr7 + count.m10) / this.config.ai.fullPlayers));
      if (aiScale > 0) {
        if (this.aiDecisionLeft <= TIME_EPSILON) {
          for (const team of TEAM_IDS) this.aiForces[team] = Math.max(0, this.config.ai.baseForce + (this.rng() * 2 - 1) * this.config.ai.variation);
          this.aiDecisionLeft = this.config.ai.decisionSeconds;
        }
        this.aiDecisionLeft -= dt;
      } else {
        this.aiDecisionLeft = 0;
      }
      for (const team of TEAM_IDS) {
        const ai = this.aiForces[team] * aiScale;
        const bursts = this.bursts.filter(burst => burst.team === team).reduce((sum, burst) => sum + burst.force, 0);
        let force = (count[team] * this.config.playerBaseForce + ai + bursts) * (1 + this.likeBoost[team]);
        const threatened = team === 'cr7' ? this.ball.pos <= -this.config.comeback.positionThreshold : this.ball.pos >= this.config.comeback.positionThreshold;
        if (threatened) force *= 1 + this.config.comeback.forceBonus;
        force = Math.min(force, this.config.forceLimits.maxEffectiveForcePerTeam);
        if (this.freezeLeft[team] > 0) force *= this.config.gifts.freezeMultiplier;
        this.forces[team] = force;
      }
      const totalForce = this.forces.cr7 + this.forces.m10;
      const denominator = totalForce + this.config.movement.damping;
      const velocity = denominator > 0 ? this.config.movement.maxSpeed * (this.forces.cr7 - this.forces.m10) / denominator : 0;
      this.ball.pos += velocity * dt;
      if (this.ball.pos >= this.config.fieldLimit) this.recordGoal('cr7');
      else if (this.ball.pos <= -this.config.fieldLimit) this.recordGoal('m10');
    } else {
      this.forces = { cr7: 0, m10: 0 };
    }

    if (this.timeLeft <= TIME_EPSILON) this.advancePhase();
  }

  getState() {
    const teams = {};
    const activeCounts = this.getActiveCounts();
    for (const team of TEAM_IDS) {
      const donors = [...this.donations[team].values()]
        .sort((a, b) => b.coins - a.coins)
        .slice(0, this.config.topDonorCount)
        .map(({ userId, nickname, coins }) => ({ userId, nickname, coins }));
      teams[team] = {
        ...this.config.teams[team],
        count: activeCounts[team],
        joinedCount: [...this.players.values()].filter(player => player.team === team).length,
        top3: donors,
        likeBoost: this.likeBoost[team],
        freezeLeft: this.freezeLeft[team],
        frozen: this.freezeLeft[team] > 0
      };
    }
    return {
      matchId: this.matchId, phase: this.phase, timeLeft: Math.ceil(this.timeLeft),
      score: { ...this.score }, ballPos: this.ball.pos, fieldLimit: this.config.fieldLimit, forces: { ...this.forces },
      teams, viewerCount: this.viewerCount, goalPauseLeft: this.goalPauseLeft,
      activeJoined: activeCounts.cr7 + activeCounts.m10,
      unassignedDonations: {
        count: this.unassignedDonations.size,
        totalCoins: [...this.unassignedDonations.values()].reduce((sum, donor) => sum + donor.coins, 0),
        top3: [...this.unassignedDonations.values()].sort((a, b) => b.coins - a.coins)
          .slice(0, this.config.topDonorCount).map(donor => ({ ...donor }))
      },
      result: this.result ? { ...this.result, score: { ...this.result.score } } : null,
      smallBalls: this.smallBalls.map(ball => ({ ...ball }))
    };
  }
}

export default GameEngine;
