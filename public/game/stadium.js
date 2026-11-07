import * as THREE from 'three';
import { createCharacter, configureCharacters, disposeObject } from './characters.js';
import { viewConfig } from './view.config.js';

function grassTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#387b52' : '#33734b'; ctx.fillRect(0, i * 1024 / 12, 512, 1024 / 12 + 1); }
  let seed = 1977;
  for (let i = 0; i < 16000; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; ctx.fillStyle = i % 2 ? '#eaffcf08' : '#001b1b0d'; ctx.fillRect(seed % 512, (seed >>> 9) % 1024, 1, 3); }
  ctx.strokeStyle = '#dae7cb'; ctx.lineWidth = 3;
  ctx.strokeRect(20, 28, 472, 968);
  ctx.beginPath(); ctx.moveTo(20, 512); ctx.lineTo(492, 512); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(256, 512, 70, 87, 0, 0, Math.PI * 2); ctx.stroke();
  for (const end of [0, 1]) {
    const y = end ? 996 : 28, dir = end ? -1 : 1;
    ctx.strokeRect(105, y, 302, dir * 154); ctx.strokeRect(177, y, 158, dir * 64);
    ctx.beginPath(); ctx.arc(256, y + dir * 112, 3, 0, Math.PI * 2); ctx.fillStyle = '#dae7cb'; ctx.fill();
    ctx.beginPath(); ctx.ellipse(256, y + dir * 112, 66, 80, 0, end ? Math.PI : 0, end ? 2 * Math.PI : Math.PI); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(256, 512, 4, 0, Math.PI * 2); ctx.fill();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  return texture;
}

function makeBall(radius, segments = 16) {
  const group = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, segments, segments), new THREE.MeshStandardMaterial({ color: '#fcf7df', roughness: 0.65 }));
  mesh.castShadow = true; group.add(mesh);
  // Geometric dark patches, no image download or emoji font dependency.
  const patchGeometry = new THREE.CircleGeometry(radius * 0.32, 5);
  const patchMaterial = new THREE.MeshStandardMaterial({ color: '#17261e', side: THREE.DoubleSide, roughness: 0.9 });
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const normal = new THREE.Vector3(Math.cos(angle) * 0.85, i % 2 ? 0.53 : -0.53, Math.sin(angle) * 0.85).normalize();
    const patch = new THREE.Mesh(patchGeometry, patchMaterial); patch.position.copy(normal).multiplyScalar(radius * 1.003); patch.lookAt(normal.multiplyScalar(radius * 2)); group.add(patch);
  }
  return group;
}

class ParticlePool {
  constructor(scene, capacity) {
    this.capacity = capacity; this.cursor = 0;
    this.positions = new Float32Array(capacity * 3); this.positions.fill(-100);
    this.colors = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3); this.life = new Float32Array(capacity);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.PointsMaterial({ size: 0.13, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(this.geometry, this.material); this.points.frustumCulled = false; scene.add(this.points);
    this.color = new THREE.Color();
  }
  burst(x, y, z, color, count = 65) {
    this.color.set(color);
    for (let n = 0; n < Math.min(count, this.capacity); n++) {
      const i = this.cursor++ % this.capacity, j = i * 3;
      this.life[i] = 1.4 + Math.random() * 1.6;
      this.positions[j] = x; this.positions[j + 1] = y; this.positions[j + 2] = z;
      this.velocities[j] = (Math.random() - 0.5) * 5; this.velocities[j + 1] = 1.5 + Math.random() * 4; this.velocities[j + 2] = (Math.random() - 0.5) * 5;
      this.colors[j] = this.color.r; this.colors[j + 1] = this.color.g; this.colors[j + 2] = this.color.b;
    }
    this.geometry.attributes.color.needsUpdate = true;
  }
  update(dt) {
    let alive = false;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      alive = true; const j = i * 3; this.life[i] -= dt;
      if (this.life[i] <= 0) { this.positions[j + 1] = -100; continue; }
      this.velocities[j + 1] -= 3 * dt;
      for (let axis = 0; axis < 3; axis++) this.positions[j + axis] += this.velocities[j + axis] * dt;
    }
    this.points.visible = alive; this.geometry.attributes.position.needsUpdate = true;
  }
}

