// Reproducible, original geometry. Run: node public/game/tests/generate-fixtures.mjs
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('../assets/characters/fixtures/', import.meta.url));
fs.mkdirSync(directory, { recursive: true });
const positions = [-.3,0,-.2,.3,0,-.2,.3,2,-.2,-.3,2,-.2,-.3,0,.2,.3,0,.2,.3,2,.2,-.3,2,.2];
const indices = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,1,2,6,1,6,5,0,4,7,0,7,3];
function gltf(rig = false) {
  const chunks = [], bufferViews = [], accessors = []; let size = 0;
  function accessor(array, type, componentType, bounds = {}) {
    const bytes = Buffer.from(array.buffer); const padded = Buffer.alloc(Math.ceil(bytes.length / 4) * 4); bytes.copy(padded);
    bufferViews.push({ buffer: 0, byteOffset: size, byteLength: bytes.length }); size += padded.length; chunks.push(padded);
    const components = { SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    accessors.push({ bufferView: bufferViews.length - 1, componentType, count: array.length / components, type, ...bounds });
    return accessors.length - 1;
  }
  const p = accessor(new Float32Array(positions), 'VEC3', 5126, { min: [-.3,0,-.2], max: [.3,2,.2] });
  const ix = accessor(new Uint16Array(indices), 'SCALAR', 5123);
  const time = accessor(new Float32Array([0,.5,1]), 'SCALAR', 5126, { min: [0], max: [1] });
  const motion = accessor(new Float32Array(rig ? [0,1,0,0,1.05,0,0,1,0] : [0,-2,0,0,-1.9,0,0,-2,0]), 'VEC3', 5126);
  const attributes = { POSITION: p };
  const nodes = rig ? [
    { name: 'Rig', children: [1,5] },
    { name: 'mixamorigHips', translation: [0,1,0], children: [2,3,4] },
    { name: 'mixamorigHeadTop_End', translation: [0,1,0] },
    { name: 'mixamorigLeftToe_End', translation: [-.1,-1,0] },
    { name: 'mixamorigRightToe_End', translation: [.1,-1,0] },
    { name: 'Body', mesh: 0, skin: 0 }
  ] : [{ name: 'FixtureRoot', children: [1], translation: [0,-2,0] }, { name: 'Body', mesh: 0 }];
  let skins;
  if (rig) {
    attributes.JOINTS_0 = accessor(new Uint16Array(32), 'VEC4', 5123);
    attributes.WEIGHTS_0 = accessor(new Float32Array(Array.from({ length:32 }, (_,i)=>i%4===0?1:0)), 'VEC4', 5126);
    const inverse = [[0,-1,0],[0,-2,0],[.1,0,0],[-.1,0,0]].flatMap(([x,y,z]) => [1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);
    skins = [{ joints: [1,2,3,4], skeleton: 1, inverseBindMatrices: accessor(new Float32Array(inverse), 'MAT4', 5126) }];
  }
  const document = {
    asset: { version:'2.0', generator:'Local character QA fixture' }, scene:0, scenes:[{ nodes:[0] }], nodes,
    meshes:[{ primitives:[{ attributes, indices:ix, material:0 }] }],
    materials:[{ pbrMetallicRoughness:{ baseColorFactor:[.8,.25,.15,1], metallicFactor:0, roughnessFactor:.8 } }],
    animations:['Breathing Idle','Run','Soccer Kick','Victory'].map(name=>({name,samplers:[{input:time,output:motion,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:rig?1:0,path:'translation'}}]})),
    ...(skins ? {skins} : {}), buffers:[{byteLength:size}], bufferViews, accessors
  };
  const binary = Buffer.concat(chunks);
  const json = Buffer.from(JSON.stringify(document)); const jsonPadded = Buffer.alloc(Math.ceil(json.length/4)*4,0x20); json.copy(jsonPadded);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67,0); header.writeUInt32LE(2,4); header.writeUInt32LE(28+jsonPadded.length+binary.length,8);
  const j = Buffer.alloc(8); j.writeUInt32LE(jsonPadded.length,0); j.writeUInt32LE(0x4e4f534a,4);
  const b = Buffer.alloc(8); b.writeUInt32LE(binary.length,0); b.writeUInt32LE(0x004e4942,4);
  fs.writeFileSync(directory+(rig?'rig.glb':'sample.glb'),Buffer.concat([header,j,jsonPadded,b,binary]));
  if (!rig) { document.buffers[0].uri='sample.bin'; fs.writeFileSync(directory+'sample.gltf',JSON.stringify(document)); fs.writeFileSync(directory+'sample.bin',binary); }
}
gltf(); gltf(true);
function fbx(withMesh) {
  const polygon = indices.map((n,i)=>i%3===2?-n-1:n).join(',');
  const geometry = withMesh ? `\tGeometry: 100, "Geometry::Body", "Mesh" {\n\t\tVertices: *24 {\n\t\t\ta: ${positions.join(',')}\n\t\t}\n\t\tPolygonVertexIndex: *36 {\n\t\t\ta: ${polygon}\n\t\t}\n\t}\n\tModel: 101, "Model::Body", "Mesh" {\n\t}\n` : '';
  return `; FBX 7.4.0 project-owned QA fixture\nFBXHeaderExtension: {\n\tFBXHeaderVersion: 1003\n\tFBXVersion: 7400\n}\nObjects: {\n${geometry}\tModel: 102, "Model::FixtureRoot", "Null" {\n\t\tProperties70: {\n\t\t\tP: "Lcl Translation", "Lcl Translation", "", "A",0,-2,0\n\t\t}\n\t}\n\tAnimationStack: 200, "AnimStack::Breathing Idle", "" {\n\t}\n\tAnimationLayer: 201, "AnimLayer::BaseLayer", "" {\n\t}\n\tAnimationCurveNode: 202, "AnimCurveNode::T", "" {\n\t}\n\tAnimationCurve: 203, "AnimCurve::Y", "" {\n\t\tKeyTime: *3 {\n\t\t\ta: 0,23093079000,46186158000\n\t\t}\n\t\tKeyValueFloat: *3 {\n\t\t\ta: -2,-1.9,-2\n\t\t}\n\t}\n}\nConnections: {\n${withMesh?'\tC: "OO",100,101\n\tC: "OO",101,102\n':''}\tC: "OO",102,0\n\tC: "OO",201,200\n\tC: "OO",202,201\n\tC: "OP",202,102,"Lcl Translation"\n\tC: "OP",203,202,"d|Y"\n}\n`;
}
fs.writeFileSync(directory+'sample.fbx',';'.repeat(240)+'\n'+fbx(true));
fs.writeFileSync(directory+'clip-only.fbx',';'.repeat(240)+'\n'+fbx(false));
console.log('Created GLB, GLTF, rigged GLB, animated FBX and clip-only FBX fixtures.');
