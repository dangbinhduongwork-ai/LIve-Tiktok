import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { characters as defaults } from './characters.config.js';
import { viewConfig } from './view.config.js';
import { canonicalBone, mapClips, resolveClip, inferPositionScale, localAssetUrl } from './character-rules.js';

let settings = { configs: defaults, teams: {}, low: false, warn: () => {} };
const reloadStamp = new URLSearchParams(location.search).has('reloadChars') ? String(Date.now()) : '';
export function configureCharacters(options) { settings = { ...settings, ...options }; }
function warn(team, message) { console.warn(`[Character ${team}] ${message}`); settings.warn(`${team}: ${message}`); }

export function disposeObject(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), skeletons = new Set();
  root.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.skeleton) skeletons.add(node.skeleton);
    for (const material of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) { texture.dispose(); texture.source?.data?.close?.(); }
  for (const skeleton of skeletons) skeleton.dispose();
}

function jerseyTexture(number) {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fffbea'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 105px Broadcast, sans-serif'; ctx.fillText(String(number), 64, 90);
  ctx.font = '700 15px Broadcast, sans-serif'; ctx.fillText('LEGENDS', 64, 24);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPlaceholder(team, definition) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const color = settings.teams[team]?.color || (team === 'cr7' ? '#ef4444' : '#3b82f6');
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const white = new THREE.MeshStandardMaterial({ color: settings.teams[team]?.lightColor || '#f4f6ff', roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: team === 'cr7' ? '#c48d69' : '#d5a27f', roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: '#18241e', roughness: 0.7 });
  const hair = new THREE.MeshStandardMaterial({ color: '#251f1a', roughness: 0.95 });
  const segments = definition.mini ? 6 : settings.low ? 8 : 12;
  function part(geometry, material, position, parent = body) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.castShadow = !settings.low; parent.add(mesh); return mesh;
  }
  part(new THREE.CapsuleGeometry(0.29, 0.3, 3, segments), shirt, [0, 1.04, 0]);
  part(new THREE.BoxGeometry(0.5, 0.22, 0.34), white, [0, 0.75, 0]);
  const head = new THREE.Group(); head.position.y = 1.53; body.add(head);
  part(new THREE.SphereGeometry(0.245, segments, segments), skin, [0, 0, 0], head);
  part(new THREE.SphereGeometry(0.25, segments, 8, 0, Math.PI * 2, 0, Math.PI * 0.48), hair, [0, 0.025, -0.015], head);
  for (const x of [-0.083, 0.083]) part(new THREE.SphereGeometry(0.025, 6, 6), dark, [x, 0.015, 0.224], head);
  part(new THREE.SphereGeometry(0.043, 6, 6), skin, [0, -0.04, 0.245], head);
  if (team === 'm10' && !definition.mini) part(new THREE.SphereGeometry(0.246, segments, 6, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.4), hair, [0, 0, 0], head);
  const arms = [], legs = [], fingers = [];
  for (const sign of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(sign * 0.34, 1.23, 0); body.add(arm); arms.push(arm);
    part(new THREE.CapsuleGeometry(0.105, 0.1, 2, segments), shirt, [0, -0.06, 0], arm);
    part(new THREE.CapsuleGeometry(0.075, 0.22, 2, segments), skin, [0, -0.28, 0], arm);
    if (!definition.mini) { const finger = part(new THREE.CylinderGeometry(0.025, 0.027, 0.13, 6), skin, [0, -0.50, 0.025], arm); finger.visible = false; fingers.push(finger); }
    const leg = new THREE.Group(); leg.position.set(sign * 0.145, 0.73, 0); body.add(leg); legs.push(leg);
    part(new THREE.CapsuleGeometry(0.105, 0.22, 2, segments), skin, [0, -0.20, 0], leg);
    part(new THREE.CapsuleGeometry(0.095, 0.18, 2, segments), white, [0, -0.44, 0], leg);
    part(new THREE.BoxGeometry(0.23, 0.14, 0.38), dark, [0, -0.66, 0.09], leg);
    part(new THREE.BoxGeometry(0.24, 0.035, 0.39), shirt, [0, -0.713, 0.09], leg);
  }
  const numberMat = new THREE.MeshBasicMaterial({ map: jerseyTexture(settings.teams[team]?.shirtNumber || (team === 'cr7' ? 7 : 10)), transparent: true, depthWrite: false });
  for (const sign of [-1, 1]) {
    const number = part(new THREE.PlaneGeometry(0.3, 0.36), numberMat, [0, 1.08, sign * 0.284]);
    if (sign < 0) number.rotation.y = Math.PI;
  }
  root.scale.setScalar((definition.height || 1.8) / 1.8);
  let state = 'idle', elapsed = 0, oneShot = false, returnTo = 'idle', style = '';
  return {
    object: root,
    get state() { return state; },
    play(next, opts = {}) {
      state = next; elapsed = 0; oneShot = opts.loop === undefined ? ['kick', 'celebrate', 'jump'].includes(next) : !opts.loop;
      returnTo = opts.returnTo || 'idle'; style = opts.style || '';
    },
    update(dt) {
      elapsed += dt;
      body.position.x = body.position.z = 0;
      body.position.y = Math.sin(elapsed * 3) * 0.018; body.rotation.set(0, 0, 0); head.rotation.x = 0;
      arms[0].rotation.set(0, 0, -0.12); arms[1].rotation.set(0, 0, 0.12);
      legs[0].rotation.x = 0; legs[1].rotation.x = 0;
      if (state === 'run') {
        const stride = Math.sin(elapsed * 12) * 0.62;
        legs[0].rotation.x = stride; legs[1].rotation.x = -stride;
        arms[0].rotation.x = -stride; arms[1].rotation.x = stride;
        body.position.y = Math.abs(Math.sin(elapsed * 12)) * 0.08; body.rotation.x = 0.12;
      } else if (state === 'kick') {
        legs[1].rotation.x = -Math.sin(Math.min(elapsed / 0.8, 1) * Math.PI) * 1.5;
        arms[0].rotation.z = -0.6; arms[1].rotation.z = 0.6;
      } else if (state === 'celebrate' && style === 'cheer') {
        body.position.y = Math.abs(Math.sin(elapsed * 4)) * 0.05;
        arms[0].rotation.z = -1.1; arms[1].rotation.z = 1.1;
        if (team === 'cr7') { arms[0].rotation.z = -.12; arms[1].rotation.z += Math.sin(elapsed * 7) * .45; }
        else { arms[0].rotation.x = arms[1].rotation.x = -1.1; arms[0].rotation.z += Math.sin(elapsed * 8) * .35; arms[1].rotation.z -= Math.sin(elapsed * 8) * .35; }
      } else if (state === 'celebrate' && style === 'goal' && !definition.mini) {
        if (team === 'cr7') {
          const jump = Math.max(0, Math.sin(Math.min(1, Math.max(0, (elapsed - .3) / 1.2)) * Math.PI));
          body.position.y = jump * .42; body.rotation.y = elapsed < 1.5 ? Math.max(0, elapsed - .3) / 1.2 * Math.PI * 2 : Math.PI * 2;
          body.position.z = Math.min(elapsed * .18, .22);
          arms[0].rotation.z = elapsed < 1.5 ? -1.8 : -.95; arms[1].rotation.z = -arms[0].rotation.z;
          legs[0].rotation.z = .15; legs[1].rotation.z = -.15;
        } else { arms[0].rotation.z = -2.95; arms[1].rotation.z = 2.95; head.rotation.x = -.25; }
      } else if (state === 'celebrate' || state === 'jump') {
        body.position.y = Math.max(0, Math.sin(elapsed * 6)) * 0.42;
        arms[0].rotation.z = -2.5; arms[1].rotation.z = 2.5;
        body.rotation.y = Math.sin(elapsed * 3) * 0.15;
      } else if (state === 'defeated') { body.rotation.x = 0.2; head.rotation.x = 0.35; arms[0].rotation.x = 0.18; arms[1].rotation.x = 0.18; }
      else if (style === 'warmup') { arms[0].rotation.z = -.35 - Math.sin(elapsed * 2) * .2; arms[1].rotation.z = .35; body.rotation.z = Math.sin(elapsed * 2) * .04; }
      else if (style === 'tense') { head.rotation.x = .08; arms[0].rotation.x = arms[1].rotation.x = -.3; }
      for (const finger of fingers) finger.visible = state === 'celebrate' && style === 'goal' && team === 'm10';
      if (style !== 'goal') { legs[0].rotation.z = legs[1].rotation.z = 0; }
      if (oneShot && elapsed > (state === 'kick' ? 0.85 : state === 'jump' ? 1.1 : 2.8)) { state = returnTo; elapsed = 0; oneShot = false; }
    }, dispose() { disposeObject(root); }
  };
}