export class Stadium {
  constructor(canvas, teams, { quality = 'normal', warn = () => {} } = {}) {
    this.quality = viewConfig.quality[quality]; this.teams = teams;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.Fog('#0a1b17', 32, 65);
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: this.quality.antialias, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1); this.renderer.setClearColor(0x071918, 0);
    this.renderer.shadowMap.enabled = this.quality.shadows; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.2;
    this.camera = new THREE.OrthographicCamera(-12, 12, 9.5, -9.5, 0.1, 100); this.camera.position.set(0, 20, 16); this.camera.lookAt(0, 0, 0);
    this.cameraBase = this.camera.position.clone();
    this.scene.add(new THREE.HemisphereLight('#e6f1df', '#233e32', 2.2));
    const key = new THREE.DirectionalLight('#fff0c9', 3.4); key.position.set(-6, 14, 5); key.castShadow = this.quality.shadows;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -14; key.shadow.camera.right = 14; key.shadow.camera.top = 14; key.shadow.camera.bottom = -14; key.shadow.normalBias = 0.04; key.shadow.bias = -0.0002; this.scene.add(key);
    const fill = new THREE.DirectionalLight('#b3d6f2', 1.5); fill.position.set(5, 8, -6); this.scene.add(fill);
    this.teamMaterials = {};
    this.buildField();
    configureCharacters({ teams, low: quality === 'low', warn });
    this.characters = {};
    for (const id of ['cr7', 'm10']) {
      const character = createCharacter(id); this.characters[id] = character;
      character.object3d.position.set(id === 'cr7' ? -1.2 : 1.2, 0.16, id === 'cr7' ? 3 : -3);
      character.object3d.rotation.y = id === 'cr7' ? Math.PI : 0; this.scene.add(character.object3d);
    }
    this.ball = makeBall(0.32, this.quality.segments); this.ball.position.set(0, 0.48, 0); this.scene.add(this.ball);
    this.ballHalo = new THREE.Mesh(new THREE.RingGeometry(0.47, 0.5, 40), new THREE.MeshBasicMaterial({ color: '#e2dba9', transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    this.ballHalo.rotation.x = -Math.PI / 2; this.ballHalo.position.y = 0.18; this.scene.add(this.ballHalo);
    this.smallBalls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.105, 6, 6), new THREE.MeshBasicMaterial({ color: '#fff4bf' }), 30);
    this.smallBalls.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.smallBalls.frustumCulled = false; this.smallBalls.count = 0; this.scene.add(this.smallBalls);
    this.smallDummy = new THREE.Object3D(); this.color = new THREE.Color();
    this.particles = new ParticlePool(this.scene, this.quality.particles);
    this.rings = Array.from({ length: 6 }, () => {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.88, 1, 40), new THREE.MeshBasicMaterial({ color: '#fff4ba', transparent: true, side: THREE.DoubleSide, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.visible = false; mesh.position.y = 0.21; this.scene.add(mesh); return { mesh, left: 0 };
    });
    this.golden = Array.from({ length: 2 }, () => {
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), new THREE.MeshStandardMaterial({ color: '#ffd05b', emissive: '#ba7c14', emissiveIntensity: 0.7, roughness: 0.23, metalness: 0.65 }));
      mesh.visible = false; this.scene.add(mesh); return { mesh, left: 0, impacted: false };
    });
    this.freeze = {};
    for (const id of ['cr7', 'm10']) {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(9.7, 8.4, 4, 4), new THREE.MeshBasicMaterial({ color: '#98d9fa', transparent: true, opacity: 0.27, side: THREE.DoubleSide, depthWrite: false }));
      mesh.rotation.x = -Math.PI / 2; mesh.position.set(0, 0.2, id === 'cr7' ? 4.25 : -4.25); mesh.visible = false; this.freeze[id] = mesh; this.scene.add(mesh);
      const wire = new THREE.Mesh(new THREE.PlaneGeometry(9.7, 8.4, 9, 8), new THREE.MeshBasicMaterial({ color: '#dbf8ff', transparent: true, opacity: 0.35, wireframe: true, depthWrite: false })); wire.position.z = 0.01; mesh.add(wire);
    }
    this.state = null; this.ballZ = 0; this.shake = 0; this.speedUp = 0; this.elapsed = 0;
    this.locks = { cr7: 0, m10: 0 }; this.resultFireworks = 0; this.lastResult = null;
    this.resize();
  }
  resize() {
    // CSS transforms scale the 1080px layout; the drawing buffer remains at pixelRatio 1.
    const parent = this.renderer.domElement.parentElement;
    const width = parent.clientWidth, height = parent.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    const half = 9.5; this.camera.left = -half * width / height; this.camera.right = half * width / height; this.camera.top = half; this.camera.bottom = -half; this.camera.updateProjectionMatrix();
  }
  buildField() {
    const ground = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 20.3), new THREE.MeshStandardMaterial({ color: '#142d26', roughness: 0.85 })); ground.position.y = -0.2; ground.receiveShadow = true; this.scene.add(ground);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.2, 19.5), new THREE.MeshStandardMaterial({ color: '#597a53', roughness: 0.85 })); rim.position.y = 0.03; this.scene.add(rim);
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 18), new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 })); pitch.rotation.x = -Math.PI / 2; pitch.position.y = 0.15; pitch.receiveShadow = true; this.scene.add(pitch);
    for (const id of ['cr7', 'm10']) {
      const color = this.teams[id].color; const material = new THREE.MeshStandardMaterial({ color, roughness: 0.65, emissive: color, emissiveIntensity: 0.15 }); this.teamMaterials[id] = material;
      const z = id === 'cr7' ? 8.5 : -8.5, direction = Math.sign(z);
      const goal = new THREE.Group(); goal.position.set(0, 0.17, z); this.scene.add(goal);
      const post = new THREE.MeshStandardMaterial({ color: '#edf2d6', roughness: 0.4 });
      for (const x of [-2, 2]) { const upright = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 1.7, 8), post); upright.position.set(x, 0.85, 0); upright.castShadow = true; goal.add(upright); }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 4.12, 8), post); bar.rotation.z = Math.PI / 2; bar.position.y = 1.7; goal.add(bar);
      const points = [];
      for (let x = -2; x <= 2.01; x += 0.25) points.push(x, 0, direction * 0.9, x, 1.7, direction * 0.9, x, 1.7, 0, x, 1.7, direction * 0.9);
      for (let y = 0; y <= 1.71; y += 0.22) points.push(-2, y, direction * 0.9, 2, y, direction * 0.9, -2, y, 0, -2, y, direction * 0.9, 2, y, 0, 2, y, direction * 0.9);
      const netGeometry = new THREE.BufferGeometry(); netGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      goal.add(new THREE.LineSegments(netGeometry, new THREE.LineBasicMaterial({ color: '#c6d6bb', transparent: true, opacity: 0.45 })));
      const advertising = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.3, 0.12), material); advertising.position.set(0, 0.4, z + direction * 1.1); this.scene.add(advertising);
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 8.7), material); side.position.set(id === 'cr7' ? -5.7 : 5.7, 0.4, 0); this.scene.add(side);
    }
    // Repeated seats are instanced, not separate meshes.
    const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.26, 0.28), new THREE.MeshStandardMaterial({ color: '#6b8b71', roughness: 1 }), 96);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 96; i++) { dummy.position.set((i < 48 ? -1 : 1) * (5.65 + Math.floor(i % 48 / 24) * 0.45), 0.37 + Math.floor(i % 48 / 24) * 0.17, -8.5 + (i % 24) * 0.72); dummy.updateMatrix(); seats.setMatrixAt(i, dummy.matrix); }
    this.scene.add(seats);
    const poleMat = new THREE.MeshStandardMaterial({ color: '#5c7064', roughness: 0.8 });
    const lightMat = new THREE.MeshBasicMaterial({ color: '#e5edcc' });
    for (const x of [-5.7, 5.7]) for (const z of [-8.7, 8.7]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 3.6, 6), poleMat); pole.position.set(x, 1.8, z); this.scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.35, 0.13), lightMat); lamp.position.set(x, 3.6, z); lamp.rotation.x = -0.3; this.scene.add(lamp);
    }
  }
  setState(state, snap = false) {
    if (this.state && this.state.matchId !== state.matchId) {
      this.locks.cr7 = this.locks.m10 = 0; this.shake = this.speedUp = this.resultFireworks = 0;
      this.particles.life.fill(0); this.particles.positions.fill(-100);
      for (const slot of [...this.rings, ...this.golden]) { slot.left = 0; slot.mesh.visible = false; }
    }
    if (snap || this.state?.matchId !== state.matchId || state.goalPauseLeft > 0) this.ballZ = -Math.max(-1, Math.min(1, state.ballPos / state.fieldLimit)) * 8.5;
    this.state = state;
    if (state.phase === 'RESULT' && this.lastResult !== state.matchId) { this.lastResult = state.matchId; this.resultFireworks = 5; this.fireworks(state.result?.winner); }
  }
  ring(color, z = this.ballZ) { const slot = this.rings.find(item => item.left <= 0) || this.rings[0]; slot.left = 1; slot.mesh.material.color.set(color); slot.mesh.position.z = z; slot.mesh.visible = true; }
  fireworks(team) {
    this.particles.burst(-3, 2.5, -3, team ? this.teams[team].color : '#e7d191', 70);
    this.particles.burst(3, 2.8, 3, '#ffdc83', 70);
  }
  event(event) {
    const team = event.team, color = this.teams[team]?.color || '#f2d683';
    if (event.type === 'goal') { this.shake = 0.65; this.ballZ = 0; this.ball.position.z = 0; this.fireworks(team); this.ring(color, 0); if (team) { this.characters[team].play('celebrate', { restart: true }); this.locks[team] = 2.8; const other = team === 'cr7' ? 'm10' : 'cr7'; this.characters[other].play('defeated'); this.locks[other] = 2.8; } }
    if (event.type === 'gift_skill') {
      this.speedUp = 1.2;
      if (team) { this.characters[team].play('kick', { restart: true, returnTo: 'run' }); this.locks[team] = 0.9; }
      if (event.skill === 'special') { this.ring(color); this.particles.burst(0, 0.4, this.ballZ, color, 35); }
      if (event.skill === 'golden') {
        const slot = this.golden.find(item => item.left <= 0) || this.golden[0]; slot.left = 2.2; slot.impacted = false; slot.mesh.visible = true; slot.mesh.position.set(0, 9, this.ballZ);
      }
    }
    if (event.type === 'result') this.fireworks(event.team);
    if (event.type === 'freeze') this.particles.burst(0, 1, team === 'cr7' ? -4 : 4, '#bde9ff', 60);
  }
  update(dt) {
    this.elapsed += dt; const state = this.state;
    if (!state) return;
    const target = -Math.max(-1, Math.min(1, state.ballPos / state.fieldLimit)) * 8.5;
    const oldZ = this.ballZ; this.ballZ = THREE.MathUtils.damp(this.ballZ, target, 18, dt);
    this.ball.position.z = this.ballZ; this.ball.position.y = 0.49 + Math.sin(this.elapsed * 5) * 0.015;
    this.ball.rotation.x += (this.ballZ - oldZ) / 0.32; this.ballHalo.position.z = this.ballZ;
    this.ballHalo.scale.setScalar(1 + Math.sin(this.elapsed * 4) * 0.08);
    for (const team of ['cr7', 'm10']) {
      const character = this.characters[team], sign = team === 'cr7' ? 1 : -1;
      this.locks[team] = Math.max(0, this.locks[team] - dt);
      if (this.locks[team] === 0) {
        let action = 'idle';
        if (state.phase === 'RESULT') action = state.result?.winner === team ? 'celebrate' : state.result?.winner ? 'defeated' : 'idle';
        else if (['PLAYING', 'OVERTIME'].includes(state.phase) && state.goalPauseLeft <= 0 && !state.teams[team].frozen) action = state.forces[team] > state.forces[team === 'cr7' ? 'm10' : 'cr7'] ? 'run' : 'idle';
        character.play(action, { loop: true });
      }
      const desiredZ = Math.max(-5.8, Math.min(5.8, this.ballZ * 0.32 + sign * 2.2));
      character.object3d.position.z = THREE.MathUtils.damp(character.object3d.position.z, desiredZ, 3, dt);
      character.update(dt);
      this.freeze[team].visible = state.teams[team].frozen;
      this.freeze[team].material.opacity = 0.25 + Math.sin(this.elapsed * 3) * 0.045;
    }
    const small = state.smallBalls || []; this.smallBalls.count = Math.min(small.length, 30);
    for (let i = 0; i < this.smallBalls.count; i++) {
      const item = small[i], sign = item.team === 'cr7' ? 1 : -1;
      const p = Math.min(1, item.progress + (this.speedUp > 0 ? Math.sin(item.progress * Math.PI) * 0.07 : 0));
      this.smallDummy.position.set((item.lane - 0.5) * 7.5, 0.3 + Math.sin(p * Math.PI) * 1.2, sign * (6.7 - p * 13.4));
      this.smallDummy.scale.setScalar(this.speedUp > 0 ? 1.3 : 1); this.smallDummy.updateMatrix(); this.smallBalls.setMatrixAt(i, this.smallDummy.matrix);
      this.smallBalls.setColorAt(i, this.color.set(this.teams[item.team]?.color || '#ffffff'));
    }
    this.smallBalls.instanceMatrix.needsUpdate = true; if (this.smallBalls.instanceColor) this.smallBalls.instanceColor.needsUpdate = true;
    this.speedUp = Math.max(0, this.speedUp - dt);
    for (const slot of this.rings) {
      if (slot.left <= 0) continue; slot.left -= dt; slot.mesh.visible = slot.left > 0; slot.mesh.scale.setScalar(1 + (1 - slot.left) * 5); slot.mesh.material.opacity = Math.max(0, slot.left) * 0.8;
    }
    for (const slot of this.golden) {
      if (slot.left <= 0) continue; slot.left -= dt;
      const age = 2.2 - slot.left; slot.mesh.position.y = Math.max(0.8, 9 - age * age * 13); slot.mesh.rotation.y += dt * 3;
      if (slot.mesh.position.y <= 0.8 && !slot.impacted) { slot.impacted = true; this.ring('#ffda73', slot.mesh.position.z); this.particles.burst(0, 0.8, slot.mesh.position.z, '#ffe2a0', 80); }
      slot.mesh.scale.setScalar(slot.left < 0.5 ? Math.max(0, slot.left * 2) : 1); slot.mesh.visible = slot.left > 0;
    }
    if (this.resultFireworks > 0) { const before = Math.floor(this.resultFireworks); this.resultFireworks -= dt; if (Math.floor(this.resultFireworks) !== before) this.fireworks(state.result?.winner); }
    this.particles.update(dt);
    this.shake = Math.max(0, this.shake - dt); this.camera.position.copy(this.cameraBase);
    if (this.shake) this.camera.position.x += Math.sin(this.elapsed * 55) * this.shake * 0.1;
    this.camera.lookAt(0, 0, 0); this.renderer.render(this.scene, this.camera);
  }
  dispose() { for (const character of Object.values(this.characters)) { this.scene.remove(character.object3d); character.dispose(); } disposeObject(this.scene); this.renderer.dispose(); }
}
