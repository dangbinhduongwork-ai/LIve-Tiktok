import * as THREE from 'three';
import { createCharacter, createMiniPlayer, configureCharacters, disposeObject } from './characters.js';
import { viewConfig } from './view.config.js';
import { glowTexture, ParticlePool, makeBall, makeTrophy } from './hologram-effects.js';

const TEAMS = ['cr7', 'm10'];
const side = team => team === 'cr7' ? -1 : 1;
const opponent = team => team === 'cr7' ? 'm10' : 'cr7';
const clamp = THREE.MathUtils.clamp;

function pitchTexture(teams) {
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=768;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#071329';ctx.fillRect(0,0,1536,768);
  for(const team of TEAMS){const x=team==='cr7'?0:1536,g=ctx.createLinearGradient(x,0,768,0);g.addColorStop(0,teams[team].color+'55');g.addColorStop(1,teams[team].color+'04');ctx.fillStyle=g;ctx.fillRect(team==='cr7'?0:768,0,768,768);}
  ctx.strokeStyle='#5ab1d11c';ctx.lineWidth=1;
  ctx.beginPath();for(let x=0;x<1536;x+=48){ctx.moveTo(x,0);ctx.lineTo(x,768);}for(let y=0;y<768;y+=48){ctx.moveTo(0,y);ctx.lineTo(1536,y);}ctx.stroke();
  function lines(){
    ctx.strokeRect(25,25,1486,718);ctx.beginPath();ctx.moveTo(768,25);ctx.lineTo(768,743);ctx.stroke();
    ctx.beginPath();ctx.arc(768,384,116,0,Math.PI*2);ctx.stroke();
    for(const x of [25,1511]){const sign=x<768?1:-1;ctx.strokeRect(x,184,sign*228,400);ctx.strokeRect(x,280,sign*80,208);
      ctx.beginPath();ctx.arc(x+sign*156,384,4,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(x+sign*156,384,116,sign===1?-.9:Math.PI-.9,sign===1?.9:Math.PI+.9);ctx.stroke();}
    ctx.beginPath();ctx.arc(768,384,5,0,Math.PI*2);ctx.fill();
  }
  ctx.strokeStyle=viewConfig.palette.lines;ctx.fillStyle=viewConfig.palette.lines;ctx.lineWidth=3;ctx.shadowColor='#4fd1ff';ctx.shadowBlur=18;lines();ctx.shadowBlur=0;ctx.lineWidth=1.5;lines();
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;return texture;
}

function cylinderBetween(a,b,radius,material){
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,start.distanceTo(end),8),material);
  mesh.position.copy(start).add(end).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());return mesh;
}

