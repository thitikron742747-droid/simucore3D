/* ==========================================================================
   SimuCore IoT Lab — ห้องจำลองระบบ IoT แบบ 3D มุมมองด้านบน
   ใช้ IoTSim (iot-engine.js) เป็นตัวจำลอง และ IoTLessons (iot-lessons.js) ตรวจภารกิจ
   ========================================================================== */
(function () {
  'use strict';

  /* ------------------------------- ตัวช่วย DOM ------------------------------- */
  const $ = id => document.getElementById(id);
  const PROPS = ['value', 'checked', 'disabled', 'selected', 'hidden', 'title', 'type', 'min', 'max', 'step', 'placeholder', 'maxLength'];
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (PROPS.includes(k)) e[k] = v;
      else e.setAttribute(k, v === true ? '' : v);
    });
    add(e, ...kids);
    return e;
  }
  function add(e, ...kids) { kids.flat(Infinity).forEach(c => { if (c !== null && c !== undefined && c !== false) e.append(c); }); return e; }
  const icon = n => h('i', { class: (/^fa-(regular|brands)/.test(n) ? '' : 'fa-solid ') + n, 'aria-hidden': 'true' });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const toast = (m, t, ms) => (window.UI ? UI.toast(m, t, ms) : console.log(m));

  const IoT = window.IoTSim, PARTS = IoT.PARTS;
  const params = new URLSearchParams(location.search);
  const LESSON = IoTLessons.get(params.get('lesson') || 'free');
  const KEY = 'iot-' + LESSON.id;
  const BOUNDS = { x: 6.2, z: 3.9 };

  let pr = new IoT.Project();
  let selected = null, tool = 'select', wireFrom = null;
  let running = false, timer = null, speedMs = 600;
  let passed = [], hints = new Set(), serial = [], allDone = false;
  let activeTab = 'lesson', leftTab = 'parts';

  /* =========================================================================
     ฉาก 3D
     ========================================================================= */
  const stage = $('stage'), canvas = $('iotCanvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  if (THREE.PCFSoftShadowMap) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
  camera.position.set(0, 15.5, 0.01);
  const controls = new THREE.OrbitControls(camera, canvas);
  controls.enableRotate = false;
  controls.enableDamping = true;
  controls.screenSpacePanning = true;
  controls.minDistance = 6;
  controls.maxDistance = 28;
  controls.maxPolarAngle = 1.15;
  if (THREE.MOUSE) controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  if (THREE.TOUCH) controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  let camGoal = null;

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(-4, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7 });
  scene.add(sun);

  function canvasTex(w, hgt, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = hgt;
    const g = c.getContext('2d');
    if (g) draw(g, w, hgt);
    const t = new THREE.CanvasTexture(c);
    if (THREE.sRGBEncoding) t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    return t;
  }
  function std(color, o) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55, metalness: 0.08 }, o || {})); }
  function mesh(geo, mat, o) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    if (o) { if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]); if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]); }
    return m;
  }
  const box = (w, hh, d, c, o, mo) => mesh(new THREE.BoxGeometry(w, hh, d), std(c, mo), o);
  const cyl = (rt, rb, hh, c, o, mo, seg) => mesh(new THREE.CylinderGeometry(rt, rb, hh, seg || 24), std(c, mo), o);

  // แผ่นรองโต๊ะทดลอง (มองจากด้านบน)
  const glowTex = canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  (function buildBench() {
    const W = 14, D = 9.2;
    const tex = canvasTex(1400, 920, (g, w, hh) => {
      g.fillStyle = '#123c3f'; g.fillRect(0, 0, w, hh);
      g.strokeStyle = 'rgba(160,255,240,0.08)'; g.lineWidth = 1;
      for (let x = 0; x <= w; x += 25) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hh); g.stroke(); }
      for (let y = 0; y <= hh; y += 25) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.strokeStyle = 'rgba(160,255,240,0.2)'; g.lineWidth = 2;
      for (let x = 0; x <= w; x += 100) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hh); g.stroke(); }
      for (let y = 0; y <= hh; y += 100) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.fillStyle = 'rgba(160,255,240,0.5)'; g.font = '600 18px "JetBrains Mono", monospace';
      for (let x = 100, i = 1; x < w; x += 100, i++) g.fillText(String(i * 10), x + 4, 20);
      g.fillStyle = 'rgba(160,255,240,0.28)'; g.font = '700 30px "Chakra Petch", sans-serif';
      g.fillText('SIMUCORE IoT BENCH', 30, hh - 30);
      g.strokeStyle = 'rgba(160,255,240,0.35)'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, hh - 16);
    });
    const mat = mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), { r: [-Math.PI / 2, 0, 0] });
    mat.castShadow = false;
    scene.add(mat);
    const table = mesh(new THREE.BoxGeometry(W + 1.6, 0.4, D + 1.6), std(0x3b2a1e, { roughness: 0.7 }), { p: [0, -0.21, 0] });
    table.castShadow = false;
    scene.add(table);
  })();

  /* ---------------------------- ป้ายชื่อ + ค่า ---------------------------- */
  function makeLabel() {
    const c = document.createElement('canvas');
    c.width = 320; c.height = 112;
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    sp.scale.set(2.05, 0.72, 1);
    sp.renderOrder = 10;
    sp.userData.canvas = c; sp.userData.key = '';
    return sp;
  }
  function drawLabel(sp, name, value, color) {
    const key = name + '|' + value + '|' + color;
    if (sp.userData.key === key) return;
    sp.userData.key = key;
    const c = sp.userData.canvas, g = c.getContext && c.getContext('2d');
    if (!g) return;
    g.clearRect(0, 0, c.width, c.height);
    g.font = '600 30px "Prompt", "IBM Plex Sans Thai", sans-serif';
    const w1 = g.measureText(name).width;
    g.font = '500 26px "IBM Plex Sans Thai", sans-serif';
    const w2 = value ? g.measureText(value).width : 0;
    const w = Math.min(c.width - 4, Math.max(w1, w2) + 34);
    const x = (c.width - w) / 2, hh = value ? 100 : 54;
    g.fillStyle = 'rgba(8,12,30,0.78)';
    roundRect(g, x, 4, w, hh, 18); g.fill();
    g.strokeStyle = color || 'rgba(255,255,255,0.25)'; g.lineWidth = 3; roundRect(g, x, 4, w, hh, 18); g.stroke();
    g.textAlign = 'center';
    g.fillStyle = '#f4f7ff'; g.font = '600 30px "Prompt", "IBM Plex Sans Thai", sans-serif';
    g.fillText(name, c.width / 2, 42);
    if (value) { g.fillStyle = color || '#a5b4fc'; g.font = '500 26px "IBM Plex Sans Thai", sans-serif'; g.fillText(value, c.width / 2, 84); }
    sp.material.map.needsUpdate = true;
  }
  function roundRect(g, x, y, w, hh, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r); g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function glowSprite(color, size) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    sp.scale.set(size, size, 1);
    return sp;
  }

  /* ---------------------------- บอร์ดและขา ---------------------------- */
  const BOARD_SIZE = { uno: [2.3, 1.55], esp32: [2.0, 1.15], pi: [2.5, 1.65] };
  function pinLocal(type, pin) {
    const [w, d] = BOARD_SIZE[type];
    const sp = PARTS[type];
    if (sp.pins.D.includes(pin)) {
      const i = sp.pins.D.indexOf(pin), n = sp.pins.D.length;
      return { x: -w / 2 + 0.32 + i * (w - 0.64) / (n - 1), z: -d / 2 + 0.13 };
    }
    const i = sp.pins.A.indexOf(pin), n = sp.pins.A.length;
    const span = Math.min(w * 0.5, (n - 1) * 0.3);
    return { x: w / 2 - 0.32 - span + (n > 1 ? i * span / (n - 1) : 0), z: d / 2 - 0.13 };
  }
  function boardTexture(p) {
    const [w, d] = BOARD_SIZE[p.type], s = 260;
    const col = { uno: '#0f6c8a', esp32: '#1e2430', pi: '#167a3d' }[p.type];
    return canvasTex(Math.round(w * s), Math.round(d * s), (g, W, H) => {
      const X = x => (x + w / 2) * s, Z = z => (z + d / 2) * s;
      g.fillStyle = col; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3; g.strokeRect(6, 6, W - 12, H - 12);
      // ลายวงจร
      g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 4;
      for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(40 + i * 50, H * 0.3); g.lineTo(60 + i * 50, H * 0.55); g.lineTo(60 + i * 50, H * 0.72); g.stroke(); }
      const strip = (pins, z, labelBelow) => {
        const xs = pins.map(pin => X(pinLocal(p.type, pin).x));
        g.fillStyle = '#0b0d12'; g.fillRect(xs[0] - 22, Z(z) - 20, xs[xs.length - 1] - xs[0] + 44, 40);
        pins.forEach((pin, i) => {
          g.fillStyle = '#e8c35a'; g.fillRect(xs[i] - 8, Z(z) - 8, 16, 16);
          g.fillStyle = '#ffffff'; g.font = '700 22px "JetBrains Mono", monospace'; g.textAlign = 'center';
          g.fillText(pin.replace('GPIO', 'G'), xs[i], labelBelow ? Z(z) + 46 : Z(z) - 28);
        });
      };
      strip(PARTS[p.type].pins.D, pinLocal(p.type, PARTS[p.type].pins.D[0]).z, true);
      strip(PARTS[p.type].pins.A, pinLocal(p.type, PARTS[p.type].pins.A[0]).z, false);
      g.textAlign = 'left'; g.fillStyle = 'rgba(255,255,255,0.92)'; g.font = '700 40px "Chakra Petch", sans-serif';
      const title = { uno: 'ARDUINO UNO', esp32: 'ESP32 DEVKIT', pi: 'RASPBERRY Pi' }[p.type];
      g.fillText(title, W * 0.3, H * 0.56);
      g.font = '500 24px "JetBrains Mono", monospace'; g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillText(p.type === 'pi' ? 'GPIO · 3.3V · Python' : (PARTS[p.type].wifi ? 'Wi-Fi 2.4GHz · 3.3V' : '5V · ATmega328P'), W * 0.3, H * 0.56 + 34);
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.font = '600 20px "JetBrains Mono", monospace';
      g.fillText('DIGITAL', 22, 30 + 40); g.textAlign = 'right'; g.fillText('ANALOG IN', W - 22, H - 52);
    });
  }

  /* ---------------------------- สร้างโมเดล 3D ---------------------------- */
  const views = new Map();
  const glowMat = c => std(c, { emissive: 0x000000, emissiveIntensity: 1 });

  function buildPart(p) {
    const g = new THREE.Group();
    g.userData.partId = p.id;
    const v = { group: g, p };
    const pcb = (w, d, c) => g.add(box(w, 0.06, d, c || 0x14532d, { p: [0, 0.03, 0] }));
    switch (p.type) {
      case 'uno': case 'esp32': case 'pi': {
        const [w, d] = BOARD_SIZE[p.type];
        const top = new THREE.MeshStandardMaterial({ map: boardTexture(p), roughness: 0.6 });
        const side = std({ uno: 0x0f6c8a, esp32: 0x1e2430, pi: 0x167a3d }[p.type]);
        const pcbm = mesh(new THREE.BoxGeometry(w, 0.08, d), [side, side, top, side, side, side], { p: [0, 0.04, 0] });
        g.add(pcbm);
        if (p.type === 'uno') {
          g.add(box(0.5, 0.28, 0.45, 0xb8bec8, { p: [-w / 2 + 0.2, 0.22, -0.05] }, { metalness: 0.7, roughness: 0.3 }));   // USB
          g.add(box(0.36, 0.3, 0.38, 0x111111, { p: [-w / 2 + 0.22, 0.23, 0.5] }));                                     // DC jack
          g.add(box(0.9, 0.12, 0.24, 0x16181d, { p: [0.45, 0.14, 0.25] }));                                              // MCU
        } else if (p.type === 'esp32') {
          g.add(box(0.75, 0.12, 0.6, 0xc7ccd4, { p: [w / 2 - 0.5, 0.14, 0] }, { metalness: 0.75, roughness: 0.25 }));   // ฝาครอบ RF
          g.add(box(0.3, 0.02, 0.6, 0xd4a03a, { p: [w / 2 - 0.08, 0.09, 0] }, { metalness: 0.6 }));                     // เสาอากาศลายวงจร
          g.add(box(0.28, 0.18, 0.3, 0xb8bec8, { p: [-w / 2 + 0.14, 0.17, 0] }, { metalness: 0.7, roughness: 0.3 }));
        } else {
          g.add(box(0.55, 0.42, 0.5, 0xc0c6cf, { p: [w / 2 - 0.3, 0.29, -0.3] }, { metalness: 0.7, roughness: 0.3 }));
          g.add(box(0.55, 0.42, 0.5, 0xc0c6cf, { p: [w / 2 - 0.3, 0.29, 0.32] }, { metalness: 0.7, roughness: 0.3 }));
          g.add(box(0.5, 0.06, 0.5, 0x9aa1ab, { p: [-0.1, 0.12, 0.15] }, { metalness: 0.6 }));
        }
        v.pwr = mesh(new THREE.SphereGeometry(0.05, 10, 8), glowMat(0x22c55e), { p: [-w / 2 + 0.6, 0.12, -d / 2 + 0.42] });
        v.pwr.material.emissive.setHex && v.pwr.material.emissive.setHex(0x22c55e);
        v.tx = mesh(new THREE.SphereGeometry(0.045, 10, 8), glowMat(0xfbbf24), { p: [-w / 2 + 0.78, 0.12, -d / 2 + 0.42] });
        g.add(v.pwr, v.tx);
        if (PARTS[p.type].wifi) { v.wifi = glowSprite(0x818cf8, 1.4); v.wifi.position.set(w / 2 - 0.3, 0.4, 0); g.add(v.wifi); }
        break;
      }
      case 'gateway': {
        g.add(box(1.2, 0.28, 0.75, 0xf1f5f9, { p: [0, 0.14, 0] }, { roughness: 0.35 }));
        [-0.42, 0.42].forEach(x => { const a = cyl(0.035, 0.05, 0.9, 0x1f2937, { p: [x, 0.62, -0.36], r: [-0.35, 0, x > 0 ? -0.2 : 0.2] }); g.add(a); });
        v.leds = [];
        for (let i = 0; i < 4; i++) { const l = mesh(new THREE.SphereGeometry(0.035, 8, 6), glowMat(0x818cf8), { p: [-0.3 + i * 0.2, 0.29, 0.33] }); v.leds.push(l); g.add(l); }
        const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 96, (c) => {
          c.fillStyle = '#c7d2fe';
          [[40, 58, 26], [68, 44, 30], [92, 60, 22]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); });
          c.fillRect(40, 58, 52, 24);
        }), transparent: true, depthWrite: false }));
        cloud.scale.set(0.9, 0.68, 1); cloud.position.set(0, 1.25, 0);
        g.add(cloud);
        v.glow = glowSprite(0x818cf8, 2.2); v.glow.position.set(0, 0.6, 0); g.add(v.glow);
        break;
      }
      case 'phone': {
        g.add(box(0.72, 0.08, 1.35, 0x0f172a, { p: [0, 0.04, 0] }, { roughness: 0.25, metalness: 0.4 }));
        v.screenCanvas = document.createElement('canvas');
        v.screenCanvas.width = 220; v.screenCanvas.height = 420;
        v.screenTex = new THREE.CanvasTexture(v.screenCanvas);
        v.screen = mesh(new THREE.PlaneGeometry(0.64, 1.24), new THREE.MeshBasicMaterial({ map: v.screenTex }), { p: [0, 0.085, 0], r: [-Math.PI / 2, 0, 0] });
        v.screen.castShadow = false;
        g.add(v.screen);
        v.glow = glowSprite(0xa78bfa, 2); v.glow.position.set(0, 0.4, 0); g.add(v.glow);
        break;
      }
      case 'motion': {
        pcb(0.7, 0.7);
        g.add(box(0.5, 0.06, 0.5, 0xf8fafc, { p: [0, 0.09, 0] }));
        g.add(mesh(new THREE.SphereGeometry(0.26, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), std(0xffffff, { roughness: 0.2, transparent: true, opacity: 0.92 }), { p: [0, 0.12, 0] }));
        v.led = mesh(new THREE.SphereGeometry(0.05, 10, 8), glowMat(0xef4444), { p: [0.28, 0.1, 0.28] }); g.add(v.led);
        // คนเดินผ่าน (ปรากฏตอนตรวจจับได้)
        v.person = new THREE.Group();
        v.person.add(cyl(0.16, 0.2, 0.7, 0x38bdf8, { p: [0, 0.35, 0] }), mesh(new THREE.SphereGeometry(0.15, 16, 12), std(0xfcd34d), { p: [0, 0.85, 0] }));
        v.person.position.set(-0.9, 0, -0.1); v.person.visible = false;
        g.add(v.person);
        break;
      }
      case 'smoke': {
        pcb(0.75, 0.6, 0x1d4ed8);
        g.add(cyl(0.25, 0.25, 0.22, 0xcbd5e1, { p: [0, 0.17, 0] }, { metalness: 0.6, roughness: 0.35 }));
        g.add(cyl(0.2, 0.2, 0.02, 0x64748b, { p: [0, 0.29, 0] }, { roughness: 0.9 }));
        v.led = mesh(new THREE.SphereGeometry(0.05, 10, 8), glowMat(0xef4444), { p: [0.3, 0.1, 0.22] }); g.add(v.led);
        v.puffs = [];
        for (let i = 0; i < 5; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9ca3af, transparent: true, depthWrite: false, opacity: 0 })); s.userData.k = i / 5; v.puffs.push(s); g.add(s); }
        break;
      }
      case 'temp': {
        pcb(0.6, 0.75, 0x0f766e);
        v.body = box(0.46, 0.2, 0.56, 0xf8fafc, { p: [0, 0.16, 0] });
        g.add(v.body);
        for (let i = 0; i < 4; i++) g.add(box(0.34, 0.02, 0.04, 0x94a3b8, { p: [0, 0.27, -0.18 + i * 0.12] }));
        v.led = mesh(new THREE.SphereGeometry(0.06, 10, 8), glowMat(0x38bdf8), { p: [0.22, 0.1, 0.32] }); g.add(v.led);
        break;
      }
      case 'light': {
        pcb(0.6, 0.55, 0x1e3a8a);
        g.add(cyl(0.12, 0.12, 0.08, 0xf97316, { p: [0, 0.1, -0.08] }));
        g.add(box(0.16, 0.05, 0.12, 0x334155, { p: [0.12, 0.08, 0.15] }));
        v.led = mesh(new THREE.SphereGeometry(0.045, 10, 8), glowMat(0xfde047), { p: [-0.2, 0.09, 0.18] }); g.add(v.led);
        break;
      }
      case 'soil': {
        g.add(cyl(0.55, 0.42, 0.42, 0xb45309, { p: [0, 0.21, 0] }, { roughness: 0.8 }));
        v.dirt = cyl(0.5, 0.5, 0.03, 0x5b3a1e, { p: [0, 0.42, 0] }, { roughness: 1 });
        g.add(v.dirt);
        g.add(box(0.05, 0.4, 0.04, 0xd4a03a, { p: [0.18, 0.5, 0.05] }, { metalness: 0.6 }), box(0.05, 0.4, 0.04, 0xd4a03a, { p: [0.28, 0.5, 0.05] }, { metalness: 0.6 }));
        g.add(box(0.24, 0.05, 0.16, 0x1d4ed8, { p: [0.23, 0.72, 0.05] }));
        for (let i = 0; i < 5; i++) { const a = i * 1.26; g.add(mesh(new THREE.SphereGeometry(0.15, 10, 8), std(0x22c55e), { p: [-0.12 + Math.cos(a) * 0.16, 0.6, -0.08 + Math.sin(a) * 0.16] })); }
        break;
      }
      case 'button': {
        g.add(box(0.5, 0.14, 0.5, 0x111827, { p: [0, 0.07, 0] }));
        v.cap = cyl(0.17, 0.17, 0.12, 0xef4444, { p: [0, 0.2, 0] }, { roughness: 0.3 });
        g.add(v.cap);
        break;
      }
      case 'door': {
        g.add(box(0.12, 0.5, 1.5, 0x94a3b8, { p: [-0.1, 0.25, 0] }));        // วงกบ
        v.hinge = new THREE.Group(); v.hinge.position.set(0, 0, -0.7);
        v.hinge.add(box(0.08, 0.46, 1.38, 0x92400e, { p: [0.04, 0.23, 0.69] }, { roughness: 0.6 }));
        v.hinge.add(box(0.06, 0.06, 0.18, 0xffffff, { p: [0.1, 0.36, 1.25] }));
        g.add(v.hinge);
        g.add(box(0.1, 0.08, 0.2, 0xffffff, { p: [-0.02, 0.4, 0.58] }));
        break;
      }
      case 'rfid': {
        g.add(box(0.75, 0.05, 0.75, 0x1d4ed8, { p: [0, 0.025, 0] }));
        const coil = mesh(new THREE.TorusGeometry(0.24, 0.025, 8, 40), std(0xd4a03a, { metalness: 0.6 }), { p: [0, 0.07, -0.03], r: [Math.PI / 2, 0, 0] });
        g.add(coil);
        g.add(box(0.2, 0.05, 0.14, 0x111827, { p: [0.2, 0.08, 0.27] }));
        v.card = box(0.55, 0.03, 0.36, 0xf8fafc, { p: [0, 0.45, 0] });
        v.card.visible = false;
        g.add(v.card);
        break;
      }
      case 'led': {
        g.add(box(0.36, 0.06, 0.36, 0x111827, { p: [0, 0.03, 0] }));
        v.bulb = cyl(0.12, 0.12, 0.2, 0x22c55e, { p: [0, 0.16, 0] }, { transparent: true, opacity: 0.85, emissive: 0x000000 });
        v.dome = mesh(new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(0x22c55e, { transparent: true, opacity: 0.85, emissive: 0x000000 }), { p: [0, 0.26, 0] });
        g.add(v.bulb, v.dome);
        v.glow = glowSprite(0x22c55e, 1.6); v.glow.position.set(0, 0.35, 0); g.add(v.glow);
        break;
      }
      case 'lamp': {
        g.add(cyl(0.3, 0.34, 0.08, 0x334155, { p: [0, 0.04, 0] }, { metalness: 0.5 }));
        g.add(cyl(0.035, 0.035, 0.6, 0x94a3b8, { p: [0, 0.38, 0] }, { metalness: 0.6 }));
        g.add(cyl(0.22, 0.42, 0.32, 0xfef3c7, { p: [0, 0.78, 0] }, { transparent: true, opacity: 0.88, side: THREE.DoubleSide }));
        v.bulb = mesh(new THREE.SphereGeometry(0.13, 16, 12), std(0xfffbeb, { emissive: 0x000000 }), { p: [0, 0.72, 0] });
        g.add(v.bulb);
        v.glow = glowSprite(0xfbbf24, 4.2); v.glow.position.set(0, 0.9, 0); g.add(v.glow);
        v.light = new THREE.PointLight(0xffd27a, 0, 5.5); v.light.position.set(0, 1.1, 0); g.add(v.light);
        break;
      }
      case 'fan': {
        g.add(cyl(0.34, 0.38, 0.08, 0x1e293b, { p: [0, 0.04, 0] }));
        g.add(cyl(0.05, 0.05, 0.5, 0x94a3b8, { p: [0, 0.3, 0] }, { metalness: 0.6 }));
        v.rotor = new THREE.Group(); v.rotor.position.set(0, 0.58, 0);
        v.rotor.add(cyl(0.1, 0.1, 0.1, 0x38bdf8));
        for (let i = 0; i < 3; i++) { const b = box(0.62, 0.02, 0.16, 0x7dd3fc, { p: [Math.cos(i * 2.094) * 0.36, 0, Math.sin(i * 2.094) * 0.36], r: [0.2, -i * 2.094, 0] }, { transparent: true, opacity: 0.92 }); v.rotor.add(b); }
        g.add(v.rotor);
        v.ring = mesh(new THREE.TorusGeometry(0.72, 0.02, 6, 48), std(0x94a3b8, { transparent: true, opacity: 0.55 }), { p: [0, 0.58, 0], r: [Math.PI / 2, 0, 0] });
        g.add(v.ring);
        v.spin = 0;
        break;
      }
      case 'buzzer': {
        pcb(0.55, 0.55, 0x111827);
        g.add(cyl(0.22, 0.22, 0.22, 0x0b0b0f, { p: [0, 0.17, 0] }));
        g.add(cyl(0.04, 0.04, 0.01, 0x334155, { p: [0, 0.29, 0] }));
        v.glow = glowSprite(0xf43f5e, 1.8); v.glow.position.set(0, 0.4, 0); g.add(v.glow);
        v.lastRing = 0;
        break;
      }
      case 'servo': {
        g.add(box(0.42, 0.06, 1.3, 0x94a3b8, { p: [-0.35, 0.03, 0] }));                   // แผ่นประตูยึดกลอน
        g.add(box(0.5, 0.3, 0.3, 0x2563eb, { p: [0.15, 0.15, -0.25] }));
        v.horn = new THREE.Group(); v.horn.position.set(0.15, 0.34, -0.25);
        v.horn.add(box(0.46, 0.04, 0.09, 0xf8fafc, { p: [0.15, 0, 0] }));
        g.add(v.horn);
        v.bolt = box(0.5, 0.12, 0.14, 0xd1d5db, { p: [-0.15, 0.12, 0.3] }, { metalness: 0.8, roughness: 0.25 });
        g.add(v.bolt);
        g.add(box(0.16, 0.2, 0.3, 0x475569, { p: [-0.5, 0.1, 0.3] }));
        break;
      }
      case 'pump': {
        g.add(cyl(0.25, 0.25, 0.45, 0x0ea5e9, { p: [0, 0.22, 0] }, { roughness: 0.35 }));
        g.add(cyl(0.05, 0.05, 0.7, 0x94a3b8, { p: [0.35, 0.42, 0], r: [0, 0, Math.PI / 2] }, { metalness: 0.6 }));
        g.add(cyl(0.12, 0.06, 0.12, 0x334155, { p: [0.72, 0.42, 0] }));
        v.lastRing = 0;
        break;
      }
    }
    v.label = makeLabel();
    const off = PARTS[p.type].kind === 'board' ? 1.25 : PARTS[p.type].kind === 'phone' ? 1.1 : 0.85;
    v.label.position.set(0, 1.2, off);
    g.add(v.label);
    v.sel = mesh(new THREE.RingGeometry(0.6, 0.68, 48), new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.95, side: THREE.DoubleSide }), { p: [0, 0.02, 0], r: [-Math.PI / 2, 0, 0] });
    v.sel.castShadow = false; v.sel.visible = false;
    const r = PARTS[p.type].kind === 'board' ? Math.max(...BOARD_SIZE[p.type]) * 0.62 : p.type === 'phone' ? 0.9 : 0.62;
    v.sel.scale.set(r / 0.62, r / 0.62, 1);
    g.add(v.sel);
    scene.add(g);
    views.set(p.id, v);
    return v;
  }

  /* -------------------------------- สาย -------------------------------- */
  const wires = new Map(), arcs = new Map();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  function partPos(p) { return V(p.x, 0, p.z); }
  function pinWorld(board, pin) { const l = pinLocal(board.type, pin); return V(board.x + l.x, 0.1, board.z + l.z); }
  function anchorOf(p, toward) {
    const d = V(toward.x - p.x, 0, toward.z - p.z);
    const len = Math.hypot(d.x, d.z) || 1;
    return V(p.x + d.x / len * 0.36, 0.12, p.z + d.z / len * 0.36);
  }
  function wireColor(p) { return PARTS[p.type].kind === 'actuator' ? 0x38bdf8 : PARTS[p.type].signal === 'analog' ? 0xfb923c : 0xfacc15; }
  function disposeObj(o) {
    if (!o) return;
    scene.remove(o);
    o.traverse && o.traverse(c => {
      if (c.geometry) c.geometry.dispose();
      [].concat(c.material || []).forEach(m => { if (m.map && m.map !== glowTex) m.map.dispose(); if (m.dispose) m.dispose(); });
    });
  }
  function buildWire(p) {
    disposeObj(wires.get(p.id) && wires.get(p.id).obj);
    wires.delete(p.id);
    if (!p.link) return;
    const b = pr.parts.get(p.link.board);
    const end = pinWorld(b, p.link.pin), start = anchorOf(p, end);
    const mid1 = start.clone().lerp(end, 0.3), mid2 = start.clone().lerp(end, 0.72);
    mid1.y = 0.55; mid2.y = 0.5;
    const curve = new THREE.CatmullRomCurve3([start, mid1, mid2, V(end.x, 0.35, end.z), end]);
    const color = wireColor(p);
    const obj = new THREE.Group();
    obj.add(mesh(new THREE.TubeGeometry(curve, 40, 0.032, 6, false), std(color, { roughness: 0.4 })));
    obj.add(mesh(new THREE.BoxGeometry(0.1, 0.16, 0.1), std(0x111827), { p: [end.x, 0.15, end.z] }));
    scene.add(obj);
    wires.set(p.id, { obj, curve, color });
  }
  function arcCurve(a, b, lift) {
    const s = V(a.x, 0.35, a.z), e = V(b.x, 0.45, b.z);
    const m = s.clone().lerp(e, 0.5); m.y = lift;
    return new THREE.CatmullRomCurve3([s, V(s.x + (m.x - s.x) * 0.5, lift * 0.75, s.z + (m.z - s.z) * 0.5), m, V(e.x + (m.x - e.x) * 0.5, lift * 0.75, e.z + (m.z - e.z) * 0.5), e]);
  }
  function buildArcs() {
    arcs.forEach(a => disposeObj(a.obj));
    arcs.clear();
    const gw = [...pr.parts.values()].find(p => p.type === 'gateway');
    if (!gw) return;
    const mk = (key, from, to, color) => {
      const curve = arcCurve(from, to, 2.2);
      const obj = mesh(new THREE.TubeGeometry(curve, 48, 0.022, 5, false), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 }));
      obj.castShadow = false;
      scene.add(obj);
      arcs.set(key, { obj, curve });
    };
    pr.boards().filter(b => b.cloud).forEach(b => mk('b' + b.id, b, gw, 0xa78bfa));
    const ph = [...pr.parts.values()].find(p => p.type === 'phone');
    if (ph) mk('phone', gw, ph, 0xc4b5fd);
  }

  /* ----------------------------- แพ็กเก็ตวิ่ง ----------------------------- */
  const pulses = [], rings = [];
  function pulse(curve, color, reverse, dur, onDone) {
    if (!curve) { if (onDone) onDone(); return; }
    const m = mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshBasicMaterial({ color }));
    m.castShadow = false;
    const gl = glowSprite(color, 0.9); gl.material.opacity = 0.9;
    m.add(gl);
    scene.add(m);
    pulses.push({ curve, m, t: 0, dur: (dur || 0.55) * (window.UI && UI.reduced ? 0.4 : 1), reverse, onDone });
  }
  function ring(x, z, color, y, maxR) {
    const m = mesh(new THREE.RingGeometry(0.2, 0.26, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide }), { p: [x, y || 0.1, z], r: [-Math.PI / 2, 0, 0] });
    m.castShadow = false;
    scene.add(m);
    rings.push({ m, t: 0, max: maxR || 2.2 });
  }

  /* ----------------------------- ซิงก์ฉาก ----------------------------- */
  function syncScene() {
    views.forEach((v, id) => { if (!pr.parts.has(id)) { disposeObj(v.group); views.delete(id); } });
    pr.parts.forEach(p => { const v = views.get(p.id) || buildPart(p); v.group.position.set(p.x, 0, p.z); });
    wires.forEach((w, id) => { if (!pr.parts.has(id)) { disposeObj(w.obj); wires.delete(id); } });
    pr.parts.forEach(p => { if (PARTS[p.type].kind === 'sensor' || PARTS[p.type].kind === 'actuator') buildWire(p); });
    buildArcs();
    refreshVisuals();
  }
  function moveVisual(p) {
    const v = views.get(p.id);
    if (v) v.group.position.set(p.x, 0, p.z);
    if (PARTS[p.type].kind === 'board') pr.partsOf(p.id).forEach(buildWire);
    else if (p.link) buildWire(p);
    if (PARTS[p.type].kind === 'board' || p.type === 'gateway' || p.type === 'phone') buildArcs();
  }
  function valueColor(p, val) {
    const k = PARTS[p.type].kind;
    if (val === null || val === undefined) return '#94a3b8';
    if (k === 'sensor') return PARTS[p.type].signal === 'analog' ? '#fdba74' : (val ? '#fde047' : '#a5b4fc');
    if (k === 'actuator') return val ? '#4ade80' : '#94a3b8';
    return '#a5b4fc';
  }
  function labelValue(p) {
    const k = PARTS[p.type].kind;
    if (k === 'sensor' || k === 'actuator') {
      const val = p.link ? (k === 'sensor' ? pr.read(p) : pr.state.get(p.id)) : null;
      return { text: (p.link ? p.link.pin + ' · ' : '') + pr.text(p, val), color: valueColor(p, val) };
    }
    if (k === 'board') return { text: PARTS[p.type].wifi ? (p.cloud ? (pr.hasCloud() ? 'ออนไลน์ · Cloud' : 'รอ Gateway') : 'Wi-Fi ปิด') : 'ไม่มี Wi-Fi', color: p.cloud && pr.hasCloud() ? '#c4b5fd' : '#94a3b8' };
    if (k === 'gateway') { const n = pr.boards().filter(b => b.cloud).length; return { text: `บอร์ดออนไลน์ ${n}`, color: '#c4b5fd' }; }
    return { text: pr.hasCloud() ? 'แอป IoT เชื่อมแล้ว' : 'ยังไม่มี Cloud', color: pr.hasCloud() ? '#c4b5fd' : '#94a3b8' };
  }
  function setEmissive(m, hex, on) { if (m && m.material && m.material.emissive && m.material.emissive.setHex) m.material.emissive.setHex(on ? hex : 0x000000); }
  function refreshVisuals() {
    pr.parts.forEach(p => {
      const v = views.get(p.id);
      if (!v) return;
      const lv = labelValue(p);
      drawLabel(v.label, p.name, lv.text, lv.color);
      v.sel.visible = selected === p.id || wireFrom === p.id;
      if (v.sel.material.color.setHex) v.sel.material.color.setHex(wireFrom === p.id ? 0xfbbf24 : 0x22d3ee);
      const on = PARTS[p.type].kind === 'sensor' ? (p.link ? pr.read(p) : 0) : pr.state.get(p.id);
      switch (p.type) {
        case 'motion': setEmissive(v.led, 0xef4444, on); v.person.visible = !!on; break;
        case 'smoke': setEmissive(v.led, 0xef4444, on); break;
        case 'door': v.hinge.rotation.y = pr.env.door ? -1.1 : 0; break;
        case 'button': v.cap.position.y = on ? 0.15 : 0.2; break;
        case 'rfid': v.card.visible = !!on; break;
        case 'temp': { const t = clamp(pr.env.temp / 50, 0, 1); setEmissive(v.led, t > 0.62 ? 0xef4444 : t > 0.4 ? 0xfbbf24 : 0x38bdf8, true); break; }
        case 'light': setEmissive(v.led, 0xfde047, pr.env.light > 50); break;
        case 'soil': { const k = clamp(pr.env.soil / 100, 0, 1); if (v.dirt.material.color.setRGB) v.dirt.material.color.setRGB(0.66 - k * 0.42, 0.5 - k * 0.36, 0.3 - k * 0.22); break; }
        case 'led': setEmissive(v.bulb, 0x22c55e, on); setEmissive(v.dome, 0x22c55e, on); v.glow.material.opacity = on ? 0.9 : 0; break;
        case 'lamp': setEmissive(v.bulb, 0xfbbf24, on); v.glow.material.opacity = on ? 0.85 : 0; v.light.intensity = on ? 1.6 : 0; break;
        case 'buzzer': v.glow.material.opacity = on ? 0.8 : 0; break;
        case 'servo': v.horn.rotation.y = on ? -Math.PI / 2 : 0; v.bolt.position.x = on ? 0.15 : -0.15; break;
        case 'uno': case 'esp32': case 'pi': if (v.wifi) v.wifi.material.opacity = p.cloud && pr.hasCloud() ? 0.55 : 0; break;
        case 'gateway': v.leds.forEach(l => setEmissive(l, 0x818cf8, true)); break;
        case 'phone': drawPhoneScreen(v); break;
      }
    });
    // ความสว่างของห้องตามค่าแสง (ถ้ามีเซนเซอร์แสง)
    const hasLight = [...pr.parts.values()].some(p => p.type === 'light');
    const k = hasLight ? clamp(pr.env.light / 100, 0, 1) : 0.75;
    ambient.intensity = 0.22 + k * 0.45;
    sun.intensity = 0.25 + k * 0.75;
  }
  function drawPhoneScreen(v) {
    const c = v.screenCanvas, g = c.getContext && c.getContext('2d');
    if (!g) return;
    const ok = pr.hasCloud();
    const key = JSON.stringify([ok, pr.notifications.length, [...pr.state.entries()]]);
    if (v.screenKey === key) return;
    v.screenKey = key;
    const grd = g.createLinearGradient(0, 0, 0, c.height);
    grd.addColorStop(0, '#1e1b4b'); grd.addColorStop(1, '#0f172a');
    g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#e0e7ff'; g.font = '600 22px "Prompt", sans-serif'; g.fillText('SimuCore Home', 18, 44);
    g.fillStyle = ok ? '#4ade80' : '#f87171'; g.beginPath(); g.arc(196, 37, 7, 0, 7); g.fill();
    let y = 76;
    pr.boards().filter(b => b.cloud && ok).forEach(b => pr.partsOf(b.id).slice(0, 6).forEach(p => {
      const val = PARTS[p.type].kind === 'sensor' ? pr.read(p) : pr.state.get(p.id);
      g.fillStyle = 'rgba(255,255,255,0.08)'; roundRect(g, 12, y, 196, 44, 10); g.fill();
      g.fillStyle = '#cbd5e1'; g.font = '500 16px "IBM Plex Sans Thai", sans-serif'; g.fillText(p.name, 24, y + 27);
      g.fillStyle = valueColor(p, val); g.textAlign = 'right'; g.fillText(pr.text(p, val), 198, y + 27); g.textAlign = 'left';
      y += 52;
    }));
    if (pr.notifications[0]) {
      g.fillStyle = '#f43f5e'; roundRect(g, 12, c.height - 86, 196, 70, 12); g.fill();
      g.fillStyle = '#fff'; g.font = '600 16px "IBM Plex Sans Thai", sans-serif';
      g.fillText('แจ้งเตือน', 24, c.height - 58);
      g.font = '500 15px "IBM Plex Sans Thai", sans-serif'; g.fillText(pr.notifications[0].text.slice(0, 18), 24, c.height - 32);
    }
    v.screenTex.needsUpdate = true;
  }

  /* -------------------------------- แอนิเมชัน -------------------------------- */
  let last = performance.now();
  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (camGoal) {
      camera.position.lerp(camGoal.pos, 0.12);
      controls.target.lerp(camGoal.target, 0.12);
      if (camera.position.distanceTo(camGoal.pos) < 0.02) camGoal = null;
    }
    controls.update();
    const t = now / 1000;
    views.forEach(v => {
      const p = v.p, on = pr.state.get(p.id);
      if (p.type === 'fan') { v.spin += ((on ? 14 : 0) - v.spin) * Math.min(1, dt * 2); v.rotor.rotation.y += v.spin * dt; }
      if (p.type === 'buzzer' && on && t - v.lastRing > 0.45) { v.lastRing = t; ring(p.x, p.z, 0xf43f5e, 0.32, 1.6); }
      if (p.type === 'pump' && on && t - v.lastRing > 0.3) { v.lastRing = t; ring(p.x + 0.72, p.z, 0x38bdf8, 0.12, 1.1); }
      if (p.type === 'smoke') v.puffs.forEach(s => {
        const k = (t * 0.25 + s.userData.k) % 1;
        s.position.set(Math.sin(k * 9 + s.userData.k * 7) * 0.4, 0.4 + k * 1.4, Math.cos(k * 6) * 0.3);
        s.scale.set(0.6 + k * 1.4, 0.6 + k * 1.4, 1);
        s.material.opacity = pr.env.smoke ? (1 - k) * 0.55 : 0;
      });
      if (p.type === 'motion' && v.person.visible) v.person.position.x = -0.9 + Math.sin(t * 2.4) * 0.35;
      if (v.tx && v.txUntil) { setEmissive(v.tx, 0xfbbf24, t < v.txUntil); if (t >= v.txUntil) v.txUntil = 0; }
      if (p.type === 'gateway' || p.type === 'phone') { if (v.flashUntil > t) v.glow.material.opacity = 0.5 + Math.sin(t * 20) * 0.3; else v.glow.material.opacity = p.type === 'gateway' && pr.boards().some(b => b.cloud) ? 0.25 : 0; }
      if (p.type === 'lamp' && on) v.glow.material.opacity = 0.8 + Math.sin(t * 3) * 0.05;
    });
    for (let i = pulses.length - 1; i >= 0; i--) {
      const q = pulses[i];
      q.t += dt / q.dur;
      const k = Math.min(1, q.t);
      q.m.position.copy(q.curve.getPoint(q.reverse ? 1 - k : k));
      if (q.t >= 1) { disposeObj(q.m); pulses.splice(i, 1); if (q.onDone) q.onDone(); }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += dt / 0.9;
      const s = 1 + r.t * (r.max / 0.23 - 1);
      r.m.scale.set(s, s, 1);
      r.m.material.opacity = 0.8 * (1 - r.t);
      if (r.t >= 1) { disposeObj(r.m); rings.splice(i, 1); }
    }
    renderer.render(scene, camera);
  }

  function resize() {
    const w = stage.clientWidth || 800, hh = stage.clientHeight || 600;
    camera.aspect = w / hh;
    camera.updateProjectionMatrix();
    renderer.setSize(w, hh, false);
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);

  function setView(mode) {
    const tg = controls.target.clone();
    $('btnTop').classList.toggle('is-active', mode === 'top');
    $('btnTilt').classList.toggle('is-active', mode === 'tilt');
    controls.enableRotate = mode === 'tilt';
    const dist = camera.position.distanceTo(controls.target) || 15;
    camGoal = { target: tg, pos: mode === 'top' ? V(tg.x, dist, tg.z + 0.01) : V(tg.x, dist * 0.68, tg.z + dist * 0.72) };
  }
  function zoom(f) {
    const dir = camera.position.clone().subVectors ? V(0, 0, 0).subVectors(camera.position, controls.target) : V(0, 15, 0);
    const len = Math.sqrt(dir.lengthSq ? dir.lengthSq() : 225);
    const nl = clamp(len * f, controls.minDistance, controls.maxDistance);
    dir.normalize && dir.normalize();
    camGoal = { target: controls.target.clone(), pos: controls.target.clone().addScaledVector(dir, nl) };
  }

  /* =========================================================================
     การคลิก / ลาก ในฉาก
     ========================================================================= */
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
  const ground = new THREE.Plane(V(0, 1, 0), 0);
  function setMouse(e) {
    const r = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
  }
  function hitPart(e) {
    setMouse(e);
    const hits = ray.intersectObjects([...views.values()].map(v => v.group), true);
    for (const hit of hits) {
      let o = hit.object;
      while (o && (!o.userData || o.userData.partId === undefined)) o = o.parent;
      if (o) return pr.parts.get(o.userData.partId);
    }
    return null;
  }
  function groundPoint(e) { setMouse(e); const t = V(0, 0, 0); return ray.ray.intersectPlane(ground, t) ? t : null; }

  let down = null;
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const p = hitPart(e);
    down = { x: e.clientX, y: e.clientY, p, drag: false };
    if (p && tool === 'select') {
      controls.enabled = false;
      const g = groundPoint(e);
      down.off = g ? { x: p.x - g.x, z: p.z - g.z } : { x: 0, z: 0 };
      down.from = { x: p.x, z: p.z };
    }
  }, true);   // capture: ปิดการแพนกล้องก่อน OrbitControls จะเริ่มลาก
  window.addEventListener('pointermove', e => {
    if (!down || !down.p || tool !== 'select') return;
    if (!down.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) return;
    down.drag = true;
    const g = groundPoint(e);
    if (!g) return;
    down.p.x = clamp(g.x + down.off.x, -BOUNDS.x, BOUNDS.x);
    down.p.z = clamp(g.z + down.off.z, -BOUNDS.z, BOUNDS.z);
    moveVisual(down.p);
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('pointerup', e => {
    if (!down) return;
    const d = down;
    down = null;
    controls.enabled = true;
    canvas.style.cursor = '';
    if (d.drag) { persistSoon(); return; }
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;   // ลากกล้อง
    if (e.target !== canvas) return;
    clickPart(d.p);
  });
  function clickPart(p) {
    if (!p) {
      if (wireFrom) { wireFrom = null; hint(); refreshVisuals(); return; }
      select(null);
      return;
    }
    if (tool === 'delete') return removePart(p.id);
    if (tool === 'wire') return wireClick(p);
    select(p.id);
    if (PARTS[p.type].trigger) triggerPart(p.id);
  }
  function wireClick(p) {
    const k = PARTS[p.type].kind;
    if (!wireFrom) {
      if (k === 'phone') { toast('สมาร์ตโฟนเชื่อมกับ Cloud ผ่านอินเทอร์เน็ตเอง ไม่ต้องต่อสาย', 'info'); return; }
      wireFrom = p.id;
      hint(); refreshVisuals();
      return;
    }
    const a = pr.parts.get(wireFrom);
    wireFrom = null;
    if (!a || a.id === p.id) { hint(); refreshVisuals(); return; }
    const pair = [a, p];
    const board = pair.find(x => PARTS[x.type].kind === 'board');
    const gw = pair.find(x => x.type === 'gateway');
    const dev = pair.find(x => PARTS[x.type].kind === 'sensor' || PARTS[x.type].kind === 'actuator');
    if (board && gw) {
      const r = pr.register(board.id, true);
      toast(r.ok ? `${board.name} เชื่อม Wi-Fi ขึ้น Cloud แล้ว` : r.error, r.ok ? 'ok' : 'err');
      if (r.ok) log(`${board.name}: WiFi connected → IoT Cloud`, 'net');
    } else if (board && dev) {
      const r = pr.connect(dev.id, board.id);
      toast(r.ok ? `ต่อ ${dev.name} เข้าขา ${r.pin} ของ ${board.name}` : r.error, r.ok ? 'ok' : 'err');
      if (r.ok) select(dev.id);
    } else {
      toast('ต่อสายได้ระหว่างเซนเซอร์/อุปกรณ์ กับบอร์ด หรือระหว่างบอร์ด Wi-Fi กับ Gateway', 'warn');
    }
    changed();
  }

  /* =========================================================================
     การจัดการชิ้นส่วน
     ========================================================================= */
  function freeSpot(near) {
    const c = near || { x: 0, z: 0 };
    for (let r = 0; r < 9; r++) {
      const n = Math.max(1, r * 6);
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2;
        const x = clamp(c.x + Math.cos(a) * r * 1.35, -BOUNDS.x, BOUNDS.x), z = clamp(c.z + Math.sin(a) * r * 1.35, -BOUNDS.z, BOUNDS.z);
        if ([...pr.parts.values()].every(p => Math.hypot(p.x - x, p.z - z) > 1.45)) return { x, z };
      }
    }
    return { x: 0, z: 0 };
  }
  function addPart(type, at) {
    const k = PARTS[type].kind;
    if ((k === 'gateway' || k === 'phone') && [...pr.parts.values()].some(p => p.type === type)) {
      toast(`มี${k === 'gateway' ? ' IoT Gateway' : 'สมาร์ตโฟน'}อยู่แล้ว 1 เครื่องก็พอ`, 'warn');
      return null;
    }
    const pos = at || freeSpot();
    const p = pr.addPart({ type, x: pos.x, z: pos.z });
    log(`วาง ${p.name} (${PARTS[type].label})`, 'sys');
    // ถ้ามีบอร์ดตัวเดียว ต่อให้อัตโนมัติเพื่อเริ่มง่าย
    if ((k === 'sensor' || k === 'actuator') && pr.boards().length === 1 && tool === 'select') {
      const r = pr.connect(p.id, pr.boards()[0].id);
      if (r.ok) toast(`ต่อ ${p.name} เข้าขา ${r.pin} ของ ${pr.boards()[0].name} ให้แล้ว (เปลี่ยนขาได้ในแท็บคุณสมบัติ)`, 'ok', 3200);
    }
    select(p.id);
    changed();
    return p;
  }
  async function removePart(id) {
    const p = pr.parts.get(id);
    if (!p) return;
    pr.removePart(id);
    if (selected === id) selected = null;
    log(`ลบ ${p.name}`, 'sys');
    changed();
  }
  function select(id) {
    selected = id;
    refreshVisuals();
    if (id !== null && activeTab !== 'rules' && activeTab !== 'phone') showTab('props');
    else renderPane();
  }
  function triggerPart(id) {
    const p = pr.parts.get(id);
    if (!p || !PARTS[p.type].trigger) return;
    if (!p.link) { toast(`${p.name} ยังไม่ได้ต่อสายเข้าบอร์ด บอร์ดจึงอ่านค่าไม่ได้`, 'warn'); return; }
    ensureRunning();
    pr.trigger(p.id, 5);
    stepSim();
  }
  function ensureRunning() { if (!running) { toggleRun(true); toast('เริ่มจำลองให้อัตโนมัติ', 'info', 1600); } }

  /* =========================================================================
     จำลอง
     ========================================================================= */
  function toggleRun(force) {
    running = force === undefined ? !running : !!force;
    clearInterval(timer);
    if (running) timer = setInterval(stepSim, speedMs);
    const b = $('btnRun');
    b.classList.toggle('is-on', running);
    b.querySelector('i').className = 'fa-solid ' + (running ? 'fa-pause' : 'fa-play');
    b.querySelector('span').textContent = running ? 'หยุดจำลอง' : 'เริ่มจำลอง';
    $('simClock').hidden = !running;
    if (running) log('--- เริ่มจำลอง ---', 'sys');
  }
  function stepSim() {
    const ev = pr.step();
    $('tickText').textContent = pr.tick;
    const now = performance.now() / 1000;
    ev.forEach(e => {
      const p = e.part !== undefined ? pr.parts.get(e.part) : null;
      const b = e.board !== undefined && e.board !== null ? pr.parts.get(e.board) : null;
      const bv = b && views.get(b.id);
      if (bv) bv.txUntil = now + 0.25;
      if (e.type === 'read' && p) {
        const w = wires.get(p.id);
        pulse(w && w.curve, w ? w.color : 0xfacc15, false, 0.5);
        log(`${pad(e.pin)} ← ${p.name} = ${PARTS[p.type].signal === 'analog' ? e.value : (e.value ? 'HIGH' : 'LOW')}  (${e.text})`, 'in');
      } else if (e.type === 'write' && p) {
        const w = wires.get(p.id);
        pulse(w && w.curve, 0x38bdf8, true, 0.5);
        if (e.pin) log(`${pad(e.pin)} → ${p.name} = ${e.value ? 'HIGH' : 'LOW'}  (${e.text})${e.manual ? ' [สั่งจากมือถือ]' : ''}`, 'out');
      } else if (e.type === 'cloud') {
        const a = arcs.get('b' + e.board);
        pulse(a && a.curve, 0xa78bfa, false, 0.8);
      } else if (e.type === 'notify') {
        const a = arcs.get('b' + e.board), ph = arcs.get('phone');
        log(`${b ? b.name : ''}: แจ้งเตือนมือถือ "${e.text}"`, 'net');
        pulse(a && a.curve, 0xf43f5e, false, 0.7, () => {
          const gv = [...views.values()].find(v => v.p.type === 'gateway');
          if (gv) gv.flashUntil = performance.now() / 1000 + 0.6;
          pulse(ph && ph.curve, 0xf43f5e, false, 0.7, () => {
            const pv = [...views.values()].find(v => v.p.type === 'phone');
            if (pv) pv.flashUntil = performance.now() / 1000 + 1.4;
            if (e.phone) {
              toast(`แจ้งเตือนบนมือถือ: ${e.text}`, 'warn', 3200);
              award({ xp: 30, reason: 'ส่งแจ้งเตือนถึงมือถือครั้งแรก', once: 'iot-notify', badges: ['iot_cloud'] });
            }
          });
        });
      }
    });
    refreshVisuals();
    if (activeTab === 'phone' || activeTab === 'rules' || (activeTab === 'props' && selected !== null)) renderPane(true);
    evaluateSoon(0);
  }
  const pad = s => String(s || '').padEnd(6, ' ');
  function log(text, kind) {
    serial.push({ t: pr.tick, text, kind: kind || '' });
    if (serial.length > 300) serial.splice(0, serial.length - 300);
    if (activeTab === 'serial') renderSerial();
  }
  function renderSerial() {
    const out = $('serialOut');
    out.innerHTML = '';
    serial.slice(-160).forEach(l => out.append(h('div', { class: 'sl sl--' + l.kind }, h('span', { class: 'sl__t', text: `[${String(l.t).padStart(4, '0')}]` }), ' ' + l.text)));
    out.scrollTop = out.scrollHeight;
  }

  /* =========================================================================
     แผงซ้าย: ชิ้นส่วน / สภาพแวดล้อม
     ========================================================================= */
  function renderPalette() {
    const box_ = $('leftParts');
    box_.innerHTML = '';
    IoT.GROUPS.forEach(gr => {
      const items = IoT.ORDER.filter(t => IoT.groupOf(t) === gr.id);
      add(box_, h('h3', { class: 'pal-h', text: gr.th }),
        h('div', { class: 'pal' }, items.map(t => {
          const sp = PARTS[t];
          const b = h('button', { class: 'pal-item', type: 'button', draggable: 'true', title: sp.desc, 'data-type': t, style: `--c:${sp.color}`, onclick: () => addPart(t) },
            h('span', { class: 'pal-item__ic' }, icon((sp.icon === 'fa-raspberry-pi' ? 'fa-brands ' : '') + sp.icon)),
            h('span', { class: 'pal-item__tx' }, h('b', { text: sp.label }), h('small', { text: sp.th + (sp.kind === 'sensor' ? (sp.signal === 'analog' ? ' · อนาล็อก' : ' · ดิจิทัล') : '') })));
          b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/iot-part', t); e.dataTransfer.effectAllowed = 'copy'; });
          return b;
        })));
    });
  }
  canvas.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/iot-part')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  canvas.addEventListener('drop', e => {
    const t = e.dataTransfer.getData('text/iot-part');
    if (!t || !PARTS[t]) return;
    e.preventDefault();
    const g = groundPoint(e);
    addPart(t, g ? { x: clamp(g.x, -BOUNDS.x, BOUNDS.x), z: clamp(g.z, -BOUNDS.z, BOUNDS.z) } : null);
  });

  const ENV_UI = {
    temp: { th: 'อุณหภูมิห้อง', icon: 'fa-temperature-half', unit: '°C', min: 0, max: 50 },
    light: { th: 'ความสว่าง', icon: 'fa-sun', unit: '%', min: 0, max: 100 },
    soil: { th: 'ความชื้นในดิน', icon: 'fa-droplet', unit: '%', min: 0, max: 100 }
  };
  function renderEnv() {
    const box_ = $('leftEnv');
    box_.innerHTML = '';
    const types = new Set([...pr.parts.values()].map(p => p.type));
    const sensors = [...pr.parts.values()].filter(p => PARTS[p.type].kind === 'sensor');
    add(box_, h('p', { class: 'env-note', text: 'ปรับสภาพแวดล้อมรอบ ๆ แล้วดูว่าเซนเซอร์อ่านค่าได้เท่าไร และบอร์ดสั่งอุปกรณ์อย่างไร' }));
    if (!sensors.length) { add(box_, h('div', { class: 'iot-empty' }, icon('fa-temperature-arrow-up'), h('b', { text: 'ยังไม่มีเซนเซอร์' }), 'วางเซนเซอร์จากแท็บชิ้นส่วนก่อน ที่นี่จะมีตัวควบคุมให้ตามเซนเซอร์ที่วาง')); }
    Object.entries(ENV_UI).forEach(([k, u]) => {
      if (!types.has(k)) return;
      const out = h('output', { text: pr.env[k] + u.unit });
      add(box_, h('label', { class: 'env-row' },
        h('span', { class: 'env-row__h' }, icon(u.icon), h('b', { text: u.th }), out),
        h('input', { type: 'range', min: u.min, max: u.max, step: 1, value: pr.env[k], 'data-env': k,
          oninput: e => { pr.setEnv(k, e.target.value); out.textContent = e.target.value + u.unit; refreshVisuals(); },
          onchange: () => { ensureRunning(); persistSoon(); } })));
    });
    const toggle = (k, th, ic, on, off) => {
      if (!types.has(k)) return;
      add(box_, h('label', { class: 'env-sw' }, icon(ic), h('span', {}, h('b', { text: th }), h('small', { text: pr.env[k] ? on : off })),
        h('input', { type: 'checkbox', checked: !!pr.env[k], 'data-env': k, onchange: e => { pr.setEnv(k, e.target.checked ? 1 : 0); ensureRunning(); refreshVisuals(); renderEnv(); persistSoon(); } }), h('i', { class: 'sw' })));
    };
    toggle('smoke', 'ปล่อยควัน', 'fa-smog', 'มีควันในห้อง', 'อากาศปกติ');
    toggle('door', 'เปิดประตู', 'fa-door-open', 'ประตูเปิดอยู่', 'ประตูปิด');
    toggle('motion', 'มีคนอยู่ในห้องตลอด', 'fa-people-group', 'มีคนอยู่', 'ไม่มีคน');
    const trig = sensors.filter(p => PARTS[p.type].trigger);
    if (trig.length) {
      add(box_, h('h3', { class: 'pal-h', text: 'ทดสอบชั่วคราว' }),
        h('div', { class: 'env-trig' }, trig.map(p => h('button', { class: 'iot-btn', type: 'button', 'data-trigger': p.id, onclick: () => triggerPart(p.id) },
          icon(PARTS[p.type].icon), ` ${{ motion: 'มีคนเดินผ่าน', button: 'กดปุ่ม', rfid: 'แตะบัตร' }[p.type]} ${p.name}`))));
    }
    add(box_, h('h3', { class: 'pal-h', text: 'ความเร็วจำลอง' }),
      h('div', { class: 'seg' }, [[1100, 'ช้า'], [600, 'ปกติ'], [250, 'เร็ว']].map(([ms, t]) => h('button', { type: 'button', class: speedMs === ms ? 'is-active' : '', text: t,
        onclick: () => { speedMs = ms; if (running) toggleRun(true); renderEnv(); } }))));
  }

  /* =========================================================================
     แผงขวา
     ========================================================================= */
  function showTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.iot-tabs button').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
    document.querySelectorAll('.iot-pane').forEach(p => { p.hidden = p.id !== 'pane-' + tab; });
    renderPane();
  }
  function renderPane(live) {
    if (activeTab === 'lesson' && !live) renderLesson();
    else if (activeTab === 'props') renderProps(live);
    else if (activeTab === 'rules') live ? updateRuleLive() : renderRules();
    else if (activeTab === 'phone') renderPhone();
    else if (activeTab === 'serial') renderSerial();
    $('ruleCount').textContent = pr.rules.length || '';
    $('notiCount').textContent = pr.notifications.length ? Math.min(99, pr.notifications.length) : '';
  }

  /* ------------------------------ ภารกิจ ------------------------------ */
  function renderLesson() {
    const box_ = $('pane-lesson');
    box_.innerHTML = '';
    const L = LESSON;
    add(box_, h('div', { class: 'les-head', style: `--c:${L.color}` },
      h('span', { class: 'les-head__ic' }, icon(L.icon)),
      h('div', {}, h('small', { text: L.no ? `บทที่ ${L.no}` : 'โหมดอิสระ' }), h('h2', { text: L.title }))),
      h('p', { class: 'les-story', text: L.story }),
      h('div', { class: 'les-learn' }, L.learn.map(x => h('span', { text: x }))));
    if (!L.tasks.length) {
      add(box_, h('div', { class: 'les-free' },
        h('h3', { text: 'ระบบ IoT มี 4 ส่วน' }),
        h('ol', {}, h('li', {}, h('b', { text: 'เซนเซอร์' }), ' รับรู้สิ่งรอบตัว เช่น อุณหภูมิ แสง คนเดินผ่าน'),
          h('li', {}, h('b', { text: 'บอร์ดควบคุม' }), ' อ่านค่าจากขา (Pin) แล้วตัดสินใจตามกฎ'),
          h('li', {}, h('b', { text: 'อุปกรณ์ทำงาน' }), ' รับคำสั่งจากบอร์ด เช่น เปิดไฟ หมุนพัดลม'),
          h('li', {}, h('b', { text: 'Cloud + มือถือ' }), ' ดูค่าและสั่งงานจากที่ไหนก็ได้ผ่านอินเทอร์เน็ต')),
        h('a', { class: 'iot-btn', href: 'iot.html' }, icon('fa-chalkboard'), ' เลือกบทเรียนที่มีภารกิจ')));
      add(box_, validateBlock());
      return;
    }
    const done = passed.filter(Boolean).length;
    add(box_, h('div', { class: 'les-bar' }, h('span', {}, h('i', { style: `width:${Math.round(done * 100 / L.tasks.length)}%` })), h('b', { text: `${done}/${L.tasks.length}` })));
    add(box_, h('ol', { class: 'tasks' }, L.tasks.map((t, i) => h('li', { class: 'task' + (passed[i] ? ' is-done' : '') + (!passed[i] && passed.slice(0, i).every(Boolean) ? ' is-next' : '') },
      h('span', { class: 'task__chk' }, passed[i] ? icon('fa-check') : h('b', { text: i + 1 })),
      h('div', {}, h('p', { text: t.title }),
        hints.has(i) ? h('div', { class: 'task__hint' }, icon('fa-lightbulb'), ' ' + t.hint) : null,
        !passed[i] ? h('button', { class: 'iot-mini', type: 'button', onclick: () => { hints.has(i) ? hints.delete(i) : hints.add(i); renderLesson(); } }, hints.has(i) ? 'ซ่อนคำใบ้' : 'ดูคำใบ้') : null)))));
    if (allDone) {
      const idx = IoTLessons.LESSONS.indexOf(L), next = IoTLessons.LESSONS[idx + 1];
      add(box_, h('div', { class: 'les-done' }, icon('fa-trophy'), h('div', {}, h('b', { text: 'ผ่านบทเรียนนี้แล้ว!' }), h('span', { text: 'ลองกด "โค้ด" เพื่อดูว่ากฎที่สร้างกลายเป็นโปรแกรมจริงอย่างไร' })),
        next ? h('a', { class: 'iot-btn iot-btn--run', href: 'iot-lab.html?lesson=' + next.id }, 'บทถัดไป ', icon('fa-arrow-right')) : h('a', { class: 'iot-btn iot-btn--run', href: 'iot.html' }, 'กลับห้องเรียน')));
    }
    add(box_, h('button', { class: 'iot-mini les-reset', type: 'button', onclick: resetLesson }, icon('fa-rotate-left'), ' เริ่มบทนี้ใหม่'));
  }
  async function resetLesson() {
    const ok = await UI.confirm({ title: 'เริ่มบทนี้ใหม่?', message: 'ชิ้นส่วน สาย และกฎทั้งหมดในบทนี้จะถูกล้างกลับเป็นค่าเริ่มต้น (XP ที่ได้แล้วยังอยู่)', confirmText: 'เริ่มใหม่' });
    if (!ok) return;
    toggleRun(false);
    pr = new IoT.Project();
    LESSON.start(pr);
    passed = LESSON.tasks.map(() => false); allDone = false; hints.clear(); serial = []; selected = null;
    changed();
    showTab('lesson');
  }

  /* --------------------------- ตรวจระบบ --------------------------- */
  function validateBlock() {
    const list = pr.validate();
    return h('div', { class: 'val' }, h('h3', {}, icon('fa-stethoscope'), ' ตรวจระบบ'),
      list.length ? h('ul', {}, list.map(v => h('li', { class: 'val--' + v.level, onclick: () => { if (v.part !== null && pr.parts.has(v.part)) select(v.part); } },
        icon(v.level === 'error' ? 'fa-circle-xmark' : v.level === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-info'), ' ' + v.msg)))
        : h('p', { class: 'val--ok' }, icon('fa-circle-check'), ' ทุกอย่างต่อครบ พร้อมทำงาน'));
  }

  /* --------------------------- คุณสมบัติ --------------------------- */
  function renderProps(live) {
    const box_ = $('pane-props');
    const p = selected !== null ? pr.parts.get(selected) : null;
    if (live && p) {   // อัปเดตเฉพาะค่าสด ไม่สร้างฟอร์มใหม่ (กันช่องที่กำลังพิมพ์หาย)
      const lv = box_.querySelector('[data-live]');
      if (lv) { const v = labelValue(p); lv.textContent = v.text; lv.style.color = v.color; }
      return;
    }
    if (live) return;
    box_.innerHTML = '';
    if (!p) {
      add(box_, h('div', { class: 'iot-empty' }, icon('fa-hand-pointer'), h('b', { text: 'ยังไม่ได้เลือกชิ้นส่วน' }), 'คลิกชิ้นส่วนในพื้นที่จำลองเพื่อดูการต่อขาและตั้งค่า'));
      if (pr.parts.size) add(box_, h('div', { class: 'plist' }, [...pr.parts.values()].map(q => h('button', { type: 'button', onclick: () => select(q.id), style: `--c:${PARTS[q.type].color}` },
        icon((PARTS[q.type].icon === 'fa-raspberry-pi' ? 'fa-brands ' : '') + PARTS[q.type].icon), h('span', { text: q.name }), h('small', { text: labelValue(q).text })))));
      add(box_, validateBlock());
      return;
    }
    const sp = PARTS[p.type], k = sp.kind;
    const lv = labelValue(p);
    add(box_, h('div', { class: 'pp-head', style: `--c:${sp.color}` },
      h('span', { class: 'pp-head__ic' }, icon((sp.icon === 'fa-raspberry-pi' ? 'fa-brands ' : '') + sp.icon)),
      h('div', {}, h('input', { class: 'pp-name', value: p.name, maxLength: 24, 'aria-label': 'ชื่อชิ้นส่วน',
        onchange: e => { p.name = e.target.value.trim() || p.name; refreshVisuals(); persistSoon(); } }),
        h('small', { text: `${sp.label} · ${sp.th}` }))),
      h('p', { class: 'pp-desc', text: sp.desc }));
    if (k === 'sensor' || k === 'actuator') {
      add(box_, h('div', { class: 'pp-live' }, h('small', { text: k === 'sensor' ? 'ค่าที่อ่านได้ตอนนี้' : 'สถานะตอนนี้' }), h('b', { 'data-live': '', text: lv.text, style: `color:${lv.color}` })));
      const boards = pr.boards();
      const want = k === 'sensor' && sp.signal === 'analog' ? 'A' : 'D';
      const b = p.link ? pr.parts.get(p.link.board) : null;
      const bsel = h('select', { 'aria-label': 'บอร์ด', onchange: e => {
        const id = Number(e.target.value);
        if (!id) pr.disconnect(p.id); else { const r = pr.connect(p.id, id); if (!r.ok) toast(r.error, 'err'); }
        changed();
      } }, h('option', { value: '', text: '— ไม่ได้ต่อ —' }), boards.map(x => h('option', { value: x.id, text: x.name, selected: b && b.id === x.id })));
      const pins = b ? [...new Set([...(p.link ? [p.link.pin] : []), ...pr.freePins(b, p)])] : [];
      const psel = h('select', { 'aria-label': 'ขา', disabled: !b, onchange: e => { const r = pr.connect(p.id, b.id, e.target.value); if (!r.ok) toast(r.error, 'err'); changed(); } },
        pins.map(x => h('option', { value: x, text: x, selected: p.link && p.link.pin === x })));
      add(box_, h('div', { class: 'pp-sec' }, h('h3', {}, icon('fa-plug'), ' การต่อสาย'),
        h('div', { class: 'pp-grid' }, h('label', {}, 'บอร์ด', bsel), h('label', {}, 'ขา (Pin)', psel)),
        h('p', { class: 'pp-note' }, icon(want === 'A' ? 'fa-wave-square' : 'fa-toggle-on'),
          want === 'A' ? ' ค่าเป็นตัวเลขต่อเนื่อง (อนาล็อก) ต้องต่อขา A' : k === 'sensor' ? ' ค่ามีแค่ 2 แบบ HIGH/LOW (ดิจิทัล) ต่อขา D' : ' บอร์ดสั่งเปิด/ปิดด้วยขาดิจิทัล (D)'),
        !boards.length ? h('p', { class: 'pp-warn' }, icon('fa-triangle-exclamation'), ' ยังไม่มีบอร์ด วาง Arduino / ESP32 / Raspberry Pi ก่อน') : null));
      if (sp.trigger) add(box_, h('button', { class: 'iot-btn iot-btn--block', type: 'button', onclick: () => triggerPart(p.id) }, icon('fa-hand-pointer'), ` ทดสอบ: ${{ motion: 'มีคนเดินผ่าน', button: 'กดปุ่ม', rfid: 'แตะบัตร' }[p.type]}`));
      if (sp.env && ENV_UI[sp.env]) add(box_, h('button', { class: 'iot-btn iot-btn--block', type: 'button', onclick: () => setLeft('env') }, icon('fa-sliders'), ` ปรับ${ENV_UI[sp.env].th}`));
      if (k === 'actuator') {
        const ctrl = pr.rules.filter(r => (r.then && r.then.part === p.id) || (r.else && r.else.part === p.id)).length;
        add(box_, h('p', { class: 'pp-note' }, icon('fa-diagram-project'), ctrl ? ` มีกฎควบคุมอุปกรณ์นี้ ${ctrl} ข้อ` : ' ยังไม่มีกฎสั่งงานอุปกรณ์นี้ — ไปที่แท็บ "กฎ"'));
      }
    } else if (k === 'board') {
      const parts = pr.partsOf(p.id);
      add(box_, h('div', { class: 'pp-sec' }, h('h3', {}, icon('fa-wifi'), ' การเชื่อมต่อ Cloud'),
        h('label', { class: 'env-sw' + (sp.wifi ? '' : ' is-off') }, icon('fa-cloud-arrow-up'), h('span', {}, h('b', { text: 'เชื่อม Wi-Fi ขึ้น Cloud' }), h('small', { text: sp.wifi ? (pr.hasCloud() ? 'ส่งค่าให้แอปมือถือ และรับคำสั่ง' : 'ต้องวาง IoT Gateway / Cloud ก่อน') : 'บอร์ดนี้ไม่มี Wi-Fi' })),
          h('input', { type: 'checkbox', checked: p.cloud, disabled: !sp.wifi, 'data-cloud': p.id, onchange: e => { const r = pr.register(p.id, e.target.checked); if (!r.ok) { toast(r.error, 'err'); e.target.checked = false; } else if (e.target.checked) log(`${p.name}: WiFi connected → IoT Cloud`, 'net'); changed(); } }), h('i', { class: 'sw' }))));
      add(box_, h('div', { class: 'pp-sec' }, h('h3', {}, icon('fa-microchip'), ` ขาที่ใช้ (${parts.length})`),
        parts.length ? h('table', { class: 'pins' }, h('tbody', {}, parts.sort((a, c) => a.link.pin.localeCompare(c.link.pin, 'en', { numeric: true })).map(q => h('tr', { onclick: () => select(q.id) },
          h('td', {}, h('code', { text: q.link.pin })), h('td', { text: q.name }), h('td', { text: PARTS[q.type].kind === 'sensor' ? 'INPUT' : 'OUTPUT' })))))
          : h('p', { class: 'pp-note', text: 'ยังไม่มีอะไรต่อกับบอร์ดนี้ ใช้เครื่องมือ "ต่อสาย" หรือเลือกบอร์ดในคุณสมบัติของเซนเซอร์' })),
        h('div', { class: 'pp-row' },
          h('button', { class: 'iot-btn', type: 'button', onclick: () => newRule(p.id) }, icon('fa-plus'), ' สร้างกฎ'),
          h('button', { class: 'iot-btn', type: 'button', onclick: () => openCode(p.id) }, icon('fa-code'), ' ดูโค้ด')));
    } else if (k === 'gateway') {
      const on = pr.boards().filter(b => b.cloud);
      add(box_, h('div', { class: 'pp-sec' }, h('h3', {}, icon('fa-tower-broadcast'), ' บอร์ดที่ออนไลน์'),
        on.length ? h('ul', { class: 'pp-list' }, on.map(b => h('li', {}, icon('fa-circle-check'), ' ' + b.name))) : h('p', { class: 'pp-note', text: 'ยังไม่มี เปิด "เชื่อม Wi-Fi ขึ้น Cloud" ที่บอร์ด ESP32 หรือ Raspberry Pi' })));
    } else {
      add(box_, h('button', { class: 'iot-btn iot-btn--block', type: 'button', onclick: () => showTab('phone') }, icon('fa-mobile-screen'), ' เปิดแอปบนมือถือ'));
    }
    add(box_, h('button', { class: 'iot-btn iot-btn--danger iot-btn--block', type: 'button', onclick: () => removePart(p.id) }, icon('fa-trash-can'), ' ลบชิ้นส่วนนี้'));
  }

  /* ------------------------------- กฎ ------------------------------- */
  const OP_TH = { '>': 'มากกว่า', '<': 'น้อยกว่า', '>=': 'มากกว่าหรือเท่ากับ', '<=': 'น้อยกว่าหรือเท่ากับ', '==': 'เท่ากับ' };
  function newRule(boardId) {
    const boards = pr.boards();
    if (!boards.length) { toast('วางบอร์ดควบคุมก่อนสร้างกฎ', 'warn'); return; }
    const b = pr.parts.get(boardId) || (selected !== null && pr.parts.get(selected) && PARTS[pr.parts.get(selected).type].kind === 'board' ? pr.parts.get(selected) : boards[0]);
    const ps = pr.partsOf(b.id);
    const s = ps.find(q => PARTS[q.type].kind === 'sensor'), a = ps.find(q => PARTS[q.type].kind === 'actuator');
    const cond = s ? defaultCond(s) : null;
    pr.addRule({ board: b.id, conds: cond ? [cond] : [], then: a ? { action: 'on', part: a.id } : { action: 'on' }, else: a ? { action: 'off', part: a.id } : null });
    if (!s) toast(`ต่อเซนเซอร์เข้า ${b.name} ก่อน แล้วเลือกเป็นเงื่อนไข`, 'warn');
    showTab('rules');
    changed();
  }
  function defaultCond(s) { const sp = PARTS[s.type]; return sp.signal === 'analog' ? { part: s.id, op: '>', value: Math.round((sp.min + sp.max) / 2) } : { part: s.id, op: '==', value: 1 }; }
  function ruleText(r) {
    const name = id => (pr.parts.get(id) || { name: '?' }).name;
    const cond = c => { const s = pr.parts.get(c.part); if (!s) return '?'; const sp = PARTS[s.type]; return sp.signal === 'analog' ? `${s.name} ${OP_TH[c.op]} ${c.value}${sp.unit}` : `${s.name} ${c.value ? sp.on : sp.off}`; };
    const act = a => !a || !a.action ? 'ไม่ทำอะไร' : a.action === 'notify' ? `แจ้งเตือนมือถือ "${a.text || ''}"` : `${a.action === 'on' ? 'เปิด' : 'ปิด'} ${a.part ? name(a.part) : '?'}`;
    return `ถ้า ${r.conds.map(cond).join(r.join === 'or' ? ' หรือ ' : ' และ ') || '…'} แล้ว ${act(r.then)}${r.else && r.else.action ? ' ไม่งั้น ' + act(r.else) : ''}`;
  }
  function renderRules() {
    const box_ = $('pane-rules');
    box_.innerHTML = '';
    add(box_, h('div', { class: 'rules-head' }, h('p', { text: 'บอร์ดจะตรวจกฎทุกจังหวะ ถ้าเงื่อนไขเป็นจริงจะทำ "แล้ว" ถ้าไม่จริงจะทำ "ไม่งั้น" (กฎข้อหลังสั่งทับข้อก่อนได้)' }),
      h('button', { class: 'iot-btn iot-btn--run', type: 'button', id: 'btnAddRule', onclick: () => newRule() }, icon('fa-plus'), ' เพิ่มกฎ')));
    if (!pr.rules.length) { add(box_, h('div', { class: 'iot-empty' }, icon('fa-diagram-project'), h('b', { text: 'ยังไม่มีกฎ' }), 'กด "เพิ่มกฎ" แล้วเลือกเซนเซอร์เป็นเงื่อนไข และอุปกรณ์ที่จะสั่ง')); return; }
    pr.rules.forEach((r, idx) => add(box_, ruleCard(r, idx)));
  }
  function ruleCard(r, idx) {
    const boards = pr.boards();
    const b = pr.parts.get(r.board);
    const parts = b ? pr.partsOf(b.id) : [];
    const sensors = parts.filter(q => PARTS[q.type].kind === 'sensor'), acts = parts.filter(q => PARTS[q.type].kind === 'actuator');
    const upd = () => { changed(); };
    const card = h('div', { class: 'rule', 'data-rule': r.id });
    const condRow = (c, i) => {
      const s = pr.parts.get(c.part), sp = s && PARTS[s.type];
      const ssel = h('select', { 'aria-label': 'เซนเซอร์', onchange: e => { const ns = pr.parts.get(Number(e.target.value)); r.conds[i] = defaultCond(ns); upd(); } },
        !s || !sensors.includes(s) ? h('option', { value: '', text: s ? s.name + ' (ไม่ได้ต่อบอร์ดนี้)' : '— เลือกเซนเซอร์ —', selected: true }) : null,
        sensors.map(q => h('option', { value: q.id, text: q.name, selected: q === s })));
      let rest = [];
      if (sp && sp.signal === 'analog') {
        rest = [h('select', { 'aria-label': 'เครื่องหมาย', class: 'op', onchange: e => { c.op = e.target.value; upd(); } }, Object.keys(OP_TH).map(o => h('option', { value: o, text: `${o}  ${OP_TH[o]}`, selected: c.op === o }))),
          h('span', { class: 'num' }, h('input', { type: 'number', value: c.value, min: sp.min, max: sp.max, 'aria-label': 'ค่า', onchange: e => { c.value = Number(e.target.value); upd(); } }), h('small', { text: sp.unit }))];
      } else if (sp) {
        rest = [h('select', { 'aria-label': 'สถานะ', onchange: e => { c.value = Number(e.target.value); c.op = '=='; upd(); } },
          h('option', { value: 1, text: sp.on, selected: c.value === 1 }), h('option', { value: 0, text: sp.off, selected: c.value === 0 }))];
      }
      return h('div', { class: 'rule__cond' }, ssel, ...rest,
        r.conds.length > 1 ? h('button', { class: 'iot-mini iot-mini--icon', type: 'button', 'aria-label': 'ลบเงื่อนไข', onclick: () => { r.conds.splice(i, 1); upd(); } }, icon('fa-xmark')) : null);
    };
    const actRow = (key, label) => {
      const a = r[key] || { action: '' };
      const allowNotify = key === 'then';
      const asel = h('select', { 'aria-label': label, onchange: e => {
        const v = e.target.value;
        if (!v) r[key] = null;
        else if (v === 'notify') r[key] = { action: 'notify', text: a.text || (LESSON.id === 'fire-alarm' ? 'ไฟไหม้! พบควันในห้อง' : 'แจ้งเตือนจาก ' + (b ? b.name : 'บอร์ด')) };
        else r[key] = { action: v, part: a.part && acts.some(q => q.id === a.part) ? a.part : (acts[0] ? acts[0].id : undefined) };
        upd();
      } },
        key === 'else' ? h('option', { value: '', text: 'ไม่ทำอะไร', selected: !a.action }) : null,
        h('option', { value: 'on', text: 'เปิด / ทำงาน', selected: a.action === 'on' }),
        h('option', { value: 'off', text: 'ปิด / หยุด', selected: a.action === 'off' }),
        allowNotify ? h('option', { value: 'notify', text: 'แจ้งเตือนมือถือ', selected: a.action === 'notify' }) : null);
      let tail = null;
      if (a.action === 'on' || a.action === 'off') {
        const cur = pr.parts.get(a.part);
        tail = h('select', { 'aria-label': 'อุปกรณ์', onchange: e => { a.part = Number(e.target.value); upd(); } },
          !cur || !acts.includes(cur) ? h('option', { value: '', text: '— เลือกอุปกรณ์ —', selected: true }) : null,
          acts.map(q => h('option', { value: q.id, text: q.name, selected: q === cur })));
      } else if (a.action === 'notify') {
        tail = h('input', { type: 'text', value: a.text || '', maxLength: 60, placeholder: 'ข้อความแจ้งเตือน', 'aria-label': 'ข้อความแจ้งเตือน', onchange: e => { a.text = e.target.value; upd(); } });
      }
      return h('div', { class: 'rule__act rule__act--' + key }, h('b', { class: 'kw', text: label }), asel, tail);
    };
    const problem = pr.ruleProblem(r);
    add(card,
      h('div', { class: 'rule__top' }, h('span', { class: 'rule__no', text: 'กฎข้อ ' + (idx + 1) }),
        h('select', { 'aria-label': 'บอร์ด', class: 'rule__board', onchange: e => { r.board = Number(e.target.value); upd(); } }, boards.map(x => h('option', { value: x.id, text: x.name, selected: x.id === r.board }))),
        h('span', { class: 'rule__state', 'data-state': r.id }),
        h('button', { class: 'iot-mini iot-mini--icon', type: 'button', 'aria-label': 'ลบกฎ', onclick: () => { pr.removeRule(r.id); upd(); } }, icon('fa-trash-can'))),
      h('div', { class: 'rule__if' }, h('b', { class: 'kw', text: 'ถ้า' }),
        h('div', { class: 'rule__conds' }, r.conds.map((c, i) => [i > 0 ? h('button', { class: 'join', type: 'button', title: 'สลับ และ/หรือ', onclick: () => { r.join = r.join === 'or' ? 'and' : 'or'; upd(); }, text: r.join === 'or' ? 'หรือ' : 'และ' }) : null, condRow(c, i)]),
          h('button', { class: 'iot-mini', type: 'button', disabled: !sensors.length, onclick: () => { const s = sensors.find(q => !r.conds.some(c => c.part === q.id)) || sensors[0]; r.conds.push(defaultCond(s)); upd(); } }, icon('fa-plus'), ' เงื่อนไข'),
          !sensors.length ? h('small', { class: 'pp-warn', text: `ยังไม่มีเซนเซอร์ต่อกับ ${b ? b.name : 'บอร์ด'}` }) : null)),
      actRow('then', 'แล้ว'), actRow('else', 'ไม่งั้น'),
      h('p', { class: 'rule__say', text: ruleText(r) }),
      problem ? h('p', { class: 'pp-warn' }, icon('fa-triangle-exclamation'), ' ' + problem) : null);
    return card;
  }
  function updateRuleLive() {
    document.querySelectorAll('[data-state]').forEach(el => {
      const id = Number(el.dataset.state), r = pr.rules.find(x => x.id === id);
      const st = r && !pr.ruleProblem(r) && running ? pr.ruleWas.get(id) : undefined;
      el.className = 'rule__state' + (st === true ? ' is-true' : st === false ? ' is-false' : '');
      el.textContent = st === true ? 'เงื่อนไขจริง' : st === false ? 'ไม่จริง' : '';
    });
  }

  /* ------------------------------ มือถือ ------------------------------ */
  function renderPhone() {
    const box_ = $('pane-phone');
    box_.innerHTML = '';
    const hasPhone = pr.hasPhone(), hasCloud = pr.hasCloud();
    const screen = h('div', { class: 'ph-screen' });
    add(box_, h('div', { class: 'phone' }, h('div', { class: 'ph-notch' }), screen));
    add(screen, h('div', { class: 'ph-bar' }, h('span', { text: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) }), h('span', {}, icon('fa-signal'), ' ', icon('fa-wifi'), ' ', icon('fa-battery-three-quarters'))),
      h('div', { class: 'ph-app' }, h('b', { text: 'SimuCore Home' }), h('span', { class: 'ph-cloud' + (hasCloud && hasPhone ? ' is-on' : '') }, icon('fa-cloud'), hasCloud && hasPhone ? ' ออนไลน์' : ' ออฟไลน์')));
    const empty = (ic, t, s, btn) => add(screen, h('div', { class: 'ph-empty' }, icon(ic), h('b', { text: t }), h('span', { text: s }), btn));
    if (!hasPhone) return empty('fa-mobile-screen', 'ยังไม่มีสมาร์ตโฟน', 'วางสมาร์ตโฟนลงในพื้นที่จำลองเพื่อใช้แอปนี้', h('button', { class: 'iot-btn', type: 'button', onclick: () => addPart('phone') }, icon('fa-plus'), ' วางสมาร์ตโฟน'));
    if (!hasCloud) return empty('fa-cloud', 'ยังไม่มี IoT Gateway / Cloud', 'มือถือคุยกับบอร์ดผ่าน Cloud ต้องมีตัวกลางก่อน', h('button', { class: 'iot-btn', type: 'button', onclick: () => addPart('gateway') }, icon('fa-plus'), ' วาง IoT Gateway'));
    const online = pr.boards().filter(b => b.cloud);
    if (!online.length) return empty('fa-wifi', 'ยังไม่มีบอร์ดออนไลน์', 'เลือกบอร์ด ESP32 หรือ Raspberry Pi แล้วเปิด "เชื่อม Wi-Fi ขึ้น Cloud"', null);
    online.forEach(b => {
      const ps = pr.partsOf(b.id);
      add(screen, h('div', { class: 'ph-card' }, h('h4', {}, icon('fa-microchip'), ' ' + b.name),
        ps.length ? null : h('p', { class: 'ph-muted', text: 'ยังไม่มีเซนเซอร์หรืออุปกรณ์' }),
        ps.map(p => {
          const sp = PARTS[p.type];
          if (sp.kind === 'sensor') { const v = pr.read(p); return h('div', { class: 'ph-row' }, icon(sp.icon), h('span', { text: p.name }), h('b', { text: pr.text(p, v), style: `color:${valueColor(p, v)}` })); }
          const ruled = pr.rules.some(r => !pr.ruleProblem(r) && ((r.then && r.then.part === p.id) || (r.else && r.else.part === p.id)));
          const on = !!pr.state.get(p.id);
          return h('div', { class: 'ph-row' }, icon(sp.icon), h('span', {}, p.name, ruled ? h('small', { text: 'กฎอัตโนมัติควบคุมอยู่' }) : null),
            h('button', { class: 'ph-sw' + (on ? ' is-on' : ''), type: 'button', role: 'switch', 'aria-checked': String(on), 'data-phone': p.id, 'aria-label': `สั่ง ${p.name}`,
              onclick: () => { const r = pr.setManual(p.id, !on); if (!r.ok) { toast(r.error, 'err'); return; } log(`มือถือ → ${p.name}: ${!on ? 'เปิด' : 'ปิด'}`, 'net'); ensureRunning(); stepSim(); persistSoon(); } }, h('i')));
        })));
    });
    add(screen, h('div', { class: 'ph-card' }, h('h4', {}, icon('fa-bell'), ' การแจ้งเตือน'),
      pr.notifications.length ? pr.notifications.slice(0, 6).map(n => h('div', { class: 'ph-noti' }, h('b', { text: n.text }), h('small', { text: `${(pr.parts.get(n.board) || {}).name || ''} · จังหวะที่ ${n.tick}` })))
        : h('p', { class: 'ph-muted', text: 'ยังไม่มี สร้างกฎแบบ "แจ้งเตือนมือถือ" แล้วทดสอบ' })));
  }

  /* ------------------------------- โค้ด ------------------------------- */
  let codeBoard = null;
  function openCode(id) {
    const boards = pr.boards();
    if (!boards.length) { toast('ยังไม่มีบอร์ดควบคุม', 'warn'); return; }
    codeBoard = pr.parts.get(id) ? id : (selected !== null && boards.some(b => b.id === selected) ? selected : boards[0].id);
    const tabs = $('codeTabs');
    tabs.innerHTML = '';
    boards.forEach(b => tabs.append(h('button', { type: 'button', class: b.id === codeBoard ? 'is-active' : '', onclick: () => openCode(b.id) },
      icon((PARTS[b.type].icon === 'fa-raspberry-pi' ? 'fa-brands ' : '') + PARTS[b.type].icon), ` ${b.name}`, h('small', { text: PARTS[b.type].lang === 'python' ? 'Python' : 'Arduino C++' }))));
    $('codeOut').innerHTML = highlight(pr.codegen(codeBoard));
    $('codeModal').hidden = false;
  }
  function highlight(code) {
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return code.split('\n').map(line => {
      const ci = line.search(/\/\/|#(?!include)/);
      let body = ci >= 0 ? line.slice(0, ci) : line, com = ci >= 0 ? line.slice(ci) : '';
      body = esc(body).replace(/("[^"]*")/g, '<span class="s">$1</span>')
        .replace(/\b(void|int|const|if|else|while|import|from|True|False|and|or|pass|#include|return)\b/g, '<span class="k">$1</span>')
        .replace(/\b(HIGH|LOW|INPUT|OUTPUT)\b/g, '<span class="c">$1</span>')
        .replace(/\b(\d+)\b/g, '<span class="n">$1</span>');
      return body + (com ? `<span class="m">${esc(com)}</span>` : '');
    }).join('\n');
  }
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => { $('codeModal').hidden = true; }));
  $('btnCopyCode').onclick = async () => { try { await navigator.clipboard.writeText(pr.codegen(codeBoard)); toast('คัดลอกโค้ดแล้ว', 'ok'); } catch (e) { toast('คัดลอกไม่ได้ในเบราว์เซอร์นี้', 'err'); } };

  /* =========================================================================
     ภารกิจ + XP
     ========================================================================= */
  let evalTimer = null;
  function evaluateSoon(ms) { clearTimeout(evalTimer); evalTimer = setTimeout(evaluate, ms === undefined ? 250 : ms); }
  function evaluate() {
    if (!LESSON.tasks.length) { updateTop(); return; }
    const r = IoTLessons.evaluate(LESSON, pr);
    let newly = false;
    r.passed.forEach((ok, i) => {
      if (ok && !passed[i]) {
        passed[i] = true; newly = true;
        toast(`ภารกิจผ่าน: ${LESSON.tasks[i].title}`, 'ok', 2600);
        award({ xp: 10, reason: 'ผ่านภารกิจ IoT', once: `iot-task-${LESSON.id}-${i}` });
      }
    });
    if (newly) {
      if (passed.every(Boolean) && !allDone) {
        allDone = true;
        award({ xp: 60, reason: `ผ่านบท "${LESSON.title}"`, once: 'iot-done-' + LESSON.id, badges: ['iot_first'] }).then(res => {
          const once = res && res.progress ? res.progress.once : [];
          if (IoTLessons.LESSONS.every(l => once.includes('iot-done-' + l.id))) award({ xp: 200, reason: 'เรียนครบทุกบทในห้องเรียน IoT', once: 'iot-all', badges: ['iot_master'] });
        });
      }
      persistSoon();
      if (activeTab === 'lesson') renderLesson();
    }
    updateTop();
  }
  function updateTop() {
    const n = LESSON.tasks.length, d = passed.filter(Boolean).length;
    $('topProgress').hidden = !n;
    $('topProgressBar').style.width = n ? Math.round(d * 100 / n) + '%' : '0';
    $('topProgressText').textContent = `${d}/${n}`;
  }
  async function award(a) {
    try {
      const r = await Store.progress.award(a);
      if (r.gained) UI.toast(`+${r.gained} XP — ${a.reason}`, 'ok', 2400);
      (r.newBadges || []).forEach(id => popBadge(Store.GAME.BADGES[id]));
      return r;
    } catch (e) { return null; }
  }
  const badgeQ = [];
  let badgeBusy = false;
  function popBadge(b) { if (!b) return; badgeQ.push(b); if (!badgeBusy) nextBadge(); }
  function nextBadge() {
    const b = badgeQ.shift();
    if (!b) { badgeBusy = false; return; }
    badgeBusy = true;
    const el = h('div', { class: 'iot-badge glass', role: 'status' }, h('span', { class: 'iot-badge__m', style: `--b:${b.color}` }, icon(b.icon)),
      h('div', {}, h('small', { text: 'ได้รับเหรียญใหม่' }), h('b', { text: b.name }), h('span', { text: b.desc })));
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.remove(); nextBadge(); }, 400); }, 2800);
  }

  /* =========================================================================
     บันทึก / โหลด
     ========================================================================= */
  let saveTimer = null;
  function persistSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 800); }
  function persist() {
    clearTimeout(saveTimer);
    return Store.workspaces.save(KEY, { kind: 'iot', lesson: LESSON.id, project: pr.serialize(), passed, savedAt: new Date().toISOString() }).catch(e => toast('บันทึกไม่สำเร็จ: ' + e.message, 'err'));
  }
  function changed() {
    syncScene();
    renderPane();
    if (leftTab === 'env') renderEnv();
    evaluateSoon();
    persistSoon();
  }

  /* =========================================================================
     ปุ่มต่าง ๆ / คีย์ลัด
     ========================================================================= */
  function setTool(t) {
    tool = t; wireFrom = null;
    document.querySelectorAll('.iot-tools button').forEach(b => b.classList.toggle('is-active', b.dataset.tool === t));
    stage.dataset.tool = t;
    hint(); refreshVisuals();
  }
  function hint() {
    const el = $('stageHint');
    const msg = tool === 'wire' ? (wireFrom ? `คลิก${PARTS[pr.parts.get(wireFrom).type].kind === 'board' ? 'เซนเซอร์/อุปกรณ์ หรือ IoT Gateway' : 'บอร์ดควบคุม'}เพื่อต่อกับ ${pr.parts.get(wireFrom).name} (Esc ยกเลิก)` : 'ต่อสาย: คลิกเซนเซอร์หรืออุปกรณ์ แล้วคลิกบอร์ด · บอร์ด Wi-Fi → Gateway = เชื่อม Cloud')
      : tool === 'delete' ? 'ลบ: คลิกชิ้นส่วนที่ต้องการลบ' : '';
    el.textContent = msg;
    el.classList.toggle('show', !!msg);
  }
  function setLeft(t) {
    leftTab = t;
    document.querySelectorAll('.iot-left__tabs button').forEach(b => b.classList.toggle('is-active', b.dataset.left === t));
    $('leftParts').hidden = t !== 'parts'; $('leftEnv').hidden = t !== 'env';
    if (t === 'env') renderEnv();
  }
  document.querySelectorAll('.iot-tools button').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  document.querySelectorAll('.iot-tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
  document.querySelectorAll('.iot-left__tabs button').forEach(b => b.addEventListener('click', () => setLeft(b.dataset.left)));
  $('btnRun').onclick = () => toggleRun();
  $('btnTop').onclick = () => setView('top');
  $('btnTilt').onclick = () => setView('tilt');
  $('btnZoomIn').onclick = () => zoom(0.8);
  $('btnZoomOut').onclick = () => zoom(1.25);
  $('btnCode').onclick = () => openCode();
  $('btnClearSerial').onclick = () => { serial = []; renderSerial(); };
  $('btnSave').onclick = async () => { await persist(); toast('บันทึกแล้ว', 'ok'); };
  $('btnValidate').onclick = () => {
    const list = pr.validate();
    selected = null; refreshVisuals(); showTab('props');
    toast(list.length ? `พบ ${list.length} จุดที่ควรแก้ ดูรายการในแท็บคุณสมบัติ` : 'ระบบต่อครบ พร้อมทำงาน', list.some(v => v.level === 'error') ? 'err' : list.length ? 'warn' : 'ok');
  };
  window.addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName)) return;
    if (e.key === 'Escape') { if (!$('codeModal').hidden) $('codeModal').hidden = true; else if (wireFrom) { wireFrom = null; hint(); refreshVisuals(); } else setTool('select'); }
    else if (e.key === 'v' || e.key === 'V') setTool('select');
    else if (e.key === 'w' || e.key === 'W') setTool('wire');
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) { e.preventDefault(); removePart(selected); }
    else if (e.key === ' ') { e.preventDefault(); toggleRun(); }
  });
  window.addEventListener('beforeunload', () => { if (saveTimer) persist(); });

  /* =========================================================================
     เริ่มต้น
     ========================================================================= */
  async function init() {
    document.title = `${LESSON.title} | SimuCore IoT`;
    $('lessonName').textContent = LESSON.no ? `บทที่ ${LESSON.no}: ${LESSON.title}` : LESSON.title;
    let data = null;
    try { data = await Store.workspaces.load(KEY); } catch (e) { data = null; }
    if (data && data.project) {
      pr = IoT.Project.load(data.project);
      passed = LESSON.tasks.map((t, i) => !!(data.passed && data.passed[i]));
      allDone = LESSON.tasks.length > 0 && passed.every(Boolean);
    } else {
      LESSON.start(pr);
      passed = LESSON.tasks.map(() => false);
    }
    renderPalette();
    syncScene();
    resize();
    showTab('lesson');
    updateTop();
    hint();
    requestAnimationFrame(animate);
    // ฟอนต์ไทยโหลดเสร็จทีหลัง → วาดป้ายชื่อใหม่ให้คมชัด
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { views.forEach(v => { v.label.userData.key = ''; v.screenKey = ''; }); refreshVisuals(); });
    log(`SimuCore IoT พร้อม — ${LESSON.title}`, 'sys');
    const addType = params.get('add');
    if (addType && PARTS[addType]) { addPart(addType); history.replaceState(null, '', 'iot-lab.html?lesson=' + LESSON.id); }
    if (!data && LESSON.no) setTimeout(() => toast('เริ่มจากภารกิจข้อแรกในแผงขวา กด "ดูคำใบ้" ได้ถ้าติด', 'info', 3600), 600);
  }

  window.IoTLab = {
    project: () => pr, step: stepSim, select, addPart, removePart, triggerPart, toggleRun, setTool, showTab, setLeft, newRule, openCode, wireClick, clickPart,
    sync: syncScene, evaluate, persist, views, wires, arcs, state: () => ({ selected, tool, running, passed: passed.slice(), allDone, tab: activeTab })
  };
  window.iotReady = init();
})();
