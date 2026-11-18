/* ==========================================================================
   SimuCore 3D Workspace v4 — "ระบบหน้าบ้าน" (Three.js)
   --------------------------------------------------------------------------
   ไฟล์นี้ดูแลสิ่งที่ "มองเห็น": ห้อง 3D, โมเดลอุปกรณ์ทุกรุ่น, สายทุกชนิด, แอนิเมชัน
   แพ็กเก็ต, แค็ตตาล็อกอุปกรณ์แบบ Packet Tracer, แผงตั้งค่า และ Console
   การคำนวณเครือข่ายทั้งหมดอยู่ใน network-engine.js (ตัวแปร net)
   ข้อมูลรุ่นอุปกรณ์อยู่ใน device-catalog.js
   ========================================================================== */
/* global THREE, NetSim */

/* ---------------------------- ค่าคงที่ / สถานะ ---------------------------- */
const params = new URLSearchParams(window.location.search);
const LABS = ['network', 'datacenter', 'portal', 'panorama', 'wireless', 'wan'];
const PROJECT_ID = params.get('projectId');
const MODEL = LABS.includes(params.get('model')) ? params.get('model') : 'network';
const WORKSPACE_KEY = PROJECT_ID ? String(PROJECT_ID) : `demo-${MODEL}`;   // บันทึกผ่าน Store (store.js)
let projectNameCache = 'ห้องทดลอง (ยังไม่ได้สร้างโครงการ)';

/* ------------------------- พื้นที่จัดทำเครือข่าย -------------------------
   ห้องเดียว 3 ขนาด / อาคาร 1 ชั้นหลายห้อง / วิทยาเขตหลายอาคาร (ย่อส่วน)
   scale = 1 หน่วยในฉาก เท่ากับกี่เมตร (เอนจินใช้คำนวณความยาวสายจริง) */
const doorSplit = (a, b, doors, gap) => {          // แบ่งผนังเป็นช่วงๆ เว้นช่องประตู
  const out = [];
  let cur = a;
  for (const d of doors.slice().sort((x, y) => x - y)) { out.push([cur, d - gap / 2]); cur = d + gap / 2; }
  out.push([cur, b]);
  return out.filter(([x, y]) => y - x > 0.05);
};
const wallX = (z, x1, x2, doors = [], gap = 1.4) => doorSplit(x1, x2, doors, gap).map(([a, b]) => [a, z, b, z]);
const wallZ = (x, z1, z2, doors = [], gap = 1.4) => doorSplit(z1, z2, doors, gap).map(([a, b]) => [x, a, x, b]);
function buildingWalls(b, side, gap) {            // ผนัง 4 ด้านของอาคาร เว้นประตู 1 ด้าน
  const x1 = b.x - b.w / 2, x2 = b.x + b.w / 2, z1 = b.z - b.l / 2, z2 = b.z + b.l / 2;
  return [
    ...wallX(z1, x1, x2, side === 'n' ? [b.x] : [], gap), ...wallX(z2, x1, x2, side === 's' ? [b.x] : [], gap),
    ...wallZ(x1, z1, z2, side === 'w' ? [b.z] : [], gap), ...wallZ(x2, z1, z2, side === 'e' ? [b.z] : [], gap)
  ];
}
const FLOOR_ZONES = [
  { id: 'server', name: 'ห้องเซิร์ฟเวอร์', x: -8, z: -4.125, w: 8, l: 5.75, color: '#22d3ee' },
  { id: 'lab1', name: 'ห้องคอมพิวเตอร์ 1', x: 4, z: -4.125, w: 16, l: 5.75, color: '#34d399' },
  { id: 'staff', name: 'ห้องพักครู', x: -8, z: 4.125, w: 8, l: 5.75, color: '#fbbf24' },
  { id: 'lab2', name: 'ห้องคอมพิวเตอร์ 2', x: 4, z: 4.125, w: 16, l: 5.75, color: '#a855f7' },
  { id: 'hall', name: 'ทางเดิน', x: 0, z: 0, w: 24, l: 2.5, color: '#94a3b8', corridor: true }
];
const CAMPUS_ZONES = [
  { id: 'A', name: 'อาคาร A · ศูนย์คอมพิวเตอร์', x: -18, z: -9, w: 16, l: 12, color: '#22d3ee', door: 'e' },
  { id: 'B', name: 'อาคาร B · อาคารเรียน', x: 18, z: -10, w: 18, l: 10, color: '#34d399', door: 'w' },
  { id: 'C', name: 'อาคาร C · ห้องสมุด', x: 0, z: 13, w: 16, l: 10, color: '#a855f7', door: 'n' }
];
const HOME_ZONES = [
  { id: 'living', name: 'ห้องนั่งเล่น', x: -3, z: -2.25, w: 8, l: 5.5, color: '#38bdf8' },
  { id: 'kitchen', name: 'ห้องครัว', x: 4, z: -2.25, w: 6, l: 5.5, color: '#f59e0b' },
  { id: 'bed1', name: 'ห้องนอน 1', x: -4.25, z: 3.35, w: 5.5, l: 3.3, color: '#a855f7' },
  { id: 'bath', name: 'ห้องน้ำ', x: 0, z: 3.35, w: 3, l: 3.3, color: '#64748b' },
  { id: 'bed2', name: 'ห้องนอน 2', x: 4.25, z: 3.35, w: 5.5, l: 3.3, color: '#ec4899' },
  { id: 'hall', name: 'โถงทางเดิน', x: 0, z: 1.1, w: 14, l: 1.2, color: '#94a3b8', corridor: true },
  { id: 'yard', name: 'หน้าบ้าน', x: 0, z: -5.75, w: 16, l: 1.5, color: '#34d399' }
];
const SITES = {
  small: { label: 'ห้องเดียว 6×6 ม.', w: 6, l: 6 },
  medium: { label: 'ห้องเดียว 8×8 ม.', w: 8, l: 8 },
  large: { label: 'ห้องเดียว 12×10 ม.', w: 12, l: 10 },
  floor: {
    label: 'อาคาร 1 ชั้น 4 ห้อง', kind: 'building', w: 24, l: 14, scale: 1, zones: FLOOR_ZONES, wallLoss: 5,
    walls: [
      ...wallX(-7, -12, 12), ...wallX(7, -12, 12),
      ...wallZ(-12, -7, 7, [0], 2.5), ...wallZ(12, -7, 7, [0], 2.5),
      ...wallX(-1.25, -12, 12, [-8, 4]), ...wallX(1.25, -12, 12, [-8, 4]),
      ...wallZ(-4, -7, -1.25), ...wallZ(-4, 1.25, 7)
    ]
  },
  home: {
    label: 'บ้าน 2 ห้องนอน', kind: 'building', w: 16, l: 13, scale: 1, zones: HOME_ZONES, wallLoss: 10, concrete: true,
    walls: [
      ...wallX(-5, -7, 7, [-3], 1.2), ...wallX(5, -7, 7), ...wallZ(-7, -5, 5), ...wallZ(7, -5, 5),
      ...wallZ(1, -5, 0.5, [-1.5], 1.6),
      ...wallX(0.5, -7, 7, [-3, 4], 1.6),
      ...wallX(1.7, -7, 7, [-4.25, 0, 4.25], 1.0),
      ...wallZ(-1.5, 1.7, 5), ...wallZ(1.5, 1.7, 5)
    ]
  },
  campus: {
    label: 'วิทยาเขต 3 อาคาร (ย่อส่วน 1:4)', kind: 'campus', w: 64, l: 46, scale: 4, zones: CAMPUS_ZONES, wallLoss: 8,
    walls: CAMPUS_ZONES.flatMap(b => buildingWalls(b, b.door, 2.4))
  }
};
const ROOMS = SITES;
const WALL_H = 3.2;

const PROTO_COLORS = { DDoS: 0xff2d55, ARP: 0xffb020, ICMP: 0x00e676, DNS: 0xc084fc, DHCP: 0xffe14d, TCP: 0x4cc9ff, HTTP: 0xff5fa2, UDP: 0x9aa7b8 };
const PROTO_INFO = { ARP: 'ARP', ICMP: 'ICMP (ping)', DNS: 'DNS', DHCP: 'DHCP', TCP: 'TCP', HTTP: 'HTTP' };
const SOCKET_COLORS = { copper: 0x111827, fiber: 0xff9100, serial: 0x2563eb, console: 0x67e8f9, rs232: 0x67e8f9, async: 0x2dd4bf, phone: 0xa3e635, coax: 0x93c5fd, usb: 0xf472b6, iot: 0xfacc15 };
// คู่พอร์ตที่ต่อกันได้เมื่อเลือก "อัตโนมัติ"
const PARTNER = { copper: ['copper'], fiber: ['fiber'], serial: ['serial'], rs232: ['console'], console: ['rs232', 'async'], async: ['console'], phone: ['phone'], coax: ['coax'], usb: ['usb'], iot: ['iot'] };
const CLOCK_RATES = [0, 1200, 2400, 9600, 19200, 38400, 56000, 64000, 72000, 125000, 128000, 148000, 250000, 500000, 800000, 1000000, 1300000, 2000000, 4000000];

let net = new NetSim.Network();
let scene, camera, renderer, controls;
let roomGroup = null, waypointGroup = null;
let selRing = null, pickRing = null;
const nodes = new Map();    // deviceId → { group, labelCanvas, labelTex, height, anchor, leds, antenna }
const cables = new Map();   // linkId   → { mesh, curve, extras[] }
const tweens = [];

let selectedId = null;
let nextDeviceId = 1;
let viewMode = '3d';
let wireframe = false;
let cableTool = false, cableType = 'auto', cableFirst = null;   // cableFirst = { dev, port }
let dragId = null, downPos = null;
let orbitState = null;
let currentCat = 'routers';

let simMode = 'realtime';
let playing = false, pumping = false, pumpPromise = null, stepWaiter = null;
let speed = 1;

// ตัวช่วยของ Three.js (สร้างใน init3D หลังตรวจแล้วว่าโหลดไลบรารีสำเร็จ)
let raycaster, mouse, dragPlane, hitPoint, lookDir, PKT_GEO, PKT_EDGE;
let readyResolve;
window.appReady = new Promise(r => { readyResolve = r; });   // ใช้ในการทดสอบอัตโนมัติ

const $ = id => document.getElementById(id);
// โหมด Liquid Glass: ฉาก 3D โปร่งใสให้เห็นแสง Aurora ด้านหลัง ผนังเป็นกระจก
const GLASS = document.body.classList.contains('ws-glass');
const CAT_COLORS = { routers: '#22d3ee', switches: '#34d399', hubs: '#fbbf24', wireless: '#a855f7', security: '#fb7185', wan: '#60a5fa', end: '#38bdf8', iot: '#f59e0b', room: '#94a3b8', cables: '#f97316' };
const hex = n => '#' + n.toString(16).padStart(6, '0');
// สีจุดของพอร์ตในรายการ (ทองแดงสีดำจะมองไม่เห็นบนพื้นมืด จึงใช้สีเทาแทน)
const portColor = media => hex(media === 'wlan' || media === 'radio' ? 0x00f0ff : (!SOCKET_COLORS[media] || SOCKET_COLORS[media] === 0x111827 ? 0x94a3b8 : SOCKET_COLORS[media]));

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(c => { if (c !== null && c !== undefined && c !== false) e.append(c); });
  return e;
}
const icon = name => h('i', { class: `fa-solid ${name}` });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const roomSize = () => SITES[$('roomSizeSelect').value] || SITES.medium;
const siteZones = () => (roomSize().zones || []);
let currentZone = null;               // ห้อง/อาคารที่กำลังดูอยู่ (อุปกรณ์ใหม่จะวางในนี้)
function zoneAt(x, z) {
  const zs = siteZones();
  return zs.find(q => !q.corridor && Math.abs(x - q.x) <= q.w / 2 && Math.abs(z - q.z) <= q.l / 2)
    || zs.find(q => Math.abs(x - q.x) <= q.w / 2 && Math.abs(z - q.z) <= q.l / 2) || null;
}
const maxOrbit = () => Math.max(40, Math.max(roomSize().w, roomSize().l) * 1.9);
let sunLight = null;
let siteWalls = [];                   // ส่วนผนัง [x1,z1,x2,z2] ใช้ชนตอนเดินโหมด 360°
const devOf = id => net.devices.get(Number(id));
const catOf = id => NetSim.CATEGORIES.find(c => c.id === id);
// อุปกรณ์ IoT ย้ายไปอยู่ที่ห้องเรียน IoT (iot.html) — ยังเก็บรุ่นไว้ในแค็ตตาล็อกเพื่อให้งานเก่าเปิดได้
const HIDDEN_CATS = new Set(['iot']);
const HIDDEN_CABLES = new Set(['iot', 'usb']);
const LAB_CABLES = () => NetSim.CABLE_ORDER.filter(id => !HIDDEN_CABLES.has(id));

/* ==========================================================================
   เริ่มต้นระบบ 3D
   ========================================================================== */
async function init3D() {
  const steps = ['เตรียมเอนจิน 3D และเอนจินจำลองเครือข่าย', 'โหลดงานที่บันทึกไว้', 'สร้างห้องและวางอุปกรณ์', 'เดินสายสัญญาณ', 'ตรวจความพร้อม'];
  UI.loader.show('กำลังเปิดห้องแล็บ', steps, 'SimuCore 3D');
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();
  dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  hitPoint = new THREE.Vector3();
  lookDir = new THREE.Vector3();
  PKT_GEO = new THREE.BoxGeometry(0.3, 0.19, 0.06);
  PKT_EDGE = new THREE.EdgesGeometry(PKT_GEO);

  const container = document.querySelector('.viewport-container');
  scene = new THREE.Scene();
  if (GLASS) {
    scene.background = null;
    scene.fog = new THREE.FogExp2(0x0b1030, 0.008);
  } else {
    scene.background = new THREE.Color(0x161b23);
    scene.fog = new THREE.FogExp2(0x161b23, 0.016);
  }
  camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.05, 500);

  renderer = new THREE.WebGLRenderer({ canvas: $('canvas3D'), antialias: true, alpha: GLASS });
  if (GLASS) renderer.setClearColor(0x000000, 0);
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minDistance = 2;
  controls.maxDistance = 40;

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const dirLight = sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(8, 16, 10);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  Object.assign(dirLight.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 });
  dirLight.shadow.camera.updateProjectionMatrix();
  scene.add(dirLight);
  const glow = new THREE.PointLight(GLASS ? 0xa855f7 : 0x00f0ff, GLASS ? 0.8 : 0.6, 18);
  glow.position.set(0, WALL_H - 0.4, 0);
  scene.add(glow);

  const ringGeo = new THREE.RingGeometry(0.92, 1.02, 48);
  selRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  pickRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff9100, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  for (const r of [selRing, pickRing]) { r.rotation.x = -Math.PI / 2; r.position.y = 0.03; r.visible = false; scene.add(r); }

  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('resize', onWindowResize);

  renderLegend();
  renderCatalog();
  fillCableSelect();
  renderUserChip();
  initGlassSheen();
  buildWasdPad();
  setEditMode(false);
  animate();

  UI.loader.step(1);
  const [saved] = await Promise.all([fetchWorkspace(), loadProjectTitle()]);
  await UI.wait(UI.reduced ? 0 : 120);
  UI.loader.step(2);
  introPending = true;
  if (!(saved && applySaved(saved))) {
    if (params.get('template') === '0') buildRoom();
    else applyTemplate(MODEL);
  }
  reset3DCamera();
  await UI.wait(UI.reduced ? 0 : 120);
  UI.loader.step(3);
  refreshAll();
  updateSimButtons();
  await UI.wait(UI.reduced ? 0 : 120);
  UI.loader.step(4);
  await UI.wait(UI.reduced ? 0 : 120);
  UI.loader.done('ห้องแล็บพร้อมแล้ว');

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redrawAllLabels);
  if (params.get('mode') === '360' || MODEL === 'panorama') switchViewMode('360');
  if (params.get('activity') === '1' && !activity) startActivity(true);
  setInterval(checkActivity, 1200);
  checkActivity();
  window.addEventListener('pagehide', () => persist());
  setTimeout(() => { UI.loader.hide(); playIntro(); readyResolve(); }, UI.reduced ? 0 : 260);
}

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  for (let i = tweens.length - 1; i >= 0; i--) {
    const t = tweens[i];
    const k = Math.min(1, (now - t.start) / t.dur);
    t.update(k);
    if (k >= 1) { tweens.splice(i, 1); t.resolve(); }
  }
  const pulse = 1 + 0.05 * Math.sin(now / 220);
  if (selRing.visible) selRing.scale.set(pulse, pulse, 1);
  if (pickRing.visible) pickRing.scale.set(pulse, pulse, 1);
  if (waypointGroup && waypointGroup.visible) waypointGroup.children.forEach(w => { w.material.opacity = 0.45 + 0.3 * Math.sin(now / 300); });
  // ใบพัดหมุน / คลื่น Wi-Fi กระเพื่อม
  nodes.forEach(n => { if (n.spin) n.spin.rotation.z = now / 120; });
  cables.forEach(c => { if (c.wave) c.mesh.material.opacity = 0.25 + 0.2 * Math.sin(now / 250 + c.phase); });
  frameHooks.forEach(fn => fn(now));
  controls.update();
  renderer.render(scene, camera);
}
// ฟังก์ชันที่ต้องทำทุกเฟรม (เช่น กล้องติดตามแพ็กเก็ต วงแหวนแจ้งจุดเสีย) — ลงทะเบียนจาก lab-plus.js
const frameHooks = new Set();
// ให้ XP / เหรียญ (ถ้าโหลด lab-plus.js แล้ว)
function award(a) { if (window.LabPlus) LabPlus.award(a); }

function tween(dur, update) {
  return new Promise(resolve => tweens.push({ start: performance.now(), dur: Math.max(1, dur), update, resolve }));
}
const ease = k => k * k * (3 - 2 * k);

function onWindowResize() {
  const container = document.querySelector('.viewport-container');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

/* ==========================================================================
   ห้อง (พื้น ผนัง เพดาน)
   ========================================================================== */
function disposeTree(obj) {
  obj.traverse(c => {
    if (c.geometry && !c.geometry.shared) c.geometry.dispose();
    if (c.material && !c.material.shared) { if (c.material.map && !c.material.map.shared) c.material.map.dispose(); c.material.dispose(); }
  });
}

function buildRoom() {
  const site = roomSize();
  const { w, l } = site;
  const floorType = $('floorTextureSelect').value;
  if (roomGroup) { scene.remove(roomGroup); disposeTree(roomGroup); }
  net.scale = site.scale || 1;
  net.walls = (site.walls || []).map(w => [w[0], w[1], w[2], w[3], site.wallLoss || 5]);   // ผนังลดสัญญาณ Wi-Fi
  net.syncWireless();     // ผนัง/ระยะเปลี่ยน → ตรวจการเชื่อมต่อ Wi-Fi ใหม่
  lastSiteKey = $('roomSizeSelect').value;
  siteWalls = [];
  // ฉากใหญ่: ปรับหมอก เงา และระยะซูมให้พอดีพื้นที่
  const span = Math.max(w, l);
  if (scene.fog) scene.fog.density = (GLASS ? 0.008 : 0.016) * Math.min(1, 12 / span);
  if (sunLight) {
    const r = Math.max(10, span * 0.6);
    Object.assign(sunLight.shadow.camera, { left: -r, right: r, top: r, bottom: -r, far: Math.max(40, span * 1.5) });
    sunLight.position.set(span * 0.5, Math.max(16, span * 0.6), span * 0.6);
    sunLight.shadow.camera.updateProjectionMatrix();
  }
  if (controls && viewMode === '3d') controls.maxDistance = maxOrbit();
  if (site.zones) {
    if (!currentZone || !site.zones.includes(currentZone)) currentZone = site.zones[0];
    roomGroup = buildSite(site, floorType);
    scene.add(roomGroup);
    renderZoneNav();
    return;
  }
  currentZone = null;
  renderZoneNav();

  const group = new THREE.Group();
  const floorColors = GLASS ? { raised: 0x1a2154, epoxy: 0x23306b, tile: 0x2b2f6e } : { raised: 0x202b42, epoxy: 0x34495e, tile: 0x5d6d7e };
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.2, l),
    new THREE.MeshStandardMaterial({ color: floorColors[floorType] || floorColors.raised, roughness: floorType === 'epoxy' ? 0.15 : 0.6, metalness: floorType === 'raised' ? 0.3 : 0.05 })
  );
  floor.position.y = -0.1;
  floor.receiveShadow = true;
  group.add(floor);

  const cell = floorType === 'raised' ? 0.6 : 1;
  const pts = [];
  for (let x = -w / 2; x <= w / 2 + 1e-6; x += cell) pts.push(new THREE.Vector3(x, 0.006, -l / 2), new THREE.Vector3(x, 0.006, l / 2));
  for (let z = -l / 2; z <= l / 2 + 1e-6; z += cell) pts.push(new THREE.Vector3(-w / 2, 0.006, z), new THREE.Vector3(w / 2, 0.006, z));
  group.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: GLASS ? (floorType === 'raised' ? 0x22d3ee : 0xa855f7) : (floorType === 'raised' ? 0x00a8b8 : 0x2a3b5f), transparent: true, opacity: GLASS ? 0.28 : 0.35 })
  ));

  let wallNo = 0;
  const addWall = (width, x, z, ry) => {
    const wallMat = GLASS
      ? new THREE.MeshStandardMaterial({ color: 0x9fb4ff, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.1, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color: 0x16203a, roughness: 0.9 });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(width, WALL_H), wallMat);
    wall.position.set(x, WALL_H / 2, z);
    wall.rotation.y = ry;
    group.add(wall);
    // แถบไฟเรืองแสงที่ขอบล่าง (และขอบบนในโหมดกระจก) สลับสีฟ้า/ชมพู
    const stripColor = GLASS ? [0x22d3ee, 0xec4899, 0xa855f7, 0x34d399][wallNo++ % 4] : 0x00f0ff;
    for (const y of GLASS ? [0.12, WALL_H - 0.03] : [0.12]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, 0.05), new THREE.MeshBasicMaterial({ color: stripColor }));
      strip.position.set(x, y, z);
      strip.rotation.y = ry;
      strip.translateZ(0.01);
      group.add(strip);
    }
  };
  addWall(w, 0, -l / 2, 0);
  addWall(w, 0, l / 2, Math.PI);
  addWall(l, -w / 2, 0, Math.PI / 2);
  addWall(l, w / 2, 0, -Math.PI / 2);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, l), GLASS
    ? new THREE.MeshStandardMaterial({ color: 0x8fa2ff, roughness: 0.2, transparent: true, opacity: 0.12, depthWrite: false })
    : new THREE.MeshStandardMaterial({ color: 0x0f1729, roughness: 1 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_H;
  group.add(ceiling);
  for (const sx of [-0.25, 0.25]) for (const sz of [-0.25, 0.25]) {
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ color: 0xdff6ff }));
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(w * sx, WALL_H - 0.01, l * sz);
    group.add(lamp);
  }
  group.traverse(c => { if (c.isMesh && c.material && c.material.isMeshStandardMaterial) c.material.wireframe = wireframe; });

  waypointGroup = new THREE.Group();
  const wpGeo = new THREE.RingGeometry(0.22, 0.34, 32);
  for (const [fx, fz] of [[0, 0], [-0.3, -0.25], [0.3, -0.25], [-0.3, 0.3], [0.3, 0.3], [0, 0.38]]) {
    const wp = new THREE.Mesh(wpGeo, new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    wp.rotation.x = -Math.PI / 2;
    wp.position.set(w * fx, 0.02, l * fz);
    waypointGroup.add(wp);
  }
  waypointGroup.visible = viewMode === '360';
  group.add(waypointGroup);

  roomGroup = group;
  scene.add(group);
}

// ป้ายชื่อห้อง/อาคารลอยเหนือพื้นที่
function zoneLabel(text, color, big) {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = '600 52px Prompt, "IBM Plex Sans Thai", sans-serif';
  const tw = Math.min(600, ctx.measureText ? ctx.measureText(text).width + 120 : 600);
  const x0 = (640 - tw) / 2;
  roundRectPath(ctx, x0, 14, tw, 100, 50);
  ctx.fillStyle = 'rgba(14,18,52,0.82)'; ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x0 + 52, 64, 14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x0 + 80, 66);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false }));
  const s = big ? 7 : 3.4;
  sp.scale.set(s, s / 5, 1);
  sp.renderOrder = 12;
  return sp;
}