export function managerFor(definition, team) {
  const manager = new THREE.LoadingManager();
  const explicitTextures = new Set(Object.values(definition.textures || {}).map(file => new URL(localAssetUrl(file)).pathname));
  manager.setURLModifier(raw => {
    if (/^(blob:|data:)/i.test(raw)) return raw;
    const cleaned = raw.replaceAll('\\', '/');
    const basename = decodeURIComponent(cleaned.split('/').pop().split('?')[0]);
    if (definition.textureFiles?.[basename]) return localAssetUrl(definition.textureFiles[basename], reloadStamp);
    const url = new URL(cleaned, location.origin);
    // FBXLoader can strip the original directory before calling this manager.
    if (/\.(png|jpe?g|webp|bmp|tga)$/i.test(basename) && /\.fbx(?:\?|$)/i.test(definition.model || '') && !explicitTextures.has(url.pathname)) {
      return localAssetUrl((definition.textureDirectory || `${team}/textures/`) + basename, reloadStamp);
    }
    if (url.origin === location.origin && !/^[a-z]:/i.test(cleaned)) {
      if (reloadStamp && /\.(png|jpe?g|webp|bin|glb|gltf|fbx)$/i.test(url.pathname)) url.searchParams.set('v', reloadStamp);
      return url.href;
    }
    if (/\.(png|jpe?g|webp|bmp|tga)$/i.test(basename)) return localAssetUrl((definition.textureDirectory || `${team}/textures/`) + basename, reloadStamp);
    throw new Error(`Tài nguyên ngoài máy bị chặn: ${basename}`);
  });
  manager.onError = url => warn(team, `Không nạp được tài nguyên ${String(url).split('/').pop()}; kiểm tra file/texture cục bộ.`);
  return manager;
}

