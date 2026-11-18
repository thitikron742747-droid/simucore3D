/* ==========================================================================
   SimuCore 3D — เครือข่ายในชีวิตประจำวัน (โหลดหลัง lab-plus.js)
   --------------------------------------------------------------------------
   1. แผนที่สัญญาณ Wi-Fi (Heatmap) — ผนังปูนกั้นสัญญาณ, ห้องที่เน็ตไม่ถึง
   2. เน็ตบ้านมีปัญหา — โจทย์จากเรื่องจริงในบ้าน 7 เรื่อง
   3. ความเร็วเน็ต & ปิง — แชร์เน็ตกันทั้งบ้าน, เกมแลค, QoS, Mbps กับ MB/s
   4. ท่องเน็ตปลอดภัย — Wi-Fi ฟรีร้านกาแฟ (HTTP vs HTTPS), Wi-Fi แขก
   + ข้อมูลเสริมในแท็บคุณสมบัติ: ความแรงสัญญาณ, Wi-Fi แขก, Port Forwarding
   ========================================================================== */
(function () {
  'use strict';
  const LP = window.LabPlus, K = LP.kit;
  const LF = window.LifePlus = {};
  const add = K.add;
  const isAp = d => !!(d && d.spec.wireless && d.wifi);
  const byName = (n, name) => [...n.devices.values()].find(d => d.name === name);
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ------------------------------ สัญญาณ Wi-Fi ------------------------------ */
  function grade(r) {
    if (r >= -55) return { th: 'ดีมาก', c: '#22c55e', bars: 4 };
    if (r >= -67) return { th: 'ดี', c: '#84cc16', bars: 3 };
    if (r >= -75) return { th: 'พอใช้', c: '#facc15', bars: 2 };
    if (r >= -80) return { th: 'อ่อน', c: '#f97316', bars: 1 };
    return { th: 'ไม่มีสัญญาณ', c: '#ef4444', bars: 0 };
  }
  function signalOf(dev) {
    let best = null;
    net.devices.forEach(ap => {
      if (!isAp(ap) || ap === dev) return;
      const r = net.rssiAt(ap, dev.x || 0, dev.z || 0);
      if (!best || r > best.rssi) best = { ap, rssi: r, walls: net.wallsBetween(ap, dev.x || 0, dev.z || 0) };
    });
    return best;
  }
  const bars = n => h('span', { class: 'sig-bars' }, [1, 2, 3, 4].map(i => h('i', { class: i <= n ? 'on' : '' })));

  /* ------------------------- 1. แผนที่สัญญาณ Wi-Fi ------------------------- */
  const heat = { on: false, mesh: null, sig: '', last: 0 };
  const heatSig = () => [lastSiteKey, ...[...net.devices.values()].filter(isAp).map(a => `${a.id}:${(a.x || 0).toFixed(2)},${(a.z || 0).toFixed(2)}:${a.wifi.ssid}`)].join('|');
  function clearHeat() {
    if (!heat.mesh) return;
    scene.remove(heat.mesh);
    heat.mesh.geometry.dispose();
    if (heat.mesh.material.map) heat.mesh.material.map.dispose();
    heat.mesh.material.dispose();
    heat.mesh = null;
  }
  function drawHeat() {
    clearHeat();
    const aps = [...net.devices.values()].filter(isAp);
    heat.sig = heatSig();
    if (!aps.length) return;
    const { w, l } = roomSize();
    const cell = Math.max(0.12, Math.max(w, l) / 150);
    const cols = Math.ceil(w / cell), rows = Math.ceil(l / cell);
    const c = document.createElement('canvas');
    c.width = cols; c.height = rows;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(cols, rows);
    const col = r => r >= -55 ? [34, 197, 94] : r >= -67 ? [132, 204, 22] : r >= -75 ? [250, 204, 21] : r >= -80 ? [249, 115, 22] : [239, 68, 68];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const px = -w / 2 + (x + 0.5) * cell, pz = -l / 2 + (y + 0.5) * cell;
        let best = -200;
        for (const ap of aps) best = Math.max(best, net.rssiAt(ap, px, pz));
        const [R, G, B] = col(best), i = (y * cols + x) * 4;
        img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B;
        img.data[i + 3] = best < -80 ? 90 : 165;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    heat.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.62, depthWrite: false }));
    heat.mesh.rotation.x = -Math.PI / 2;
    heat.mesh.position.y = 0.016;
    heat.mesh.renderOrder = 2;
    scene.add(heat.mesh);
  }
  function toggleHeat(on) {
    heat.on = on === undefined ? !heat.on : !!on;
    document.querySelector('.dock-btn[data-tool="wifi"]')?.classList.toggle('on', heat.on);
    let lg = $('heatLegend');
    if (heat.on) {
      if (![...net.devices.values()].some(isAp)) { heat.on = false; document.querySelector('.dock-btn[data-tool="wifi"]')?.classList.remove('on'); return showToast('ยังไม่มีเราเตอร์ Wi-Fi หรือ Access Point ในห้อง', 'warn'); }
      if (viewMode === '360') switchViewMode('3d');
      drawHeat();
      if (!lg) {
        lg = h('div', { class: 'heat-legend', id: 'heatLegend' },
          h('b', { text: 'สัญญาณ Wi-Fi' }),
          ...[['#22c55e', 'ดีมาก ≥ -55 dBm'], ['#84cc16', 'ดี'], ['#facc15', 'พอใช้'], ['#f97316', 'อ่อน (≈ -80)'], ['#ef4444', 'ไม่มีสัญญาณ']].map(([c, t]) => h('span', {}, h('i', { style: `background:${c}` }), t)),
          h('small', { text: 'ผนังปูนลดสัญญาณ ~10 dB / กระจก ~5 dB' }));
        K.viewport().append(lg);
      }
      lg.classList.add('show');
    } else {
      clearHeat();
      if (lg) lg.classList.remove('show');
    }
  }
  frameHooks.add(now => {
    if (!heat.on || now - heat.last < 450) return;
    heat.last = now;
    if (heatSig() !== heat.sig) drawHeat();
  });

  /* ------------------ ข้อมูลเสริมในแท็บคุณสมบัติของอุปกรณ์ ------------------ */
  LF.propsExtra = function (dev, body) {
    // ความแรงสัญญาณของเครื่องที่ใช้ Wi-Fi
    if (dev.ports.some(p => p.media === 'wlan')) {
      const s = signalOf(dev);
      const linked = [...net.links.values()].find(l => l.cable === 'wireless' && (l.a.dev === dev.id || l.b.dev === dev.id));
      const g = s ? grade(s.rssi) : grade(-200);
      add(body, h('div', { class: 'prop-section sig-box', style: `--g:${g.c}` },
        h('div', { class: 'sec-title', text: 'สัญญาณ Wi-Fi ตรงจุดนี้' }),
        s ? h('div', { class: 'sig-row' }, bars(g.bars), h('b', { text: `${s.rssi} dBm` }), h('span', { text: g.th }),
          h('small', { text: `จาก ${s.ap.name}${s.walls ? ` · ผ่านผนัง ${s.walls} ชั้น` : ' · ไม่มีผนังกั้น'}` }))
          : h('p', { class: 'hint', text: 'ไม่มีเราเตอร์ Wi-Fi / Access Point ในห้อง' }),
        s && !linked && g.bars === 0 ? h('p', { class: 'hint warn', text: 'สัญญาณต่ำกว่า -80 dBm เชื่อมต่อไม่ได้ — ย้ายเข้าใกล้เราเตอร์ ย้ายเราเตอร์ไปกลางบ้าน หรือเพิ่ม Access Point แล้วต่อสาย LAN ไป' }) : null,
        linked && s && s.rssi < -72 ? h('p', { class: 'hint warn', text: 'ต่อได้แต่สัญญาณอ่อน เน็ตจะช้าและหลุดง่าย' }) : null));
    }
    // Wi-Fi แขก ที่เราเตอร์ / Access Point
    if (isAp(dev)) {
      const gst = dev.wifi.guest;
      add(body, h('div', { class: 'prop-section' },
        h('div', { class: 'sec-title', text: 'Wi-Fi แขก (Guest Network)' }),
        h('p', { class: 'hint', text: 'ให้แขกใช้เน็ตได้ แต่มองไม่เห็นกล้องวงจรปิด ปริ้นเตอร์ และเครื่องอื่นในบ้าน' }),
        h('label', { class: 'lp-check' }, h('input', { type: 'checkbox', checked: !!gst, onchange: e => {
          dev.wifi.guest = e.target.checked ? { ssid: (dev.wifi.ssid || 'WiFi') + '-Guest', key: 'guest1234' } : undefined;
          afterChange();
        } }), ' เปิด Wi-Fi แขก'),
        gst ? h('div', { class: 'kv-table' }, h('span', { text: 'ชื่อ (SSID)' }), h('span', { text: gst.ssid }), h('span', { text: 'รหัสผ่าน' }), h('span', { text: gst.key })) : null));
    }
    // Port Forwarding ที่เราเตอร์ที่ทำ NAT
    if (dev.nat && (dev.nat.enabled || dev.kind === 'gateway')) {
      const fw = dev.nat.forwards || (dev.nat.forwards = []);
      const outF = dev.ifaces.find(f => f.name === dev.nat.outside);
      const hosts = [...net.devices.values()].filter(d => d.kind === 'host' && d.ifaces.some(f => K.isIp(f.ip)) && !(outF && d.ifaces.some(f => K.isIp(f.ip) && K.isIp(outF.ip) && NetSim.sameNet(f.ip, outF.ip, outF.mask || '255.255.255.0'))));
      const proto = h('select', {}, h('option', { value: 'TCP', text: 'TCP' }), h('option', { value: 'UDP', text: 'UDP' }));
      const pub = h('input', { type: 'number', min: 1, max: 65535, value: 80, 'aria-label': 'พอร์ตภายนอก' });
      const to = h('select', { 'aria-label': 'เครื่องภายใน' }, hosts.map(d => h('option', { value: K.ipOf(d), text: `${d.name} (${K.ipOf(d)})` })));
      const inPort = h('input', { type: 'number', min: 1, max: 65535, value: 80, 'aria-label': 'พอร์ตภายใน' });
      add(body, h('div', { class: 'prop-section' },
        h('div', { class: 'sec-title', text: 'Port Forwarding (เปิดให้เข้าจากนอกบ้าน)' }),
        h('p', { class: 'hint', text: `จากข้างนอกจะเห็นแค่ IP สาธารณะของเราเตอร์${outF && K.isIp(outF.ip) ? ' (' + outF.ip + ')' : ' (กดรันระบบเพื่อรับ IP)'} ต้องบอกเราเตอร์ว่าพอร์ตไหนให้ส่งต่อไปเครื่องไหน` }),
        fw.length ? h('div', { class: 'acl-list' }, fw.map((r, i) => h('div', { class: 'conn-item' },
          h('span', { text: `${r.proto} ${r.port} → ${r.ip}:${r.toPort || r.port}` }),
          h('button', { class: 'mini-btn danger', title: 'ลบกฎ', onclick: () => { fw.splice(i, 1); afterChange(); } }, icon('fa-trash'))))) : null,
        hosts.length ? h('div', { class: 'pf-form' }, proto, pub, h('span', { text: '→' }), to, inPort,
          h('button', { class: 'btn btn-success', onclick: () => {
            const r = { proto: proto.value, port: Number(pub.value), ip: to.value, toPort: Number(inPort.value) };
            if (!(r.port > 0 && r.toPort > 0) || !K.isIp(r.ip)) return showToast('กรอกพอร์ตและเครื่องให้ครบ', true);
            if (fw.some(x => x.proto === r.proto && Number(x.port) === r.port)) return showToast('พอร์ตนี้ถูกใช้แล้ว', 'warn');
            fw.push(r);
            logConsole(`${dev.name}: Port Forwarding ${r.proto} ${r.port} → ${r.ip}:${r.toPort}`, 'cmd');
            afterChange();
          } }, icon('fa-plus'), ' เพิ่ม')) : h('p', { class: 'hint', text: 'ยังไม่มีเครื่องภายในที่ตั้ง IP' })));
    }
  };
  function afterChange() { net.syncWireless(); rebuildAllCables(); refreshAll(); renderProps(); persist(); }
  LF.signalOf = signalOf;
  LF.grade = grade;
  LF.toggleHeat = toggleHeat;
  LF._heat = heat;

  /* ------------------------- 2. เน็ตบ้านมีปัญหา ------------------------- */
  // จำลองบ้านในเครือข่ายสำเนา: ขอ IP จาก DHCP (เราเตอร์บ้านก่อน แล้วเครื่องลูก)
  function homeSim(n) {
    const c = K.cloneNet(n);
    [...c.devices.values()].sort((a, b) => (b.kind === 'gateway') - (a.kind === 'gateway')).forEach(d => d.ifaces.forEach((f, fi) => {
      if (f.dhcp && c.ifaceUp(d, fi)) c.dhcp(d.id, () => {}, null, fi);
    }));
    c.run(30000);
    return c;
  }
  function simPing(c, name, ip) {
    const d = byName(c, name);
    if (!d || !K.isIp(ip)) return false;
    let ok = false;
    c.ping(d.id, ip, 1, () => {}, r => { ok = r.ok; });
    c.run(6000);
    return ok;
  }
  function simBrowse(c, name, host) {
    const d = byName(c, name);
    if (!d) return { ok: false };
    let res = { ok: false };
    c.browse(d.id, host, () => {}, r => { res = r; });
    c.run(9000);
    return res;
  }
  const ipIn = (c, name) => { const d = byName(c, name); return d ? c.primaryIp(d) : ''; };
  const wanIp = c => { const r = [...c.devices.values()].find(d => d.kind === 'gateway'); const f = r && r.ifaces.find(x => x.name === r.nat.outside); return f ? f.ip : ''; };
  const linkedWifi = (c, name) => { const d = byName(c, name); return !!d && [...c.links.values()].some(l => l.cable === 'wireless' && (l.a.dev === d.id || l.b.dev === d.id)); };
  const tdev = (data, name) => data.devices.find(d => d.name === name);
  const INTERNET = '203.0.113.10';

  const STORIES = [
    { id: 'dns', who: 'แม่', face: '👩', level: 2, title: 'DNS ที่เราเตอร์แจกผิด',
      quote: 'ไลน์ยังส่งได้นะ แต่เปิดเว็บข่าวไม่ได้เลย ขึ้นว่า "หาเว็บไม่เจอ"',
      setup: d => { tdev(d, 'Home-Router').services = { dhcp: { dns: '203.0.113.99' } }; },
      check: c => simPing(c, 'Phone-Mom', INTERNET) && simBrowse(c, 'Phone-Mom', 'www.example.com').ok,
      hints: ['ลอง ping 203.0.113.10 จากมือถือแม่ — ถ้า ping ได้ แปลว่าเน็ตออกได้ แต่ "แปลงชื่อเว็บเป็น IP" ไม่ได้ = ปัญหา DNS',
        'มือถือได้ค่า DNS มาจาก DHCP ของ Home-Router — ดูในแท็บคุณสมบัติของ Home-Router ส่วน DHCP',
        'แก้ DNS ใน DHCP ของ Home-Router เป็น 203.0.113.10 (DNS ของผู้ให้บริการ) แล้วกด "รันระบบ" ให้มือถือขอ IP ใหม่'],
      lesson: 'แอปแชตมักต่อเซิร์ฟเวอร์ด้วย IP ที่จำไว้ จึงยังใช้ได้ แต่เว็บต้องถาม DNS ก่อนว่า "www.example.com" คือ IP อะไร ถ้า DNS ผิด เน็ตจะดูเหมือนเสียทั้งที่สายดี' },
    { id: 'gw', who: 'พี่', face: '🧑', level: 1, title: 'Default Gateway ผิด',
      quote: 'มือถือต่อ Wi-Fi ติดแล้วนะ แต่ขึ้นว่า "เชื่อมต่อแล้ว ไม่มีอินเทอร์เน็ต"',
      setup: d => { const p = tdev(d, 'Phone-Me'); p.ifaces = [{ name: 'Wireless0', dhcp: false, ip: '192.168.0.30', mask: '255.255.255.0', ssid: 'MyHome', key: 'home1234' }]; p.gw = '192.168.0.254'; p.dns = INTERNET; },
      check: c => simPing(c, 'Phone-Me', INTERNET),
      hints: ['ต่อ Wi-Fi ได้ = ชั้นสัญญาณปกติ แต่ออกเน็ตไม่ได้ = มือถือไม่รู้ว่าต้องส่งให้ใคร (Gateway)',
        'มือถือพี่ถูกตั้ง IP เอง (Static) — ดู Default Gateway ว่าตรงกับ IP ของ Home-Router (192.168.0.1) ไหม',
        'แก้ Gateway เป็น 192.168.0.1 หรือติ๊ก "รับ IP อัตโนมัติจาก DHCP" แล้วรันระบบ'],
      lesson: '"ไม่มีอินเทอร์เน็ต" ทั้งที่ต่อ Wi-Fi ติด มักเกิดจากตั้ง IP เองผิด โดยเฉพาะ Gateway — ใช้ DHCP ให้เราเตอร์แจกค่าที่ถูกให้จะปลอดภัยกว่า' },
    { id: 'pool', who: 'ญาติ', face: '👨‍👩‍👧', level: 2, title: 'IP ใน DHCP Pool หมด',
      quote: 'มาเที่ยวบ้าน 2 คน ใส่รหัส Wi-Fi ถูกแล้ว แต่มือถือหมุนค้าง "กำลังรับที่อยู่ IP..."',
      setup: d => {
        tdev(d, 'Home-Router').services = { dhcp: { count: 3 } };
        d.devices.push({ id: 21, model: 'SMARTPHONE-PT', name: 'Guest-1', ifaces: [{ name: 'Wireless0', dhcp: true, ssid: 'MyHome', key: 'home1234' }], x: -1.2, z: -2.2 },
          { id: 22, model: 'SMARTPHONE-PT', name: 'Guest-2', ifaces: [{ name: 'Wireless0', dhcp: true, ssid: 'MyHome', key: 'home1234' }], x: 0.2, z: -3.4 });
      },
      check: c => simPing(c, 'Guest-1', INTERNET) && simPing(c, 'Guest-2', INTERNET),
      hints: ['รหัสถูกและสัญญาณดี แต่ไม่ได้ IP → ดูที่ผู้แจก IP คือ DHCP ของ Home-Router',
        'ดูในแท็บเหตุการณ์ จะเห็นข้อความ "DHCP Pool เต็ม" — เราเตอร์ตั้งให้แจกได้แค่ 3 เครื่อง',
        'เพิ่มจำนวนเครื่องสูงสุด (Maximum Users) ใน DHCP ของ Home-Router เป็น 50 แล้วรันระบบ'],
      lesson: 'DHCP แจก IP จากช่วงที่กำหนด (Pool) ถ้าในบ้านมีมือถือ ทีวี กล้อง หลายเครื่องเกินช่วงนั้น เครื่องที่มาทีหลังจะไม่ได้ IP' },
    { id: 'conflict', who: 'พ่อ', face: '👨', level: 3, title: 'IP ชนกัน (IP Conflict)',
      quote: 'พ่อตั้ง IP กล้องวงจรปิดเองเมื่อวาน ตอนนี้สั่งปริ้นได้บ้างไม่ได้บ้าง กล้องก็เปิดดูไม่ได้',
      setup: d => { tdev(d, 'CCTV-Front').ifaces = [{ name: 'Fa0', ip: '192.168.0.50', mask: '255.255.255.0' }]; },
      check: c => {
        const ips = [...c.devices.values()].flatMap(d => d.ifaces.map(f => f.ip)).filter(K.isIp);
        if (new Set(ips).size !== ips.length) return false;
        return simPing(c, 'Phone-Mom', ipIn(c, 'Printer')) && simPing(c, 'Phone-Mom', ipIn(c, 'CCTV-Front'));
      },
      hints: ['อาการ "ได้บ้างไม่ได้บ้าง" ระหว่างสองเครื่อง มักเป็นเพราะทั้งคู่ใช้ IP เดียวกัน',
        'เปิดแท็บคุณสมบัติของ Printer และ CCTV-Front เทียบ IP Address',
        'เปลี่ยน IP กล้องเป็นเลขที่ไม่ซ้ำ เช่น 192.168.0.60 (และไม่อยู่ในช่วงที่ DHCP แจก)'],
      lesson: 'ถ้าสองเครื่องใช้ IP เดียวกัน ข้อมูลจะวิ่งไปผิดเครื่องสลับไปมา เวลาตั้ง IP เอง ต้องเลือกเลขที่ไม่ซ้ำ และอยู่นอกช่วงที่ DHCP แจก' },
    { id: 'coverage', who: 'น้อง', face: '👧', level: 2, title: 'สัญญาณ Wi-Fi ไม่ถึงห้องนอน', badge: 'wifi_master',
      quote: 'ห้องนอนหนูเน็ตไม่ถึงเลย ทำการบ้านออนไลน์ไม่ได้ ต้องออกมานั่งหน้าห้อง',
      setup: () => {},
      check: c => linkedWifi(c, 'NB-Room2') && simPing(c, 'NB-Room2', INTERNET),
      hints: ['เปิด "แผนที่สัญญาณ Wi-Fi" (ไอคอน Wi-Fi ซ้ายมือ) — ห้องนอน 2 เป็นสีแดง เพราะไกลและมีผนังปูน 2 ชั้นกั้น',
        'วิธีที่ 1: กด E แล้วย้าย Home-Router ไปไว้กลางบ้าน (โถงทางเดิน) สายที่ต่อเข้าเราเตอร์จะตามไป',
        'วิธีที่ 2: เพิ่ม Access Point (หมวด Wireless) ไว้ในห้องนอน 2 ต่อสาย LAN กลับมาที่ Home-Router แล้วตั้ง SSID "MyHome" รหัส "home1234" เหมือนกัน'],
      lesson: 'Wi-Fi อ่อนลงตามระยะ และผนังปูนแต่ละชั้นลดสัญญาณมาก วางเราเตอร์กลางบ้านในที่โล่ง หรือเพิ่มจุดกระจายสัญญาณ (Access Point / Mesh) ที่เดินสาย LAN ไป จะได้เน็ตทั่วบ้าน' },
    { id: 'printer', who: 'แม่', face: '👩', level: 1, title: 'ปริ้นเตอร์อยู่คนละวงเครือข่าย',
      quote: 'เมื่อวานกดรีเซ็ตปริ้นเตอร์ไป วันนี้สั่งพิมพ์จากมือถือไม่ออกเลย ไฟเครื่องก็ติดปกตินะ',
      setup: d => { const p = tdev(d, 'Printer'); p.ifaces = [{ name: 'Fa0', ip: '192.168.1.50', mask: '255.255.255.0' }]; p.gw = '192.168.1.1'; },
      check: c => simPing(c, 'Phone-Mom', ipIn(c, 'Printer')) && ipIn(c, 'Printer').startsWith('192.168.0.'),
      hints: ['ไฟติด สายเสียบอยู่ แต่สั่งพิมพ์ไม่ได้ → ดูการตั้งค่า IP ของปริ้นเตอร์',
        'หลังรีเซ็ต ปริ้นเตอร์กลับไปใช้ IP ค่าโรงงาน 192.168.1.50 ซึ่งอยู่คนละวงกับบ้าน (192.168.0.x)',
        'ตั้ง IP ปริ้นเตอร์เป็น 192.168.0.50 Gateway 192.168.0.1'],
      lesson: 'อุปกรณ์ที่ถูกรีเซ็ตจะกลับไปใช้ค่าโรงงาน ถ้า IP คนละวงกับบ้าน เครื่องอื่นจะคุยด้วยไม่ได้ แม้สายและไฟจะปกติ' },
    { id: 'cctv', who: 'พ่อ', face: '👨', level: 3, title: 'ดูกล้องจากนอกบ้าน (Port Forwarding)',
      quote: 'ไปทำงานอยู่ อยากเปิดดูกล้องหน้าบ้านจากมือถือ (ใช้เน็ต 4G) ทำยังไงดี',
      setup: () => {},
      check: c => { const r = simBrowse(c, 'Phone-4G', wanIp(c)); return !!(r.ok && r.response && r.response.server === 'CCTV-Front'); },
      hints: ['มือถือ 4G อยู่นอกบ้าน มองเห็นแค่ IP สาธารณะของ Home-Router — เครื่องในบ้านถูก NAT ซ่อนไว้',
        'กด "รันระบบ" แล้วดู IP ฝั่ง Internet ของ Home-Router ในแท็บคุณสมบัติ (ส่วน Port Forwarding จะบอก IP นี้)',
        'เพิ่ม Port Forwarding ที่ Home-Router: TCP 80 → 192.168.0.60 พอร์ต 80 แล้วทดสอบเว็บจาก Phone-4G ไปที่ IP สาธารณะนั้น'],
      lesson: 'NAT กันไม่ให้คนข้างนอกเข้าเครื่องในบ้านได้เอง Port Forwarding คือการบอกเราเตอร์ว่า "ใครเข้ามาพอร์ตนี้ ส่งต่อให้กล้อง" — ต้องตั้งรหัสกล้องให้แข็งแรงด้วย เพราะทุกคนในอินเทอร์เน็ตเข้ามาที่พอร์ตนี้ได้' }
  ];
  const story = { cur: null, hints: 0, startedAt: 0, solved: false, gaveUp: false, backup: null, last: null };
  const solvedIds = () => { const p = LP.getProgress(); return new Set(STORIES.map(s => s.id).filter(id => p && p.once.includes('story-' + id))); };

  async function startStory(s) {
    if (pumping) return showToast('กำลังจำลองอยู่ รอให้จบก่อน', true);
    const ok = await UI.confirm({ title: `เรื่องของ${s.who}: "${s.quote}"`, message: 'ห้องจะเปลี่ยนเป็น "บ้านของฉัน" ที่มีปัญหานี้อยู่ งานเดิมของคุณถูกเก็บไว้ และจะกลับมาเมื่อกด "กลับห้องเดิม"', confirmText: 'เริ่มช่วยแก้' });
    if (!ok) return;
    if (activity) stopActivity();
    if (!story.backup) story.backup = { net: net.serialize(), room: $('roomSizeSelect').value };
    await persist();
    LP.suspendSave = true;
    K.clearFaults();
    if (viewMode === '360') switchViewMode('3d');
    const t = BIG_TEMPLATES.home;
    const data = { room: t.room, devices: clone(t.devices), links: t.links.map(x => x.slice()) };
    s.setup(data);
    currentZone = null;
    loadTemplateData(data);
    lastSiteKey = 'home';
    clearEventList();
    selectDevice3D(null);
    refreshAll();
    reset3DCamera();
    Object.assign(story, { cur: s, hints: 0, startedAt: Date.now(), solved: false, gaveUp: false, last: null });
    document.body.classList.add('case-on');
    logConsole(`[เน็ตบ้าน] ${s.who}: "${s.quote}"`, 'warn');
    K.openTool('home', true);
  }
  function checkStory() {
    const s = story.cur;
    if (!s || story.solved) return;
    const ok = !!s.check(homeSim(net));
    story.last = ok;
    if (ok) {
      story.solved = true;
      const before = solvedIds().size;
      const badges = s.badge ? [s.badge] : [];
      if (before + 1 >= 5) badges.push('home_hero');
      LP.awardXp({ xp: Math.max(20, 40 + s.level * 20 - story.hints * 15), reason: `แก้ปัญหาเน็ตบ้าน: ${s.title}`, once: 'story-' + s.id, badges });
      saveReport('ผ่าน', { activity: `เน็ตบ้านมีปัญหา: ${s.title}`, score: `${Math.max(1, 3 - story.hints)}★`, time: K.fmtTime(Date.now() - story.startedAt) });
      celebrateNetwork();
    } else showToast('ยังไม่หาย — ลองตรวจอีกนิด หรือขอคำใบ้', 'warn');
    K.renderDrawer();
  }
  function exitStory(silent) {
    LP.suspendSave = false;
    document.body.classList.remove('case-on');
    if (story.backup) {
      $('roomSizeSelect').value = story.backup.room;
      net = NetSim.Network.load(story.backup.net);
      populateScene();
      refreshAll();
      selectDevice3D(null);
      reset3DCamera();
    }
    Object.assign(story, { cur: null, backup: null, solved: false });
    if (!silent) showToast('กลับสู่ห้องเดิมแล้ว');
    K.renderDrawer();
  }
  function renderStoryDrawer(body) {
    const s = story.cur;
    if (!s) {
      const done = solvedIds();
      add(body,
        h('p', { class: 'lp-lead', text: 'ปัญหาเน็ตที่เจอกันทุกบ้าน เลือกเรื่องที่อยากช่วยแก้ ห้องจะเปลี่ยนเป็นบ้านที่มีปัญหานั้นอยู่ (ซ่อมวิธีไหนก็ได้ ขอแค่อาการหาย)' }),
        h('div', { class: 'story-list' }, STORIES.map(st => h('button', { class: 'story-card' + (done.has(st.id) ? ' done' : ''), onclick: () => startStory(st) },
          h('span', { class: 'story-face', text: st.face }),
          h('span', { class: 'story-txt' }, h('b', { text: `${st.who}: "${st.quote}"` }),
            h('small', {}, h('span', { class: 'story-lv', text: '●'.repeat(st.level) + '○'.repeat(3 - st.level) }), done.has(st.id) ? ` แก้แล้ว · ${st.title}` : '')),
          done.has(st.id) ? icon('fa-circle-check') : icon('fa-chevron-right')))),
        h('p', { class: 'hint', text: `แก้แล้ว ${done.size}/${STORIES.length} เรื่อง · ครบ 5 เรื่องได้เหรียญ "ช่างเน็ตประจำบ้าน"` }),
        story.backup ? h('button', { class: 'btn lp-wide', onclick: () => exitStory() }, icon('fa-door-open'), ' กลับห้องเดิม') : null);
      return;
    }
    add(body,
      h('div', { class: 'chat' },
        h('span', { class: 'story-face big', text: s.face }),
        h('div', { class: 'bubble' }, h('small', { text: s.who }), h('p', { text: s.quote }))),
      story.solved
        ? h('div', { class: 'doc-card ok' }, h('div', { class: 'doc-title' }, icon('fa-house-circle-check'), ` แก้ได้แล้ว! (${s.title})`), h('p', { text: s.lesson }),
            h('div', { class: 'chat reply' }, h('div', { class: 'bubble' }, h('p', { text: `ขอบใจมากนะ ใช้ได้แล้ว! 🎉` })), h('span', { class: 'story-face', text: s.face })))
        : story.last === false ? h('div', { class: 'doc-card bad' }, h('div', { class: 'doc-title' }, icon('fa-triangle-exclamation'), ' ตรวจแล้ว อาการยังอยู่'), h('p', { text: 'ลองแก้ต่อ อย่าลืมกด "รันระบบ" ถ้าแก้เรื่อง DHCP / IP' })) : null,
      story.hints ? h('div', { class: 'doc-sec' }, h('b', { text: 'คำใบ้' }), h('ol', {}, s.hints.slice(0, story.hints).map(t => h('li', { text: t })))) : null,
      story.gaveUp && !story.solved ? h('div', { class: 'doc-sec' }, h('b', { text: `เฉลย: ${s.title}` }), h('p', { text: s.hints[s.hints.length - 1] }), h('p', { text: s.lesson })) : null,
      h('div', { class: 'lp-actions' },
        story.solved ? null : h('button', { class: 'btn btn-primary', onclick: checkStory }, icon('fa-clipboard-check'), ' ตรวจว่าหายหรือยัง'),
        story.solved || story.hints >= s.hints.length ? null : h('button', { class: 'btn', onclick: () => { story.hints++; K.renderDrawer(); } }, icon('fa-lightbulb'), ` ขอคำใบ้ (${story.hints}/${s.hints.length})`),
        story.solved || story.gaveUp ? null : h('button', { class: 'btn', onclick: () => { story.gaveUp = true; K.renderDrawer(); } }, icon('fa-flag'), ' ดูเฉลย'),
        h('button', { class: 'btn', onclick: () => { Object.assign(story, { cur: null }); K.renderDrawer(); } }, icon('fa-list'), ' เรื่องอื่น'),
        h('button', { class: 'btn', onclick: () => exitStory() }, icon('fa-door-open'), ' กลับห้องเดิม')));
  }
  Object.assign(LF, { STORIES, homeSim, simPing, simBrowse, wanIp, startStory, checkStory, exitStory, _story: story });

  /* ----------------------- 3. ความเร็วเน็ต & ปิง (QoS) ----------------------- */
  const ACTS = {
    idle: { th: 'ไม่ได้ใช้', need: 0 },
    web: { th: 'เล่นโซเชียล / เว็บ', need: 3 },
    hd: { th: 'ดูวิดีโอ Full HD', need: 8, video: true },
    yt4k: { th: 'ดูวิดีโอ 4K', need: 25, video: true },
    zoom: { th: 'เรียน / ประชุมออนไลน์', need: 4, live: true },
    game: { th: 'เล่นเกมออนไลน์', need: 1, live: true },
    dl: { th: 'ดาวน์โหลดเกม / ไฟล์ใหญ่', need: Infinity, greedy: true }
  };
  const speed = { plan: 300, qos: false, acts: {}, res: null };
  function linkCap(d) {
    const l = [...net.links.values()].find(x => x.data && x.up && (x.a.dev === d.id || x.b.dev === d.id));
    if (!l) return { cap: 0, how: 'ไม่ได้เชื่อมต่อ' };
    if (l.cable !== 'wireless') return { cap: 1000, how: 'สาย LAN' };
    const sg = signalOf(d), r = sg ? sg.rssi : -200;
    return { cap: r >= -55 ? 600 : r >= -67 ? 300 : r >= -75 ? 80 : r >= -80 ? 20 : 0, how: `Wi-Fi ${r} dBm`, rssi: r };
  }
  function speedDevices() {
    return [...net.devices.values()].filter(d => d.kind === 'host' && !d.spec.server && d.ifaces.length && d.ports.some(p => p.media === 'copper' || p.media === 'wlan')).slice(0, 10);
  }
  function computeSpeed() {
    const devs = speedDevices();
    const rows = devs.map(d => {
      const a = ACTS[speed.acts[d.id] || 'idle'], lc = linkCap(d);
      return { d, a, lc, demand: Math.min(a.need, lc.cap), alloc: 0 };
    });
    // แบ่งแบนด์วิดท์แบบยุติธรรม (water-filling) ถ้าเปิด QoS ให้งานสดได้ก่อน
    const fill = (list, cap) => {
      let left = cap, rest = list.filter(r => r.demand > 0).sort((x, y) => x.demand - y.demand);
      while (rest.length) {
        const share = left / rest.length, r = rest[0];
        if (r.demand <= share) { r.alloc = r.demand; left -= r.demand; rest.shift(); } else { rest.forEach(x => { x.alloc = share; }); left = 0; break; }
      }
      return left;
    };
    let left = speed.plan;
    if (speed.qos) left = fill(rows.filter(r => r.a.live), left);
    fill(rows.filter(r => !(speed.qos && r.a.live)), left);
    const used = rows.reduce((s, r) => s + r.alloc, 0), U = Math.min(1, used / speed.plan);
    const greedy = rows.some(r => r.a.greedy && r.alloc > 0);
    rows.forEach(r => {
      const base = r.lc.how === 'สาย LAN' ? 12 : 16 + (r.lc.rssi !== undefined && r.lc.rssi < -70 ? 25 : 0);
      const queue = speed.qos && r.a.live ? 3 : greedy ? 90 + 140 * U : (U > 0.8 ? Math.round(60 * (U - 0.8) / 0.2) : 0);
      r.ping = Math.round(base + queue);
      if (!r.a.need) r.status = { t: '—', c: '' };
      else if (r.lc.cap === 0) r.status = { t: 'ต่อเน็ตไม่ได้', c: 'bad' };
      else if (r.a.live) r.status = r.ping > 100 ? { t: r.a === ACTS.game ? 'แลค!' : 'ภาพค้าง เสียงขาด', c: 'bad' } : r.ping > 60 ? { t: 'หน่วงนิดๆ', c: 'mid' } : { t: 'ลื่น', c: 'ok' };
      else if (r.a.greedy) r.status = { t: `โหลด 50 GB ≈ ${Math.max(1, Math.round(50 * 8000 / Math.max(1, r.alloc) / 60))} นาที`, c: 'ok' };
      else r.status = r.alloc < r.a.need * 0.95 ? { t: r.a.video ? 'กระตุก / หมุนโหลด' : 'ช้า', c: 'mid' } : { t: 'ลื่น', c: 'ok' };
    });
    speed.res = { rows, used, U, greedy };
    K.clearFaults();
    rows.filter(r => r.status.c === 'bad').forEach(r => K.markFault(r.d.id));
    const lives = rows.filter(r => r.a.live);
    if (speed.qos && greedy && lives.length && lives.every(r => r.status.c === 'ok')) LP.awardXp({ xp: 50, reason: 'ใช้ QoS ให้เกม/เรียนออนไลน์ลื่น', once: 'speed-qos', badges: ['speed_guru'] });
    return speed.res;
  }
  function renderSpeedDrawer(body) {
    const devs = speedDevices();
    if (!devs.length) { add(body, h('p', { class: 'hint', text: 'ยังไม่มีเครื่องผู้ใช้ในห้อง ลองโหลดตัวอย่าง "บ้านของฉัน"' })); return; }
    const res = computeSpeed();
    const plan = h('select', { onchange: e => { speed.plan = Number(e.target.value); K.renderDrawer(); } }, [100, 300, 500, 1000].map(v => h('option', { value: v, text: `เน็ตบ้าน ${v} Mbps`, selected: v === speed.plan })));
    add(body,
      h('p', { class: 'lp-lead', text: 'ทุกเครื่องในบ้านแบ่งเน็ตก้อนเดียวกัน เลือกว่าแต่ละเครื่องกำลังทำอะไร แล้วดูว่าใครช้า ใครแลค' }),
      h('div', { class: 'speed-top' }, plan,
        h('label', { class: 'lp-check' }, h('input', { type: 'checkbox', checked: speed.qos, onchange: e => { speed.qos = e.target.checked; K.renderDrawer(); } }), ' เปิด QoS (ให้เกม/เรียนออนไลน์มาก่อน)')),
      h('div', { class: 'speed-total' }, h('span', { text: `ใช้อยู่ ${Math.round(res.used)} / ${speed.plan} Mbps` }), h('div', { class: 'route-meter' }, h('i', { style: `width:${Math.round(res.U * 100)}%` }))),
      h('div', { class: 'speed-rows' }, res.rows.map(r => h('div', { class: 'speed-row' },
        h('div', { class: 'speed-dev' }, h('b', { text: r.d.name }), h('small', { text: `${r.lc.how}${r.lc.cap ? ' · สูงสุด ' + r.lc.cap + ' Mbps' : ''}` })),
        h('select', { 'aria-label': 'กิจกรรมของ ' + r.d.name, onchange: e => { speed.acts[r.d.id] = e.target.value; K.renderDrawer(); } },
          Object.entries(ACTS).map(([k, a]) => h('option', { value: k, text: a.th, selected: (speed.acts[r.d.id] || 'idle') === k }))),
        r.a.need ? h('div', { class: 'speed-out' },
          h('span', { text: `${Math.round(r.alloc)} Mbps` }), h('span', { text: `ปิง ${r.ping} ms` }),
          h('em', { class: r.status.c, text: r.status.t })) : null))),
      res.greedy && !speed.qos && res.rows.some(r => r.a.live && r.status.c !== 'ok')
        ? h('div', { class: 'doc-card bad' }, h('p', { text: 'มีเครื่องโหลดไฟล์ใหญ่ เราเตอร์เลยมีคิวข้อมูลยาว (Bufferbloat) แพ็กเก็ตเกมต้องรอคิว ปิงจึงสูง — ลองเปิด QoS' })) : null,
      h('div', { class: 'prop-section lp-box' },
        h('div', { class: 'sec-title', text: 'เครื่องคิดเลข: โหลดไฟล์ใช้เวลาเท่าไร' }),
        (() => {
          const gb = h('input', { type: 'number', min: 0.1, step: 0.1, value: 50, 'aria-label': 'ขนาดไฟล์ GB' });
          const mb = h('input', { type: 'number', min: 1, value: speed.plan, 'aria-label': 'ความเร็ว Mbps' });
          const out = h('p', { class: 'calc-out' });
          const calc = () => {
            const sec = Number(gb.value) * 8000 / Math.max(1, Number(mb.value));
            out.textContent = `${mb.value} Mbps = ${(Number(mb.value) / 8).toFixed(1)} MB/วินาที → ไฟล์ ${gb.value} GB ใช้เวลา ≈ ${sec >= 3600 ? (sec / 3600).toFixed(1) + ' ชั่วโมง' : sec >= 60 ? Math.round(sec / 60) + ' นาที' : Math.round(sec) + ' วินาที'}`;
          };
          gb.oninput = calc; mb.oninput = calc; calc();
          return h('div', {}, h('div', { class: 'calc-row' }, gb, h('span', { text: 'GB ด้วยเน็ต' }), mb, h('span', { text: 'Mbps' })), out,
            h('small', { class: 'hint', text: 'b เล็ก = บิต, B ใหญ่ = ไบต์ (1 ไบต์ = 8 บิต) ผู้ให้บริการบอกเป็น Mbps แต่โปรแกรมโหลดมักแสดง MB/s' }));
        })()));
  }

  /* -------------------------- 4. ท่องเน็ตปลอดภัย -------------------------- */
  const safe = { tab: 'cafe', victim: null, server: null, https: false, seen: { http: false, https: false }, capture: null, guest: null, guestRes: null };
  async function runCafe() {
    if (pumping) return showToast('กำลังจำลองอยู่ รอให้จบก่อน', true);
    const V = devOf(safe.victim), S = devOf(safe.server);
    if (!V || !S || !K.ipOf(S)) return showToast('เลือกเครื่องที่ใช้ Wi-Fi และเว็บไซต์ปลายทาง', true);
    if (viewMode === '360') switchViewMode('3d');
    addEventSep(`${V.name} ล็อกอินเว็บ ${S.name} ${safe.https ? '(HTTPS)' : '(HTTP)'}`);
    let res = null;
    net.browse(V.id, K.ipOf(S), (t, c) => logConsole(`[${V.name}] ${t}`, c || ''), r => { res = r; });
    await pump();
    const ses = LP._rec.sessions[0];
    const air = [];
    (ses ? ses.steps : []).forEach(st => st.tx.forEach(e => {
      const l = net.links.get(e.link);
      if (l && l.cable === 'wireless' && (e.from === V.id || e.to === V.id) && e.frame.type === 'IPv4' && e.frame.pkt.proto === 'TCP') air.push(e);
    }));
    const lock = safe.https;
    safe.seen[lock ? 'https' : 'http'] = true;
    safe.capture = { ok: res && res.ok, lock, rows: air.slice(0, 8).map(e => {
      const d = e.frame.pkt.data, out = e.from === V.id;
      let text;
      if (d.app === 'HTTP' && d.msg && d.msg.method) text = lock ? '🔒 TLS Application Data · 17 03 03 01 2c 9f e4 0b 7a … (อ่านไม่ออก)' : `POST /login  user=somchai&password=Somchai1234  (Host: ${S.name})`;
      else if (d.app === 'HTTP' && d.msg) text = lock ? '🔒 TLS Application Data · 17 03 03 05 91 c2 3d 88 … (อ่านไม่ออก)' : `HTTP 200 OK — "${d.msg.title}" ข้อมูลบัญชี: ยอดเงิน 25,430 บาท`;
      else text = `TCP ${d.flags} (เปิด/ปิดการเชื่อมต่อ — เห็นได้เสมอ)`;
      return { out, text, secret: d.app === 'HTTP' && !lock };
    }) };
    if (safe.seen.http && safe.seen.https) LP.awardXp({ xp: 40, reason: 'เข้าใจ HTTP กับ HTTPS บน Wi-Fi สาธารณะ', once: 'safe-https', badges: ['safe_surfer'] });
    K.renderDrawer();
  }
  function guestTest() {
    const ap = devOf(safe.guest && safe.guest.ap), G = devOf(safe.guest && safe.guest.dev);
    if (!ap || !G) return;
    const c = homeSim(net);
    const inside = [...c.devices.values()].filter(d => d.kind === 'host' && d.id !== G.id && c.primaryIp(d) && c.primaryIp(ap ? c.devices.get(ap.id) : d) && d.ifaces.some(f => K.isIp(f.ip) && f.ip.startsWith('192.168.')))[0];
    const outside = [...c.devices.values()].find(d => d.kind === 'host' && d.spec.server && d.ifaces.some(f => K.isIp(f.ip) && !f.ip.startsWith('192.168.') && !f.ip.startsWith('10.')));
    const g = c.devices.get(G.id);
    const joined = [...c.links.values()].some(l => l.cable === 'wireless' && l.guest && (l.a.dev === G.id || l.b.dev === G.id));
    safe.guestRes = {
      joined,
      net: outside ? simPing(c, g.name, c.primaryIp(outside)) : null, netName: outside ? outside.name : '',
      lan: inside ? simPing(c, g.name, c.primaryIp(inside)) : null, lanName: inside ? inside.name : ''
    };
    if (joined && safe.guestRes.net && safe.guestRes.lan === false) LP.awardXp({ xp: 30, reason: 'ใช้ Wi-Fi แขกแยกเครื่องในบ้าน', once: 'safe-guest' });
    K.renderDrawer();
  }
  function renderSafeDrawer(body) {
    add(body, h('div', { class: 'seg lp-seg lp-tabs' },
      h('button', { class: safe.tab === 'cafe' ? 'active' : '', onclick: () => { safe.tab = 'cafe'; K.renderDrawer(); } }, icon('fa-mug-hot'), ' Wi-Fi ร้านกาแฟ'),
      h('button', { class: safe.tab === 'guest' ? 'active' : '', onclick: () => { safe.tab = 'guest'; K.renderDrawer(); } }, icon('fa-user-group'), ' Wi-Fi แขก')));
    const wl = [...net.devices.values()].filter(d => d.kind === 'host' && [...net.links.values()].some(l => l.cable === 'wireless' && (l.a.dev === d.id || l.b.dev === d.id)));
    if (safe.tab === 'cafe') {
      const servers = [...net.devices.values()].filter(d => d.services && d.services.http && d.services.http.enabled && K.ipOf(d));
      if (!wl.length || !servers.length) { add(body, h('p', { class: 'hint', text: 'ต้องมีเครื่องที่ต่อ Wi-Fi อยู่ และเว็บเซิร์ฟเวอร์ 1 เครื่อง — ลองโหลด "บ้านของฉัน" แล้วกดรันระบบ' })); return; }
      if (!wl.some(d => d.id === safe.victim)) safe.victim = wl[0].id;
      if (!servers.some(d => d.id === safe.server)) safe.server = (servers.find(d => !K.ipOf(d).startsWith('192.168.')) || servers[0]).id;
      const sv = K.devSelect('cafeV', wl, safe.victim, true), ss = K.devSelect('cafeS', servers, safe.server, true);
      sv.onchange = () => { safe.victim = Number(sv.value); };
      ss.onchange = () => { safe.server = Number(ss.value); };
      const cap = safe.capture;
      add(body,
        h('p', { class: 'lp-lead', text: 'Wi-Fi ฟรีที่ไม่มีรหัส ข้อมูลลอยในอากาศให้ทุกคนในร้านดักฟังได้ ลองล็อกอินเว็บแบบ HTTP แล้วเทียบกับ HTTPS (มีรูปกุญแจ) ว่าคนแอบดักเห็นอะไร' }),
        K.row('มือถือที่ใช้ Wi-Fi', sv), K.row('เว็บที่ล็อกอิน', ss),
        h('label', { class: 'lp-check' }, h('input', { type: 'checkbox', checked: safe.https, onchange: e => { safe.https = e.target.checked; } }), ' เว็บนี้ใช้ HTTPS 🔒'),
        h('button', { class: 'btn btn-primary lp-wide', onclick: runCafe }, icon('fa-right-to-bracket'), ' ล็อกอินเว็บ (มีคนแอบดักอยู่)'),
        cap ? h('div', { class: 'doc-card ' + (cap.lock ? 'ok' : 'bad') },
          h('div', { class: 'doc-title' }, icon(cap.lock ? 'fa-lock' : 'fa-user-secret'), cap.lock ? ' คนแอบดักเห็นแต่ข้อมูลที่เข้ารหัส' : ' คนแอบดักเห็นรหัสผ่านของคุณ!'),
          h('div', { class: 'sniff' }, cap.rows.map(r => h('div', { class: 'sniff-row' + (r.secret ? ' secret' : '') }, h('i', { text: r.out ? '↑' : '↓' }), h('code', { text: r.text })))),
          h('p', { text: cap.lock ? 'HTTPS เข้ารหัสข้อมูลก่อนส่ง คนดักได้แค่ตัวอักษรมั่วๆ แต่ยังรู้ว่าคุณเข้าเว็บไหน — ถ้าจำเป็นต้องใช้ Wi-Fi ฟรี ให้ใช้เฉพาะเว็บ/แอปที่มีกุญแจ' : 'HTTP ส่งข้อมูลแบบตัวอักษรธรรมดา ใครอยู่ใน Wi-Fi เดียวกันก็อ่านได้ ห้ามล็อกอินหรือทำธุรกรรมบนเว็บที่ไม่มีกุญแจ 🔒 โดยเฉพาะบน Wi-Fi สาธารณะ' })) : null);
      return;
    }
    const aps = [...net.devices.values()].filter(isAp);
    if (!aps.length || !wl.length) { add(body, h('p', { class: 'hint', text: 'ต้องมีเราเตอร์ Wi-Fi และเครื่องที่ต่อ Wi-Fi อยู่ — ลองโหลด "บ้านของฉัน" แล้วกดรันระบบ' })); return; }
    if (!safe.guest || !devOf(safe.guest.ap)) safe.guest = { ap: aps[0].id, dev: wl[wl.length - 1].id };
    const AP = devOf(safe.guest.ap);
    const sa = K.devSelect('gAp', aps, safe.guest.ap), sd = K.devSelect('gDev', wl.concat([...net.devices.values()].filter(d => d.ports.some(p => p.media === 'wlan') && !wl.includes(d))), safe.guest.dev);
    sa.onchange = () => { safe.guest.ap = Number(sa.value); K.renderDrawer(); };
    sd.onchange = () => { safe.guest.dev = Number(sd.value); };
    const R = safe.guestRes;
    const mark = v => v === null ? '—' : v ? '✅ ได้' : '⛔ ไม่ได้';
    add(body,
      h('p', { class: 'lp-lead', text: 'เพื่อนมาบ้านขอรหัส Wi-Fi? ให้ต่อ Wi-Fi แขกแทน แขกจะออกเน็ตได้ แต่เข้ากล้องวงจรปิด ปริ้นเตอร์ หรือคอมในบ้านไม่ได้' }),
      K.row('เราเตอร์ / Access Point', sa),
      h('label', { class: 'lp-check' }, h('input', { type: 'checkbox', checked: !!AP.wifi.guest, onchange: e => {
        AP.wifi.guest = e.target.checked ? { ssid: (AP.wifi.ssid || 'WiFi') + '-Guest', key: 'guest1234' } : undefined; afterChange(); safe.guestRes = null; K.renderDrawer();
      } }), ' เปิด Wi-Fi แขก', AP.wifi.guest ? h('code', { text: ` ${AP.wifi.guest.ssid} / ${AP.wifi.guest.key}` }) : null),
      K.row('เครื่องของแขก', sd),
      h('div', { class: 'lp-actions' },
        h('button', { class: 'btn', disabled: !AP.wifi.guest, onclick: () => {
          const G = devOf(Number(sd.value));
          const f = G && G.ifaces.find(x => G.ports[x.ports[0]] && G.ports[x.ports[0]].media === 'wlan');
          if (!f) return showToast('เครื่องนี้ไม่มี Wi-Fi', true);
          Object.assign(f, { ssid: AP.wifi.guest.ssid, key: AP.wifi.guest.key, dhcp: true, ip: '', mask: '' });
          safe.guest.dev = G.id; afterChange(); guestTest();
        } }, icon('fa-wifi'), ' ให้เครื่องนี้ต่อ Wi-Fi แขก'),
        h('button', { class: 'btn btn-primary', onclick: guestTest }, icon('fa-vial'), ' ทดสอบ')),
      R ? h('div', { class: 'doc-card ' + (R.joined && R.net && R.lan === false ? 'ok' : 'bad') },
        h('div', { class: 'kv-table' },
          h('span', { text: 'ต่อ Wi-Fi แขกอยู่' }), h('span', { text: R.joined ? '✅ ใช่' : '— ยังต่อ Wi-Fi หลัก' }),
          h('span', { text: `ออกอินเทอร์เน็ต${R.netName ? ' (' + R.netName + ')' : ''}` }), h('span', { text: mark(R.net) }),
          h('span', { text: `เข้าเครื่องในบ้าน${R.lanName ? ' (' + R.lanName + ')' : ''}` }), h('span', { text: mark(R.lan) })),
        h('p', { text: R.joined ? (R.lan === false ? 'ถูกต้อง! แขกใช้เน็ตได้ แต่แตะอุปกรณ์ในบ้านไม่ได้' : 'ยังเข้าเครื่องในบ้านได้อยู่') : 'ตอนนี้แขกอยู่บน Wi-Fi หลัก จึงเห็นทุกเครื่องในบ้าน — กด "ให้เครื่องนี้ต่อ Wi-Fi แขก"' })) : null);
  }

  /* ----------------------------- ลงทะเบียนเครื่องมือ ----------------------------- */
  LP.addTool({ id: 'wifi', icon: 'fa-wifi', label: 'แผนที่สัญญาณ Wi-Fi', color: '#2dd4bf', action: () => toggleHeat() });
  LP.addTool({ id: 'home', icon: 'fa-house-circle-exclamation', label: 'เน็ตบ้านมีปัญหา', color: '#f472b6', render: renderStoryDrawer });
  LP.addTool({ id: 'speed', icon: 'fa-gauge-high', label: 'ความเร็วเน็ต & ปิง', color: '#facc15', render: renderSpeedDrawer });
  LP.addTool({ id: 'safe', icon: 'fa-user-shield', label: 'ท่องเน็ตปลอดภัย', color: '#22c55e', render: renderSafeDrawer });
  Object.assign(LF, { computeSpeed, _speed: speed, ACTS, runCafe, guestTest, _safe: safe });
})();