// สร้างฉากอาคารหลายห้อง / วิทยาเขต จากข้อมูลใน SITES
function buildSite(site, floorType) {
  const group = new THREE.Group();
  const { w, l } = site;
  const campus = site.kind === 'campus';
  const floorColors = GLASS ? { raised: 0x1a2154, epoxy: 0x23306b, tile: 0x2b2f6e } : { raised: 0x202b42, epoxy: 0x34495e, tile: 0x5d6d7e };
  const floorMat = () => new THREE.MeshStandardMaterial({ color: floorColors[floorType] || floorColors.raised, roughness: floorType === 'epoxy' ? 0.15 : 0.6, metalness: floorType === 'raised' ? 0.3 : 0.05 });
  const tint = col => new THREE.Color(col);

  if (campus) {
    // สนามหญ้า ลาน และทางเดินเชื่อมทุกอาคาร
    const ground = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, l), new THREE.MeshStandardMaterial({ color: GLASS ? 0x0c2b33 : 0x1d3b2f, roughness: 0.95 }));
    ground.position.y = -0.17;
    ground.receiveShadow = true;
    group.add(ground);
    const pathMat = new THREE.MeshStandardMaterial({ color: GLASS ? 0x28305e : 0x3b4252, roughness: 0.7 });
    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.06, 40), pathMat);
    plaza.position.set(0, -0.1, -2);
    group.add(plaza);
    for (const b of site.zones) {
      const door = { n: [b.x, b.z - b.l / 2], s: [b.x, b.z + b.l / 2], w: [b.x - b.w / 2, b.z], e: [b.x + b.w / 2, b.z] }[b.door];
      const dx = door[0] - 0, dz = door[1] - (-2), len = Math.hypot(dx, dz);
      const path = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, len), pathMat);
      path.position.set(dx / 2, -0.1, -2 + dz / 2);
      path.rotation.y = Math.atan2(dx, dz);
      group.add(path);
    }
  } else {
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, l), floorMat());
    base.position.y = -0.1;
    base.receiveShadow = true;
    group.add(base);
  }

  // พื้นของแต่ละห้อง/อาคาร: พื้นจริง + แผ่นสีประจำห้องจางๆ + เส้นตาราง
  for (const z of site.zones) {
    if (campus) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(z.w, 0.2, z.l), floorMat());
      slab.position.set(z.x, -0.1, z.z);
      slab.receiveShadow = true;
      group.add(slab);
    }
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(z.w, z.l), new THREE.MeshBasicMaterial({ color: tint(z.color), transparent: true, opacity: z.corridor ? 0.04 : 0.09, depthWrite: false }));
    overlay.rotation.x = -Math.PI / 2;
    overlay.position.set(z.x, 0.004, z.z);
    group.add(overlay);
    if (!z.corridor) {
      const cell = floorType === 'raised' ? 0.6 : 1;
      const pts = [];
      for (let x = -z.w / 2; x <= z.w / 2 + 1e-6; x += cell) pts.push(new THREE.Vector3(z.x + x, 0.007, z.z - z.l / 2), new THREE.Vector3(z.x + x, 0.007, z.z + z.l / 2));
      for (let q = -z.l / 2; q <= z.l / 2 + 1e-6; q += cell) pts.push(new THREE.Vector3(z.x - z.w / 2, 0.007, z.z + q), new THREE.Vector3(z.x + z.w / 2, 0.007, z.z + q));
      group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: tint(z.color), transparent: true, opacity: 0.22 })));
      const label = zoneLabel(z.name, z.color, campus);
      label.position.set(z.x, WALL_H + (campus ? 1.2 : 0.45), z.z);
      group.add(label);
    }
  }

  // ผนังกระจก (มีช่องประตู) + แถบไฟเรืองแสงขอบบน/ล่าง
  const wallMat = site.concrete
    ? new THREE.MeshStandardMaterial({ color: 0xe7d8c9, roughness: 0.95, transparent: true, opacity: GLASS ? 0.32 : 0.55, depthWrite: false, side: THREE.DoubleSide })   // ผนังปูนในบ้าน (กั้นสัญญาณมากกว่ากระจก)
    : GLASS
    ? new THREE.MeshStandardMaterial({ color: 0x9fb4ff, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({ color: 0x16203a, roughness: 0.9, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const stripMats = [0x22d3ee, 0xec4899, 0xa855f7, 0x34d399].map(c => new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
  site.walls.forEach(([x1, z1, x2, z2], i) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const ry = -Math.atan2(z2 - z1, x2 - x1);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, WALL_H), wallMat);
    wall.position.set((x1 + x2) / 2, WALL_H / 2, (z1 + z2) / 2);
    wall.rotation.y = ry;
    group.add(wall);
    for (const y of [0.1, WALL_H - 0.03]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.05), stripMats[(zoneAt((x1 + x2) / 2, (z1 + z2) / 2) ? site.zones.indexOf(zoneAt((x1 + x2) / 2, (z1 + z2) / 2)) : i) % 4]);
      strip.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      strip.rotation.y = ry;
      group.add(strip);
    }
  });
  siteWalls = site.walls;
  group.traverse(c => { if (c.isMesh && c.material && c.material.isMeshStandardMaterial) c.material.wireframe = wireframe; });

  // จุดวาร์ปในโหมด 360°: กลางแต่ละห้อง/อาคาร (+ ลานกลางวิทยาเขต)
  waypointGroup = new THREE.Group();
  const wpGeo = new THREE.RingGeometry(0.22, 0.34, 32);
  const spots = site.zones.map(z => [z.x, z.z]);
  if (campus) spots.push([0, -2]);
  if (!campus && site.zones === FLOOR_ZONES) spots.push([-8, 0], [4, 0]);
  for (const [x, z] of spots) {
    const wp = new THREE.Mesh(wpGeo, new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
    wp.rotation.x = -Math.PI / 2;
    wp.position.set(x, 0.02, z);
    waypointGroup.add(wp);
  }
  waypointGroup.visible = viewMode === '360';
  group.add(waypointGroup);
  return group;
}

// ปุ่มลัดไปยังแต่ละห้อง/อาคาร (แถบซ้าย)
function renderZoneNav() {
  const nav = $('zoneNav');
  if (!nav) return;
  const zones = siteZones().filter(z => !z.corridor);
  nav.hidden = !zones.length;
  nav.innerHTML = '';
  if (!zones.length) return;
  const site = roomSize();
  nav.append(h('small', { class: 'zone-nav__note', text: site.scale > 1 ? `ย่อส่วน 1 ช่อง = ${site.scale} ม. · สายทองแดงยาวได้ไม่เกิน 100 ม.` : 'สายทองแดงยาวได้ไม่เกิน 100 ม.' }));
  nav.append(h('div', { class: 'zone-chips' }, zones.map(z => h('button', {
    class: 'zone-chip' + (z === currentZone ? ' active' : ''), style: `--z:${z.color}`,
    title: `ไปที่${z.name} (อุปกรณ์ที่เพิ่มใหม่จะวางในนี้)`, onclick: () => goZone(z)
  }, h('i', {}), z.name))));
}
function goZone(z) {
  currentZone = z;
  renderZoneNav();
  if (viewMode === '360') { walkTo(z.x, z.z + Math.min(1.5, z.l * 0.2)); return; }
  const from = camera.position.clone(), fromT = controls.target.clone();
  const d = Math.max(z.w, z.l);
  const to = new THREE.Vector3(z.x + d * 0.55, d * 0.75 + 3, z.z + d * 0.85), toT = new THREE.Vector3(z.x, 0.5, z.z);
  tween(UI.reduced ? 1 : 800, k => { const t = ease(k); camera.position.lerpVectors(from, to, t); controls.target.lerpVectors(fromT, toT, t); });
}

const clamp = (v, lim) => Math.max(-lim, Math.min(lim, v));

let lastSiteKey = null;
function changeRoomConfig() {
  const prev = SITES[lastSiteKey] || null;
  lastSiteKey = $('roomSizeSelect').value;
  buildRoom();
  const { w, l } = roomSize();
  // จากห้องเดียว → หลายห้อง/อาคาร: ยกอุปกรณ์ทั้งหมดไปไว้ในห้อง/อาคารแรก (ไม่ให้ไปค้างกลางทางเดินหรือคร่อมผนัง)
  const z0 = siteZones().find(z => !z.corridor);
  if (z0 && (!prev || !prev.zones)) {
    const fit = Math.min(1, (z0.w - 1.6) / (prev ? prev.w : 8), (z0.l - 1.6) / (prev ? prev.l : 8));
    for (const [id, node] of nodes) {
      node.group.position.x = z0.x + node.group.position.x * fit;
      node.group.position.z = z0.z + node.group.position.z * fit;
    }
  } else if (prev && prev.zones && !roomSize().zones) {
    // จากอาคาร/วิทยาเขต → ห้องเดียว: ย่อตำแหน่งทั้งหมดให้อยู่ในห้อง
    const fit = Math.min(1, (w - 1.6) / prev.w, (l - 1.6) / prev.l);
    for (const [, node] of nodes) { node.group.position.x *= fit; node.group.position.z *= fit; }
  }
  for (const [id, node] of nodes) {
    node.group.position.x = clamp(node.group.position.x, w / 2 - 0.8);
    node.group.position.z = clamp(node.group.position.z, l / 2 - 0.8);
    syncDevicePos(id);
  }
  rebuildAllCables();
  placeRings();
  if (viewMode === '3d') reset3DCamera(); else enterTour();
  const site = roomSize();
  logConsole(site.zones ? `[ROOM] เปลี่ยนพื้นที่เป็น ${site.label} (${site.zones.filter(z => !z.corridor).length} ${site.kind === 'campus' ? 'อาคาร' : 'ห้อง'})` : `[ROOM] ปรับห้องเป็น ${w}x${l} เมตร`, 'info');
}

/* ==========================================================================
   โมเดล 3D ของอุปกรณ์ (สร้างจากรูปทรงพื้นฐานตาม "form" ของแต่ละรุ่น)
   ========================================================================== */
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function addMesh(group, geo, color, x, y, z, opts) {
  const o = opts || {};
  const mat = o.basic
    ? new THREE.MeshBasicMaterial({ color })
    : new THREE.MeshStandardMaterial({ color, metalness: o.metal === undefined ? 0.35 : o.metal, roughness: o.rough === undefined ? 0.55 : o.rough });
  if (o.opacity !== undefined) { mat.transparent = true; mat.opacity = o.opacity; }
  if (mat.isMeshStandardMaterial) mat.wireframe = wireframe;
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = !o.basic && o.opacity === undefined;
  m.receiveShadow = !o.basic;
  group.add(m);
  return m;
}
const box = (g, w, hh, d, x, y, z, color, opts) => addMesh(g, new THREE.BoxGeometry(w, hh, d), color, x, y, z, opts);
const cyl = (g, r, hh, x, y, z, color, opts) => addMesh(g, new THREE.CylinderGeometry(r, r, hh, 20), color, x, y, z, opts);
const ball = (g, r, x, y, z, color, opts) => addMesh(g, new THREE.SphereGeometry(r, 18, 14), color, x, y, z, opts);
const led = (g, x, y, z, s) => box(g, s || 0.03, (s || 0.03) * 0.6, 0.01, x, y, z, 0x1f2937, { basic: true });

function table(g, w, d, hh, color) {
  box(g, w, 0.05, d, 0, hh - 0.025, 0, color || 0x475569, { rough: 0.8 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 0.05, hh - 0.05, 0.05, sx * (w / 2 - 0.05), (hh - 0.05) / 2, sz * (d / 2 - 0.05), 0x1f2937);
  return hh;
}
function antenna(g, x, y, z, len) {
  cyl(g, 0.012, len, x, y + len / 2, z, 0x111827);
  ball(g, 0.02, x, y + len, z, 0x0f172a);
}

const labelCache = new Map();
function textPlane(text, w, hh, fg, bg) {
  const key = `${text}|${w}|${hh}|${fg}|${bg}`;
  let mat = labelCache.get(key);
  if (!mat) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = Math.max(32, Math.round(256 * hh / w));
    const ctx = c.getContext('2d');
    ctx.fillStyle = bg || '#0b1220'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = fg || '#e2e8f0';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `600 ${Math.round(c.height * 0.5)}px "JetBrains Mono", monospace`;
    ctx.fillText(text, c.width / 2, c.height / 2, c.width - 10);
    const tex = new THREE.CanvasTexture(c);
    tex.shared = true;
    mat = new THREE.MeshBasicMaterial({ map: tex });
    mat.shared = true;
    labelCache.set(key, mat);
  }
  return new THREE.Mesh(new THREE.PlaneGeometry(w, hh), mat);
}

function socket(g, media, x, y, z, s) {
  const c = SOCKET_COLORS[media] || 0x111827;
  if (media === 'coax') { const m = cyl(g, s * 0.32, 0.03, x, y, z, c, { metal: 0.9 }); m.rotation.x = Math.PI / 2; return; }
  if (media === 'serial' || media === 'async') return box(g, s * 1.25, s * 0.55, 0.012, x, y, z, c);
  if (media === 'fiber') { box(g, s * 0.75, s * 0.7, 0.012, x, y, z, 0x1f2937); box(g, s * 0.22, s * 0.3, 0.014, x - s * 0.17, y, z, c, { basic: true }); box(g, s * 0.22, s * 0.3, 0.014, x + s * 0.17, y, z, c, { basic: true }); return; }
  if (media === 'usb') return box(g, s * 0.7, s * 0.3, 0.012, x, y, z, c);
  if (media === 'phone') return box(g, s * 0.6, s * 0.5, 0.012, x, y, z, c);
  box(g, s * 0.82, s * 0.7, 0.012, x, y, z, c, { rough: 0.3 });
}

// อุปกรณ์ติดตู้แร็ค (Router / Switch / Hub / Firewall / WLC): วาดพอร์ตตามรุ่นจริงบนหน้าเครื่อง
function buildRack(dev, g) {
  const spec = dev.spec;
  const W = spec.width || 1.2, ru = spec.ru || 1;
  const H = 0.15 * ru + 0.05, D = 0.55, base = 0.78;
  box(g, Math.max(W, 0.7) * 0.94, base, 0.62, 0, base / 2, 0, 0x1b2438, { rough: 0.7 });
  box(g, W, H, D, 0, base + H / 2, 0, spec.color, { metal: 0.6, rough: 0.35 });
  const front = D / 2 + 0.007;
  const lblW = Math.min(0.3, W * 0.3);
  const plate = textPlane(spec.label, lblW, Math.min(H * 0.55, 0.08), '#e2e8f0', '#' + spec.color.toString(16).padStart(6, '0'));
  plate.position.set(-W / 2 + lblW / 2 + 0.03, base + H / 2 + H * 0.12, front);
  g.add(plate);
  led(g, -W / 2 + 0.05, base + H / 2 - H * 0.25, front, 0.025).material.color.setHex(0x00e676);
  const vis = dev.ports.map((p, i) => i).filter(i => !dev.ports[i].hidden);
  const rows = (ru >= 2 || vis.length > 12) ? 2 : 1;
  const cols = Math.max(1, Math.ceil(vis.length / rows));
  const x0 = -W / 2 + lblW + 0.07, x1 = W / 2 - 0.04;
  const step = (x1 - x0) / cols;
  const s = Math.min(step * 0.72, 0.07);
  const anchors = [], leds = [];
  vis.forEach((pi, k) => {
    const col = Math.floor(k / rows), row = k % rows;
    const x = x0 + step * (col + 0.5);
    const y = base + H / 2 + (rows === 2 ? (row === 0 ? H * 0.2 : -H * 0.22) : -H * 0.08);
    socket(g, dev.ports[pi].media, x, y, front, s);
    leds[pi] = led(g, x, y + s * 0.62, front + 0.002, s * 0.4);
    anchors[pi] = V(x, y, front + 0.03);
  });
  let ant = V(0, base + H, 0);
  if (spec.wireless || spec.antennas) {
    antenna(g, -W / 2 + 0.08, base + H, -0.2, 0.3);
    antenna(g, W / 2 - 0.08, base + H, -0.2, 0.3);
    ant = V(0, base + H + 0.3, -0.2);
  }
  return { height: base + H, leds, anchors, antenna: ant };
}

function buildPc(dev, g, laptop) {
  table(g, 1.5, 0.75, 0.77);
  box(g, 0.46, 0.06, 0.46, -0.1, 0.46, 0.72, 0x1e293b);
  box(g, 0.46, 0.5, 0.05, -0.1, 0.78, 0.94, 0x1e293b);
  cyl(g, 0.03, 0.44, -0.1, 0.22, 0.72, 0x0f172a);
  const leds = [];
  const P = {};
  if (laptop) {
    const accent = dev.spec.sniffer ? 0x7f1d1d : 0x334155;
    box(g, 0.55, 0.025, 0.38, 0, 0.785, 0.05, accent, { metal: 0.6 });
    box(g, 0.48, 0.006, 0.2, 0, 0.8, 0.08, 0x0f172a);
    const scr = box(g, 0.55, 0.36, 0.02, 0, 0.97, -0.15, accent, { metal: 0.6 });
    scr.rotation.x = -0.25;
    const disp = box(g, 0.5, 0.31, 0.005, 0, 0.97, -0.137, dev.spec.sniffer ? 0xff3d71 : 0x0a84ff, { basic: true });
    disp.rotation.x = -0.25;
    P.copper = V(0.28, 0.79, 0); P.wlan = V(0, 1.17, -0.18); P.rs232 = V(0.28, 0.79, 0.12); P.usb = V(-0.28, 0.79, 0.05);
    leds[0] = led(g, 0.2, 0.8, 0.24, 0.02);
    return { height: 1.2, leds, P, antenna: P.wlan };
  }
  box(g, 0.3, 0.02, 0.2, 0, 0.78, -0.15, 0x111827);
  box(g, 0.07, 0.2, 0.06, 0, 0.88, -0.17, 0x111827);
  box(g, 0.82, 0.5, 0.04, 0, 1.22, -0.15, 0x05070c, { rough: 0.2 });
  box(g, 0.76, 0.44, 0.01, 0, 1.22, -0.127, 0x0a84ff, { basic: true });
  box(g, 0.5, 0.02, 0.16, -0.05, 0.78, 0.16, 0x111827);
  box(g, 0.07, 0.025, 0.11, 0.36, 0.78, 0.16, 0x111827);
  box(g, 0.22, 0.5, 0.48, 0.5, 0.25, -0.05, 0x0f172a, { metal: 0.6 });
  leds[0] = led(g, 0.5, 0.42, 0.195);
  P.copper = V(0.5, 0.3, -0.3); P.rs232 = V(0.5, 0.38, -0.3); P.usb = V(0.5, 0.45, -0.3);
  return { height: 1.5, leds, P };
}

function buildServer(dev, g) {
  box(g, 0.5, 1.25, 0.85, 0, 0.625, 0, 0x334155, { metal: 0.7, rough: 0.35 });
  box(g, 0.44, 1.12, 0.02, 0, 0.64, 0.43, 0x0b1220);
  for (let i = 0; i < 5; i++) {
    box(g, 0.38, 0.1, 0.02, 0, 0.98 - i * 0.16, 0.445, 0x1e293b);
    box(g, 0.02, 0.02, 0.01, 0.15, 0.98 - i * 0.16, 0.458, i % 2 ? 0x00f0ff : 0x00e676, { basic: true });
  }
  box(g, 0.44, 0.02, 0.02, 0, 1.2, 0.44, 0x00f0ff, { basic: true });
  return { height: 1.3, leds: [led(g, -0.14, 0.14, 0.445, 0.05)], P: { copper: V(0, 0.2, -0.44) } };
}

function buildRackServer(dev, g) {
  box(g, 0.9, 2.2, 1.0, 0, 1.1, 0, 0x111827, { metal: 0.8, rough: 0.25 });
  for (let i = 0; i < 6; i++) {
    const y = 0.35 + i * 0.3;
    box(g, 0.78, 0.24, 0.03, 0, y, 0.505, 0x1f2937, { metal: 0.5 });
    box(g, 0.025, 0.025, 0.01, 0.3, y, 0.525, i % 2 ? 0x00f0ff : 0x00e676, { basic: true });
    box(g, 0.025, 0.025, 0.01, 0.25, y, 0.525, 0xffb020, { basic: true });
  }
  box(g, 0.9, 2.2, 0.01, 0, 1.1, 0.55, 0x7dd3fc, { opacity: 0.12, metal: 0.9, rough: 0.05 });
  return { height: 2.25, leds: [led(g, -0.3, 2.08, 0.525, 0.06)], P: { copper: V(0, 0.3, -0.52) } };
}

function buildSmall(dev, g) {
  const form = dev.spec.form, c = dev.spec.color;
  const leds = [];
  if (form === 'printer') {
    table(g, 0.8, 0.6, 0.7);
    box(g, 0.55, 0.26, 0.42, 0, 0.83, 0, 0xe5e7eb, { rough: 0.6 });
    box(g, 0.4, 0.02, 0.25, 0, 0.97, -0.05, 0xf8fafc);
    box(g, 0.42, 0.04, 0.15, 0, 0.78, 0.26, 0x9ca3af);
    leds[0] = led(g, 0.2, 0.9, 0.215);
    return { height: 1.0, leds, P: { copper: V(0, 0.8, -0.22) } };
  }
  if (form === 'ipphone' || form === 'phone') {
    table(g, 0.7, 0.5, 0.72);
    const base = box(g, 0.24, 0.08, 0.22, 0, 0.77, 0, form === 'ipphone' ? 0x1f2937 : 0xe5e7eb);
    base.rotation.x = -0.2;
    const hs = cyl(g, 0.025, 0.22, -0.08, 0.83, 0, form === 'ipphone' ? 0x111827 : 0xd1d5db);
    hs.rotation.x = Math.PI / 2;
    if (form === 'ipphone') { const sc = box(g, 0.1, 0.06, 0.005, 0.05, 0.83, 0.02, 0x7dd3fc, { basic: true }); sc.rotation.x = -0.2 - Math.PI / 2 + 1.2; }
    leds[0] = led(g, 0.09, 0.82, 0.08, 0.02);
    return { height: 0.95, leds, P: { copper: V(0.05, 0.76, -0.12), phone: V(0.05, 0.76, -0.12) } };
  }
  if (form === 'voipbox' || form === 'modem' || form === 'splitter') {
    table(g, 0.6, 0.45, 0.7);
    if (form === 'modem') box(g, 0.08, 0.32, 0.24, 0, 0.86, 0, c, { metal: 0.5 });
    else box(g, form === 'splitter' ? 0.16 : 0.26, 0.06, form === 'splitter' ? 0.1 : 0.18, 0, 0.73, 0, form === 'splitter' ? 0x9ca3af : 0x334155, { metal: 0.6 });
    const n = dev.ports.length;
    const P = [];
    dev.ports.forEach((p, i) => {
      const x = (i - (n - 1) / 2) * 0.07;
      const y = form === 'modem' ? 0.78 + i * 0.08 : 0.73;
      P[i] = V(form === 'modem' ? 0 : x, y, form === 'modem' ? -0.13 : -0.06);
      leds[i] = led(g, form === 'modem' ? 0.042 : x, form === 'modem' ? 0.95 - i * 0.05 : 0.765, form === 'modem' ? 0.05 : 0.05, 0.02);
      if (form === 'modem') leds[i].rotation.y = Math.PI / 2;
    });
    return { height: form === 'modem' ? 1.05 : 0.8, leds, byIndex: P };
  }
  if (form === 'tv') {
    cyl(g, 0.25, 0.04, 0, 0.02, 0, 0x111827);
    cyl(g, 0.04, 0.9, 0, 0.47, 0, 0x111827);
    box(g, 1.3, 0.75, 0.05, 0, 1.25, 0, 0x05070c, { rough: 0.2 });
    box(g, 1.22, 0.67, 0.01, 0, 1.25, 0.03, 0x1d4ed8, { basic: true });
    return { height: 1.65, leds, P: { coax: V(0.4, 1.0, -0.03), copper: V(-0.4, 1.0, -0.03), wlan: V(0.55, 1.6, 0) }, antenna: V(0.55, 1.6, 0) };
  }
  if (form === 'camera') {
    // กล้องวงจรปิดบนเสา: ตัวกล้องทรงกระบอก + เลนส์ + ไฟ IR
    cyl(g, 0.16, 0.04, 0, 0.02, 0, 0x1f2937);
    cyl(g, 0.03, 1.5, 0, 0.77, 0, 0x6b7280);
    const body = box(g, 0.16, 0.13, 0.36, 0, 1.6, 0.08, c, { metal: 0.3 });
    body.rotation.x = 0.25;
    const lens = cyl(g, 0.045, 0.03, 0, 1.56, 0.27, 0x0f172a);
    lens.rotation.x = Math.PI / 2 + 0.25;
    leds[0] = led(g, 0.05, 1.67, 0.2, 0.018);
    return { height: 1.75, leds, P: { copper: V(0, 1.2, -0.04), wlan: V(0, 1.7, 0) }, antenna: V(0, 1.7, 0) };
  }
  if (form === 'console') {
    table(g, 0.6, 0.45, 0.6);
    box(g, 0.34, 0.08, 0.26, 0, 0.66, 0, c, { metal: 0.4 });
    box(g, 0.3, 0.01, 0.22, 0, 0.705, 0, 0x2563eb, { basic: true });
    const pad = box(g, 0.14, 0.03, 0.08, 0.12, 0.64, 0.17, 0x111827);
    pad.rotation.y = 0.4;
    leds[0] = led(g, 0.15, 0.66, 0.132, 0.015);
    return { height: 0.8, leds, P: { copper: V(0, 0.66, -0.14), wlan: V(0, 0.75, 0) }, antenna: V(0, 0.75, 0) };
  }
  if (form === 'tablet' || form === 'smartphone') {
    table(g, 0.6, 0.45, 0.7);
    if (form === 'tablet') {
      const t = box(g, 0.32, 0.015, 0.23, 0, 0.72, 0, 0x1f2937, { metal: 0.6 }); t.rotation.x = -0.3;
      const s = box(g, 0.29, 0.003, 0.2, 0, 0.729, 0.003, 0x38bdf8, { basic: true }); s.rotation.x = -0.3;
    } else {
      box(g, 0.1, 0.03, 0.08, 0, 0.715, 0.03, 0x334155);
      box(g, 0.085, 0.17, 0.012, 0, 0.81, 0, 0x111827, { metal: 0.6 });
      box(g, 0.075, 0.15, 0.003, 0, 0.81, 0.007, 0x22d3ee, { basic: true });
    }
    return { height: 0.95, leds, P: { wlan: V(0, 0.9, 0) }, antenna: V(0, 0.9, 0) };
  }
  if (form === 'enddev') {
    table(g, 0.6, 0.45, 0.7);
    box(g, 0.3, 0.3, 0.3, 0, 0.85, 0, c, { metal: 0.4 });
    leds[0] = led(g, 0.1, 0.9, 0.152);
    return { height: 1.05, leds, P: { copper: V(0, 0.8, -0.16), wlan: V(0, 1.0, 0) }, antenna: V(0, 1.0, 0) };
  }
  if (form === 'board') {
    table(g, 0.7, 0.5, 0.7);
    box(g, 0.4, 0.02, 0.28, 0, 0.71, 0, c, { rough: 0.7 });
    box(g, 0.1, 0.02, 0.1, 0.02, 0.73, 0, 0x111827);
    const P = [];
    dev.ports.forEach((p, i) => {
      const x = -0.17 + i * (0.34 / Math.max(1, dev.ports.length - 1));
      box(g, 0.025, 0.04, 0.025, x, 0.74, -0.12, SOCKET_COLORS[p.media] || 0x111827);
      P[i] = V(x, 0.76, -0.12);
    });
    leds[0] = led(g, 0.15, 0.73, 0.1, 0.02);
    return { height: 0.85, leds, byIndex: P };
  }
  if (form === 'led' || form === 'fan' || form === 'sensor') {
    cyl(g, 0.15, 0.04, 0, 0.02, 0, 0x1f2937);
    cyl(g, 0.025, 1.0, 0, 0.52, 0, 0x334155);
    let spin = null;
    if (form === 'led') ball(g, 0.09, 0, 1.08, 0, c, { basic: true });
    else if (form === 'sensor') { ball(g, 0.1, 0, 1.05, 0, c, { rough: 0.3 }); box(g, 0.16, 0.04, 0.16, 0, 1.0, 0, 0x94a3b8); }
    else {
      box(g, 0.34, 0.34, 0.06, 0, 1.1, 0, 0x475569);
      spin = new THREE.Group();
      spin.position.set(0, 1.1, 0.04);
      for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: c })); b.rotation.z = i * Math.PI / 3; spin.add(b); }
      g.add(spin);
    }
    return { height: 1.25, leds, P: { iot: V(0, 0.2, 0) }, spin };
  }
  if (form === 'ups') {
    box(g, 0.55, 0.8, 0.8, 0, 0.4, 0, 0x27272a, { metal: 0.5 });
    box(g, 0.34, 0.16, 0.01, 0, 0.6, 0.405, 0x052e2b, { basic: true });
    for (let i = 0; i < 4; i++) box(g, 0.05, 0.09, 0.012, -0.105 + i * 0.07, 0.6, 0.41, 0x00e676, { basic: true });
    box(g, 0.2, 0.03, 0.01, 0, 0.3, 0.405, 0xffb020, { basic: true });
    return { height: 0.85, leds, P: {} };
  }
  return null;
}