async function loadAsset(path, manager, resources) {
  const url = localAssetUrl(path, reloadStamp);
  const extension = new URL(url).pathname.split('.').pop().toLowerCase();
  if (extension === 'fbx') {
    const object = await new FBXLoader(manager).loadAsync(url);
    return { object, clips: object.animations || [] };
  }
  if (extension === 'glb' || extension === 'gltf') {
    const draco = new DRACOLoader(manager).setDecoderPath('/game/vendor/three/addons/libs/draco/gltf/');
    resources.push(draco);
    const loader = new GLTFLoader(manager).setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
    const gltf = await loader.loadAsync(url);
    return { object: gltf.scene, clips: gltf.animations };
  }
  throw new Error(`Định dạng .${extension} chưa hỗ trợ; dùng GLB, GLTF hoặc FBX.`);
}

export function prepareClip(source, model, positionScale = 'auto') {
  const clip = source.clone();
  const bones = new Map(); model.traverse(node => { if (node.isBone) bones.set(canonicalBone(node.name), node); });
  const hips = bones.get('hips');
  let scale = 1;
  for (const track of clip.tracks) {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    if (canonicalBone(parsed.objectIndex || parsed.nodeName) === 'hips' && parsed.propertyName === 'position') {
      const ys = [];
      for (let i = 1; i < track.values.length; i += 3) ys.push(track.values[i]);
      ys.sort((a, b) => a - b);
      scale = inferPositionScale(hips?.position.y || 0, ys[Math.floor(ys.length / 2)] || 0, positionScale);
      break;
    }
  }
  clip.tracks = clip.tracks.filter(track => {
    const parsed = THREE.PropertyBinding.parseTrackName(track.name);
    const key = canonicalBone(parsed.objectIndex || parsed.nodeName);
    const target = bones.get(key);
    if (target) track.name = `${target.name}.${parsed.propertyName}`;
    else if (bones.size && !model.getObjectByName(parsed.nodeName)) return false;
    if (parsed.propertyName === 'position') {
      if (target) for (let i = 0; i < track.values.length; i++) track.values[i] *= scale;
      if (key === 'hips') {
        const x = track.values[0], z = track.values[2];
        for (let i = 0; i < track.values.length; i += 3) { track.values[i] = x; track.values[i + 2] = z; }
      }
    }
    return true;
  });
  clip.userData = { positionScale: scale };
  return clip;
}

