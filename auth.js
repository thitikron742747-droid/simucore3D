/* ==========================================================================
   หน้าเข้าสู่ระบบ / สมัครสมาชิก
   ภาพด้านซ้ายเล่นขั้นตอนการเชื่อมต่อจริงระหว่างที่รอระบบ:
   - เข้าสู่ระบบ  = TCP 3-way handshake (SYN → SYN+ACK → ACK)
   - สมัครสมาชิก = DHCP (DISCOVER → OFFER → REQUEST → ACK) ระบบ "จัดสรรบัญชี" ให้คุณ
   ========================================================================== */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const next = (() => {
    const n = params.get('next') || 'index.html';
    return /^[a-z0-9_-]+\.html(\?[^#]*)?$/i.test(n) ? n : 'index.html';   // กันการพาไปเว็บอื่น
  })();

  // เข้าสู่ระบบอยู่แล้ว → ไปหน้าที่ต้องการเลย
  if (Store.session() && !params.has('logout')) { location.replace(next); return; }

  const FLOWS = {
    login: {
      title: ['เข้าห้องแล็บ', 'เครือข่ายของคุณ'],
      text: 'ทุกครั้งที่กดเข้าสู่ระบบ เครื่องของคุณกับระบบจะคุยกันแบบ TCP 3-way handshake ดูด้านล่างได้เลยว่าแพ็กเก็ตไหนวิ่งไปทางไหน',
      lanes: [
        { dir: 'r', tag: 'SYN', text: 'ขอเชื่อมต่อ', c: 'var(--signal)' },
        { dir: 'l', tag: 'SYN+ACK', text: 'ตอบรับ ตรวจรหัสผ่านแล้ว', c: 'var(--signal)' },
        { dir: 'r', tag: 'ACK', text: 'ยืนยัน เริ่มใช้งาน', c: 'var(--link)' }
      ],
      fail: { at: 1, tag: 'RST', text: 'ปฏิเสธการเชื่อมต่อ' }
    },
    register: {
      title: ['สมัครแล้ว', 'ระบบจะจัดสรร', 'บัญชีให้คุณ'],
      text: 'การสมัครเหมือนเครื่องใหม่ขอ IP จาก DHCP Server: ถามหา → เสนอ → ขอ → ยืนยัน แล้วบัญชีของคุณก็พร้อมใช้',
      lanes: [
        { dir: 'r', tag: 'DISCOVER', text: 'ส่งข้อมูลสมัคร', c: 'var(--amber)' },
        { dir: 'l', tag: 'OFFER', text: 'ชื่อผู้ใช้ว่าง ใช้ได้', c: 'var(--amber)' },
        { dir: 'r', tag: 'REQUEST', text: 'ขอสร้างบัญชี', c: 'var(--amber)' },
        { dir: 'l', tag: 'ACK', text: 'สร้างบัญชีแล้ว', c: 'var(--link)' }
      ],
      fail: { at: 1, tag: 'NAK', text: 'สมัครไม่ได้' }
    }
  };

  // หัวข้อภาษาไทย: ให้ตัดบรรทัดได้เฉพาะระหว่างวลี ไม่ตัดกลางคำ
  function setPhrases(el, phrases) {
    el.textContent = '';
    phrases.forEach((p, i) => {
      if (i) el.append(document.createElement('wbr'));
      const s = document.createElement('span');
      s.className = 'nw';
      s.textContent = p;
      el.append(s);
    });
  }

  let flow = 'login';
  const hs = $('handshake');

  function drawLanes() {
    const f = FLOWS[flow];
    setPhrases($('storyTitle'), f.title);
    $('storyText').textContent = f.text;
    const ol = $('hsLanes');
    ol.innerHTML = '';
    f.lanes.forEach(l => {
      const li = document.createElement('li');
      li.className = 'hs__lane';
      li.dataset.dir = l.dir;
      li.style.setProperty('--c', l.c);
      li.innerHTML = '<div class="hs__track"><span class="hs__pkt"></span></div><div class="hs__label"><b></b><span></span></div>';
      li.querySelector('.hs__label b').textContent = l.tag;
      li.querySelector('.hs__label span').textContent = l.text;
      ol.append(li);
    });
    hs.className = 'hs glass';
    $('hsStatus').textContent = 'รอการเชื่อมต่อ';
  }

  const laneDur = UI.reduced ? 0 : 420;
  async function playLane(i) {
    const li = $('hsLanes').children[i];
    if (!li) return;
    li.style.setProperty('--d', laneDur + 'ms');
    li.classList.add('is-run');
    await UI.wait(laneDur);
    li.classList.remove('is-run');
    li.classList.add('is-done');
  }
  function failLane(i, f) {
    const li = $('hsLanes').children[i];
    if (!li) return;
    li.classList.remove('is-run', 'is-done');
    li.classList.add('is-fail');
    li.querySelector('.hs__label b').textContent = f.tag;
    li.querySelector('.hs__label span').textContent = f.text;
  }

  // เล่นแอนิเมชันไปพร้อมกับรอเซิร์ฟเวอร์ ถ้าล้มเหลวจะหยุดที่ขั้นที่ 2 พร้อมแพ็กเก็ตสีแดง
  async function connect(task, busyText, okText) {
    drawLanes();
    const f = FLOWS[flow];
    hs.classList.add('is-busy');
    $('hsStatus').textContent = busyText;
    await playLane(0);
    let result, error;
    try { result = await task(); } catch (e) { error = e; }
    if (error) {
      failLane(f.fail.at, f.fail);
      hs.className = 'hs glass is-fail';
      $('hsStatus').textContent = error.message;
      throw error;
    }
    for (let i = 1; i < f.lanes.length; i++) await playLane(i);
    hs.className = 'hs glass is-ok';
    $('hsStatus').textContent = okText;
    return result;
  }

  /* ------------------------------- สลับแท็บ ------------------------------- */
  function show(which) {
    flow = which;
    const login = which === 'login';
    $('tabLogin').setAttribute('aria-selected', String(login));
    $('tabRegister').setAttribute('aria-selected', String(!login));
    $('loginForm').hidden = !login;
    $('registerForm').hidden = login;
    clearErrors();
    drawLanes();
    (login ? $('loginUser') : $('regName')).focus();
  }
  $('tabLogin').onclick = () => show('login');
  $('tabRegister').onclick = () => show('register');
  [$('tabLogin'), $('tabRegister')].forEach(t => t.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') show(flow === 'login' ? 'register' : 'login');
  }));

  /* ---------------------------- ช่วยแสดงข้อผิดพลาด ---------------------------- */
  function clearErrors() {
    document.querySelectorAll('.field.is-error').forEach(f => f.classList.remove('is-error'));
    document.querySelectorAll('.field__error').forEach(e => { e.textContent = ''; });
    ['loginError', 'registerError'].forEach(id => { $(id).classList.remove('is-on'); $(id).textContent = ''; });
  }
  function fieldError(name, msg) {
    const f = document.querySelector(`#registerForm [data-field="${name}"]`);
    if (!f) return false;
    f.classList.add('is-error');
    f.querySelector('.field__error').textContent = msg;
    const input = f.querySelector('input');
    if (input) input.focus();
    return true;
  }
  function formError(id, msg) {
    const box = $(id);
    box.classList.remove('is-on');
    void box.offsetWidth;
    box.textContent = msg;
    box.classList.add('is-on');
  }
  function busy(btn, on, text) {
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = text; } else if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }

  async function go(user) {
    await UI.wait(UI.reduced ? 0 : 350);
    UI.loader.show(`สวัสดี ${user.fullName}`, ['เปิดห้องแล็บ'], Store.ROLES[user.role] || '');
    setTimeout(() => location.replace(next), UI.reduced ? 0 : 300);
  }

  /* -------------------------------- เข้าสู่ระบบ -------------------------------- */
  $('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors();
    const username = $('loginUser').value.trim(), password = $('loginPass').value;
    if (!username || !password) { formError('loginError', 'กรอกชื่อผู้ใช้และรหัสผ่าน'); (username ? $('loginPass') : $('loginUser')).focus(); return; }
    busy($('loginBtn'), true, 'กำลังเชื่อมต่อ…');
    try {
      const user = await connect(() => Store.auth.login({ username, password, remember: $('loginRemember').checked }), 'กำลังตรวจสอบบัญชี…', 'เชื่อมต่อสำเร็จ');
      await go(user);
    } catch (err) {
      formError('loginError', err.message);
      $('loginPass').select();
      busy($('loginBtn'), false);
    }
  });

  $('guestBtn').addEventListener('click', async () => {
    busy($('guestBtn'), true, 'กำลังเข้าใช้…');
    const user = await connect(() => Store.auth.guest(), 'เข้าใช้แบบผู้เยี่ยมชม…', 'เข้าใช้แบบผู้เยี่ยมชมแล้ว');
    UI.toast('โหมดผู้เยี่ยมชม: งานจะเก็บไว้ในเบราว์เซอร์นี้เท่านั้น', 'warn');
    await go(user);
  });

  $('forgotLink').addEventListener('click', e => {
    e.preventDefault();
    UI.confirm({
      title: 'ลืมรหัสผ่าน',
      message: Store.config.mode === 'api'
        ? 'ติดต่อครูหรือผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน'
        : 'ตอนนี้ระบบเก็บบัญชีไว้ในเบราว์เซอร์เครื่องนี้ จึงรีเซ็ตรหัสผ่านไม่ได้ สมัครบัญชีใหม่ได้เลย (งานในบัญชีเดิมยังอยู่)',
      confirmText: 'สมัครบัญชีใหม่', cancelText: 'ปิด'
    }).then(ok => { if (ok) show('register'); });
  });

  /* ------------------------------- สมัครสมาชิก ------------------------------- */
  function strength(pw) {
    let s = 0;
    if (pw.length >= 8) s++;
    if (/[0-9]/.test(pw) && /[a-zA-Zก-๙]/.test(pw)) s++;
    if (/[A-Z]/.test(pw) || /[^a-zA-Z0-9]/.test(pw)) s++;
    if (pw.length >= 12) s++;
    return pw ? Math.max(1, s) : 0;
  }
  const HINTS = ['อย่างน้อย 8 ตัว ผสมตัวเลขและตัวอักษร', 'อ่อนมาก — สั้นหรือเดาง่าย', 'พอใช้ — ลองเพิ่มตัวพิมพ์ใหญ่หรือสัญลักษณ์', 'ดี', 'แข็งแรงมาก'];
  $('regPass').addEventListener('input', () => {
    const lv = strength($('regPass').value);
    $('pwStrength').dataset.level = lv;
    $('pwHint').textContent = HINTS[lv];
  });
  document.querySelectorAll('input[name="role"]').forEach(r => r.addEventListener('change', () => {
    $('studentIdField').hidden = document.querySelector('input[name="role"]:checked').value !== 'student';
  }));
  $('regUser').addEventListener('input', () => {
    const v = $('regUser').value;
    const clean = v.toLowerCase().replace(/\s+/g, '');
    if (clean !== v) $('regUser').value = clean;
  });

  $('registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    clearErrors();
    const form = {
      fullName: $('regName').value.trim(),
      username: $('regUser').value.trim(),
      role: document.querySelector('input[name="role"]:checked').value,
      classroom: $('regClass').value.trim(),
      studentId: $('regSid').value.trim(),
      password: $('regPass').value
    };
    if (form.role !== 'student') form.studentId = '';
    if (form.fullName.length < 2) return fieldError('fullName', 'กรอกชื่อ-นามสกุล');
    if (!/^[a-z0-9._-]{4,30}$/.test(form.username)) return fieldError('username', 'ใช้ a-z 0-9 . _ - ได้ 4–30 ตัว');
    if (form.password.length < 8) return fieldError('password', 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัว');
    if (form.password !== $('regPass2').value) return fieldError('confirm', 'รหัสผ่านทั้งสองช่องไม่ตรงกัน');
    busy($('registerBtn'), true, 'กำลังสร้างบัญชี…');
    try {
      const user = await connect(() => Store.auth.register(form), 'กำลังสร้างบัญชี…', 'สร้างบัญชีแล้ว');
      UI.toast(`สร้างบัญชี ${user.username} แล้ว`, 'ok');
      await go(user);
    } catch (err) {
      if (!err.field || !fieldError(err.field, err.message)) formError('registerError', err.message);
      busy($('registerBtn'), false);
    }
  });

  /* ------------------------------ ตัวช่วยอื่น ๆ ------------------------------ */
  document.querySelectorAll('.pw-toggle').forEach(btn => btn.addEventListener('click', () => {
    const input = btn.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน');
    btn.firstElementChild.className = 'fa-solid ' + (show ? 'fa-eye-slash' : 'fa-eye');
  }));

  if (!Store.config.allowGuest) { $('guestBtn').hidden = true; $('guestDivider').hidden = true; }
  $('modeNote').textContent = Store.config.mode === 'api'
    ? 'บัญชีและงานของคุณเก็บไว้บนเซิร์ฟเวอร์ของโรงเรียน'
    : 'ตอนนี้บัญชีและงานเก็บไว้ในเบราว์เซอร์เครื่องนี้ เมื่อเชื่อมฐานข้อมูลแล้วจะใช้ได้ทุกเครื่อง';
  if (params.has('logout')) UI.toast('ออกจากระบบแล้ว', 'ok');
  show(params.get('tab') === 'register' ? 'register' : 'login');
})();