function buildAp(dev, g) {
  cyl(g, 0.2, 0.04, 0, 0.02, 0, 0x1f2937);
  cyl(g, 0.03, 1.75, 0, 0.9, 0, 0x475569);
  cyl(g, 0.24, 0.06, 0, 1.8, 0, dev.spec.color, { rough: 0.4 });
  const ring = addMesh(g, new THREE.TorusGeometry(0.17, 0.012, 8, 32), 0x1f2937, 0, 1.834, 0, { basic: true });
  ring.rotation.x = Math.PI / 2;
  antenna(g, 0.16, 1.83, 0, 0.18);
  antenna(g, -0.16, 1.83, 0, 0.18);
  return { height: 2.05, leds: [ring], P: { copper: V(0, 1.6, 0) }, antenna: V(0, 2.0, 0) };
}

function buildWrouter(dev, g) {
  table(g, 0.8, 0.55, 0.72);
  box(g, 0.56, 0.08, 0.34, 0, 0.76, 0, dev.spec.color, { metal: 0.5 });
  for (const x of [-0.22, 0, 0.22]) antenna(g, x, 0.8, -0.15, 0.3);
  const leds = [], P = [];
  const vis = dev.ports.map((p, i) => i).filter(i => !dev.ports[i].hidden);
  vis.forEach((pi, k) => {
    const x = -0.22 + k * (0.44 / Math.max(1, vis.length - 1));
    box(g, 0.045, 0.035, 0.01, x, 0.76, -0.172, k === 0 ? 0x2563eb : 0x111827);
    leds[pi] = led(g, x, 0.765, 0.172, 0.02);
    P[pi] = V(x, 0.76, -0.2);
  });
  return { height: 1.1, leds, byIndex: P, antenna: V(0, 1.1, -0.15) };
}

function buildCloud(dev, g) {
  cyl(g, 0.35, 0.6, 0, 0.3, 0, 0x1e293b);
  for (const [x, y, z, r] of [[0, 1.35, 0, 0.42], [-0.42, 1.2, 0.05, 0.3], [0.42, 1.2, -0.05, 0.32], [0.18, 1.6, 0.1, 0.3], [-0.2, 1.55, -0.12, 0.28]]) {
    ball(g, r, x, y, z, dev.spec.color, { rough: 0.9, metal: 0 });
  }
  const P = [];
  dev.ports.forEach((p, i) => {
    const a = (i / dev.ports.length) * Math.PI * 2;
    P[i] = V(Math.cos(a) * 0.4, 0.55, Math.sin(a) * 0.4);
    box(g, 0.06, 0.05, 0.02, P[i].x, 0.55, P[i].z, SOCKET_COLORS[p.media] || 0x111827).lookAt(0, 0.55, 0);
  });
  return { height: 1.9, leds: [], byIndex: P };
}

function buildModel(dev, g) {
  const form = dev.spec.form;
  let m;
  if (form === 'rack') m = buildRack(dev, g);
  else if (form === 'pc') m = buildPc(dev, g, false);
  else if (form === 'laptop') m = buildPc(dev, g, true);
  else if (form === 'server') m = buildServer(dev, g);
  else if (form === 'rackserver') m = buildRackServer(dev, g);
  else if (form === 'ap') m = buildAp(dev, g);
  else if (form === 'wrouter') m = buildWrouter(dev, g);
  else if (form === 'cloud') m = buildCloud(dev, g);
  else m = buildSmall(dev, g) || buildRack(dev, g);
  const top = V(0, m.height, 0);
  const antennaPt = m.antenna || top;
  m.anchor = i => {
    const p = dev.ports[i];
    if (!p) return top.clone();
    if (p.media === 'wlan' || p.media === 'radio') return antennaPt.clone();
    if (m.anchors && m.anchors[i]) return m.anchors[i].clone();
    if (m.byIndex && m.byIndex[i]) return m.byIndex[i].clone();
    const base = (m.P && (m.P[p.media] || m.P.copper)) || top;
    const same = dev.ports.filter((q, k) => k < i && q.media === p.media).length;
    return base.clone().add(V(0, same * 0.05, 0));
  };
  return m;
}

/* ------------------------------ ป้ายชื่อ ------------------------------ */
function roundRectPath(ctx, x, y, w, hh, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + hh, r);
  ctx.arcTo(x + w, y + hh, x, y + hh, r);
  ctx.arcTo(x, y + hh, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function labelSub(dev) {
  const ips = dev.ifaces.filter(f => f.ip).map(f => f.ip);
  switch (dev.kind) {
    case 'host': return ips[0] || (dev.ifaces.some(f => f.dhcp) ? 'DHCP (รอรับ IP)' : 'ยังไม่ตั้ง IP');
    case 'router': return ips.slice(0, 2).join(' | ') || 'ยังไม่ตั้ง IP';
    case 'gateway': return (dev.wifi ? `Wi-Fi ${dev.wifi.ssid} · ` : '') + (ips.length > 1 ? ips[1] : (ips[0] || ''));
    case 'switch': {
      const vis = dev.ports.filter(p => p.media !== 'console');
      return `${vis.filter(p => p.link).length}/${vis.length} พอร์ต` + (ips[0] ? ` · ${ips[0]}` : '');
    }
    case 'ap': return `Wi-Fi ${dev.wifi.ssid} · ${net.wifiClients(dev).length} เครื่อง`;
    case 'hub': return `${dev.spec.label} · Layer 1`;
    default: return dev.spec.label;
  }
}

function drawLabel(id) {
  const node = nodes.get(id), dev = devOf(id);
  if (!node || !dev) return;
  const c = node.labelCanvas, ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
  roundRectPath(ctx, 6, 6, c.width - 12, c.height - 12, GLASS ? 40 : 24);
  ctx.fillStyle = GLASS ? 'rgba(14,18,52,0.78)' : 'rgba(10,15,29,0.84)';
  ctx.fill();
  ctx.lineWidth = 3;
  if (GLASS) {
    const g = ctx.createLinearGradient(0, 0, c.width, 0);
    g.addColorStop(0, '#22d3ee'); g.addColorStop(0.55, '#a855f7'); g.addColorStop(1, '#ec4899');
    ctx.strokeStyle = g;
  } else ctx.strokeStyle = 'rgba(0,240,255,0.6)';
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = '600 40px Kanit, sans-serif';
  ctx.fillText(dev.name, c.width / 2, 46, c.width - 44);
  ctx.fillStyle = '#00f0ff';
  ctx.font = '500 26px "JetBrains Mono", monospace';
  ctx.fillText(labelSub(dev), c.width / 2, 92, c.width - 44);
  node.labelTex.needsUpdate = true;
}
function redrawAllLabels() { for (const id of nodes.keys()) drawLabel(id); }

/* --------------------------- สร้าง / ลบอุปกรณ์ --------------------------- */
function createNode(dev, anim) {
  const group = new THREE.Group();
  group.userData.deviceId = dev.id;
  const model = buildModel(dev, group);
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.scale.set(1.9, 0.475, 1);
  sprite.position.set(0, model.height + 0.42, 0);
  sprite.renderOrder = 10;
  group.add(sprite);
  group.position.set(dev.x, 0, dev.z);
  scene.add(group);
  nodes.set(dev.id, { group, labelCanvas: canvas, labelTex: tex, height: model.height, anchor: model.anchor, leds: model.leds || [], spin: model.spin });
  drawLabel(dev.id);
  if (anim) dropIn(dev.id, anim === true ? 0 : anim);
}

/* ------------------- แอนิเมชันอุปกรณ์: หล่นลงมาวาง / หดหายตอนลบ ------------------- */
const easeOutBack = k => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
function dropIn(id, delay) {
  const node = nodes.get(id);
  if (!node || UI.reduced) return Promise.resolve();
  const g = node.group;
  g.scale.setScalar(0.001);
  return sleep(delay || 0).then(() => {
    if (!nodes.has(id)) return null;
    const y0 = 1.4;
    return tween(480, k => {
      const s = Math.max(0.001, easeOutBack(k));
      g.scale.set(s, s, s);
      g.position.y = y0 * (1 - ease(k));
    }).then(() => { g.scale.set(1, 1, 1); g.position.y = 0; pulseDevice(id, 0x38c6f4); });
  });
}
function removeNodeAnimated(id) {
  const node = nodes.get(id);
  if (!node) return;
  nodes.delete(id);
  if (UI.reduced) { scene.remove(node.group); disposeTree(node.group); return; }
  const g = node.group;
  tween(320, k => { const s = Math.max(0.001, 1 - ease(k)); g.scale.set(s, s, s); g.position.y = k * 0.6; g.rotation.y = k * 0.8; })
    .then(() => { scene.remove(g); disposeTree(g); });
}

// เปิดห้องครั้งแรก: อุปกรณ์หล่นลงมาวางทีละชิ้นจากหลังห้องมาหน้าห้อง แล้วสายค่อย ๆ ลากเชื่อม
let introPending = false;
async function playIntro() {
  if (!introPending) return;
  introPending = false;
  if (UI.reduced) return;
  const order = [...net.devices.values()].sort((a, b) => a.z - b.z || a.x - b.x);
  for (const id of [...cables.keys()]) cables.get(id).mesh.visible = false;
  const drops = order.map((d, i) => dropIn(d.id, i * 70));
  await Promise.all(drops);
  [...net.links.values()].forEach((l, i) => { const c = cables.get(l.id); if (c) { c.mesh.visible = true; drawCableIn(c, i * 60); } });
}
function drawCableIn(c, delay) {
  const geo = c.mesh.geometry;
  const total = geo.index ? geo.index.count : 0;
  if (!total || UI.reduced || typeof geo.setDrawRange !== 'function') return;
  geo.setDrawRange(0, 0);
  c.extras.forEach(e => { e.visible = false; });
  sleep(delay || 0).then(() => tween(520, k => {
    geo.setDrawRange(0, Math.floor(total * ease(k) / 6) * 6);
  })).then(() => { geo.setDrawRange(0, Infinity); c.extras.forEach(e => { e.visible = true; }); });
}

// ภารกิจครบ 100%: ไฟทุกเครื่องกะพริบเป็นคลื่นจากกลางห้องออกไป เหมือนทั้งเครือข่าย "link up"
function celebrateNetwork() {
  const list = [...net.devices.values()].map(d => ({ d, r: Math.hypot(d.x, d.z) })).sort((a, b) => a.r - b.r);
  list.forEach(({ d }, i) => setTimeout(() => pulseDevice(d.id, 0x3ddc84), UI.reduced ? 0 : i * 90));
}

function removeNode(id) {
  const node = nodes.get(id);
  if (!node) return;
  scene.remove(node.group);
  disposeTree(node.group);
  nodes.delete(id);
}

function freeSpot() {
  const taken = [...nodes.values()].map(n => n.group.position);
  if (currentZone) {
    const z = currentZone;
    for (let dz = -z.l / 2 + 1; dz <= z.l / 2 - 0.8; dz += 1.5) {
      for (let dx = -z.w / 2 + 1; dx <= z.w / 2 - 0.8; dx += 1.6) {
        const x = z.x + dx, q = z.z + dz;
        if (!taken.some(p => Math.hypot(p.x - x, p.z - q) < 1.3)) return { x, z: q };
      }
    }
    return { x: z.x + (Math.random() - 0.5) * (z.w - 2), z: z.z + (Math.random() - 0.5) * (z.l - 2) };
  }
  const { w, l } = roomSize();
  for (let z = -l / 2 + 1.2; z <= l / 2 - 1; z += 1.7) {
    for (let x = -w / 2 + 1.1; x <= w / 2 - 1; x += 1.8) {
      if (!taken.some(p => Math.hypot(p.x - x, p.z - z) < 1.5)) return { x, z };
    }
  }
  return { x: (Math.random() - 0.5) * (w - 2), z: (Math.random() - 0.5) * (l - 2) };
}

function usedIps() {
  const set = new Set();
  for (const d of net.devices.values()) d.ifaces.forEach(f => { if (f.ip) set.add(f.ip); });
  return set;
}
function nextIp(from) {
  const used = usedIps();
  for (let i = from; i < 255; i++) if (!used.has(`192.168.1.${i}`)) return `192.168.1.${i}`;
  return '';
}

function spawnDevice3D(model) {
  const spec = NetSim.MODELS[model];
  if (!spec) return;
  const names = new Set([...net.devices.values()].map(d => d.name));
  let n = [...net.devices.values()].filter(d => d.spec.prefix === spec.prefix).length + 1;
  while (names.has(`${spec.prefix}-${n}`)) n++;
  const cfg = Object.assign({ id: nextDeviceId++, model, name: `${spec.prefix}-${n}` }, freeSpot());
  // ใส่ IP เริ่มต้นให้เครื่องที่ต่อสาย LAN ได้ เพื่อให้ทดลองได้ทันที (แก้ได้ในแท็บคุณสมบัติ)
  const firstData = spec.ports.find(p => p.media === 'copper' || p.media === 'fiber');
  const defaultsHaveIp = (spec.defaults.ifaces || []).some(f => f.ip || f.dhcp || f.ssid);
  if (spec.kind === 'host' && firstData && !defaultsHaveIp) {
    const from = spec.server ? 100 : (spec.cat === 'room' ? 200 : 10);
    cfg.ifaces = [{ name: spec.bridgeIface || firstData.name, ip: nextIp(from), mask: '255.255.255.0' }];
  }
  if (spec.kind === 'router' && !usedIps().has('192.168.1.1')) cfg.ifaces = [{ name: spec.ports[0].name, ip: '192.168.1.1', mask: '255.255.255.0' }];
  const dev = net.addDevice(cfg);
  createNode(dev, true);
  const before = new Set(net.links.keys());
  net.syncWireless();
  rebuildAllCables();
  for (const id of net.links.keys()) if (!before.has(id) && cables.get(id)) drawCableIn(cables.get(id), 300);
  refreshAll();
  selectDevice3D(dev.id);
  if (!editMode && !lockHintShown) { lockHintShown = true; showToast('อยากย้ายอุปกรณ์? กดปุ่ม "แก้ไขตำแหน่ง" (หรือคีย์ E) ก่อน แล้วลากได้เลย'); }
  logConsole(`[ADDED] เพิ่ม ${dev.name} (${spec.label}) ลงในห้อง — พอร์ต: ${dev.ports.filter(p => !p.hidden).map(p => p.name).join(', ') || 'ไม่มี'}`, 'info');
}

function syncDevicePos(id) {
  const dev = devOf(id), node = nodes.get(id);
  if (dev && node) { dev.x = +node.group.position.x.toFixed(3); dev.z = +node.group.position.z.toFixed(3); }
}

/* ==========================================================================
   แค็ตตาล็อกอุปกรณ์ / สาย (แถบซ้าย เหมือนกล่องล่างซ้ายของ Packet Tracer)
   ========================================================================== */
function renderCatalog() {
  const tabs = $('catTabs');
  tabs.innerHTML = '';
  let lastGroup = '';
  NetSim.CATEGORIES.filter(c => !HIDDEN_CATS.has(c.id)).forEach(c => {
    if (c.group !== lastGroup) { tabs.append(h('div', { class: 'cat-group', text: c.group })); lastGroup = c.group; }
    tabs.append(h('button', { class: 'cat-tab' + (c.id === currentCat ? ' active' : ''), style: `--cat:${CAT_COLORS[c.id] || '#22d3ee'}`, title: `${c.label} — ${c.th}`, onclick: () => { currentCat = c.id; renderCatalog(); } }, icon(c.icon)));
  });
  tabs.append(h('a', { class: 'cat-tab cat-tab--iot', href: 'iot.html', style: '--cat:#f59e0b', title: 'อุปกรณ์ IoT (บอร์ด เซนเซอร์ สาย IoT) ย้ายไปอยู่ที่ห้องเรียน IoT แล้ว — คลิกเพื่อไป' }, icon('fa-microchip')));
  const cat = catOf(currentCat);
  const list = $('modelList');
  list.innerHTML = '';
  if (currentCat === 'cables') {
    $('catHead').textContent = `${cat.label} · ${cat.th} (${LAB_CABLES().length} ชนิด) — คลิกสาย แล้วคลิกอุปกรณ์ 2 ตัว`;
    LAB_CABLES().forEach(id => {
      const c = NetSim.CABLES[id];
      list.append(h('button', { class: 'model-card cable-card' + (cableTool && cableType === id ? ' active' : ''), style: `--accent:${id === 'auto' ? '#f97316' : hex(c.color)}`, title: c.desc, onclick: () => startCableTool(id) },
        h('span', { class: 'cable-swatch', style: `background:${id === 'auto' ? 'linear-gradient(135deg,#ff9100,#ffe14d)' : hex(c.color)}` }, icon(c.icon)),
        h('span', { class: 'mc-text' }, h('b', { text: c.label }), h('small', { text: c.th }))));
    });
    return;
  }
  const models = NetSim.MODEL_ORDER.map(id => NetSim.MODELS[id]).filter(m => m.cat === currentCat);
  $('catHead').textContent = `${cat.label} · ${cat.th} (${models.length} รุ่น) — คลิกเพื่อวางลงห้อง`;
  models.forEach(m => {
    const ports = m.ports.length ? m.ports.map(p => p.name).slice(0, 4).join(', ') + (m.ports.length > 4 ? ` +${m.ports.length - 4}` : '') : 'ไม่มีพอร์ต';
    list.append(h('button', { class: 'model-card', style: `--accent:${CAT_COLORS[m.cat] || '#22d3ee'}`, title: `${m.label}\n${m.desc}\nพอร์ต: ${m.ports.map(p => p.name).join(', ') || '-'}`, onclick: ev => { const card = ev.currentTarget; card.classList.remove('is-added'); void card.offsetWidth; card.classList.add('is-added'); spawnDevice3D(m.id); } },
      h('span', { class: 'mc-icon', style: `color:${m.form === 'rack' ? '#00f0ff' : '#7dd3fc'}` }, icon(m.icon)),
      h('span', { class: 'mc-text' }, h('b', { text: m.label }), h('small', { text: ports }))));
  });
}

function fillCableSelect() {
  const sel = $('connTypeSelect');
  sel.innerHTML = '';
  LAB_CABLES().forEach(id => sel.append(h('option', { value: id, text: `${NetSim.CABLES[id].label} — ${NetSim.CABLES[id].th}` })));
}

/* ==========================================================================
   เลือก / ลากย้ายอุปกรณ์ (Raycasting)
   ========================================================================== */
function setMouse(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
}

function pickDevice() {
  const hits = raycaster.intersectObjects([...nodes.values()].map(n => n.group), true);
  if (!hits.length) return null;
  let obj = hits[0].object;
  while (obj && obj.userData.deviceId === undefined) obj = obj.parent;
  return obj ? obj.userData.deviceId : null;
}

/* ------------------- ล็อกตำแหน่ง / โหมดแก้ไขตำแหน่งอุปกรณ์ -------------------
   ค่าเริ่มต้น "ล็อก": ลากบนอุปกรณ์ = หมุนกล้องตามปกติ อุปกรณ์ไม่ขยับ (คลิกเพื่อเลือกได้)
   กดปุ่มแก้ไข (หรือคีย์ E) จึงลากย้ายได้ · Esc ระหว่างลาก = ยกเลิก · Ctrl+Z = ย้อนตำแหน่ง */
let editMode = false;
let dragStart = null;              // { id, x, z } ตำแหน่งก่อนลาก
let dragMoved = false;
const moveHistory = [];            // ประวัติการย้าย ใช้กับ Ctrl+Z
let lockHintShown = false;

function setEditMode(on) {
  editMode = on === undefined ? !editMode : !!on;
  if (!editMode && dragId !== null) cancelDrag();
  if (!editMode && window.CableEdit) CableEdit.deselect();
  document.body.classList.toggle('edit-on', editMode);
  const btn = $('btnEditMode');
  if (btn) {
    btn.classList.toggle('active', editMode);
    btn.setAttribute('aria-pressed', String(editMode));
    btn.title = editMode ? 'เสร็จสิ้นการจัดวาง — ล็อกตำแหน่งอุปกรณ์ (E)' : 'แก้ไขตำแหน่ง — ปลดล็อกเพื่อลากย้ายอุปกรณ์ (E)';
    btn.firstElementChild.className = 'fa-solid ' + (editMode ? 'fa-check' : 'fa-pen-to-square');
  }
  const hint = $('dragHint');
  if (hint) {
    hint.innerHTML = '';
    hint.append(icon(editMode ? 'fa-up-down-left-right' : 'fa-lock'), editMode ? ' กำลังแก้ไข: ลากอุปกรณ์เพื่อย้าย' : ' ตำแหน่งล็อกอยู่');
  }
  if (renderer) renderer.domElement.style.cursor = '';
}
function cancelDrag() {
  if (dragId === null) return;
  const node = nodes.get(dragId);
  if (node && dragStart) {
    node.group.position.x = dragStart.x;
    node.group.position.z = dragStart.z;
    syncDevicePos(dragId);
    rebuildCablesOf(dragId);
    placeRings();
  }
  dragId = null; dragStart = null; dragMoved = false;
  controls.enabled = true;
  showToast('ยกเลิกการย้าย — อุปกรณ์กลับที่เดิม');
}
function undoMove() {
  const m = moveHistory.pop();
  if (!m) return showToast('ไม่มีการย้ายให้ย้อนกลับ', 'warn');
  if (m.type === 'route') {
    const link = net.links.get(m.linkId);
    if (!link) return undoMove();
    link.route = m.route ? JSON.parse(JSON.stringify(m.route)) : undefined;
    removeCable(link.id); buildCable(link); refreshAll();
    if (window.CableEdit) CableEdit.refresh();
    persist();
    return showToast('ย้อนเส้นทางสายกลับแล้ว');
  }
  const node = nodes.get(m.id);
  if (!node) return undoMove();
  const from = { x: node.group.position.x, z: node.group.position.z };
  tween(UI.reduced ? 1 : 260, k => {
    const t = ease(k);
    node.group.position.x = from.x + (m.x - from.x) * t;
    node.group.position.z = from.z + (m.z - from.z) * t;
    rebuildCablesOf(m.id);
  }).then(() => { syncDevicePos(m.id); placeRings(); persist(); });
  showToast(`ย้อนตำแหน่ง ${devName(m.id)} กลับที่เดิม`);
}

function onPointerDown(event) {
  downPos = { x: event.clientX, y: event.clientY };
  closePortMenu();
  if (viewMode !== '3d') return;
  setMouse(event);
  if (editMode && !cableTool && window.CableEdit && CableEdit.down(event)) return;   // จับจุดบนสาย
  const id = pickDevice();
  if (id === null || cableTool) return;
  if (!editMode) return;            // ล็อกอยู่: ปล่อยให้หมุนกล้องได้ตามปกติ (เลือกอุปกรณ์ตอนคลิกปล่อย)
  selectDevice3D(id);
  const node = nodes.get(id);
  dragId = id;
  dragStart = { id, x: node.group.position.x, z: node.group.position.z };
  dragMoved = false;
  controls.enabled = false;
  renderer.domElement.style.cursor = 'grabbing';
}

function onPointerMove(event) {
  if (window.CableEdit && CableEdit.move(event)) return;
  if (dragId === null) {
    // โหมดแก้ไข: เปลี่ยนเคอร์เซอร์เป็นรูปมือเมื่อชี้อุปกรณ์
    if (editMode && viewMode === '3d' && !cableTool && event.target === renderer.domElement && !event.buttons) {
      setMouse(event);
      renderer.domElement.style.cursor = pickDevice() !== null ? 'grab' : '';
    }
    return;
  }
  // ขยับเมาส์เกิน 4px ก่อนถึงจะเริ่มย้าย กันคลิกแล้วอุปกรณ์กระตุก
  if (!dragMoved) {
    if (!downPos || Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y) < 4) return;
    dragMoved = true;
  }
  setMouse(event);
  if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) return;
  const { w, l } = roomSize();
  const node = nodes.get(dragId);
  if (!node) return;
  node.group.position.x = clamp(hitPoint.x, w / 2 - 0.8);
  node.group.position.z = clamp(hitPoint.z, l / 2 - 0.8);
  syncDevicePos(dragId);
  rebuildCablesOf(dragId);
  placeRings();
}

