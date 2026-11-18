/* ==========================================================================
   SimuCore Store — ชั้นข้อมูลกลาง (Data Layer)
   --------------------------------------------------------------------------
   ทุกหน้าเรียกข้อมูลผ่าน Store เท่านั้น และทุกเมธอดคืน Promise
   จึงสลับจาก "เก็บในเบราว์เซอร์" ไปเป็น "ฐานข้อมูลจริง" ได้โดยแก้แค่ config.js

     Store.auth.register / login / guest / logout / session / updateProfile / changePassword
     Store.projects.list / create / remove
     Store.workspaces.load / save
     Store.reports.list / add / clear
     Store.progress.get / award / leaderboard      (XP เลเวล เหรียญรางวัล)
     Store.teacher.overview                         (หน้าครู: ความคืบหน้าทั้งห้อง)

   LocalAdapter : เก็บใน localStorage แยกตามผู้ใช้ (รหัสผ่านเก็บเป็นค่าแฮช SHA-256 + salt)
                  ⚠ ใช้สำหรับสาธิต/ใช้ในเครื่องเดียว ความปลอดภัยจริงต้องทำที่เซิร์ฟเวอร์
   ApiAdapter   : เรียก REST API ตาม docs/API.md (ส่ง Token ใน Header Authorization)
   ========================================================================== */
