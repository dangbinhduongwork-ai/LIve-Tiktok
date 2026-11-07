// All paths are relative to /game/assets/characters/. No build is needed.
export const characters = {
  cr7: {
    model: '', height: 1.8, rotationY: 0,
    clips: {},
    // Example: clips: { idle: 'cr7/Idle.fbx', run: 'cr7/Run.fbx', kick: 'cr7/Kick.fbx' },
    aliases: { celebrate: ['victory', 'celebration'], kick: ['soccer kick'] },
    textures: {}, // { map: 'cr7/textures/color.png', normalMap: 'cr7/textures/normal.png', roughnessMap: 'cr7/textures/roughness.png' }
    textureDirectory: 'cr7/textures/',
    textureFiles: {}, // Original image basename -> local path, e.g. { 'Body_D.png': 'cr7/textures/color.png' }
    positionScale: 'auto',
    // Mini models are independent, so six players never load the large star model.
    mini: { model: '', clips: {}, textureDirectory: 'cr7/mini/textures/' }
  },
  m10: {
    model: '', height: 1.8, rotationY: 0,
    clips: {}, aliases: {}, textures: {}, textureDirectory: 'm10/textures/', textureFiles: {},
    positionScale: 'auto',
    mini: { model: '', clips: {}, textureDirectory: 'm10/mini/textures/' }
  }
};