function onPointerUp(event) {
  if (window.CableEdit && CableEdit.up(event)) { downPos = null; return; }
  if (dragId !== null) {
    if (dragMoved && dragStart) {
      const node = nodes.get(dragId);
      if (node && Math.hypot(node.group.position.x - dragStart.x, node.group.position.z - dragStart.z) > 0.01) {
        moveHistory.push(dragStart);
        if (moveHistory.length > 30) moveHistory.shift();
      }
    }
    dragId = null; dragStart = null; dragMoved = false;
    renderer.domElement.style.cursor = editMode ? 'grab' : '';
    controls.enabled = true;
    const r = net.syncWireless();   // ย้ายเครื่องไร้สายอาจเปลี่ยน AP ที่ใกล้ที่สุด
    if (r.added || r.removed) { rebuildAllCables(); refreshAll(); }
  }
  if (!downPos || event.target !== renderer.domElement) { downPos = null; return; }
  const moved = Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y);
  downPos = null;
  if (moved >= 6) return;
  setMouse(event);
  if (viewMode === '360') {
    const id = pickDevice();
    if (id !== null) { selectDevice3D(id); showDeviceInfo(id); return; }
    const wp = raycaster.intersectObjects(waypointGroup.children, false)[0];
    if (wp) walkTo(wp.object.position.x, wp.object.position.z);
    return;
  }
  if (cableTool) {
    const id = pickDevice();
    if (id !== null) cableToolClick(id, event.clientX, event.clientY);
    return;
  }
  if (!editMode) {
    const id = pickDevice();
    if (id !== null) selectDevice3D(id);
  }
}

function placeRings() {
  const sel = nodes.get(selectedId);
  selRing.visible = !!sel;
  if (sel) { selRing.position.x = sel.group.position.x; selRing.position.z = sel.group.position.z; }
  const first = cableFirst && nodes.get(cableFirst.dev);
  pickRing.visible = !!first;
  if (first) { pickRing.position.x = first.group.position.x; pickRing.position.z = first.group.position.z; }
}

function selectDevice3D(id) {
  if (id !== null && window.CableEdit) CableEdit.deselect(true);
  selectedId = id;
  placeRings();
  renderProps();
  const cli = $('cliDeviceSelect');
  if (id !== null && [...cli.options].some(o => Number(o.value) === id)) { cli.value = String(id); updatePrompt(); }
}

/* ==========================================================================
   สายสัญญาณ 3D (สีตามชนิดสาย) + ไฟสถานะลิงก์
   ========================================================================== */
const CABLE_RADIUS = { straight: 0.026, cross: 0.026, fiber: 0.02, serialDCE: 0.03, serialDTE: 0.03, console: 0.02, octal: 0.028, phone: 0.018, coax: 0.032, usb: 0.018, iot: 0.014, wireless: 0.012 };

function portAnchor(devId, portIdx) {
  const node = nodes.get(devId);
  return node.anchor(portIdx).add(node.group.position);
}

let dceMat = null;
function buildCable(link) {
  if (!nodes.has(link.a.dev) || !nodes.has(link.b.dev)) return;
  const a = portAnchor(link.a.dev, link.a.port), b = portAnchor(link.b.dev, link.b.port);
  const wifi = link.cable === 'wireless';
  // สายที่จัดเส้นทางเอง: ผ่านทุกจุดที่กำหนด (ยึดพื้น/ผนัง/เพดาน/อุปกรณ์) เป็นเส้นตรงหักมุมนุ่มๆ
  const route = !wifi && link.route && link.route.length ? link.route.map(p => { const q = net.routePoint(p); return V(q.x, q.y, q.z); }) : null;
  let curve;
  if (route) curve = new THREE.CatmullRomCurve3([a, ...route, b], false, 'catmullrom', 0.1);
  else {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    mid.y = wifi ? Math.max(a.y, b.y) + 0.25 : Math.max(a.y, b.y) + 0.4 + a.distanceTo(b) * 0.1;
    curve = new THREE.CatmullRomCurve3([a, mid, b]);
  }
  const st = net.linkStatus(link);
  const color = st.up ? NetSim.CABLES[link.cable].color : 0xb4233f;
  const mat = new THREE.MeshBasicMaterial({ color });
  if (wifi) { mat.transparent = true; mat.opacity = 0.35; }
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, route ? Math.max(28, (route.length + 1) * 16) : 28, CABLE_RADIUS[link.cable] || 0.025, 6, false), mat);
  mesh.userData.linkId = link.id;
  scene.add(mesh);
  const extras = [];
  if (!wifi) {
    const ledColor = !link.data ? 0x67e8f9 : (st.up ? 0x00e676 : 0xff3d71);
    for (const p of [a, b]) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 10), new THREE.MeshBasicMaterial({ color: ledColor }));
      s.position.copy(p);
      scene.add(s);
      extras.push(s);
    }
    const dce = net.dceEnd(link);
    if (dce) {
      if (!dceMat) dceMat = makeTagMaterial('DCE ⏱', '#ff3d55');
      const tag = new THREE.Sprite(dceMat);
      tag.scale.set(0.5, 0.2, 1);
      tag.position.copy(dce === link.a ? a : b).add(V(0, 0.22, 0));
      tag.renderOrder = 11;
      scene.add(tag);
      extras.push(tag);
    }
  }
  cables.set(link.id, { mesh, curve, extras, wave: wifi, phase: link.id });
}

function makeTagMaterial(text, color) {
  const c = document.createElement('canvas');
  c.width = 200; c.height = 80;
  const ctx = c.getContext('2d');
  roundRectPath(ctx, 4, 4, 192, 72, 18);
  ctx.fillStyle = 'rgba(5,8,17,0.9)'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = color; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '700 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 100, 42);
  return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false });
}

function removeCable(linkId) {
  const c = cables.get(linkId);
  if (!c) return;
  scene.remove(c.mesh);
  c.mesh.geometry.dispose(); c.mesh.material.dispose();
  c.extras.forEach(e => { scene.remove(e); if (e.geometry) e.geometry.dispose(); if (e.isMesh) e.material.dispose(); });
  cables.delete(linkId);
}

function rebuildCablesOf(devId) {
  for (const link of net.links.values()) {
    // สายที่มีจุดยึดกับอุปกรณ์นี้ก็ต้องวาดใหม่ด้วย
    if (link.a.dev !== devId && link.b.dev !== devId && !(link.route && link.route.some(p => p.dev === devId))) continue;
    removeCable(link.id);
    buildCable(link);
  }
  if (window.CableEdit && CableEdit.active()) CableEdit.refresh();
}
function rebuildAllCables() {
  for (const id of [...cables.keys()]) removeCable(id);
  for (const link of net.links.values()) buildCable(link);
}

function refreshPortLeds() {
  for (const [id, node] of nodes) {
    const dev = devOf(id);
    if (!dev) continue;
    node.leds.forEach((l, i) => {
      if (!l) return;
      let color = 0x1f2937;
      if (dev.spec.form === 'ap') color = net.wifiClients(dev).length ? 0x00e676 : 0x1f2937;
      else {
        const port = dev.ports[i];
        const link = port && port.link ? net.links.get(port.link) : null;
        if (link) color = !link.data ? 0x67e8f9 : (link.up ? 0x00e676 : (net.linkStatus(link).stp ? 0xffb020 : 0xff3d71));
        else if (dev.spec.form !== 'rack' && dev.ports.some(p => p.link)) color = 0x00e676;
      }
      l.material.color.setHex(color);
    });
  }
  $('deviceCount').textContent = `${net.devices.size} อุปกรณ์ · ${[...net.links.values()].filter(l => l.cable !== 'wireless').length} สาย · ${[...net.links.values()].filter(l => l.cable === 'wireless').length} Wi-Fi`;
}

function refreshDeviceSelects() {
  const fill = (sel, list) => {
    const prev = sel.value;
    sel.innerHTML = '';
    list.forEach(d => sel.append(h('option', { value: d.id, text: `${d.name} (${d.spec.label})` })));
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
  };
  const all = [...net.devices.values()];
  const wired = all.filter(d => d.ports.some(p => !p.hidden && p.media !== 'wlan'));
  fill($('connFromSelect'), wired);
  fill($('connToSelect'), wired);
  if (wired.length > 1 && $('connFromSelect').value === $('connToSelect').value) $('connToSelect').selectedIndex = 1;
  fill($('cliDeviceSelect'), all.filter(d => d.kind !== 'hub' && d.kind !== 'passive'));
  refreshPortSelects();
  refreshPortLeds();
  updatePrompt();
}

function allowedMedia(cable) {
  if (cable === 'auto') return new Set(Object.keys(PARTNER));
  return new Set(NetSim.CABLES[cable].media.flat());
}

function refreshPortSelects() {
  const cable = $('connTypeSelect').value || 'auto';
  const ok = allowedMedia(cable);
  for (const [devSel, portSel] of [['connFromSelect', 'connFromPort'], ['connToSelect', 'connToPort']]) {
    const dev = devOf($(devSel).value);
    const sel = $(portSel);
    sel.innerHTML = '';
    sel.append(h('option', { value: '', text: 'อัตโนมัติ' }));
    if (!dev) continue;
    dev.ports.forEach((p, i) => { if (!p.link && !p.hidden && ok.has(p.media)) sel.append(h('option', { value: i, text: `${p.name} · ${NetSim.MEDIA[p.media]}` })); });
  }
  $('cableHint').textContent = NetSim.CABLES[cable] ? NetSim.CABLES[cable].desc : '';
}

function reportLink(res) {
  if (!res.ok) { logConsole(`[ERROR] ${res.error}`, 'err'); showToast(res.error, true); return null; }
  const st = net.linkStatus(res.link);
  const label = net.linkLabel(res.link);
  const cab = NetSim.CABLES[res.link.cable];
  if (st.up) logConsole(`[CABLE] เชื่อม ${cab.label}: ${label}${res.link.data ? ' — ไฟลิงก์เขียว' : ' — (สายตั้งค่า/อุปกรณ์ ไม่ส่งข้อมูลเครือข่าย)'}`, 'info');
  else { logConsole(`[CABLE] ${label}: ${st.reason} — ไฟลิงก์แดง`, 'err'); showToast(st.reason + ' — ไฟลิงก์แดง', true); }
  if (res.link.cable === 'serialDCE' || res.link.cable === 'serialDTE') {
    const d = net.dceEnd(res.link), dev = devOf(d.dev);
    logConsole(`[SERIAL] ฝั่ง DCE คือ ${dev.name} ${dev.ports[d.port].name} — ตั้ง Clock Rate ที่แท็บคุณสมบัติของ ${dev.name}`, 'warn');
  }
  return res.link;
}

function addLink(aId, aPort, bId, bPort, cable) {
  const res = net.connect(aId, aPort, bId, bPort, cable);
  if (res.ok) { buildCable(res.link); drawCableIn(cables.get(res.link.id), 0); refreshAll(); if (res.link.up) award({ xp: 10, reason: 'ต่อสายเส้นแรก', once: 'first-link', badges: ['first_link'] }); }
  return reportLink(res);
}

function connectDevices3D() {
  addLink($('connFromSelect').value, $('connFromPort').value, $('connToSelect').value, $('connToPort').value, $('connTypeSelect').value);
}

function deleteLink(linkId) {
  net.disconnect(linkId);
  removeCable(linkId);
  net.syncWireless();
  rebuildAllCables();
  refreshAll();
}

function renderConnectionListUI() {
  const list = $('connectionList');
  list.innerHTML = '';
  if (!net.links.size) { list.append(h('div', { class: 'empty-note small', text: 'ยังไม่มีสาย — เลือกสายจากแถบซ้าย (หมวด Connections) แล้วคลิกอุปกรณ์ 2 ตัว หรือใช้ฟอร์มด้านบน' })); return; }
  for (const link of net.links.values()) {
    const a = devOf(link.a.dev), b = devOf(link.b.dev);
    const st = net.linkStatus(link);
    const cab = NetSim.CABLES[link.cable];
    const wifi = link.cable === 'wireless';
    list.append(h('div', { class: 'conn-item' + (st.up ? '' : ' down') + (link.data ? '' : ' nodata') },
      h('span', { class: 'cable-dot', style: `background:${hex(cab.color)}` }),
      h('div', { class: 'txt' },
        wifi ? `${a.name} ⇢ ${b.name} (Wi-Fi)` : `${a.name} ${a.ports[link.a.port].name} ↔ ${b.name} ${b.ports[link.b.port].name}`,
        h('small', { text: cab.label + (wifi ? '' : ` · ${net.cableLength(link)} ม.`) + (st.up ? (link.data ? '' : ' — สายตั้งค่า ไม่ส่งข้อมูล') : ' — ' + st.reason) })),
      wifi || !window.CableEdit ? null : h('button', { class: 'mini-btn', title: 'จัดเส้นทางสาย (ดัด/ยึดกับพื้น ผนัง เพดาน อุปกรณ์)', onclick: () => CableEdit.select(link.id) }, icon('fa-bezier-curve')),
      wifi ? null : h('button', { class: 'mini-btn danger', title: 'ถอดสาย', onclick: () => deleteLink(link.id) }, icon('fa-xmark'))
    ));
  }
}

/* --------------------- เครื่องมือเดินสาย + เมนูเลือกพอร์ต --------------------- */
function startCableTool(type) {
  cableType = type;
  $('connTypeSelect').value = type;
  refreshPortSelects();
  toggleCableTool(true);
}

function toggleCableTool(force) {
  cableTool = force === undefined ? !cableTool : force;
  cableFirst = null;
  closePortMenu();
  $('btnCableTool').classList.toggle('active', cableTool);
  $('cableBanner').classList.toggle('show', cableTool);
  renderer.domElement.style.cursor = cableTool ? 'crosshair' : '';
  updateCableBanner();
  placeRings();
  if (currentCat === 'cables') renderCatalog();
}

function updateCableBanner() {
  const cab = NetSim.CABLES[cableType];
  const first = cableFirst && devOf(cableFirst.dev);
  $('cableBannerText').textContent = `${cab.label}: ` + (first
    ? `ต้นทาง ${first.name} ${cableFirst.port === '' ? '(พอร์ตอัตโนมัติ)' : first.ports[cableFirst.port].name} → คลิกอุปกรณ์ปลายทาง`
    : 'คลิกอุปกรณ์ต้นทาง');
}

function closePortMenu() { const m = $('portMenu'); if (m) { m.classList.remove('show'); m.innerHTML = ''; } }

function cableToolClick(id, cx, cy) {
  const dev = devOf(id);
  if (cableFirst && cableFirst.dev === id) { cableFirst = null; placeRings(); updateCableBanner(); return; }
  let ok = allowedMedia(cableType);
  if (cableFirst && cableFirst.port !== '') {
    const m1 = devOf(cableFirst.dev).ports[cableFirst.port].media;
    ok = new Set(cableType === 'auto' ? PARTNER[m1] : NetSim.CABLES[cableType].media.filter(p => p.includes(m1)).map(p => (p[0] === m1 ? p[1] : p[0])));
  }
  const ports = dev.ports.map((p, i) => ({ p, i })).filter(x => !x.p.hidden && ok.has(x.p.media));
  if (!ports.length || !ports.some(x => !x.p.link)) {
    return showToast(`${dev.name} ไม่มีพอร์ตว่างที่ใช้กับ${NetSim.CABLES[cableType].th}ได้`, true);
  }
  const menu = $('portMenu');
  const rect = document.querySelector('.viewport-container').getBoundingClientRect();
  menu.innerHTML = '';
  menu.append(h('div', { class: 'pm-head', text: `${dev.name} — เลือกพอร์ต` }));
  const choose = portIdx => {
    closePortMenu();
    if (!cableFirst) { cableFirst = { dev: id, port: portIdx }; placeRings(); updateCableBanner(); return; }
    const a = cableFirst;
    cableFirst = null;
    placeRings();
    addLink(a.dev, a.port, id, portIdx, cableType);
    updateCableBanner();
  };
  menu.append(h('button', { class: 'pm-item auto', onclick: () => choose('') }, icon('fa-wand-magic-sparkles'), ' อัตโนมัติ'));
  ports.forEach(({ p, i }) => menu.append(h('button', { class: 'pm-item', disabled: !!p.link, onclick: () => choose(i) },
    h('span', { class: 'pm-dot', style: `background:${portColor(p.media)}` }),
    h('b', { text: p.name }), h('small', { text: p.link ? 'ใช้แล้ว' : NetSim.MEDIA[p.media] }))));
  menu.style.left = Math.min(cx - rect.left + 8, rect.width - 230) + 'px';
  menu.style.top = Math.min(cy - rect.top + 8, rect.height - 300) + 'px';
  menu.classList.add('show');
}

/* ==========================================================================
   แผงคุณสมบัติ (ตามชนิดอุปกรณ์)
   ========================================================================== */
function refreshAll() {
  redrawAllLabels();
  refreshDeviceSelects();
  renderConnectionListUI();
}

function afterConfigChange(dev, opts) {
  const before = new Set(net.links.keys());
  const r = net.syncWireless();
  if (r.added || r.removed || (opts && opts.cables)) rebuildAllCables();
  if (r.added) for (const id of net.links.keys()) if (!before.has(id) && cables.get(id)) drawCableIn(cables.get(id), 0);
  if (r.added) logConsole(`[Wi-Fi] มีอุปกรณ์เชื่อมต่อ Wi-Fi ใหม่ ${r.added} เครื่อง`, 'ok');
  if (r.removed) logConsole(`[Wi-Fi] มีอุปกรณ์หลุดจาก Wi-Fi ${r.removed} เครื่อง (SSID/รหัสผ่านไม่ตรง)`, 'warn');
  refreshAll();
  if (opts && opts.rerender) renderProps();
  void dev;
}