export function fitCharacter(model, clipMap, height = 1.8, fittedRoot = model) {
  const bones = [];
  model.traverse(node => { if (node.isBone) bones.push(node); });
  let low = Infinity, high = -Infinity, method = 'mesh', sampleCount = 0;
  const point = new THREE.Vector3();
  const head = bones.find(bone => canonicalBone(bone.name).includes('headtop')) || bones.find(bone => canonicalBone(bone.name) === 'head');
  let toes = bones.filter(bone => /(?:left|right)(?:toeend|toebaseend|toebase|toe)$/.test(canonicalBone(bone.name)));
  if (!toes.length) toes = bones.filter(bone => /(?:left|right)foot/.test(canonicalBone(bone.name)));
  if (bones.length) {
    const clip = resolveClip('idle', clipMap);
    const mixer = new THREE.AnimationMixer(model);
    const action = clip ? mixer.clipAction(clip).play() : null;
    sampleCount = clip ? 24 : 1;
    for (let i = 0; i < sampleCount; i++) {
      if (action) mixer.setTime(clip.duration * i / sampleCount);
      model.updateMatrixWorld(true);
      for (const bone of toes.length ? toes : bones) { bone.getWorldPosition(point); low = Math.min(low, point.y); }
      for (const bone of head ? [head] : bones) { bone.getWorldPosition(point); high = Math.max(high, point.y); }
    }
    mixer.stopAllAction(); mixer.uncacheRoot(model); method = head && toes.length ? 'bones' : 'bones-fallback';
  } else {
    const box = new THREE.Box3().setFromObject(model, true); low = box.min.y; high = box.max.y;
  }
  const sourceHeight = high - low;
  if (!Number.isFinite(sourceHeight) || sourceHeight < 1e-5) throw new Error('Model không có chiều cao hợp lệ để tự scale.');
  const scale = height / sourceHeight;
  fittedRoot.scale.multiplyScalar(scale); fittedRoot.position.multiplyScalar(scale); fittedRoot.position.y -= low * scale;
  fittedRoot.updateMatrixWorld(true);
  return { method, samples: sampleCount, sourceHeight, scale, height, groundY: 0 };
}

async function applyMaterials(model, definition, manager, team) {
  const textureLoader = new THREE.TextureLoader(manager);
  const overrides = {};
  for (const key of ['map', 'normalMap', 'roughnessMap']) {
    if (!definition.textures?.[key]) continue;
    try {
      overrides[key] = await textureLoader.loadAsync(localAssetUrl(definition.textures[key], reloadStamp));
      overrides[key].colorSpace = key === 'map' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      overrides[key].flipY = !/\.gl(?:b|tf)$/i.test(definition.model.split('?')[0]);
    } catch { warn(team, `Texture ${key} lỗi; dùng màu/vật liệu dự phòng.`); }
  }
  const converted = new Map();
  model.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = !settings.low; node.receiveShadow = !settings.low;
    const convert = original => {
      if (converted.has(original)) return converted.get(original);
      const map = overrides.map || original?.map || null;
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshStandardMaterial({
        color: map ? '#ffffff' : original?.color || '#dce1cd', map,
        normalMap: overrides.normalMap || original?.normalMap || null,
        roughnessMap: overrides.roughnessMap || original?.roughnessMap || null,
        roughness: 0.86, metalness: 0, side: original?.side ?? THREE.FrontSide,
        transparent: original?.transparent || false, opacity: original?.opacity ?? 1,
        alphaTest: original?.alphaTest || 0
      });
      converted.set(original, material); original?.dispose(); return material;
    };
    node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
  });
}

