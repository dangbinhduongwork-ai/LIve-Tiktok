import * as THREE from 'three';
import { configureCharacters, createCharacter, prepareClip, managerFor } from '../characters.js';
import { characters } from '../characters.config.js';
import { mapClips, resolveClip, inferPositionScale, canonicalBone, localAssetUrl } from '../character-rules.js';

const results = [], warnings = [], pending = [];
const assert = (value, message) => { if (!value) throw new Error(message); };
const near = (a, b, epsilon = 0.0001) => assert(Math.abs(a-b) < epsilon, `${a} khác ${b}`);
async function test(name, run) {
  const row = document.createElement('li'); document.getElementById('results').append(row);
  try { await run(); results.push({ name, passed:true }); row.className='pass'; row.textContent=`ĐẠT · ${name}`; }
  catch (error) { results.push({ name, passed:false, error:error.message }); row.className='fail'; row.textContent=`LỖI · ${name}: ${error.message}`; }
}
async function load(definition) {
  configureCharacters({ configs: { cr7: definition }, teams: { cr7: { color:'#ef4444', shirtNumber:7 } }, warn: message=>warnings.push(message) });
  const character = createCharacter('cr7'); pending.push(character); await character.ready; return character;
}
function bounds(character) { character.object3d.updateMatrixWorld(true); return new THREE.Box3().setFromObject(character.object3d, true); }
await test('Alias không phân biệt hoa thường, khớp chuỗi con', () => {
  const clips = ['Breathing IDLE','Fast RUN','Soccer Kick','Victory','Sad Walk','Jump'].map(name=>({name}));
  const mapped = mapClips(clips); assert(mapped.idle===clips[0] && mapped.kick===clips[2] && mapped.celebrate===clips[3], 'Ghép sai alias');
  assert(mapClips([{name:'CustomWin'}],{celebrate:['customwin']}).celebrate.name==='CustomWin', 'Alias cấu hình không hoạt động');
});
await test('Thiếu clip dùng run/idle; không clip vẫn hợp lệ', () => {
  const run = {name:'Run'}; assert(resolveClip('kick',{run})===run,'Không dùng run');
  const idle = {name:'Idle'}; assert(resolveClip('defeated',{idle})===idle,'Không dùng idle');
  assert(resolveClip('jump',{})===null,'Trạng thái không clip sai');
});
await test('Đường dẫn chỉ dùng tài nguyên cục bộ, có bỏ cache', () => {
  assert(localAssetUrl('cr7/model.glb','test').endsWith('/cr7/model.glb?v=test'),'URL không đúng');
  for (const path of ['https://example.com/model.glb','../../server.js']) {
    let rejected=false; try { localAssetUrl(path); } catch { rejected=true; } assert(rejected,'Đường dẫn ngoài thư mục được chấp nhận');
  }
});
await test('Texture FBX trỏ về file local, giữ đường dẫn ghi đè', () => {
  const manager=managerFor({model:'cr7/model.fbx',textureDirectory:'cr7/textures/',textureFiles:{'Body.png':'cr7/textures/color.png'},textures:{normalMap:'cr7/custom/normal.png'}},'cr7');
  assert(manager.resolveURL(location.origin+'/game/assets/characters/cr7/Body.png')===localAssetUrl('cr7/textures/color.png'),'Không remap tên ảnh');
  assert(manager.resolveURL('https://example.com/body-normal.png')===localAssetUrl('cr7/textures/body-normal.png'),'Còn tải texture ngoài máy');
  assert(manager.resolveURL(localAssetUrl('cr7/custom/normal.png'))===localAssetUrl('cr7/custom/normal.png'),'Sai đường dẫn ghi đè');
});
await test('Chuẩn hóa tên xương, lệch đơn vị cm/m và root motion', () => {
  assert(canonicalBone('Armature|mixamorig:Hips')==='hips','Tên xương sai');
  near(inferPositionScale(1,100),.01); near(inferPositionScale(100,1),100); near(inferPositionScale(1,1.1),1);
  const model=new THREE.Group(), hips=new THREE.Bone(); hips.name='mixamorigHips'; hips.position.y=1; model.add(hips);
  const source=new THREE.AnimationClip('Walk',1,[new THREE.VectorKeyframeTrack('mixamorig:Hips.position',[0,1],[20,100,30,50,110,60])]);
  const clip=prepareClip(source,model), values=clip.tracks[0].values;
  near(values[0],values[3]); near(values[2],values[5]); assert(values[4]>values[1],'Mất nhún Y');
  assert(source.tracks[0].values[3]===50,'Đã sửa clip nguồn');
});
for (const extension of ['glb','gltf','fbx']) {
  await test(`Nạp ${extension.toUpperCase()}, chiều cao 1,8, chạm đất và animation không phá scale`, async () => {
    const char=await load({model:`fixtures/sample.${extension}`,height:1.8});
    assert(char.kind==='model',char.diagnostics.error || 'Không nạp được model');
    let box=bounds(char); near(box.max.y-box.min.y,1.8); near(box.min.y,0);
    assert(char.diagnostics.clips.idle?.includes('Idle'),'Thiếu clip idle');
    char.update(.1); box=bounds(char); near(box.max.y-box.min.y,1.8); assert(box.min.y>=-.001 && box.min.y<.15,'Animation làm chìm/lơ lửng model');
  });
}
await test('GLB có xương: đo 24 mẫu và chân chạm đất', async () => {
  const char=await load({model:'fixtures/rig.glb',height:1.8}); assert(char.kind==='model',char.diagnostics.error);
  assert(char.diagnostics.fit.method==='bones' && char.diagnostics.fit.samples===24,'Không đo theo xương');
  const toe=char.object3d.getObjectByName('mixamorigLeftToe_End'); char.object3d.updateMatrixWorld(true);
  near(toe.getWorldPosition(new THREE.Vector3()).y,0); char.play('kick'); char.update(.1);
  assert(Number.isFinite(bounds(char).max.y),'Animation xương không hợp lệ');
});
await test('FBX clip riêng không mesh, ghép vào model GLB', async () => {
  const char=await load({model:'fixtures/sample.glb',clips:{kick:'fixtures/clip-only.fbx'},height:1.8});
  assert(char.kind==='model','Không nạp model'); assert(char.diagnostics.clips.kick==='Breathing Idle','Không ghép clip FBX');
  let meshes=0; char.object3d.traverse(n=>{if(n.isMesh)meshes++}); assert(meshes===1,'Đã thêm mesh từ clip');
  char.play('kick',{restart:true}); for(let i=0;i<16;i++)char.update(.1);
  assert(bounds(char).min.y>=-.001,'Clip riêng phá chạm đất');
});
await test('Clip một lần quay về idle/run và có thể phát lại', async () => {
  for (const model of ['fixtures/sample.glb','']) {
    const char=await load({model}); char.play('kick',{returnTo:'run'});
    for(let i=0;i<16;i++)char.update(.1); assert(char.state==='run','Không quay về run');
    char.play('kick',{returnTo:'idle'}); assert(char.state==='kick','Không phát lại kick');
    for(let i=0;i<16;i++)char.update(.1); assert(char.state==='idle','Không quay về idle');
    char.play('celebrate',{loop:true}); for(let i=0;i<40;i++)char.update(.1);
    assert(char.state==='celebrate','Ăn mừng lặp bị ngắt');
  }
});
await test('Thiếu file model dùng cầu thủ tạm và cảnh báo', async () => {
  const before=warnings.length, char=await load({model:'fixtures/missing-model.glb'});
  assert(char.kind==='placeholder' && warnings.length>before,'Không fallback/cảnh báo');
  for(const state of ['idle','run','kick','celebrate','defeated','jump']){char.play(state,{restart:true});char.update(.1);}
  assert(Number.isFinite(bounds(char).max.y),'Cầu thủ tạm bị lỗi');
});
await test('Thiếu clip riêng giữ model và clip gần nhất', async () => {
  const char=await load({model:'fixtures/sample.glb',clips:{kick:'fixtures/missing-clip.fbx'}});
  assert(char.kind==='model' && char.diagnostics.clips.kick==='Soccer Kick','Fallback clip sai');
});
await test('Cấu hình trống trả cùng giao diện và dispose an toàn', async () => {
  const char=await load({model:''}); assert(char.object3d.isObject3D && char.kind==='placeholder','Sai giao diện');
  char.play('run'); char.update(.1); char.dispose(); char.update(.1); assert(char.object3d.children.length===0,'Chưa dọn model');
});
await test('Dừng trong lúc tải không gắn model đã huỷ lên sân', async () => {
  configureCharacters({configs:{cr7:{model:'fixtures/sample.glb'}}});
  const char=createCharacter('cr7'); char.dispose(); await char.ready;
  assert(char.object3d.children.length===0,'Model đã huỷ vẫn xuất hiện');
});
for(const char of pending)char.dispose();
configureCharacters({configs:characters});
window.__characterTestResults={done:true,results,warnings,passed:results.filter(x=>x.passed).length,total:results.length};
document.getElementById('summary').textContent=`${window.__characterTestResults.passed}/${results.length} kiểm tra đạt. Chưa kiểm chứng model Mixamo thật.`;
