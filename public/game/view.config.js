// Pixels on the OBS 1080 x 1920 design canvas. Adjust after testing on a phone.
export const viewConfig = {
  width: 1080, height: 1920,
  safeArea: { top: 150, bottom: 400, right: 140, left: 48 },
  quality: {
    normal: { shadows: true, particles: 240, segments: 16, antialias: true },
    low: { shadows: false, particles: 72, segments: 8, antialias: false }
  },
  field: { width: 10, length: 18 },
  effects: { goalSeconds: 2.8, bannerSeconds: 2.8, crossFadeSeconds: 0.3 },
  avatarFallback: '/game/assets/avatar-fallback.svg'
};
