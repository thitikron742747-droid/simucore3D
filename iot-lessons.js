/* ==========================================================================
   SimuCore IoT — บทเรียนและภารกิจตรวจอัตโนมัติ (ทดสอบด้วย Node ได้)
   แต่ละบท: start(project) วางชิ้นส่วนเริ่มต้น, tasks[].check(ctx) ตรวจทั้งการต่อสาย
   และ "ทดลองระบบในสำเนา" ว่าทำงานถูกต้องจริง (เขียนกฎแบบไหนก็ได้ ขอให้ผลถูก)
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./iot-engine.js'));
  else root.IoTLessons = factory(root.IoTSim);
})(typeof self !== 'undefined' ? self : this, function (IoT) {
  'use strict';

  // ตัวช่วยสำหรับตรวจภารกิจ
  function makeCtx(pr) {
    const of = type => [...pr.parts.values()].find(p => p.type === type);
    const linked = type => { const p = of(type); return !!(p && p.link); };
    const boardOf = type => { const p = of(type); return p && p.link ? pr.parts.get(p.link.board) : null; };
    const sim = (setup, n) => {
      const c = IoT.Project.load(pr.serialize());
      setup(c, type => [...c.parts.values()].find(p => p.type === type));
      c.run(n || 3);
      return type => { const p = [...c.parts.values()].find(x => x.type === type); return p ? c.state.get(p.id) : null; };
    };
    // ทดลองสองสถานการณ์ต่อเนื่อง: เปิดเงื่อนไข → อุปกรณ์ต้องทำงาน, ปิดเงื่อนไข → ต้องหยุด
    const both = (type, act, onSetup, offSetup) => {
      const c = IoT.Project.load(pr.serialize());
      const find = t => [...c.parts.values()].find(p => p.type === t);
      const val = () => { const p = find(act); return p ? c.state.get(p.id) : null; };
      onSetup(c, find); c.run(3);
      const on = val();
      offSetup(c, find); c.run(6);
      return on === 1 && val() === 0;
    };
    const notifies = (setup) => {
      const c = IoT.Project.load(pr.serialize());
      setup(c, t => [...c.parts.values()].find(p => p.type === t));
      return c.run(4).some(e => e.type === 'notify');
    };
    return { pr, of, linked, boardOf, sim, both, notifies, flag: f => pr.flags.has(f), cloud: () => pr.boards().some(b => b.cloud) };
  }

  const LESSONS = [
    {
      id: 'motion-light', no: 1, icon: 'fa-person-walking', color: '#22d3ee', level: 1,
      title: 'ไฟเปิดเองเมื่อมีคนเดินผ่าน',
      story: 'ทางเดินหน้าห้องมืด อยากให้ไฟติดเองเมื่อมีคนเดินผ่าน และดับเองเมื่อไม่มีคน',
      learn: ['Input / Output', 'Digital (HIGH / LOW)', 'กฎ ถ้า…แล้ว…ไม่งั้น'],
      start(pr) {
        pr.addPart({ type: 'uno', x: 0, z: 0 });
        pr.addPart({ type: 'motion', x: -2.6, z: -0.6 });
        pr.addPart({ type: 'lamp', x: 2.6, z: -0.6 });
      },
      tasks: [
        { title: 'ต่อ Motion Sensor เข้าขาดิจิทัลของ Arduino', hint: 'คลิก Motion Sensor → แท็บคุณสมบัติ → เลือกบอร์ดและขา D2 (หรือใช้เครื่องมือต่อสาย แล้วคลิกเซนเซอร์กับบอร์ด)', check: c => c.linked('motion') },
        { title: 'ต่อโคมไฟเข้าบอร์ดเดียวกัน', hint: 'โคมไฟเป็นอุปกรณ์ทำงาน (Output) ต่อขาดิจิทัล เช่น D3', check: c => c.linked('lamp') && c.boardOf('lamp') === c.boardOf('motion') },
        { title: 'สร้างกฎ: ถ้ามีคนเคลื่อนไหว → เปิดไฟ ไม่งั้น → ปิดไฟ', hint: 'แท็บ "กฎการทำงาน" → เพิ่มกฎ เลือก Motion = มีคน แล้วเปิดโคมไฟ และอย่าลืมช่อง "ไม่งั้น" ให้ปิดไฟ (ไม่งั้นไฟจะติดค้าง)',
          check: c => c.both('motion', 'lamp', (x, f) => x.trigger(f('motion').id, 3), () => {}) },
        { title: 'ทดสอบจริง: คลิกเซนเซอร์ให้มีคนเดินผ่าน แล้วดูไฟติด', hint: 'กด ▶ เริ่มจำลอง แล้วคลิกที่ Motion Sensor ในห้อง (หรือปุ่ม "มีคนเดินผ่าน" ในแถบซ้าย)', check: c => c.flag('lamp<=motion') }
      ]
    },
    {
      id: 'fire-alarm', no: 2, icon: 'fa-fire-flame-curved', color: '#f43f5e', level: 2,
      title: 'สัญญาณเตือนไฟไหม้ + แจ้งเตือนมือถือ',
      story: 'ถ้ามีควันในห้องครัว ให้ไซเรนดังทันที และส่งข้อความเตือนไปที่มือถือของพ่อแม่แม้อยู่นอกบ้าน',
      learn: ['ESP32 และ Wi-Fi', 'IoT Gateway / Cloud', 'แจ้งเตือนผ่านมือถือ'],
      start(pr) {
        pr.addPart({ type: 'esp32', x: 0, z: 0.4 });
        pr.addPart({ type: 'smoke', x: -2.6, z: 0.2 });
        pr.addPart({ type: 'buzzer', x: 2.6, z: 0.6 });
        pr.addPart({ type: 'gateway', x: -0.6, z: -2.6 });
        pr.addPart({ type: 'phone', x: 2.4, z: -2.6 });
      },
      tasks: [
        { title: 'ต่อ Smoke Sensor และไซเรนเข้า ESP32', hint: 'ทั้งสองตัวเป็นสัญญาณดิจิทัล ต่อขา D ใดก็ได้', check: c => c.linked('smoke') && c.linked('buzzer') && c.boardOf('smoke') === c.boardOf('buzzer') },
        { title: 'เชื่อม ESP32 เข้า Cloud (Wi-Fi)', hint: 'คลิก ESP32 → แท็บคุณสมบัติ → ติ๊ก "เชื่อม Wi-Fi ขึ้น Cloud" (Arduino UNO ทำไม่ได้เพราะไม่มี Wi-Fi)', check: c => c.cloud() },
        { title: 'กฎ: ถ้าพบควัน → ไซเรนดัง ไม่งั้น → เงียบ', hint: 'เงื่อนไข Smoke = พบควัน', check: c => c.both('smoke', 'buzzer', x => x.setEnv('smoke', 1), x => x.setEnv('smoke', 0)) },
        { title: 'กฎ: ถ้าพบควัน → แจ้งเตือนมือถือ', hint: 'เพิ่มกฎอีกข้อ เลือกการทำงาน "แจ้งเตือนมือถือ" แล้วพิมพ์ข้อความ เช่น "ไฟไหม้! มีควันในครัว"', check: c => c.notifies(x => x.setEnv('smoke', 1)) },
        { title: 'ทดสอบ: ปล่อยควันแล้วดูไซเรนกับมือถือ', hint: 'เปิดสวิตช์ "ควัน" ในแถบซ้าย แล้วดูแท็บมือถือ', check: c => c.flag('buzzer<=smoke') && c.flag('notify') }
      ]
    },
    {
      id: 'smart-farm', no: 3, icon: 'fa-seedling', color: '#22c55e', level: 2,
      title: 'ฟาร์มอัจฉริยะ รดน้ำ-ระบายอากาศเอง',
      story: 'โรงเรือนปลูกผัก อยากให้ปั๊มรดน้ำเมื่อดินแห้ง และเปิดพัดลมเมื่ออากาศร้อนเกินไป',
      learn: ['Analog (ค่าเป็นตัวเลข)', 'เปรียบเทียบ มากกว่า / น้อยกว่า', 'ขา A0–A3'],
      start(pr) {
        pr.addPart({ type: 'uno', x: 0, z: 0 });
        pr.addPart({ type: 'soil', x: -2.6, z: -1 });
        pr.addPart({ type: 'temp', x: -2.6, z: 1.2 });
        pr.addPart({ type: 'pump', x: 2.6, z: -1 });
        pr.addPart({ type: 'fan', x: 2.6, z: 1.2 });
      },
      tasks: [
        { title: 'ต่อเซนเซอร์ความชื้นดินและอุณหภูมิเข้าขาอนาล็อก (A0–A3)', hint: 'เซนเซอร์ที่ให้ค่าเป็นตัวเลขต้องต่อขา A ถ้าต่อขา D ระบบจะไม่ยอม', check: c => c.linked('soil') && c.linked('temp') && /^A/.test(c.of('soil').link.pin) },
        { title: 'ต่อปั๊มน้ำและพัดลมเข้าบอร์ดเดียวกัน', hint: 'อุปกรณ์ทำงานต่อขา D', check: c => c.linked('pump') && c.linked('fan') && c.boardOf('pump') === c.boardOf('soil') },
        { title: 'กฎ: ถ้าความชื้นดิน < 30% → รดน้ำ ไม่งั้น → หยุด', hint: 'เลือก Soil Moisture เครื่องหมาย < ค่า 30', check: c => c.both('soil', 'pump', x => x.setEnv('soil', 15), x => x.setEnv('soil', 70)) },
        { title: 'กฎ: ถ้าอุณหภูมิ > 32°C → เปิดพัดลม ไม่งั้น → ปิด', hint: 'เลือก Temperature เครื่องหมาย > ค่า 32', check: c => c.both('temp', 'fan', x => x.setEnv('temp', 38), x => x.setEnv('temp', 26)) },
        { title: 'ทดสอบ: เลื่อนความชื้นดินลงจนปั๊มทำงาน', hint: 'ใช้แถบเลื่อน "ความชื้นในดิน" ในแถบซ้าย (กด ▶ เริ่มจำลองก่อน)', check: c => [...c.pr.flags].some(f => f.startsWith('pump<=soil')) }
      ]
    },
    {
      id: 'smart-door', no: 4, icon: 'fa-door-closed', color: '#a855f7', level: 2,
      title: 'ประตูอัจฉริยะ แตะบัตรเข้าห้อง',
      story: 'ห้องคอมพิวเตอร์ต้องแตะบัตรนักเรียนถึงจะปลดล็อก ส่วนคนข้างในกดปุ่มเพื่อออกได้ และมีไฟบอกเมื่อประตูถูกเปิดค้าง',
      learn: ['เงื่อนไข "หรือ" (OR)', 'Servo / กลอนไฟฟ้า', 'Reed Switch'],
      start(pr) {
        pr.addPart({ type: 'uno', x: 0, z: 0 });
        pr.addPart({ type: 'rfid', x: -2.6, z: -1.2 });
        pr.addPart({ type: 'button', x: -2.6, z: 0.4 });
        pr.addPart({ type: 'door', x: -2.6, z: 1.8 });
        pr.addPart({ type: 'servo', x: 2.6, z: -0.8 });
        pr.addPart({ type: 'led', x: 2.6, z: 1.2 });
      },
      tasks: [
        { title: 'ต่อ RFID, ปุ่มกด และเซนเซอร์ประตูเข้า Arduino', hint: 'ทั้งสามเป็นสัญญาณดิจิทัล', check: c => ['rfid', 'button', 'door'].every(t => c.linked(t)) },
        { title: 'ต่อกลอนเซอร์โวและ LED', hint: 'อุปกรณ์ทำงานต่อขา D', check: c => c.linked('servo') && c.linked('led') },
        { title: 'กฎเดียว: ถ้าแตะบัตร "หรือ" กดปุ่ม → ปลดล็อก ไม่งั้น → ล็อก', hint: 'ในกฎ กด "+ เงื่อนไข" แล้วเปลี่ยน "และ" เป็น "หรือ" (ถ้าแยกเป็นสองกฎ กฎหลังจะสั่งล็อกทับกฎแรก)',
          check: c => c.both('rfid', 'servo', (x, f) => x.trigger(f('rfid').id, 3), () => {}) && c.both('button', 'servo', (x, f) => x.trigger(f('button').id, 3), () => {}) },
        { title: 'กฎ: ถ้าประตูเปิด → LED ติด ไม่งั้น → ดับ', hint: 'เงื่อนไข Door Sensor = ประตูเปิด', check: c => c.both('door', 'led', x => x.setEnv('door', 1), x => x.setEnv('door', 0)) },
        { title: 'ทดสอบ: แตะบัตรแล้วดูกลอนปลดล็อก', hint: 'กด ▶ แล้วคลิกที่เครื่องอ่านบัตร', check: c => c.flag('servo<=rfid') }
      ]
    },
    {
      id: 'smart-class', no: 5, icon: 'fa-leaf', color: '#f59e0b', level: 3,
      title: 'ห้องเรียนประหยัดพลังงาน',
      story: 'เปิดไฟเฉพาะเมื่อห้องมืด "และ" มีคนอยู่ เปิดพัดลมเฉพาะเมื่อร้อน "และ" มีคนอยู่ ไม่มีคนก็ปิดทั้งหมด',
      learn: ['เงื่อนไข "และ" (AND)', 'ใช้หลายเซนเซอร์ร่วมกัน', 'ประหยัดพลังงาน'],
      start(pr) {
        pr.addPart({ type: 'esp32', x: 0, z: 0 });
        pr.addPart({ type: 'motion', x: -2.6, z: -1.4 });
        pr.addPart({ type: 'light', x: -2.6, z: 0 });
        pr.addPart({ type: 'temp', x: -2.6, z: 1.4 });
        pr.addPart({ type: 'lamp', x: 2.6, z: -0.8 });
        pr.addPart({ type: 'fan', x: 2.6, z: 1 });
      },
      tasks: [
        { title: 'ต่อเซนเซอร์ทั้ง 3 ตัว (ดิจิทัล 1 ตัว อนาล็อก 2 ตัว)', hint: 'Motion → ขา D, Light และ Temperature → ขา A', check: c => ['motion', 'light', 'temp'].every(t => c.linked(t)) },
        { title: 'ต่อโคมไฟและพัดลม', hint: 'ขา D', check: c => c.linked('lamp') && c.linked('fan') },
        { title: 'กฎ: ถ้าแสง < 40% และ มีคน → เปิดไฟ ไม่งั้น → ปิด', hint: 'สร้างกฎ 2 เงื่อนไขแบบ "และ"',
          check: c => c.both('light', 'lamp', (x, f) => { x.setEnv('light', 20); x.trigger(f('motion').id, 8); }, x => x.setEnv('light', 20)) &&
            c.both('light', 'lamp', (x, f) => { x.setEnv('light', 20); x.trigger(f('motion').id, 8); }, x => x.setEnv('light', 90)) },
        { title: 'กฎ: ถ้าอุณหภูมิ > 30°C และ มีคน → เปิดพัดลม ไม่งั้น → ปิด', hint: 'เหมือนข้อก่อน แต่ใช้ Temperature',
          check: c => c.both('temp', 'fan', (x, f) => { x.setEnv('temp', 35); x.trigger(f('motion').id, 8); }, x => x.setEnv('temp', 35)) }
      ]
    },
    {
      id: 'smart-home', no: 6, icon: 'fa-house-signal', color: '#6366f1', level: 3,
      title: 'บ้านอัจฉริยะ คุมผ่านมือถือ',
      story: 'อยากเปิดไฟหน้าบ้านจากมือถือตอนกลับดึก และให้บ้านเปิดพัดลมเองพร้อมบอกเมื่ออากาศร้อน',
      learn: ['แดชบอร์ดบนมือถือ', 'สั่งงานระยะไกล', 'อัตโนมัติ + แจ้งเตือน'],
      start(pr) {
        pr.addPart({ type: 'esp32', x: 0, z: 0.6 });
        pr.addPart({ type: 'temp', x: -2.6, z: 0.6 });
        pr.addPart({ type: 'lamp', x: 2.6, z: -0.2 });
        pr.addPart({ type: 'fan', x: 2.6, z: 1.6 });
        pr.addPart({ type: 'gateway', x: -0.6, z: -2.4 });
        pr.addPart({ type: 'phone', x: 2.4, z: -2.4 });
      },
      tasks: [
        { title: 'ต่อเซนเซอร์อุณหภูมิ โคมไฟ และพัดลมเข้า ESP32', hint: 'Temperature → ขา A', check: c => ['temp', 'lamp', 'fan'].every(t => c.linked(t)) },
        { title: 'เชื่อม ESP32 ขึ้น Cloud', hint: 'แท็บคุณสมบัติของ ESP32', check: c => c.cloud() },
        { title: 'เปิดโคมไฟจากแอปบนมือถือ', hint: 'แท็บ "มือถือ" → แตะสวิตช์โคมไฟ', check: c => c.flag('phone:lamp') },
        { title: 'กฎ: ถ้าอุณหภูมิ > 32°C → เปิดพัดลม ไม่งั้น → ปิด', hint: 'Temperature > 32', check: c => c.both('temp', 'fan', x => x.setEnv('temp', 36), x => x.setEnv('temp', 26)) },
        { title: 'กฎ: ถ้าอุณหภูมิ > 32°C → แจ้งเตือนมือถือ "บ้านร้อนแล้ว เปิดพัดลมให้"', hint: 'เพิ่มกฎแจ้งเตือนมือถือ', check: c => c.notifies(x => x.setEnv('temp', 36)) }
      ]
    }
  ];
  const FREE = { id: 'free', no: 0, icon: 'fa-flask', color: '#94a3b8', level: 0, title: 'ทดลองอิสระ', story: 'วางบอร์ด เซนเซอร์ และอุปกรณ์ได้ตามใจ ออกแบบระบบ IoT ของตัวเอง', learn: ['ออกแบบเอง'], start() {}, tasks: [] };

  function evaluate(lesson, pr) {
    const ctx = makeCtx(pr);
    const passed = lesson.tasks.map(t => { try { return !!t.check(ctx); } catch (e) { return false; } });
    const done = passed.filter(Boolean).length;
    return { passed, done, total: lesson.tasks.length, percent: lesson.tasks.length ? Math.round(done * 100 / lesson.tasks.length) : 0 };
  }

  return { LESSONS, FREE, get: id => LESSONS.find(l => l.id === id) || FREE, evaluate, makeCtx };
});
