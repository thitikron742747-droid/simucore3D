/* ==========================================================================
   SimuCore 3D — แดชบอร์ดครู
   ดูความคืบหน้าของนักเรียนทั้งห้องแบบสด: คะแนนภารกิจรายบท เลเวล/XP เหรียญ และรายงานล่าสุด
   ข้อมูลผ่าน Store.teacher.overview() — โหมด local อ่านบัญชีในเบราว์เซอร์นี้, โหมด api เรียก GET /teacher/overview
   ========================================================================== */
(function () {
  'use strict';
  const session = Store.session();
  if (!session) return;
  const me = session.user;
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
  const G = Store.GAME;

  const LABS = [
    ['network', 'LAN', '#22d3ee'], ['portal', 'Web Server', '#60a5fa'], ['datacenter', 'ศูนย์ข้อมูล', '#a78bfa'],
    ['panorama', '360°', '#f472b6'], ['wireless', 'Wi-Fi / NAT', '#34d399'], ['wan', 'Serial WAN', '#fbbf24']
  ].filter(([id]) => !window.SimActivities || SimActivities.ACTIVITIES[id]);
  // ห้องเรียน IoT: % ของบทเรียน IoT ที่ผ่าน (นับจากรายการ once ในความก้าวหน้า)
  const IOT_LESSONS = ['motion-light', 'fire-alarm', 'smart-farm', 'smart-door', 'smart-class', 'smart-home'];
  LABS.push(['iot', 'IoT', '#f59e0b']);
  function iotScore(progress) {
    const once = (progress && progress.once) || [];
    if (!once.some(k => /^iot-(task|done)-/.test(k))) return undefined;
    return Math.round(IOT_LESSONS.filter(id => once.includes('iot-done-' + id)).length * 100 / IOT_LESSONS.length);
  }

  if (me.role !== 'teacher') {
    $('main').innerHTML = '';
    $('main').append(h('div', { class: 't-locked glass' }, icon('fa-lock'),
      h('h2', { text: 'หน้านี้สำหรับบัญชีครู' }),
      h('p', { text: 'สมัครสมาชิกด้วยบทบาท "ครู" เพื่อดูความคืบหน้าของนักเรียนทั้งห้อง' }),
      h('a', { class: 'sc-btn sc-btn--primary', href: 'index.html' }, 'กลับหน้าหลัก')));
    $('liveText').textContent = '';
    return;
  }

  let data = { classrooms: [], students: [] };
  let sortKey = 'xp', sortDir = -1;

  const pct = s => { const m = String(s || '').match(/(\d+)\s*%/); return m ? Number(m[1]) : null; };
  // คะแนนดีที่สุดของแต่ละบท (จากรายงานภารกิจ)
  function bestScores(reports) {
    const best = {};
    reports.forEach(r => {
      const p = pct(r.score);
      if (p === null || !r.model) return;
      if (best[r.model] === undefined || p > best[r.model]) best[r.model] = p;
    });
    return best;
  }
  const cases = reports => reports.filter(r => /นักสืบ/.test(r.activity || '')).length;
  function ago(iso) {
    if (!iso) return '—';
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'เมื่อสักครู่';
    if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
    if (s < 86400) return `${Math.floor(s / 3600)} ชม. ที่แล้ว`;
    return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  }
  const rowsOf = () => {
    const q = $('searchBox').value.trim().toLowerCase();
    return data.students.map(s => Object.assign({}, s, { best: Object.assign(bestScores(s.reports), iotScore(s.progress) === undefined ? {} : { iot: iotScore(s.progress) }), level: G.levelOf(s.progress.xp), badges: Object.keys(s.progress.badges).length, cases: cases(s.reports) }))
      .filter(s => !q || s.user.fullName.toLowerCase().includes(q) || (s.user.studentId || '').includes(q) || s.user.username.includes(q));
  };

  async function load() {
    try {
      const prevClass = $('classSel').value;
      data = await Store.teacher.overview(prevClass);
      const sel = $('classSel');
      const keep = sel.value;
      sel.innerHTML = '';
      sel.append(h('option', { value: '', text: 'ทุกห้อง' }));
      data.classrooms.forEach(c => sel.append(h('option', { value: c, text: c || '(ไม่ระบุห้อง)' })));
      sel.value = data.classrooms.includes(keep) ? keep : '';
      $('liveText').innerHTML = '';
      $('liveText').append(h('span', { class: 'led' }), ` สด · อัปเดต ${new Date().toLocaleTimeString('th-TH')}`);
      render();
    } catch (e) {
      $('liveText').textContent = 'โหลดข้อมูลไม่สำเร็จ';
      UI.toast(e.message, 'err');
    }
  }

  function render() {
    const rows = rowsOf();
    const n = rows.length;
    const avgXp = n ? Math.round(rows.reduce((a, s) => a + s.progress.xp, 0) / n) : 0;
    const allScores = rows.flatMap(s => Object.values(s.best));
    const avgScore = allScores.length ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : 0;
    const today = new Date().toDateString();
    const activeToday = rows.filter(s => s.progress.updatedAt && new Date(s.progress.updatedAt).toDateString() === today).length;
    const stats = $('stats');
    stats.innerHTML = '';
    [['fa-user-graduate', 'นักเรียน', n, '#22d3ee'], ['fa-bolt', 'ใช้งานวันนี้', activeToday, '#34d399'], ['fa-bullseye', 'คะแนนภารกิจเฉลี่ย', avgScore + '%', '#fbbf24'],
      ['fa-star', 'XP เฉลี่ย', avgXp, '#a855f7'], ['fa-user-secret', 'คดีที่ไขแล้ว', rows.reduce((a, s) => a + s.cases, 0), '#818cf8']]
      .forEach(([ic, label, v, c]) => stats.append(h('div', { class: 't-stat glass', style: `--c:${c}` }, h('span', { class: 't-stat__icon' }, icon(ic)), h('b', { text: v }), h('small', { text: label }))));

    const bars = $('labBars');
    bars.innerHTML = '';
    LABS.forEach(([id, name, c]) => {
      const done = rows.filter(s => s.best[id] === 100).length;
      const tried = rows.filter(s => s.best[id] !== undefined).length;
      const p = n ? Math.round(done * 100 / n) : 0;
      bars.append(h('div', { class: 't-bar', style: `--c:${c}` },
        h('span', { class: 't-bar__name', text: name }),
        h('span', { class: 't-bar__track' }, h('i', { style: `width:${p}%` })),
        h('span', { class: 't-bar__num', text: `${done}/${n}` }),
        h('small', { text: `ลองแล้ว ${tried}` })));
    });

    const head = $('theadRow');
    head.innerHTML = '';
    const th = (key, label) => h('th', { scope: 'col', class: sortKey === key ? (sortDir > 0 ? 'asc' : 'desc') : '' },
      key ? h('button', { onclick: () => { sortDir = sortKey === key ? -sortDir : -1; sortKey = key; render(); } }, label) : label);
    head.append(th('name', 'นักเรียน'), th('xp', 'เลเวล / XP'), ...LABS.map(([id, name]) => th('lab:' + id, name)), th('badges', 'เหรียญ'), th('active', 'ล่าสุด'));

    const val = s => sortKey === 'name' ? s.user.fullName : sortKey === 'xp' ? s.progress.xp : sortKey === 'badges' ? s.badges
      : sortKey === 'active' ? (s.progress.updatedAt || '') : (s.best[sortKey.slice(4)] ?? -1);
    rows.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sortDir);

    const body = $('rows');
    body.innerHTML = '';
    if (!rows.length) body.append(h('tr', {}, h('td', { colspan: LABS.length + 4, class: 't-empty', text: 'ยังไม่มีนักเรียนในห้องนี้ — ให้นักเรียนสมัครสมาชิกและกรอกห้องเรียนให้ตรงกัน' })));
    rows.forEach(s => {
      body.append(h('tr', { tabindex: 0, onclick: () => openStudent(s), onkeydown: e => { if (e.key === 'Enter') openStudent(s); } },
        h('td', {}, h('div', { class: 't-who' }, h('span', { class: 'avatar', text: s.user.fullName.charAt(0) }),
          h('div', {}, h('b', { text: s.user.fullName }), h('small', { text: [s.user.studentId, s.user.classroom].filter(Boolean).join(' · ') || s.user.username })))),
        h('td', {}, h('div', { class: 't-lv' }, h('span', { class: 't-lv__badge', text: s.level.level }), h('div', {}, h('small', { text: s.level.title }), h('span', { class: 't-mini' }, h('i', { style: `width:${s.level.pct}%` })), h('em', { text: `${s.progress.xp} XP` })))),
        ...LABS.map(([id]) => { const p = s.best[id]; return h('td', { class: 't-score' }, h('span', { class: 't-pill ' + (p === undefined ? 'none' : p === 100 ? 'full' : p >= 50 ? 'mid' : 'low'), text: p === undefined ? '—' : p + '%' })); }),
        h('td', { class: 't-score' }, h('span', { class: 't-badges', text: `${s.badges}/${Object.keys(G.BADGES).length}` })),
        h('td', { class: 't-ago', text: ago(s.progress.updatedAt) })));
    });
    $('countText').textContent = `${rows.length} คน · คลิกแถวเพื่อดูรายละเอียด`;
    $('modeNote').textContent = Store.config.mode === 'local'
      ? 'โหมดสาธิต: แสดงบัญชีนักเรียนที่ใช้งานในเบราว์เซอร์นี้ อัปเดตทันทีเมื่อนักเรียนทำงานในแท็บอื่น — เมื่อต่อเซิร์ฟเวอร์จริง (config.js mode: api) จะเห็นนักเรียนทุกเครื่อง'
      : 'ข้อมูลจากเซิร์ฟเวอร์ อัปเดตอัตโนมัติทุก 5 วินาที';
  }

  function openStudent(s) {
    $('stTitle').textContent = s.user.fullName;
    $('stSub').textContent = `${[s.user.studentId, s.user.classroom].filter(Boolean).join(' · ')} · เลเวล ${s.level.level} ${s.level.title} · ${s.progress.xp} XP`;
    const body = $('stBody');
    body.innerHTML = '';
    body.append(
      h('div', { class: 't-st-badges' }, Object.entries(G.BADGES).map(([id, b]) => {
        const on = !!s.progress.badges[id];
        return h('span', { class: 'medal' + (on ? ' is-on' : ''), style: `--b:${on ? b.color : '#475569'}`, title: b.name + (on ? '' : ' (ยังไม่ได้)') }, icon(on ? b.icon : 'fa-lock'));
      })),
      h('h3', { class: 't-sub', text: 'รายงานล่าสุด' }),
      s.reports.length ? h('div', { class: 'reports' }, s.reports.slice(0, 12).map(r => h('div', { class: 'report' },
        h('div', { class: 'report__body' }, h('b', { text: r.activity || r.projectName || 'รันระบบ' }), h('small', { text: [r.date, r.score && 'คะแนน ' + r.score, r.time && 'เวลา ' + r.time].filter(Boolean).join(' · ') })),
        h('span', { class: 'status' + (r.status === 'ผ่าน' ? '' : r.status === 'มีคำเตือน' ? ' status--warn' : ' status--fail') }, h('span', { class: 'led' }), r.status || '-'))))
        : h('p', { class: 't-note', text: 'ยังไม่มีรายงาน' }),
      s.progress.log.length ? h('h3', { class: 't-sub', text: 'กิจกรรม XP' }) : null,
      s.progress.log.length ? h('div', { class: 't-log' }, s.progress.log.slice(0, 8).map(l => h('div', {}, h('span', { text: l.reason }), h('em', { text: l.xp ? `+${l.xp}` : '🏅' }), h('small', { text: ago(l.at) })))) : null);
    $('studentDialog').showModal();
  }
  document.querySelectorAll('[data-close]').forEach(b => { b.onclick = () => b.closest('dialog').close(); });
  $('studentDialog').addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  function exportCsv() {
    const rows = rowsOf();
    const head = ['ชื่อ-นามสกุล', 'รหัสนักเรียน', 'ห้องเรียน', 'ชื่อผู้ใช้', 'เลเวล', 'XP', ...LABS.map(([, n]) => `คะแนน ${n} (%)`), 'จำนวนเหรียญ', 'คดีที่ไข', 'ใช้งานล่าสุด'];
    const esc = v => { const s = String(v === undefined || v === null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [head, ...rows.map(s => [s.user.fullName, s.user.studentId, s.user.classroom, s.user.username, s.level.level, s.progress.xp, ...LABS.map(([id]) => s.best[id] ?? ''), s.badges, s.cases, s.progress.updatedAt ? new Date(s.progress.updatedAt).toLocaleString('th-TH') : ''])];
    const blob = new Blob(['﻿' + lines.map(r => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `simucore-คะแนน-${$('classSel').value || 'ทุกห้อง'}-${new Date().toISOString().slice(0, 10)}.csv` });
    document.body.append(a); a.click(); a.remove();
    UI.toast(`ส่งออก ${rows.length} รายชื่อแล้ว (เปิดด้วย Excel ได้)`, 'ok');
  }

  $('classSel').addEventListener('change', load);
  $('searchBox').addEventListener('input', render);
  $('refreshBtn').addEventListener('click', load);
  $('csvBtn').addEventListener('click', exportCsv);
  // สด: โหมด local ฟังการเปลี่ยนแปลงจากแท็บอื่น, ทุกโหมดดึงใหม่ทุก 5 วินาที
  window.addEventListener('storage', e => { if (!e.key || e.key.startsWith('simucore-')) load(); });
  setInterval(load, 5000);
  load();
  window.TeacherDash = { load, render, exportCsv, rowsOf };
})();