function field(label, value, onChange, opts) {
  const o = opts || {};
  const input = h('input', { type: o.type || 'text', value: value === undefined ? '' : value, placeholder: o.placeholder, readonly: o.readonly, spellcheck: 'false' });
  const check = () => { if (o.valid) input.classList.toggle('invalid', input.value.trim() !== '' && !o.valid(input.value.trim())); };
  check();
  if (onChange) input.addEventListener('change', () => { check(); onChange(input.value.trim()); });
  return h('div', { class: 'form-group' }, h('label', { text: label }), input);
}
function checkbox(label, checked, onChange) {
  const input = h('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'check-row' }, input, label);
}
function selectBox(label, options, value, onChange) {
  const sel = h('select', {}, options.map(([v, t]) => h('option', { value: v, text: t })));
  sel.value = String(value);
  sel.addEventListener('change', () => onChange(sel.value));
  return h('div', { class: 'form-group' }, h('label', { text: label }), sel);
}
function section(title, iconName, ...kids) {
  return h('div', { class: 'prop-section' }, h('div', { class: 'sec-title' }, icon(iconName), title), ...kids);
}
function areaField(label, value, placeholder, onChange) {
  const area = h('textarea', { rows: 3, placeholder, spellcheck: 'false', value });
  area.addEventListener('change', () => onChange(area.value));
  return h('div', { class: 'form-group' }, h('label', { text: label }), area);
}

function ipFields(dev, f, opts) {
  const { isIp, isMask } = NetSim;
  const o = opts || {};
  const kids = [];
  if (o.dhcp) kids.push(checkbox('รับ IP อัตโนมัติจาก DHCP', f.dhcp, v => { f.dhcp = v; afterConfigChange(dev, { rerender: true }); }));
  kids.push(field('IP Address', f.ip, v => { f.ip = v; if (v && !f.mask) { f.mask = '255.255.255.0'; renderProps(); } afterConfigChange(dev); }, { valid: isIp, placeholder: o.ipHint || '192.168.1.10', readonly: f.dhcp }));
  kids.push(field('Subnet Mask', f.mask, v => { f.mask = v; afterConfigChange(dev); }, { valid: isMask, placeholder: '255.255.255.0', readonly: f.dhcp }));
  return kids;
}

function wifiFields(dev, target, label) {
  return [
    field(label || 'SSID (ชื่อ Wi-Fi)', target.ssid, v => { target.ssid = v; afterConfigChange(dev, { rerender: true }); }, { placeholder: 'เช่น HomeWiFi' }),
    field('รหัสผ่าน WPA2 (เว้นว่าง = ไม่มีรหัส)', target.key, v => { target.key = v; afterConfigChange(dev, { rerender: true }); }, { placeholder: 'อย่างน้อย 8 ตัวอักษร' })
  ];
}

function dhcpSection(dev, sv) {
  const { isIp, isMask } = NetSim;
  return section('บริการ DHCP (แจก IP อัตโนมัติ)', 'fa-wand-magic-sparkles',
    checkbox('เปิดบริการ DHCP', sv.enabled, v => { sv.enabled = v; }),
    field('IP เริ่มต้นที่แจก', sv.start, v => { sv.start = v; }, { valid: isIp, placeholder: '192.168.1.100' }),
    field('จำนวนเครื่องสูงสุด', sv.count, v => { sv.count = Math.max(1, parseInt(v, 10) || 1); }, { type: 'number' }),
    field('Subnet Mask ที่แจก', sv.mask, v => { sv.mask = v; }, { valid: isMask }),
    field('Default Gateway ที่แจก', sv.gw, v => { sv.gw = v; }, { valid: isIp }),
    field('DNS Server ที่แจก', sv.dns, v => { sv.dns = v; }, { valid: isIp }),
    h('p', { class: 'hint', text: 'DHCP Server ต้องมี IP อยู่วงเดียวกับช่วง IP ที่แจก' }));
}

function portTable(dev) {
  const t = h('div', { class: 'kv-table ports' });
  dev.ports.forEach(p => {
    if (p.hidden) return;
    let to = '—';
    if (p.link) {
      const l = net.links.get(p.link);
      const o = l.a.dev === dev.id && dev.ports[l.a.port] === p ? l.b : l.a;
      const od = devOf(o.dev);
      to = `${od.name} ${od.ports[o.port].name}`;
    }
    t.append(h('div', {}, h('span', {}, h('i', { class: 'pm-dot', style: `background:${portColor(p.media)}` }), p.name), h('span', { text: to })));
  });
  return t;
}

function renderProps() {
  if (selectedId === null && window.CableEdit && CableEdit.active()) return CableEdit.renderPanel();
  const body = $('propBody');
  const dev = devOf(selectedId);
  body.innerHTML = '';
  $('noSelectNotice').style.display = dev ? 'none' : 'block';
  if (!dev) return;
  const spec = dev.spec;
  const { isIp, isMask } = NetSim;
  const firstMac = dev.ifaces[0] ? dev.ifaces[0].mac : (dev.ports[0] ? dev.ports[0].mac : '');

  body.append(h('div', { class: 'prop-head' }, icon(spec.icon),
    h('div', {}, h('strong', { text: spec.label }), h('small', { text: `${catOf(spec.cat).label} · ${firstMac ? 'MAC ' + firstMac : 'ไม่มีพอร์ตเครือข่าย'}` }))));
  body.append(h('p', { class: 'hint', text: spec.desc }));
  if (window.LifePlus) LifePlus.propsExtra(dev, body);   // สัญญาณ Wi-Fi / Port Forwarding / Wi-Fi แขก
  body.append(field('ชื่ออุปกรณ์ (Display Name)', dev.name, v => { dev.name = v || dev.name; afterConfigChange(dev); }));

  // โมดูลเสริม
  if (spec.modules && spec.modules.length) {
    body.append(section('โมดูลเสริม (Physical)', 'fa-puzzle-piece',
      ...spec.modules.map(m => checkbox(m.label, dev.modules.includes(m.name), on => {
        const r = net.setModule(dev.id, m.name, on);
        if (!r.ok) { showToast(r.error, true); renderProps(); return; }
        removeNode(dev.id); createNode(dev); placeRings();
        logConsole(`[MODULE] ${on ? 'ติดตั้ง' : 'ถอด'} ${m.name} ที่ ${dev.name} — พอร์ต: ${dev.ports.map(p => p.name).join(', ')}`, 'info');
        afterConfigChange(dev, { cables: true, rerender: true });
      })),
      h('p', { class: 'hint', text: 'เหมือนแท็บ Physical ใน Packet Tracer: ใส่การ์ดเพื่อเพิ่มพอร์ต Serial / Fiber / Async' })));
  }

  // Console
  const target = net.consoleTarget(dev.id);
  if (target) {
    body.append(h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openTerminal(dev.id) }, icon('fa-terminal'), ` Terminal → ${target.name} (ผ่านสาย Console)`));
  }

  if (dev.kind === 'host') {
    dev.ifaces.forEach(f => {
      const wlan = dev.ports[f.ports[0]] && dev.ports[f.ports[0]].media === 'wlan';
      const kids = ipFields(dev, f, { dhcp: true });
      if (wlan) kids.unshift(...wifiFields(dev, f));
      const up = net.ifaceUp(dev, dev.ifaces.indexOf(f));
      body.append(section(`${f.name}${wlan ? ' (Wi-Fi)' : ''} — ${up ? 'เชื่อมต่อแล้ว' : 'ยังไม่เชื่อมต่อ'}`, wlan ? 'fa-wifi' : 'fa-ethernet', ...kids));
    });
    body.append(section('Gateway / DNS', 'fa-signs-post',
      field('Default Gateway', dev.gw, v => { dev.gw = v; }, { valid: isIp, placeholder: 'IP ของ Router ในวงเดียวกัน' }),
      field('DNS Server', dev.dns, v => { dev.dns = v; }, { valid: isIp, placeholder: 'IP ของเครื่องที่เปิดบริการ DNS' }),
      h('button', { type: 'button', class: 'btn', onclick: () => runCli(dev.id, 'ipconfig /renew') }, icon('fa-arrows-rotate'), ' ขอ IP จาก DHCP ตอนนี้')));
    if (dev.services && dev.services.http) {
      const sv = dev.services;
      body.append(section('บริการ HTTP (Web Server)', 'fa-globe',
        checkbox('เปิดบริการ HTTP พอร์ต 80', sv.http.enabled, v => { sv.http.enabled = v; }),
        field('ชื่อเว็บไซต์', sv.http.title, v => { sv.http.title = v; }),
        field('ข้อความบนหน้าเว็บ', sv.http.body, v => { sv.http.body = v; })));
      body.append(section('บริการ DNS', 'fa-address-book',
        checkbox('เปิดบริการ DNS พอร์ต 53', sv.dns.enabled, v => { sv.dns.enabled = v; }),
        areaField('รายการชื่อ (บรรทัดละ: ชื่อ เว้นวรรค IP)', sv.dns.records.map(r => `${r.name} ${r.ip}`).join('\n'), 'www.school.local 192.168.1.100', v => {
          sv.dns.records = v.split('\n').map(l => l.trim().split(/\s+/)).filter(a => a.length >= 2 && isIp(a[1])).map(a => ({ name: a[0].toLowerCase(), ip: a[1] }));
        })));
      body.append(dhcpSection(dev, sv.dhcp));
    }
  }

  if (dev.kind === 'router') {
    dev.ifaces.forEach(f => {
      const p = dev.ports[f.ports[0]];
      const kids = ipFields(dev, f, { ipHint: 'IP ของพอร์ตนี้ (= Gateway ของวงนี้)' });
      if (p.media === 'serial') {
        const l = p.link ? net.links.get(p.link) : null;
        if (!l) kids.push(h('p', { class: 'hint', text: 'ยังไม่ได้เสียบสาย Serial' }));
        else {
          const d = net.dceEnd(l);
          const isDce = d.dev === dev.id && dev.ports[d.port] === p;
          if (isDce) kids.push(selectBox('Clock Rate (ฝั่ง DCE ต้องตั้ง)', CLOCK_RATES.map(r => [r, r ? r.toLocaleString() : 'ยังไม่ได้ตั้ง (ลิงก์ดาวน์)']), p.clock || 0, v => { p.clock = Number(v); afterConfigChange(dev, { cables: true, rerender: true }); }));
          else kids.push(h('p', { class: 'hint', text: 'พอร์ตนี้เป็นฝั่ง DTE — รับสัญญาณนาฬิกา (Clock) จากฝั่ง DCE' }));
        }
      }
      const up = net.ifaceUp(dev, dev.ifaces.indexOf(f));
      body.append(section(`${f.name} · ${NetSim.MEDIA[p.media]} — ${up ? 'up' : 'down'}`, p.media === 'serial' ? 'fa-clock' : (p.media === 'fiber' ? 'fa-wave-square' : 'fa-ethernet'), ...kids));
    });
    body.append(section('Static Route', 'fa-signs-post',
      areaField('บรรทัดละ: network mask next-hop', dev.routes.map(r => `${r.net} ${r.mask} ${r.via}`).join('\n'), '192.168.2.0 255.255.255.0 10.0.0.2', v => {
        dev.routes = v.split('\n').map(l => l.trim().split(/\s+/)).filter(a => a.length >= 3 && isIp(a[0]) && isMask(a[1]) && isIp(a[2])).map(a => ({ net: a[0], mask: a[1], via: a[2] }));
      }),
      field('Default Route (Gateway of last resort)', dev.gw, v => { dev.gw = v; }, { valid: isIp, placeholder: 'เช่น IP ของ Router ISP' })));
    body.append(section('NAT (แชร์อินเทอร์เน็ต)', 'fa-shuffle',
      checkbox('เปิด NAT Overload (PAT)', dev.nat.enabled, v => { dev.nat.enabled = v; if (v && !dev.nat.outside && dev.ifaces[0]) dev.nat.outside = dev.ifaces[0].name; renderProps(); }),
      dev.nat.enabled ? selectBox('อินเทอร์เฟซ outside (ฝั่งอินเทอร์เน็ต)', dev.ifaces.map(f => [f.name, f.name]), dev.nat.outside, v => { dev.nat.outside = v; }) : null));
    body.append(dhcpSection(dev, dev.services.dhcp));
  }

  if (dev.kind === 'gateway') {
    const [out, inside] = dev.ifaces;
    body.append(section(`${out.name} (ฝั่ง ISP / ภายนอก)`, 'fa-globe', ...ipFields(dev, out, { dhcp: true, ipHint: 'IP จาก ISP' }),
      field('Default Gateway', dev.gw, v => { dev.gw = v; }, { valid: isIp, readonly: out.dhcp }),
      field('DNS Server', dev.dns, v => { dev.dns = v; }, { valid: isIp, readonly: out.dhcp }),
      h('button', { type: 'button', class: 'btn', onclick: () => runCli(dev.id, 'ipconfig /renew') }, icon('fa-arrows-rotate'), ' ขอ IP จาก ISP ตอนนี้')));
    body.append(section(`${inside.name} (ฝั่งภายใน)`, 'fa-house', ...ipFields(dev, inside, {})));
    if (dev.wifi) body.append(section('Wi-Fi', 'fa-wifi', ...wifiFields(dev, dev.wifi), h('p', { class: 'hint', text: `เชื่อมต่ออยู่ ${net.wifiClients(dev).length} เครื่อง` })));
    body.append(dhcpSection(dev, dev.services.dhcp));
    body.append(h('p', { class: 'hint', text: spec.firewall ? 'NAT และไฟร์วอลล์เปิดอยู่เสมอ: เครื่องภายนอกเริ่มเชื่อมต่อเข้ามาไม่ได้' : 'NAT เปิดอยู่เสมอ: ทุกเครื่องในบ้านใช้ IP สาธารณะเดียวกันออกอินเทอร์เน็ต' }));
  }

  if (dev.kind === 'switch') {
    if (!spec.noMgmt) {
      body.append(section('Vlan1 — IP สำหรับจัดการสวิตช์ (ไม่บังคับ)', 'fa-sliders', ...ipFields(dev, dev.ifaces[0], {}),
        field('ip default-gateway', dev.gw, v => { dev.gw = v; }, { valid: isIp })));
    }
    const table = h('div', { class: 'kv-table' });
    if (!dev.macTable.size) table.append(h('div', {}, h('span', { text: '(ว่าง — จะเรียนรู้เมื่อมีเฟรมวิ่งผ่าน)' })));
    for (const [mac, port] of dev.macTable) table.append(h('div', {}, h('span', { text: mac }), h('span', { text: dev.ports[port].name })));
    body.append(section('MAC Address Table', 'fa-table-list', table,
      h('button', { type: 'button', class: 'btn', onclick: () => { dev.macTable.clear(); renderProps(); } }, icon('fa-eraser'), ' ล้าง MAC Table')));
  }

  if (dev.kind === 'ap') {
    const clients = net.wifiClients(dev);
    body.append(section('Wi-Fi', 'fa-wifi', ...wifiFields(dev, dev.wifi),
      h('div', { class: 'kv-table' }, clients.length ? clients.map(c => h('div', {}, h('span', { text: c.dev.name }), h('span', { text: c.iface.ip || 'ยังไม่มี IP' }))) : h('div', {}, h('span', { text: '(ยังไม่มีเครื่องเชื่อมต่อ)' })))));
    body.append(h('p', { class: 'hint', text: 'Access Point ทำงานที่ Layer 2: ส่งต่อเฟรมระหว่าง Wi-Fi กับสาย LAN เครื่องไร้สายต้องได้ IP จาก DHCP หรือตั้งเอง' }));
  }

  if (dev.kind === 'hub') body.append(h('p', { class: 'hint', text: 'อุปกรณ์ Layer 1 ไม่มี IP และไม่มีการตั้งค่า — เพียงต่อสายเข้าแต่ละพอร์ต' }));

  if (L3_KINDS.has(dev.kind) && dev.kind !== 'switch') {
    const arp = h('div', { class: 'kv-table' });
    if (!dev.arp.size) arp.append(h('div', {}, h('span', { text: '(ว่าง)' })));
    for (const [ip, e] of dev.arp) arp.append(h('div', {}, h('span', { text: ip }), h('span', { text: e.mac })));
    body.append(section('ARP Table (IP → MAC)', 'fa-table-list', arp));
  }
  if (dev.nat && dev.nat.enabled && dev.natTable.size) {
    const t = h('div', { class: 'kv-table' });
    for (const m of dev.natTable.values()) t.append(h('div', {}, h('span', { text: `${m.proto} ${m.ip}:${m.port}` }), h('span', { text: `${m.outIp}:${m.pub}` })));
    body.append(section('NAT Table (ภายใน → ภายนอก)', 'fa-shuffle', t));
  }
  if (dev.ports.some(p => !p.hidden)) body.append(section('พอร์ตทั้งหมด', 'fa-plug', portTable(dev)));
  body.append(h('button', { type: 'button', class: 'btn btn-danger', onclick: deleteSelectedDevice3D }, icon('fa-trash'), ' ลบอุปกรณ์นี้'));
}
const L3_KINDS = new Set(['host', 'router', 'gateway', 'switch']);

function deleteSelectedDevice3D() {
  const dev = devOf(selectedId);
  if (!dev) return;
  dev.ports.forEach(p => { if (p.link) removeCable(p.link); });
  net.removeDevice(dev.id);
  removeNodeAnimated(dev.id);
  if (cableFirst && cableFirst.dev === dev.id) cableFirst = null;
  net.syncWireless();
  rebuildAllCables();
  selectDevice3D(null);
  refreshAll();
  logConsole(`[DELETED] ลบ ${dev.name} ออกจากห้องแล้ว`, 'err');
}

let clearArmed = 0;
function clearAllDevices() {
  if (Date.now() - clearArmed > 3500) {
    clearArmed = Date.now();
    return showToast('กดปุ่มถังขยะอีกครั้งภายใน 3 วินาที เพื่อยืนยันล้างอุปกรณ์ทั้งหมด', true);
  }
  clearArmed = 0;
  for (const id of [...cables.keys()]) removeCable(id);
  for (const id of [...nodes.keys()]) removeNode(id);
  net = new NetSim.Network();
  selectDevice3D(null);
  refreshAll();
  logConsole('[CLEAR] ล้างอุปกรณ์และสายทั้งหมดในห้องแล้ว', 'info');
}

/* ==========================================================================
   เล่นการจำลองเป็นแอนิเมชัน 3D
   ========================================================================== */
const pktCache = {};
function packetAssets(proto) {
  if (pktCache[proto]) return pktCache[proto];
  const color = PROTO_COLORS[proto] || PROTO_COLORS.UDP;
  const c = document.createElement('canvas');
  c.width = 160; c.height = 64;
  const ctx = c.getContext('2d');
  roundRectPath(ctx, 3, 3, 154, 58, 14);
  ctx.fillStyle = 'rgba(5,8,17,0.9)'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = hex(color); ctx.stroke();
  ctx.fillStyle = '#ffffff'; ctx.font = '700 32px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(proto, 80, 34);
  pktCache[proto] = {
    body: new THREE.MeshBasicMaterial({ color }),
    edge: new THREE.LineBasicMaterial({ color: 0xffffff }),
    label: new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false })
  };
  return pktCache[proto];
}

function makePacket(proto) {
  const a = packetAssets(proto);
  const g = new THREE.Group();
  const body = new THREE.Mesh(PKT_GEO, a.body);
  body.add(new THREE.LineSegments(PKT_EDGE, a.edge));
  g.add(body);
  const label = new THREE.Sprite(a.label);
  label.scale.set(0.7, 0.28, 1);
  label.position.y = 0.34;
  label.renderOrder = 12;
  g.add(label);
  g.userData.body = body;
  return g;
}

function flyPacket(ev, dur) {
  const link = net.links.get(ev.link);
  if (!cables.has(ev.link) || !link) return Promise.resolve();
  const forward = link.a.dev === ev.from;
  const pkt = makePacket(ev.proto);
  scene.add(pkt);
  return tween(dur, k => {
    const cable = cables.get(ev.link);
    if (!cable) return;
    const t = ease(k);
    pkt.position.copy(cable.curve.getPoint(forward ? t : 1 - t));
    pkt.userData.body.rotation.y += 0.09;
    pkt.scale.setScalar(1 + 0.18 * Math.sin(k * Math.PI));
  }).then(() => scene.remove(pkt));
}

function pulseDevice(id, color) {
  const node = nodes.get(id);
  if (!node) return;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(node.group.position.x, 0.05, node.group.position.z);
  scene.add(ring);
  tween(600 / speed, k => { const s = 1 + k * 1.3; ring.scale.set(s, s, 1); ring.material.opacity = 0.9 * (1 - k); })
    .then(() => { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); });
}

