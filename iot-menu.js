/* ==========================================================================
   SimuCore — หน้าห้องเรียน IoT (เลือกบทเรียน + ความคืบหน้า + รู้จักชิ้นส่วน)
   ========================================================================== */
(function () {
  'use strict';
  const session = Store.session();
  if (!session) return;
  const $ = id => document.getElementById(id);
  const h = (tag, props, ...kids) => {
    const e = document.createElement(tag);
    Object.entries(props || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat(Infinity).forEach(c => { if (c !== null && c !== undefined && c !== false) e.append(c); });
    return e;
  };
  const icon = n => h('i', { class: (/^fa-brands/.test(n) ? '' : 'fa-solid ') + n, 'aria-hidden': 'true' });
  const L = IoTLessons.LESSONS, P = IoTSim.PARTS;
  const LEVEL = ['', 'พื้นฐาน', 'ปานกลาง', 'ท้าทาย'];

  const u = session.user;
  $('imName').textContent = u.fullName;
  $('imAvatar').textContent = (u.fullName || '?').trim().charAt(0).toUpperCase();

  async function load() {
    let prog = null;
    try { prog = await Store.progress.get(); } catch (e) { prog = null; }
    const once = (prog && prog.once) || [];
    const status = await Promise.all(L.map(async l => {
      const done = once.includes('iot-done-' + l.id);
      let d = 0;
      try { const w = await Store.workspaces.load('iot-' + l.id); d = w && w.passed ? w.passed.filter(Boolean).length : 0; } catch (e) { d = 0; }
      return { done, count: done ? l.tasks.length : d, started: done || d > 0 };
    }));
    render(status, prog);
  }

  function render(st, prog) {
    const list = $('lessonList');
    list.innerHTML = '';
    const nextIdx = st.findIndex(s => !s.done);
    L.forEach((l, i) => {
      const s = st[i];
      const pct = Math.round(s.count * 100 / l.tasks.length);
      const state = s.done ? 'done' : i === nextIdx ? 'next' : s.started ? 'started' : 'todo';
      const btnText = s.done ? 'ทบทวน' : s.started ? 'ทำต่อ' : 'เริ่มบทเรียน';
      list.append(h('li', { class: `im-lesson glass is-${state}`, style: `--c:${l.color}` },
        h('div', { class: 'im-lesson__no', 'aria-hidden': 'true' }, s.done ? icon('fa-check') : h('b', { text: l.no })),
        h('div', { class: 'im-lesson__body' },
          h('div', { class: 'im-lesson__top' },
            h('span', { class: 'im-lesson__ic' }, icon(l.icon)),
            h('div', {}, h('small', { text: `บทที่ ${l.no} · ${LEVEL[l.level]}` }), h('h3', { text: l.title }))),
          h('p', { text: l.story }),
          h('div', { class: 'im-chips' }, l.learn.map(x => h('span', { text: x }))),
          h('div', { class: 'im-lesson__foot' },
            h('div', { class: 'im-meter', title: `ภารกิจ ${s.count}/${l.tasks.length}` },
              h('span', {}, h('i', { style: `width:${pct}%` })),
              h('small', { text: s.done ? 'ผ่านแล้ว' : `ภารกิจ ${s.count}/${l.tasks.length}` })),
            h('a', { class: 'im-btn' + (state === 'next' ? ' im-btn--main' : ''), href: 'iot-lab.html?lesson=' + l.id, 'data-lesson': l.id }, btnText)))));
    });
    // การ์ดโหมดอิสระ ปิดท้ายเส้นทาง
    list.append(h('li', { class: 'im-lesson im-lesson--free glass', style: '--c:#94a3b8' },
      h('div', { class: 'im-lesson__no', 'aria-hidden': 'true' }, icon('fa-flask')),
      h('div', { class: 'im-lesson__body' },
        h('div', { class: 'im-lesson__top' }, h('span', { class: 'im-lesson__ic' }, icon('fa-flask')), h('div', {}, h('small', { text: 'ไม่มีภารกิจ' }), h('h3', { text: 'ทดลองอิสระ' }))),
        h('p', { text: 'ใช้ชิ้นส่วนทั้ง 19 ชนิดออกแบบระบบของตัวเอง เช่น ตู้ปลาอัจฉริยะ หรือกริ่งหน้าบ้านที่แจ้งเตือนมือถือ งานบันทึกให้อัตโนมัติ' }),
        h('div', { class: 'im-lesson__foot' }, h('span'), h('a', { class: 'im-btn', href: 'iot-lab.html?lesson=free' }, 'เปิดโต๊ะทดลอง')))));

    const done = st.filter(s => s.done).length;
    const next = L[nextIdx];
    const btn = $('continueBtn');
    btn.href = next ? 'iot-lab.html?lesson=' + next.id : 'iot-lab.html?lesson=free';
    btn.querySelector('span').textContent = !next ? 'เปิดโต๊ะทดลองอิสระ' : st[nextIdx].started ? `ทำบทที่ ${next.no} ต่อ` : done ? `เริ่มบทที่ ${next.no}` : 'เริ่มบทที่ 1';
    const badges = prog ? ['iot_first', 'iot_cloud', 'iot_master'].filter(b => prog.badges && prog.badges[b]).length : 0;
    const stats = $('imStats');
    stats.innerHTML = '';
    stats.append(
      h('div', {}, h('b', { text: `${done}/${L.length}` }), h('span', { text: 'บทที่ผ่าน' })),
      h('div', {}, h('b', { text: String(st.reduce((a, s) => a + s.count, 0)) }), h('span', { text: 'ภารกิจที่ทำได้' })),
      h('div', {}, h('b', { text: `${badges}/3` }), h('span', { text: 'เหรียญ IoT' })));
  }

  function renderParts() {
    const box = $('partList');
    IoTSim.GROUPS.forEach(g => {
      const items = IoTSim.ORDER.filter(t => IoTSim.groupOf(t) === g.id);
      box.append(h('h3', { class: 'im-parts__h', text: g.th }),
        h('div', { class: 'im-parts' }, items.map(t => {
          const s = P[t];
          const tag = s.kind === 'sensor' ? (s.signal === 'analog' ? 'อนาล็อก · ขา A' : 'ดิจิทัล · ขา D') : s.kind === 'actuator' ? 'Output · ขา D' : s.kind === 'board' ? (s.wifi ? 'มี Wi-Fi' : 'ไม่มี Wi-Fi') : 'ผ่าน Cloud';
          return h('a', { class: 'im-part', href: 'iot-lab.html?lesson=free&add=' + t, style: `--c:${s.color}` },
            h('span', { class: 'im-part__ic' }, icon((s.icon === 'fa-raspberry-pi' ? 'fa-brands ' : '') + s.icon)),
            h('span', { class: 'im-part__tx' }, h('b', { text: s.label }), h('small', { text: s.th }), h('em', { text: tag })),
            h('span', { class: 'im-part__desc', text: s.desc }));
        })));
    });
  }

  renderParts();
  window.iotMenuReady = load();
})();
