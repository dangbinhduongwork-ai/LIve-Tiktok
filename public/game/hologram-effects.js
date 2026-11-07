import * as THREE from 'three';

export function glowTexture() {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'#ffffff'); gradient.addColorStop(.15,'#ffffffc0'); gradient.addColorStop(.45,'#ffffff35'); gradient.addColorStop(1,'#ffffff00');
  ctx.fillStyle = gradient; ctx.fillRect(0,0,64,64);
  return new THREE.CanvasTexture(canvas);
}

export class ParticlePool {
  constructor(scene, capacity, texture) {
    this.capacity = capacity; this.cursor = 0;
    this.positions = new Float32Array(capacity * 3).fill(-100);
    this.colors = new Float32Array(capacity * 3); this.velocities = new Float32Array(capacity * 3); this.life = new Float32Array(capacity);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.PointsMaterial({ size:.65, map:texture, vertexColors:true, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, toneMapped:false });
    this.points = new THREE.Points(this.geometry, this.material); this.points.frustumCulled = false; scene.add(this.points); this.color = new THREE.Color();
  }
  burst(x,y,z,color,count=65) {
    this.color.set(color);
    for(let n=0;n<Math.min(count,this.capacity);n++) {
      const i=this.cursor++%this.capacity,j=i*3; this.life[i]=1.2+Math.random()*1.8;
      this.positions[j]=x;this.positions[j+1]=y;this.positions[j+2]=z;
      this.velocities[j]=(Math.random()-.5)*7;this.velocities[j+1]=1.6+Math.random()*3;this.velocities[j+2]=(Math.random()-.5)*5;
      this.colors[j]=this.color.r;this.colors[j+1]=this.color.g;this.colors[j+2]=this.color.b;
    }
    this.geometry.attributes.color.needsUpdate=true;
  }
  reset(){this.life.fill(0);this.positions.fill(-100);}
  update(dt) {
    let alive=false;
    for(let i=0;i<this.capacity;i++) {
      if(this.life[i]<=0)continue; alive=true;const j=i*3;this.life[i]-=dt;
      if(this.life[i]<=0){this.positions[j+1]=-100;continue;}
      this.velocities[j+1]-=3*dt;
      for(let axis=0;axis<3;axis++)this.positions[j+axis]+=this.velocities[j+axis]*dt;
    }
    this.points.visible=alive;this.geometry.attributes.position.needsUpdate=true;
  }
}

export function makeBall(radius, segments) {
  const group = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(radius,segments,segments),new THREE.MeshStandardMaterial({color:'#f5fcff',emissive:'#b2e7ff',emissiveIntensity:.3,roughness:.45}));
  ball.castShadow=true;group.add(ball);
  const geometry=new THREE.CircleGeometry(radius*.33,5), material=new THREE.MeshStandardMaterial({color:'#081728',roughness:.6,side:THREE.DoubleSide});
  for(let i=0;i<8;i++) {
    const angle=i*Math.PI/4,normal=new THREE.Vector3(Math.cos(angle)*.85,i%2?.53:-.53,Math.sin(angle)*.85).normalize();
    const patch=new THREE.Mesh(geometry,material);patch.position.copy(normal).multiplyScalar(radius*1.004);patch.lookAt(normal.multiplyScalar(radius*2));group.add(patch);
  }
  return group;
}

export function makeTrophy(color) {
  const group=new THREE.Group(),material=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.35,roughness:.3,metalness:.5});
  const parts=[
    [new THREE.CylinderGeometry(.15,.25,.12,12),0,.06,0],
    [new THREE.CylinderGeometry(.06,.09,.27,10),0,.23,0],
    [new THREE.CylinderGeometry(.3,.13,.36,16,1,true),0,.52,0]
  ];
  for(const [geometry,x,y,z] of parts){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);group.add(mesh);}
  for(const sign of [-1,1]){const handle=new THREE.Mesh(new THREE.TorusGeometry(.17,.035,6,16,Math.PI*1.5),material);handle.position.set(sign*.25,.51,0);handle.rotation.z=sign<0?Math.PI/4:-Math.PI*3/4;group.add(handle);}
  return group;
}
