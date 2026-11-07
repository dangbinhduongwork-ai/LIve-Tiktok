// Fixed presentation fixtures only. Live match rules remain on the server.
export const scenes = ['waiting', 'playing', 'goal', 'overtime', 'freeze', 'golden', 'result', 'empty'];
export function scenario(name = 'playing') {
  const state = {
    matchId: 24, phase: 'PLAYING', timeLeft: 86, score: { cr7: 2, m10: 1 },
    ballPos: 280, fieldLimit: 1000, forces: { cr7: 48, m10: 31 },
    viewerCount: 1286, activeJoined: 15, goalPauseLeft: 0, result: null,
    teams: {
      cr7: { name: 'CR7', color: '#ef4444', shirtNumber: 7, keywords: ['7', 'cr7'], count: 8, frozen: false, freezeLeft: 0, top3: [
        { userId: 'red1', nickname: 'Minh Anh', coins: 1250 }, { userId: 'red2', nickname: 'Huy CR7', coins: 520 }, { userId: 'red3', nickname: 'Bảo Ngọc', coins: 199 }
      ] },
      m10: { name: 'M10', color: '#3b82f6', shirtNumber: 10, keywords: ['10', 'm10'], count: 7, frozen: false, freezeLeft: 0, top3: [
        { userId: 'blue1', nickname: 'Tuấn M10', coins: 990 }, { userId: 'blue2', nickname: 'Hà Linh', coins: 450 }, { userId: 'blue3', nickname: 'Quốc Việt', coins: 150 }
      ] }
    },
    smallBalls: Array.from({ length: 12 }, (_, i) => ({ id: i, team: i % 2 ? 'cr7' : 'm10', lane: (i + 1) / 13, progress: (i % 5 + 1) / 7 }))
  };
  const events = [], user = { userId: 'red1', nickname: 'Minh Anh' };
  if (name === 'waiting' || name === 'empty') {
    state.phase = name === 'waiting' ? 'WAITING' : 'PLAYING'; state.timeLeft = name === 'waiting' ? 5 : 128;
    state.score = { cr7: 0, m10: 0 }; state.viewerCount = 0; state.activeJoined = 0; state.ballPos = -140;
    state.forces = name === 'waiting' ? { cr7: 0, m10: 0 } : { cr7: 6, m10: 9 }; state.smallBalls = [];
    for (const team of Object.values(state.teams)) { team.top3 = []; team.count = 0; }
  }
  if (name === 'goal') { state.goalPauseLeft = 3; state.ballPos = 0; events.push({ type: 'goal', team: 'cr7' }); }
  if (name === 'overtime') { state.phase = 'OVERTIME'; state.timeLeft = 24; events.push({ type: 'overtime' }); }
  if (name === 'freeze') { state.teams.m10.frozen = true; state.teams.m10.freezeLeft = 8; state.forces.m10 = 9; events.push({ type: 'freeze', team: 'cr7', user }); }
  if (name === 'golden') events.push({ type: 'gift_skill', skill: 'golden', team: 'cr7', user, giftName: 'Bóng vàng', deltaCoins: 99, force: 120 });
  if (name === 'result') { state.phase = 'RESULT'; state.timeLeft = 12; state.result = { winner: 'cr7', score: { ...state.score } }; state.forces = { cr7: 0, m10: 0 }; state.smallBalls = []; }
  return { state, events };
}
