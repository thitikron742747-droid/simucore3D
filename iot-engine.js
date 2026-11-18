/* ==========================================================================
   SimuCore IoT Engine — จำลองระบบ IoT (ทดสอบด้วย Node ได้)
   --------------------------------------------------------------------------
   บอร์ดควบคุม (Arduino UNO / ESP32 / Raspberry Pi) อ่านค่าเซนเซอร์ผ่านขา (Pin)
   แล้วสั่งอุปกรณ์ทำงานตาม "กฎ" ถ้า…แล้ว…ไม่งั้น… บอร์ดที่มี Wi-Fi ส่งข้อมูลขึ้น
   IoT Gateway / Cloud ให้แอปบนมือถือดูค่า สั่งงาน และรับการแจ้งเตือนได้
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IoTSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const D_PINS = ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'];
  const A_PINS = ['A0', 'A1', 'A2', 'A3'];
  const PI_D = ['GPIO17', 'GPIO18', 'GPIO22', 'GPIO23', 'GPIO24', 'GPIO25', 'GPIO27'];
  const PI_A = ['ADC0', 'ADC1'];

  /* ------------------------------ ชิ้นส่วน ------------------------------ */
  const PARTS = {
    uno: { short: 'UNO', kind: 'board', label: 'Arduino UNO', th: 'บอร์ดไมโครคอนโทรลเลอร์', icon: 'fa-microchip', color: '#0e7490', wifi: false, lang: 'arduino', pins: { D: D_PINS, A: A_PINS },
      desc: 'บอร์ดยอดนิยมสำหรับเริ่มเรียน อ่านเซนเซอร์และสั่งอุปกรณ์ได้ แต่ไม่มี Wi-Fi จึงส่งข้อมูลขึ้น Cloud ไม่ได้' },
    esp32: { short: 'ESP32', kind: 'board', label: 'ESP32 (Wi-Fi)', th: 'บอร์ด IoT มี Wi-Fi', icon: 'fa-wifi', color: '#1f2937', wifi: true, lang: 'arduino', pins: { D: D_PINS, A: A_PINS },
      desc: 'บอร์ดราคาถูกที่มี Wi-Fi ในตัว เขียนโค้ดแบบ Arduino ได้ ส่งค่าขึ้น Cloud และรับคำสั่งจากมือถือได้' },
    pi: { short: 'RPi', kind: 'board', label: 'Raspberry Pi', th: 'คอมพิวเตอร์บอร์ดเดียว', icon: 'fa-raspberry-pi', color: '#15803d', wifi: true, lang: 'python', pins: { D: PI_D, A: PI_A },
      desc: 'คอมพิวเตอร์ขนาดเล็ก เขียนด้วย Python มี Wi-Fi ใช้ขา GPIO (ค่าอนาล็อกต้องผ่านโมดูล ADC)' },
    gateway: { short: 'Gateway', kind: 'gateway', label: 'IoT Gateway / Cloud', th: 'ศูนย์กลางรับส่งข้อมูล IoT', icon: 'fa-cloud', color: '#6366f1',
      desc: 'รับข้อมูลจากบอร์ดที่ต่อ Wi-Fi แล้วส่งต่อให้แอปบนมือถือ (เหมือน Blynk / Home Assistant)' },
    phone: { short: 'Phone', kind: 'phone', label: 'สมาร์ตโฟน (แอป IoT)', th: 'แดชบอร์ดบนมือถือ', icon: 'fa-mobile-screen', color: '#0f172a',
      desc: 'ดูค่าจากเซนเซอร์ สั่งเปิด-ปิดอุปกรณ์ และรับการแจ้งเตือนผ่าน Cloud' },

    motion: { short: 'Motion', kind: 'sensor', signal: 'digital', env: 'motion', trigger: true, label: 'Motion Sensor (PIR)', th: 'ตรวจจับคนเคลื่อนไหว', icon: 'fa-person-walking', color: '#e5e7eb',
      on: 'มีคนเคลื่อนไหว', off: 'ไม่มีคน', desc: 'จับรังสีอินฟราเรดจากร่างกาย ให้ค่า HIGH เมื่อมีคนเดินผ่าน' },
    smoke: { short: 'Smoke', kind: 'sensor', signal: 'digital', env: 'smoke', label: 'Smoke Sensor (MQ-2)', th: 'ตรวจจับควัน', icon: 'fa-smog', color: '#94a3b8',
      on: 'พบควัน!', off: 'อากาศปกติ', desc: 'ตรวจจับควันและแก๊ส ให้ค่า HIGH เมื่อพบควัน' },
    temp: { short: 'Temp', kind: 'sensor', signal: 'analog', env: 'temp', unit: '°C', min: 0, max: 50, label: 'Temperature (DHT22)', th: 'วัดอุณหภูมิ', icon: 'fa-temperature-half', color: '#f8fafc',
      desc: 'วัดอุณหภูมิเป็นองศาเซลเซียส (ค่าอนาล็อก ต้องต่อขา A)' },
    light: { short: 'Light', kind: 'sensor', signal: 'analog', env: 'light', unit: '%', min: 0, max: 100, label: 'Light Sensor (LDR)', th: 'วัดความสว่าง', icon: 'fa-sun', color: '#fde68a',
      desc: 'ตัวต้านทานไวแสง ยิ่งสว่างค่ายิ่งสูง 0–100%' },
    soil: { short: 'Soil', kind: 'sensor', signal: 'analog', env: 'soil', unit: '%', min: 0, max: 100, label: 'Soil Moisture', th: 'วัดความชื้นในดิน', icon: 'fa-seedling', color: '#a16207',
      desc: 'ปักลงดิน วัดความชื้น 0% (แห้ง) – 100% (เปียก)' },
    button: { short: 'Button', kind: 'sensor', signal: 'digital', trigger: true, label: 'Push Button', th: 'ปุ่มกด', icon: 'fa-circle-dot', color: '#ef4444',
      on: 'กดอยู่', off: 'ปล่อย', desc: 'ให้ค่า HIGH ขณะกดปุ่ม' },
    door: { short: 'Door', kind: 'sensor', signal: 'digital', env: 'door', label: 'Door Sensor (Reed Switch)', th: 'เซนเซอร์ประตู', icon: 'fa-door-open', color: '#f1f5f9',
      on: 'ประตูเปิด', off: 'ประตูปิด', desc: 'แม่เหล็กติดประตู ให้ค่า HIGH เมื่อประตูเปิด' },
    rfid: { short: 'RFID', kind: 'sensor', signal: 'digital', trigger: true, label: 'RFID Reader', th: 'เครื่องอ่านบัตร', icon: 'fa-id-card', color: '#3b82f6',
      on: 'บัตรถูกต้อง', off: 'รอแตะบัตร', desc: 'อ่านบัตร/พวงกุญแจ RFID ให้ค่า HIGH เมื่อแตะบัตรที่ลงทะเบียนไว้' },

    led: { short: 'LED', kind: 'actuator', label: 'LED', th: 'หลอด LED', icon: 'fa-lightbulb', color: '#22c55e', on: 'ติด', off: 'ดับ', desc: 'หลอดไฟดวงเล็ก ใช้แสดงสถานะ' },
    lamp: { short: 'Lamp', kind: 'actuator', label: 'Smart Lamp', th: 'โคมไฟ', icon: 'fa-lightbulb', color: '#fbbf24', on: 'เปิด', off: 'ปิด', desc: 'ไฟส่องสว่างในห้อง (ผ่านรีเลย์)' },
    fan: { short: 'Fan', kind: 'actuator', label: 'Fan', th: 'พัดลม', icon: 'fa-fan', color: '#38bdf8', on: 'หมุน', off: 'หยุด', desc: 'พัดลมระบายอากาศ (ผ่านรีเลย์)' },
    buzzer: { short: 'Siren', kind: 'actuator', label: 'Buzzer / Siren', th: 'ไซเรน', icon: 'fa-bell', color: '#f43f5e', on: 'ดัง!', off: 'เงียบ', desc: 'ส่งเสียงเตือน' },
    servo: { short: 'Lock', kind: 'actuator', label: 'Servo Door Lock', th: 'กลอนประตูไฟฟ้า', icon: 'fa-lock', color: '#a855f7', on: 'ปลดล็อก', off: 'ล็อก', desc: 'มอเตอร์เซอร์โวหมุนกลอนประตู' },
    pump: { short: 'Pump', kind: 'actuator', label: 'Water Pump', th: 'ปั๊มน้ำ / สปริงเกอร์', icon: 'fa-faucet-drip', color: '#0ea5e9', on: 'รดน้ำ', off: 'หยุด', desc: 'ปั๊มน้ำรดต้นไม้ (ผ่านรีเลย์)' }
  };
  const ORDER = Object.keys(PARTS);
  const GROUPS = [
    { id: 'board', th: 'บอร์ดควบคุม' }, { id: 'sensor', th: 'เซนเซอร์ (รับค่า)' }, { id: 'actuator', th: 'อุปกรณ์ทำงาน (สั่งงาน)' }, { id: 'cloud', th: 'Cloud และมือถือ' }
  ];
  const groupOf = t => { const k = PARTS[t].kind; return k === 'gateway' || k === 'phone' ? 'cloud' : k; };
  const ENV0 = { temp: 28, light: 70, soil: 60, smoke: 0, motion: 0, door: 0 };
  const OPS = { '==': (a, b) => a === b, '>': (a, b) => a > b, '<': (a, b) => a < b, '>=': (a, b) => a >= b, '<=': (a, b) => a <= b };
  const clone = o => JSON.parse(JSON.stringify(o));

  class Project {
    constructor() {
      this.parts = new Map();
      this.rules = [];
      this.env = Object.assign({}, ENV0);
      this.nextId = 1;
      this.nextRule = 1;
      this.tick = 0;
      this.triggers = new Map();     // ชิ้นส่วน → จำนวนจังหวะที่ยังเป็น HIGH (กดปุ่ม / มีคนเดินผ่าน / แตะบัตร)
      this.manual = new Map();       // อุปกรณ์ → ค่าที่สั่งจากมือถือ
      this.state = new Map();        // ค่าปัจจุบันของทุกชิ้น
      this.ruleWas = new Map();
      this.notifications = [];
      this.flags = new Set();        // บันทึกเหตุการณ์ไว้ตรวจภารกิจ เช่น lamp<=motion
    }

    /* ------------------------------- ชิ้นส่วน ------------------------------- */
    addPart(cfg) {
      const spec = PARTS[cfg.type];
      if (!spec) throw new Error('ไม่รู้จักชิ้นส่วน ' + cfg.type);
      const id = cfg.id !== undefined ? Number(cfg.id) : this.nextId;
      this.nextId = Math.max(this.nextId, id + 1);
      const count = [...this.parts.values()].filter(p => p.type === cfg.type).length + 1;
      const p = { id, type: cfg.type, spec, name: cfg.name || `${spec.short}-${count}`, x: cfg.x || 0, z: cfg.z || 0, link: null, cloud: !!cfg.cloud };
      this.parts.set(id, p);
      this.state.set(id, 0);
      if (cfg.link) this.connect(id, cfg.link.board, cfg.link.pin);
      return p;
    }
    removePart(id) {
      const p = this.parts.get(Number(id));
      if (!p) return;
      if (p.spec.kind === 'board') this.parts.forEach(q => { if (q.link && q.link.board === p.id) q.link = null; });
      this.rules = this.rules.filter(r => r.board !== p.id && !r.conds.some(c => c.part === p.id) && !(r.then && r.then.part === p.id) && !(r.else && r.else.part === p.id));
      this.parts.delete(p.id);
      this.state.delete(p.id);
      this.manual.delete(p.id);
    }
    boards() { return [...this.parts.values()].filter(p => p.spec.kind === 'board'); }
    partsOf(boardId) { return [...this.parts.values()].filter(p => p.link && p.link.board === boardId); }
    pinType(pin) { return /^(A\d|ADC)/.test(pin) ? 'A' : 'D'; }
    freePins(board, part) {
      const want = part.spec.kind === 'sensor' && part.spec.signal === 'analog' ? 'A' : 'D';
      const used = new Set(this.partsOf(board.id).filter(q => q !== part).map(q => q.link.pin));
      return board.spec.pins[want].filter(x => !used.has(x));
    }
    connect(partId, boardId, pin) {
      const p = this.parts.get(Number(partId)), b = this.parts.get(Number(boardId));
      if (!p || !b) return { ok: false, error: 'ไม่พบชิ้นส่วนที่เลือก' };
      if (p.spec.kind !== 'sensor' && p.spec.kind !== 'actuator') return { ok: false, error: `${p.name} ไม่ได้ต่อสายเข้าขาบอร์ด (ใช้ Wi-Fi แทน)` };
      if (b.spec.kind !== 'board') return { ok: false, error: `${b.name} ไม่ใช่บอร์ดควบคุม ต้องต่อเข้ากับ Arduino / ESP32 / Raspberry Pi` };
      const want = p.spec.kind === 'sensor' && p.spec.signal === 'analog' ? 'A' : 'D';
      if (pin) {
        if (!b.spec.pins.D.includes(pin) && !b.spec.pins.A.includes(pin)) return { ok: false, error: `${b.name} ไม่มีขา ${pin}` };
        if (this.pinType(pin) !== want) return { ok: false, error: want === 'A' ? `${p.spec.label} ให้ค่าเป็นตัวเลข (อนาล็อก) ต้องต่อขา ${b.spec.pins.A[0]}–${b.spec.pins.A[b.spec.pins.A.length - 1]}` : `${p.spec.label} ต้องต่อขาดิจิทัล (${b.spec.pins.D[0]}…)` };
        const used = this.partsOf(b.id).find(q => q !== p && q.link.pin === pin);
        if (used) return { ok: false, error: `ขา ${pin} มี ${used.name} ต่ออยู่แล้ว` };
      } else {
        pin = this.freePins(b, p)[0];
        if (!pin) return { ok: false, error: `${b.name} ไม่มีขา${want === 'A' ? 'อนาล็อก' : 'ดิจิทัล'}ว่างแล้ว` };
      }
      p.link = { board: b.id, pin };
      return { ok: true, pin };
    }
    disconnect(partId) {
      const p = this.parts.get(Number(partId));
      if (p) p.link = null;
    }
    hasCloud() { return [...this.parts.values()].some(p => p.spec.kind === 'gateway'); }
    hasPhone() { return [...this.parts.values()].some(p => p.spec.kind === 'phone'); }
    register(boardId, on) {
      const b = this.parts.get(Number(boardId));
      if (!b || b.spec.kind !== 'board') return { ok: false, error: 'ไม่พบบอร์ด' };
      if (on && !b.spec.wifi) return { ok: false, error: `${b.spec.label} ไม่มี Wi-Fi ส่งข้อมูลขึ้น Cloud ไม่ได้ — ใช้ ESP32 หรือ Raspberry Pi` };
      if (on && !this.hasCloud()) return { ok: false, error: 'ยังไม่มี IoT Gateway / Cloud ในพื้นที่' };
      b.cloud = !!on;
      return { ok: true };
    }
    online(part) {
      const b = part.spec.kind === 'board' ? part : (part.link && this.parts.get(part.link.board));
      return !!(b && b.cloud && this.hasCloud());
    }

    /* ------------------------------- สภาพแวดล้อม ------------------------------- */
    setEnv(key, value) { if (key in this.env) this.env[key] = Number(value); }
    trigger(partId, ticks) {
      const p = this.parts.get(Number(partId));
      if (!p || !p.spec.trigger) return false;
      this.triggers.set(p.id, ticks || 4);
      this.flags.add('tested:' + p.type);
      return true;
    }
    read(p) {
      if (!p.link) return null;
      if (p.spec.signal === 'analog') return Number(this.env[p.spec.env]);
      const t = this.triggers.get(p.id) > 0;
      return t || (p.spec.env && Number(this.env[p.spec.env]) > 0) ? 1 : 0;
    }
    text(p, v) {
      if (v === null || v === undefined) return 'ยังไม่ได้ต่อสาย';
      if (p.spec.kind === 'sensor') return p.spec.signal === 'analog' ? `${v}${p.spec.unit}` : (v ? p.spec.on : p.spec.off);
      if (p.spec.kind === 'actuator') return v ? p.spec.on : p.spec.off;
      return '';
    }
    // ค่าที่มือถือสั่ง (ได้เฉพาะอุปกรณ์บนบอร์ดที่ออนไลน์)
    setManual(partId, value) {
      const p = this.parts.get(Number(partId));
      if (!p || p.spec.kind !== 'actuator') return { ok: false, error: 'สั่งได้เฉพาะอุปกรณ์ทำงาน' };
      if (!this.online(p)) return { ok: false, error: `${p.name} ยังไม่ออนไลน์ — ต้องต่อกับบอร์ด Wi-Fi ที่เชื่อม Cloud แล้ว` };
      if (!this.hasPhone()) return { ok: false, error: 'ยังไม่มีสมาร์ตโฟนในพื้นที่' };
      this.manual.set(p.id, value ? 1 : 0);
      this.flags.add('phone:' + p.type);
      return { ok: true };
    }

    /* --------------------------------- กฎ --------------------------------- */
    addRule(r) {
      const rule = { id: this.nextRule++, board: Number(r.board), join: r.join === 'or' ? 'or' : 'and', conds: (r.conds || []).map(c => ({ part: Number(c.part), op: c.op || '==', value: Number(c.value) })), then: r.then ? clone(r.then) : null, else: r.else ? clone(r.else) : null };
      [rule.then, rule.else].forEach(a => { if (a && a.part !== undefined && a.part !== null) a.part = Number(a.part); });
      this.rules.push(rule);
      return rule;
    }
    updateRule(id, patch) {
      const r = this.rules.find(x => x.id === Number(id));
      if (!r) return null;
      Object.assign(r, clone(patch));
      if (patch.board !== undefined) r.board = Number(patch.board);
      return r;
    }
    removeRule(id) { this.rules = this.rules.filter(r => r.id !== Number(id)); this.ruleWas.delete(Number(id)); }
    ruleProblem(r) {
      const b = this.parts.get(r.board);
      if (!b) return 'ยังไม่ได้เลือกบอร์ด';
      if (!r.conds.length) return 'ยังไม่มีเงื่อนไข';
      for (const c of r.conds) {
        const p = this.parts.get(c.part);
        if (!p) return 'เงื่อนไขอ้างถึงเซนเซอร์ที่ถูกลบ';
        if (!p.link || p.link.board !== r.board) return `${p.name} ไม่ได้ต่อกับ ${b.name}`;
      }
      for (const a of [r.then, r.else]) {
        if (!a || !a.action) continue;
        if (a.action === 'notify') {
          if (!b.cloud) return `${b.name} ยังไม่ได้เชื่อม Cloud จึงแจ้งเตือนมือถือไม่ได้`;
          continue;
        }
        const p = this.parts.get(a.part);
        if (!p) return 'ยังไม่ได้เลือกอุปกรณ์ที่จะสั่ง';
        if (!p.link || p.link.board !== r.board) return `${p.name} ไม่ได้ต่อกับ ${b.name}`;
      }
      return '';
    }

    /* ------------------------------ จำลอง 1 จังหวะ ------------------------------ */
    step() {
      const ev = [];
      this.tick++;
      const sensors = [...this.parts.values()].filter(p => p.spec.kind === 'sensor');
      sensors.forEach(p => {
        const v = this.read(p);
        const prev = this.state.get(p.id);
        if (v !== prev) {
          this.state.set(p.id, v);
          if (p.link) ev.push({ type: 'read', part: p.id, board: p.link.board, pin: p.link.pin, value: v, text: this.text(p, v) });
        }
      });
      // ประเมินกฎทีละบอร์ด กฎหลังทับกฎก่อน
      const want = new Map();
      const fired = [];
      for (const r of this.rules) {
        if (this.ruleProblem(r)) continue;
        const test = c => OPS[c.op](this.read(this.parts.get(c.part)), c.value);
        const truth = r.join === 'or' ? r.conds.some(test) : r.conds.every(test);
        const act = truth ? r.then : r.else;
        if (act && act.action) {
          if (act.action === 'notify') { if (truth && !this.ruleWas.get(r.id)) fired.push({ r, act }); } else want.set(act.part, act.action === 'on' ? 1 : 0);
        }
        this.ruleWas.set(r.id, truth);
      }
      [...this.parts.values()].filter(p => p.spec.kind === 'actuator').forEach(p => {
        // ไม่มีกฎสั่ง → คงค่าเดิมไว้ (เหมือน digitalWrite ที่ค้างค่าจนกว่าจะสั่งใหม่) หรือใช้ค่าที่มือถือสั่ง
        let v = want.has(p.id) ? want.get(p.id) : (this.manual.has(p.id) && this.online(p) ? this.manual.get(p.id) : (this.state.get(p.id) || 0));
        if (!p.link) v = 0;
        // มือถือสั่งได้ถ้าไม่มีกฎคุมอุปกรณ์นั้นอยู่
        if (want.has(p.id) && this.manual.has(p.id)) this.manual.delete(p.id);
        const prev = this.state.get(p.id);
        if (v !== prev) {
          this.state.set(p.id, v);
          ev.push({ type: 'write', part: p.id, board: p.link ? p.link.board : null, pin: p.link ? p.link.pin : null, value: v, text: this.text(p, v), manual: !want.has(p.id) && this.manual.has(p.id) });
          if (v) sensors.filter(s => s.link && p.link && s.link.board === p.link.board).forEach(s => {
            const sv = this.read(s);
            if (s.spec.signal === 'digital' ? sv === 1 : true) this.flags.add(`${p.type}<=${s.type}${s.spec.signal === 'analog' ? ':' + sv : ''}`);
          });
          if (v) this.flags.add('on:' + p.type);
        }
      });
      fired.forEach(({ r, act }) => {
        const b = this.parts.get(r.board);
        const text = act.text || 'แจ้งเตือนจาก ' + b.name;
        const n = { tick: this.tick, board: b.id, text };
        this.notifications.unshift(n);
        this.notifications.length = Math.min(this.notifications.length, 30);
        this.flags.add('notify');
        ev.push({ type: 'notify', board: b.id, text, phone: this.hasPhone() });
      });
      // นับถอยหลังสัญญาณชั่วคราว (trigger N จังหวะ = HIGH N จังหวะพอดี)
      for (const [id, n] of this.triggers) { if (n <= 1) this.triggers.delete(id); else this.triggers.set(id, n - 1); }
      // บอร์ดออนไลน์ส่งค่าที่เปลี่ยนขึ้น Cloud
      const up = new Set(ev.filter(e => e.board !== null && e.board !== undefined && e.type !== 'notify').map(e => e.board));
      up.forEach(bid => { const b = this.parts.get(bid); if (b && b.cloud && this.hasCloud()) ev.push({ type: 'cloud', board: bid }); });
      return ev;
    }
    run(n) { const all = []; for (let i = 0; i < (n || 1); i++) all.push(...this.step()); return all; }

    /* ------------------------------ ตรวจระบบ ------------------------------ */
    validate() {
      const out = [];
      const add = (level, part, msg) => out.push({ level, part, msg });
      const boards = this.boards();
      if (!boards.length) add('error', null, 'ยังไม่มีบอร์ดควบคุม (Arduino / ESP32 / Raspberry Pi)');
      this.parts.forEach(p => {
        if ((p.spec.kind === 'sensor' || p.spec.kind === 'actuator') && !p.link) add('warn', p.id, `${p.name} ยังไม่ได้ต่อสายเข้าบอร์ด`);
      });
      boards.forEach(b => {
        if (this.partsOf(b.id).length && !this.rules.some(r => r.board === b.id)) add('warn', b.id, `${b.name} ยังไม่มีกฎการทำงาน`);
        if (b.spec.wifi && this.hasPhone() && this.hasCloud() && !b.cloud) add('info', b.id, `${b.name} มี Wi-Fi แต่ยังไม่ได้เชื่อม Cloud มือถือจึงยังมองไม่เห็น`);
      });
      this.rules.forEach((r, i) => { const pr = this.ruleProblem(r); if (pr) add('error', r.board, `กฎข้อ ${i + 1}: ${pr}`); });
      return out;
    }

    /* ---------------------- สร้างโค้ดจากกฎ (Arduino / Python) ---------------------- */
    codegen(boardId) {
      const b = this.parts.get(Number(boardId));
      if (!b || b.spec.kind !== 'board') return '';
      const parts = this.partsOf(b.id);
      const rules = this.rules.filter(r => r.board === b.id && !this.ruleProblem(r));
      const vname = p => p.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || ('p' + p.id);
      const pinNo = pin => pin.replace(/^D/, '').replace(/^GPIO/, '');
      const condTxt = (c, py) => {
        const p = this.parts.get(c.part);
        if (p.spec.signal === 'digital') return `${vname(p)} == ${c.value ? (py ? 'True' : 'HIGH') : (py ? 'False' : 'LOW')}`;
        return `${vname(p)} ${c.op} ${c.value}`;
      };
      if (b.spec.lang === 'python') {
        const L = [`# โค้ดที่สร้างจากกฎใน SimuCore IoT — ${b.name} (${b.spec.label})`, 'import RPi.GPIO as GPIO', 'from time import sleep'];
        if (parts.some(p => p.spec.signal === 'analog')) L.push('from adc import read_adc   # โมดูลแปลงค่าอนาล็อก (ADC)');
        if (b.cloud) L.push('import iot_cloud            # ส่งค่าขึ้น Cloud / แจ้งเตือนมือถือ');
        L.push('', 'GPIO.setmode(GPIO.BCM)');
        parts.forEach(p => { if (p.spec.signal !== 'analog') L.push(`${vname(p).toUpperCase()}_PIN = ${pinNo(p.link.pin)}   # ${p.spec.label}`, `GPIO.setup(${vname(p).toUpperCase()}_PIN, GPIO.${p.spec.kind === 'sensor' ? 'IN' : 'OUT'})`); });
        L.push('', 'while True:');
        parts.filter(p => p.spec.kind === 'sensor').forEach(p => L.push(p.spec.signal === 'analog'
          ? `    ${vname(p)} = read_adc('${p.link.pin}')   # ${p.spec.unit}` : `    ${vname(p)} = GPIO.input(${vname(p).toUpperCase()}_PIN) == GPIO.HIGH`));
        const act = (a, ind) => !a || !a.action ? [] : a.action === 'notify' ? [`${ind}iot_cloud.notify("${(a.text || '').replace(/"/g, "'")}")`]
          : [`${ind}GPIO.output(${vname(this.parts.get(a.part)).toUpperCase()}_PIN, GPIO.${a.action === 'on' ? 'HIGH' : 'LOW'})`];
        rules.forEach(r => {
          L.push(`    if ${r.conds.map(c => condTxt(c, true)).join(r.join === 'or' ? ' or ' : ' and ')}:`, ...(act(r.then, '        ').length ? act(r.then, '        ') : ['        pass']));
          if (r.else && r.else.action) L.push('    else:', ...act(r.else, '        '));
        });
        if (b.cloud) L.push('    iot_cloud.publish()   # ส่งค่าทั้งหมดขึ้นแอปมือถือ');
        L.push('    sleep(0.1)');
        return L.join('\n');
      }
      const L = [`// โค้ดที่สร้างจากกฎใน SimuCore IoT — ${b.name} (${b.spec.label})`];
      if (b.cloud) L.push('#include <WiFi.h>', '#include "IoTCloud.h"   // ไลบรารี Cloud สำหรับส่งค่า / แจ้งเตือนมือถือ');
      L.push('');
      parts.forEach(p => L.push(`const int ${vname(p).toUpperCase()}_PIN = ${p.spec.signal === 'analog' ? p.link.pin : pinNo(p.link.pin)};   // ${p.spec.label}`));
      L.push('', 'void setup() {', '  Serial.begin(115200);');
      parts.forEach(p => { if (p.spec.signal !== 'analog') L.push(`  pinMode(${vname(p).toUpperCase()}_PIN, ${p.spec.kind === 'sensor' ? 'INPUT' : 'OUTPUT'});`); });
      if (b.cloud) L.push('  WiFi.begin("MyHome", "home1234");', '  IoTCloud.begin();');
      L.push('}', '', 'void loop() {');
      parts.filter(p => p.spec.kind === 'sensor').forEach(p => {
        if (p.spec.signal === 'analog') L.push(`  int ${vname(p)} = map(analogRead(${vname(p).toUpperCase()}_PIN), 0, 1023, ${p.spec.min}, ${p.spec.max});   // ${p.spec.unit}`);
        else L.push(`  int ${vname(p)} = digitalRead(${vname(p).toUpperCase()}_PIN);`);
      });
      const act = (a, ind) => !a || !a.action ? [] : a.action === 'notify' ? [`${ind}IoTCloud.notify("${(a.text || '').replace(/"/g, "'")}");`]
        : [`${ind}digitalWrite(${vname(this.parts.get(a.part)).toUpperCase()}_PIN, ${a.action === 'on' ? 'HIGH' : 'LOW'});`];
      rules.forEach(r => {
        L.push(`  if (${r.conds.map(c => condTxt(c, false)).join(r.join === 'or' ? ' || ' : ' && ')}) {`, ...act(r.then, '    '));
        if (r.else && r.else.action) L.push('  } else {', ...act(r.else, '    '));
        L.push('  }');
      });
      if (b.cloud) L.push('  IoTCloud.publish();   // ส่งค่าทั้งหมดขึ้นแอปมือถือ');
      L.push('  delay(100);', '}');
      return L.join('\n');
    }

    /* ------------------------------ บันทึก / โหลด ------------------------------ */
    serialize() {
      return {
        version: 1,
        env: clone(this.env),
        parts: [...this.parts.values()].map(p => ({ id: p.id, type: p.type, name: p.name, x: +p.x.toFixed(3), z: +p.z.toFixed(3), link: p.link ? clone(p.link) : undefined, cloud: p.cloud || undefined })),
        rules: clone(this.rules)
      };
    }
  }
  Project.load = function (data) {
    const pr = new Project();
    const d = data || {};
    Object.assign(pr.env, d.env || {});
    (d.parts || []).forEach(p => { try { pr.addPart(Object.assign({}, p, { link: undefined })); } catch (e) { /* ข้าม */ } });
    (d.parts || []).forEach(p => { if (p.link && pr.parts.has(p.id)) pr.connect(p.id, p.link.board, p.link.pin); });
    (d.rules || []).forEach(r => { const x = pr.addRule(r); x.id = r.id || x.id; pr.nextRule = Math.max(pr.nextRule, x.id + 1); });
    return pr;
  };

  return { Project, PARTS, ORDER, GROUPS, groupOf, OPS, ENV0 };
});