export class Stadium {
  constructor(canvas,teams,{quality='normal',warn=()=>{}}={}) {
    this.quality=viewConfig.quality[quality];this.teams=teams;this.state=null;
    this.elapsed=0;this.ballX=0;this.shake=0;this.speedUp=0;this.lastResult=null;this.resultFireworks=0;this.interactionLevel=0;
    this.locks={cr7:0,m10:0};this.goalTeams={cr7:false,m10:false};this.goalPause=false;this.trailSign=1;this.trailStrength=0;
    this.fieldHalf=viewConfig.field.length/2;this.dummy=new THREE.Object3D();this.color=new THREE.Color();this.projected=new THREE.Vector3();
    this.scene=new THREE.Scene();this.scene.fog=new THREE.Fog(viewConfig.palette.background,34,58);
    this.heroScene=new THREE.Scene();
    this.renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:this.quality.antialias,powerPreference:'high-performance'});
    this.renderer.setPixelRatio(1);this.renderer.setClearColor(viewConfig.palette.background,0);this.renderer.autoClear=false;this.renderer.info.autoReset=false;
    this.renderer.shadowMap.enabled=this.quality.shadows;this.renderer.shadowMap.type=THREE.PCFShadowMap;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
    this.camera=new THREE.PerspectiveCamera(viewConfig.camera.fov,1,.1,100);this.cameraBase=new THREE.Vector3(...viewConfig.camera.position);this.cameraTarget=new THREE.Vector3(...viewConfig.camera.target);
    this.camera.position.copy(this.cameraBase);this.camera.lookAt(this.cameraTarget);this.camera.zoom=viewConfig.camera.baseZoom;
    this.heroCamera=new THREE.OrthographicCamera(0,1,1,0,.1,2000);this.heroCamera.position.set(0,0,1000);
    this.scene.add(new THREE.HemisphereLight('#bfdcff','#111628',1.7));
    const key=new THREE.DirectionalLight('#cbeaff',2.6);key.position.set(-6,15,8);key.castShadow=this.quality.shadows;
    key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-13,right:13,top:8,bottom:-8});key.shadow.normalBias=.035;this.scene.add(key);
    this.heroScene.add(new THREE.HemisphereLight('#cdeaff','#1b1c40',2));
    const heroKey=new THREE.DirectionalLight('#ffffff',3);heroKey.position.set(-150,700,800);this.heroScene.add(heroKey);
    for(const team of TEAMS){const rim=new THREE.DirectionalLight(teams[team].color,2);rim.position.set(side(team)*800,300,-100);this.heroScene.add(rim);}
    this.glow=glowTexture();this.buildField();this.buildCrowd();
    configureCharacters({teams,low:quality==='low',warn});this.characters={};this.minis={};this.heroIce={};this.pedestals={};
    const count=clamp(Math.floor(viewConfig.miniPlayers.perTeam),0,viewConfig.miniPlayers.maxPerTeam);
    for(const team of TEAMS){
      const star=createCharacter(team);this.characters[team]=star;this.heroScene.add(star.object3d);
      this.minis[team]=Array.from({length:count},(_,index)=>{const mini=createMiniPlayer(team,index);mini.object3d.position.set(side(team)*(2.3+index*.6),.18,(index-(count-1)/2)*2.9);mini.object3d.rotation.y=-side(team)*Math.PI/2;this.scene.add(mini.object3d);return mini;});
      const pedestal=new THREE.Mesh(new THREE.RingGeometry(48,52,48),new THREE.MeshBasicMaterial({color:teams[team].color,transparent:true,opacity:.8,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));pedestal.scale.set(1.7,.32,1);this.heroScene.add(pedestal);this.pedestals[team]=pedestal;
      const ice=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshBasicMaterial({color:'#a0eaff',wireframe:true,transparent:true,opacity:.5,depthWrite:false}));ice.visible=false;this.heroScene.add(ice);this.heroIce[team]=ice;
    }
    this.trophy=makeTrophy(viewConfig.palette.gold);this.trophy.visible=false;this.heroScene.add(this.trophy);
    this.ball=makeBall(.34,this.quality.segments);this.scene.add(this.ball);this.ball.position.y=.53;
    this.ballGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color:viewConfig.palette.lines,transparent:true,opacity:.65,blending:THREE.AdditiveBlending,depthWrite:false}));this.ballGlow.scale.setScalar(1.65);this.scene.add(this.ballGlow);
    this.trail=new THREE.InstancedMesh(new THREE.SphereGeometry(.13,6,6),new THREE.MeshBasicMaterial({color:'#96eaff',transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false}),16);this.trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.trail.frustumCulled=false;this.scene.add(this.trail);
    this.smallBalls=new THREE.InstancedMesh(new THREE.SphereGeometry(.13,6,6),new THREE.MeshBasicMaterial({color:'#ffffff'}),30);
    this.smallTrails=new THREE.InstancedMesh(new THREE.SphereGeometry(1,6,4),new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false}),30);
    for(const mesh of [this.smallBalls,this.smallTrails]){mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;this.scene.add(mesh);}
    this.particles=new ParticlePool(this.scene,this.quality.particles,this.glow);
    this.rings=Array.from({length:6},()=>{const mesh=new THREE.Mesh(new THREE.RingGeometry(.86,1,48),new THREE.MeshBasicMaterial({color:'#fff',transparent:true,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));mesh.rotation.x=-Math.PI/2;mesh.position.y=.22;mesh.visible=false;this.scene.add(mesh);return{mesh,left:0};});
    this.golden=Array.from({length:2},()=>{const mesh=new THREE.Mesh(new THREE.IcosahedronGeometry(.6,2),new THREE.MeshStandardMaterial({color:viewConfig.palette.gold,emissive:viewConfig.palette.gold,emissiveIntensity:1,roughness:.25,metalness:.5}));mesh.visible=false;const aura=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glow,color:viewConfig.palette.gold,transparent:true,opacity:.75,blending:THREE.AdditiveBlending,depthWrite:false}));aura.scale.setScalar(4);mesh.add(aura);this.scene.add(mesh);return{mesh,left:0,impacted:false};});
    this.resize();
  }

  buildField(){
    const {length,width}=viewConfig.field;
    const deck=new THREE.Mesh(new THREE.BoxGeometry(length+1.1,.35,width+1.1),new THREE.MeshStandardMaterial({color:'#07172d',metalness:.3,roughness:.5}));deck.position.y=-.1;this.scene.add(deck);
    const texture=pitchTexture(this.teams);const pitch=new THREE.Mesh(new THREE.PlaneGeometry(length,width),new THREE.MeshStandardMaterial({map:texture,emissiveMap:texture,emissive:'#ffffff',emissiveIntensity:.65,roughness:.85}));pitch.rotation.x=-Math.PI/2;pitch.position.y=.09;pitch.receiveShadow=true;this.scene.add(pitch);
    const outline=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-length/2-.4,.1,-width/2-.4),new THREE.Vector3(length/2+.4,.1,-width/2-.4),new THREE.Vector3(length/2+.4,.1,width/2+.4),new THREE.Vector3(-length/2-.4,.1,width/2+.4)]);
    this.scene.add(new THREE.LineLoop(outline,new THREE.LineBasicMaterial({color:viewConfig.palette.lines,transparent:true,opacity:.65,blending:THREE.AdditiveBlending})));
    const grid=new THREE.GridHelper(44,44,'#184f6c','#10324b');grid.position.y=-.32;grid.material.transparent=true;grid.material.opacity=.45;this.scene.add(grid);
    this.halves={};this.freeze={};
    for(const team of TEAMS){
      const sign=side(team),color=this.teams[team].color;
      const half=new THREE.Mesh(new THREE.PlaneGeometry(length/2,width),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.04,blending:THREE.AdditiveBlending,depthWrite:false}));half.rotation.x=-Math.PI/2;half.position.set(sign*length/4,.12,0);this.scene.add(half);this.halves[team]=half;
      const ice=new THREE.Mesh(new THREE.PlaneGeometry(length/2,width,8,8),new THREE.MeshBasicMaterial({color:'#73dbff',transparent:true,opacity:.22,depthWrite:false}));ice.rotation.x=-Math.PI/2;ice.position.set(sign*length/4,.2,0);ice.visible=false;
      const wire=new THREE.Mesh(new THREE.PlaneGeometry(length/2,width,7,7),new THREE.MeshBasicMaterial({color:'#c8f4ff',transparent:true,opacity:.45,wireframe:true,depthWrite:false}));wire.position.z=.01;ice.add(wire);this.scene.add(ice);this.freeze[team]=ice;
      const goal=new THREE.Group();goal.position.set(sign*(length/2-.33),.12,0);this.scene.add(goal);
      const frame=new THREE.MeshStandardMaterial({color:this.teams[team].lightColor||'#eff8ff',emissive:color,emissiveIntensity:1,roughness:.4});
      for(const z of [-1.65,1.65])goal.add(cylinderBetween([0,0,z],[0,1.75,z],.055,frame));goal.add(cylinderBetween([0,1.75,-1.65],[0,1.75,1.65],.055,frame));
      const points=[];
      for(let z=-1.65;z<1.66;z+=.22)points.push(sign,0,z,sign,1.75,z,sign,1.75,z,0,1.75,z);
      for(let y=0;y<1.76;y+=.22)points.push(sign,y,-1.65,sign,y,1.65,0,y,-1.65,sign,y,-1.65,0,y,1.65,sign,y,1.65);
      const net=new THREE.BufferGeometry();net.setAttribute('position',new THREE.Float32BufferAttribute(points,3));goal.add(new THREE.LineSegments(net,new THREE.LineBasicMaterial({color,transparent:true,opacity:.65})));
    }
  }

  buildCrowd(){
    const count=this.quality.ledBars;this.ledData=[];
    this.ledBars=new THREE.InstancedMesh(new THREE.BoxGeometry(.23,1,.2),new THREE.MeshBasicMaterial({color:'#ffffff',toneMapped:false}),count);this.ledBars.frustumCulled=false;this.ledBars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const back=Math.floor(count*.7),sideCount=Math.floor((count-back)/2);
    for(let i=0;i<count;i++){
      let x,z;if(i<back){x=-11.4+i/(back-1)*22.8;z=-6.3;}else{const j=i-back;x=j<sideCount?-11.4:11.4;z=-5.7+(j%sideCount)/Math.max(1,sideCount-1)*10.8;}
      this.ledData.push({x,z,phase:i*.73});this.ledBars.setColorAt(i,this.color.set(this.teams[x<0?'cr7':'m10'].color));
    }
    this.scene.add(this.ledBars);
    for(let row=0;row<3;row++){
      const led=new THREE.Mesh(new THREE.BoxGeometry(23.6,.035,.035),new THREE.MeshBasicMaterial({color:viewConfig.palette.lines,transparent:true,opacity:.18+row*.06,blending:THREE.AdditiveBlending}));led.position.set(0,.16+row*.4,-6.6-row*.5);this.scene.add(led);
    }
  }

  resize(){
    const parent=this.renderer.domElement.parentElement;this.width=parent.clientWidth;this.height=parent.clientHeight;if(!this.width||!this.height)return;
    this.renderer.setSize(this.width,this.height,false);this.fieldHeight=Math.round(this.height*viewConfig.field.viewportFraction);
    this.camera.aspect=this.width/this.fieldHeight;this.camera.updateProjectionMatrix();
    this.heroCamera.right=this.width;this.heroCamera.top=this.height;this.heroCamera.updateProjectionMatrix();
    for(const team of TEAMS){const star=this.characters[team],x=team==='cr7'?viewConfig.stars.inset:this.width-viewConfig.stars.inset;
      star.object3d.scale.setScalar(viewConfig.stars.height/star.height);star.object3d.position.set(x,viewConfig.stars.floor,0);star.object3d.rotation.y=-side(team)*viewConfig.stars.angle;
      this.pedestals[team].position.set(x,viewConfig.stars.floor+2,-20);this.heroIce[team].position.set(x,viewConfig.stars.floor+viewConfig.stars.height*.48,40);this.heroIce[team].scale.set(viewConfig.stars.height*.26,viewConfig.stars.height*.55,30);
    }
  }

  // Convert world points to canvas pixels for goal labels and occlusion checks.
  project(x,y,z){this.projected.set(x,y,z).project(this.camera);return{x:(this.projected.x+1)*this.width/2,y:(1-this.projected.y)*this.fieldHeight/2+viewConfig.field.offsetY};}
  interaction(type,count=1){const impulse=type==='like'?viewConfig.crowd.likeImpulse:viewConfig.crowd.chatImpulse;this.interactionLevel=Math.min(2.5,this.interactionLevel+Math.min(100,Math.max(0,count))*impulse);}
  setState(state,snap=false){
    const changed=this.state?.matchId!==state.matchId;
    if(changed){this.locks.cr7=this.locks.m10=0;this.shake=this.speedUp=this.resultFireworks=this.interactionLevel=this.trailStrength=0;this.particles.reset();this.goalPause=false;for(const slot of [...this.rings,...this.golden]){slot.left=0;slot.mesh.visible=false;}}
    if(snap||changed||state.goalPauseLeft>0)this.ballX=clamp(state.ballPos/state.fieldLimit,-1,1)*(this.fieldHalf-.33);
    this.state=state;
    if(state.phase==='RESULT'&&this.lastResult!==state.matchId){this.lastResult=state.matchId;this.resultFireworks=6;this.fireworks(state.result?.winner);}
  }
  ring(color,x=this.ballX){const slot=this.rings.find(item=>item.left<=0)||this.rings[0];slot.left=1;slot.mesh.material.color.set(color);slot.mesh.position.x=x;slot.mesh.visible=true;}
  fireworks(team){this.particles.burst(-8.2,.75,1,team?this.teams[team].color:viewConfig.palette.gold,70);this.particles.burst(8.2,.75,1,viewConfig.palette.gold,70);}
  event(event){
    const team=event.team,color=this.teams[team]?.color||viewConfig.palette.gold;
    if(event.type==='goal'){
      this.shake=this.quality.cameraMotion ? .6 : 0;this.ballX=0;this.goalPause=true;this.trailStrength=0;this.fireworks(team);this.ring(color,0);
      if(this.characters[team]){for(const id of TEAMS){const won=id===team;this.goalTeams[id]=won;this.characters[id].play(won?'celebrate':'defeated',{restart:true,style:won?'goal':'',loop:false});this.locks[id]=viewConfig.effects.goalSeconds;for(const mini of this.minis[id])mini.play(won?'celebrate':'defeated',{restart:true,loop:false});}}
    }
    if(event.type==='gift_skill'){
      this.speedUp=1.2;this.interactionLevel=Math.min(2.5,this.interactionLevel+.4);
      if(this.minis[team]?.length)this.minis[team][0].play('kick',{restart:true,returnTo:'run'});
      if(event.skill==='special'){this.ring(color);this.particles.burst(this.ballX,.5,0,color,45);}
      if(event.skill==='golden'){const slot=this.golden.find(item=>item.left<=0)||this.golden[0];slot.left=2.2;slot.impacted=false;slot.mesh.position.set(this.ballX,viewConfig.effects.goldenHeight,0);slot.mesh.visible=true;}
    }
    if(event.type==='freeze')this.particles.burst(-side(team)*5,1,0,'#b4edff',60);
    if(event.type==='overtime'){this.interactionLevel=2;this.ring(viewConfig.palette.gold,0);}
  }

  updatePlayers(dt){
    const state=this.state,total=state.forces.cr7+state.forces.m10;
    for(const team of TEAMS){
      const sign=side(team),star=this.characters[team],frozen=state.teams[team].frozen,advantage=state.forces[team]>state.forces[opponent(team)],active=['PLAYING','OVERTIME'].includes(state.phase)&&state.goalPauseLeft<=0;
      this.locks[team]=Math.max(0,this.locks[team]-dt);
      if(this.locks[team]===0){
        let action='idle',style='';
        if(state.phase==='RESULT') {action=state.result?.winner===team?'celebrate':state.result?.winner?'defeated':'idle';style='goal';}
        else if(state.phase==='WAITING')style=team==='cr7'?'warmup':'';
        else if(active&&!frozen){action=advantage?'celebrate':'idle';style=advantage?'cheer':'tense';}
        star.play(action,{loop:true,style});
      }
      if(!frozen)star.update(dt);
      if(!frozen){const look=clamp(this.ballX/this.fieldHalf,-1,1)*.08;star.object3d.rotation.y=-sign*viewConfig.stars.angle+look;}
      this.heroIce[team].visible=frozen;this.freeze[team].visible=frozen;
      this.halves[team].material.opacity=.035+(total>0?state.forces[team]/total*.09:0);
      const count=this.minis[team].length;
      for(let index=0;index<count;index++){
        const mini=this.minis[team][index],root=mini.object3d;
        if(!frozen){
          if(active){const targetX=clamp(this.ballX+sign*(1.2+index*1.65),-this.fieldHalf+1.4,this.fieldHalf-1.4);const lane=index===0?0:(index%2?-1:1)*Math.ceil(index/2)*3.2/Math.max(1,Math.ceil((count-1)/2));const targetZ=lane+Math.sin(this.elapsed*1.8+index)*.18;
            root.position.x=THREE.MathUtils.damp(root.position.x,targetX,2.3,dt);root.position.z=THREE.MathUtils.damp(root.position.z,targetZ,2.3,dt);root.rotation.y=THREE.MathUtils.damp(root.rotation.y,-sign*Math.PI/2,4,dt);}
          if(this.locks[team]===0&&mini.state!=='kick')mini.play(state.phase==='RESULT'?(state.result?.winner===team?'celebrate':state.result?.winner?'defeated':'idle'):active?'run':'idle',{loop:true});
          const speed=active?.7+Math.min(1.1,Math.sqrt(Math.max(0,state.forces[team]))*.09):1;mini.update(dt*speed);
        }
      }
    }
    this.trophy.visible=state.phase==='RESULT'&&!!state.result?.winner;
    if(this.trophy.visible){const star=this.characters[state.result.winner].object3d;this.trophy.scale.setScalar(95);this.trophy.position.set(star.position.x,viewConfig.stars.floor+viewConfig.stars.height+8+Math.sin(this.elapsed*2)*7,80);this.trophy.rotation.y=Math.sin(this.elapsed)*.3;}
  }

  update(dt){
    this.elapsed+=dt;const state=this.state;if(!state)return;
    const target=state.goalPauseLeft>0?0:clamp(state.ballPos/state.fieldLimit,-1,1)*(this.fieldHalf-.33);
    const old=this.ballX;this.ballX=THREE.MathUtils.damp(this.ballX,target,18,dt);const movement=this.ballX-old;
    this.ball.position.set(this.ballX,.5+Math.sin(this.elapsed*5)*.018,0);this.ball.rotation.z-=movement/.34;this.ballGlow.position.copy(this.ball.position);
    if(Math.abs(movement)>.0005){this.trailSign=Math.sign(movement);this.trailStrength=1;}else this.trailStrength=Math.max(0,this.trailStrength-dt*.8);
    for(let i=0;i<16;i++){this.dummy.position.set(this.ballX-this.trailSign*(i+1)*.13,.48,0);this.dummy.scale.setScalar((1-i/16)*this.trailStrength);this.dummy.updateMatrix();this.trail.setMatrixAt(i,this.dummy.matrix);}this.trail.instanceMatrix.needsUpdate=true;
    this.updatePlayers(dt);
    const small=state.smallBalls||[];this.smallBalls.count=this.smallTrails.count=Math.min(30,small.length);
    for(let i=0;i<this.smallBalls.count;i++){
      const item=small[i],sign=-side(item.team),p=clamp(item.progress+(this.speedUp>0?Math.sin(item.progress*Math.PI)*.07:0),0,1),x=sign*(-(this.fieldHalf-1)+p*(viewConfig.field.length-2)),y=.45+Math.sin(p*Math.PI)*1.2,z=(item.lane-.5)*(viewConfig.field.width-1);
      this.dummy.position.set(x,y,z);this.dummy.scale.setScalar(this.speedUp>0?1.3:1);this.dummy.updateMatrix();this.smallBalls.setMatrixAt(i,this.dummy.matrix);this.smallBalls.setColorAt(i,this.color.set(this.teams[item.team]?.lightColor||'#dff8ff'));
      this.dummy.position.x-=sign*.45;this.dummy.scale.set(this.speedUp>0?.85:.6,.035,.035);this.dummy.updateMatrix();this.smallTrails.setMatrixAt(i,this.dummy.matrix);this.smallTrails.setColorAt(i,this.color.set(this.teams[item.team]?.color||'#9ff4ff'));
    }
    for(const mesh of [this.smallBalls,this.smallTrails]){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
    this.speedUp=Math.max(0,this.speedUp-dt);this.interactionLevel*=Math.exp(-dt/viewConfig.crowd.decaySeconds);
    const tempo=state.phase==='OVERTIME'?7:3;
    for(let i=0;i<this.ledData.length;i++){const led=this.ledData[i],height=.16+(.12+this.interactionLevel)*(0.3+Math.abs(Math.sin(this.elapsed*tempo+led.phase)));this.dummy.position.set(led.x,height/2+.12,led.z);this.dummy.scale.set(1,height,1);this.dummy.updateMatrix();this.ledBars.setMatrixAt(i,this.dummy.matrix);}this.ledBars.instanceMatrix.needsUpdate=true;
    for(const slot of this.rings){if(slot.left<=0)continue;slot.left-=dt;slot.mesh.visible=slot.left>0;slot.mesh.scale.setScalar(1+(1-slot.left)*5);slot.mesh.material.opacity=Math.max(0,slot.left)*.65;}
    for(const slot of this.golden){if(slot.left<=0)continue;slot.left-=dt;const age=2.2-slot.left;slot.mesh.position.y=Math.max(.8,viewConfig.effects.goldenHeight-(viewConfig.effects.goldenHeight-.8)*(age/viewConfig.effects.goldenFallSeconds)**2);slot.mesh.rotation.y+=dt*3;
      if(slot.mesh.position.y<=.8&&!slot.impacted){slot.impacted=true;this.ring(viewConfig.palette.gold,slot.mesh.position.x);this.particles.burst(slot.mesh.position.x,.8,0,viewConfig.palette.gold,85);}
      slot.mesh.scale.setScalar(slot.left<.5?Math.max(0,slot.left*2):1);slot.mesh.visible=slot.left>0;}
    if(this.resultFireworks>0){const before=Math.floor(this.resultFireworks);this.resultFireworks-=dt;if(Math.floor(this.resultFireworks)!==before)this.fireworks(state.result?.winner);}
    this.particles.update(dt);this.shake=Math.max(0,this.shake-dt);this.camera.position.copy(this.cameraBase);
    let zoom=viewConfig.camera.baseZoom;
    if(this.quality.cameraMotion){this.camera.position.x+=Math.sin(this.elapsed*.25)*viewConfig.camera.drift+Math.sin(this.elapsed*55)*this.shake*.13;zoom*=1+Math.max(0,Math.abs(this.ballX)/this.fieldHalf-.65)/.35*viewConfig.camera.goalZoom;}
    this.camera.lookAt(this.cameraTarget);this.camera.zoom=THREE.MathUtils.damp(this.camera.zoom,zoom,2,dt);this.camera.updateProjectionMatrix();
    this.renderer.info.reset();this.renderer.setViewport(0,0,this.width,this.height);this.renderer.clear();
    this.renderer.setViewport(0,this.height-this.fieldHeight-viewConfig.field.offsetY,this.width,this.fieldHeight);this.renderer.render(this.scene,this.camera);
    this.renderer.clearDepth();this.renderer.setViewport(0,0,this.width,this.height);this.renderer.render(this.heroScene,this.heroCamera);
  }
  dispose(){
    for(const team of TEAMS){this.heroScene.remove(this.characters[team].object3d);this.characters[team].dispose();for(const mini of this.minis[team]){this.scene.remove(mini.object3d);mini.dispose();}}
    this.scene.traverse(node=>node.shadow?.dispose());disposeObject(this.scene);disposeObject(this.heroScene);this.renderer.dispose();
  }
}
