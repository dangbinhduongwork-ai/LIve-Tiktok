// Presentation only. Pixels refer to the OBS 1080 x 1920 canvas.
export const viewConfig = {
  width: 1080, height: 1920,
  safeArea: { top: 150, bottom: 400, right: 140, left: 48 },
  layout: {
    header: { top: 150, height: 205 }, power: { top: 375, height: 82 },
    arena: { top: 470, height: 630 }, join: { top: 1110, height: 80 },
    events: { top: 1205, height: 102 }, donors: { top: 1320, height: 180 }
  },
  palette: { background: '#050b1a', lines: '#9ff4ff', gold: '#ffd54a' },
  quality: {
    normal: { shadows: true, particles: 240, segments: 16, antialias: true, ledBars: 96, cameraMotion: true },
    low: { shadows: false, particles: 72, segments: 8, antialias: false, ledBars: 40, cameraMotion: false }
  },
  field: { length: 20, width: 10, viewportFraction: 0.76, offsetY: -90 },
  camera: { fov: 37, baseZoom: 1.43, position: [0, 18, 23], target: [0, 0, 0], drift: 0.10, goalZoom: 0.025 },
  stars: { height: 420, inset: 164, floor: 24, angle: 0.42 },
  miniPlayers: { perTeam: 3, height: 2.65, maxPerTeam: 6 },
  crowd: { decaySeconds: 2.5, chatImpulse: 0.12, likeImpulse: 0.015 },
  effects: { goalSeconds: 2.8, bannerSeconds: 2.8, crossFadeSeconds: 0.3, goldenHeight: 3.6, goldenFallSeconds: 0.8 },
  avatarFallback: '/game/assets/avatar-fallback.svg'
};