(function () {
  'use strict';

  const CFG = Object.assign({ mode: 'local', apiBase: '/api', allowGuest: true }, window.SIMUCORE_CONFIG);
  const SESSION_KEY = 'simucore-session-v1';
  const USERS_KEY = 'simucore-users-v1';

  class StoreError extends Error {
    constructor(code, message, field) { super(message); this.code = code; this.field = field; }
  }

  /* ----------------------------- เก็บข้อมูลเบราว์เซอร์ ---------------------------- */
  const ls = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { throw new StoreError('storage', 'พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็มหรือถูกปิดไว้'); }
    },
    remove(key) { try { localStorage.removeItem(key); } catch (e) { /* ข้าม */ } }
  };

  /* ------------------------------- SHA-256 -------------------------------- */
  // ใช้ Web Crypto ถ้ามี (https / localhost / file) ไม่งั้นใช้ตัวคำนวณสำรองด้านล่าง
  function sha256Fallback(bytes) {
    const K = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
    const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    const len = bytes.length, bitLen = len * 8;
    const padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
    padded.set(bytes); padded[len] = 0x80;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 4, bitLen >>> 0); dv.setUint32(padded.length - 8, Math.floor(bitLen / 2 ** 32));
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    const out = new Uint8Array(32);
    H.forEach((v, i) => new DataView(out.buffer).setUint32(i * 4, v));
    return out;
  }
  async function sha256(bytes) {
    if (window.crypto && window.crypto.subtle) {
      try { return new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes)); } catch (e) { /* ใช้ตัวสำรอง */ }
    }
    return sha256Fallback(bytes);
  }
  const toHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  async function hashPassword(password, salt) {
    let data = new TextEncoder().encode(`${salt}:${password}`);
    for (let i = 0; i < 1200; i++) data = await sha256(data);   // วนซ้ำให้เดายากขึ้น
    return toHex(data);
  }
  function randomId(n) {
    const a = new Uint8Array(n || 16);
    if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(a);
    else for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
    return toHex(a);
  }

  /* ------------------------------- ตรวจข้อมูล ------------------------------- */
  const ROLES = { student: 'นักเรียน', teacher: 'ครู', guest: 'ผู้เยี่ยมชม' };
  function validateRegister(f) {
    const username = String(f.username || '').trim().toLowerCase();
    const fullName = String(f.fullName || '').trim();
    if (fullName.length < 2) throw new StoreError('invalid', 'กรอกชื่อ-นามสกุลอย่างน้อย 2 ตัวอักษร', 'fullName');
    if (!/^[a-z0-9._-]{4,30}$/.test(username)) throw new StoreError('invalid', 'ชื่อผู้ใช้ใช้ a-z 0-9 . _ - ได้ 4–30 ตัว', 'username');
    if (String(f.password || '').length < 8) throw new StoreError('invalid', 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร', 'password');
    if (!ROLES[f.role] || f.role === 'guest') throw new StoreError('invalid', 'เลือกบทบาทนักเรียนหรือครู', 'role');
    return {
      username, fullName, role: f.role,
      classroom: String(f.classroom || '').trim().slice(0, 40),
      studentId: String(f.studentId || '').trim().slice(0, 20)
    };
  }
  const publicUser = u => ({ id: u.id, username: u.username, fullName: u.fullName, role: u.role, classroom: u.classroom || '', studentId: u.studentId || '', createdAt: u.createdAt });

  /* -------------------------- เลเวลและเหรียญรางวัล -------------------------- */
  const LEVELS = [
    [0, 'มือใหม่หัดต่อสาย'], [100, 'ช่างเครือข่ายฝึกหัด'], [250, 'ผู้ช่วยแอดมิน'], [450, 'แอดมินเครือข่าย'],
    [700, 'ผู้เชี่ยวชาญ Routing'], [1000, 'วิศวกรเครือข่าย'], [1400, 'สถาปนิกเครือข่าย'], [1900, 'ผู้พิทักษ์ระบบ'],
    [2500, 'ปรมาจารย์ Packet'], [3200, 'ตำนาน SimuCore']
  ];
  const BADGES = {
    first_link: { icon: 'fa-plug', name: 'สายแรก', desc: 'ต่อสายสัญญาณเส้นแรกได้สำเร็จ', color: '#22d3ee' },
    first_ping: { icon: 'fa-satellite-dish', name: 'Ping ติด', desc: 'รันระบบแล้วผ่านทุกเส้นทาง', color: '#34d399' },
    lab_clear: { icon: 'fa-flag-checkered', name: 'ภารกิจแรก', desc: 'ทำภารกิจครบ 100% ครั้งแรก', color: '#fbbf24' },
    all_labs: { icon: 'fa-crown', name: 'ครบทุกบท', desc: 'ทำภารกิจครบทุกบทเรียน', color: '#f59e0b' },
    no_hint: { icon: 'fa-brain', name: 'ไม่ต้องใบ้', desc: 'ผ่านภารกิจโดยไม่เปิดคำใบ้เลย', color: '#a855f7' },
    speedrun: { icon: 'fa-bolt', name: 'สายฟ้า', desc: 'ผ่านภารกิจภายใน 5 นาที', color: '#facc15' },
    pov: { icon: 'fa-video', name: 'กล้องติดแพ็กเก็ต', desc: 'ตามแพ็กเก็ตไปจนถึงปลายทาง', color: '#38bdf8' },
    doctor: { icon: 'fa-stethoscope', name: 'หมอเครือข่าย', desc: 'ใช้ "ทำไมไม่ติด?" หาสาเหตุแล้วแก้จนติด', color: '#fb7185' },
    detective: { icon: 'fa-user-secret', name: 'นักสืบเครือข่าย', desc: 'ไขคดีเครือข่ายเสียได้สำเร็จ', color: '#818cf8' },
    sherlock: { icon: 'fa-magnifying-glass', name: 'เชอร์ล็อก', desc: 'ไขคดีระดับยากโดยไม่ใช้คำใบ้', color: '#c084fc' },
    crimper: { icon: 'fa-ethernet', name: 'ช่างเข้าหัวสาย', desc: 'เข้าหัวสายตรง (Straight) ผ่านเครื่องทดสอบ', color: '#fb923c' },
    cross_crimper: { icon: 'fa-shuffle', name: 'สายไขว้มือโปร', desc: 'เข้าหัวสายไขว้ (Crossover) ผ่านเครื่องทดสอบ', color: '#f472b6' },
    defender: { icon: 'fa-shield-halved', name: 'ผู้พิทักษ์', desc: 'หยุดการโจมตี DDoS จนเว็บกลับมาใช้ได้', color: '#60a5fa' },
    stp: { icon: 'fa-tornado', name: 'ปราบพายุ', desc: 'หยุด Broadcast Storm ด้วย Spanning Tree', color: '#2dd4bf' },
    time_traveler: { icon: 'fa-clock-rotate-left', name: 'ย้อนเวลา', desc: 'ใช้ไทม์ไลน์ย้อนดูการจำลอง', color: '#94a3b8' },
    wifi_master: { icon: 'fa-wifi', name: 'Wi-Fi ทั่วบ้าน', desc: 'แก้ห้องที่เน็ตไม่ถึงจนต่อ Wi-Fi ได้', color: '#2dd4bf' },
    home_hero: { icon: 'fa-house-circle-check', name: 'ช่างเน็ตประจำบ้าน', desc: 'แก้ปัญหาเน็ตบ้านสำเร็จ 5 เรื่อง', color: '#f472b6' },
    speed_guru: { icon: 'fa-gauge-high', name: 'เกมไม่แลค', desc: 'ใช้ QoS ให้เกมลื่นแม้มีคนโหลดไฟล์', color: '#facc15' },
    safe_surfer: { icon: 'fa-user-shield', name: 'ท่องเน็ตปลอดภัย', desc: 'เห็นความต่างของ HTTP/HTTPS และใช้ Wi-Fi แขก', color: '#22c55e' },
    iot_first: { icon: 'fa-microchip', name: 'นักประดิษฐ์ IoT', desc: 'ทำบทเรียนห้องเรียน IoT ผ่านครบเป็นบทแรก', color: '#f59e0b' },
    iot_cloud: { icon: 'fa-cloud-arrow-up', name: 'ขึ้นคลาวด์', desc: 'ส่งการแจ้งเตือนจากบอร์ด IoT ถึงมือถือได้สำเร็จ', color: '#818cf8' },
    iot_master: { icon: 'fa-house-signal', name: 'ปรมาจารย์ IoT', desc: 'ทำบทเรียน IoT ครบทุกบท', color: '#fb923c' }
  };
  function levelOf(xp) {
    let i = 0;
    while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
    const cur = LEVELS[i][0], next = LEVELS[i + 1] ? LEVELS[i + 1][0] : null;
    return { level: i + 1, title: LEVELS[i][1], xp, floor: cur, next, pct: next ? Math.round((xp - cur) * 100 / (next - cur)) : 100 };
  }
  const emptyProgress = () => ({ xp: 0, badges: {}, once: [], log: [], updatedAt: null });
  // รวมผลการให้ XP: once = ให้ครั้งเดียว (กันกดซ้ำเก็บแต้ม), badges = เหรียญที่ได้
  function applyAward(p, a) {
    p = Object.assign(emptyProgress(), p);
    const before = levelOf(p.xp).level;
    let xp = 0;
    if (!a.once || !p.once.includes(a.once)) {
      xp = Math.max(0, Math.round(Number(a.xp) || 0));
      if (a.once) p.once.push(a.once);
    }
    const newBadges = (a.badges || []).filter(b => BADGES[b] && !p.badges[b]);
    newBadges.forEach(b => { p.badges[b] = new Date().toISOString(); });
    p.xp += xp;
    if (xp || newBadges.length) p.log = [{ xp, reason: String(a.reason || '').slice(0, 80), badges: newBadges, at: new Date().toISOString() }].concat(p.log).slice(0, 40);
    p.updatedAt = new Date().toISOString();
    return { progress: p, gained: xp, newBadges, levelUp: levelOf(p.xp).level > before ? levelOf(p.xp) : null };
  }

  /* ------------------------------ เซสชัน ------------------------------ */
  function readSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function writeSession(s, remember) {
    clearSession();
    try { (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* ข้าม */ }
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) { /* ข้าม */ }
  }
  const uid = () => { const s = readSession(); if (!s) throw new StoreError('auth', 'กรุณาเข้าสู่ระบบก่อน'); return s.user.id; };
  const ukey = name => `simucore-u${uid()}-${name}`;

  /* ============================ LocalAdapter ============================ */
  const LocalAdapter = {
    async register(form) {
      const data = validateRegister(form);
      const users = ls.get(USERS_KEY, []);
      if (users.some(u => u.username === data.username)) throw new StoreError('taken', 'ชื่อผู้ใช้นี้มีคนใช้แล้ว ลองชื่ออื่น', 'username');
      const salt = randomId(16);
      const user = Object.assign({ id: 'L' + Date.now().toString(36) + randomId(2), createdAt: new Date().toISOString(), salt, hash: await hashPassword(form.password, salt) }, data);
      users.push(user);
      ls.set(USERS_KEY, users);
      return this._start(user, false, true);
    },
    async login({ username, password, remember }) {
      const name = String(username || '').trim().toLowerCase();
      const user = ls.get(USERS_KEY, []).find(u => u.username === name);
      if (!user || user.hash !== await hashPassword(String(password || ''), user.salt)) {
        throw new StoreError('credentials', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
      }
      return this._start(user, !!remember, false);
    },
    async guest() {
      return this._start({ id: 'guest', username: 'guest', fullName: 'ผู้เยี่ยมชม', role: 'guest', createdAt: new Date().toISOString() }, false, false);
    },
    _start(user, remember, isNew) {
      const pub = publicUser(user);
      writeSession({ token: 'local-' + randomId(12), user: pub, mode: 'local', at: Date.now() }, remember);
      if (isNew || user.role !== 'guest') this._claimLegacy(pub.id);
      return pub;
    },
    // ย้ายงานที่สร้างไว้ก่อนมีระบบสมาชิก ให้เป็นของผู้ใช้คนแรกที่เข้าสู่ระบบ
    _claimLegacy(id) {
      if (id === 'guest' || ls.get('simucore-legacy-claimed', false)) return;
      const projects = ls.get('simucore-it-projects-v1', null), reports = ls.get('simucore-it-reports-v1', null);
      if (!projects && !reports) { ls.set('simucore-legacy-claimed', true); return; }
      const pk = `simucore-u${id}-projects`, rk = `simucore-u${id}-reports`;
      if (projects && !ls.get(pk, []).length) ls.set(pk, projects);
      if (reports && !ls.get(rk, []).length) ls.set(rk, reports);
      ls.set('simucore-legacy-claimed', id);
    },
    async logout() { clearSession(); },
    async updateProfile(patch) {
      const s = readSession();
      if (!s || s.user.role === 'guest') throw new StoreError('auth', 'ผู้เยี่ยมชมแก้ไขข้อมูลบัญชีไม่ได้ สมัครสมาชิกก่อน');
      const users = ls.get(USERS_KEY, []);
      const u = users.find(x => x.id === s.user.id);
      if (!u) throw new StoreError('auth', 'ไม่พบบัญชีนี้แล้ว กรุณาเข้าสู่ระบบใหม่');
      const fullName = String(patch.fullName ?? u.fullName).trim();
      if (fullName.length < 2) throw new StoreError('invalid', 'กรอกชื่อ-นามสกุลอย่างน้อย 2 ตัวอักษร', 'fullName');
      Object.assign(u, { fullName, classroom: String(patch.classroom ?? u.classroom).trim().slice(0, 40), studentId: String(patch.studentId ?? u.studentId).trim().slice(0, 20) });
      ls.set(USERS_KEY, users);
      s.user = publicUser(u);
      writeSession(s, !!localStorage.getItem(SESSION_KEY));
      return s.user;
    },
    async changePassword(oldPw, newPw) {
      const s = readSession();
      const users = ls.get(USERS_KEY, []);
      const u = s && users.find(x => x.id === s.user.id);
      if (!u) throw new StoreError('auth', 'ผู้เยี่ยมชมเปลี่ยนรหัสผ่านไม่ได้');
      if (u.hash !== await hashPassword(String(oldPw || ''), u.salt)) throw new StoreError('credentials', 'รหัสผ่านเดิมไม่ถูกต้อง', 'oldPassword');
      if (String(newPw || '').length < 8) throw new StoreError('invalid', 'รหัสผ่านใหม่ต้องยาวอย่างน้อย 8 ตัวอักษร', 'newPassword');
      u.salt = randomId(16);
      u.hash = await hashPassword(newPw, u.salt);
      ls.set(USERS_KEY, users);
      return true;
    },
    async listProjects() { return ls.get(ukey('projects'), []); },
    async createProject(p) {
      const list = ls.get(ukey('projects'), []);
      const project = Object.assign({ id: Date.now(), createdAt: new Date().toLocaleDateString('th-TH') }, p);
      list.unshift(project);
      ls.set(ukey('projects'), list);
      return project;
    },
    async removeProject(id) {
      ls.set(ukey('projects'), ls.get(ukey('projects'), []).filter(p => String(p.id) !== String(id)));
      ls.remove(ukey('ws-' + id));
      ls.remove('simucore-workspace-' + id);
      return true;
    },
    async loadWorkspace(key) {
      return ls.get(ukey('ws-' + key), null) || ls.get('simucore-workspace-' + key, null);
    },
    async saveWorkspace(key, data) { ls.set(ukey('ws-' + key), data); return true; },
    async listReports() { return ls.get(ukey('reports'), []); },
    async addReport(r) {
      const list = ls.get(ukey('reports'), []);
      list.unshift(r);
      ls.set(ukey('reports'), list.slice(0, 50));
      return r;
    },
    async clearReports() { ls.remove(ukey('reports')); return true; },
    async getProgress() { return Object.assign(emptyProgress(), ls.get(ukey('progress'), {})); },
    async award(a) {
      const r = applyAward(ls.get(ukey('progress'), {}), a);
      ls.set(ukey('progress'), r.progress);
      return r;
    },
    // ข้อมูลของนักเรียนทุกคนที่ลงทะเบียนในเบราว์เซอร์นี้ (โหมดสาธิต: ครูกับนักเรียนใช้เครื่องเดียวกัน)
    _students(classroom) {
      return ls.get(USERS_KEY, []).filter(u => u.role === 'student' && (!classroom || (u.classroom || '') === classroom)).map(u => {
        const progress = Object.assign(emptyProgress(), ls.get(`simucore-u${u.id}-progress`, {}));
        return { user: publicUser(u), progress, reports: ls.get(`simucore-u${u.id}-reports`, []) };
      });
    },
    async leaderboard(classroom) {
      return this._students(classroom).map(s => ({ user: s.user, xp: s.progress.xp, badges: Object.keys(s.progress.badges).length }))
        .sort((a, b) => b.xp - a.xp).slice(0, 20);
    },
    async teacherOverview(classroom) {
      const s = readSession();
      if (!s || s.user.role !== 'teacher') throw new StoreError('forbidden', 'หน้านี้สำหรับบัญชีครูเท่านั้น');
      const all = ls.get(USERS_KEY, []);
      return {
        classrooms: [...new Set(all.filter(u => u.role === 'student').map(u => u.classroom || ''))].sort(),
        students: this._students(classroom)
      };
    }
  };

  /* ============================= ApiAdapter ============================= */
  async function api(method, path, body) {
    const s = readSession();
    let res;
    try {
      res = await fetch(CFG.apiBase.replace(/\/$/, '') + path, {
        method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, s && s.token ? { Authorization: 'Bearer ' + s.token } : {}),
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (e) {
      throw new StoreError('network', 'ติดต่อเซิร์ฟเวอร์ไม่ได้ ตรวจการเชื่อมต่ออินเทอร์เน็ต');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* ไม่มีเนื้อหา */ }
    if (res.status === 401) { clearSession(); throw new StoreError('auth', (data && data.message) || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'); }
    if (!res.ok) throw new StoreError((data && data.code) || 'server', (data && data.message) || `เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`, data && data.field);
    return data;
  }
  const ApiAdapter = {
    async register(form) {
      validateRegister(form);
      const r = await api('POST', '/auth/register', form);
      writeSession({ token: r.token, user: r.user, mode: 'api', at: Date.now() }, false);
      return r.user;
    },
    async login(form) {
      const r = await api('POST', '/auth/login', form);
      writeSession({ token: r.token, user: r.user, mode: 'api', at: Date.now() }, !!form.remember);
      return r.user;
    },
    async guest() { return LocalAdapter.guest(); },
    async logout() { try { await api('POST', '/auth/logout'); } finally { clearSession(); } },
    async updateProfile(p) {
      const r = await api('PATCH', '/me', p);
      const s = readSession(); s.user = r.user; writeSession(s, !!localStorage.getItem(SESSION_KEY));
      return r.user;
    },
    async changePassword(oldPassword, newPassword) { await api('POST', '/me/password', { oldPassword, newPassword }); return true; },
    async listProjects() { return (await api('GET', '/projects')).projects; },
    async createProject(p) { return (await api('POST', '/projects', p)).project; },
    async removeProject(id) { await api('DELETE', '/projects/' + encodeURIComponent(id)); return true; },
    async loadWorkspace(key) { try { return (await api('GET', '/workspaces/' + encodeURIComponent(key))).data; } catch (e) { if (e.code === 'not_found') return null; throw e; } },
    async saveWorkspace(key, data) { await api('PUT', '/workspaces/' + encodeURIComponent(key), { data }); return true; },
    async listReports() { return (await api('GET', '/reports')).reports; },
    async addReport(r) { return (await api('POST', '/reports', r)).report; },
    async clearReports() { await api('DELETE', '/reports'); return true; },
    async getProgress() { return (await api('GET', '/me/progress')).progress; },
    async award(a) { return api('POST', '/me/progress/award', a); },
    async leaderboard(classroom) { return (await api('GET', '/leaderboard' + (classroom ? '?classroom=' + encodeURIComponent(classroom) : ''))).leaderboard; },
    async teacherOverview(classroom) { return api('GET', '/teacher/overview' + (classroom ? '?classroom=' + encodeURIComponent(classroom) : '')); }
  };

  // ผู้เยี่ยมชมเก็บข้อมูลในเบราว์เซอร์เสมอ แม้ระบบจะใช้โหมด API
  const adapter = () => {
    const s = readSession();
    return CFG.mode === 'api' && !(s && s.user && s.user.role === 'guest') ? ApiAdapter : LocalAdapter;
  };
  const base = () => (CFG.mode === 'api' ? ApiAdapter : LocalAdapter);

  window.Store = {
    config: CFG,
    ROLES,
    Error: StoreError,
    session: readSession,
    user: () => { const s = readSession(); return s ? s.user : null; },
    // เรียกที่ต้นหน้า: ถ้ายังไม่ได้เข้าสู่ระบบ ให้ไปหน้า auth.html แล้วกลับมาหน้าเดิม
    requireLogin() {
      if (readSession()) return true;
      const here = location.pathname.split('/').pop() + location.search;
      location.replace('auth.html?next=' + encodeURIComponent(here || 'index.html'));
      return false;
    },
    auth: {
      register: f => base().register(f),
      login: f => base().login(f),
      guest: () => LocalAdapter.guest(),
      logout: () => adapter().logout(),
      updateProfile: p => adapter().updateProfile(p),
      changePassword: (a, b) => adapter().changePassword(a, b)
    },
    projects: {
      list: () => adapter().listProjects(),
      create: p => adapter().createProject(p),
      remove: id => adapter().removeProject(id)
    },
    workspaces: {
      load: key => adapter().loadWorkspace(key),
      save: (key, data) => adapter().saveWorkspace(key, data)
    },
    reports: {
      list: () => adapter().listReports(),
      add: r => adapter().addReport(r),
      clear: () => adapter().clearReports()
    },
    progress: {
      get: () => adapter().getProgress(),
      award: a => adapter().award(a),
      leaderboard: c => adapter().leaderboard(c)
    },
    teacher: { overview: c => adapter().teacherOverview(c) },
    GAME: { LEVELS, BADGES, levelOf, applyAward },
    _hashPassword: hashPassword, _sha256Fallback: sha256Fallback
  };
})();