let dropTex = null;
function dropMark(id) {
  const node = nodes.get(id);
  if (!node) return;
  if (!dropTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = '#ff3d71'; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(22, 22); ctx.lineTo(74, 74); ctx.moveTo(74, 22); ctx.lineTo(22, 74); ctx.stroke();
    dropTex = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.SpriteMaterial({ map: dropTex, transparent: true, depthTest: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.45, 0.45, 1);
  s.renderOrder = 13;
  const base = node.group.position;
  scene.add(s);
  tween(750 / speed, k => { s.position.set(base.x, node.height + 0.1 + k * 0.5, base.z); mat.opacity = 1 - k * k; })
    .then(() => { scene.remove(s); mat.dispose(); });
}

const devName = id => (devOf(id) ? devOf(id).name : '?');

function setCaption(who, text, isDrop) {
  const cap = $('simCaption');
  cap.className = 'sim-caption' + (isDrop ? ' drop' : '');
  cap.innerHTML = '';
  if (who) cap.append(h('b', { text: who + ': ' }));
  cap.append(text);
}
function setStatus(text) { $('simStatus').textContent = text; $('statusText').textContent = pumping ? 'กำลังจำลองเครือข่าย…' : '3D Active'; }

async function playEvents(events) {
  const txs = events.filter(e => e.kind === 'tx');
  const rest = events.filter(e => e.kind !== 'tx');
  if (txs.length) {
    setStatus(`tick ${txs[0].tick} · ${txs.length} เฟรม`);
    txs.forEach(addEventRow);
    const first = txs[0];
    const via = NetSim.CABLES[first.cable] ? ` ผ่าน${NetSim.CABLES[first.cable].th}` : '';
    setCaption(`${devName(first.from)} → ${devName(first.to)}`, first.summary + via + (txs.length > 1 ? `  (และอีก ${txs.length - 1} เฟรมพร้อมกัน)` : ''));
    await Promise.all(txs.map(e => flyPacket(e, (simMode === 'sim' ? 1000 : 430) / speed)));
  }
  let cap = null;
  for (const e of rest) {
    if (e.kind === 'storm') {
      logConsole('[STORM] ' + e.text, 'err');
      showToast(e.text, true);
      addEventNote('ระบบ', e.text, true);
      continue;
    }
    addEventNote(devName(e.dev), e.text, e.kind === 'drop');
    if (e.kind === 'drop') dropMark(e.dev);
    else pulseDevice(e.dev, e.accept ? 0x00e676 : 0x00f0ff);
    const rank = e.accept ? 3 : (e.kind === 'info' ? 2 : 1);
    if (!cap || rank > cap.rank) cap = { rank, e };
  }
  if (cap) setCaption(devName(cap.e.dev), cap.e.text, cap.e.kind === 'drop');
  if (rest.length) await sleep((simMode === 'sim' ? 700 : 170) / speed);
}

function pump() {
  if (pumping) return pumpPromise;
  pumping = true;
  updateSimButtons();
  pumpPromise = (async () => {
    try {
      while (net.busy()) {
        if (simMode === 'sim' && !playing && net.wire.length > 0) {
          setStatus('หยุดรอ — กด Step');
          await new Promise(r => { stepWaiter = r; });
          stepWaiter = null;
        }
        await playEvents(net.step());
      }
    } finally {
      pumping = false;
      playing = false;
      updateSimButtons();
      setStatus('พร้อม');
      refreshAll();
      if (!$('propBody').contains(document.activeElement)) renderProps();
    }
  })();
  return pumpPromise;
}

function updateSimButtons() {
  $('simModeRealtime').classList.toggle('active', simMode === 'realtime');
  $('simModeSim').classList.toggle('active', simMode === 'sim');
  const canStep = simMode === 'sim' && pumping;
  $('btnPlay').disabled = !canStep;
  $('btnStep').disabled = !canStep || playing;
  $('btnPlay').firstElementChild.className = 'fa-solid ' + (playing ? 'fa-pause' : 'fa-play');
}
function setSimMode(mode) {
  simMode = mode;
  playing = false;
  if (mode === 'realtime' && stepWaiter) stepWaiter();
  updateSimButtons();
  showToast(mode === 'sim' ? 'Simulation Mode: แพ็กเก็ตจะหยุดรอทุกช่วง กด Step เพื่อเดินทีละขั้น' : 'Realtime Mode: แพ็กเก็ตวิ่งต่อเนื่อง');
}
function togglePlay() { playing = !playing; if (playing && stepWaiter) stepWaiter(); updateSimButtons(); }
function stepOnce() { if (stepWaiter) stepWaiter(); }
function setSpeed(v) { speed = Number(v) || 1; }

/* ----------------------------- Event List ----------------------------- */
function eventListBox() {
  const box = $('eventList');
  const empty = box.querySelector('.empty-note');
  if (empty) empty.remove();
  while (box.children.length > 400) box.firstElementChild.remove();
  return box;
}
function addEventSep(text) {
  const box = eventListBox();
  box.append(h('div', { class: 'ev-sep', text: '▶ ' + text }));
  box.scrollTop = box.scrollHeight;
}
function addEventRow(ev) {
  const box = eventListBox();
  const row = h('div', { class: 'ev-row', title: 'คลิกเพื่อดูรายละเอียด PDU' },
    h('span', { class: 't', text: ev.tick }),
    h('span', { class: 'ev-badge', style: `background:${hex(PROTO_COLORS[ev.proto] || PROTO_COLORS.UDP)}`, text: ev.proto }),
    h('span', { class: 'd', text: `${devName(ev.from)} → ${devName(ev.to)} · ${ev.summary}` }));
  const from = devName(ev.from), to = devName(ev.to);
  row.addEventListener('click', () => {
    box.querySelectorAll('.ev-row.active').forEach(r => r.classList.remove('active'));
    row.classList.add('active');
    showPdu(ev, from, to);
  });
  box.append(row);
  box.scrollTop = box.scrollHeight;
}
function addEventNote(who, text, isDrop) {
  const box = eventListBox();
  box.append(h('div', { class: 'ev-note' + (isDrop ? ' drop' : '') }, h('b', { text: (isDrop ? '✕ ' : '') + who + ': ' }), text));
  box.scrollTop = box.scrollHeight;
}
function showPdu(ev, from, to) {
  const box = $('pduDetail');
  box.innerHTML = '';
  box.append(h('div', { class: 'pdu-title', text: `${ev.summary}  (${from} → ${to})` }));
  if (NetSim.CABLES[ev.cable]) box.append(h('div', { class: 'pdu-layer' }, h('small', { text: 'Layer 1 · Physical' }), h('span', { text: NetSim.CABLES[ev.cable].label })));
  [...ev.layers].reverse().forEach(l => box.append(h('div', { class: 'pdu-layer' }, h('small', { text: l.layer }), h('span', { text: l.text }))));
}
function clearEventList() {
  $('eventList').innerHTML = '';
  $('eventList').append(h('div', { class: 'empty-note small', text: 'ยังไม่มีเหตุการณ์ — ลองกด “รันระบบ”' }));
  $('pduDetail').innerHTML = '';
  $('pduDetail').append(h('div', { class: 'empty-note small', text: 'คลิกแถวใน Event List เพื่อดูข้อมูลในแต่ละชั้น' }));
}
function resetTables() {
  net.clearTables();
  renderProps();
  logConsole('[RESET] ล้าง ARP / MAC / NAT Table ของทุกอุปกรณ์แล้ว (เริ่มเรียนรู้ใหม่)', 'info');
  showToast('ล้าง ARP / MAC Table แล้ว — รันอีกครั้งจะเห็น ARP Request ใหม่');
}

function renderLegend() {
  const box = $('legend');
  box.innerHTML = '';
  for (const [proto, text] of Object.entries(PROTO_INFO)) {
    box.append(h('div', { class: 'legend-item' }, h('span', { class: 'legend-box', style: `background:${hex(PROTO_COLORS[proto])}` }), text));
  }
}

/* ==========================================================================
   Console / CLI
   ========================================================================== */
function logConsole(msg, type) {
  const box = $('termOutput');
  box.append(h('div', { class: `term-line ${type || ''}`, text: msg }));
  while (box.children.length > 600) box.firstElementChild.remove();
  box.scrollTop = box.scrollHeight;
}

function updatePrompt() {
  const dev = devOf($('cliDeviceSelect').value);
  $('cmdPrompt').textContent = dev ? net.prompt(dev) : '>';
}

const cmdHistory = [];
let cmdHistoryPos = 0;
function handleCmdKey(event) {
  if (event.key === 'Enter') return executeCommand();
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
  event.preventDefault();
  cmdHistoryPos = Math.max(0, Math.min(cmdHistory.length, cmdHistoryPos + (event.key === 'ArrowUp' ? -1 : 1)));
  $('cmdInput').value = cmdHistory[cmdHistoryPos] || '';
}

function openTerminal(fromId) {
  const target = net.consoleTarget(fromId);
  const from = devOf(fromId);
  if (!target) return logConsole(`${from.name}: ไม่มีสาย Console/Octal ต่ออยู่ — เดินสาย Console จากพอร์ต RS232 ไปยังพอร์ต Console ก่อน`, 'err');
  switchTab('console');
  setFlag(`terminal:${target.id}`);
  $('cliDeviceSelect').value = String(target.id);
  updatePrompt();
  logConsole(`[TERMINAL] ${from.name} เชื่อมต่อผ่านสาย Console (9600 bps) → เข้าสู่ CLI ของ ${target.name}`, 'ok');
  logConsole(`Press RETURN to get started! — พิมพ์ help เพื่อดูคำสั่งของ ${target.spec.label}`, 'info');
  $('cmdInput').focus();
}

function runCli(devId, cmd) {
  const dev = devOf(devId);
  if (!dev) return logConsole('ยังไม่มีอุปกรณ์ให้พิมพ์คำสั่ง — เพิ่มอุปกรณ์ก่อน', 'err');
  switchTab('console');
  logConsole(`${net.prompt(dev)} ${cmd}`, 'cmd');
  if (cmd.trim().toLowerCase() === 'terminal') return openTerminal(dev.id);
  const waits = net.exec(dev.id, cmd, (text, cls) => logConsole(text, cls || ''));
  if (waits) { addEventSep(`${dev.name}: ${cmd}`); pump(); }
  else { refreshAll(); if (selectedId === dev.id) renderProps(); }
}

function executeCommand() {
  const input = $('cmdInput');
  const cmd = input.value.trim();
  if (!cmd) return;
  cmdHistory.push(cmd);
  cmdHistoryPos = cmdHistory.length;
  input.value = '';
  if (cmd.toLowerCase() === 'cls' || cmd.toLowerCase() === 'clear') { $('termOutput').innerHTML = ''; return; }
  runCli($('cliDeviceSelect').value, cmd);
}

/* ==========================================================================
   รันระบบ: DHCP → ตรวจการตั้งค่า → ทดสอบ ping จริง (เห็นแพ็กเก็ตวิ่งใน 3D)
   ========================================================================== */
const USER_FORMS = new Set(['pc', 'laptop', 'tablet', 'smartphone', 'enddev']);

async function runNetworkDiagnostics() {
  if (pumping) return showToast('กำลังจำลองอยู่ รอให้จบก่อนแล้วค่อยรันใหม่', true);
  switchTab('console');
  logConsole('=== เริ่มตรวจสอบระบบเครือข่าย (DIAGNOSTICS) ===', 'info');
  if (net.devices.size === 0) return logConsole('ERROR: ไม่พบอุปกรณ์ในห้องปฏิบัติการ!', 'err');
  addEventSep('รันระบบ');
  net.syncWireless();
  const outOf = d => (text, cls) => logConsole(`[${d.name}] ${text}`, cls || '');

  // ขั้นที่ 1 — ขอ IP จาก DHCP (เราเตอร์บ้าน/ไฟร์วอลล์ขอจาก ISP ก่อน แล้วค่อยเครื่องในบ้าน)
  const order = [...net.devices.values()].sort((a, b) => (b.kind === 'gateway') - (a.kind === 'gateway'));
  let dhcpCount = 0;
  order.forEach(d => d.ifaces.forEach((f, fi) => {
    if (f.dhcp && !NetSim.isIp(f.ip) && net.ifaceUp(d, fi)) { net.dhcp(d.id, outOf(d), null, fi); dhcpCount++; }
  }));
  if (dhcpCount) {
    logConsole(`[1/3] ขอ IP จาก DHCP ให้ ${dhcpCount} อินเทอร์เฟซ`, 'info');
    await pump();
  }

  // ขั้นที่ 2 — ตรวจการตั้งค่า
  logConsole('[2/3] ตรวจการตั้งค่าอุปกรณ์และสายสัญญาณ', 'info');
  const issues = net.validate();
  const errors = issues.filter(i => i.level === 'error'), warns = issues.filter(i => i.level === 'warn');
  errors.forEach(i => logConsole(`[ERROR] ${i.name}: ${i.msg}`, 'err'));
  warns.forEach(i => logConsole(`[WARNING] ${i.name}: ${i.msg}`, 'warn'));
  if (!issues.length) logConsole('[PASS] การตั้งค่า IP และการเดินสายถูกต้อง', 'ok');

  // ขั้นที่ 3 — ทดสอบการสื่อสารจริงด้วย ping
  const ready = [...net.devices.values()].filter(d => d.kind === 'host' && net.primaryIp(d));
  const users = ready.filter(d => USER_FORMS.has(d.spec.form));
  const web = ready.find(d => d.services && d.services.http && d.services.http.enabled);
  const sources = (users.length ? users : ready).slice(0, 6);
  const tests = [];
  sources.forEach(src => {
    const target = web && web !== src ? web : (users.length > 1 ? users[(users.indexOf(src) + 1) % users.length] : ready.find(d => d !== src));
    if (!target || target === src) return;
    const test = { from: src.name, to: target.name, fromId: src.id, toId: target.id, ok: false };
    tests.push(test);
    net.ping(src.id, net.primaryIp(target), 1, outOf(src), r => { test.ok = r.ok; });
  });
  if (tests.length) {
    logConsole(`[3/3] ทดสอบ ping ${tests.length} เส้นทาง — ดูแพ็กเก็ตวิ่งในห้อง 3D`, 'info');
    await pump();
  } else logConsole('[3/3] ข้ามการทดสอบ ping — ต้องมีเครื่องที่มี IP แล้วอย่างน้อย 2 เครื่อง', 'warn');

  const failed = tests.filter(t => !t.ok);
  tests.forEach(t => logConsole(`${t.ok ? '[PASS]' : '[FAIL]'} ping ${t.from} → ${t.to}`, t.ok ? 'ok' : 'err'));
  let status = 'ผ่าน';
  if (errors.length || failed.length) status = 'ไม่ผ่าน';
  else if (warns.length || !tests.length) status = 'มีคำเตือน';
  logConsole(`=== ผลการรันระบบ: ${status} (ข้อผิดพลาด ${errors.length}, คำเตือน ${warns.length}, ping ผ่าน ${tests.length - failed.length}/${tests.length}) ===`, status === 'ผ่าน' ? 'ok' : (status === 'ไม่ผ่าน' ? 'err' : 'warn'));
  setCaption('ผลการรันระบบ', `${status} — ping ผ่าน ${tests.length - failed.length}/${tests.length} เส้นทาง`, status === 'ไม่ผ่าน');
  showToast(`ผลการรันระบบ: ${status}`, status === 'ไม่ผ่าน');
  saveReport(status);
  window.lastFailedPing = failed.length ? { from: failed[0].fromId, to: failed[0].toId } : null;
  if (failed.length) logConsole('[TIP] กดปุ่ม "ทำไมไม่ติด?" (รูปหูฟังแพทย์ ด้านซ้ายของห้อง) เพื่อให้ระบบชี้จุดที่เสียและบอกวิธีแก้', 'info');
  if (status === 'ผ่าน' && tests.length) award({ xp: 15, reason: `รันระบบผ่านทุกเส้นทาง (${MODEL})`, once: 'run-pass-' + MODEL, badges: ['first_ping'] });
}

function saveReport(status, extra) {
  const report = Object.assign({ projectName: projectName(), model: MODEL, devices: net.devices.size, status, date: new Date().toLocaleString('th-TH') }, extra);
  Store.reports.add(report).catch(e => showToast('บันทึกรายงานไม่สำเร็จ: ' + e.message, true));
}

/* ==========================================================================
   เบราว์เซอร์จำลอง — DNS / TCP / HTTP วิ่งจริงผ่านเครือข่ายที่ออกแบบ
   ========================================================================== */
function openBrowserSim() {
  const hosts = [...net.devices.values()].filter(d => d.kind === 'host' && d.ifaces.length);
  if (!hosts.length) return showToast('ยังไม่มีเครื่องคอมพิวเตอร์ในห้องสำหรับเปิดเบราว์เซอร์', true);
  const sel = $('browserClientSelect');
  sel.innerHTML = '';
  hosts.forEach(d => sel.append(h('option', { value: d.id, text: `${d.name} (${net.primaryIp(d) || 'ไม่มี IP'})` })));
  const picked = devOf(selectedId);
  const client = (picked && picked.kind === 'host') ? picked : (hosts.find(d => USER_FORMS.has(d.spec.form) && net.primaryIp(d)) || hosts[0]);
  sel.value = String(client.id);
  const web = hosts.find(d => d.services && d.services.http && d.services.http.enabled && net.primaryIp(d));
  const dnsHost = hosts.find(d => d.services && d.services.dns && d.services.dns.enabled && d.services.dns.records.length);
  if (!$('browserUrlInput').value) {
    $('browserUrlInput').value = dnsHost ? `http://${dnsHost.services.dns.records[0].name}` : (web ? `http://${net.primaryIp(web)}` : 'http://');
  }
  const body = $('browserBody');
  body.innerHTML = '';
  body.append(h('div', { class: 'web-idle' }, icon('fa-globe'), 'พิมพ์ URL หรือ IP ของ Web Server แล้วกดลูกศร — หน้าต่างนี้จะซ่อนชั่วคราวเพื่อให้เห็นแพ็กเก็ต DNS / TCP / HTTP วิ่งในห้อง 3D'));
  $('simBrowserModalOverlay').classList.add('active');
  $('browserUrlInput').focus();
}

function browserGo(event) {
  event.preventDefault();
  if (pumping) return showToast('กำลังจำลองอยู่ รอให้จบก่อน', true);
  const client = devOf($('browserClientSelect').value);
  const url = $('browserUrlInput').value.trim();
  if (!client || !url || url === 'http://') return;
  closeBrowserSim();
  switchTab('sim');
  addEventSep(`${client.name} เปิดเว็บ ${url}`);
  logConsole(`[HTTP] ${client.name} เปิด ${url}`, 'info');
  net.browse(client.id, url, (t, c) => logConsole(`[${client.name}] ${t}`, c || ''), res => {
    const body = $('browserBody');
    body.innerHTML = '';
    if (res.ok) {
      const r = res.response;
      body.append(
        h('div', { class: 'web-hero' }, h('h2', { text: r.title }), h('p', { text: r.body })),
        h('div', { class: 'web-meta' },
          h('div', {}, h('b', { text: `HTTP/1.1 ${r.status} ${r.statusText}` })),
          h('div', { text: `เซิร์ฟเวอร์: ${r.server} (${res.ip})` }),
          h('div', { text: `ผู้ขอ: ${client.name} (${net.primaryIp(client)})` }),
          h('div', { text: 'ลำดับที่เกิดขึ้น: ' + (res.host !== res.ip ? 'DNS Query → ' : '') + 'ARP → TCP SYN / SYN+ACK / ACK → HTTP GET → 200 OK' })));
    } else {
      body.append(h('div', { class: 'web-error' }, icon('fa-plug-circle-xmark'),
        h('h3', { text: 'ไม่สามารถเข้าถึงเว็บไซต์นี้' }),
        h('p', { text: `${res.host} ไม่ตอบสนอง — ดูสาเหตุได้ที่แท็บเหตุการณ์` }),
        h('code', { text: res.error })));
    }
    $('simBrowserModalOverlay').classList.add('active');
  });
  pump();
}

function closeBrowserSim() { $('simBrowserModalOverlay').classList.remove('active'); }
function handleModalOverlayClick(event) { if (event.target.id === 'simBrowserModalOverlay') closeBrowserSim(); }

/* ==========================================================================
   บทเรียน / Info / Toast
   ========================================================================== */
const TUTORIALS = {
  network: {
    title: 'LAB 01 — ห้องคอมพิวเตอร์เครือข่าย (LAN)',
    goal: 'เข้าใจ IP Address, Subnet Mask, ARP และการทำงานของ Switch / Hub',
    steps: [
      'กด <b>รันระบบ</b> แล้วดูแพ็กเก็ตสีส้ม (ARP) ถูกสวิตช์กระจายไปทุกเครื่อง ก่อนที่แพ็กเก็ตสีเขียว (ICMP) จะวิ่งตรงไปเครื่องปลายทาง',
      'เปิดแท็บ <b>เหตุการณ์</b> คลิกแต่ละแถวเพื่อดูข้อมูลในแต่ละชั้น OSI',
      'สลับเป็น <b>Simulation</b> แล้วพิมพ์ <code>ping 192.168.1.11</code> ที่แท็บ Console กด Step ทีละขั้น',
      'คลิกที่สวิตช์ ดู <b>MAC Address Table</b> หรือพิมพ์ <code>show mac-address-table</code>',
      'จากแถบซ้ายหมวด <b>Hubs</b> ลาก Hub-PT และ <b>Sniffer</b> มาต่อ แล้วเทียบว่า Hub ส่งเฟรมให้ทุกเครื่อง ต่างจาก Switch อย่างไร',
      'ลองต่อสวิตช์ 2 ตัวด้วย <b>Copper Straight-Through</b> ไฟจะเป็นสีแดง เปลี่ยนเป็น <b>Cross-Over</b> ไฟจะเขียว'
    ]
  },
  portal: {
    title: 'LAB 03 — ระบบสารสนเทศ & Web Server',
    goal: 'เข้าใจ Default Gateway, Router, DNS และ HTTP ข้ามวงเครือข่าย',
    steps: [
      'ห้องนี้มี 2 วง: 192.168.1.0/24 (ผู้ใช้) และ 192.168.2.0/24 (เซิร์ฟเวอร์) เชื่อมกันด้วย Router 2911',
      'กด <b>ทดสอบเว็บ</b> แล้วเปิด <code>http://www.school.local</code> ดูลำดับ DNS → TCP 3-way handshake → HTTP',
      'พิมพ์ <code>tracert 192.168.2.100</code> ที่ PC เพื่อดูว่าแพ็กเก็ตผ่าน Router',
      'ลบค่า Default Gateway ของ PC แล้วลองใหม่ — สังเกตข้อความผิดพลาด',
      'คลิกที่ Router พิมพ์ <code>show ip route</code>, <code>show arp</code>, <code>show running-config</code>',
      'ปิดบริการ HTTP ที่เซิร์ฟเวอร์ แล้วเปิดเว็บอีกครั้ง จะได้ Connection refused (TCP RST)'
    ]
  },
  datacenter: {
    title: 'LAB 02 — ศูนย์ข้อมูลและเซิร์ฟเวอร์',
    goal: 'เข้าใจสาย Fiber, Console, บริการ DHCP และ Wi-Fi ในห้องเซิร์ฟเวอร์',
    steps: [
      'Core Router (ISR 4331) ต่อกับ Core Switch (3650) ด้วย <b>สาย Fiber</b> สีส้ม',
      'กด <b>รันระบบ</b> — PC-DHCP และ Laptop-Tech (ผ่าน Wi-Fi ของ AP 3702i) จะได้ IP จาก RACK-A อัตโนมัติ',
      'คลิก PC-Admin แล้วกดปุ่ม <b>Terminal</b> (ต่อสาย Console ไว้กับ SW-Core) จากนั้นพิมพ์ <code>show mac-address-table</code>',
      'คลิก AP-1 เปลี่ยนรหัสผ่าน Wi-Fi แล้วดูว่า Laptop-Tech หลุดการเชื่อมต่อ',
      'กด <b>ทดสอบเว็บ</b> เปิด <code>http://portal.school.local</code>',
      'สลับไปโหมด <b>เดินสำรวจ 360°</b> เพื่อเดินดูห้องเซิร์ฟเวอร์ที่ออกแบบไว้'
    ]
  },
  wireless: {
    title: 'LAB 05 — Wi-Fi และอินเทอร์เน็ตบ้าน (NAT)',
    goal: 'เข้าใจ Wireless Router, SSID/รหัสผ่าน, DHCP, NAT และสาย Coaxial จากผู้ให้บริการ',
    steps: [
      'ฝั่ง ISP: Server → Router ISP → Cloud → Splitter → Cable Modem (สาย <b>Coaxial</b> สีฟ้า) → WRT300N',
      'กด <b>รันระบบ</b>: WRT300N ขอ IP จาก ISP ก่อน แล้ว Laptop / Smartphone / PC ขอ IP จาก WRT300N',
      'Smartphone ใส่รหัสผ่านผิดไว้ คลิกแล้วแก้รหัสเป็น <code>student123</code> จะเห็นเส้น Wi-Fi เชื่อมขึ้นมา',
      'ping 203.0.113.10 จาก Laptop แล้วดูข้อความ <b>NAT ขาออก</b> ในแท็บเหตุการณ์ จากนั้นพิมพ์ <code>show ip nat translations</code> ที่ Home-Router',
      'ลอง ping จาก ISP-Web เข้ามาหา 192.168.0.100 — ทำไมถึงไม่ได้?',
      'กด <b>ทดสอบเว็บ</b> จาก Smartphone เปิด <code>http://www.isp.net</code>'
    ]
  },
  wan: {
    title: 'LAB 06 — เชื่อมสาขาด้วยสาย Serial (WAN)',
    goal: 'เข้าใจสาย Serial DCE/DTE, Clock Rate, Static Route และการเข้า CLI ผ่านสาย Console',
    steps: [
      'Router 1941 ทั้งสองตัวติดตั้งโมดูล <b>HWIC-2T</b> (ดูที่แท็บคุณสมบัติ ส่วนโมดูลเสริม)',
      'สาย Serial สีแดงมีป้าย <b>DCE</b> อยู่ฝั่ง R1 ซึ่งตั้ง Clock Rate 64000 ไว้ — ลองเปลี่ยนเป็น "ยังไม่ได้ตั้ง" แล้วดูไฟเป็นสีแดง',
      'กด <b>รันระบบ</b> แล้วดูเฟรม HDLC บนสาย Serial (ไม่มี ARP เพราะเป็นแบบจุดต่อจุด)',
      'คลิก Laptop-Admin กด <b>Terminal</b> เพื่อเข้า CLI ของ R1 ผ่านสาย Console แล้วพิมพ์ <code>show controllers serial</code>',
      'ลบ Static Route ของ R2 แล้ว ping อีกครั้ง — แพ็กเก็ตไปถึงแต่ตอบกลับไม่ได้เพราะอะไร?',
      'พิมพ์ <code>tracert 192.168.20.10</code> ที่ PC-A ดูว่าผ่านกี่ Hop'
    ]
  }
};
TUTORIALS.panorama = Object.assign({}, TUTORIALS.datacenter, { title: 'LAB 04 — เดินสำรวจห้องเซิร์ฟเวอร์ 360°' });

function openLabTutorial() {
  const t = TUTORIALS[MODEL];
  $('infoModalTitle').textContent = t.title;
  // เนื้อหาบทเรียนเป็นข้อความคงที่ในไฟล์นี้ (ไม่ได้มาจากผู้ใช้) จึงใส่เป็น HTML ได้
  $('infoModalBody').innerHTML = `<div class="goal"><b>เป้าหมาย:</b> ${t.goal}</div><ol>${t.steps.map(s => `<li>${s}</li>`).join('')}</ol>`;
  const act = SimActivities.ACTIVITIES[MODEL];
  if (act) {
    $('infoModalBody').append(h('div', { class: 'tut-activity' },
      h('div', {}, h('b', { text: '🏁 ' + act.title }), h('p', { text: `${act.intro} (${act.tasks.length} ข้อ ระบบตรวจและให้คะแนนอัตโนมัติ)` })),
      h('button', { class: 'btn btn-primary', onclick: () => { closeInfoModal(); startActivity(); } }, icon('fa-flag-checkered'), activity ? ' เริ่มภารกิจใหม่' : ' เริ่มภารกิจ')));
  }
  $('infoModal').classList.add('active');
}
function closeInfoModal() { $('infoModal').classList.remove('active'); }

function showDeviceInfo(id) {
  const dev = devOf(id);
  if (!dev) return;
  setFlag(`viewed:${id}`);
  $('infoCardTitle').textContent = `${dev.name} — ${dev.spec.label}`;
  const body = $('infoCardBody');
  body.innerHTML = '';
  body.append(h('p', { text: dev.spec.desc }));
  const facts = [`หมวด: ${catOf(dev.spec.cat).label}`];
  dev.ifaces.filter(f => f.ip).forEach(f => facts.push(`${f.name}: ${f.ip}`));
  if (dev.wifi) facts.push(`Wi-Fi: ${dev.wifi.ssid} (${net.wifiClients(dev).length} เครื่อง)`);
  const visible = dev.ports.filter(p => !p.hidden);
  if (visible.length) facts.push(`พอร์ตที่ใช้: ${visible.filter(p => p.link).length}/${visible.length}`);
  if (dev.services && dev.services.http) {
    const on = ['http', 'dns', 'dhcp'].filter(k => dev.services[k].enabled).map(k => k.toUpperCase());
    facts.push(`บริการที่เปิด: ${on.join(', ') || 'ไม่มี'}`);
  }
  facts.forEach(f => body.append(h('div', {}, h('code', { text: f }))));
  $('infoCard').classList.add('show');
}
function hideInfoCard() { $('infoCard').classList.remove('show'); }

function showToast(message, isError) { UI.toast(message, isError === true ? 'err' : (isError || 'info')); }

/* ==========================================================================
   มุมมอง: ห้อง 3D / เดินสำรวจ 360°
   ========================================================================== */
const EYE = 1.6;

function switchViewMode(mode) {
  if (mode === viewMode) return;
  viewMode = mode;
  $('btnMode3D').classList.toggle('active', mode === '3d');
  $('btnMode360').classList.toggle('active', mode === '360');
  document.body.classList.toggle('mode-360', mode === '360');
  waypointGroup.visible = mode === '360';
  if (mode === '360') {
    setEditMode(false);
    setFlag('tour');
    toggleCableTool(false);
    orbitState = { pos: camera.position.clone(), target: controls.target.clone() };
    enterTour();
    logConsole('[VIEW] เข้าสู่โหมดเดินสำรวจ 360° ภายในห้องที่ออกแบบไว้', 'info');
  } else {
    stopWalking();
    hideInfoCard();
    camera.fov = 50;
    camera.updateProjectionMatrix();
    Object.assign(controls, { enableZoom: true, enablePan: true, rotateSpeed: 1, minDistance: 2, maxDistance: maxOrbit(), minPolarAngle: 0, maxPolarAngle: Math.PI / 2 - 0.02 });
    if (orbitState) { camera.position.copy(orbitState.pos); controls.target.copy(orbitState.target); } else reset3DCamera();
  }
}

function enterTour() {
  const { l } = roomSize();
  camera.fov = 72;
  camera.updateProjectionMatrix();
  Object.assign(controls, { enableZoom: false, enablePan: false, rotateSpeed: -0.45, minDistance: 0, maxDistance: Infinity, minPolarAngle: 0.75, maxPolarAngle: 2.35 });
  const z0 = currentZone || null;
  const sx = z0 ? z0.x : 0, sz = z0 ? z0.z + Math.min(1.5, z0.l * 0.2) : l * 0.2;
  camera.position.set(sx, EYE, sz);
  controls.target.set(sx, EYE, sz - 0.01);
}

function walkTo(x, z) {
  const from = camera.position.clone();
  camera.getWorldDirection(lookDir);
  const dir = lookDir.clone();
  const to = V(x, EYE, z);
  tween(700, k => {
    camera.position.lerpVectors(from, to, ease(k));
    controls.target.copy(camera.position).addScaledVector(dir, 0.01);
  });
  hideInfoCard();
}

/* ------------------- เดินด้วยคีย์บอร์ด W A S D (โหมด 360°) -------------------
   W/↑ เดินหน้า  S/↓ ถอยหลัง  A/← ก้าวซ้าย  D/→ ก้าวขวา  Shift = วิ่ง
   ชนผนังและอุปกรณ์ไม่ได้ (ไถลไปตามขอบ) ปุ่มบนจอกดค้างได้สำหรับแท็บเล็ต */
const WALK_KEYS = { w: 'f', arrowup: 'f', s: 'b', arrowdown: 'b', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r' };
const walk = { f: false, b: false, l: false, r: false, run: false, last: 0, dist: 0 };
const BODY_R = 0.32;            // รัศมีตัวผู้เดิน
const segDist = (px, pz, [x1, z1, x2, z2]) => {
  const dx = x2 - x1, dz = z2 - z1, L = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / L));
  return Math.hypot(px - (x1 + t * dx), pz - (z1 + t * dz));
};
function walkBlocked(x, z) {
  if (siteWalls.some(sg => segDist(x, z, sg) < BODY_R)) return true;     // ผนังห้อง/อาคาร (เดินผ่านช่องประตูได้)
  for (const [id, n] of nodes) {
    const d = devOf(id);
    if (!d || n.height < 0.25) continue;                    // ของเตี้ย (ปลั๊ก เซนเซอร์) เดินข้ามได้
    const r = (d.spec.form === 'rack' || d.spec.form === 'rackserver' ? 0.55 : 0.42) + BODY_R;
    if (Math.hypot(x - n.group.position.x, z - n.group.position.z) < r) return true;
  }
  return false;
}
function setWalkKey(dir, on) {
  walk[dir] = on;
  const key = document.querySelector(`.wasd-key[data-dir="${dir}"]`);
  if (key) key.classList.toggle('down', on);
}
function stopWalking() { ['f', 'b', 'l', 'r'].forEach(d => setWalkKey(d, false)); walk.run = false; }
frameHooks.add(now => {
  const dt = Math.min(0.05, (now - (walk.last || now)) / 1000);
  walk.last = now;
  if (viewMode !== '360') return;
  const fwd = (walk.f ? 1 : 0) - (walk.b ? 1 : 0), side = (walk.r ? 1 : 0) - (walk.l ? 1 : 0);
  if (!fwd && !side) return;
  // ทิศที่กำลังมอง (ตัดแกน Y ออก เดินบนพื้นราบ)
  let fx = controls.target.x - camera.position.x, fz = controls.target.z - camera.position.z;
  const len = Math.hypot(fx, fz) || 1;
  fx /= len; fz /= len;
  let mx = fx * fwd - fz * side, mz = fz * fwd + fx * side;
  const ml = Math.hypot(mx, mz);
  const step = (walk.run ? 4.2 : 2.2) * (roomSize().kind === 'campus' ? 1.8 : 1) * dt;
  mx = mx / ml * step; mz = mz / ml * step;
  const { w, l } = roomSize();
  const lim = (v, half) => Math.max(-half + 0.35, Math.min(half - 0.35, v));
  const px = camera.position.x, pz = camera.position.z;
  let nx = lim(px + mx, w / 2), nz = lim(pz + mz, l / 2);
  if (!walkBlocked(px, pz) && walkBlocked(nx, nz)) {        // ชนของ → ลองไถลทีละแกน (ถ้าเริ่มอยู่ในของ ให้เดินออกได้)
    if (!walkBlocked(nx, pz)) nz = pz;
    else if (!walkBlocked(px, nz)) nx = px;
    else { nx = px; nz = pz; }
  }
  const dx = nx - px, dz = nz - pz;
  walk.dist += Math.hypot(dx, dz);
  const bob = UI.reduced ? 0 : Math.sin(walk.dist * (walk.run ? 7 : 9)) * 0.025;
  const ty = controls.target.y - camera.position.y;
  camera.position.set(nx, EYE + bob, nz);
  controls.target.set(controls.target.x + dx, camera.position.y + ty, controls.target.z + dz);
  if (dx || dz) hideInfoCard();
});
window.addEventListener('keydown', event => {
  if (viewMode !== '360' || event.ctrlKey || event.metaKey || event.altKey) return;
  const typing = !!document.activeElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable);
  if (typing) return;
  walk.run = event.shiftKey;
  const dir = WALK_KEYS[event.key.toLowerCase()];
  if (!dir) return;
  event.preventDefault();
  if (!walk[dir]) setWalkKey(dir, true);
});
window.addEventListener('keyup', event => {
  walk.run = event.shiftKey;
  const dir = WALK_KEYS[event.key.toLowerCase()];
  if (dir) setWalkKey(dir, false);
});
window.addEventListener('blur', stopWalking);

