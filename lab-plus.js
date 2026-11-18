/* ==========================================================================
   SimuCore 3D — เครื่องมือเสริมในห้องแล็บ (โหลดหลัง workspace.js)
   --------------------------------------------------------------------------
   1. กล้องติดตามแพ็กเก็ต (Packet POV)   2. ทำไมไม่ติด? (วินิจฉัยอัตโนมัติ)
   3. นักสืบเครือข่าย (โจทย์หาจุดเสีย)     4. มินิเกมเข้าหัวสาย RJ45
   5. โจมตี & ป้องกัน (DDoS / Broadcast Storm + STP)
   6. ไทม์ไลน์ย้อนเวลา                    + XP / เลเวล / เหรียญรางวัล
   ใช้ตัวแปรและฟังก์ชันส่วนกลางของ workspace.js (net, scene, camera, h, icon ฯลฯ)
   ========================================================================== */
(function () {
  'use strict';

  const G = Store.GAME;
  const LP = window.LabPlus = { suspendSave: false, award: awardXp };
  const isIp = s => NetSim.isIp(s || '');
  const ipOf = d => (d ? net.primaryIp(d) : '');
  const nameOf = id => (devOf(id) ? devOf(id).name : '?');
  const hostList = pred => [...net.devices.values()].filter(d => d.kind === 'host' && (!pred || pred(d)));
  const cloneNet = n => NetSim.Network.load(JSON.parse(JSON.stringify(n.serialize())));
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const fmtTime = ms => formatDuration(ms);
  const viewport = () => document.querySelector('.viewport-container');

  function devSelect(id, list, value, withIp) {
    const sel = h('select', { id });
    list.forEach(d => sel.append(h('option', { value: d.id, text: `${d.name}${withIp && ipOf(d) ? ' (' + ipOf(d) + ')' : ''}` })));
    if (value && list.some(d => String(d.id) === String(value))) sel.value = String(value);
    return sel;
  }
  // ใส่ลูกลง DOM โดยข้ามค่าว่าง (append ของเบราว์เซอร์จะพิมพ์คำว่า null ออกมา)
  const add = (el, ...kids) => el.append(...kids.flat().filter(k => k !== null && k !== undefined && k !== false));
  const row = (label, el) => h('div', { class: 'form-group lp-field' }, h('label', { text: label }), el);

  /* ======================================================================
     XP / เลเวล / เหรียญรางวัล
     ====================================================================== */
  let progress = null;
  function renderXp() {
    const chip = $('xpChip');
    if (!chip || !progress) return;
    const L = G.levelOf(progress.xp);
    chip.innerHTML = '';
    chip.append(
      h('span', { class: 'xp-lv', text: 'Lv.' + L.level }),
      h('span', { class: 'xp-meta' },
        h('span', { class: 'xp-title', text: L.title }),
        h('span', { class: 'xp-bar' }, h('i', { style: `width:${L.pct}%` }))),
      h('span', { class: 'xp-num', text: `${progress.xp} XP` }));
    chip.title = L.next ? `อีก ${L.next - progress.xp} XP จะขึ้นเลเวล ${L.level + 1}` : 'เลเวลสูงสุดแล้ว';
  }
  async function loadProgress() {
    try { progress = await Store.progress.get(); renderXp(); } catch (e) { /* ข้าม */ }
  }

  const badgeQueue = [];
  let badgeBusy = false;
  function popBadge(item) {
    badgeQueue.push(item);
    if (!badgeBusy) nextBadge();
  }
  async function nextBadge() {
    const item = badgeQueue.shift();
    if (!item) { badgeBusy = false; return; }
    badgeBusy = true;
    const el = item.level
      ? h('div', { class: 'badge-pop is-level' },
          h('div', { class: 'badge-medal', style: '--b:#fbbf24' }, h('b', { text: item.level.level })),
          h('div', {}, h('small', { text: 'เลเวลอัป!' }), h('strong', { text: `เลเวล ${item.level.level} — ${item.level.title}` })))
      : h('div', { class: 'badge-pop' },
          h('div', { class: 'badge-medal', style: `--b:${item.badge.color}` }, icon(item.badge.icon)),
          h('div', {}, h('small', { text: 'ได้รับเหรียญใหม่' }), h('strong', { text: item.badge.name }), h('span', { text: item.badge.desc })));
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
    await sleep(UI.reduced ? 1800 : 2800);
    el.classList.remove('show');
    await sleep(400);
    el.remove();
    nextBadge();
  }

  async function awardXp(a) {
    try {
      const r = await Store.progress.award(a);
      progress = r.progress;
      renderXp();
      if (r.gained) {
        const chip = $('xpChip');
        if (chip) { chip.classList.remove('gain'); void chip.offsetWidth; chip.classList.add('gain'); }
        UI.toast(`+${r.gained} XP — ${a.reason}`, 'ok', 2600);
      }
      r.newBadges.forEach(id => popBadge({ badge: G.BADGES[id] }));
      if (r.levelUp) popBadge({ level: r.levelUp });
      if (a.labDone) {
        const labs = Object.keys(SimActivities.ACTIVITIES);
        if (labs.every(l => progress.once.includes('lab-done-' + l))) awardXp({ xp: 300, reason: 'ทำภารกิจครบทุกบท', once: 'all-labs', badges: ['all_labs'] });
      }
      return r;
    } catch (e) { return null; }
  }

  function openBadges() {
    if (!progress) return;
    const L = G.levelOf(progress.xp);
    const body = $('infoModalBody');
    $('infoModalTitle').textContent = 'เลเวลและเหรียญรางวัล';
    body.innerHTML = '';
    add(body, 
      h('div', { class: 'lv-card' },
        h('div', { class: 'badge-medal big', style: '--b:#a855f7' }, h('b', { text: L.level })),
        h('div', { class: 'lv-text' },
          h('strong', { text: L.title }),
          h('div', { class: 'xp-bar wide' }, h('i', { style: `width:${L.pct}%` })),
          h('span', { text: L.next ? `${progress.xp} / ${L.next} XP — อีก ${L.next - progress.xp} XP ขึ้นเลเวล ${L.level + 1}` : `${progress.xp} XP — เลเวลสูงสุด` }))),
      h('div', { class: 'badge-grid' }, Object.entries(G.BADGES).map(([id, b]) => {
        const got = progress.badges[id];
        return h('div', { class: 'badge-cell' + (got ? ' got' : '') },
          h('div', { class: 'badge-medal', style: `--b:${got ? b.color : '#475569'}` }, icon(got ? b.icon : 'fa-lock')),
          h('strong', { text: b.name }), h('small', { text: b.desc }));
      })),
      progress.log.length ? h('div', { class: 'xp-log' }, h('b', { text: 'ล่าสุด' }),
        progress.log.slice(0, 6).map(l => h('div', {}, h('span', { text: l.reason }), h('em', { text: l.xp ? `+${l.xp} XP` : 'เหรียญ' })))) : null);
    $('infoModal').classList.add('active');
  }

  /* ======================================================================
     บันทึกเหตุการณ์ทุกขั้น (ใช้กับไทม์ไลน์) + เลือกแพ็กเก็ตที่กล้องจะตาม
     ====================================================================== */
  const rec = { sessions: [], cur: null, label: 'การจำลอง' };
  const origPlay = playEvents, origPump = pump, origSep = addEventSep, origFly = flyPacket;

  addEventSep = function (text) { rec.label = text; return origSep(text); };

  playEvents = function (events) {
    if (!rec.cur) rec.cur = { label: rec.label, at: new Date(), steps: [] };
    const tx = events.filter(e => e.kind === 'tx');
    const notes = events.filter(e => e.kind !== 'tx');
    if (rec.cur.steps.length < 600 && (tx.length || notes.length)) rec.cur.steps.push({ tick: events.length ? events[0].tick : 0, tx, notes });
    if (pov.on) povBeforeStep(tx);
    const p = origPlay(events);
    return pov.on ? p.then(() => povAfterStep(tx, notes)) : p;
  };

  pump = function () {
    const fresh = !pumping;
    const p = origPump();
    if (fresh) p.then(() => {
      if (rec.cur && rec.cur.steps.length) {
        rec.sessions.unshift(rec.cur);
        rec.sessions.length = Math.min(rec.sessions.length, 6);
      }
      rec.cur = null;
      if (tl.open) renderTimeline(0);
    });
    return p;
  };

  /* ======================================================================
     1. กล้องติดตามแพ็กเก็ต (Packet POV)
     ====================================================================== */
  const pov = { on: false, src: null, at: null, target: null, prev: null, hops: 0, path: [], reached: false, back: false, dstIp: '' };
  const isDataFrame = e => e.frame && e.frame.type === 'IPv4' && !(e.frame.pkt.data && (e.frame.pkt.data.flood || e.frame.pkt.data.app === 'DHCP'));

  function povBeforeStep(tx) {
    const data = tx.filter(isDataFrame);
    let t = null;
    if (pov.at !== null) t = data.find(e => e.from === pov.at);
    else if (pov.src !== null) t = data.find(e => e.from === pov.src);
    else t = data[0];
    pov.target = t || null;
    if (!t) {
      const arp = tx.find(e => e.proto === 'ARP' && (pov.at === null || e.from === pov.at));
      if (arp) povStatus(`รอ ARP: ${nameOf(arp.from)} กำลังถามหา MAC ของ ${arp.frame.arp.tpa} ก่อนส่งแพ็กเก็ตต่อ`);
    }
  }

  function povAfterStep(tx, notes) {
    const e = pov.target;
    if (!e) return;
    const f = e.frame;
    pov.hops++;
    pov.at = e.to;
    if (!pov.path.length) pov.path.push(e.from);
    pov.path.push(e.to);
    const here = notes.filter(n => n.dev === e.to && n.kind !== 'storm').map(n => n);
    const dst = devOf(e.to);
    if (dst && dst.ifaces.some(x => x.ip === f.pkt.dst)) {
      if (!pov.reached) pov.reached = true;
      else if (pov.reached && e.to === pov.src) pov.back = true;
    }
    renderPovHud(e, here);
    pov.prev = f;
    if (pov.back && pov.reached) awardXp({ xp: 30, reason: 'ตามแพ็กเก็ตไป-กลับครบ', once: 'pov-roundtrip', badges: ['pov'] });
  }

  // ทำซ้ำ flyPacket ของ workspace.js แต่ช้าลงและให้กล้องบินตามแพ็กเก็ตที่เลือก
  flyPacket = function (ev, dur) {
    if (!pov.on) return origFly(ev, dur);
    const link = net.links.get(ev.link);
    if (!cables.has(ev.link) || !link) return Promise.resolve();
    const forward = link.a.dev === ev.from;
    const mine = ev === pov.target;
    const pkt = makePacket(ev.proto);
    if (mine) pkt.scale.setScalar(1.35);
    scene.add(pkt);
    const dir = new THREE.Vector3(), want = new THREE.Vector3();
    return tween(dur * 2.2, k => {
      const cable = cables.get(ev.link);
      if (!cable) return;
      const t = ease(k);
      const p = cable.curve.getPoint(forward ? t : 1 - t);
      pkt.position.copy(p);
      pkt.userData.body.rotation.y += 0.09;
      if (!mine) return;
      try {
        const q = cable.curve.getPoint(forward ? Math.min(1, t + 0.04) : Math.max(0, 1 - t - 0.04));
        dir.subVectors(q, p); dir.y = 0;
        if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
        dir.normalize();
        want.copy(p).addScaledVector(dir, -2.6); want.y = p.y + 1.6;
        camera.position.lerp(want, 0.07);
        controls.target.lerp(p, 0.18);
      } catch (err) { /* กล้องตามไม่ได้ก็ให้แพ็กเก็ตวิ่งต่อ */ }
    }).then(() => scene.remove(pkt));
  };

  function povFields(f) {
    const o = [];
    if (f.srcMac === 'HDLC') o.push(['ชั้น 2', 'HDLC (สาย Serial ไม่ใช้ MAC)']);
    else { o.push(['MAC ต้นทาง', f.srcMac]); o.push(['MAC ปลายทาง', f.dstMac]); }
    const p = f.pkt, d = p.data || {};
    o.push(['IP ต้นทาง', p.src]); o.push(['IP ปลายทาง', p.dst]); o.push(['TTL', String(p.ttl)]);
    if (p.proto === 'ICMP') o.push(['ICMP', `${d.type} · id ${d.id}`]);
    else o.push([p.proto, `พอร์ต ${d.sport} → ${d.dport}${d.flags ? ' · ' + d.flags : ''}${d.app ? ' · ' + d.app : ''}`]);
    return o;
  }
  function povExplain(prev, f) {
    if (!prev) return ['แพ็กเก็ตเริ่มออกจากเครื่องต้นทาง'];
    const a = prev.pkt, b = f.pkt;
    if (a.src === b.dst && a.dst === b.src) return ['นี่คือแพ็กเก็ตตอบกลับ (Reply) — ต้นทาง/ปลายทางสลับกัน'];
    const out = [];
    if (prev.srcMac !== f.srcMac || prev.dstMac !== f.dstMac) out.push('MAC เปลี่ยนใหม่ทุกช่วงสาย (Hop) เพราะชั้น 2 ส่งได้แค่ในวงเดียวกัน');
    if (b.ttl < a.ttl) out.push(`TTL ลดจาก ${a.ttl} เป็น ${b.ttl} — แพ็กเก็ตผ่านเราเตอร์ 1 ตัว`);
    if (a.src !== b.src) out.push(`NAT เปลี่ยน IP ต้นทาง ${a.src} → ${b.src} เพื่อออกอินเทอร์เน็ต`);
    if (a.dst !== b.dst) out.push(`NAT แปลง IP ปลายทางกลับ ${a.dst} → ${b.dst}`);
    if (!out.length) out.push('สวิตช์ส่งต่อเฟรมโดยไม่แก้ไขอะไร (ดู MAC Table แล้วส่งออกพอร์ตเดียว)');
    if (a.dst === b.dst && a.src === b.src && (prev.srcMac !== f.srcMac)) out.push('IP ต้นทาง/ปลายทางยังเหมือนเดิมตลอดทาง');
    return out;
  }
  function povStatus(text) {
    const s = document.querySelector('#povHud .pov-status');
    if (s) s.textContent = text;
  }
  function renderPovHud(e, notesHere) {
    let hud = $('povHud');
    if (!hud) return;
    const f = e.frame;
    const prevFields = pov.prev && !(pov.prev.pkt.src === f.pkt.dst && pov.prev.pkt.dst === f.pkt.src) ? new Map(povFields(pov.prev)) : null;
    hud.innerHTML = '';
    add(hud, 
      h('div', { class: 'pov-head' }, icon('fa-video'), h('b', { text: 'กล้องติดตามแพ็กเก็ต' }), h('span', { class: 'pov-hop', text: `Hop ${pov.hops}` }),
        h('button', { class: 'icon-btn', title: 'หยุดติดตาม', onclick: stopPov }, icon('fa-xmark'))),
      h('div', { class: 'pov-path' }, pov.path.slice(-6).map((id, i, arr) => h('span', { class: 'pov-chip' + (i === arr.length - 1 ? ' here' : ''), text: nameOf(id) }))),
      h('div', { class: 'pov-now' }, h('span', { class: 'ev-badge', style: `background:${hex(PROTO_COLORS[e.proto] || PROTO_COLORS.UDP)}`, text: e.proto }), ` ${e.summary} → ถึง `, h('b', { text: nameOf(e.to) })),
      h('table', { class: 'pov-table' }, povFields(f).map(([k, v]) => {
        const old = prevFields && prevFields.get(k);
        const changed = prevFields && old !== undefined && old !== v;
        return h('tr', { class: changed ? 'chg' : '' }, h('th', { text: k }), h('td', {}, changed ? h('s', { text: old }) : null, h('span', { text: v })));
      })),
      h('ul', { class: 'pov-why' }, povExplain(pov.prev, f).map(t => h('li', { text: t })),
        notesHere.slice(0, 2).map(n => h('li', { class: n.kind === 'drop' ? 'bad' : 'note', text: `${nameOf(n.dev)}: ${n.text}` }))),
      h('div', { class: 'pov-status', text: pov.back ? '✓ แพ็กเก็ตไปถึงปลายทางและตอบกลับมาครบแล้ว' : (pov.reached ? 'ถึงปลายทางแล้ว — รอดูแพ็กเก็ตตอบกลับ' : '') }));
    hud.classList.add('show');
  }

  function startPov(src) {
    pov.on = true; pov.src = src === undefined ? null : src; pov.at = null; pov.prev = null; pov.hops = 0; pov.path = []; pov.reached = false; pov.back = false;
    let hud = $('povHud');
    if (!hud) { hud = h('div', { class: 'pov-hud', id: 'povHud' }); viewport().append(hud); }
    hud.innerHTML = '';
    add(hud, h('div', { class: 'pov-head' }, icon('fa-video'), h('b', { text: 'กล้องติดตามแพ็กเก็ต' }), h('button', { class: 'icon-btn', title: 'หยุดติดตาม', onclick: stopPov }, icon('fa-xmark'))),
      h('div', { class: 'pov-status', text: 'พร้อม — เมื่อมีแพ็กเก็ตวิ่ง กล้องจะบินตามและบอกว่าหัวแพ็กเก็ตเปลี่ยนไปอย่างไรในแต่ละจุด' }));
    hud.classList.add('show');
    document.querySelector('.dock-btn[data-tool="pov"]')?.classList.add('on');
  }
  function stopPov() {
    pov.on = false; pov.target = null;
    const hud = $('povHud');
    if (hud) hud.classList.remove('show');
    document.querySelector('.dock-btn[data-tool="pov"]')?.classList.remove('on');
  }

  function renderPovDrawer(body) {
    const users = hostList(d => isIp(ipOf(d)));
    const all = [...net.devices.values()].filter(d => isIp(ipOf(d)));
    if (users.length < 1 || all.length < 2) {
      add(body, h('p', { class: 'hint', text: 'ต้องมีเครื่องที่ตั้ง IP แล้วอย่างน้อย 2 เครื่อง (ถ้าใช้ DHCP ให้กดรันระบบก่อน)' }));
      return;
    }
    const src = devSelect('povSrc', users, users[0].id, true);
    const dst = devSelect('povDst', all, (all.find(d => d.services && d.services.http && d.services.http.enabled) || all.find(d => d.id !== users[0].id) || all[0]).id, true);
    const kind = h('select', { id: 'povKind' }, h('option', { value: 'ping', text: 'Ping (ICMP)' }), h('option', { value: 'web', text: 'เปิดเว็บ (TCP + HTTP)' }));
    add(body, 
      h('p', { class: 'lp-lead', text: 'ปล่อยแพ็กเก็ต 1 ลูก แล้วให้กล้องบินตามไปทุกอุปกรณ์ ดูว่าที่แต่ละจุด MAC / IP / TTL เปลี่ยนไปอย่างไร (สิ่งที่ Packet Tracer แสดงเป็นตาราง)' }),
      row('ต้นทาง', src), row('ปลายทาง', dst), row('ชนิดแพ็กเก็ต', kind),
      h('button', { class: 'btn btn-primary lp-wide', onclick: () => launchPov(Number(src.value), Number(dst.value), kind.value) }, icon('fa-paper-plane'), ' ปล่อยแพ็กเก็ตและติดตาม'),
      h('label', { class: 'lp-check' }, h('input', { type: 'checkbox', checked: pov.on, onchange: e => (e.target.checked ? startPov() : stopPov()) }), ' ติดตามแพ็กเก็ตทุกครั้งที่รันระบบ / ping'));
  }
  async function launchPov(srcId, dstId, kind) {
    if (pumping) return showToast('กำลังจำลองอยู่ รอให้จบก่อน', true);
    const s = devOf(srcId), d = devOf(dstId);
    if (!s || !d || srcId === dstId) return showToast('เลือกต้นทางและปลายทางคนละเครื่อง', true);
    if (viewMode === '360') switchViewMode('3d');
    startPov(srcId);
    const out = (t, c) => logConsole(`[${s.name}] ${t}`, c || '');
    addEventSep(`กล้องติดตาม: ${s.name} → ${d.name}`);
    if (kind === 'web') net.browse(srcId, ipOf(d), out, () => {});
    else net.ping(srcId, ipOf(d), 1, out, () => {});
    await pump();
    if (!pov.reached) povStatus('แพ็กเก็ตไปไม่ถึงปลายทาง — ลองใช้ "ทำไมไม่ติด?" เพื่อหาสาเหตุ');
  }


  /* ======================================================================
     ตัวช่วย 3D: บินกล้องไปที่อุปกรณ์ / วงแหวนแดงกะพริบบอกจุดเสีย
     ====================================================================== */
  function flyTo(id) {
    const node = nodes.get(Number(id));
    if (!node) return;
    if (viewMode === '360') switchViewMode('3d');
    const p = node.group.position;
    const from = camera.position.clone(), fromT = controls.target.clone();
    const to = new THREE.Vector3(p.x + 2.4, 2.6 + node.height, p.z + 3.0), toT = new THREE.Vector3(p.x, node.height * 0.6, p.z);
    tween(UI.reduced ? 1 : 750, k => { const t = ease(k); camera.position.lerpVectors(from, to, t); controls.target.lerpVectors(fromT, toT, t); });
  }
  const faultRings = new Map();
  function markFault(id) {
    const node = nodes.get(Number(id));
    if (!node || faultRings.has(Number(id))) return;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.045, 10, 48), new THREE.MeshBasicMaterial({ color: 0xff2d55, transparent: true, opacity: 0.95 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(node.group.position.x, 0.06, node.group.position.z);
    scene.add(ring);
    faultRings.set(Number(id), ring);
  }
  function clearFaults() {
    faultRings.forEach(r => { scene.remove(r); r.geometry.dispose(); r.material.dispose(); });
    faultRings.clear();
  }
  frameHooks.add(now => {
    if (!faultRings.size) return;
    const s = 1 + 0.18 * Math.sin(now / 160);
    faultRings.forEach((r, id) => {
      const node = nodes.get(id);
      if (node) r.position.set(node.group.position.x, 0.06, node.group.position.z);
      r.scale.set(s, s, 1);
      r.material.opacity = 0.55 + 0.4 * Math.abs(Math.sin(now / 240));
    });
  });

  /* ======================================================================
     2. ทำไมไม่ติด? — ทดสอบในเครือข่ายสำเนา แล้วอธิบายจุดที่แพ็กเก็ตตายเป็นภาษาไทย
     ====================================================================== */
  // ข้อความ drop ที่เป็นเรื่องปกติของ Broadcast / Flooding ไม่ใช่สาเหตุ
  const BENIGN = /ไม่ใช่ IP ของฉัน|MAC ปลายทางไม่ใช่ของเครื่องนี้|ไม่มีพอร์ตอื่นที่เชื่อมต่อ|ปลายทางอยู่พอร์ตเดียวกับที่รับมา|ไม่ส่งต่อ Broadcast|ไม่ใช่ DHCP Server/;
  const doc = { src: null, dst: null, lastFail: null, result: null };

  function routerIpFor(d) {
    const f = d.ifaces.find(x => isIp(x.ip) && NetSim.isMask(x.mask || ''));
    if (!f) return '';
    for (const r of net.devices.values()) {
      if (r.kind !== 'router' && r.kind !== 'gateway') continue;
      const g = r.ifaces.find(x => isIp(x.ip) && NetSim.sameNet(x.ip, f.ip, f.mask));
      if (g) return g.ip;
    }
    return '';
  }

  function explainDrop(e, c, ctx) {
    const d = c.devices.get(e.dev), real = devOf(e.dev) || d;
    const t = e.text;
    const name = d ? d.name : '?';
    let m;
    const R = (title, why, fix) => ({ dev: e.dev, title, why, fix, raw: t });
    // ปัญหาทางกายภาพที่อุปกรณ์นี้ (สายยาวเกินมาตรฐาน) มาก่อนเรื่องตั้งค่า
    if (real && !/ยาว \d+ ม\./.test(t)) {
      for (const p of real.ports) {
        const l = p.link && net.links.get(p.link);
        const st = l && net.linkStatus(l);
        if (st && st.tooLong) return explainDrop(Object.assign({}, e, { text: `ลิงก์ ${p.name} ดาวน์ (${st.reason})` }), c, ctx);
      }
    }
    if (/ยังไม่ได้ตั้งค่า IP Address/.test(t)) return R(`${name} ยังไม่มี IP Address`, 'เครื่องที่ไม่มี IP ส่งแพ็กเก็ต IPv4 ไม่ได้เลย', [`เลือก ${name} → แท็บคุณสมบัติ → ใส่ IP Address และ Subnet Mask`, 'ถ้าตั้งให้รับจาก DHCP ให้กด "รันระบบ" เพื่อขอ IP']);
    if (/การ์ดเครือข่ายยังไม่ได้เชื่อมต่อ|ลิงก์ดาวน์\)/.test(t) && /ไม่มีเส้นทาง/.test(t)) return R(`การ์ดเครือข่ายของ ${name} ไม่ได้เชื่อมต่อ`, 'มี IP แล้วแต่สายหลุด สายผิดชนิด หรือ Wi-Fi ยังไม่ได้เชื่อม', [`ตรวจไฟลิงก์ที่พอร์ตของ ${name} ต้องเป็นสีเขียว`, 'ถ้าเป็น Wi-Fi ตรวจ SSID และรหัสผ่านให้ตรงกับ Access Point']);
    if (/ยังไม่ได้ตั้ง Default Gateway/.test(t)) {
      const gw = routerIpFor(real);
      return R(`${name} ไม่มี Default Gateway`, 'ปลายทางอยู่คนละวงเครือข่าย เครื่องจึงต้องส่งให้เราเตอร์ (Gateway) ช่วยส่งต่อ แต่ยังไม่ได้บอกว่าเราเตอร์คือใคร', [`ตั้ง Default Gateway ของ ${name}${gw ? ' เป็น ' + gw + ' (IP ของเราเตอร์ฝั่งนี้)' : ' เป็น IP ของเราเตอร์ในวงเดียวกัน'}`]);
    }
    if (/Default Gateway ไม่ได้อยู่ในวงเครือข่ายเดียวกับเครื่อง/.test(t)) {
      const gw = routerIpFor(real);
      return R(`Default Gateway ของ ${name} ผิด`, `Gateway ${real.gw || ''} ไม่อยู่ในวงเดียวกับ IP ของเครื่อง หรือสายไปเราเตอร์ไม่ทำงาน`, [gw ? `แก้ Default Gateway เป็น ${gw}` : 'แก้ Default Gateway ให้อยู่ในวงเดียวกับ IP ของเครื่อง', 'ตรวจ Subnet Mask ของเครื่องด้วย']);
    }
    if ((m = t.match(/ARP หา MAC ของ (\S+) ไม่เจอ/))) {
      const ip = m[1];
      const owner = [...net.devices.values()].find(x => x.ifaces.some(f => f.ip === ip));
      if (!owner) {
        const isGw = real && real.gw === ip;
        return R(`ไม่มีเครื่องไหนใช้ IP ${ip}`, `${name} ตะโกนถาม (ARP Broadcast) ว่า "ใครคือ ${ip}" แต่ไม่มีใครตอบ`, isGw
          ? [`${ip} คือ Default Gateway ของ ${name} — ตรวจว่าตรงกับ IP ของเราเตอร์หรือไม่${routerIpFor(real) ? ' (เราเตอร์ฝั่งนี้คือ ' + routerIpFor(real) + ')' : ''}`]
          : ['ตรวจว่าพิมพ์ IP ปลายทางถูก', 'หรืออินเทอร์เฟซของเราเตอร์ฝั่งนั้นยังไม่ได้ตั้ง IP']);
      }
      const wired = owner.ports.some(p => { const l = p.link && net.links.get(p.link); return l && l.data && l.up; });
      if (!wired) return R(`${owner.name} ไม่ได้เชื่อมต่อสาย`, `${name} ถามหา MAC ของ ${owner.name} (${ip}) แต่ ${owner.name} ไม่มีสายที่ใช้งานได้ จึงไม่ได้ยินคำถาม`, [`ต่อสายจาก ${owner.name} ไปยังสวิตช์ (ไฟลิงก์ต้องเป็นสีเขียว)`]);
      return R(`${owner.name} (${ip}) ไม่ตอบ ARP`, `${name} หา MAC ของ ${owner.name} ไม่เจอ แปลว่าสองเครื่องไม่ได้อยู่บนเครือข่ายเดียวกันจริงๆ`, [`ตรวจสายระหว่าง ${name} กับ ${owner.name} (ไฟลิงก์ต้องเขียวทุกจุด)`, `ตรวจ Subnet Mask ของ ${owner.name} และ ${name} ให้เหมือนกัน`]);
    }
    if ((m = t.match(/ใช้(สาย.+?)ผิดประเภท ต้องใช้(สาย.+?)$/)) || (m = t.match(/ใช้(สาย.+?)ผิดประเภท ต้องใช้(.+)\)/))) return R('ใช้สายผิดชนิด', `${m[1]} ใช้กับอุปกรณ์คู่นี้ไม่ได้ ไฟลิงก์จึงเป็นสีแดง`, [`ลบสายเส้นนี้ แล้วต่อใหม่ด้วย${m[2].replace(/\)$/, '')}`, 'จำง่ายๆ: อุปกรณ์ต่างชนิด (PC–Switch) ใช้สายตรง ชนิดเดียวกัน (PC–PC, Switch–Switch) ใช้สายไขว้']);
    if ((m = t.match(/(สาย.+?)ยาว (\d+) ม\. เกินมาตรฐาน (\d+) ม\./))) return R(`สายยาวเกินมาตรฐาน (${m[2]} ม.)`, `${m[1]}ส่งสัญญาณได้ไกลไม่เกิน ${m[3]} เมตร พอยาวเกิน สัญญาณจะอ่อนจนลิงก์ไม่ขึ้น`, [/LAN/.test(m[1]) ? 'ลบสายเส้นนี้ แล้วต่อใหม่ด้วยสาย Fiber (ต้องใช้พอร์ต Fiber/SFP เช่น Gi0/0/2 ของ ISR4331 หรือ Gi1/1/x ของ 3650)' : 'ย้ายอุปกรณ์ให้ใกล้กันขึ้น', 'หรือวาง Switch เพิ่มคั่นกลางทาง (ทุกช่วงสายต้องไม่เกินมาตรฐาน)']);
    if (/Clock Rate/.test(t)) return R('สาย Serial ยังไม่ได้ตั้ง Clock Rate', 'ฝั่ง DCE ต้องเป็นตัวกำหนดจังหวะสัญญาณ ไม่งั้นลิงก์ไม่ขึ้น', ['เลือกเราเตอร์ฝั่ง DCE → แท็บคุณสมบัติ → ตั้ง Clock Rate เช่น 64000']);
    if (/ไม่ได้เสียบสาย|ไม่มีพอร์ตที่เชื่อมต่ออยู่/.test(t)) return R(`${name} ไม่มีสายเสียบที่พอร์ตที่ต้องใช้`, 'แพ็กเก็ตออกจากเครื่องไม่ได้เพราะไม่มีสาย', [`ต่อสายจาก ${name} ไปยังสวิตช์หรืออุปกรณ์ปลายทาง`]);
    if (/ไม่มีเส้นทางไป (\S+) ใน Routing Table|ไม่มีเส้นทางใน Routing Table/.test(t)) {
      const dst = ctx.dst, f = dst && dst.ifaces.find(x => isIp(x.ip) && NetSim.isMask(x.mask || ''));
      const netw = f ? `${NetSim.netAddr(f.ip, f.mask)} ${f.mask}` : '<วงปลายทาง> <mask>';
      const bare = real && real.ifaces.find((x, i) => !isIp(x.ip) && x.ports.some(pi => real.ports[pi].link));
      if (bare) return R(`อินเทอร์เฟซ ${bare.name} ของ ${name} ยังไม่มี IP`, `${bare.name} ต่อสายอยู่แต่ไม่มี IP เราเตอร์จึงไม่รู้ว่าวงเครือข่ายฝั่งนั้นคืออะไร และส่งต่อไป ${ctx.dst ? ctx.dst.name : 'ปลายทาง'} ไม่ได้`, [`ตั้ง IP ให้ ${bare.name} ของ ${name} (มักเป็น .1 ของวงฝั่งนั้น เช่น Gateway ของเครื่องปลายทาง${ctx.dst && isIp(ctx.dst.gw) ? ' = ' + ctx.dst.gw : ''})`]);
      return R(`${name} ไม่รู้จักเส้นทางไปวงปลายทาง`, 'เราเตอร์รู้จักเฉพาะวงที่ต่อตรง วงที่อยู่ไกลออกไปต้องบอกเส้นทางเพิ่ม (Static Route) หรือใช้ Routing Protocol', [`เพิ่ม Static Route ที่ ${name}: ip route ${netw} <IP เราเตอร์ตัวถัดไป>`, 'หรือเพิ่ม Default Route (0.0.0.0 0.0.0.0) ชี้ไปเราเตอร์ตัวถัดไป']);
    }
    if (/TTL เหลือ 0/.test(t)) return R('แพ็กเก็ตวนลูประหว่างเราเตอร์', 'Static Route ชี้กลับไปกลับมาจน TTL หมด', ['ตรวจ Routing Table ของเราเตอร์ในเส้นทาง (show ip route) ว่าไม่ชี้หากันเอง']);
    if (/NAT: เครื่องภายนอก|ไฟร์วอลล์ปิดกั้น/.test(t)) return R('ถูก NAT / Firewall กั้นไว้ (เป็นเรื่องปกติ)', 'เครื่องจากอินเทอร์เน็ตเริ่มเชื่อมต่อเข้ามาหาเครื่องในบ้านเองไม่ได้ — นี่คือการป้องกันของ NAT', ['ทดสอบจากเครื่องภายในออกไปข้างนอกแทน (ทิศทางนี้ใช้ได้)']);
    if (/ACL|Firewall ของเครื่อง/.test(t)) return R(`${name} มีกฎ ACL / Firewall ปฏิเสธแพ็กเก็ตนี้`, t, ['เปิดเครื่องมือ "โจมตี & ป้องกัน" แล้วลบกฎที่ไม่ต้องการ']);
    if (/CPU 100%|ทำงานหนักเกินไป/.test(t)) return R(`${name} ถูกโจมตีจนรับไม่ไหว`, t, ['ตั้ง ACL ที่เราเตอร์หรือ Firewall ที่เซิร์ฟเวอร์เพื่อกันเครื่องผู้โจมตี']);
    if (/ยังไม่ได้ตั้ง IP → ทิ้ง/.test(t)) return R(`อินเทอร์เฟซของ ${name} ยังไม่มี IP`, 'แพ็กเก็ตเข้ามาถึงพอร์ตที่ยังไม่ได้ตั้ง IP จึงถูกทิ้ง', [`ตั้ง IP ให้อินเทอร์เฟซนั้นของ ${name}`]);
    if (/IP ปลายทาง .* ไม่ใช่ของเครื่องนี้/.test(t)) return R(`แพ็กเก็ตไปผิดเครื่อง (${name})`, 'มักเกิดจาก IP ซ้ำกัน (IP Conflict) ทำให้ ARP ได้ MAC ของอีกเครื่อง', ['ตรวจว่ามีสองเครื่องใช้ IP เดียวกันหรือไม่']);
    return R(`แพ็กเก็ตถูกทิ้งที่ ${name}`, t, ['ดูรายละเอียดในแท็บเหตุการณ์ หรือเปิดกล้องติดตามแพ็กเก็ต']);
  }

  function diagnose(srcId, dstId) {
    const c = cloneNet(net);
    const s = c.devices.get(srcId), d = c.devices.get(dstId);
    const ctx = { dst: d };
    if (!s || !d) return null;
    const dstIp = c.primaryIp(d);
    if (!dstIp) return { ok: false, path: [], verdict: { dev: dstId, title: `${d.name} ยังไม่มี IP Address`, why: 'ต้องมี IP ที่ปลายทางก่อนจึงจะทดสอบได้', fix: [d.ifaces.some(f => f.dhcp) ? 'กด "รันระบบ" ให้เครื่องขอ IP จาก DHCP' : `ตั้ง IP ที่ ${d.name}`] } };
    if (!c.primaryIp(s)) {
      const dh = s.ifaces.some(f => f.dhcp);
      return { ok: false, path: [], verdict: { dev: srcId, title: `${s.name} ยังไม่มี IP Address`, why: dh ? 'ตั้งให้รับ IP จาก DHCP แต่ยังไม่ได้รับ (หรือหา DHCP Server ไม่เจอ)' : 'ยังไม่ได้ตั้ง IP', fix: dh ? ['กด "รันระบบ" เพื่อขอ IP', 'ถ้ายังไม่ได้ ตรวจสาย / Wi-Fi และว่ามี DHCP Server เปิดอยู่ในวงนี้'] : [`ตั้ง IP ที่ ${s.name}`] } };
    }
    let res = null;
    c.ping(srcId, dstIp, 1, () => {}, r => { res = r; });
    const ev = c.run(6000);
    const path = [];
    ev.filter(e => e.kind === 'tx' && e.frame.type === 'IPv4' && e.frame.pkt.proto === 'ICMP' && e.frame.pkt.data.type === 'echo-request')
      .forEach(e => { if (!path.length) path.push(e.from); if (path[path.length - 1] === e.from && !path.includes(e.to)) path.push(e.to); });
    const reached = ev.some(e => e.kind === 'info' && e.dev === dstId && /Echo Request/.test(e.text));
    if (res && res.ok) return { ok: true, path, reached };
    const storm = ev.find(e => e.kind === 'storm');
    const drop = ev.find(e => e.kind === 'drop' && !BENIGN.test(e.text));
    let verdict;
    if (storm) verdict = { dev: null, title: 'เกิด Broadcast Storm', why: 'มีลูประหว่างสวิตช์ เฟรม Broadcast วนไม่รู้จบจนเครือข่ายใช้ไม่ได้', fix: ['ถอดสายที่ทำให้เกิดลูป', 'หรือเปิด Spanning Tree (STP) ในเครื่องมือ "โจมตี & ป้องกัน"'] };
    else if (drop) verdict = explainDrop(drop, c, ctx);
    else verdict = { dev: dstId, title: 'ส่งไปแล้วไม่มีการตอบกลับ', why: 'ไม่พบจุดที่แพ็กเก็ตถูกทิ้งชัดเจน', fix: ['ลองรันระบบอีกครั้ง หรือเปิดกล้องติดตามแพ็กเก็ตดูทีละจุด'] };
    if (reached) verdict.returnPath = true;
    const others = net.validate().filter(i => i.dev !== null && (i.dev === srcId || i.dev === dstId || path.includes(i.dev)) && i.dev !== verdict.dev).slice(0, 3);
    return { ok: false, path, reached, verdict, others, dropDev: verdict.dev };
  }

  function renderDoctorDrawer(body) {
    const all = [...net.devices.values()].filter(d => d.kind === 'host' || d.kind === 'router' || d.kind === 'gateway' || d.kind === 'switch').filter(d => d.ifaces.length);
    if (all.length < 2) { add(body, h('p', { class: 'hint', text: 'ต้องมีอุปกรณ์อย่างน้อย 2 เครื่องก่อน' })); return; }
    const lf = window.lastFailedPing;
    const hosts = all.filter(d => d.kind === 'host');
    const sv = doc.src || (lf && lf.from) || (hosts[0] || all[0]).id;
    const dv = doc.dst || (lf && lf.to) || (all.find(d => d.id !== sv && d.services && d.services.http && d.services.http.enabled) || all.find(d => d.id !== sv)).id;
    const src = devSelect('docSrc', hosts.length ? hosts : all, sv, true), dst = devSelect('docDst', all, dv, true);
    add(body, 
      h('p', { class: 'lp-lead', text: 'เลือกเครื่องที่ "ติดต่อกันไม่ได้" ระบบจะทดลองส่ง ping ในเครือข่ายสำเนา แล้วชี้จุดที่แพ็กเก็ตตาย พร้อมบอกสาเหตุและวิธีแก้' }),
      row('เครื่องที่มีปัญหา', src), row('อยากติดต่อไปที่', dst),
      h('button', { class: 'btn btn-primary lp-wide', onclick: () => { doc.src = Number(src.value); doc.dst = Number(dst.value); runDoctor(); } }, icon('fa-stethoscope'), ' วินิจฉัย'));
    const out = h('div', { class: 'doc-out', id: 'docOut' });
    add(body, out);
    if (doc.result) paintDoctor(out, doc.result);
  }

  function runDoctor() {
    clearFaults();
    if (doc.src === doc.dst) return showToast('เลือกต้นทางและปลายทางคนละเครื่อง', true);
    const r = diagnose(doc.src, doc.dst);
    if (!r) return;
    const key = `${doc.src}>${doc.dst}`;
    if (r.ok && doc.lastFail === key) {
      awardXp({ xp: 40, reason: 'แก้ปัญหาจนติดต่อกันได้', once: 'doctor-' + MODEL + '-' + key, badges: ['doctor'] });
      celebrateNetwork();
    }
    doc.lastFail = r.ok ? null : key;
    doc.result = r;
    const out = $('docOut');
    if (out) paintDoctor(out, r);
    if (!r.ok && r.verdict.dev) { markFault(r.verdict.dev); flyTo(r.verdict.dev); }
  }

  function paintDoctor(out, r) {
    out.innerHTML = '';
    const chips = h('div', { class: 'doc-path' }, r.path.map((id, i) => h('span', { class: 'pov-chip' + (!r.ok && i === r.path.length - 1 && r.verdict && r.verdict.dev === id ? ' bad' : ''), text: nameOf(id) })));
    if (r.ok) {
      add(out, h('div', { class: 'doc-card ok' }, h('div', { class: 'doc-title' }, icon('fa-circle-check'), ` ${nameOf(doc.src)} ติดต่อ ${nameOf(doc.dst)} ได้ปกติ`),
        h('p', { text: `แพ็กเก็ตผ่าน ${Math.max(0, r.path.length - 2)} อุปกรณ์กลางทาง และได้รับคำตอบกลับครบ` }), r.path.length ? chips : null,
        h('button', { class: 'btn lp-wide', onclick: () => launchPov(doc.src, doc.dst, 'ping') }, icon('fa-video'), ' ดูแพ็กเก็ตวิ่งจริงด้วยกล้องติดตาม')));
      return;
    }
    const v = r.verdict;
    add(out, h('div', { class: 'doc-card bad' },
      h('div', { class: 'doc-title' }, icon('fa-triangle-exclamation'), ' ', v.title),
      v.returnPath ? h('p', { class: 'doc-note', text: 'คำขอไปถึงปลายทางแล้ว แต่คำตอบกลับไม่ถึง — ปัญหาอยู่ขากลับ' }) : null,
      r.path.length ? chips : null,
      h('div', { class: 'doc-sec' }, h('b', { text: 'สาเหตุ' }), h('p', { text: v.why })),
      h('div', { class: 'doc-sec' }, h('b', { text: 'วิธีแก้' }), h('ol', {}, v.fix.map(f => h('li', { text: f })))),
      r.others && r.others.length ? h('div', { class: 'doc-sec' }, h('b', { text: 'สิ่งที่ควรตรวจเพิ่ม' }), h('ul', {}, r.others.map(i => h('li', { text: `${i.name}: ${i.msg}` })))) : null,
      h('div', { class: 'lp-actions' },
        v.dev ? h('button', { class: 'btn', onclick: () => { flyTo(v.dev); markFault(v.dev); selectDevice3D(v.dev); switchTab('props'); } }, icon('fa-location-crosshairs'), ' พาไปจุดนั้น') : null,
        h('button', { class: 'btn', onclick: () => launchPov(doc.src, doc.dst, 'ping') }, icon('fa-video'), ' ดูแพ็กเก็ตวิ่ง'),
        h('button', { class: 'btn btn-primary', onclick: runDoctor }, icon('fa-rotate'), ' ตรวจซ้ำ'))));
  }

  /* ======================================================================
     3. นักสืบเครือข่าย — ระบบแอบทำให้เสีย แล้วให้นักเรียนหาจุดเสียแข่งกับเวลา
     ====================================================================== */
  const LEVEL_NAMES = ['', 'ง่าย', 'ปานกลาง', 'ยาก'];
  const kase = { active: false, level: 1, faults: [], pairs: [], startedAt: 0, hints: 0, revealed: 0, backup: null, done: false, gaveUp: false, last: null, timer: null };

  // ทดสอบความเชื่อมต่อทุกคู่ในเครือข่ายสำเนา (ขอ IP จาก DHCP ให้ก่อน)
  function health(n, pairsIn) {
    const c = cloneNet(n);
    const order = [...c.devices.values()].sort((a, b) => (b.kind === 'gateway') - (a.kind === 'gateway'));
    order.forEach(d => d.ifaces.forEach((f, fi) => { if (f.dhcp && !isIp(f.ip) && c.ifaceUp(d, fi)) c.dhcp(d.id, () => {}, null, fi); }));
    c.run(20000);
    let pairs = pairsIn;
    if (!pairs) {
      const hosts = [...c.devices.values()].filter(d => d.kind === 'host' && c.primaryIp(d));
      pairs = [];
      hosts.forEach(a => hosts.forEach(b => { if (a !== b) pairs.push([a.id, b.id]); }));
      pairs = pairs.slice(0, 60);
    }
    const ok = pairs.map(([a, b]) => {
      const A = c.devices.get(a), B = c.devices.get(b);
      const ip = B && c.primaryIp(B);
      if (!A || !ip || !c.primaryIp(A)) return false;
      let r = false;
      c.ping(a, ip, 1, () => {}, x => { r = x.ok; });
      c.run(6000);
      return r;
    });
    return { pairs, ok, good: ok.filter(Boolean).length };
  }

  const linkKey = l => [l.a.dev, l.a.port, l.b.dev, l.b.port];
  const findLink = (n, k) => [...n.links.values()].find(l => l.a.dev === k[0] && l.a.port === k[1] && l.b.dev === k[2] && l.b.port === k[3]);
  const staticIface = d => d.ifaces.find(f => isIp(f.ip) && !f.dhcp);

  // แต่ละแบบ: plan(n) เลือกเป้าหมาย → exec(n, plan) ลงมือทำ (ใช้ได้ทั้งเครือข่ายจริงและสำเนา)
  const FAULTS = {
    unplug: {
      plan(n) {
        const ls = [...n.links.values()].filter(l => l.data && l.cable !== 'wireless');
        if (!ls.length) return null;
        const l = pick(ls);
        return { key: linkKey(l), devs: [l.a.dev, l.b.dev], answer: `สาย ${n.linkLabel(l)} ถูกถอดออก`, hint: `ดูสายที่ต่อกับ ${n.devices.get(l.a.dev).name} / ${n.devices.get(l.b.dev).name} ว่ายังเสียบอยู่ครบไหม` };
      },
      exec(n, p) { const l = findLink(n, p.key); if (l) n.disconnect(l.id); }
    },
    cable: {
      plan(n) {
        const ls = [...n.links.values()].filter(l => (l.cable === 'straight' || l.cable === 'cross') && l.up).filter(l => {
          const A = n.devices.get(l.a.dev).ports[l.a.port], B = n.devices.get(l.b.dev).ports[l.b.port];
          return !A.autoMdix && !B.autoMdix;
        });
        if (!ls.length) return null;
        const l = pick(ls);
        const to = l.cable === 'straight' ? 'cross' : 'straight';
        return { key: linkKey(l), to, devs: [l.a.dev, l.b.dev], answer: `สาย ${n.linkLabel(l)} ถูกเปลี่ยนเป็น${NetSim.CABLES[to].th} (ผิดชนิด)`, hint: 'มีไฟลิงก์สีแดงอยู่สักเส้น — ดูชนิดของสาย' };
      },
      exec(n, p) {
        const l = findLink(n, p.key);
        if (!l) return;
        n.disconnect(l.id);
        n.connect(p.key[0], p.key[1], p.key[2], p.key[3], p.to);
      }
    },
    ip: {
      plan(n) {
        const ds = [...n.devices.values()].filter(d => d.kind === 'host' && staticIface(d));
        if (!ds.length) return null;
        const d = pick(ds), f = staticIface(d);
        const o = f.ip.split('.').map(Number);
        o[2] = (o[2] + 1) % 255;
        return { dev: d.id, iface: f.name, ip: o.join('.'), devs: [d.id], answer: `IP ของ ${d.name} ถูกเปลี่ยนจาก ${f.ip} เป็น ${o.join('.')} (ผิดวงเครือข่าย)`, hint: `ตรวจ IP Address ของ ${d.name} เทียบกับเครื่องอื่นในวงเดียวกัน` };
      },
      exec(n, p) { const f = n.devices.get(p.dev).ifaces.find(x => x.name === p.iface); if (f) f.ip = p.ip; }
    },
    mask: {
      plan(n) {
        const ds = [...n.devices.values()].filter(d => d.kind === 'host' && staticIface(d) && staticIface(d).mask === '255.255.255.0');
        if (!ds.length) return null;
        const d = pick(ds), f = staticIface(d);
        return { dev: d.id, iface: f.name, devs: [d.id], answer: `Subnet Mask ของ ${d.name} ถูกเปลี่ยนเป็น 255.255.255.252`, hint: `ตรวจ Subnet Mask ของ ${d.name}` };
      },
      exec(n, p) { const f = n.devices.get(p.dev).ifaces.find(x => x.name === p.iface); if (f) f.mask = '255.255.255.252'; }
    },
    gw: {
      plan(n) {
        const ds = [...n.devices.values()].filter(d => d.kind === 'host' && isIp(d.gw) && staticIface(d));
        if (!ds.length) return null;
        const d = pick(ds);
        const o = d.gw.split('.'); o[3] = '254';
        return { dev: d.id, gw: o.join('.'), devs: [d.id], answer: `Default Gateway ของ ${d.name} ถูกเปลี่ยนจาก ${d.gw} เป็น ${o.join('.')}`, hint: `ตรวจ Default Gateway ของ ${d.name} ว่าตรงกับ IP ของเราเตอร์ไหม` };
      },
      exec(n, p) { n.devices.get(p.dev).gw = p.gw; }
    },
    rtrip: {
      plan(n) {
        const ds = [...n.devices.values()].filter(d => d.kind === 'router' && d.ifaces.some(f => isIp(f.ip) && f.ports.some(pi => d.ports[pi].link) && n.devices.size > 3));
        if (!ds.length) return null;
        const d = pick(ds), f = pick(d.ifaces.filter(x => isIp(x.ip) && x.ports.some(pi => d.ports[pi].link)));
        const o = f.ip.split('.'); o[3] = String(Number(o[3]) === 254 ? 253 : 254);
        return { dev: d.id, iface: f.name, ip: o.join('.'), devs: [d.id], answer: `IP ของ ${d.name} ${f.name} ถูกเปลี่ยนจาก ${f.ip} เป็น ${o.join('.')}`, hint: `ตรวจ IP ของอินเทอร์เฟซบน ${d.name} เทียบกับ Gateway ของเครื่องลูก` };
      },
      exec(n, p) { const f = n.devices.get(p.dev).ifaces.find(x => x.name === p.iface); if (f) f.ip = p.ip; }
    },
    route: {
      plan(n) {
        const ds = [...n.devices.values()].filter(d => d.kind === 'router' && d.routes.length);
        if (!ds.length) return null;
        const d = pick(ds), i = Math.floor(Math.random() * d.routes.length), r = d.routes[i];
        return { dev: d.id, i, devs: [d.id], answer: `Static Route ${r.net} ${r.mask} via ${r.via} ของ ${d.name} หายไป`, hint: `ดู Routing Table ของ ${d.name} (show ip route)` };
      },
      exec(n, p) { n.devices.get(p.dev).routes.splice(p.i, 1); }
    },
    clock: {
      plan(n) {
        const l = [...n.links.values()].find(x => (x.cable === 'serialDCE' || x.cable === 'serialDTE') && x.up);
        if (!l) return null;
        const e = n.dceEnd(l), d = n.devices.get(e.dev);
        return { dev: e.dev, port: e.port, devs: [e.dev], answer: `Clock Rate ที่ ${d.name} ${d.ports[e.port].name} (ฝั่ง DCE) ถูกลบ`, hint: 'ดูไฟลิงก์ของสาย Serial และการตั้งค่าฝั่ง DCE' };
      },
      exec(n, p) { n.devices.get(p.dev).ports[p.port].clock = 0; }
    },
    wifi: {
      plan(n) {
        const ds = [...n.devices.values()].filter(d => d.kind === 'host' && d.ifaces.some(f => f.ssid && f.key));
        if (!ds.length) return null;
        const d = pick(ds), f = d.ifaces.find(x => x.ssid && x.key);
        return { dev: d.id, iface: f.name, devs: [d.id], answer: `รหัส Wi-Fi ของ ${d.name} ถูกเปลี่ยนเป็น "wrongpass"`, hint: `ตรวจ SSID และรหัสผ่าน Wi-Fi ของ ${d.name}` };
      },
      exec(n, p) { const f = n.devices.get(p.dev).ifaces.find(x => x.name === p.iface); if (f) { f.key = 'wrongpass'; n.syncWireless(); } }
    },
    dhcpoff: {
      plan(n) {
        const ds = [...n.devices.values()].filter(d => d.services && d.services.dhcp && d.services.dhcp.enabled && d.kind !== 'gateway');
        if (!ds.length) return null;
        const d = pick(ds);
        return { dev: d.id, devs: [d.id], answer: `บริการ DHCP ของ ${d.name} ถูกปิด เครื่องลูกจึงไม่ได้ IP`, hint: 'มีเครื่องที่รอรับ IP จาก DHCP ไม่ได้ IP — ดูว่า DHCP Server ยังเปิดอยู่ไหม' };
      },
      exec(n, p) {
        n.devices.get(p.dev).services.dhcp.enabled = false;
        n.devices.forEach(d => d.ifaces.forEach(f => { if (f.dhcp) { f.ip = ''; f.mask = ''; } }));
      }
    }
  };

  function refreshScene() {
    net.syncWireless();
    rebuildAllCables();
    refreshAll();
    redrawAllLabels();
    renderProps();
  }

  async function startCase(level) {
    if (pumping) return showToast('กำลังจำลองอยู่ รอให้จบก่อน', true);
    const ok = await UI.confirm({ title: 'รับคดีใหม่?', message: 'ห้องจะเปลี่ยนเป็นเครือข่ายตัวอย่างของบทนี้ แล้วระบบจะแอบทำให้เสีย งานเดิมของคุณถูกเก็บไว้ และจะกลับมาเมื่อกด "กลับห้องเดิม"', confirmText: 'รับคดี' });
    if (!ok) return;
    if (activity) stopActivity();
    if (!kase.active) kase.backup = { net: net.serialize(), room: $('roomSizeSelect').value };
    await persist();
    LP.suspendSave = true;
    clearFaults();
    if (viewMode === '360') switchViewMode('3d');
    loadTemplateData(templateData(MODEL));
    clearEventList();
    const base = health(net);
    const pairs = base.pairs.filter((p, i) => base.ok[i]);
    if (!pairs.length) { showToast('บทนี้ยังไม่มีเส้นทางให้ทดสอบ ลองบทอื่น', true); return exitCase(true); }
    const faults = [];
    let fails = 0;
    for (const id of shuffle(Object.keys(FAULTS))) {
      if (faults.length >= level) break;
      const plan = FAULTS[id].plan(net);
      if (!plan || faults.some(f => f.devs.some(d => plan.devs.includes(d)))) continue;
      const test = cloneNet(net);
      faults.forEach(f => FAULTS[f.id].exec(test, f));
      FAULTS[id].exec(test, plan);
      const hres = health(test, pairs);
      if (pairs.length - hres.good <= fails) continue;   // ทำแล้วไม่มีอะไรเสียเพิ่ม → ข้าม
      fails = pairs.length - hres.good;
      faults.push(Object.assign({ id }, plan));
    }
    if (!faults.length) { showToast('สร้างคดีในบทนี้ไม่สำเร็จ ลองใหม่อีกครั้ง', true); return exitCase(true); }
    faults.forEach(f => FAULTS[f.id].exec(net, f));
    refreshScene();
    reset3DCamera();
    const after = health(net, pairs);
    Object.assign(kase, { active: true, level, faults, pairs, startedAt: Date.now(), hints: 0, revealed: 0, done: false, gaveUp: false, last: after });
    clearInterval(kase.timer);
    kase.timer = setInterval(() => { const t = $('caseTimer'); if (t && kase.active && !kase.done) t.textContent = fmtTime(Date.now() - kase.startedAt); }, 1000);
    document.body.classList.add('case-on');
    logConsole(`[นักสืบ] รับคดีระดับ${LEVEL_NAMES[level]} — เครือข่ายเสีย ${faults.length} จุด ลองหาให้เจอ!`, 'warn');
    openTool('case', true);
  }

  function checkCase() {
    if (!kase.active || kase.done) return;
    const r = health(net, kase.pairs);
    kase.last = r;
    if (r.good === kase.pairs.length) {
      kase.done = true;
      const ms = Date.now() - kase.startedAt;
      const xp = Math.max(30, 60 + kase.level * 60 - kase.hints * 25 - Math.floor(ms / 60000) * 5);
      const badges = ['detective'];
      if (kase.level === 3 && !kase.hints) badges.push('sherlock');
      awardXp({ xp, reason: `ไขคดีระดับ${LEVEL_NAMES[kase.level]}สำเร็จ`, badges });
      saveReport('ผ่าน', { activity: `นักสืบเครือข่าย (ระดับ${LEVEL_NAMES[kase.level]})`, score: `${Math.max(1, 3 - kase.hints)}★`, time: fmtTime(ms) });
      clearFaults();
      celebrateNetwork();
      logConsole(`[นักสืบ] 🎉 ไขคดีสำเร็จ ใช้เวลา ${fmtTime(ms)} ใช้คำใบ้ ${kase.hints} ครั้ง`, 'ok');
    } else showToast(`ยังเสียอยู่ — ติดต่อกันได้ ${r.good}/${kase.pairs.length} เส้นทาง`, 'warn');
    renderDrawer();
  }

  function caseHint() {
    const f = kase.faults[kase.revealed];
    if (!f) return;
    kase.revealed++; kase.hints++;
    f.devs.forEach(markFault);
    flyTo(f.devs[0]);
    renderDrawer();
  }

  function exitCase(silent) {
    clearInterval(kase.timer);
    clearFaults();
    LP.suspendSave = false;
    document.body.classList.remove('case-on');
    if (kase.backup) {
      $('roomSizeSelect').value = kase.backup.room;
      net = NetSim.Network.load(kase.backup.net);
      populateScene();
      refreshAll();
      selectDevice3D(null);
      reset3DCamera();
    }
    Object.assign(kase, { active: false, backup: null, faults: [], done: false });
    if (!silent) showToast('กลับสู่ห้องเดิมแล้ว');
    renderDrawer();
  }

  function renderCaseDrawer(body) {
    if (!kase.active) {
      const seg = h('div', { class: 'seg lp-seg' }, [1, 2, 3].map(l => h('button', { class: kase.level === l ? 'active' : '', onclick: () => { kase.level = l; renderDrawer(); } }, `${LEVEL_NAMES[l]} · ${l} จุด`)));
      add(body, 
        h('div', { class: 'case-hero' }, h('div', { class: 'case-icon' }, icon('fa-user-secret')),
          h('p', { text: 'ระบบจะโหลดเครือข่ายของบทนี้ แล้วแอบทำให้เสียแบบสุ่ม เช่น ถอดสาย ตั้ง IP ผิดวง ลบเส้นทาง หรือเปลี่ยนรหัส Wi-Fi หน้าที่ของคุณคือหาจุดเสียและซ่อมให้ครบ' })),
        h('div', { class: 'form-group lp-field' }, h('label', { text: 'ระดับความยาก' }), seg),
        h('button', { class: 'btn btn-primary lp-wide', onclick: () => startCase(kase.level) }, icon('fa-folder-open'), ' รับคดีใหม่'),
        h('p', { class: 'hint', text: 'ซ่อมอย่างไรก็ได้ ขอแค่ทุกเครื่องที่เคยติดต่อกันได้ กลับมาติดต่อกันได้ครบ สุ่มใหม่ทุกครั้ง จึงลอกคำตอบกันไม่ได้' }));
      return;
    }
    const r = kase.last || { good: 0 };
    const total = kase.pairs.length;
    const broken = kase.pairs.filter((p, i) => r.ok && !r.ok[i]).slice(0, 3);
    add(body, 
      h('div', { class: 'case-ticket' + (kase.done ? ' solved' : '') },
        h('div', { class: 'case-top' }, h('span', { class: 'case-tag', text: kase.done ? 'ปิดคดีแล้ว' : `คดีระดับ${LEVEL_NAMES[kase.level]}` }),
          h('span', { class: 'case-timer', id: 'caseTimer', text: fmtTime(Date.now() - kase.startedAt) })),
        kase.done
          ? h('div', { class: 'case-solved' }, icon('fa-trophy'), h('strong', { text: 'ไขคดีสำเร็จ!' }), h('span', { text: `ใช้คำใบ้ ${kase.hints} ครั้ง` }))
          : h('div', {}, h('b', { text: '📞 แจ้งเหตุจากผู้ใช้' }),
              h('ul', { class: 'case-reports' }, broken.map(([a, b]) => h('li', { text: `"${nameOf(a)} ติดต่อ ${nameOf(b)} ไม่ได้ครับ"` }))),
              h('p', { class: 'hint', text: `จุดเสียทั้งหมด ${kase.faults.length} จุด` })),
        h('div', { class: 'task-progress' }, h('div', { class: 'bar', style: `width:${Math.round(r.good * 100 / total)}%` })),
        h('small', { text: `ติดต่อกันได้ ${r.good}/${total} เส้นทาง` })),
      kase.revealed ? h('div', { class: 'doc-sec' }, h('b', { text: 'คำใบ้' }), h('ol', {}, kase.faults.slice(0, kase.revealed).map(f => h('li', { text: f.hint })))) : null,
      (kase.done || kase.gaveUp) ? h('div', { class: 'doc-sec' }, h('b', { text: 'เฉลยจุดที่เสีย' }), h('ol', {}, kase.faults.map(f => h('li', { text: f.answer })))) : null,
      h('div', { class: 'lp-actions' },
        kase.done ? null : h('button', { class: 'btn btn-primary', onclick: checkCase }, icon('fa-clipboard-check'), ' ตรวจว่าซ่อมครบหรือยัง'),
        kase.done || kase.revealed >= kase.faults.length ? null : h('button', { class: 'btn', onclick: caseHint }, icon('fa-lightbulb'), ' ขอคำใบ้ (−XP)'),
        kase.done || kase.gaveUp ? null : h('button', { class: 'btn', onclick: () => { kase.gaveUp = true; kase.faults.forEach(f => f.devs.forEach(markFault)); renderDrawer(); } }, icon('fa-flag'), ' ยอมแพ้ ดูเฉลย'),
        h('button', { class: 'btn', onclick: () => startCase(kase.level) }, icon('fa-shuffle'), ' คดีใหม่'),
        h('button', { class: 'btn', onclick: () => exitCase() }, icon('fa-door-open'), ' กลับห้องเดิม')),
      h('p', { class: 'hint', text: 'เคล็ดลับ: ใช้ "ทำไมไม่ติด?" ช่วยหาได้ แต่ลองหาเองก่อนจะได้ฝึกมากกว่า' }));
  }

  /* ======================================================================
     4. มินิเกมเข้าหัวสาย RJ45 (T568A / T568B) + เครื่องทดสอบสาย
     ====================================================================== */
  const WIRES = {
    wo: { name: 'ขาว-ส้ม', c: '#f97316', striped: true }, o: { name: 'ส้ม', c: '#f97316' },
    wg: { name: 'ขาว-เขียว', c: '#22c55e', striped: true }, g: { name: 'เขียว', c: '#22c55e' },
    wbl: { name: 'ขาว-น้ำเงิน', c: '#3b82f6', striped: true }, bl: { name: 'น้ำเงิน', c: '#3b82f6' },
    wbr: { name: 'ขาว-น้ำตาล', c: '#a16207', striped: true }, br: { name: 'น้ำตาล', c: '#92400e' }
  };
  const STD = {
    T568A: ['wg', 'g', 'wo', 'bl', 'wbl', 'o', 'wbr', 'br'],
    T568B: ['wo', 'o', 'wg', 'bl', 'wbl', 'g', 'wbr', 'br']
  };
  const crimp = { goal: 'straight', stage: 0, ends: [], slots: Array(8).fill(null), tray: [], sel: null, hint: false, startedAt: 0, result: null };
  const wireStyle = id => {
    const w = WIRES[id];
    return w.striped ? `background:repeating-linear-gradient(135deg,#f8fafc 0 7px,${w.c} 7px 11px)` : `background:${w.c}`;
  };
  const stdOf = order => Object.keys(STD).find(k => STD[k].every((w, i) => order[i] === w)) || null;

  function openCrimp() {
    let ov = $('crimpModal');
    if (!ov) {
      ov = h('div', { class: 'modal-overlay crimp-overlay', id: 'crimpModal', onclick: e => { if (e.target === ov) closeCrimp(); } }, h('div', { class: 'crimp-modal', id: 'crimpBox' }));
      document.body.append(ov);
    }
    resetCrimp();
    ov.classList.add('active');
  }
  function closeCrimp() { const ov = $('crimpModal'); if (ov) ov.classList.remove('active'); }
  function resetCrimp() {
    Object.assign(crimp, { stage: 0, ends: [], slots: Array(8).fill(null), tray: shuffle(Object.keys(WIRES)), sel: null, hint: false, startedAt: Date.now(), result: null });
    paintCrimp();
  }
  function placeWire(slot) {
    if (crimp.slots[slot]) {
      crimp.tray.push(crimp.slots[slot]);
      crimp.slots[slot] = null;
    } else if (crimp.sel) {
      crimp.slots[slot] = crimp.sel;
      crimp.tray = crimp.tray.filter(w => w !== crimp.sel);
      crimp.sel = crimp.tray[0] || null;
    }
    paintCrimp();
  }
  async function doCrimp() {
    if (crimp.slots.some(s => !s)) return;
    const box = document.querySelector('.rj45');
    if (box) { box.classList.add('crimping'); await sleep(UI.reduced ? 50 : 650); }
    crimp.ends.push(crimp.slots.slice());
    if (crimp.ends.length === 1) {
      crimp.stage = 1;
      crimp.slots = Array(8).fill(null);
      crimp.tray = shuffle(Object.keys(WIRES));
      crimp.sel = crimp.tray[0];
      UI.toast('ย้ำหัวปลาย A แล้ว — ต่อไปเข้าหัวอีกปลายของสาย', 'ok');
      paintCrimp();
    } else {
      crimp.stage = 2;
      crimp.result = judgeCable(crimp.ends[0], crimp.ends[1]);
      paintCrimp();
      runTester();
    }
  }
  function judgeCable(A, B) {
    const map = A.map(w => B.indexOf(w));            // ขา i ของปลาย A ไปออกขาไหนของปลาย B
    const sa = stdOf(A), sb = stdOf(B);
    const straight = map.every((j, i) => j === i);
    const cross = [2, 5, 0, 3, 4, 1, 6, 7].every((j, i) => map[i] === j);
    let type = 'broken', title, text;
    if (sa && sb && sa === sb) { type = 'straight'; title = `สายตรง (Straight-through) · ${sa} ทั้งสองปลาย`; text = 'ใช้ต่ออุปกรณ์ต่างชนิดกัน เช่น PC → Switch, Switch → Router'; }
    else if (sa && sb && cross) { type = 'cross'; title = `สายไขว้ (Crossover) · ${sa} ↔ ${sb}`; text = 'ใช้ต่ออุปกรณ์ชนิดเดียวกัน เช่น PC → PC, Switch → Switch, Router → Router'; }
    else if (straight) { title = 'สายต่อถึงกันครบ แต่เรียงสีไม่ตามมาตรฐาน'; text = 'ขาตรงกันทุกเส้นแต่คู่สายบิดถูกแยกผิดคู่ (Split Pair) สัญญาณรบกวนสูง ส่งข้อมูลจริงได้ไม่ดี ต้องเรียงตาม T568A หรือ T568B'; }
    else { title = 'สายเสีย — ขาสลับกัน'; text = 'บางขาของปลาย A ไปออกผิดขาที่ปลาย B เครื่องทดสอบจะติดไฟไม่ตรงลำดับ ต้องตัดหัวแล้วเข้าใหม่'; }
    return { type, title, text, map, sa, sb, ok: type === crimp.goal };
  }
  async function runTester() {
    const r = crimp.result;
    for (let i = 0; i < 8; i++) {
      const a = document.querySelector(`.tester-main i[data-p="${i}"]`), b = document.querySelector(`.tester-remote i[data-p="${r.map[i]}"]`);
      document.querySelectorAll('.tester i.lit').forEach(x => x.classList.remove('lit'));
      if (a) a.classList.add('lit');
      if (b) b.classList.add('lit', r.map[i] === i || r.type === 'cross' ? 'ok' : 'bad');
      await sleep(UI.reduced ? 30 : 320);
    }
    document.querySelectorAll('.tester i.lit').forEach(x => x.classList.remove('lit'));
    const v = document.querySelector('.crimp-verdict');
    if (v) v.classList.add('show');
    if (r.ok) {
      const ms = Date.now() - crimp.startedAt;
      awardXp({ xp: crimp.hint ? 30 : 60, reason: `เข้าหัวสาย${r.type === 'cross' ? 'ไขว้' : 'ตรง'}ผ่าน (${fmtTime(ms)})`, once: crimp.hint ? null : `crimp-${r.type}-${new Date().toDateString()}`, badges: [r.type === 'cross' ? 'cross_crimper' : 'crimper'] });
    }
  }

  function connectorSvg() {
    return h('div', { class: 'rj45' },
      h('div', { class: 'rj45-body' },
        h('div', { class: 'rj45-pins' }, crimp.slots.map((w, i) => h('button', {
          class: 'rj45-slot' + (w ? ' filled' : '') + (!w && crimp.sel ? ' ready' : ''),
          title: w ? `ขา ${i + 1}: ${WIRES[w].name} (คลิกเพื่อดึงออก)` : `ขา ${i + 1}: คลิกเพื่อใส่สายที่เลือก`,
          onclick: () => placeWire(i),
          ondragover: e => e.preventDefault(),
          ondrop: e => { e.preventDefault(); crimp.sel = e.dataTransfer.getData('text/plain') || crimp.sel; placeWire(i); }
        }, h('span', { class: 'pin-gold' }), w ? h('span', { class: 'wire-in', style: wireStyle(w) }) : null, h('em', { text: i + 1 })))),
        h('div', { class: 'rj45-clip', text: 'คลิปล็อกอยู่ด้านล่าง · ขา 1 อยู่ซ้าย' })));
  }
  function paintCrimp() {
    const box = $('crimpBox');
    if (!box) return;
    const goalSel = h('div', { class: 'seg lp-seg' },
      h('button', { class: crimp.goal === 'straight' ? 'active' : '', onclick: () => { crimp.goal = 'straight'; resetCrimp(); } }, 'สายตรง'),
      h('button', { class: crimp.goal === 'cross' ? 'active' : '', onclick: () => { crimp.goal = 'cross'; resetCrimp(); } }, 'สายไขว้'));
    box.innerHTML = '';
    add(box, 
      h('div', { class: 'info-modal-head' }, h('strong', { text: 'เข้าหัวสาย RJ45' }), goalSel,
        h('button', { class: 'icon-btn', title: 'ปิด', onclick: closeCrimp }, icon('fa-xmark'))),
      h('div', { class: 'crimp-steps' }, ['ปลาย A', 'ปลาย B', 'ทดสอบสาย'].map((t, i) => h('span', { class: (crimp.stage === i ? 'now' : '') + (crimp.stage > i ? ' done' : ''), text: `${i + 1}. ${t}` }))));
    if (crimp.stage < 2) {
      const need = crimp.goal === 'cross' && crimp.stage === 1 ? 'อีกมาตรฐานหนึ่ง (A ↔ B)' : 'มาตรฐานเดียวกันทั้งสองปลาย';
      add(box, 
        h('p', { class: 'lp-lead', text: `โจทย์: ทำ${crimp.goal === 'cross' ? 'สายไขว้ (Crossover)' : 'สายตรง (Straight-through)'} — ปลายนี้ใช้${need} คลิกสายแล้วคลิกช่องในหัว RJ45 (หรือลากไปวาง)` }),
        h('div', { class: 'crimp-stage' },
          h('div', { class: 'wire-tray' }, h('small', { text: 'สายทองแดง 4 คู่' }),
            crimp.tray.map(w => h('button', {
              class: 'wire' + (crimp.sel === w ? ' sel' : ''), draggable: 'true', title: WIRES[w].name,
              ondragstart: e => { e.dataTransfer.setData('text/plain', w); crimp.sel = w; },
              onclick: () => { crimp.sel = w; paintCrimp(); }
            }, h('span', { class: 'wire-core', style: wireStyle(w) }), h('em', { text: WIRES[w].name })))),
          connectorSvg(),
          crimp.hint ? h('div', { class: 'std-chart' }, Object.entries(STD).map(([k, arr]) => h('div', {}, h('b', { text: k }), arr.map((w, i) => h('span', {}, h('i', { style: wireStyle(w) }), `${i + 1} ${WIRES[w].name}`))))) : null),
        h('div', { class: 'lp-actions' },
          h('button', { class: 'btn', onclick: () => { crimp.hint = true; paintCrimp(); } }, icon('fa-lightbulb'), ' ดูตารางสี (−XP)'),
          h('button', { class: 'btn', onclick: () => { crimp.tray = crimp.tray.concat(crimp.slots.filter(Boolean)); crimp.slots = Array(8).fill(null); paintCrimp(); } }, icon('fa-rotate-left'), ' ดึงออกทั้งหมด'),
          h('button', { class: 'btn btn-primary', disabled: crimp.slots.some(s => !s), onclick: doCrimp }, icon('fa-compress'), ' ย้ำหัวสาย')));
      return;
    }
    const r = crimp.result;
    const leds = cls => h('div', { class: 'tester ' + cls }, h('small', { text: cls === 'tester-main' ? 'MAIN' : 'REMOTE' }), h('div', {}, Array.from({ length: 8 }, (_, i) => h('i', { 'data-p': i, text: i + 1 }))));
    add(box, 
      h('div', { class: 'tester-wrap' }, leds('tester-main'), h('div', { class: 'tester-cable' }), leds('tester-remote')),
      h('div', { class: 'pin-map' }, r.map.map((j, i) => h('span', { class: j === i ? 'same' : (r.type === 'cross' ? 'swap' : 'bad'), text: `${i + 1}→${j + 1}` }))),
      h('div', { class: 'crimp-verdict ' + (r.ok ? 'ok' : 'bad') },
        h('strong', {}, icon(r.ok ? 'fa-circle-check' : (r.type === 'broken' ? 'fa-circle-xmark' : 'fa-circle-exclamation')), ' ', r.title),
        h('p', { text: r.text }),
        !r.ok && r.type !== 'broken' ? h('p', { text: `แต่โจทย์ต้องการ${crimp.goal === 'cross' ? 'สายไขว้' : 'สายตรง'}` }) : null,
        h('div', { class: 'lp-actions' },
          r.type !== 'broken' ? h('button', { class: 'btn btn-primary', onclick: () => { closeCrimp(); closeDrawer(); startCableTool(r.type); showToast(`ถือ${NetSim.CABLES[r.type].th}ที่เข้าหัวเองแล้ว — คลิกอุปกรณ์ 2 ตัวในห้องเพื่อต่อ`); } }, icon('fa-plug'), ' นำสายนี้ไปใช้ในห้อง') : null,
          h('button', { class: 'btn', onclick: resetCrimp }, icon('fa-rotate'), ' เข้าหัวใหม่'))));
  }

  /* ======================================================================
     5. โจมตี & ป้องกัน — DDoS (Ping Flood) + ACL / Broadcast Storm + STP
     ====================================================================== */
  const atk = { tab: 'ddos', attacker: null, target: null, user: null, last: null, storm: null };

  function setAlarm(on, text) {
    let el = $('alarmOverlay');
    if (!el) { el = h('div', { class: 'alarm-overlay', id: 'alarmOverlay' }, h('span', {})); viewport().append(el); }
    el.firstChild.textContent = text || '';
    el.classList.toggle('show', !!on);
  }

  async function runDdos(defenseCheck) {
    if (pumping) return showToast('กำลังจำลองอยู่ รอให้จบก่อน', true);
    const A = devOf(atk.attacker), T = devOf(atk.target), U = devOf(atk.user);
    if (!A || !T || !U || new Set([A, T, U]).size < 3) return showToast('เลือกผู้โจมตี เป้าหมาย และผู้ใช้จริง ให้เป็นคนละเครื่อง', true);
    if (!ipOf(A) || !ipOf(T) || !ipOf(U)) return showToast('ทั้งสามเครื่องต้องมี IP ก่อน (กดรันระบบถ้าใช้ DHCP)', true);
    const http = T.services && T.services.http && T.services.http.enabled;
    if (viewMode === '360') switchViewMode('3d');
    addEventSep(`DDoS: ${A.name} ถล่ม ${T.name}`);
    net.clearTables();
    net.startFlood(A.id, ipOf(T), { perTick: 4, total: 80 });
    let res = null;
    const out = (t, c) => logConsole(`[${U.name}] ${t}`, c || '');
    if (http) net.browse(U.id, ipOf(T), out, r => { res = r; });
    else net.ping(U.id, ipOf(T), 1, out, r => { res = r; });
    setAlarm(true, `⚠ ${A.name} กำลังโจมตี ${T.name}`);
    const gauge = setInterval(() => paintGauge(T), 120);
    const prevSpeed = speed;
    speed = Math.max(speed, 1.6);
    try { await pump(); } finally { speed = prevSpeed; clearInterval(gauge); setAlarm(false); net.stopFlood(); }
    const st = Object.assign({}, net.floodStats);
    const defended = st.acl > 0 || st.reached < st.sent / 4;
    atk.last = { ok: !!(res && res.ok), http, stats: st, defended, user: U.name, target: T.name };
    if (atk.last.ok && defended) {
      awardXp({ xp: 120, reason: 'หยุดการโจมตี DDoS สำเร็จ', once: 'defender-' + MODEL, badges: ['defender'] });
      celebrateNetwork();
    }
    logConsole(`[DDoS] ผู้โจมตีส่ง ${st.sent} แพ็กเก็ต · ถึงเซิร์ฟเวอร์ ${st.reached} · ถูก ACL ทิ้ง ${st.acl} · ผู้ใช้จริง${atk.last.ok ? 'ใช้งานได้' : 'ใช้งานไม่ได้'}`, atk.last.ok ? 'ok' : 'err');
    renderDrawer();
  }
  function paintGauge(T) {
    const g = $('cpuGauge');
    if (!g || !T) return;
    const load = net._overloaded(T) ? 100 : Math.min(95, ((T._hits && [...T._hits.values()].reduce((a, b) => a + b, 0)) || 0) * 16);
    g.style.setProperty('--v', load);
    g.querySelector('b').textContent = `${load}%`;
  }

  function aclRules() {
    const list = [];
    net.devices.forEach(d => (d.acl || []).forEach((r, i) => list.push({ d, r, i })));
    return list;
  }
  function addAcl(devId, ip, mask) {
    const d = devOf(devId);
    if (!d || !isIp(ip)) return showToast('ใส่ IP ให้ถูกรูปแบบ', true);
    if (d.acl.some(r => r.ip === ip && r.mask === mask)) return showToast('มีกฎนี้อยู่แล้ว', 'warn');
    d.acl.push({ ip, mask });
    logConsole(`${d.name}(config)# access-list 10 deny ${mask === '255.255.255.255' ? 'host ' + ip : ip + ' ' + mask}`, 'cmd');
    persist();
    renderDrawer();
  }

  function renderDdos(body) {
    const hosts = hostList(d => isIp(ipOf(d)));
    if (hosts.length < 3) { add(body, h('p', { class: 'hint', text: 'ต้องมีเครื่องที่มี IP อย่างน้อย 3 เครื่อง (ผู้โจมตี เซิร์ฟเวอร์ ผู้ใช้จริง) — ลองบท "เว็บพอร์ทัลโรงเรียน" หรือ "ศูนย์ข้อมูล"' })); return; }
    const servers = hosts.filter(d => d.services && d.services.http && d.services.http.enabled);
    if (!atk.target || !devOf(atk.target)) atk.target = (servers[0] || hosts[hosts.length - 1]).id;
    const others = hosts.filter(d => d.id !== atk.target);
    if (!atk.attacker || !devOf(atk.attacker) || atk.attacker === atk.target) atk.attacker = others[others.length - 1].id;
    if (!atk.user || !devOf(atk.user) || atk.user === atk.target || atk.user === atk.attacker) atk.user = others.find(d => d.id !== atk.attacker).id;
    const sA = devSelect('atkA', hosts, atk.attacker, true), sT = devSelect('atkT', hosts, atk.target, true), sU = devSelect('atkU', hosts, atk.user, true);
    sA.onchange = () => { atk.attacker = Number(sA.value); renderDrawer(); };
    sT.onchange = () => { atk.target = Number(sT.value); renderDrawer(); };
    sU.onchange = () => { atk.user = Number(sU.value); };
    const L = atk.last;
    add(body, 
      h('p', { class: 'lp-lead', text: 'DDoS คือการส่งคำขอปริมาณมหาศาลไปถล่มเซิร์ฟเวอร์ จนไม่เหลือแรงตอบผู้ใช้จริง ลองโจมตีแล้วดูว่าเว็บล่มอย่างไร จากนั้นตั้ง ACL / Firewall เพื่อป้องกัน' }),
      row('ผู้โจมตี', sA), row('เป้าหมาย (เซิร์ฟเวอร์)', sT), row('ผู้ใช้จริงที่กำลังใช้งาน', sU),
      h('div', { class: 'cpu-row' },
        h('div', { class: 'cpu-gauge', id: 'cpuGauge', style: '--v:0' }, h('b', { text: '0%' })),
        h('div', {}, h('strong', { text: `CPU ของ ${nameOf(atk.target)}` }), h('small', { text: 'เกิน 6 คำขอใน 3 จังหวะ = ทำงานไม่ไหว' }))),
      h('button', { class: 'btn btn-danger lp-wide', onclick: () => runDdos() }, icon('fa-skull-crossbones'), ' เริ่มโจมตี (Ping Flood)'));
    if (L) add(body, h('div', { class: 'doc-card ' + (L.ok ? 'ok' : 'bad') },
      h('div', { class: 'doc-title' }, icon(L.ok ? 'fa-shield-halved' : 'fa-fire'), L.ok ? ` ${L.user} ยังใช้งาน ${L.target} ได้` : ` ${L.target} ล่ม — ${L.user} ใช้งานไม่ได้`),
      h('div', { class: 'atk-stats' },
        h('span', {}, h('b', { text: L.stats.sent }), 'แพ็กเก็ตโจมตี'),
        h('span', {}, h('b', { text: L.stats.reached }), 'ถึงเซิร์ฟเวอร์'),
        h('span', {}, h('b', { text: L.stats.acl }), 'ถูก ACL ทิ้ง')),
      h('p', { text: L.ok ? (L.defended ? 'การป้องกันได้ผล! แพ็กเก็ตโจมตีถูกทิ้งก่อนถึงเซิร์ฟเวอร์' : 'การโจมตีรอบนี้ไม่แรงพอจะทำให้ล่ม') : 'ลองตั้งกฎ ACL ด้านล่าง ปฏิเสธ IP ของผู้โจมตี แล้วโจมตีอีกครั้ง' })));
    // ACL / Firewall
    const guards = [...net.devices.values()].filter(d => d.kind === 'router' || d.kind === 'gateway' || (d.kind === 'host' && d.id === atk.target));
    const sG = devSelect('aclDev', guards, (guards.find(d => d.kind === 'router') || guards[0] || {}).id);
    const ipIn = h('input', { id: 'aclIp', value: ipOf(devOf(atk.attacker)) || '', placeholder: 'IP ที่ต้องการปฏิเสธ' });
    const mk = h('select', { id: 'aclMask' }, h('option', { value: '255.255.255.255', text: 'เครื่องเดียว (host)' }), h('option', { value: '255.255.255.0', text: 'ทั้งวง /24' }));
    add(body, h('div', { class: 'prop-section lp-box' },
      h('div', { class: 'sec-title', text: 'ป้องกัน: ACL ที่เราเตอร์ / Firewall ที่เซิร์ฟเวอร์' }),
      row('ตั้งที่อุปกรณ์', sG), row('ปฏิเสธต้นทาง (deny)', ipIn), row('ขอบเขต', mk),
      h('button', { class: 'btn btn-success lp-wide', onclick: () => addAcl(Number(sG.value), ipIn.value.trim(), mk.value) }, icon('fa-shield'), ' เพิ่มกฎ'),
      h('div', { class: 'acl-list' }, aclRules().length ? aclRules().map(({ d, r, i }) => h('div', { class: 'conn-item' },
        h('span', { text: `${d.name}: deny ${r.ip}${r.mask !== '255.255.255.255' ? ' ' + r.mask : ''}` }),
        h('button', { class: 'mini-btn', title: 'ลบกฎ', onclick: () => { d.acl.splice(i, 1); persist(); renderDrawer(); } }, icon('fa-trash')))) : h('div', { class: 'empty-note small', text: 'ยังไม่มีกฎ' }))));
  }

  // หาสวิตช์สองตัวที่ต่อกันตรง (ใช้ทำลูป) ถ้าไม่มีจะเพิ่มสวิตช์ใหม่ข้างตัวที่มีเครื่องลูกมากที่สุด
  function stormPair() {
    const sw = [...net.devices.values()].filter(d => d.kind === 'switch');
    for (const l of net.links.values()) {
      const a = devOf(l.a.dev), b = devOf(l.b.dev);
      if (l.data && a.kind === 'switch' && b.kind === 'switch') return [a, b];
    }
    return sw.length ? [sw.sort((x, y) => y.ports.filter(p => p.link).length - x.ports.filter(p => p.link).length)[0], null] : [null, null];
  }
  function makeLoop() {
    let [a, b] = stormPair();
    if (!a) return showToast('ต้องมีสวิตช์อย่างน้อย 1 ตัวที่มีเครื่องต่ออยู่', true);
    const added = [];
    if (!b) {
      b = net.addDevice({ id: nextDeviceId++, model: '2960-24TT', name: 'SW-Loop', x: a.x + 1.8, z: a.z + 1.2 });
      createNode(b, true);
      added.push(addLink(a.id, null, b.id, null, 'cross'));
    }
    added.push(addLink(a.id, null, b.id, null, 'cross'));
    atk.storm = null;
    logConsole(`[LOOP] ต่อสายสำรองระหว่าง ${a.name} ↔ ${b.name} — ตอนนี้มีเส้นทางวนเป็นวงแล้ว`, 'warn');
    persist();
    renderDrawer();
  }
  async function testStorm() {
    if (pumping) return showToast('กำลังจำลองอยู่ รอให้จบก่อน', true);
    const sw = new Set([...net.devices.values()].filter(d => d.kind === 'switch').map(d => d.id));
    const host = hostList(d => isIp(ipOf(d)) && d.ports.some(p => { const l = p.link && net.links.get(p.link); return l && (sw.has(l.a.dev) || sw.has(l.b.dev)); }))[0];
    if (!host) return showToast('ต้องมีเครื่องที่มี IP ต่อกับสวิตช์อยู่', true);
    const f = host.ifaces.find(x => isIp(x.ip));
    const peer = [...net.devices.values()].find(d => d !== host && d.ifaces.some(x => isIp(x.ip) && NetSim.sameNet(x.ip, f.ip, f.mask)));
    const target = peer ? ipOf(peer) : f.ip.replace(/\d+$/, '250');
    if (viewMode === '360') switchViewMode('3d');
    net.clearTables();
    addEventSep(`ทดสอบ Broadcast: ${host.name} ping ${target}`);
    let stormSeen = false;
    const prev = playEvents;
    const watch = evs => { if (evs.some(e => e.kind === 'storm')) { stormSeen = true; setAlarm(true, '⚠ BROADCAST STORM — เฟรมวนไม่รู้จบ'); } return prev(evs); };
    playEvents = watch;
    const prevSpeed = speed;
    speed = Math.max(speed, 4);
    net.ping(host.id, target, 1, (t, c) => logConsole(`[${host.name}] ${t}`, c || ''), () => {});
    try { await pump(); } finally { speed = prevSpeed; playEvents = prev; }
    setTimeout(() => setAlarm(false), 1600);
    const blocked = net.stp ? net._stpBlocked().size : 0;
    atk.storm = { stormSeen, stp: net.stp, blocked };
    if (!stormSeen && net.stp && blocked) awardXp({ xp: 100, reason: 'หยุด Broadcast Storm ด้วย STP', once: 'stp-' + MODEL, badges: ['stp'] });
    renderDrawer();
  }
  function renderStorm(body) {
    const [a, b] = stormPair();
    const loops = net.validate().some(i => /ลูป/.test(i.msg)) || (net.stp && net._stpBlocked().size > 0);
    const S = atk.storm;
    add(body, 
      h('p', { class: 'lp-lead', text: 'ถ้าสวิตช์ต่อกันเป็นวง (ลูป) เฟรม Broadcast เช่น ARP จะวนไม่รู้จบจนเครือข่ายล่ม เรียกว่า Broadcast Storm วิธีแก้คือ Spanning Tree Protocol (STP) ซึ่งจะบล็อกสายเส้นสำรองไว้ 1 เส้น' }),
      h('div', { class: 'storm-steps' },
        h('div', { class: 'storm-step' + (loops ? ' done' : '') }, h('b', { text: '1' }), h('div', {}, h('strong', { text: 'สร้างลูป' }), h('small', { text: b ? `ต่อสายเพิ่มระหว่าง ${a.name} ↔ ${b.name}` : (a ? `เพิ่มสวิตช์ใหม่ต่อกับ ${a.name} 2 เส้น` : 'ต้องมีสวิตช์ก่อน') })),
          h('button', { class: 'btn', disabled: !a, onclick: makeLoop }, icon('fa-link'), ' ต่อสาย')),
        h('div', { class: 'storm-step' + (S && S.stormSeen ? ' bad' : '') }, h('b', { text: '2' }), h('div', {}, h('strong', { text: 'ส่ง Broadcast' }), h('small', { text: 'ล้าง ARP แล้ว ping — ARP Request จะถูกส่งแบบ Broadcast' })),
          h('button', { class: 'btn btn-danger', onclick: testStorm }, icon('fa-tower-broadcast'), ' ทดสอบ')),
        h('div', { class: 'storm-step' + (net.stp ? ' done' : '') }, h('b', { text: '3' }), h('div', {}, h('strong', { text: 'เปิด Spanning Tree (STP)' }), h('small', { text: net.stp ? `เปิดอยู่ — บล็อกสายไว้ ${net._stpBlocked().size} เส้น (ไฟพอร์ตสีส้ม)` : 'ปิดอยู่' })),
          h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: net.stp, onchange: e => { net.stp = e.target.checked; refreshAll(); renderProps(); persist(); logConsole(`[STP] ${net.stp ? 'เปิด' : 'ปิด'} Spanning Tree${net.stp ? ` — บล็อกพอร์ตกันลูป ${net._stpBlocked().size} เส้น` : ''}`, 'info'); renderDrawer(); } }), h('span', {})))),
      S ? h('div', { class: 'doc-card ' + (S.stormSeen ? 'bad' : 'ok') }, h('div', { class: 'doc-title' }, icon(S.stormSeen ? 'fa-tornado' : 'fa-circle-check'),
        S.stormSeen ? ' เกิด Broadcast Storm! เครือข่ายใช้งานไม่ได้' : (S.stp && S.blocked ? ' ไม่มีพายุ — STP บล็อกเส้นสำรองไว้ แพ็กเก็ตวิ่งได้ปกติ' : ' ไม่มีพายุ (ยังไม่มีลูป)')),
        h('p', { text: S.stormSeen ? 'ลองเปิด STP ในขั้นที่ 3 แล้วทดสอบอีกครั้ง' : (S.stp ? 'ถ้าเส้นหลักขาด STP จะเปิดเส้นสำรองให้ใช้แทนอัตโนมัติ' : 'ทำขั้นที่ 1 ก่อนเพื่อดูพายุ') })) : null);
  }

  function renderAttackDrawer(body) {
    add(body, h('div', { class: 'seg lp-seg lp-tabs' },
      h('button', { class: atk.tab === 'ddos' ? 'active' : '', onclick: () => { atk.tab = 'ddos'; renderDrawer(); } }, icon('fa-skull-crossbones'), ' DDoS'),
      h('button', { class: atk.tab === 'storm' ? 'active' : '', onclick: () => { atk.tab = 'storm'; renderDrawer(); } }, icon('fa-tornado'), ' Broadcast Storm')));
    if (atk.tab === 'ddos') renderDdos(body); else renderStorm(body);
  }

  /* ======================================================================
     6. ไทม์ไลน์ย้อนเวลา — เลื่อนดูทุกจังหวะของการจำลองครั้งล่าสุด
     ====================================================================== */
  const tl = { open: false, si: 0, t: 0, playing: false, ghosts: [], raf: 0, used: false };

  function clearGhosts() { tl.ghosts.forEach(g => scene.remove(g)); tl.ghosts = []; }
  function showStep(t) {
    const s = rec.sessions[tl.si];
    if (!s) return;
    const max = s.steps.length;
    tl.t = Math.max(0, Math.min(max - 0.001, t));
    const i = Math.floor(tl.t), frac = tl.t - i, st = s.steps[i];
    clearGhosts();
    st.tx.slice(0, 40).forEach(ev => {
      const link = net.links.get(ev.link), cable = cables.get(ev.link);
      if (!link || !cable) return;
      const g = makePacket(ev.proto);
      g.position.copy(cable.curve.getPoint(link.a.dev === ev.from ? ease(frac) : 1 - ease(frac)));
      scene.add(g);
      tl.ghosts.push(g);
    });
    const range = $('tlRange');
    if (range && document.activeElement !== range) range.value = tl.t;
    const lab = $('tlLabel');
    if (lab) lab.textContent = `ขั้น ${i + 1}/${max} · tick ${st.tick}`;
    const cap = $('tlCaption');
    if (cap) {
      cap.innerHTML = '';
      st.tx.slice(0, 3).forEach(e => add(cap, h('span', { class: 'tl-ev' }, h('i', { class: 'ev-badge', style: `background:${hex(PROTO_COLORS[e.proto] || PROTO_COLORS.UDP)}`, text: e.proto }), ` ${nameOf(e.from)} → ${nameOf(e.to)} · ${e.summary}`)));
      if (st.tx.length > 3) add(cap, h('span', { class: 'tl-more', text: `+${st.tx.length - 3} เฟรม` }));
      st.notes.slice(0, 2).forEach(n => add(cap, h('span', { class: 'tl-note' + (n.kind === 'drop' || n.kind === 'storm' ? ' bad' : ''), text: `${n.dev ? nameOf(n.dev) + ': ' : ''}${n.text}` })));
    }
    if (!tl.used) { tl.used = true; awardXp({ xp: 20, reason: 'ใช้ไทม์ไลน์ย้อนดูการจำลอง', once: 'timeline', badges: ['time_traveler'] }); }
  }
  function drawStrip(s) {
    const c = $('tlStrip');
    if (!c || !s) return;
    const ctx = c.getContext('2d'), W = c.width = c.clientWidth * 2 || 600, H = c.height = 36;
    ctx.clearRect(0, 0, W, H);
    const n = s.steps.length, w = W / n;
    s.steps.forEach((st, i) => {
      const counts = {};
      st.tx.forEach(e => { counts[e.proto] = (counts[e.proto] || 0) + 1; });
      let y = H;
      Object.entries(counts).forEach(([p, k]) => {
        const hh = Math.min(H, 6 + k * 5);
        ctx.fillStyle = hex(PROTO_COLORS[p] || PROTO_COLORS.UDP);
        ctx.globalAlpha = 0.85;
        ctx.fillRect(i * w + 1, y - hh, Math.max(1, w - 2), hh);
        y -= hh;
      });
      if (st.notes.some(x => x.kind === 'drop' || x.kind === 'storm')) { ctx.globalAlpha = 1; ctx.fillStyle = '#ff2d55'; ctx.fillRect(i * w, 0, Math.max(2, w), 3); }
    });
    ctx.globalAlpha = 1;
  }
  function tlPlay(on) {
    tl.playing = on === undefined ? !tl.playing : on;
    const b = $('tlPlay');
    if (b) b.firstChild.className = 'fa-solid ' + (tl.playing ? 'fa-pause' : 'fa-play');
    cancelAnimationFrame(tl.raf);
    if (!tl.playing) return;
    let last = performance.now();
    const loop = now => {
      const s = rec.sessions[tl.si];
      if (!s || !tl.playing) return;
      tl.t += (now - last) / 1000 * 1.6;
      last = now;
      if (tl.t >= s.steps.length - 0.001) { showStep(s.steps.length - 0.001); return tlPlay(false); }
      showStep(tl.t);
      tl.raf = requestAnimationFrame(loop);
    };
    tl.raf = requestAnimationFrame(loop);
  }
  function renderTimeline(si) {
    let bar = $('tlBar');
    if (!bar) { bar = h('div', { class: 'tl-bar', id: 'tlBar' }); viewport().append(bar); }
    tl.si = si || 0;
    tlPlay(false);
    bar.innerHTML = '';
    const s = rec.sessions[tl.si];
    const head = h('div', { class: 'tl-head' }, icon('fa-clock-rotate-left'), h('b', { text: 'ไทม์ไลน์ย้อนเวลา' }),
      rec.sessions.length ? h('select', { id: 'tlSession', onchange: e => renderTimeline(Number(e.target.value)) },
        rec.sessions.map((x, i) => h('option', { value: i, text: `${i === 0 ? 'ล่าสุด' : 'ครั้งก่อน ' + i} · ${x.label} · ${x.steps.length} ขั้น · ${x.at.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}` }))) : null,
      h('span', { class: 'tl-label', id: 'tlLabel' }),
      h('button', { class: 'icon-btn', title: 'ปิดไทม์ไลน์', onclick: () => closeTimeline() }, icon('fa-xmark')));
    add(bar, head);
    if (!s) {
      add(bar, h('div', { class: 'tl-empty', text: 'ยังไม่มีการจำลองให้ย้อนดู — กด "รันระบบ" หรือ ping ก่อน แล้วกลับมาเลื่อนดูทีละจังหวะได้เหมือนดูวิดีโอ' }));
    } else {
      const sel = $('tlSession');
      if (sel) sel.value = String(tl.si);
      add(bar, 
        h('div', { class: 'tl-row' },
          h('button', { class: 'icon-btn', title: 'ย้อนทีละขั้น', onclick: () => showStep(Math.floor(tl.t) - 1) }, icon('fa-backward-step')),
          h('button', { class: 'icon-btn tl-play', id: 'tlPlay', title: 'เล่น / หยุด', onclick: () => tlPlay() }, icon('fa-play')),
          h('button', { class: 'icon-btn', title: 'ไปข้างหน้าทีละขั้น', onclick: () => showStep(Math.floor(tl.t) + 1) }, icon('fa-forward-step')),
          h('div', { class: 'tl-track' },
            h('canvas', { id: 'tlStrip' }),
            h('input', { type: 'range', id: 'tlRange', min: 0, max: s.steps.length - 0.001, step: 0.01, value: 0, oninput: e => { tlPlay(false); showStep(Number(e.target.value)); } }))),
        h('div', { class: 'tl-caption', id: 'tlCaption' }));
      requestAnimationFrame(() => { drawStrip(s); showStep(0); });
    }
    bar.classList.add('show');
    tl.open = true;
  }
  function closeTimeline() {
    tlPlay(false);
    clearGhosts();
    tl.open = false;
    const bar = $('tlBar');
    if (bar) bar.classList.remove('show');
    document.querySelector('.dock-btn[data-tool="timeline"]')?.classList.remove('on');
  }

  /* ======================================================================
     แถบเครื่องมือ (Dock) + ลิ้นชัก (Drawer)
     ====================================================================== */
  const TOOLS = [
    { id: 'pov', icon: 'fa-video', label: 'กล้องติดตามแพ็กเก็ต', color: '#38bdf8', render: renderPovDrawer },
    { id: 'doctor', icon: 'fa-stethoscope', label: 'ทำไมไม่ติด?', color: '#fb7185', render: renderDoctorDrawer },
    { id: 'case', icon: 'fa-user-secret', label: 'นักสืบเครือข่าย', color: '#818cf8', render: renderCaseDrawer },
    { id: 'crimp', icon: 'fa-ethernet', label: 'เข้าหัวสาย RJ45', color: '#fb923c' },
    { id: 'attack', icon: 'fa-shield-halved', label: 'โจมตี & ป้องกัน', color: '#f43f5e', render: renderAttackDrawer },
    { id: 'timeline', icon: 'fa-clock-rotate-left', label: 'ไทม์ไลน์ย้อนเวลา', color: '#a78bfa' }
  ];
  let current = null;

  function openTool(id, keep) {
    const tool = TOOLS.find(x => x.id === id);
    if (tool && tool.action) return tool.action();
    if (id === 'crimp') return openCrimp();
    if (id === 'timeline') {
      if (tl.open && !keep) return closeTimeline();
      document.querySelector('.dock-btn[data-tool="timeline"]')?.classList.add('on');
      return renderTimeline(0);
    }
    if (current === id && !keep) return closeDrawer();
    current = id;
    document.querySelectorAll('.dock-btn').forEach(b => b.classList.toggle('active', b.dataset.tool === id));
    renderDrawer();
    $('labDrawer').classList.add('show');
  }
  function closeDrawer() {
    current = null;
    const d = $('labDrawer');
    if (d) d.classList.remove('show');
    document.querySelectorAll('.dock-btn').forEach(b => b.classList.remove('active'));
    if (!kase.active) clearFaults();
  }
  function renderDrawer() {
    const d = $('labDrawer');
    if (!d || !current) return;
    const t = TOOLS.find(x => x.id === current);
    d.style.setProperty('--tool', t.color);
    d.innerHTML = '';
    const body = h('div', { class: 'lp-body' });
    add(d, h('div', { class: 'lp-head' }, h('span', { class: 'lp-icon' }, icon(t.icon)), h('strong', { text: t.label }),
      h('button', { class: 'icon-btn', title: 'ปิด', onclick: closeDrawer }, icon('fa-xmark'))), body);
    t.render(body);
  }

  function buildUi() {
    const vp = viewport();
    vp.append(
      h('div', { class: 'lab-dock', role: 'toolbar', 'aria-label': 'เครื่องมือเสริม' }, TOOLS.map(t => h('button', {
        class: 'dock-btn', 'data-tool': t.id, style: `--c:${t.color}`, 'aria-label': t.label, onclick: () => openTool(t.id)
      }, icon(t.icon), h('span', { class: 'dock-tip', text: t.label })))),
      h('aside', { class: 'lab-drawer', id: 'labDrawer', 'aria-live': 'polite' }));
    const av = $('wsAvatar');
    if (av) av.before(h('button', { class: 'xp-chip', id: 'xpChip', onclick: openBadges, 'aria-label': 'เลเวลและเหรียญรางวัล' }));
    if (!PROTO_INFO.DDoS) { PROTO_INFO.DDoS = 'DDoS (โจมตี)'; renderLegend(); }
  }

  Object.assign(LP, {
    open: openTool, close: closeDrawer, awardXp, openBadges, loadProgress, getProgress: () => progress,
    startPov, stopPov, launchPov, diagnose, runDoctor, health, startCase, checkCase, caseHint, exitCase,
    openCrimp, judgeCable, runDdos, addAcl, makeLoop, testStorm, renderTimeline, showStep, closeTimeline,
    _pov: pov, _rec: rec, _kase: kase, _crimp: crimp, _atk: atk, _doc: doc, _tl: tl, STD,
    // ให้โมดูลอื่น (life-plus.js) เพิ่มเครื่องมือในแถบเดียวกันได้
    addTool(t) {
      TOOLS.push(t);
      const dock = document.querySelector('.lab-dock');
      if (dock) dock.append(h('button', { class: 'dock-btn', 'data-tool': t.id, style: `--c:${t.color}`, 'aria-label': t.label, onclick: () => openTool(t.id) }, icon(t.icon), h('span', { class: 'dock-tip', text: t.label })));
    },
    kit: { add, row, devSelect, flyTo, markFault, clearFaults, cloneNet, renderDrawer, openTool, closeDrawer, setAlarm, ipOf, nameOf, hostList, shuffle, pick, isIp, fmtTime, viewport,
      current: () => current }
  });

  (window.appReady || Promise.resolve()).then(() => { buildUi(); loadProgress(); });
})();
