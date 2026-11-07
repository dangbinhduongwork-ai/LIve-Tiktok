import * as THREE from 'three';
import { viewConfig } from '../view.config.js';
import { scenario } from './scenarios.js';

// Run on /game/?preview=1, never on a live game. Does not send socket commands.
export async function runThemeChecks(view) {
  if (view.socket || !new URLSearchParams(location.search).has('preview')) throw new Error('Chỉ chạy kiểm tra theme trong preview.');
  const saved=structuredClone(view.state), results=[];
  const assert=(value,message)=>{if(!value)throw new Error(message);};
  function test(name,run){try{run();results.push({name,passed:true});}catch(error){results.push({name,passed:false,error:error.message});}}
  const fixture=()=>{const data=scenario('playing').state;data.matchId=Math.random()*100000;return data;};
  const stadium=view.stadium;
  const transforms=root=>{const values=[];root.traverse(n=>values.push(...n.position.toArray(),...n.quaternion.toArray(),...n.scale.toArray()));return JSON.stringify(values);};
  const ledHeight=()=>{const m=new THREE.Matrix4();let height=0;for(let i=0;i<stadium.ledBars.count;i++){stadium.ledBars.getMatrixAt(i,m);height=Math.max(height,m.elements[5]);}return height;};

  test('CR7 trái, M10 phải; bóng −1000/0/+1000 và thanh lực cùng chiều',()=>{
    let previous=-Infinity;
    for(const value of [-1000,0,1000]){
      const state=fixture();state.ballPos=value;view.updateState(state,true);stadium.update(.016);
      const point=stadium.project(stadium.ball.position.x,stadium.ball.position.y,0);
      assert(point.x>previous,'Chiều bóng bị đảo');previous=point.x;
      assert(Number.parseFloat(document.getElementById('power-ball').style.left)===(value+1000)/20,'Thanh lực không khớp bóng');
    }
    assert(stadium.characters.cr7.object3d.position.x<stadium.characters.m10.object3d.position.x,'Ngôi sao sai bên');
    assert(document.getElementById('score-cr7').getBoundingClientRect().x<document.getElementById('score-m10').getBoundingClientRect().x,'Tỉ số sai bên');
  });
  test('Ngôi sao không che bóng và hai miệng khung thành trong lúc đá',()=>{
    for(const value of [-1000,0,1000]){
      const state=fixture();state.ballPos=value;view.updateState(state,true);stadium.update(.016);
      for(const point of [stadium.project(stadium.ball.position.x,.5,0),stadium.project(-9.67,.9,0),stadium.project(9.67,.9,0)])for(const star of Object.values(stadium.characters)){
        star.object3d.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(star.object3d,true);
        const overlap=point.x+10>box.min.x&&point.x-10<box.max.x&&point.y+10>stadium.height-box.max.y&&point.y-10<stadium.height-box.min.y;
        assert(!overlap,'Nhân vật che bóng/miệng khung thành');
      }
    }
  });
  test('Mỗi đội có số mini theo config; đóng băng dừng cả di chuyển và animation',()=>{
    const state=fixture();view.updateState(state,true);stadium.update(.1);
    assert(stadium.minis.cr7.length===viewConfig.miniPlayers.perTeam&&stadium.minis.m10.length===viewConfig.miniPlayers.perTeam,'Sai số cầu thủ');
    state.teams.m10.frozen=true;state.teams.m10.freezeLeft=10;view.updateState(state);
    const before=stadium.minis.m10.map(c=>transforms(c.object3d));const starBefore=transforms(stadium.characters.m10.object3d);
    state.ballPos=-700;view.updateState(state);for(let i=0;i<10;i++)stadium.update(.1);
    assert(stadium.minis.m10.every((c,i)=>transforms(c.object3d)===before[i]),'Mini đóng băng còn chuyển động');
    assert(transforms(stadium.characters.m10.object3d)===starBefore,'Ngôi sao đóng băng còn chuyển động');
    assert(stadium.freeze.m10.visible&&stadium.heroIce.m10.visible&&!stadium.freeze.cr7.visible,'Băng phủ sai phía');
  });
  test('LED tăng theo comment/tim rồi giảm khi hết tương tác',()=>{
    view.updateState(fixture(),true);stadium.interactionLevel=0;stadium.update(.01);const before=ledHeight();
    stadium.interaction('chat',5);stadium.interaction('like',50);stadium.update(.01);const peak=ledHeight();
    assert(peak>before+.5,'LED không phản ứng');stadium.update(20);assert(ledHeight()<peak*.5,'LED không giảm');
  });
  test('Kết quả có tỉ số/top donor; hướng dẫn không bị panel che',()=>{
    const state=scenario('result').state;state.matchId=9021;view.updateState(state,true);stadium.update(.1);
    assert(document.getElementById('result-score').textContent==='2 : 1','Thiếu tỉ số');
    assert(document.getElementById('result-donor').textContent.includes('Minh Anh'),'Thiếu top donor');
    const guide=document.querySelector('.join-strip').getBoundingClientRect(),panel=document.getElementById('phase-banner').getBoundingClientRect();
    assert(guide.top>=panel.bottom,'Panel che hướng dẫn');assert(stadium.trophy.visible,'Thiếu cúp');
    state.result.winner=null;view.updateState(state);stadium.update(.1);
    assert(!stadium.trophy.visible&&document.querySelector('#phase-banner strong').textContent==='BẤT PHÂN THẮNG BẠI','Hòa còn báo đội thắng');
  });
  test('HUD đúng vùng an toàn và chữ tỉ số/đồng hồ đủ lớn',()=>{
    const scale=document.getElementById('broadcast').getBoundingClientRect().width/viewConfig.width;
    const stage=document.getElementById('broadcast').getBoundingClientRect();
    for(const selector of ['.match-header','.power-meter','.join-strip','.event-rail','.donor-board']){
      const box=document.querySelector(selector).getBoundingClientRect();
      assert(box.left>=stage.left+viewConfig.safeArea.left*scale-.1&&box.right<=stage.right-viewConfig.safeArea.right*scale+.1,'HUD chạm mép phải/trái');
      assert(box.top>=stage.top+viewConfig.safeArea.top*scale-.1&&box.bottom<=stage.bottom-viewConfig.safeArea.bottom*scale+.1,'HUD chạm vùng trên/dưới');
    }
    assert(parseFloat(getComputedStyle(document.getElementById('score-cr7')).fontSize)>=120,'Tỉ số nhỏ hơn 120px');
    assert(parseFloat(getComputedStyle(document.getElementById('clock')).fontSize)>=70,'Đồng hồ nhỏ hơn 70px');
  });
  test('Chế độ chất lượng điều khiển camera, shadow và số LED',()=>{
    const state=fixture();state.ballPos=990;view.updateState(state,true);view.handleEvent({type:'goal',team:'cr7'});
    if(view.metrics().quality==='low'){
      const position=stadium.camera.position.clone(),zoom=stadium.camera.zoom;for(let i=0;i<30;i++)stadium.update(.1);
      assert(stadium.camera.position.equals(position)&&stadium.camera.zoom===zoom&&stadium.shake===0,'Camera low còn rung/trôi/zoom');
      assert(!stadium.renderer.shadowMap.enabled&&stadium.ledData.length===viewConfig.quality.low.ledBars,'Low chưa giảm chất lượng');
    }else{
      for(let i=0;i<30;i++)stadium.update(.1);
      assert(stadium.camera.zoom>viewConfig.camera.baseZoom,'Không đẩy camera gần khung thành');
      assert(stadium.renderer.shadowMap.enabled&&stadium.ledData.length===viewConfig.quality.normal.ledBars,'Sai chất lượng normal');
    }
  });
  test('Nhiều hiệu ứng liên tiếp dùng pool, không sinh thêm geometry',()=>{
    view.updateState(fixture(),true);stadium.update(.1);const geometries=new Set();stadium.scene.traverse(node=>{if(node.geometry)geometries.add(node.geometry);});
    for(let i=0;i<80;i++)view.handleEvent({type:'gift_skill',team:i%2?'cr7':'m10',skill:i%3?'special':'golden',force:40});
    stadium.update(.1);stadium.scene.traverse(node=>{if(node.geometry)assert(geometries.has(node.geometry),'Sinh geometry mới theo quà');});
    assert(stadium.rings.length===6&&stadium.golden.length===2,'Pool tăng không giới hạn');
  });
  view.updateState({...saved,matchId:saved.matchId+1},true);
  return {quality:view.metrics().quality,passed:results.filter(r=>r.passed).length,total:results.length,results};
}