// ปุ่ม W A S D บนจอ (กดค้างด้วยเมาส์หรือนิ้วได้)
function buildWasdPad() {
  const key = (dir, label, title) => {
    const b = h('button', { class: 'wasd-key', 'data-dir': dir, title, 'aria-label': title }, h('b', { text: label }));
    const on = e => { e.preventDefault(); b.setPointerCapture && b.setPointerCapture(e.pointerId); setWalkKey(dir, true); };
    const off = () => setWalkKey(dir, false);
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('lostpointercapture', off);
    return b;
  };
  const pad = h('div', { class: 'wasd-pad', 'aria-label': 'ปุ่มเดิน' },
    h('div', { class: 'wasd-row' }, key('f', 'W', 'เดินหน้า (W)')),
    h('div', { class: 'wasd-row' }, key('l', 'A', 'ก้าวซ้าย (A)'), key('b', 'S', 'ถอยหลัง (S)'), key('r', 'D', 'ก้าวขวา (D)')),
    h('small', { text: 'Shift ค้าง = วิ่ง' }));
  document.querySelector('.viewport-container').append(pad);
}

function reset3DCamera() {
  if (viewMode !== '3d') return enterTour();
  const { w, l } = roomSize();
  camera.position.set(w * 1.05, Math.max(w, l) * 1.05, l * 1.35);
  controls.target.set(0, 0.6, 0);
}

function toggleWireframe() {
  wireframe = !wireframe;
  const apply = root => root.traverse(c => { if (c.isMesh && c.material && c.material.isMeshStandardMaterial) c.material.wireframe = wireframe; });
  apply(roomGroup);
  nodes.forEach(n => apply(n.group));
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
  const map = { props: 'tabProps', network: 'tabNetwork', sim: 'tabSim', console: 'tabConsole', task: 'tabTask' };
  if (tabId === 'task') renderTaskPanel();
  Object.entries(map).forEach(([key, id]) => $(id).classList.toggle('active', key === tabId));
}

/* ==========================================================================
   แม่แบบห้องปฏิบัติการของแต่ละบทเรียน
   ========================================================================== */
const M24 = '255.255.255.0';
const IF = (name, ip, mask, extra) => Object.assign({ name, ip, mask: mask || M24 }, extra);
const TEMPLATES = {
  network: {
    room: 'medium',
    devices: [
      { id: 1, model: '2960-24TT', name: 'SW-1', x: 0, z: -2.6 },
      { id: 2, model: 'PC-PT', name: 'PC-1', ifaces: [IF('Fa0', '192.168.1.10')], x: -2.7, z: 0.4 },
      { id: 3, model: 'PC-PT', name: 'PC-2', ifaces: [IF('Fa0', '192.168.1.11')], x: -0.9, z: 0.4 },
      { id: 4, model: 'PC-PT', name: 'PC-3', ifaces: [IF('Fa0', '192.168.1.12')], x: 0.9, z: 0.4 },
      { id: 5, model: 'PC-PT', name: 'PC-4', ifaces: [IF('Fa0', '192.168.1.13')], x: 2.7, z: 0.4 },
      { id: 6, model: 'Printer-PT', name: 'Printer-1', ifaces: [IF('Fa0', '192.168.1.50')], x: 2.4, z: -2.4 }
    ],
    links: [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1]]
  },
  portal: {
    room: 'medium',
    devices: [
      { id: 1, model: '2911', name: 'R-1', x: 0, z: -2.8, ifaces: [IF('Gi0/0', '192.168.1.1'), IF('Gi0/1', '192.168.2.1')] },
      { id: 2, model: '2960-24TT', name: 'SW-User', x: -2, z: -1.2 },
      { id: 3, model: '2960-24TT', name: 'SW-Server', x: 2, z: -1.2 },
      { id: 4, model: 'PC-PT', name: 'PC-1', ifaces: [IF('Fa0', '192.168.1.10')], gw: '192.168.1.1', dns: '192.168.2.100', x: -2.8, z: 1.4 },
      { id: 5, model: 'Laptop-PT', name: 'Laptop-1', ifaces: [IF('Fa0', '192.168.1.11')], gw: '192.168.1.1', dns: '192.168.2.100', x: -1, z: 1.4 },
      { id: 6, model: 'Server-PT', name: 'WEB-1', ifaces: [IF('Fa0', '192.168.2.100')], gw: '192.168.2.1', x: 2.2, z: 1.2,
        services: { http: { enabled: true, title: 'School Information Portal', body: 'ระบบสารสนเทศโรงเรียน — ตารางเรียน ผลการเรียน และข่าวประชาสัมพันธ์' },
          dns: { enabled: true, records: [{ name: 'www.school.local', ip: '192.168.2.100' }] } } }
    ],
    links: [[1, 2], [1, 3], [4, 2], [5, 2], [6, 3]]
  },
  datacenter: {
    room: 'large',
    devices: [
      { id: 1, model: 'ISR4331', name: 'R-Core', x: -4.4, z: -3.6, ifaces: [IF('Gi0/0/2', '10.0.0.1')] },
      { id: 2, model: '3650-24PS', name: 'SW-Core', x: -2.0, z: -3.6 },
      { id: 3, model: 'Server-Rack', name: 'RACK-A', ifaces: [IF('Fa0', '10.0.0.11')], gw: '10.0.0.1', x: 0.3, z: -3.7,
        services: { dhcp: { enabled: true, start: '10.0.0.100', count: 50, mask: M24, gw: '10.0.0.1', dns: '10.0.0.20' } } },
      { id: 4, model: 'Server-Rack', name: 'RACK-B', ifaces: [IF('Fa0', '10.0.0.12')], gw: '10.0.0.1', x: 1.6, z: -3.7 },
      { id: 5, model: 'Server-PT', name: 'WEB-DNS', ifaces: [IF('Fa0', '10.0.0.20')], gw: '10.0.0.1', x: 3.1, z: -3.5,
        services: { http: { enabled: true, title: 'Datacenter Portal', body: 'ศูนย์ข้อมูลกลาง — สถานะเซิร์ฟเวอร์ทั้งหมดปกติ' },
          dns: { enabled: true, records: [{ name: 'portal.school.local', ip: '10.0.0.20' }, { name: 'www.school.local', ip: '10.0.0.20' }] } } },
      { id: 6, model: 'UPS', name: 'UPS-1', x: 4.6, z: -3.5 },
      { id: 7, model: 'PC-PT', name: 'PC-Admin', ifaces: [IF('Fa0', '10.0.0.50')], gw: '10.0.0.1', dns: '10.0.0.20', x: -3.2, z: 1.4 },
      { id: 8, model: 'PC-PT', name: 'PC-DHCP', ifaces: [{ name: 'Fa0', dhcp: true }], x: -1.2, z: 1.4 },
      { id: 9, model: '3702i', name: 'AP-1', wifi: { ssid: 'DC-Staff', key: 'dc12345678' }, x: 2.2, z: 0.6 },
      { id: 10, model: 'Laptop-PT', name: 'Laptop-Tech', ifaces: [{ name: 'Wireless0', dhcp: true, ssid: 'DC-Staff', key: 'dc12345678' }], x: 3.8, z: 2.4 }
    ],
    links: [[1, 2, 'fiber'], [3, 2], [4, 2], [5, 2], [7, 2], [8, 2], [9, 2], [7, 2, 'console']]
  },
  wireless: {
    room: 'large',
    devices: [
      { id: 1, model: 'Server-PT', name: 'ISP-Web', ifaces: [IF('Fa0', '203.0.113.10')], gw: '203.0.113.1', x: -4.6, z: -3.6,
        services: { http: { enabled: true, title: 'ISP Net', body: 'ยินดีต้อนรับสู่อินเทอร์เน็ต — หน้านี้มาจากเซิร์ฟเวอร์ของผู้ให้บริการ' },
          dns: { enabled: true, records: [{ name: 'www.isp.net', ip: '203.0.113.10' }] } } },
      { id: 2, model: '2911', name: 'ISP-Router', x: -2.8, z: -3.6, ifaces: [IF('Gi0/0', '203.0.113.1'), IF('Gi0/1', '100.64.0.1')],
        services: { dhcp: { enabled: true, start: '100.64.0.10', count: 20, mask: M24, gw: '100.64.0.1', dns: '203.0.113.10' } } },
      { id: 3, model: 'Cloud-PT', name: 'Cable-ISP', x: -0.6, z: -3.4 },
      { id: 4, model: 'CoAxialSplitter-PT', name: 'Splitter', x: 1.6, z: -3.6 },
      { id: 5, model: 'TV-PT', name: 'TV', x: 3.8, z: -3.8 },
      { id: 6, model: 'Cable-Modem-PT', name: 'Cable-Modem', x: 1.6, z: -1.6 },
      { id: 7, model: 'WRT300N', name: 'Home-Router', wifi: { ssid: 'HomeWiFi', key: 'student123' }, x: 0, z: 0.4 },
      { id: 8, model: 'PC-PT', name: 'PC-Home', ifaces: [{ name: 'Fa0', dhcp: true }], x: -3, z: 2.4 },
      { id: 9, model: 'Laptop-PT', name: 'Laptop', ifaces: [{ name: 'Wireless0', dhcp: true, ssid: 'HomeWiFi', key: 'student123' }], x: -0.4, z: 3.2 },
      { id: 10, model: 'SMARTPHONE-PT', name: 'Smartphone', ifaces: [{ name: 'Wireless0', dhcp: true, ssid: 'HomeWiFi', key: 'student12' }], x: 2.2, z: 3.0 },
      { id: 11, model: 'TabletPC-PT', name: 'Tablet', ifaces: [{ name: 'Wireless0', dhcp: true, ssid: 'HomeWiFi', key: 'student123' }], x: 4.2, z: 1.6 }
    ],
    links: [[1, 2], [2, 3], [3, 4], [4, 6], [4, 5], [6, 7], [8, 7]]
  },
  wan: {
    room: 'large',
    devices: [
      { id: 1, model: '1941', name: 'R1', modules: ['HWIC-2T'], clocks: { 'Se0/0/0': 64000 }, x: -2.6, z: -2.6,
        ifaces: [IF('Gi0/0', '192.168.10.1'), IF('Se0/0/0', '10.0.0.1', '255.255.255.252')], routes: [{ net: '192.168.20.0', mask: M24, via: '10.0.0.2' }] },
      { id: 2, model: '1941', name: 'R2', modules: ['HWIC-2T'], x: 2.6, z: -2.6,
        ifaces: [IF('Gi0/0', '192.168.20.1'), IF('Se0/0/0', '10.0.0.2', '255.255.255.252')], routes: [{ net: '192.168.10.0', mask: M24, via: '10.0.0.1' }] },
      { id: 3, model: '2960-24TT', name: 'SW-HQ', x: -2.6, z: -0.2 },
      { id: 4, model: '2960-24TT', name: 'SW-Branch', x: 2.6, z: -0.2 },
      { id: 5, model: 'PC-PT', name: 'PC-A', ifaces: [IF('Fa0', '192.168.10.10')], gw: '192.168.10.1', x: -3.8, z: 2.4 },
      { id: 6, model: 'PC-PT', name: 'PC-B', ifaces: [IF('Fa0', '192.168.20.10')], gw: '192.168.20.1', x: 3.8, z: 2.4 },
      { id: 7, model: 'Laptop-PT', name: 'Laptop-Admin', x: -1.2, z: 2.6 },
      { id: 8, model: 'Server-PT', name: 'Branch-Server', ifaces: [IF('Fa0', '192.168.20.100')], gw: '192.168.20.1', x: 1.4, z: 2.4 }
    ],
    links: [[1, 2, 'serialDCE'], [1, 3], [2, 4], [5, 3], [6, 4], [8, 4], [7, 1, 'console']]
  }
};
TEMPLATES.panorama = TEMPLATES.datacenter;

function populateScene() {
  for (const id of [...cables.keys()]) removeCable(id);
  for (const id of [...nodes.keys()]) removeNode(id);
  buildRoom();
  net.devices.forEach(dev => createNode(dev));
  net.links.forEach(link => buildCable(link));
  nextDeviceId = Math.max(0, ...net.devices.keys()) + 1;
}

/* --------------------- ตัวอย่างเครือข่ายใหญ่ (หลายห้อง / หลายอาคาร) --------------------- */
const BIG_TEMPLATES = {
  floor: {
    room: 'floor',
    title: 'อาคารเรียน 4 ห้อง — เดินสายข้ามห้อง',
    steps: [
      'ห้องเซิร์ฟเวอร์มี Router, Switch ของฝั่งสำนักงาน (192.168.10.0/24) และ Distribution Switch ของฝั่งห้องเรียน (192.168.20.0/24)',
      'สายจาก SW-Dist วิ่งข้ามทางเดินไปยัง Switch ของห้องคอม 1 และห้องคอม 2 (Switch ↔ Switch ใช้สายไขว้)',
      'ห้องพักครูใช้ Wi-Fi ชื่อ <b>Staff</b> — ลากโน้ตบุ๊กไปไกลๆ จาก Access Point แล้วสังเกตว่ายังเชื่อมได้ไหม',
      'กด <b>รันระบบ</b> แล้วกด <b>ทดสอบเว็บ</b> จาก PC ในห้องคอม เปิด <code>http://www.school.local</code>',
      'ใช้ปุ่มห้องในแถบซ้ายเพื่อพากล้องไปแต่ละห้อง และลองโหมดเดินสำรวจ 360° เดินผ่านประตูด้วย W A S D'
    ],
    devices: [
      { id: 1, model: 'ISR4331', name: 'R-Core', x: -10.6, z: -5.6, ifaces: [IF('Gi0/0/0', '192.168.10.1'), IF('Gi0/0/1', '192.168.20.1')] },
      { id: 2, model: '2960-24TT', name: 'SW-Office', x: -8.6, z: -5.6 },
      { id: 3, model: '3650-24PS', name: 'SW-Dist', x: -6.2, z: -5.6 },
      { id: 4, model: 'Server-PT', name: 'SRV-WEB', ifaces: [IF('Fa0', '192.168.10.10')], gw: '192.168.10.1', x: -10.4, z: -2.8,
        services: { http: { enabled: true, title: 'School Portal', body: 'เว็บไซต์โรงเรียน — ให้บริการจากห้องเซิร์ฟเวอร์' },
          dns: { enabled: true, records: [{ name: 'www.school.local', ip: '192.168.10.10' }] } } },
      { id: 5, model: '2960-24TT', name: 'SW-Lab1', x: -2.6, z: -6.1 },
      { id: 6, model: 'PC-PT', name: 'PC-L1-1', ifaces: [IF('Fa0', '192.168.20.11')], gw: '192.168.20.1', dns: '192.168.10.10', x: 0.5, z: -3.4 },
      { id: 7, model: 'PC-PT', name: 'PC-L1-2', ifaces: [IF('Fa0', '192.168.20.12')], gw: '192.168.20.1', dns: '192.168.10.10', x: 3.5, z: -3.4 },
      { id: 8, model: 'PC-PT', name: 'PC-L1-3', ifaces: [IF('Fa0', '192.168.20.13')], gw: '192.168.20.1', dns: '192.168.10.10', x: 6.5, z: -3.4 },
      { id: 9, model: 'PC-PT', name: 'PC-L1-4', ifaces: [IF('Fa0', '192.168.20.14')], gw: '192.168.20.1', dns: '192.168.10.10', x: 9.5, z: -3.4 },
      { id: 10, model: '2960-24TT', name: 'SW-Lab2', x: -2.6, z: 6.1 },
      { id: 11, model: 'PC-PT', name: 'PC-L2-1', ifaces: [IF('Fa0', '192.168.20.21')], gw: '192.168.20.1', dns: '192.168.10.10', x: 0.5, z: 3.4 },
      { id: 12, model: 'PC-PT', name: 'PC-L2-2', ifaces: [IF('Fa0', '192.168.20.22')], gw: '192.168.20.1', dns: '192.168.10.10', x: 3.5, z: 3.4 },
      { id: 13, model: 'PC-PT', name: 'PC-L2-3', ifaces: [IF('Fa0', '192.168.20.23')], gw: '192.168.20.1', dns: '192.168.10.10', x: 6.5, z: 3.4 },
      { id: 14, model: 'PC-PT', name: 'PC-L2-4', ifaces: [IF('Fa0', '192.168.20.24')], gw: '192.168.20.1', dns: '192.168.10.10', x: 9.5, z: 3.4 },
      { id: 15, model: '3702i', name: 'AP-Staff', wifi: { ssid: 'Staff', key: 'teacher1234' }, x: -8, z: 2.2 },
      { id: 16, model: 'Laptop-PT', name: 'NB-Teacher1', ifaces: [{ name: 'Wireless0', ip: '192.168.10.31', mask: M24, ssid: 'Staff', key: 'teacher1234' }], gw: '192.168.10.1', dns: '192.168.10.10', x: -10.2, z: 5.4 },
      { id: 17, model: 'Laptop-PT', name: 'NB-Teacher2', ifaces: [{ name: 'Wireless0', ip: '192.168.10.32', mask: M24, ssid: 'Staff', key: 'teacher1234' }], gw: '192.168.10.1', dns: '192.168.10.10', x: -6.2, z: 5.4 },
      { id: 18, model: 'Printer-PT', name: 'Printer-Staff', ifaces: [IF('Fa0', '192.168.10.50')], gw: '192.168.10.1', x: -5.4, z: 2.6 }
    ],
    links: [[1, 2, 'straight'], [1, 3, 'straight'], [4, 2], [3, 5], [3, 10], [6, 5], [7, 5], [8, 5], [9, 5], [11, 10], [12, 10], [13, 10], [14, 10], [15, 2], [18, 2]]
  },
  home: {
    room: 'home',
    title: 'บ้านของฉัน — เน็ตบ้านที่ทุกคนใช้',
    steps: [
      'หน้าบ้านคือฝั่งผู้ให้บริการ (ISP) สายเข้ามาที่ <b>Home-Router</b> ในห้องนั่งเล่น ซึ่งแจก IP (DHCP) และแปลง IP ออกเน็ต (NAT)',
      'เปิด <b>แผนที่สัญญาณ Wi-Fi</b> (ไอคอน Wi-Fi ในแถบซ้ายของห้อง) — สังเกตว่าผนังปูนกั้นสัญญาณ และ <b>ห้องนอน 2</b> เป็นสีแดง',
      'โน้ตบุ๊กในห้องนอน 2 จึงต่อ Wi-Fi ไม่ได้ ลองกด E แล้วย้ายเราเตอร์ไปไว้กลางบ้าน หรือเพิ่ม Access Point ต่อสาย LAN ไปที่ห้องนอน 2 (ตั้ง SSID/รหัสเดียวกัน)',
      'กด <b>รันระบบ</b> แล้วเปิด <b>เน็ตบ้านมีปัญหา</b> (ไอคอนบ้าน) เพื่อเล่นโจทย์ปัญหาที่เจอบ่อย 7 เรื่อง',
      'ลอง <b>ความเร็วเน็ต</b> (ไอคอนมาตรวัด) ให้ทีวีดู 4K พร้อมกับโหลดเกม แล้วดูว่าเครื่องเล่นเกมแลคไหม'
    ],
    devices: [
      { id: 1, model: 'Server-PT', name: 'Internet-Web', ifaces: [IF('Fa0', '203.0.113.10')], gw: '203.0.113.1', x: -7.2, z: -5.9,
        services: { http: { enabled: true, title: 'www.example.com', body: 'คุณออกอินเทอร์เน็ตได้แล้ว — หน้านี้อยู่บนเซิร์ฟเวอร์ในอินเทอร์เน็ต' },
          dns: { enabled: true, records: [{ name: 'www.example.com', ip: '203.0.113.10' }] } } },
      { id: 2, model: '2911', name: 'ISP-Router', x: -5.4, z: -5.9, ifaces: [IF('Gi0/0', '203.0.113.1'), IF('Gi0/1', '100.64.0.1'), IF('Gi0/2', '198.51.100.1')],
        services: { dhcp: { enabled: true, start: '100.64.0.10', count: 20, mask: M24, gw: '100.64.0.1', dns: '203.0.113.10' } } },
      { id: 3, model: 'PC-PT', name: 'Phone-4G', ifaces: [IF('Fa0', '198.51.100.20')], gw: '198.51.100.1', dns: '203.0.113.10', x: 6.6, z: -5.9 },
      { id: 4, model: 'WRT300N', name: 'Home-Router', wifi: { ssid: 'MyHome', key: 'home1234' }, x: -6.2, z: -4.3 },
      { id: 5, model: 'SmartTV-PT', name: 'Smart-TV', ifaces: [{ name: 'Wireless0', dhcp: true, ssid: 'MyHome', key: 'home1234' }], x: -3, z: -4.5 },
      { id: 6, model: 'GameConsole-PT', name: 'Game-Console', ifaces: [{ name: 'Fa0', dhcp: true }], x: -4.6, z: -1.2 },
      { id: 7, model: 'Printer-PT', name: 'Printer', ifaces: [IF('Fa0', '192.168.0.50')], gw: '192.168.0.1', x: -6.3, z: -2.4 },
      { id: 8, model: 'IPCam-PT', name: 'CCTV-Front', ifaces: [IF('Fa0', '192.168.0.60')], gw: '192.168.0.1', x: -1.6, z: -4.6 },
      { id: 9, model: 'SMARTPHONE-PT', name: 'Phone-Mom', ifaces: [{ name: 'Wireless0', dhcp: true, ssid: 'MyHome', key: 'home1234' }], x: 4, z: -3 },
      { id: 10, model: 'SMARTPHONE-PT', name: 'Phone-Me', ifaces: [{ name: 'Wireless0', dhcp: true, ssid: 'MyHome', key: 'home1234' }], x: -4.5, z: 3.5 },
      { id: 11, model: 'Laptop-PT', name: 'NB-Room2', ifaces: [{ name: 'Wireless0', dhcp: true, ssid: 'MyHome', key: 'home1234' }], x: 5, z: 4 }
    ],
    links: [[1, 2], [2, 4], [3, 2], [6, 4], [7, 4], [8, 4]]
  },
  campus: {
    room: 'campus',
    title: 'วิทยาเขต 3 อาคาร — Fiber Backbone',
    steps: [
      'แต่ละอาคารมี Router และวงเครือข่ายของตัวเอง: A = 192.168.10.0/24, B = 192.168.20.0/24, C = 192.168.30.0/24',
      'Router ทุกอาคารต่อเข้า <b>CORE-SW</b> ในอาคาร A ด้วย <b>สาย Fiber สีส้ม</b> (วง Backbone 10.0.0.0/24) เพราะอาคารอยู่ห่างกันเกิน 100 เมตร',
      'ลองลบสาย Fiber ระหว่าง CORE-SW กับ R-B แล้วต่อใหม่ด้วยสาย LAN (Copper) — ไฟจะแดงและขึ้นว่า "ยาวเกินมาตรฐาน 100 ม."',
      'ดู Routing Table ของ R-Core (<code>show ip route</code>) — มี Static Route ไปอาคาร B และ C ส่วน R-B, R-C ใช้ Default Route',
      'กด <b>รันระบบ</b> แล้วใช้ <b>กล้องติดตามแพ็กเก็ต</b> ส่ง ping จาก PC-B1 ไป NB-C1 ดูแพ็กเก็ตข้ามอาคาร 3 Router',
      'โน้ตบุ๊กในห้องสมุดใช้ Wi-Fi <b>Library</b> — ลากไปไว้อาคารอื่นแล้วจะหลุด เพราะอยู่นอกระยะสัญญาณ 50 ม.'
    ],
    devices: [
      { id: 1, model: 'ISR4331', name: 'R-Core', x: -23, z: -12, ifaces: [IF('Gi0/0/0', '192.168.10.1'), IF('Gi0/0/1', '10.0.0.1')],
        routes: [{ net: '192.168.20.0', mask: M24, via: '10.0.0.2' }, { net: '192.168.30.0', mask: M24, via: '10.0.0.3' }] },
      { id: 2, model: '2960-24TT', name: 'SW-A', x: -20, z: -12 },
      { id: 3, model: '3650-24PS', name: 'CORE-SW', x: -14, z: -12 },
      { id: 4, model: 'Server-PT', name: 'SRV-Campus', ifaces: [IF('Fa0', '192.168.10.10')], gw: '192.168.10.1', x: -19, z: -6,
        services: { http: { enabled: true, title: 'Campus Portal', body: 'ระบบสารสนเทศวิทยาเขต — ให้บริการจากศูนย์คอมพิวเตอร์ อาคาร A' },
          dns: { enabled: true, records: [{ name: 'www.campus.local', ip: '192.168.10.10' }] } } },
      { id: 5, model: 'PC-PT', name: 'PC-Admin', ifaces: [IF('Fa0', '192.168.10.20')], gw: '192.168.10.1', dns: '192.168.10.10', x: -23, z: -6 },
      { id: 6, model: 'ISR4331', name: 'R-B', x: 12, z: -13, ifaces: [IF('Gi0/0/0', '192.168.20.1'), IF('Gi0/0/2', '10.0.0.2')],
        routes: [{ net: '0.0.0.0', mask: '0.0.0.0', via: '10.0.0.1' }] },
      { id: 7, model: '2960-24TT', name: 'SW-B', x: 15, z: -13 },
      { id: 8, model: 'PC-PT', name: 'PC-B1', ifaces: [IF('Fa0', '192.168.20.11')], gw: '192.168.20.1', dns: '192.168.10.10', x: 13, z: -7.5 },
      { id: 9, model: 'PC-PT', name: 'PC-B2', ifaces: [IF('Fa0', '192.168.20.12')], gw: '192.168.20.1', dns: '192.168.10.10', x: 17, z: -7.5 },
      { id: 10, model: 'PC-PT', name: 'PC-B3', ifaces: [IF('Fa0', '192.168.20.13')], gw: '192.168.20.1', dns: '192.168.10.10', x: 21, z: -7.5 },
      { id: 11, model: 'PC-PT', name: 'PC-B4', ifaces: [IF('Fa0', '192.168.20.14')], gw: '192.168.20.1', dns: '192.168.10.10', x: 25, z: -7.5 },
      { id: 12, model: 'ISR4331', name: 'R-C', x: -5, z: 10, ifaces: [IF('Gi0/0/0', '192.168.30.1'), IF('Gi0/0/2', '10.0.0.3')],
        routes: [{ net: '0.0.0.0', mask: '0.0.0.0', via: '10.0.0.1' }] },
      { id: 13, model: '2960-24TT', name: 'SW-C', x: -2, z: 10 },
      { id: 14, model: '3702i', name: 'AP-Library', wifi: { ssid: 'Library', key: 'library123' }, x: 2, z: 13 },
      { id: 15, model: 'PC-PT', name: 'PC-C1', ifaces: [IF('Fa0', '192.168.30.11')], gw: '192.168.30.1', dns: '192.168.10.10', x: -5, z: 15.5 },
      { id: 16, model: 'Laptop-PT', name: 'NB-C1', ifaces: [{ name: 'Wireless0', ip: '192.168.30.21', mask: M24, ssid: 'Library', key: 'library123' }], gw: '192.168.30.1', dns: '192.168.10.10', x: 3, z: 16 },
      { id: 17, model: 'Laptop-PT', name: 'NB-C2', ifaces: [{ name: 'Wireless0', ip: '192.168.30.22', mask: M24, ssid: 'Library', key: 'library123' }], gw: '192.168.30.1', dns: '192.168.10.10', x: 6, z: 15 }
    ],
    links: [[1, 2, 'straight'], [1, 3, 'straight'], [4, 2], [5, 2], [3, 6, 'fiber'], [3, 12, 'fiber'],
      [6, 7, 'straight'], [8, 7], [9, 7], [10, 7], [11, 7], [12, 13, 'straight'], [14, 13], [15, 13]]
  }
};
async function loadBigTemplate(key) {
  const t = BIG_TEMPLATES[key];
  if (!t || pumping) return;
  const ok = await UI.confirm({ title: `โหลดตัวอย่าง "${t.title}"?`, message: 'อุปกรณ์และสายในห้องตอนนี้จะถูกแทนที่ด้วยเครือข่ายตัวอย่าง (ถ้าต้องการเก็บงานเดิม ให้กด "ส่งออกไฟล์" ก่อน)', confirmText: 'โหลดตัวอย่าง' });
  if (!ok) return;
  if (activity) stopActivity();
  if (viewMode === '360') switchViewMode('3d');
  currentZone = null;
  loadTemplateData({ room: t.room, devices: JSON.parse(JSON.stringify(t.devices)), links: t.links.map(x => x.slice()) });
  lastSiteKey = t.room;
  clearEventList();
  selectDevice3D(null);
  refreshAll();
  reset3DCamera();
  persist();
  logConsole(`[TEMPLATE] โหลด "${t.title}" แล้ว (${net.devices.size} อุปกรณ์ · ${net.links.size} สาย)`, 'info');
  $('infoModalTitle').textContent = t.title;
  // เนื้อหาเป็นข้อความคงที่ในไฟล์นี้ (ไม่ได้มาจากผู้ใช้) จึงใส่เป็น HTML ได้
  $('infoModalBody').innerHTML = `<ol>${t.steps.map(x => `<li>${x}</li>`).join('')}</ol>`;
  $('infoModal').classList.add('active');
}