// Synchronous facade: the placeholder is immediately playable while assets load.
export function createCharacter(teamId, { variant = 'star', index = 0 } = {}) {
  const config = settings.configs[teamId] || {};
  const definition = variant === 'mini' ? { ...config.mini, height: config.mini?.height || viewConfig.miniPlayers.height, mini: true } : config;
  const object3d = new THREE.Group(); object3d.name = `${variant}-${teamId}-${index}`;
  let body = createPlaceholder(teamId, definition); object3d.add(body.object);
  let disposed = false, lastState = 'idle', lastOptions = {}, mixer = null, current = null;
  const resources = [];
  const character = {
    object3d, height: definition.height || 1.8, variant, kind: 'placeholder', diagnostics: { source: definition.model || 'placeholder' },
    get state() { return body.state; },
    play(stateName, opts = {}) {
      if (disposed || (body.state === stateName && !opts.restart && !!lastOptions.loop === !!opts.loop && lastOptions.style === opts.style)) return;
      lastState = stateName; lastOptions = opts; body.play(stateName, opts);
    },
    update(dt) { if (!disposed) body.update(Math.min(dt, 0.1)); },
    dispose() {
      disposed = true; body.dispose(); object3d.clear();
      for (const resource of resources) resource.dispose();
    },
    ready: null
  };
  character.ready = (async () => {
    if (!definition.model) return character;
    let model;
    try {
      const manager = managerFor(definition, teamId);
      const loaded = await loadAsset(definition.model, manager, resources); model = loaded.object;
      let meshes = 0; model.traverse(node => { if (node.isMesh) meshes++; });
      if (!meshes) throw new Error('File model không có mesh. Dùng bản With Skin làm model.');
      const clips = loaded.clips.map(clip => prepareClip(clip, model, definition.positionScale));
      const explicit = {};
      for (const [state, entry] of Object.entries(definition.clips || {})) {
        try {
          const options = typeof entry === 'string' ? { file: entry } : entry;
          const asset = await loadAsset(options.file, manager, resources);
          const source = options.name ? asset.clips.find(clip => clip.name.toLowerCase().includes(options.name.toLowerCase())) : asset.clips[0];
          if (source) { explicit[state] = prepareClip(source, model, options.positionScale ?? definition.positionScale); clips.push(explicit[state]); }
          else warn(teamId, `Clip ${state} không có animation; dùng clip gần nhất.`);
          disposeObject(asset.object);
        } catch (error) { warn(teamId, `Clip ${state} lỗi (${error.message}); dùng clip gần nhất.`); }
      }
      const clipMap = mapClips(clips, definition.aliases, explicit);
      // A root animation must not overwrite the fitted scale or ground offset.
      const fittedRoot = new THREE.Group(); fittedRoot.add(model);
      character.diagnostics.fit = fitCharacter(model, clipMap, definition.height || 1.8, fittedRoot);
      character.diagnostics.clips = Object.fromEntries(Object.keys(clipMap).map(state => [state, resolveClip(state, clipMap)?.name || null]));
      await applyMaterials(model, definition, manager, teamId);
      if (disposed) { disposeObject(model); return character; }
      fittedRoot.rotation.y = (definition.rotationY || 0) * Math.PI / 180;
      mixer = new THREE.AnimationMixer(model);
      const actions = new Map();
      const realBody = {
        object: fittedRoot,
        get state() { return current?.userData.state || 'idle'; },
        play(state, opts = {}) {
          const clip = resolveClip(state, clipMap); if (!clip) return;
          let next = actions.get(state);
          if (!next) { next = mixer.clipAction(clip.clone()); actions.set(state, next); }
          const once = opts.loop === undefined ? ['kick', 'celebrate', 'jump'].includes(state) : !opts.loop;
          next.reset().setEffectiveTimeScale(opts.speed || 1).setEffectiveWeight(1).setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
          next.clampWhenFinished = once; next.play();
          next.userData = { returnTo: opts.returnTo || 'idle', once, state };
          if (current && current !== next) current.crossFadeTo(next, 0.3, false);
          current = next;
        },
        update(dt) { mixer.update(dt); },
        dispose() { mixer.stopAllAction(); mixer.uncacheRoot(model); disposeObject(model); }
      };
      mixer.addEventListener('finished', event => { if (event.action === current && current.userData.once) realBody.play(current.userData.returnTo, { loop: true }); });
      lastState = body.state;
      object3d.remove(body.object); body.dispose(); body = realBody; object3d.add(fittedRoot);
      character.kind = 'model'; body.play(lastState, lastOptions);
    } catch (error) {
      if (model) disposeObject(model);
      warn(teamId, `Dùng nhân vật tạm: ${error.message}`);
      character.diagnostics.error = error.message;
    }
    return character;
  })().finally(() => { if (disposed) for (const resource of resources) resource.dispose(); });
  return character;
}

export function createMiniPlayer(teamId, index) { return createCharacter(teamId, { variant: 'mini', index }); }
