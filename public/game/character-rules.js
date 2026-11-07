export const CHARACTER_STATES = ['idle', 'run', 'kick', 'celebrate', 'defeated', 'jump'];
export const CLIP_ALIASES = {
  idle: ['idle', 'breathing', 'standing'], run: ['run', 'jog', 'walk', 'sprint'],
  kick: ['kick', 'shoot'], celebrate: ['celebrate', 'celebration', 'victory', 'cheer', 'dance'],
  defeated: ['defeat', 'sad', 'loser', 'exhausted', 'disappointed'], jump: ['jump', 'leap']
};
export const FALLBACKS = {
  idle: ['idle', 'run'], run: ['run', 'idle'], kick: ['kick', 'run', 'idle'],
  celebrate: ['celebrate', 'jump', 'idle', 'run'], defeated: ['defeated', 'idle', 'run'],
  jump: ['jump', 'celebrate', 'run', 'idle']
};
export const canonicalBone = name => String(name).replace(/^.*[|:]/, '').replace(/^mixamorig/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

export function mapClips(clips, aliases = {}, explicit = {}) {
  const result = { ...explicit };
  for (const state of CHARACTER_STATES) {
    if (result[state]) continue;
    const names = [...(aliases[state] || []), ...CLIP_ALIASES[state]].map(name => name.toLowerCase());
    result[state] = clips.find(clip => names.some(name => clip.name.toLowerCase().includes(name)));
  }
  if (!result.idle && clips.length) result.idle = clips[0];
  return result;
}
export function resolveClip(state, clips) {
  for (const candidate of FALLBACKS[state] || FALLBACKS.idle) if (clips[candidate]) return clips[candidate];
  return Object.values(clips).find(Boolean) || null;
}
export function inferPositionScale(targetHipY, sourceHipY, override = 'auto') {
  if (Number.isFinite(override) && override > 0) return override;
  if (Math.abs(targetHipY) < 1e-6 || Math.abs(sourceHipY) < 1e-6) return 1;
  const ratio = Math.abs(targetHipY / sourceHipY);
  return ratio < 0.1 || ratio > 10 ? ratio : 1;
}
export function localAssetUrl(path, reload = '') {
  const base = new URL('/game/assets/characters/', location.origin);
  const url = new URL(path, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) throw new Error('Model/clip phải nằm trong public/game/assets/characters/');
  if (reload) url.searchParams.set('v', reload);
  return url.href;
}