function templateData(model) {
  const t = TEMPLATES[model] || TEMPLATES.network;
  return { room: t.room, devices: JSON.parse(JSON.stringify(t.devices)), links: t.links.map(l => l.slice()) };
}
function loadTemplateData(t) {
  $('roomSizeSelect').value = t.room;
  net = NetSim.Network.load({ devices: t.devices, links: t.links.map(([a, b, cable]) => ({ a, b, cable })) });
  populateScene();
}
function applyTemplate(model) {
  loadTemplateData(templateData(model));
  logConsole(`[TEMPLATE] โหลดอุปกรณ์ตัวอย่างของบทเรียนแล้ว (${net.devices.size} อุปกรณ์) — กด “บทเรียน” เพื่อดูขั้นตอน`, 'info');
}

/* ==========================================================================
   ภารกิจตรวจคะแนนอัตโนมัติ (Activity) — ข้อมูลภารกิจอยู่ใน activities.js
   ========================================================================== */
let activity = null;          // { lab, startedAt, flags:[], completedAt, submitted }
let activityKey = '';
let activityResult = null;    // { passed:[bool], percent }

function setFlag(name) {
  if (!activity || activity.flags.includes(name)) return;
  activity.flags.push(name);
  activityKey = '';
  checkActivity();
}

function startActivity(silent) {
  const act = SimActivities.ACTIVITIES[MODEL];
  if (!act) return;
  if (pumping) return showToast('กำลังจำลองอยู่ รอให้จบก่อน', true);
  const t = templateData(MODEL);
  act.start(t);
  if (viewMode === '360') switchViewMode('3d');
  loadTemplateData(t);
  selectDevice3D(null);
  clearEventList();
  activity = { lab: MODEL, startedAt: Date.now(), flags: [], completedAt: null, submitted: false };
  activityKey = '';
  activityResult = null;
  reset3DCamera();
  refreshAll();
  checkActivity();
  switchTab('task');
  persist();
  logConsole(`[ภารกิจ] เริ่ม "${act.title}" — ${act.intro}`, 'info');
  if (!silent) showToast('เริ่มภารกิจแล้ว — ทำตามรายการในแท็บภารกิจ ระบบจะตรวจให้อัตโนมัติ');
}

function stopActivity() {
  activity = null;
  activityResult = null;
  activityKey = '';
  renderTaskPanel();
  updateTaskPill();
  persist();
}

// ตัวช่วยตรวจงาน: ping / เว็บ ทดสอบในเครือข่ายสำเนา จึงไม่กระทบสิ่งที่กำลังเล่นอยู่
function makeCheckCtx() {
  let clone = null;
  const getClone = () => clone || (clone = NetSim.Network.load(JSON.parse(JSON.stringify(net.serialize()))));
  const C = {
    net,
    dev: id => net.devices.get(id) || { ifaces: [], ports: [], modules: [], routes: [], services: { dhcp: {}, http: {} } },
    iface: (id, name) => { const d = net.devices.get(id); return d ? d.ifaces.find(f => f.name === name) : null; },
    ip: id => { const d = net.devices.get(id); return d ? net.primaryIp(d) : ''; },
    countIp: ip => [...net.devices.values()].reduce((n, d) => n + d.ifaces.filter(f => f.ip === ip).length, 0),
    link: (a, b, pred) => [...net.links.values()].find(l => ((l.a.dev === a && l.b.dev === b) || (l.a.dev === b && l.b.dev === a)) && (!pred || pred(l))) || null,
    up: (a, b, cable) => { const l = C.link(a, b, x => !cable || x.cable === cable); return !!l && l.up; },
    inNet: (ip, network, mask) => NetSim.isIp(ip || '') && NetSim.sameNet(ip, network, mask || '255.255.255.0'),
    ping: (from, to) => {
      if (!NetSim.isIp(to || '')) return false;
      const c = getClone();
      if (!c.devices.get(from)) return false;
      let ok = false;
      c.ping(from, to, 1, () => {}, r => { ok = r.ok; });
      c.run(6000);
      return ok;
    },
    web: (from, url) => {
      const c = getClone();
      if (!c.devices.get(from)) return false;
      let ok = false;
      c.browse(from, url, () => {}, r => { ok = r.ok; });
      c.run(8000);
      return ok;
    },
    flag: name => !!activity && activity.flags.includes(name)
  };
  return C;
}

function checkActivity(force) {
  if (!activity) { updateTaskPill(); return; }
  const act = SimActivities.ACTIVITIES[activity.lab];
  if (!act) return;
  const key = JSON.stringify(net.serialize()) + '|' + activity.flags.join(',');
  if (!force && key === activityKey && activityResult) return;
  activityKey = key;
  const ctx = makeCheckCtx();
  const passed = act.tasks.map(t => { try { return !!t.check(ctx); } catch (e) { return false; } });
  const prev = activityResult ? activityResult.passed : null;
  const percent = Math.round(passed.filter(Boolean).length * 100 / passed.length);
  activityResult = { passed, percent };
  justDone.clear();
  if (prev) {
    passed.forEach((ok, i) => {
      if (ok && !prev[i]) justDone.add(i);
      if (ok && !prev[i]) { logConsole(`[ภารกิจ ✓] ${act.tasks[i].title}`, 'ok'); showToast(`✓ สำเร็จ: ${act.tasks[i].title}`); }
      if (!ok && prev[i]) logConsole(`[ภารกิจ ✗] ข้อที่ทำไว้ไม่ผ่านแล้ว: ${act.tasks[i].title}`, 'warn');
    });
  }
  if (percent === 100 && !activity.completedAt) {
    activity.completedAt = Date.now();
    const time = formatDuration(activity.completedAt - activity.startedAt);
    logConsole(`[ภารกิจ] 🎉 ทำครบทุกข้อ 100% ใช้เวลา ${time}`, 'ok');
    showToast(`ภารกิจสำเร็จ 100% ใช้เวลา ${time}`, 'ok');
    celebrateNetwork();
    saveReport('ผ่าน', { score: '100%', time, activity: act.title });
    activity.submitted = true;
    persist();
    const badges = ['lab_clear'];
    if (!activity.hintUsed) badges.push('no_hint');
    if (activity.completedAt - activity.startedAt < 5 * 60000) badges.push('speedrun');
    award({ xp: activity.hintUsed ? 100 : 150, reason: `ภารกิจสำเร็จ: ${act.title}`, once: 'lab-done-' + activity.lab, badges, labDone: activity.lab });
  }
  renderTaskPanel();
  updateTaskPill();
}

function submitActivity() {
  if (!activity || !activityResult) return;
  checkActivity(true);
  const act = SimActivities.ACTIVITIES[activity.lab];
  const p = activityResult.percent;
  const time = formatDuration((activity.completedAt || Date.now()) - activity.startedAt);
  saveReport(p === 100 ? 'ผ่าน' : (p >= 50 ? 'มีคำเตือน' : 'ไม่ผ่าน'), { score: `${p}%`, time, activity: act.title });
  activity.submitted = true;
  persist();
  showToast(`ส่งงานแล้ว: คะแนน ${p}% — ดูได้ที่หน้าหลัก เมนู "รายงานและผลทดสอบ"`);
  renderTaskPanel();
}

function formatDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return m ? `${m} นาที ${s % 60} วินาที` : `${s} วินาที`;
}

function updateTaskPill() {
  const pill = $('taskPill');
  if (!activity || !activityResult) { pill.hidden = true; return; }
  const n = activityResult.passed.filter(Boolean).length;
  pill.hidden = false;
  pill.textContent = `🏁 ภารกิจ ${n}/${activityResult.passed.length} · ${activityResult.percent}%`;
  pill.classList.toggle('done', activityResult.percent === 100);
}

const openHints = new Set();
const justDone = new Set();
function renderTaskPanel() {
  const box = $('taskPanel');
  if (!box) return;
  box.innerHTML = '';
  const act = SimActivities.ACTIVITIES[MODEL];
  if (!act) { box.append(h('div', { class: 'empty-note', text: 'บทเรียนนี้ยังไม่มีภารกิจ' })); return; }
  if (!activity) {
    box.append(
      h('div', { class: 'task-intro' },
        h('div', { class: 'task-title' }, icon('fa-flag-checkered'), act.title),
        h('p', { text: act.intro }),
        h('ol', { class: 'task-preview' }, act.tasks.map(t => h('li', { text: t.title }))),
        h('p', { class: 'hint', text: 'เมื่อเริ่มภารกิจ ห้องจะถูกรีเซ็ตเป็นสถานะเริ่มต้นของโจทย์ ระบบจะตรวจงานให้อัตโนมัติทุกครั้งที่คุณแก้ไข และให้คะแนนเป็นเปอร์เซ็นต์ (เหมือน Activity Wizard ของ Packet Tracer)' }),
        h('button', { class: 'btn btn-primary', onclick: () => startActivity() }, icon('fa-play'), ` เริ่มภารกิจ (${act.tasks.length} ข้อ)`)));
    return;
  }
  const res = activityResult || { passed: act.tasks.map(() => false), percent: 0 };
  const done = res.passed.filter(Boolean).length;
  const elapsed = formatDuration((activity.completedAt || Date.now()) - activity.startedAt);
  box.append(
    h('div', { class: 'task-head' },
      h('div', { class: 'task-title' }, icon('fa-flag-checkered'), act.title),
      h('div', { class: 'task-progress' }, h('div', { class: 'bar', style: `width:${res.percent}%` })),
      h('div', { class: 'task-stats' }, h('b', { text: `${res.percent}%` }), h('span', { text: `ทำได้ ${done}/${res.passed.length} ข้อ` }), h('span', { text: `⏱ ${elapsed}` }))),
);
  if (activity.completedAt) box.append(h('div', { class: 'task-done' }, '🎉 ภารกิจสำเร็จครบทุกข้อ! ', h('small', { text: 'ผลถูกบันทึกในหน้ารายงานแล้ว ลองเปลี่ยนค่าเพื่อดูว่าข้อไหนจะไม่ผ่าน' })));
  const list = h('div', { class: 'task-list' });
  act.tasks.forEach((t, i) => {
    const ok = res.passed[i];
    const hintOpen = openHints.has(i);
    list.append(h('div', { class: 'task-item' + (ok ? ' ok' : '') + (ok && justDone.has(i) ? ' just-done' : '') },
      h('span', { class: 'task-check' }, icon(ok ? 'fa-circle-check' : 'fa-circle')),
      h('div', { class: 'task-body' },
        h('div', { text: `${i + 1}. ${t.title}` }),
        hintOpen ? h('div', { class: 'task-hint', text: '💡 ' + t.hint }) : null),
      ok ? null : h('button', { class: 'mini-btn', title: 'ดูคำใบ้', onclick: () => { if (!hintOpen) activity.hintUsed = true; hintOpen ? openHints.delete(i) : openHints.add(i); renderTaskPanel(); } }, icon('fa-lightbulb'))));
  });
  box.append(list);
  box.append(h('div', { class: 'task-actions' },
    h('button', { class: 'btn', onclick: () => { checkActivity(true); showToast(`ตรวจแล้ว: ${activityResult.percent}%`); } }, icon('fa-rotate'), ' ตรวจตอนนี้'),
    h('button', { class: 'btn btn-success', onclick: submitActivity }, icon('fa-paper-plane'), ' ส่งงาน'),
    h('button', { class: 'btn', onclick: () => startActivity() }, icon('fa-rotate-left'), ' เริ่มใหม่'),
    h('button', { class: 'btn', onclick: stopActivity, title: 'ออกจากโหมดภารกิจ (ห้องยังอยู่เหมือนเดิม)' }, icon('fa-xmark'), ' ออก')));
  box.append(h('p', { class: 'hint', text: 'ข้อที่ต้องทดสอบ ping / เปิดเว็บ ระบบจะทดสอบในเครือข่ายสำเนาให้เอง แต่ถ้ายังไม่มี IP จาก DHCP ต้องกดรันระบบหรือขอ IP ก่อน' }));
}

/* ==========================================================================
   ส่งออก / นำเข้าไฟล์โปรเจกต์ (.json)
   ========================================================================== */
function projectPayload() {
  nodes.forEach((_, id) => syncDevicePos(id));
  return {
    app: 'SimuCore 3D', version: 4, lab: MODEL, projectName: projectName(),
    room: { size: $('roomSizeSelect').value, floor: $('floorTextureSelect').value },
    net: net.serialize(), activity,
    exportedAt: new Date().toLocaleString('th-TH')
  };
}

function exportProject() {
  const data = JSON.stringify(projectPayload(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  const safe = projectName().replace(/[\\/:*?"<>|]+/g, '').trim() || 'simucore';
  a.href = URL.createObjectURL(blob);
  a.download = `${safe}.simucore.json`;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  logConsole(`[EXPORT] ส่งออกไฟล์ ${a.download} (${net.devices.size} อุปกรณ์)`, 'ok');
}

function importProject(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (pumping) return showToast('กำลังจำลองอยู่ รอให้จบก่อน', true);
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !data.net || !Array.isArray(data.net.devices)) throw new Error('ไม่ใช่ไฟล์ของ SimuCore');
      loadProjectData(data);
      logConsole(`[IMPORT] เปิดไฟล์ ${file.name} แล้ว (${net.devices.size} อุปกรณ์)`, 'ok');
      showToast(`นำเข้า ${file.name} แล้ว`);
    } catch (e) {
      logConsole(`[IMPORT] เปิดไฟล์ไม่ได้: ${e.message}`, 'err');
      showToast('เปิดไฟล์ไม่ได้ — ไฟล์เสียหรือไม่ใช่ไฟล์ .json ของ SimuCore', true);
    }
  };
  reader.readAsText(file);
}

function loadProjectData(data) {
  if (data.room) {
    if (ROOMS[data.room.size]) $('roomSizeSelect').value = data.room.size;
    if (data.room.floor) $('floorTextureSelect').value = data.room.floor;
  }
  if (viewMode === '360') switchViewMode('3d');
  net = NetSim.Network.load(data.net);
  activity = data.activity && data.activity.lab === MODEL && SimActivities.ACTIVITIES[MODEL] ? data.activity : null;
  activityKey = ''; activityResult = null;
  populateScene();
  selectDevice3D(null);
  reset3DCamera();
  refreshAll();
  checkActivity(true);
  renderTaskPanel();
  persist();
}

/* ==========================================================================
   บันทึก / โหลด (แยกตามโครงการ) และกลับหน้าหลัก
   ========================================================================== */
function projectName() { return projectNameCache; }
async function loadProjectTitle() {
  if (PROJECT_ID) {
    try {
      const p = (await Store.projects.list()).find(x => String(x.id) === String(PROJECT_ID));
      if (p) projectNameCache = p.name;
    } catch (e) { /* ใช้ชื่อเริ่มต้น */ }
  } else {
    projectNameCache = 'ห้องทดลอง: ' + (TUTORIALS[MODEL] ? TUTORIALS[MODEL].title.replace(/^LAB \d+ — /, '') : MODEL);
  }
  $('projectTitle').textContent = projectNameCache;
  document.title = `${projectNameCache} | SimuCore 3D`;
}
// ประกายแสงบนแผงกระจกเลื่อนตามเมาส์
function initGlassSheen() {
  if (!GLASS || UI.reduced || !window.matchMedia('(hover: hover)').matches) return;
  document.querySelectorAll('.glass').forEach(el => el.addEventListener('pointermove', e => {
    const b = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - b.left}px`);
    el.style.setProperty('--my', `${e.clientY - b.top}px`);
  }));
}
function renderUserChip() {
  const u = Store.user();
  if (!u) return;
  const chip = $('wsAvatar');
  chip.textContent = (u.fullName || '?').trim().charAt(0).toUpperCase();
  chip.title = `${u.fullName} (${Store.ROLES[u.role]})`;
}

function persist() {
  if (window.LabPlus && LabPlus.suspendSave) return Promise.resolve(false);   // โหมดนักสืบ: ไม่บันทึกทับงานจริง
  try {
    nodes.forEach((_, id) => syncDevicePos(id));
    return Store.workspaces.save(WORKSPACE_KEY, {
      version: 5,
      room: { size: $('roomSizeSelect').value, floor: $('floorTextureSelect').value },
      net: net.serialize(),
      activity,
      updatedAt: new Date().toLocaleString('th-TH')
    }).then(() => true, e => { console.error('Save error:', e); showToast('บันทึกไม่สำเร็จ: ' + e.message, true); return false; });
  } catch (e) {
    console.error('Save error:', e);
    return Promise.resolve(false);
  }
}

async function fetchWorkspace() {
  try { return await Store.workspaces.load(WORKSPACE_KEY); } catch (e) { showToast('โหลดงานที่บันทึกไว้ไม่สำเร็จ: ' + e.message, true); return null; }
}
function applySaved(data) {
  try {
    if (!data || !data.net || !Array.isArray(data.net.devices)) return false;
    if (!PROJECT_ID && data.net.devices.length === 0) return false;
    if (data.room) {
      if (ROOMS[data.room.size]) $('roomSizeSelect').value = data.room.size;
      if (data.room.floor) $('floorTextureSelect').value = data.room.floor;
    }
    net = NetSim.Network.load(data.net);
    activity = data.activity && SimActivities.ACTIVITIES[data.activity.lab] ? data.activity : null;
    populateScene();
    logConsole(`[LOAD] เปิดงานที่บันทึกไว้เมื่อ ${data.updatedAt || '-'} (${net.devices.size} อุปกรณ์)`, 'info');
    return true;
  } catch (e) {
    console.error('Load error:', e);
    return false;
  }
}

async function saveWorkspaceData() {
  if (await persist()) {
    logConsole('[SUCCESS] บันทึกห้อง ตำแหน่งอุปกรณ์ และการตั้งค่าเครือข่ายแล้ว', 'ok');
    showToast('บันทึกงานแล้ว', 'ok');
  } else logConsole('[ERROR] บันทึกงานไม่สำเร็จ', 'err');
}

async function returnToHome() {
  UI.loader.show('กำลังกลับหน้าหลัก', ['บันทึกงานล่าสุด', 'เปิดหน้าหลัก']);
  await persist();
  UI.loader.step(1);
  setTimeout(() => { window.location.href = 'index.html'; }, UI.reduced ? 0 : 250);
}

window.addEventListener('pageshow', event => { if (event.persisted) UI.loader.hide(); });
window.addEventListener('keydown', event => {
  const typingNow = !!document.activeElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) || document.activeElement.isContentEditable);
  if (event.key === 'Escape' && dragId !== null) { cancelDrag(); return; }
  if (event.key === 'Escape' && window.CableEdit && CableEdit.active()) { CableEdit.deselect(); return; }
  if (!typingNow && window.CableEdit && CableEdit.active() && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); CableEdit.removePoint(); return; }
  if (!typingNow && viewMode === '3d' && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'e') { setEditMode(); return; }
  if (!typingNow && (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') { event.preventDefault(); undoMove(); return; }
  if (event.key === 'Escape') { closeBrowserSim(); closeInfoModal(); hideInfoCard(); closePortMenu(); if (cableTool) toggleCableTool(false); }
  const typing = !!document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if (event.key === 'Delete' && !typing && selectedId !== null) deleteSelectedDevice3D();
});

window.addEventListener('load', () => {
  if (!Store.session()) return;
  if (typeof THREE === 'undefined' || !THREE.OrbitControls || typeof NetSim === 'undefined') {
    UI.loader.show('กำลังเปิดห้องแล็บ', ['เตรียมเอนจิน 3D และเอนจินจำลองเครือข่าย']);
    UI.loader.fail('โหลดไลบรารี 3D (Three.js) ไม่สำเร็จ', 'ตรวจการเชื่อมต่ออินเทอร์เน็ต แล้วรีเฟรชหน้านี้อีกครั้ง');
    return;
  }
  init3D().catch(e => { console.error(e); UI.loader.fail('เปิดห้องแล็บไม่สำเร็จ', e.message); });
});
