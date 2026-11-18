/* ==========================================================================
   SimuCore 3D — จัดเส้นทางสายแบบอิสระ (โหลดหลัง workspace.js)
   --------------------------------------------------------------------------
   อยู่ในโหมดแก้ไขตำแหน่ง (ปุ่มดินสอ / คีย์ E) แล้วคลิกที่สาย:
   - ลากจุดกลมเพื่อดัดสาย · คลิกจุด + กลางเส้นเพื่อเพิ่มจุดหัก · Shift+ลาก = ปรับความสูง
   - แต่ละจุดยึดได้กับ พื้น / ผนัง / เพดาน(ราง) / อุปกรณ์ (ย้ายอุปกรณ์แล้วจุดตามไป) / อิสระ
   - ปุ่มเดินสายสำเร็จรูป: เลียบพื้น, บนรางเพดาน, รางเลียบผนัง, โค้งอัตโนมัติ
   - ความยาวสายคิดตามเส้นทางจริง (เกินมาตรฐานแล้วลิงก์ดาวน์) · Delete ลบจุด · Ctrl+Z ย้อนกลับ
   ========================================================================== */
(function () {
  'use strict';

  const CE = window.CableEdit = {};
  const ANCH = {
    free: { th: 'อิสระ', color: 0xf8fafc, icon: 'fa-hand' },
    floor: { th: 'พื้น', color: 0x34d399, icon: 'fa-border-none' },
    wall: { th: 'ผนัง', color: 0x22d3ee, icon: 'fa-border-all' },
    ceiling: { th: 'เพดาน / ราง', color: 0xa855f7, icon: 'fa-grip-lines' },
    device: { th: 'อุปกรณ์', color: 0xfbbf24, icon: 'fa-link' }
  };
  const FLOOR_Y = 0.03, WALL_Y = 0.35, OFF = 0.07;
  const CEIL_Y = () => WALL_H - 0.12;
  const clone = o => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

  let linkId = null, sel = -1, drag = null, pendingDeselect = false;
  let handles = [], inserts = [], halo = null;
  const link = () => (linkId === null ? null : net.links.get(linkId));
  const route = () => { const l = link(); if (l && !l.route) l.route = []; return l ? l.route : []; };
  const absOf = p => net.routePoint(p);

  /* ----------------------------- เรขาคณิต ----------------------------- */
  function allWalls() {
    if (siteWalls.length) return siteWalls;
    const { w, l } = roomSize();
    return [[-w / 2, -l / 2, w / 2, -l / 2], [w / 2, -l / 2, w / 2, l / 2], [w / 2, l / 2, -w / 2, l / 2], [-w / 2, l / 2, -w / 2, -l / 2]];
  }
  // จุดบนผนังที่ใกล้ที่สุด ขยับออกมาจากผนังเล็กน้อยฝั่งเดียวกับจุดเดิม
  function onWall(x, z) {
    let best = null;
    for (const [x1, z1, x2, z2] of allWalls()) {
      const dx = x2 - x1, dz = z2 - z1, L = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / L));
      const px = x1 + t * dx, pz = z1 + t * dz, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) {
        let nx = -dz, nz = dx;
        const nl = Math.hypot(nx, nz) || 1;
        nx /= nl; nz /= nl;
        if ((x - px) * nx + (z - pz) * nz < 0) { nx = -nx; nz = -nz; }
        best = { d, x: px + nx * OFF, z: pz + nz * OFF };
      }
    }
    return best || { x, z };
  }
  function nearestDevice(x, z) {
    let best = null;
    net.devices.forEach(d => { const dd = Math.hypot(d.x - x, d.z - z); if (!best || dd < best.dd) best = { d, dd }; });
    return best;
  }
  // บังคับจุดให้อยู่ตามชนิดการยึด (คืนค่าจุดใหม่)
  function constrain(p, at, q) {
    q = q || absOf(p);
    const n = { at };
    let { x, y, z } = q;
    if (at === 'floor') y = FLOOR_Y;
    if (at === 'ceiling') y = CEIL_Y();
    if (at === 'wall') { const w = onWall(x, z); x = w.x; z = w.z; y = Math.max(0.1, Math.min(WALL_H - 0.1, y)); }
    if (at === 'device') {
      const nd = (p.dev !== undefined && net.devices.get(p.dev)) ? { d: net.devices.get(p.dev), dd: 0 } : nearestDevice(x, z);
      if (nd) {
        let dx = x - nd.d.x, dz = z - nd.d.z;
        const r = Math.hypot(dx, dz);
        if (r > 1.2) { dx = dx / r * 0.6; dz = dz / r * 0.6; }   // ไกลเกินไป → ดึงมาชิดอุปกรณ์
        Object.assign(n, { dev: nd.d.id, dx: +dx.toFixed(3), dy: +Math.max(0.03, y).toFixed(3), dz: +dz.toFixed(3) });
        x = nd.d.x + dx; z = nd.d.z + dz; y = n.dy;
      }
    } else if (p.keepDev && p.dev !== undefined && net.devices.get(p.dev) && at !== 'wall') {
      // จุดต้น/ปลายจากปุ่มสำเร็จรูป: ยังติดตามอุปกรณ์อยู่ แต่ความสูงตามพื้น/เพดาน
      const d = net.devices.get(p.dev);
      Object.assign(n, { dev: d.id, dx: +(x - d.x).toFixed(3), dy: +y.toFixed(3), dz: +(z - d.z).toFixed(3), keepDev: true });
    }
    const { w, l } = roomSize();
    n.x = +Math.max(-w / 2, Math.min(w / 2, x)).toFixed(3);
    n.y = +Math.max(0, Math.min(WALL_H + 2, y)).toFixed(3);
    n.z = +Math.max(-l / 2, Math.min(l / 2, z)).toFixed(3);
    if (n.dev !== undefined && !n.keepDev && at !== 'device') delete n.dev;
    return n;
  }

  /* ----------------------------- วาดจุดจับ ----------------------------- */
  function clearHandles() {
    [...handles, ...inserts].forEach(m => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
    handles = []; inserts = [];
    if (halo) { scene.remove(halo); halo.geometry.dispose(); halo.material.dispose(); halo = null; }
  }
  function drawHandles() {
    clearHandles();
    const l = link();
    const c = l && cables.get(l.id);
    if (!c) return;
    halo = new THREE.Mesh(new THREE.TubeGeometry(c.curve, Math.max(40, route().length * 16 + 28), 0.07, 8, false),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.28, depthWrite: false }));
    scene.add(halo);
    const pts = [portAnchor(l.a.dev, l.a.port), ...route().map(p => { const q = absOf(p); return V(q.x, q.y, q.z); }), portAnchor(l.b.dev, l.b.port)];
    route().forEach((p, i) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(i === sel ? 0.13 : 0.1, 16, 12), new THREE.MeshBasicMaterial({ color: ANCH[p.at || 'free'].color, depthTest: false, transparent: true, opacity: 0.95 }));
      s.position.copy(pts[i + 1]);
      s.renderOrder = 20;
      s.userData.handle = i;
      scene.add(s);
      handles.push(s);
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthTest: false }));
      m.position.copy(pts[i]).add(pts[i + 1]).multiplyScalar(0.5);
      m.renderOrder = 19;
      m.userData.insert = i;
      scene.add(m);
      inserts.push(m);
    }
  }
  function rebuild() {
    const l = link();
    if (!l) return;
    removeCable(l.id);
    buildCable(l);
    drawHandles();
  }

  /* ------------------------------ แก้ไข ------------------------------ */
  function commit(fn, quiet) {
    const l = link();
    if (!l) return;
    const before = clone(l.route || []);
    fn(route());
    moveHistory.push({ type: 'route', linkId: l.id, route: before });
    if (moveHistory.length > 30) moveHistory.shift();
    rebuild();
    refreshAll();
    persist();
    if (!quiet) CE.renderPanel();
  }
  function preset(kind) {
    const l = link();
    if (!l) return;
    const A = net.devices.get(l.a.dev), B = net.devices.get(l.b.dev);
    commit(r => {
      r.length = 0;
      if (kind === 'auto') return;
      if (kind === 'wall') {
        const wa = onWall(A.x, A.z), wb = onWall(B.x, B.z);
        r.push({ at: 'wall', x: wa.x, y: WALL_Y, z: wa.z }, { at: 'wall', x: wb.x, y: WALL_Y, z: wb.z });
        return;
      }
      const y = kind === 'floor' ? FLOOR_Y : CEIL_Y(), at = kind === 'floor' ? 'floor' : 'ceiling';
      const toward = (d, o) => { const dx = o.x - d.x, dz = o.z - d.z, r0 = Math.hypot(dx, dz) || 1; return { dx: +(dx / r0 * 0.35).toFixed(3), dz: +(dz / r0 * 0.35).toFixed(3) }; };
      const ta = toward(A, B), tb = toward(B, A);
      r.push({ at, dev: A.id, dx: ta.dx, dy: y, dz: ta.dz, keepDev: true, x: A.x + ta.dx, y, z: A.z + ta.dz });
      if (Math.abs(A.x - B.x) > 0.4 && Math.abs(A.z - B.z) > 0.4) r.push({ at, x: B.x + tb.dx, y, z: A.z + ta.dz });
      r.push({ at, dev: B.id, dx: tb.dx, dy: y, dz: tb.dz, keepDev: true, x: B.x + tb.dx, y, z: B.z + tb.dz });
    });
    sel = -1;
    drawHandles();
    const names = { floor: 'เดินสายเลียบพื้น', ceiling: 'เดินสายบนรางเพดาน', wall: 'เดินสายในรางเลียบผนัง', auto: 'กลับเป็นสายโค้งอัตโนมัติ' };
    logConsole(`[CABLE] ${net.linkLabel(l)}: ${names[kind]} · ยาว ${net.cableLength(l)} ม.`, 'info');
  }
  function setAnchor(at) {
    if (sel < 0) return;
    commit(r => { const p = r[sel]; r[sel] = constrain(Object.assign({}, p, { keepDev: at === 'floor' || at === 'ceiling' ? p.keepDev : undefined }), at, absOf(p)); });
  }
  function setHeight(y) {
    if (sel < 0) return;
    const r = route(), p = r[sel];
    if (!p || p.at === 'floor' || p.at === 'ceiling') return;
    if (p.dev !== undefined) p.dy = y; else p.y = y;
    rebuild();
  }
  CE.removePoint = function () {
    if (sel < 0) return;
    commit(r => r.splice(sel, 1));
    sel = Math.min(sel, route().length - 1);
    drawHandles();
    CE.renderPanel();
  };

  /* ------------------------------ เมาส์ ------------------------------ */
  CE.down = function (event) {
    pendingDeselect = false;
    const hitsH = raycaster.intersectObjects([...handles, ...inserts], false);
    if (hitsH.length) {
      const o = hitsH[0].object;
      const before = clone(route());
      if (o.userData.insert !== undefined) {
        // เพิ่มจุดหักกลางเส้น (ยึดแบบเดียวกับจุดข้างเคียง)
        const i = o.userData.insert, r = route();
        const near = r[Math.min(i, r.length - 1)];
        const at = near && near.at !== 'device' ? near.at : 'free';
        r.splice(i, 0, constrain({}, at, { x: o.position.x, y: o.position.y, z: o.position.z }));
        sel = i;
        rebuild();
      } else sel = o.userData.handle;
      const p = route()[sel];
      drag = { i: sel, before, startY: event.clientY, y0: absOf(p).y, moved: o.userData.insert !== undefined };
      controls.enabled = false;
      drawHandles();
      CE.renderPanel();
      return true;
    }
    if (pickDevice() !== null) return false;            // อุปกรณ์มาก่อน (ลากย้ายตามปกติ)
    const hitC = raycaster.intersectObjects([...cables.values()].map(c => c.mesh), false);
    const l = hitC.length && hitC[0].object.userData.linkId !== undefined ? net.links.get(hitC[0].object.userData.linkId) : null;
    if (l && l.cable !== 'wireless') { CE.select(l.id); return true; }
    if (linkId !== null) pendingDeselect = true;
    return false;
  };
  CE.move = function (event) {
    if (!drag) return false;
    if (!drag.moved) {
      if (!downPos || Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y) < 4) return true;
      drag.moved = true;
    }
    const r = route(), p = r[drag.i];
    if (!p) return true;
    if (event.shiftKey && p.at !== 'floor' && p.at !== 'ceiling') {
      // Shift + ลากขึ้นลง = ปรับความสูง
      const y = Math.max(0.03, Math.min(WALL_H + 1.5, drag.y0 + (drag.startY - event.clientY) * 0.012));
      if (p.dev !== undefined) p.dy = +y.toFixed(3); else p.y = +y.toFixed(3);
    } else {
      setMouse(event);
      const q = absOf(p);
      const plane = new THREE.Plane(V(0, 1, 0), -q.y);
      if (!raycaster.ray.intersectPlane(plane, hitPoint)) return true;
      r[drag.i] = constrain(p, p.at || 'free', { x: hitPoint.x, y: q.y, z: hitPoint.z });
    }
    rebuild();
    const lenEl = document.getElementById('routeLen');
    if (lenEl) lenEl.textContent = `${net.cableLength(link())} ม.`;
    return true;
  };
  CE.up = function (event) {
    if (drag) {
      const l = link();
      if (l && drag.moved) {
        moveHistory.push({ type: 'route', linkId: l.id, route: drag.before });
        if (moveHistory.length > 30) moveHistory.shift();
        refreshAll();
        persist();
      }
      drag = null;
      controls.enabled = true;
      CE.renderPanel();
      return true;
    }
    if (pendingDeselect && downPos && Math.hypot(event.clientX - downPos.x, event.clientY - downPos.y) < 6 && event.target === renderer.domElement) {
      pendingDeselect = false;
      CE.deselect();
    }
    return false;
  };

  /* ------------------------- เลือก / ยกเลิก / แผง ------------------------- */
  CE.active = () => linkId !== null && !!link();
  CE.select = function (id) {
    const l = net.links.get(id);
    if (!l || l.cable === 'wireless') return;
    if (viewMode !== '3d') switchViewMode('3d');
    if (!editMode) setEditMode(true);
    selectedId = null;
    placeRings();
    linkId = id;
    sel = -1;
    drawHandles();
    switchTab('props');
    CE.renderPanel();
  };
  CE.deselect = function (silent) {
    if (linkId === null) return;
    linkId = null; sel = -1; drag = null;
    clearHandles();
    if (!silent) renderProps();
  };
  CE.refresh = function () {
    if (!CE.active()) { if (linkId !== null) CE.deselect(); return; }
    drawHandles();
  };
  CE.state = () => ({ linkId, sel, route: clone(route()), length: link() ? net.cableLength(link()) : 0 });
  CE.preset = preset;
  CE.setAnchor = setAnchor;
  CE.selectPoint = i => { sel = i; drawHandles(); CE.renderPanel(); };

  CE.renderPanel = function () {
    const body = $('propBody');
    const l = link();
    if (!body || !l) return;
    $('noSelectNotice').style.display = 'none';
    const A = devOf(l.a.dev), B = devOf(l.b.dev), cab = NetSim.CABLES[l.cable];
    const len = net.cableLength(l), max = NetSim.MAX_LEN[l.cable], st = net.linkStatus(l);
    const pct = max ? Math.min(100, Math.round(len * 100 / max)) : 0;
    const r = route(), p = r[sel];
    body.innerHTML = '';
    const add = (...kids) => body.append(...kids.filter(k => k !== null && k !== undefined && k !== false));
    add(
      h('div', { class: 'prop-head' }, icon('fa-bezier-curve'),
        h('div', {}, h('strong', { text: 'จัดเส้นทางสาย' }), h('small', { text: `${A.name} ${A.ports[l.a.port].name} ↔ ${B.name} ${B.ports[l.b.port].name}` }))),
      h('div', { class: 'prop-section route-len' + (st.up ? '' : ' bad') },
        h('div', { class: 'route-len__row' }, h('span', { class: 'cable-dot', style: `background:${hex(cab.color)}` }), h('b', { text: cab.th }),
          h('span', { class: 'route-len__num' }, h('b', { id: 'routeLen', text: `${len} ม.` }), max ? ` / ${max} ม.` : '')),
        max ? h('div', { class: 'route-meter' }, h('i', { style: `width:${pct}%` })) : null,
        st.up ? null : h('small', { class: 'route-warn', text: st.reason })),
      h('div', { class: 'prop-section' },
        h('div', { class: 'sec-title', text: 'เดินสายแบบสำเร็จรูป' }),
        h('div', { class: 'route-presets' },
          h('button', { class: 'btn', onclick: () => preset('floor') }, icon('fa-border-none'), ' เลียบพื้น'),
          h('button', { class: 'btn', onclick: () => preset('ceiling') }, icon('fa-grip-lines'), ' รางเพดาน'),
          h('button', { class: 'btn', onclick: () => preset('wall') }, icon('fa-border-all'), ' รางผนัง'),
          h('button', { class: 'btn', onclick: () => preset('auto') }, icon('fa-wave-square'), ' โค้งอัตโนมัติ'))),
      h('div', { class: 'prop-section' },
        h('div', { class: 'sec-title', text: `จุดหักบนสาย (${r.length})` }),
        r.length ? h('div', { class: 'route-points' }, r.map((q, i) => h('button', {
          class: 'route-pt' + (i === sel ? ' active' : ''), style: `--c:${hex(ANCH[q.at || 'free'].color)}`, onclick: () => CE.selectPoint(i)
        }, h('i', {}), `จุด ${i + 1}`, h('small', { text: ANCH[q.at || 'free'].th + (q.dev !== undefined && q.at !== 'device' ? ' · ตามอุปกรณ์' : '') }))))
          : h('p', { class: 'hint', text: 'ยังไม่มีจุดหัก — คลิกจุด + สีขาวกลางสายเพื่อเพิ่ม หรือเลือกแบบสำเร็จรูปด้านบน' })),
      p ? h('div', { class: 'prop-section' },
        h('div', { class: 'sec-title', text: `จุด ${sel + 1}: ยึดกับ` }),
        h('div', { class: 'route-anchors' }, Object.entries(ANCH).map(([k, a]) => h('button', {
          class: 'route-anc' + ((p.at || 'free') === k ? ' active' : ''), style: `--c:${hex(a.color)}`, onclick: () => setAnchor(k)
        }, icon(a.icon), a.th))),
        p.at === 'device' && devOf(p.dev) ? h('p', { class: 'hint', text: `ยึดกับ ${devOf(p.dev).name} — ย้ายอุปกรณ์แล้วจุดนี้ตามไปด้วย` }) : null,
        (p.at === 'floor' || p.at === 'ceiling') ? null : h('div', { class: 'form-group' }, h('label', { text: 'ความสูงจากพื้น (เมตร)' }),
          h('input', { type: 'range', min: 0.03, max: WALL_H, step: 0.01, value: absOf(p).y,
            oninput: e => setHeight(Number(e.target.value)),
            onchange: () => { refreshAll(); persist(); CE.renderPanel(); } })),
        h('button', { class: 'btn btn-danger', onclick: CE.removePoint }, icon('fa-trash'), ' ลบจุดนี้')) : null,
      h('p', { class: 'hint route-help', text: 'ลากจุดกลมเพื่อดัดสาย · คลิกจุด + กลางเส้นเพื่อเพิ่มจุดหัก · Shift+ลาก = ปรับความสูง · Delete = ลบจุด · Ctrl+Z = ย้อนกลับ · Esc = เสร็จ' }),
      h('button', { class: 'btn lp-wide', onclick: () => CE.deselect() }, icon('fa-check'), ' เสร็จสิ้นการจัดสาย'));
  };
})();
