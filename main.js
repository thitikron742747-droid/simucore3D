/* ==========================================================================
   SimuCore 3D — หน้าหลัก
   ข้อมูลทั้งหมด (โครงการ / รายงาน / บัญชี) ผ่าน Store (store.js) ซึ่งสลับไปใช้ฐานข้อมูลได้
   ========================================================================== */
(function () {
  'use strict';
  const session = Store.session();
  if (!session) return;            // กำลังถูกพาไปหน้าเข้าสู่ระบบ
  const user = session.user;
  const $ = id => document.getElementById(id);
  const h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach(c => { if (c !== null && c !== undefined && c !== false) e.append(c); });
    return e;
  };
  const icon = n => h('i', { class: 'fa-solid ' + n });

  const LABS = [
    { id: 'network', icon: 'fa-network-wired', accent: '#22d3ee', title: 'ห้องคอมพิวเตอร์เครือข่าย', desc: 'วาง PC ต่อเข้า Switch ตั้ง IP และ Subnet Mask แล้วดู ARP กับการเรียนรู้ MAC ของสวิตช์', chips: ['Catalyst 2960', 'PC 4 เครื่อง', 'Printer', 'ARP', 'ping'], words: 'lan switch ip subnet arp mac pc printer' },
    { id: 'portal', icon: 'fa-globe', accent: '#60a5fa', title: 'ระบบสารสนเทศและ Web Server', desc: 'สองวงเครือข่ายผ่าน Router ทดสอบ Default Gateway, DNS, TCP 3-way handshake และเปิดเว็บพอร์ทัลโรงเรียน', chips: ['Cisco 2911', 'Web Server', 'DNS', 'HTTP'], words: 'router gateway dns http web tcp server' },
    { id: 'datacenter', icon: 'fa-server', accent: '#a78bfa', title: 'ศูนย์ข้อมูลและเซิร์ฟเวอร์', desc: 'Core Router ต่อ Core Switch ด้วย Fiber, DHCP Server แจก IP, Access Point สำหรับช่าง และสาย Console เข้า CLI', chips: ['ISR 4331', 'Catalyst 3650', 'Fiber', 'DHCP', 'Wi-Fi', 'Console'], words: 'datacenter fiber dhcp rack ups console wifi ap' },
    { id: 'panorama', icon: 'fa-vr-cardboard', accent: '#f472b6', title: 'เดินสำรวจห้องเซิร์ฟเวอร์ 360°', desc: 'ยืนอยู่กลางห้องเซิร์ฟเวอร์ หันมองรอบตัว เดินไปตามจุด และคลิกอุปกรณ์เพื่ออ่านหน้าที่ของแต่ละชิ้น', chips: ['โหมดเดินสำรวจ', 'Server Rack', 'UPS', 'Web/DNS Server'], words: '360 panorama tour streetview เดิน สำรวจ' },
    { id: 'wireless', icon: 'fa-wifi', accent: '#34d399', title: 'Wi-Fi และอินเทอร์เน็ตบ้าน', desc: 'ต่อ Cable Modem เข้า Wireless Router ตั้ง SSID และรหัสผ่าน รับ IP จาก DHCP แล้วออกอินเทอร์เน็ตผ่าน NAT', chips: ['WRT300N', 'Cable Modem', 'Coaxial', 'NAT', 'Smartphone'], words: 'wifi wireless nat isp coaxial modem ssid smartphone tablet' },
    { id: 'wan', icon: 'fa-tower-broadcast', accent: '#fbbf24', title: 'เชื่อมสาขาด้วยสาย Serial', desc: 'ใส่โมดูล HWIC-2T ให้ Router 1941 เดินสาย Serial DCE/DTE ตั้ง Clock Rate และ Static Route ให้สองสาขาคุยกัน', chips: ['Cisco 1941', 'HWIC-2T', 'Serial', 'Static Route'], words: 'wan serial dce dte clock route 1941 hwic console' }
  ];
  const labName = id => (LABS.find(l => l.id === id) || {}).title || id;
  const taskCount = id => (window.SimActivities && SimActivities.ACTIVITIES[id] ? SimActivities.ACTIVITIES[id].tasks.length : 0);

  /* ------------------------------ ผู้ใช้ / เมนู ------------------------------ */
  function renderUser(u) {
    $('userName').textContent = u.fullName;
    $('userRole').textContent = Store.ROLES[u.role] + (u.classroom ? ` ${u.classroom}` : '');
    $('userAvatar').textContent = (u.fullName || '?').trim().charAt(0).toUpperCase();
    $('userMeta').textContent = u.role === 'guest' ? 'โหมดผู้เยี่ยมชม งานเก็บในเบราว์เซอร์นี้เท่านั้น' : `เข้าสู่ระบบเป็น ${u.username}`;
    const hour = new Date().getHours();
    const part = hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
    $('greet').textContent = `${part}, ${u.fullName}`;
  }
  renderUser(user);
  $('storageNote').textContent = Store.config.mode === 'api' ? 'งานบันทึกบนเซิร์ฟเวอร์' : 'งานบันทึกในเบราว์เซอร์นี้';

  const menu = $('userMenu'), userBtn = $('userBtn');
  function toggleMenu(open) {
    const on = open === undefined ? menu.hidden : open;
    menu.hidden = !on;
    userBtn.setAttribute('aria-expanded', String(on));
    if (on) menu.querySelector('button').focus();
  }
  userBtn.addEventListener('click', e => { e.stopPropagation(); toggleMenu(); });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) toggleMenu(false); });
  menu.addEventListener('keydown', e => {
    const items = [...menu.querySelectorAll('button')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    if (e.key === 'Escape') { toggleMenu(false); userBtn.focus(); }
  });
  if (user.role === 'teacher') {
    $('navTeacher').hidden = false;
    $('menuTeacher').hidden = false;
    $('menuTeacher').onclick = () => { location.href = 'teacher.html'; };
  }
  $('menuProfile').onclick = () => { toggleMenu(false); openProfile(); };
  $('menuReports').onclick = () => { toggleMenu(false); openReports(); };
  $('menuLogout').onclick = async () => {
    toggleMenu(false);
    const ok = await UI.confirm({ title: 'ออกจากระบบ', message: user.role === 'guest' ? 'งานของผู้เยี่ยมชมยังอยู่ในเบราว์เซอร์นี้ กลับมาทดลองใช้ต่อได้' : 'งานทั้งหมดบันทึกไว้แล้ว เข้าสู่ระบบอีกครั้งเพื่อทำต่อ', confirmText: 'ออกจากระบบ' });
    if (!ok) return;
    UI.loader.show('กำลังออกจากระบบ', ['ปิดการเชื่อมต่อ (FIN)']);
    await Store.auth.logout();
    location.replace('auth.html?logout=1');
  };

  /* ----------------------- Hero: แพ็กเก็ตวิ่งบนแผนผัง ----------------------- */
  const COLORS = { ARP: '#ffb020', ICMP: '#3ddc84', DNS: '#b48cff' };
  const TOPO = {
    nodes: {
      R1: { x: 280, y: 52, label: 'R1', ip: '192.168.1.1', kind: 'router' },
      SW: { x: 280, y: 160, label: 'SW-1', ip: '', kind: 'switch' },
      PC1: { x: 78, y: 262, label: 'PC-1', ip: '.10', kind: 'pc' },
      PC2: { x: 210, y: 262, label: 'PC-2', ip: '.11', kind: 'pc' },
      PC3: { x: 350, y: 262, label: 'PC-3', ip: '.12', kind: 'pc' },
      SRV: { x: 482, y: 262, label: 'Server', ip: '.100', kind: 'server' }
    },
    links: [['R1', 'SW'], ['SW', 'PC1'], ['SW', 'PC2'], ['SW', 'PC3'], ['SW', 'SRV']]
  };
  // เรื่องราวที่วนเล่น: [โปรโตคอล, คำบรรยาย, [[จาก, ถึง], ...]] — ทุกคู่ในรอบเดียวกันวิ่งพร้อมกัน
  const STORY = [
    ['ARP', 'PC-1 อยากคุยกับ Server แต่ยังไม่รู้ MAC จึงส่ง ARP Request แบบ Broadcast', [['PC1', 'SW']]],
    ['ARP', 'Switch ยังไม่รู้ว่า Server อยู่พอร์ตไหน จึงส่งต่อทุกพอร์ต (Flood)', [['SW', 'PC2'], ['SW', 'PC3'], ['SW', 'SRV'], ['SW', 'R1']]],
    ['ARP', 'Server ตอบ ARP Reply บอก MAC ของตัวเอง', [['SRV', 'SW']]],
    ['ARP', 'Switch จำได้แล้วว่า PC-1 อยู่พอร์ตไหน จึงส่งตรงพอร์ตเดียว', [['SW', 'PC1']]],
    ['ICMP', 'PC-1 ping Server (ICMP Echo Request)', [['PC1', 'SW']]],
    ['ICMP', 'Switch รู้จัก MAC ของ Server แล้ว ไม่ต้อง Flood อีก', [['SW', 'SRV']]],
    ['ICMP', 'Server ตอบกลับ Echo Reply', [['SRV', 'SW']]],
    ['ICMP', 'PC-1 ได้รับคำตอบ: Reply from 192.168.1.100', [['SW', 'PC1']]],
    ['DNS', 'PC-3 ถาม DNS ว่า www.school.local คือ IP อะไร ผ่าน Router', [['PC3', 'SW']]],
    ['DNS', 'ปลายทางอยู่คนละวง Switch ส่งต่อไปที่ Default Gateway', [['SW', 'R1']]]
  ];
  const NS = 'http://www.w3.org/2000/svg';
  const svgEl = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); if (parent) parent.append(e); return e; };
  const svg = $('topo');
  const paths = {}, leds = {};
  function drawTopo() {
    const N = TOPO.nodes;
    // ตารางจุดพื้นหลัง
    const defs = svgEl('defs', {}, svg);
    const pat = svgEl('pattern', { id: 'dots', width: 20, height: 20, patternUnits: 'userSpaceOnUse' }, defs);
    svgEl('circle', { cx: 1, cy: 1, r: 1, fill: 'rgba(255,255,255,0.12)' }, pat);
    svgEl('rect', { width: 560, height: 320, fill: 'url(#dots)' }, svg);
    TOPO.links.forEach(([a, b]) => {
      const A = N[a], B = N[b];
      const midY = (A.y + B.y) / 2;
      const d = `M${A.x},${A.y + 18} C${A.x},${midY + 10} ${B.x},${midY - 10} ${B.x},${B.y - 18}`;
      const p = svgEl('path', { d, class: 'cable' }, svg);
      paths[a + '-' + b] = { el: p, rev: false };
      paths[b + '-' + a] = { el: p, rev: true };
    });
    Object.entries(N).forEach(([id, n]) => {
      const g = svgEl('g', { transform: `translate(${n.x},${n.y})` }, svg);
      const w = n.kind === 'switch' ? 120 : n.kind === 'router' ? 86 : 70, hh = 34;
      svgEl('rect', { x: -w / 2, y: -hh / 2, width: w, height: hh, rx: 9, fill: 'rgba(255,255,255,0.1)', stroke: 'rgba(255,255,255,0.35)' }, g);
      if (n.kind === 'switch') for (let i = 0; i < 8; i++) svgEl('rect', { x: -50 + i * 13, y: 4, width: 9, height: 6, rx: 1.5, fill: 'rgba(5,8,24,0.6)' }, g);
      leds[id] = svgEl('circle', { cx: w / 2 - 9, cy: -hh / 2 + 9, r: 3.2, fill: '#3ddc84' }, g);
      svgEl('text', { x: -w / 2 + 9, y: n.kind === 'switch' ? -2 : 4, class: 'node-label' }, g).textContent = n.label;
      if (n.ip) svgEl('text', { x: 0, y: hh / 2 + 15, 'text-anchor': 'middle', class: 'node-ip' }, g).textContent = n.ip;
    });
  }
  drawTopo();

  function setCaption(proto, text) {
    $('topoProto').textContent = proto;
    $('topoProto').style.background = COLORS[proto];
    $('topoText').textContent = text;
  }
  function flash(id, color) {
    const led = leds[id];
    if (!led) return;
    led.setAttribute('fill', color);
    setTimeout(() => led.setAttribute('fill', '#3ddc84'), 260);
  }
  function fly([from, to], color, dur) {
    return new Promise(resolve => {
      const p = paths[from + '-' + to];
      const len = p.el.getTotalLength();
      const pkt = svgEl('rect', { width: 16, height: 10, rx: 2, x: -8, y: -5, fill: color }, svg);
      p.el.classList.add('is-hot');
      const t0 = performance.now();
      const step = now => {
        const k = Math.min(1, (now - t0) / dur);
        const e = k * k * (3 - 2 * k);
        const pt = p.el.getPointAtLength((p.rev ? 1 - e : e) * len);
        pkt.setAttribute('transform', `translate(${pt.x},${pt.y})`);
        if (k < 1) requestAnimationFrame(step);
        else { pkt.remove(); p.el.classList.remove('is-hot'); flash(to, color); resolve(); }
      };
      requestAnimationFrame(step);
    });
  }
  async function playStory() {
    if (UI.reduced) { setCaption(STORY[4][0], STORY[4][1]); return; }
    for (;;) {
      for (const [proto, text, hops] of STORY) {
        setCaption(proto, text);
        await Promise.all(hops.map(hp => fly(hp, COLORS[proto], 900)));
        await UI.wait(650);
      }
      await UI.wait(1200);
    }
  }
  playStory();

  /* --------------------------------- แล็บ --------------------------------- */
  function renderLabs() {
    const list = $('labList');
    list.innerHTML = '';
    LABS.forEach((lab, i) => {
      const n = taskCount(lab.id);
      const card = h('article', { class: 'lab glass', style: `--accent:${lab.accent}`, 'data-search': `${lab.title} ${lab.desc} ${lab.chips.join(' ')} ${lab.words}`.toLowerCase() },
        h('span', { class: 'lab__glow', 'aria-hidden': 'true' }),
        h('div', { class: 'lab__top' },
          h('span', { class: 'lab__icon', 'aria-hidden': 'true' }, icon(lab.icon)),
          h('span', { class: 'lab__no', 'aria-hidden': 'true', text: String(i + 1).padStart(2, '0') })),
        h('h3', { text: lab.title }),
        h('p', { text: lab.desc }),
        h('div', { class: 'chips' }, lab.chips.map(c => h('span', { class: 'chip', text: c }))),
        h('div', { class: 'lab__side' },
          n ? h('button', { class: 'lab__task', type: 'button', onclick: () => openProjectDialog(lab.id, true), title: 'เริ่มในโหมดภารกิจ' }, icon('fa-flag-checkered'), ` ภารกิจ ${n} ข้อ`) : null,
          h('button', { class: 'sc-btn', type: 'button', onclick: () => (lab.id === 'panorama' ? openWorkspace('workspace.html?model=panorama&mode=360', 'เดินสำรวจห้องเซิร์ฟเวอร์') : openProjectDialog(lab.id)) },
            lab.id === 'panorama' ? 'เริ่มเดินสำรวจ' : 'เปิดแล็บ')));
      addTilt(card);
      list.append(card);
    });
    $('labCount').textContent = `${LABS.length} แล็บ`;
    const sel = $('projectModel');
    sel.innerHTML = '';
    LABS.forEach(l => sel.append(h('option', { value: l.id, text: l.title })));
  }

  /* -------------------------------- โครงการ -------------------------------- */
  let projects = [];
  async function loadProjects() {
    try {
      projects = await Store.projects.list();
    } catch (e) {
      projects = [];
      UI.toast(e.message, 'err');
    }
    renderProjects();
  }

  function projectRow(p, isNew) {
    const url = `workspace.html?projectId=${encodeURIComponent(p.id)}&model=${encodeURIComponent(p.model)}`;
    const row = h('div', { class: 'project' + (isNew ? ' is-new' : ''), 'data-id': p.id, 'data-search': `${p.name} ${labName(p.model)}`.toLowerCase() },
      h('div', {},
        h('div', { class: 'project__row' },
          h('span', { class: 'led' }),
          h('div', { class: 'project__info' },
            h('div', { class: 'project__name', text: p.name }),
            h('div', { class: 'project__meta', text: `${labName(p.model)}, สร้างเมื่อ ${p.createdAt}` })),
          h('div', { class: 'project__actions' },
            h('button', { class: 'sc-btn', type: 'button', onclick: () => openWorkspace(url, p.name) }, icon('fa-cube'), ' เปิดห้อง 3D'),
            h('button', { class: 'icon-btn is-danger', type: 'button', 'aria-label': `ลบโครงการ ${p.name}`, onclick: () => deleteProject(p, row) }, icon('fa-trash-can'))))));
    return row;
  }

  function emptyProjects() {
    return h('div', { class: 'empty' },
      h('b', { text: 'ยังไม่มีโครงการ' }),
      'สร้างโครงการแรกเพื่อเริ่มออกแบบห้องเครือข่าย 3D',
      h('button', { class: 'sc-btn sc-btn--primary', type: 'button', onclick: () => openProjectDialog() }, icon('fa-plus'), ' สร้างโครงการ'));
  }

  function renderProjects() {
    const list = $('projectList');
    list.innerHTML = '';
    if (!projects.length) list.append(emptyProjects());
    else projects.forEach(p => list.append(projectRow(p)));
    $('projectCount').textContent = `${projects.length} โครงการ`;
    applySearch();
  }

  async function deleteProject(p, row) {
    const ok = await UI.confirm({ title: `ลบ "${p.name}"`, message: 'ห้อง อุปกรณ์ และการตั้งค่าทั้งหมดของโครงการนี้จะหายไป และกู้คืนไม่ได้', confirmText: 'ลบโครงการ', danger: true });
    if (!ok) return;
    try { await Store.projects.remove(p.id); } catch (e) { UI.toast(e.message, 'err'); return; }
    projects = projects.filter(x => String(x.id) !== String(p.id));
    row.classList.add('is-leaving');
    setTimeout(() => {
      row.remove();
      if (!projects.length) $('projectList').append(emptyProjects());
      $('projectCount').textContent = `${projects.length} โครงการ`;
    }, UI.reduced ? 0 : 340);
    UI.toast(`ลบโครงการ ${p.name} แล้ว`, 'ok');
  }

  function openWorkspace(url, name) {
    UI.loader.show(`กำลังเปิด ${name}`, ['เตรียมเอนจินจำลองเครือข่าย', 'โหลดห้อง 3D'], 'SimuCore 3D');
    setTimeout(() => UI.loader.step(1), UI.reduced ? 0 : 200);
    setTimeout(() => { location.href = url; }, UI.reduced ? 0 : 420);
  }

  /* ---------------------------- สร้างโครงการ ---------------------------- */
  const projectDialog = $('projectDialog');
  function openProjectDialog(model, activity) {
    $('projectForm').reset();
    $('projectModel').value = model || 'network';
    $('useTemplateCheck').checked = true;
    $('useActivityCheck').checked = !!activity;
    projectDialog.showModal();
    $('projectName').focus();
  }
  $('newProjectBtn').onclick = () => openProjectDialog();
  $('exploreBtn').onclick = () => $('labs').scrollIntoView({ behavior: UI.reduced ? 'auto' : 'smooth' });
  $('projectForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('projectName').value.trim();
    if (!name) { $('projectName').focus(); UI.toast('ตั้งชื่อโครงการก่อน', 'warn'); return; }
    const model = $('projectModel').value;
    let project;
    try { project = await Store.projects.create({ name, model }); } catch (err) { UI.toast(err.message, 'err'); return; }
    projectDialog.close();
    projects.unshift(project);
    const list = $('projectList');
    const empty = list.querySelector('.empty');
    if (empty) empty.remove();
    list.prepend(projectRow(project, true));
    $('projectCount').textContent = `${projects.length} โครงการ`;
    const q = `workspace.html?projectId=${encodeURIComponent(project.id)}&model=${model}&template=${$('useTemplateCheck').checked ? 1 : 0}${$('useActivityCheck').checked ? '&activity=1' : ''}`;
    setTimeout(() => openWorkspace(q, name), UI.reduced ? 0 : 450);
  });

  /* --------------------------------- รายงาน --------------------------------- */
  async function openReports() {
    const list = $('reportsList');
    list.innerHTML = '';
    list.append(h('div', { class: 'skeleton' }), h('div', { class: 'skeleton' }));
    $('reportsDialog').showModal();
    let reports = [];
    try { reports = await Store.reports.list(); } catch (e) { UI.toast(e.message, 'err'); }
    list.innerHTML = '';
    if (!reports.length) {
      list.append(h('div', { class: 'empty' }, h('b', { text: 'ยังไม่มีรายงาน' }), 'กด "รันระบบ" หรือทำภารกิจในห้อง 3D แล้วผลจะมาแสดงที่นี่'));
      return;
    }
    reports.forEach(r => {
      const cls = r.status === 'ผ่าน' ? '' : r.status === 'มีคำเตือน' ? ' status--warn' : ' status--fail';
      list.append(h('div', { class: 'report' },
        h('div', { class: 'report__body' },
          h('b', { text: r.projectName }),
          h('small', { text: `${labName(r.model)}, อุปกรณ์ ${r.devices} ชิ้น${r.date ? ', ' + r.date : ''}` }),
          r.score ? h('small', { class: 'report__score', text: `${r.activity || 'ภารกิจ'}: คะแนน ${r.score} ใช้เวลา ${r.time || '-'}` }) : null),
        h('span', { class: 'status' + cls }, h('span', { class: 'led' }), r.status)));
    });
  }
  $('clearReportsBtn').onclick = async () => {
    const ok = await UI.confirm({ title: 'ล้างประวัติรายงาน', message: 'รายงานและคะแนนทั้งหมดของบัญชีนี้จะถูกลบ', confirmText: 'ล้างประวัติ', danger: true });
    if (!ok) return;
    await Store.reports.clear();
    openReports();
    UI.toast('ล้างประวัติแล้ว', 'ok');
  };

  /* ------------------------ ความก้าวหน้า: เลเวล เหรียญ อันดับ ------------------------ */
  async function renderProgress() {
    const box = $('progressBox');
    const G = Store.GAME;
    let p = null, board = [];
    try { p = await Store.progress.get(); } catch (e) { p = { xp: 0, badges: {}, log: [] }; }
    if (user.role !== 'guest') { try { board = await Store.progress.leaderboard(user.classroom || ''); } catch (e) { board = []; } }
    const L = G.levelOf(p.xp);
    const got = Object.keys(p.badges).length, total = Object.keys(G.BADGES).length;
    box.innerHTML = '';
    box.append(
      h('div', { class: 'prog__card glass' },
        h('div', { class: 'prog__medal' }, h('b', { text: L.level })),
        h('div', { class: 'prog__lv' },
          h('small', { text: `เลเวล ${L.level}` }),
          h('strong', { text: L.title }),
          h('div', { class: 'prog__bar' }, h('i', { style: `width:${L.pct}%` })),
          h('span', { text: L.next ? `${p.xp} XP · อีก ${L.next - p.xp} XP ถึงเลเวล ${L.level + 1}` : `${p.xp} XP · เลเวลสูงสุด` }))),
      h('div', { class: 'prog__badges glass' },
        h('div', { class: 'prog__title' }, h('b', { text: 'เหรียญรางวัล' }), h('span', { text: `${got}/${total}` })),
        h('div', { class: 'prog__grid' }, Object.entries(G.BADGES).map(([id, b]) => {
          const on = !!p.badges[id];
          return h('span', { class: 'medal' + (on ? ' is-on' : ''), style: `--b:${on ? b.color : '#475569'}`, title: `${b.name} — ${b.desc}${on ? '' : ' (ยังไม่ได้รับ)'}`, 'aria-label': b.name }, icon(on ? b.icon : 'fa-lock'));
        }))),
      h('div', { class: 'prog__board glass' },
        h('div', { class: 'prog__title' }, h('b', { text: user.classroom ? `อันดับห้อง ${user.classroom}` : 'อันดับ' }), h('span', { text: 'XP' })),
        user.role === 'guest' ? h('p', { class: 'prog__note', text: 'สมัครสมาชิกเพื่อขึ้นตารางอันดับของห้องเรียน' })
          : board.length ? h('ol', { class: 'prog__list' }, board.slice(0, 5).map((r, i) => h('li', { class: r.user.id === user.id ? 'is-me' : '' },
              h('span', { class: 'rank', text: i + 1 }), h('span', { class: 'who', text: r.user.fullName }), h('em', { text: r.xp }))))
          : h('p', { class: 'prog__note', text: 'ยังไม่มีนักเรียนในห้องนี้เก็บ XP — เริ่มจากทำภารกิจในห้องแล็บ' }),
        Store.config.mode === 'local' && user.role !== 'guest' ? h('small', { class: 'prog__note', text: 'โหมดสาธิต: นับเฉพาะบัญชีที่ใช้ในเบราว์เซอร์นี้' }) : null));
  }
  renderProgress();

  /* -------------------------------- บัญชีของฉัน -------------------------------- */
  function openProfile() {
    const u = Store.user();
    $('profileSub').textContent = u.role === 'guest' ? 'ผู้เยี่ยมชมแก้ไขบัญชีไม่ได้ สมัครสมาชิกเพื่อบันทึกงานไว้ในบัญชี' : `${Store.ROLES[u.role]}, ชื่อผู้ใช้ ${u.username}`;
    $('pfName').value = u.fullName; $('pfClass').value = u.classroom || ''; $('pfSid').value = u.studentId || '';
    [...document.querySelectorAll('#profileDialog input')].forEach(i => { i.disabled = u.role === 'guest'; });
    [...document.querySelectorAll('#profileDialog form button')].forEach(b => { b.disabled = u.role === 'guest'; });
    showProfileTab('info');
    $('profileDialog').showModal();
  }
  function showProfileTab(t) {
    document.querySelectorAll('[data-ptab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.ptab === t)));
    $('profileForm').hidden = t !== 'info';
    $('passwordForm').hidden = t !== 'password';
    ['profileError', 'passwordError'].forEach(id => $(id).classList.remove('is-on'));
  }
  document.querySelectorAll('[data-ptab]').forEach(b => { b.onclick = () => showProfileTab(b.dataset.ptab); });
  const showErr = (id, msg) => { const e = $(id); e.classList.remove('is-on'); void e.offsetWidth; e.textContent = msg; e.classList.add('is-on'); };
  $('profileForm').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const u = await Store.auth.updateProfile({ fullName: $('pfName').value, classroom: $('pfClass').value, studentId: $('pfSid').value });
      renderUser(u);
      $('profileDialog').close();
      UI.toast('บันทึกข้อมูลบัญชีแล้ว', 'ok');
    } catch (err) { showErr('profileError', err.message); }
  });
  $('passwordForm').addEventListener('submit', async e => {
    e.preventDefault();
    if ($('pwNew').value !== $('pwNew2').value) return showErr('passwordError', 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
    try {
      await Store.auth.changePassword($('pwOld').value, $('pwNew').value);
      $('passwordForm').reset();
      $('profileDialog').close();
      UI.toast('เปลี่ยนรหัสผ่านแล้ว', 'ok');
    } catch (err) { showErr('passwordError', err.message); }
  });

  // ปุ่มปิดของทุก dialog + คลิกพื้นหลังเพื่อปิด
  document.querySelectorAll('dialog').forEach(d => {
    d.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => d.close(); });
    d.addEventListener('click', e => {
      const r = d.getBoundingClientRect();
      if (e.target === d && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) d.close();
    });
  });

  /* ----------------------------- ค้นหา / เมนูข้าง ----------------------------- */
  function applySearch() {
    const q = $('searchInput').value.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('.lab').forEach(el => {
      const hit = !q || el.dataset.search.includes(q);
      el.classList.toggle('is-hidden', !hit);
      if (hit) shown++;
    });
    $('labEmpty').hidden = shown > 0;
    document.querySelectorAll('.project').forEach(el => { el.hidden = !!q && !el.dataset.search.includes(q); });
  }
  $('searchInput').addEventListener('input', applySearch);

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      if (!page) return;                       // ลิงก์ไปหน้าอื่น (ห้องเรียน IoT / แดชบอร์ดครู)
      if (page === 'reports') return openReports();
      if (page === 'profile') return openProfile();
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('is-active', b === btn));
      const target = page === 'home' ? document.body : $(page);
      if (page === 'home') window.scrollTo({ top: 0, behavior: UI.reduced ? 'auto' : 'smooth' });
      else target.scrollIntoView({ behavior: UI.reduced ? 'auto' : 'smooth' });
    });
  });

  /* ------------------- ฉาก 3D หมุน: อุปกรณ์โคจรรอบแกนเครือข่าย ------------------- */
  const RINGS = [
    { a: 70, b: 0, r: 214, dur: 28, glow: '#22d3ee', sats: [['fa-route', 'Router', '#22d3ee'], ['fa-server', 'Server', '#a78bfa'], ['fa-laptop', 'Laptop', '#60a5fa'], ['fa-print', 'Printer', '#f472b6']], pkts: 3 },
    { a: 66, b: 58, r: 166, dur: 20, glow: '#a855f7', rev: true, sats: [['fa-network-wired', 'Switch', '#34d399'], ['fa-wifi', 'Wi-Fi', '#fbbf24'], ['fa-mobile-screen', 'Phone', '#f472b6']], pkts: 2 },
    { a: 62, b: -54, r: 124, dur: 16, glow: '#ec4899', sats: [['fa-shield-halved', 'Firewall', '#fb7185'], ['fa-cloud', 'ISP', '#7dd3fc']], pkts: 2 }
  ];
  function buildOrbit() {
    const scene = $('orbitScene');
    if (!scene) return;
    const core = h('div', { class: 'core' }, h('span', { class: 'core__halo' }), h('span', { class: 'core__halo' }), h('span', { class: 'core__orb' }), h('span', { class: 'core__icon' }, icon('fa-network-wired')));
    scene.append(core);
    RINGS.forEach(r => {
      const spin = h('div', { class: 'ring__spin' }, h('div', { class: 'ring__track' }));
      const step = 360 / r.sats.length;
      r.sats.forEach(([ic, label, color], i) => {
        spin.append(h('div', { class: 'sat', style: `--p:${i * step}deg;--glow:${color}` },
          h('div', { class: 'sat__face' }, icon(ic), h('small', { text: label }))));
      });
      for (let k = 0; k < r.pkts; k++) {
        spin.append(h('div', { class: 'sat', style: `--p:${k * (360 / r.pkts) + step / 2}deg;--glow:${['#ffb020', '#3ddc84', '#b48cff'][k % 3]}` }, h('span', { class: 'pkt' })));
      }
      scene.append(h('div', { class: 'ring' + (r.rev ? ' ring--rev' : ''), style: `--a:${r.a}deg;--b:${r.b}deg;--r:${r.r}px;--dur:${r.dur}s;--glow:${r.glow}` }, spin));
    });
    // ทั้งฉากเอียงตามตำแหน่งเมาส์
    if (!UI.reduced && window.matchMedia('(hover: hover)').matches) {
      const hero = $('home');
      hero.addEventListener('pointermove', e => {
        const b = hero.getBoundingClientRect();
        const px = (e.clientX - b.left) / b.width - 0.5, py = (e.clientY - b.top) / b.height - 0.5;
        scene.style.setProperty('--ty', `${(px * 26).toFixed(2)}deg`);
        scene.style.setProperty('--tx', `${(-8 - py * 18).toFixed(2)}deg`);
      });
      hero.addEventListener('pointerleave', () => { scene.style.setProperty('--ty', '0deg'); scene.style.setProperty('--tx', '-8deg'); });
    }
  }
  buildOrbit();

  /* ------------------ กระจก: ประกายแสงตามเมาส์ + การ์ดเอียง 3D ------------------ */
  const canHover = window.matchMedia('(hover: hover)').matches && !UI.reduced;
  function addSheen(el) {
    if (!canHover) return;
    el.addEventListener('pointermove', e => {
      const b = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - b.left}px`);
      el.style.setProperty('--my', `${e.clientY - b.top}px`);
    });
  }
  function addTilt(card) {
    addSheen(card);
    if (!canHover) return;
    card.addEventListener('pointermove', e => {
      const b = card.getBoundingClientRect();
      const px = (e.clientX - b.left) / b.width - 0.5, py = (e.clientY - b.top) / b.height - 0.5;
      card.style.setProperty('--ry', `${(px * 12).toFixed(2)}deg`);
      card.style.setProperty('--rx', `${(-py * 10).toFixed(2)}deg`);
    });
    card.addEventListener('pointerleave', () => { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); });
  }
  document.querySelectorAll('.glass').forEach(el => { if (!el.classList.contains('lab')) addSheen(el); });

  /* ------------------------------ ตัวเลขนับขึ้น ------------------------------ */
  document.querySelectorAll('[data-count]').forEach((el, i) => {
    const target = Number(el.dataset.count);
    if (UI.reduced) { el.textContent = target; return; }
    const t0 = performance.now() + i * 120, dur = 1100;
    const tick = now => {
      const k = Math.max(0, Math.min(1, (now - t0) / dur));
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  renderLabs();
  window.addEventListener('pageshow', e => { if (e.persisted) UI.loader.hide(); });
  loadProjects();
})();
