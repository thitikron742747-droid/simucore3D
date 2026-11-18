/* ==========================================================================
   SimuCore Device Catalog — รายการอุปกรณ์และสายสัญญาณ (อ้างอิงจาก Cisco Packet Tracer)
   --------------------------------------------------------------------------
   ไฟล์นี้เป็น "ข้อมูล" ล้วน ๆ : รุ่นอุปกรณ์ พอร์ตของแต่ละรุ่น โมดูลเสริม และชนิดสาย
   - network-engine.js ใช้ข้อมูลพอร์ต/ชนิดอุปกรณ์ในการจำลองเครือข่าย
   - workspace.js ใช้ form / color / ru ในการสร้างโมเดล 3D และใช้ desc แสดงคำอธิบาย

   kind (พฤติกรรมในเอนจิน)
     host    = อุปกรณ์ปลายทาง มี IP (PC, Server, Laptop ...)
     router  = Layer 3 ส่งต่อแพ็กเก็ตระหว่างวงเครือข่าย
     gateway = เราเตอร์ที่มีสวิตช์ในตัว + NAT + DHCP (Wireless Router, ASA)
     switch  = Layer 2 เรียนรู้ MAC (มี Vlan1 สำหรับตั้ง IP จัดการ)
     ap      = Access Point เชื่อมเครื่องไร้สายเข้ากับสาย LAN (Layer 2)
     hub     = Layer 1 ทวนสัญญาณออกทุกพอร์ต (Hub, Repeater, Modem, Cloud)
     passive = ไม่ประมวลผลข้อมูลเครือข่าย (โทรศัพท์อนาล็อก, TV, IoT, UPS)

   media (ชนิดพอร์ต)
     copper fiber serial console rs232 async phone coax usb iot
     wlan  = การ์ด Wi-Fi ของเครื่องลูกข่าย      radio = ช่องรับเครื่องไร้สายของ AP
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NetCatalog = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MEDIA = {
    copper: 'Ethernet ทองแดง (RJ-45)',
    fiber: 'Fiber Optic (SFP)',
    serial: 'Serial (WAN)',
    console: 'Console',
    rs232: 'RS-232',
    async: 'Async (สาย Octal)',
    phone: 'โทรศัพท์ (RJ-11)',
    coax: 'Coaxial',
    usb: 'USB',
    iot: 'IoT',
    wlan: 'Wi-Fi',
    radio: 'Wi-Fi (AP)'
  };

  /* --------------------------------- สาย ---------------------------------- */
  const CABLES = {
    auto: {
      label: 'Automatically Choose', th: 'เลือกสายให้อัตโนมัติ', media: [], color: 0xffffff, icon: 'fa-bolt',
      desc: 'ให้ระบบเลือกชนิดสายและพอร์ตที่เหมาะสมให้ (เหมือนสายฟ้าสีส้มใน Packet Tracer)'
    },
    console: {
      label: 'Console', th: 'สาย Console (Rollover)', media: [['rs232', 'console']], data: false, color: 0x67e8f9, icon: 'fa-terminal',
      desc: 'ต่อจากพอร์ต RS-232 ของ PC ไปยังพอร์ต Console ของ Router/Switch เพื่อเข้า CLI ตั้งค่าเครื่อง (ไม่ได้ส่งข้อมูลเครือข่าย)'
    },
    straight: {
      label: 'Copper Straight-Through', th: 'สาย LAN แบบตรง', media: [['copper', 'copper']], color: 0xd6dde8, icon: 'fa-minus',
      desc: 'ต่ออุปกรณ์ต่างชนิดกัน เช่น PC ↔ Switch, Router ↔ Switch, Switch ↔ Hub ไม่ได้ (ต้องไขว้)'
    },
    cross: {
      label: 'Copper Cross-Over', th: 'สาย LAN แบบไขว้', media: [['copper', 'copper']], color: 0xc084fc, icon: 'fa-shuffle',
      desc: 'ต่ออุปกรณ์ชนิดเดียวกัน เช่น Switch ↔ Switch, PC ↔ PC, PC ↔ Router, Switch ↔ Hub'
    },
    fiber: {
      label: 'Fiber', th: 'สายใยแก้วนำแสง', media: [['fiber', 'fiber']], color: 0xff9100, icon: 'fa-wave-square',
      desc: 'ใช้กับพอร์ต Fiber (SFP) เท่านั้น ส่งได้ไกลและเร็ว ไม่ถูกรบกวนจากคลื่นแม่เหล็กไฟฟ้า'
    },
    phone: {
      label: 'Phone', th: 'สายโทรศัพท์', media: [['phone', 'phone']], color: 0xa3e635, icon: 'fa-phone',
      desc: 'ต่อโทรศัพท์อนาล็อก หรือ DSL Modem เข้ากับชุมสายโทรศัพท์ (Cloud)'
    },
    coax: {
      label: 'Coaxial', th: 'สายโคแอกเชียล', media: [['coax', 'coax']], color: 0x60a5fa, icon: 'fa-circle-dot',
      desc: 'ต่อ Cable Modem, TV และ Splitter เข้ากับระบบเคเบิล (Cloud)'
    },
    serialDCE: {
      label: 'Serial DCE', th: 'สาย Serial (ต้นทาง = DCE)', media: [['serial', 'serial']], color: 0xff3d55, icon: 'fa-clock',
      desc: 'ต่อ Router ↔ Router ผ่านพอร์ต Serial (WAN) อุปกรณ์ที่เลือกก่อนเป็นฝั่ง DCE ซึ่งต้องตั้ง Clock Rate'
    },
    serialDTE: {
      label: 'Serial DTE', th: 'สาย Serial (ต้นทาง = DTE)', media: [['serial', 'serial']], color: 0xff3d55, icon: 'fa-ellipsis',
      desc: 'เหมือน Serial DCE แต่อุปกรณ์ที่เลือกก่อนเป็นฝั่ง DTE (ปลายทางเป็น DCE)'
    },
    octal: {
      label: 'Octal', th: 'สาย Octal', media: [['async', 'console']], data: false, color: 0x2dd4bf, icon: 'fa-sitemap',
      desc: 'ต่อพอร์ต Async ของ Router (Terminal Server) ไปยังพอร์ต Console ของอุปกรณ์อื่นเพื่อจัดการจากที่เดียว'
    },
    iot: {
      label: 'IoT Custom Cable', th: 'สาย IoT', media: [['iot', 'iot']], data: false, color: 0xfacc15, icon: 'fa-microchip',
      desc: 'ต่อบอร์ด MCU/SBC เข้ากับเซนเซอร์และอุปกรณ์ IoT (ขาสัญญาณ Digital)'
    },
    usb: {
      label: 'USB', th: 'สาย USB', media: [['usb', 'usb']], data: false, color: 0xf472b6, icon: 'fa-usb',
      desc: 'ต่อ PC/Laptop กับบอร์ด MCU/SBC เพื่ออัปโหลดโปรแกรม'
    },
    wireless: {
      label: 'Wireless', th: 'การเชื่อมต่อไร้สาย (Wi-Fi)', media: [['wlan', 'radio']], hidden: true, color: 0x00f0ff, icon: 'fa-wifi',
      desc: 'เชื่อมต่ออัตโนมัติเมื่อ SSID และรหัสผ่านของเครื่องตรงกับ Access Point'
    }
  };
  const CABLE_ORDER = ['auto', 'console', 'straight', 'cross', 'fiber', 'phone', 'coax', 'serialDCE', 'serialDTE', 'octal', 'iot', 'usb'];

  /* ---------------------------- ตัวช่วยประกาศพอร์ต --------------------------- */
  const port = (name, media, extra) => Object.assign({ name, media }, extra);
  const seq = (prefix, from, to, media, extra) => {
    const list = [];
    for (let i = from; i <= to; i++) list.push(port(prefix + i, media, extra));
    return list;
  };
  const X = { mdix: true };      // พอร์ตฝั่งสวิตช์ (MDI-X)
  const AUTO = { autoMdix: true }; // ใช้ได้ทั้งสายตรงและสายไขว้
  const CONSOLE = port('Console', 'console');

  const serialMod = (name, a, b) => ({ name, label: `${name} — Serial 2 พอร์ต`, ports: [port(a, 'serial'), port(b, 'serial')] });
  const sfpMod = (name, p) => ({ name, label: `${name} — Gigabit Fiber 1 พอร์ต`, ports: [port(p, 'fiber')] });
  const asyncMod = (name, p) => ({ name, label: `${name} — Async 8 สาย (Octal)`, ports: [port(p, 'async')] });

  const M24 = '255.255.255.0';

  /* -------------------------------- หมวดหมู่ -------------------------------- */
  const CATEGORIES = [
    { id: 'routers', group: 'Network Devices', label: 'Routers', th: 'เราเตอร์', icon: 'fa-route' },
    { id: 'switches', group: 'Network Devices', label: 'Switches', th: 'สวิตช์', icon: 'fa-network-wired' },
    { id: 'hubs', group: 'Network Devices', label: 'Hubs', th: 'ฮับ / รีพีตเตอร์', icon: 'fa-circle-nodes' },
    { id: 'wireless', group: 'Network Devices', label: 'Wireless Devices', th: 'อุปกรณ์ไร้สาย', icon: 'fa-wifi' },
    { id: 'security', group: 'Network Devices', label: 'Security', th: 'ไฟร์วอลล์', icon: 'fa-shield-halved' },
    { id: 'wan', group: 'Network Devices', label: 'WAN Emulation', th: 'จำลอง WAN / ISP', icon: 'fa-cloud' },
    { id: 'end', group: 'End Devices', label: 'End Devices', th: 'อุปกรณ์ปลายทาง', icon: 'fa-desktop' },
    { id: 'iot', group: 'Components', label: 'IoT', th: 'อุปกรณ์ IoT', icon: 'fa-microchip' },
    { id: 'room', group: 'Components', label: 'Room', th: 'อุปกรณ์ในห้องเซิร์ฟเวอร์', icon: 'fa-server' },
    { id: 'cables', group: 'Connections', label: 'Connections', th: 'สายสัญญาณ', icon: 'fa-bolt' }
  ];

  /* ------------------------------ รุ่นอุปกรณ์ -------------------------------- */
  const MODELS = {};
  const MODEL_ORDER = [];   // ลำดับการแสดงผล (ชื่อรุ่นที่เป็นตัวเลข เช่น 1941 จะถูก JS เรียงก่อนเสมอ จึงต้องเก็บลำดับเอง)
  function def(id, o) {
    MODEL_ORDER.push(id);
    MODELS[id] = Object.assign({ id, defaults: {}, modules: [], icon: 'fa-cube', color: 0x334155, ru: 1, width: 1.2 }, o);
  }

  // ===== Routers =====
  const R = (id, o) => def(id, Object.assign({ cat: 'routers', kind: 'router', form: 'rack', prefix: 'Router', icon: 'fa-route' }, o));
  R('ISR4331', {
    label: 'ISR 4331', color: 0x24324f, ru: 1,
    ports: [port('Gi0/0/0', 'copper'), port('Gi0/0/1', 'copper'), port('Gi0/0/2', 'fiber'), CONSOLE],
    modules: [serialMod('NIM-2T', 'Se0/1/0', 'Se0/1/1')],
    desc: 'เราเตอร์รุ่นใหม่ตระกูล ISR 4000 มีพอร์ต Gigabit 3 ช่อง (ช่องที่ 3 เป็น Fiber SFP) ใส่โมดูล NIM-2T เพิ่มพอร์ต Serial ได้'
  });
  R('ISR4321', {
    label: 'ISR 4321', color: 0x24324f,
    ports: [port('Gi0/0/0', 'copper'), port('Gi0/0/1', 'copper'), CONSOLE],
    modules: [serialMod('NIM-2T', 'Se0/1/0', 'Se0/1/1')],
    desc: 'เราเตอร์ ISR 4321 สำหรับสำนักงานสาขา มีพอร์ต Gigabit 2 ช่อง'
  });
  R('1941', {
    label: 'Cisco 1941', color: 0x2c3e66,
    ports: [port('Gi0/0', 'copper'), port('Gi0/1', 'copper'), CONSOLE],
    modules: [serialMod('HWIC-2T', 'Se0/0/0', 'Se0/0/1'), sfpMod('HWIC-1GE-SFP', 'Gi0/1/0'), asyncMod('HWIC-8A', 'Async0/2/0')],
    desc: 'เราเตอร์ยอดนิยมในบทเรียน CCNA มีพอร์ต Gigabit 2 ช่อง ใส่โมดูล HWIC-2T เพื่อต่อสาย Serial ข้ามเมือง'
  });
  R('2901', {
    label: 'Cisco 2901', color: 0x2c3e66,
    ports: [port('Gi0/0', 'copper'), port('Gi0/1', 'copper'), CONSOLE],
    modules: [serialMod('HWIC-2T', 'Se0/0/0', 'Se0/0/1'), sfpMod('HWIC-1GE-SFP', 'Gi0/1/0'), asyncMod('HWIC-8A', 'Async0/2/0')],
    desc: 'เราเตอร์ตระกูล ISR G2 รุ่น 2900 พอร์ต Gigabit 2 ช่อง รองรับโมดูลเสริมหลายแบบ'
  });
  R('2911', {
    label: 'Cisco 2911', color: 0x2c3e66,
    ports: [port('Gi0/0', 'copper'), port('Gi0/1', 'copper'), port('Gi0/2', 'copper'), CONSOLE],
    modules: [serialMod('HWIC-2T', 'Se0/0/0', 'Se0/0/1'), sfpMod('HWIC-1GE-SFP', 'Gi0/1/0'), asyncMod('HWIC-8A', 'Async0/2/0')],
    desc: 'เราเตอร์ 2911 มีพอร์ต Gigabit 3 ช่อง เหมาะกับการเชื่อม 3 วงเครือข่าย'
  });
  R('819IOX', {
    label: 'Cisco 819 IOX', color: 0x3a3f4b, width: 0.9,
    ports: [port('Gi0', 'copper'), ...seq('Fa', 0, 3, 'copper'), port('Se0', 'serial'), CONSOLE],
    desc: 'เราเตอร์ขนาดเล็กสำหรับงาน IoT/อุตสาหกรรม มีพอร์ต WAN Gigabit, LAN 4 ช่อง และ Serial'
  });
  R('819HGW', {
    label: 'Cisco 819 HGW', color: 0x3a3f4b, width: 0.9,
    ports: [port('Gi0', 'copper'), ...seq('Fa', 0, 3, 'copper'), port('Se0', 'serial'), CONSOLE],
    desc: 'เราเตอร์ 819 รุ่นที่มีฮาร์ดแวร์ไร้สายในตัว ใช้ในสาขาขนาดเล็ก'
  });
  R('829', {
    label: 'Cisco IR829', color: 0x4b3f2c, width: 1.0,
    ports: [...seq('Gi', 0, 4, 'copper'), CONSOLE],
    desc: 'เราเตอร์อุตสาหกรรมทนทาน (Industrial ISR) ใช้ในยานพาหนะ/โรงงาน'
  });
  R('CGR1240', {
    label: 'CGR 1240', color: 0x52525b, ru: 2,
    ports: [port('Gi2/1', 'copper'), port('Gi2/2', 'copper'), ...seq('Fa2/', 3, 6, 'copper'), CONSOLE],
    desc: 'Connected Grid Router สำหรับระบบไฟฟ้าอัจฉริยะ (Smart Grid) ติดตั้งกลางแจ้ง'
  });
  R('Router-PT', {
    label: 'Router-PT', color: 0x1e3a5f, ru: 2,
    ports: [port('Fa0/0', 'copper'), port('Fa1/0', 'copper'), port('Se2/0', 'serial'), port('Se3/0', 'serial'), port('Fa4/0', 'copper'), port('Fa5/0', 'copper'), CONSOLE],
    desc: 'เราเตอร์ทั่วไปของ Packet Tracer มีทั้ง FastEthernet 4 ช่อง และ Serial 2 ช่องให้พร้อมใช้'
  });
  R('1841', {
    label: 'Cisco 1841', color: 0x334155,
    ports: [port('Fa0/0', 'copper'), port('Fa0/1', 'copper'), CONSOLE],
    modules: [serialMod('WIC-2T', 'Se0/0/0', 'Se0/0/1')],
    desc: 'เราเตอร์รุ่นเก่า (ISR G1) พอร์ต FastEthernet 2 ช่อง ใส่ WIC-2T เพื่อต่อ Serial'
  });
  R('2620XM', {
    label: 'Cisco 2620XM', color: 0x3f4a5a,
    ports: [port('Fa0/0', 'copper'), CONSOLE],
    modules: [serialMod('WIC-2T', 'Se0/0', 'Se0/1')],
    desc: 'เราเตอร์รุ่นเก่า พอร์ต FastEthernet 1 ช่อง'
  });
  R('2621XM', {
    label: 'Cisco 2621XM', color: 0x3f4a5a,
    ports: [port('Fa0/0', 'copper'), port('Fa0/1', 'copper'), CONSOLE],
    modules: [serialMod('WIC-2T', 'Se0/0', 'Se0/1')],
    desc: 'เราเตอร์รุ่นเก่า พอร์ต FastEthernet 2 ช่อง'
  });
  R('2811', {
    label: 'Cisco 2811', color: 0x334155,
    ports: [port('Fa0/0', 'copper'), port('Fa0/1', 'copper'), CONSOLE],
    modules: [serialMod('HWIC-2T', 'Se0/0/0', 'Se0/0/1'), asyncMod('HWIC-8A', 'Async0/1/0')],
    desc: 'เราเตอร์ 2811 ที่ใช้ในตำรา CCNA รุ่นเก่า พอร์ต FastEthernet 2 ช่อง'
  });

  // ===== Switches =====
  const S = (id, o) => def(id, Object.assign({ cat: 'switches', kind: 'switch', form: 'rack', prefix: 'Switch', icon: 'fa-network-wired' }, o));
  S('2960-24TT', {
    label: 'Catalyst 2960-24TT', color: 0x0f5c58,
    ports: [...seq('Fa0/', 1, 24, 'copper', X), port('Gi0/1', 'copper', X), port('Gi0/2', 'copper', X), CONSOLE],
    desc: 'สวิตช์ Layer 2 ที่ใช้มากที่สุดในห้องเรียน FastEthernet 24 ช่อง + Gigabit Uplink 2 ช่อง'
  });
  S('2950-24', {
    label: 'Catalyst 2950-24', color: 0x175e4c,
    ports: [...seq('Fa0/', 1, 24, 'copper', X), CONSOLE],
    desc: 'สวิตช์ Layer 2 รุ่นเก่า FastEthernet 24 ช่อง'
  });
  S('2950T-24', {
    label: 'Catalyst 2950T-24', color: 0x175e4c,
    ports: [...seq('Fa0/', 1, 24, 'copper', X), port('Gi0/1', 'copper', X), port('Gi0/2', 'copper', X), CONSOLE],
    desc: 'สวิตช์ 2950 รุ่นที่มี Gigabit Uplink 2 ช่อง'
  });
  S('3560-24PS', {
    label: 'Catalyst 3560-24PS', color: 0x0e4f6b,
    ports: [...seq('Fa0/', 1, 24, 'copper', X), port('Gi0/1', 'copper', X), port('Gi0/2', 'copper', X), CONSOLE],
    desc: 'Multilayer Switch (Layer 3) จ่ายไฟ PoE ให้ IP Phone / Access Point ผ่านสาย LAN ได้'
  });
  S('3650-24PS', {
    label: 'Catalyst 3650-24PS', color: 0x0e4f6b,
    ports: [...seq('Gi1/0/', 1, 24, 'copper', X), ...seq('Gi1/1/', 1, 4, 'fiber'), CONSOLE],
    desc: 'Multilayer Switch รุ่นใหม่ Gigabit 24 ช่อง + Fiber Uplink 4 ช่อง ใช้เป็น Core Switch'
  });
  S('IE-2000', {
    label: 'IE-2000', color: 0x4b5563, width: 0.9,
    ports: [...seq('Fa1/', 1, 8, 'copper', X), port('Gi1/1', 'copper', X), port('Gi1/2', 'copper', X), CONSOLE],
    desc: 'สวิตช์อุตสาหกรรม (Industrial Ethernet) ติดราง DIN ในตู้ควบคุม'
  });
  S('Switch-PT', {
    label: 'Switch-PT', color: 0x14532d, ru: 2,
    ports: [port('Fa0/1', 'copper', X), port('Fa1/1', 'copper', X), port('Fa2/1', 'copper', X), port('Fa3/1', 'copper', X), port('Fa4/1', 'fiber'), port('Fa5/1', 'fiber')],
    desc: 'สวิตช์ทั่วไปของ Packet Tracer มีพอร์ตทองแดง 4 ช่อง และพอร์ต Fiber 2 ช่อง'
  });
  S('Bridge-PT', {
    label: 'Bridge-PT', color: 0x365314, width: 0.6, noMgmt: true,
    ports: [port('Eth0', 'copper', X), port('Eth1', 'copper', X)],
    desc: 'บริดจ์ 2 พอร์ต แบ่ง Collision Domain และเรียนรู้ MAC เหมือนสวิตช์ขนาดเล็ก'
  });

  // ===== Hubs =====
  const H = (id, o) => def(id, Object.assign({ cat: 'hubs', kind: 'hub', form: 'rack', prefix: 'Hub', icon: 'fa-circle-nodes' }, o));
  H('Hub-PT', {
    label: 'Hub-PT', color: 0x5b4636, width: 0.8,
    ports: seq('Port', 0, 5, 'copper', X),
    desc: 'ฮับทำงานที่ Layer 1 ทวนสัญญาณออกทุกพอร์ตโดยไม่ดู MAC ทุกเครื่องจึงเห็นข้อมูลของกันและกัน'
  });
  H('Repeater-PT', {
    label: 'Repeater-PT', color: 0x5b4636, width: 0.55,
    ports: seq('Port', 0, 1, 'copper', X),
    desc: 'รีพีตเตอร์ขยายสัญญาณให้สายยาวขึ้น ทำงานที่ Layer 1'
  });
  H('CoAxialSplitter-PT', {
    label: 'Coaxial Splitter', form: 'splitter', prefix: 'Splitter', color: 0x9ca3af, icon: 'fa-code-branch',
    ports: seq('Coaxial', 0, 2, 'coax'),
    desc: 'ตัวแยกสายโคแอกเชียล แบ่งสัญญาณเคเบิลไปหลายจุด (เช่น TV และ Cable Modem)'
  });

  // ===== Wireless Devices =====
  const W = (id, o) => def(id, Object.assign({ cat: 'wireless', kind: 'ap', form: 'ap', prefix: 'AP', icon: 'fa-wifi', wireless: { slots: 16 } }, o));
  W('AccessPoint-PT', { label: 'AccessPoint-PT', color: 0xe5e7eb, ports: [port('Port 0', 'copper', X)], desc: 'Access Point มาตรฐาน 802.11b/g เชื่อมเครื่องไร้สายเข้ากับเครือข่ายสาย LAN (Layer 2)' });
  W('AccessPoint-PT-A', { label: 'AccessPoint-PT-A', color: 0xe5e7eb, ports: [port('Port 0', 'copper', X)], desc: 'Access Point มาตรฐาน 802.11a คลื่น 5 GHz' });
  W('AccessPoint-PT-N', { label: 'AccessPoint-PT-N', color: 0xe5e7eb, ports: [port('Port 0', 'copper', X)], desc: 'Access Point มาตรฐาน 802.11n (Wi-Fi 4) ความเร็วสูงขึ้น' });
  W('AccessPoint-PT-AC', { label: 'AccessPoint-PT-AC', color: 0xe5e7eb, ports: [port('Port 0', 'copper', X)], desc: 'Access Point มาตรฐาน 802.11ac (Wi-Fi 5) คลื่น 5 GHz' });
  W('LAP-PT', { label: 'LAP-PT', color: 0xd1d5db, ports: [port('Gig0', 'copper', X)], desc: 'Lightweight Access Point ปกติถูกควบคุมด้วย Wireless LAN Controller (WLC)' });
  W('3702i', { label: 'Aironet 3702i', color: 0xf3f4f6, ports: [port('Gig0', 'copper', X)], desc: 'Access Point องค์กร Cisco Aironet 3700 ติดเพดาน' });
  W('Meraki-MR', { label: 'Meraki MR', color: 0xf8fafc, ports: [port('Port 0', 'copper', X)], desc: 'Access Point บริหารผ่านคลาวด์ของ Cisco Meraki' });
  const G = (id, o) => def(id, Object.assign({
    cat: 'wireless', kind: 'gateway', form: 'wrouter', prefix: 'WRouter', icon: 'fa-house-signal', wireless: { slots: 16 },
    outside: 0, outsideName: 'Internet', insideName: 'LAN', color: 0x1f2937,
    ports: [port('Internet', 'copper', AUTO), ...seq('Ethernet ', 1, 4, 'copper', AUTO)],
    defaults: {
      ifaces: [{ name: 'Internet', dhcp: true }, { name: 'LAN', ip: '192.168.0.1', mask: M24 }],
      services: { dhcp: { enabled: true, start: '192.168.0.100', count: 50, mask: M24, gw: '192.168.0.1', dns: '' } },
      wifi: { ssid: 'Default', key: '' },
      nat: { enabled: true, outside: 'Internet' }
    }
  }, o));
  G('WRT300N', { label: 'Linksys WRT300N', desc: 'เราเตอร์ไร้สายตามบ้าน: มีสวิตช์ 4 พอร์ต + Wi-Fi + DHCP แจก IP + NAT แชร์อินเทอร์เน็ตจากพอร์ต Internet' });
  G('HomeRouter-PT-AC', { label: 'HomeRouter-PT-AC', color: 0xf1f5f9, desc: 'เราเตอร์บ้านมาตรฐาน 802.11ac มี DHCP และ NAT ในตัวเหมือน WRT300N' });
  const WLC = (id, o) => def(id, Object.assign({ cat: 'wireless', kind: 'host', form: 'rack', prefix: 'WLC', icon: 'fa-tower-broadcast', color: 0x374151 }, o));
  WLC('WLC-PT', { label: 'WLC-PT', ports: [port('Gig0', 'copper')], desc: 'Wireless LAN Controller จัดการ Lightweight AP หลายตัวจากศูนย์กลาง (ในระบบนี้จำลองเป็นเครื่องที่มี IP จัดการ)' });
  WLC('WLC-2504', { label: 'WLC 2504', ports: seq('Gig', 1, 4, 'copper'), desc: 'Wireless LAN Controller รุ่น 2504 พอร์ต Gigabit 4 ช่อง' });
  WLC('WLC-3504', { label: 'WLC 3504', ports: seq('Gig', 1, 4, 'copper'), desc: 'Wireless LAN Controller รุ่น 3504 สำหรับองค์กรขนาดกลาง' });

  // ===== Security =====
  const F = (id, o) => def(id, Object.assign({
    cat: 'security', kind: 'gateway', form: 'rack', prefix: 'ASA', icon: 'fa-shield-halved', firewall: true, color: 0x7f1d1d,
    outside: 0, outsideName: 'outside', insideName: 'inside'
  }, o));
  const fwDefaults = (ip, start) => ({
    ifaces: [{ name: 'outside', dhcp: true }, { name: 'inside', ip, mask: M24 }],
    services: { dhcp: { enabled: true, start, count: 32, mask: M24, gw: ip, dns: '' } },
    nat: { enabled: true, outside: 'outside' }
  });
  F('ASA5505', {
    label: 'ASA 5505', width: 1.0,
    ports: [...seq('Ethernet0/', 0, 7, 'copper', AUTO), CONSOLE],
    defaults: fwDefaults('192.168.1.1', '192.168.1.5'),
    desc: 'ไฟร์วอลล์ ASA 5505: พอร์ต Ethernet0/0 = outside, 0/1-0/7 = inside ทำ NAT และบล็อกการเชื่อมต่อจากภายนอกเข้ามา'
  });
  F('ASA5506-X', {
    label: 'ASA 5506-X', width: 1.0,
    ports: [...seq('Gi1/', 1, 8, 'copper', AUTO), CONSOLE],
    defaults: fwDefaults('192.168.1.1', '192.168.1.5'),
    desc: 'ไฟร์วอลล์รุ่นใหม่ (Next-Gen) Gi1/1 = outside ที่เหลือ = inside'
  });
  F('ISA-3000', {
    label: 'ISA 3000', width: 0.8, color: 0x57534e,
    ports: [...seq('Gi1/', 1, 4, 'copper', AUTO), CONSOLE],
    defaults: fwDefaults('192.168.1.1', '192.168.1.5'),
    desc: 'ไฟร์วอลล์อุตสาหกรรม ป้องกันระบบควบคุมในโรงงาน'
  });
  F('Meraki-MX65W', {
    label: 'Meraki MX65W', color: 0x14532d, prefix: 'MX', wireless: { slots: 16 }, antennas: true,
    outsideName: 'Internet', insideName: 'LAN',
    ports: [port('Internet 1', 'copper', AUTO), ...seq('Port ', 3, 12, 'copper', AUTO)],
    defaults: {
      ifaces: [{ name: 'Internet', dhcp: true }, { name: 'LAN', ip: '192.168.128.1', mask: M24 }],
      services: { dhcp: { enabled: true, start: '192.168.128.100', count: 50, mask: M24, gw: '192.168.128.1', dns: '' } },
      wifi: { ssid: 'Meraki', key: '' },
      nat: { enabled: true, outside: 'Internet' }
    },
    desc: 'Security Appliance ของ Meraki มีไฟร์วอลล์ สวิตช์ 10 พอร์ต และ Wi-Fi ในตัว'
  });

  // ===== WAN Emulation =====
  const WAN = (id, o) => def(id, Object.assign({ cat: 'wan', kind: 'hub', prefix: 'WAN' }, o));
  WAN('Cloud-PT', {
    label: 'Cloud-PT', form: 'cloud', prefix: 'Cloud', icon: 'fa-cloud', color: 0xdbeafe,
    ports: [...seq('Serial', 0, 3, 'serial'), port('Modem4', 'phone'), port('Modem5', 'phone'), port('Ethernet6', 'copper', X), port('Coaxial7', 'coax')],
    desc: 'จำลองเครือข่ายผู้ให้บริการ (ISP / ชุมสายโทรศัพท์ / เคเบิล) เชื่อมสายต่างชนิดเข้าหากัน'
  });
  WAN('DSL-Modem-PT', {
    label: 'DSL Modem', form: 'modem', prefix: 'DSL', icon: 'fa-phone-volume', color: 0x1f2937,
    ports: [port('Port0', 'phone'), port('Port1', 'copper', X)],
    desc: 'โมเด็ม DSL แปลงสัญญาณจากสายโทรศัพท์เป็นสาย LAN'
  });
  WAN('Cable-Modem-PT', {
    label: 'Cable Modem', form: 'modem', prefix: 'CableModem', icon: 'fa-tv', color: 0xe5e7eb,
    ports: [port('Port0', 'coax'), port('Port1', 'copper', X)],
    desc: 'เคเบิลโมเด็ม แปลงสัญญาณจากสายโคแอกเชียลเป็นสาย LAN'
  });

  // ===== End Devices =====
  const E = (id, o) => def(id, Object.assign({ cat: 'end', kind: 'host', prefix: 'PC', icon: 'fa-desktop' }, o));
  E('PC-PT', {
    label: 'PC', form: 'pc',
    ports: [port('Fa0', 'copper'), port('RS232', 'rs232'), port('USB0', 'usb')],
    desc: 'เครื่องคอมพิวเตอร์ตั้งโต๊ะ ต้องตั้ง IP, Subnet Mask, Default Gateway และ DNS (หรือรับจาก DHCP)'
  });
  E('Laptop-PT', {
    label: 'Laptop', form: 'laptop', prefix: 'Laptop', icon: 'fa-laptop',
    ports: [port('Fa0', 'copper'), port('Wireless0', 'wlan'), port('RS232', 'rs232'), port('USB0', 'usb')],
    defaults: { ifaces: [{ name: 'Wireless0', ssid: '' }] },
    desc: 'โน้ตบุ๊ก มีทั้งพอร์ต LAN และการ์ด Wi-Fi ใส่ SSID ให้ตรงกับ Access Point เพื่อเชื่อมต่อไร้สาย'
  });
  E('Server-PT', {
    label: 'Server', form: 'server', prefix: 'Server', icon: 'fa-server', server: true,
    ports: [port('Fa0', 'copper')],
    defaults: { services: { http: { enabled: true } } },
    desc: 'เซิร์ฟเวอร์ให้บริการ HTTP (เว็บ), DNS (แปลงชื่อเป็น IP) และ DHCP (แจก IP อัตโนมัติ)'
  });
  E('Printer-PT', {
    label: 'Printer', form: 'printer', prefix: 'Printer', icon: 'fa-print',
    ports: [port('Fa0', 'copper')],
    desc: 'เครื่องพิมพ์เครือข่าย ทุกเครื่องในวงสั่งพิมพ์ผ่าน IP ได้'
  });
  E('IP-Phone-7960', {
    label: 'IP Phone 7960', form: 'ipphone', prefix: 'IPPhone', icon: 'fa-phone',
    bridgeIface: 'Vlan1',
    ports: [port('Switch', 'copper'), port('PC', 'copper', X)],
    defaults: { ifaces: [{ name: 'Vlan1', dhcp: true }] },
    desc: 'โทรศัพท์ VoIP มีสวิตช์เล็กในตัว (พอร์ต Switch ต่อเข้าเครือข่าย พอร์ต PC ต่อคอมพิวเตอร์ผ่านโทรศัพท์ได้)'
  });
  E('Home-VoIP-PT', {
    label: 'Home VoIP', form: 'voipbox', prefix: 'VoIP', icon: 'fa-phone-volume',
    ports: [port('Ethernet', 'copper'), port('Phone', 'phone')],
    defaults: { ifaces: [{ name: 'Ethernet', dhcp: true }] },
    desc: 'กล่องแปลงโทรศัพท์บ้านธรรมดาให้โทรผ่านอินเทอร์เน็ต (VoIP) ได้'
  });
  E('Analog-Phone-PT', {
    label: 'Analog Phone', form: 'phone', prefix: 'Phone', icon: 'fa-phone', kind: 'passive',
    ports: [port('Port0', 'phone')],
    desc: 'โทรศัพท์บ้านแบบอนาล็อก ต่อด้วยสายโทรศัพท์ (RJ-11)'
  });
  E('TV-PT', {
    label: 'TV', form: 'tv', prefix: 'TV', icon: 'fa-tv', kind: 'passive',
    ports: [port('Coaxial', 'coax')],
    desc: 'โทรทัศน์รับสัญญาณเคเบิลผ่านสายโคแอกเชียล'
  });
  E('SmartTV-PT', {
    label: 'Smart TV', form: 'tv', prefix: 'SmartTV', icon: 'fa-tv', color: 0x111827,
    ports: [port('Fa0', 'copper'), port('Wireless0', 'wlan')],
    defaults: { ifaces: [{ name: 'Wireless0', ssid: '', dhcp: true }] },
    desc: 'ทีวีที่ต่ออินเทอร์เน็ตได้ (YouTube / Netflix) ผ่าน Wi-Fi หรือสาย LAN ใช้แบนด์วิดท์สูงตอนดูวิดีโอ 4K'
  });
  E('IPCam-PT', {
    label: 'IP Camera (CCTV)', form: 'camera', prefix: 'CCTV', icon: 'fa-video', color: 0xe5e7eb, server: true,
    ports: [port('Fa0', 'copper'), port('Wireless0', 'wlan')],
    defaults: { services: { http: { enabled: true, title: 'กล้องวงจรปิด — ภาพสด', body: 'ภาพสดจากกล้องหน้าบ้าน (ดูจากนอกบ้านต้องตั้ง Port Forwarding ที่เราเตอร์)' } } },
    desc: 'กล้องวงจรปิดแบบ IP มีหน้าเว็บดูภาพสด ดูจากนอกบ้านได้เมื่อเราเตอร์ตั้ง Port Forwarding ไว้'
  });
  E('GameConsole-PT', {
    label: 'Game Console', form: 'console', prefix: 'Game', icon: 'fa-gamepad', color: 0x1f2937,
    ports: [port('Fa0', 'copper'), port('Wireless0', 'wlan')],
    defaults: { ifaces: [{ name: 'Wireless0', ssid: '', dhcp: true }] },
    desc: 'เครื่องเล่นเกมออนไลน์ ต้องการค่า Ping ต่ำ (ไม่แลค) มากกว่าความเร็วสูง ต่อสาย LAN จะเสถียรกว่า Wi-Fi'
  });
  E('TabletPC-PT', {
    label: 'Tablet', form: 'tablet', prefix: 'Tablet', icon: 'fa-tablet-screen-button',
    ports: [port('Wireless0', 'wlan')],
    defaults: { ifaces: [{ name: 'Wireless0', ssid: 'Default', dhcp: true }] },
    desc: 'แท็บเล็ต เชื่อมต่อได้เฉพาะ Wi-Fi'
  });
  E('SMARTPHONE-PT', {
    label: 'Smartphone', form: 'smartphone', prefix: 'Phone', icon: 'fa-mobile-screen',
    ports: [port('Wireless0', 'wlan')],
    defaults: { ifaces: [{ name: 'Wireless0', ssid: 'Default', dhcp: true }] },
    desc: 'สมาร์ตโฟน เชื่อมต่อ Wi-Fi แล้วรับ IP จาก DHCP อัตโนมัติ'
  });
  E('WirelessEndDevice-PT', {
    label: 'Wireless End Device', form: 'enddev', prefix: 'WDevice', icon: 'fa-wifi', color: 0x0ea5e9,
    ports: [port('Wireless0', 'wlan')],
    defaults: { ifaces: [{ name: 'Wireless0', ssid: 'Default', dhcp: true }] },
    desc: 'อุปกรณ์ปลายทางไร้สายทั่วไป (เช่น กล้อง IP ไร้สาย)'
  });
  E('WiredEndDevice-PT', {
    label: 'Wired End Device', form: 'enddev', prefix: 'Device', icon: 'fa-ethernet', color: 0x64748b,
    ports: [port('Fa0', 'copper')],
    desc: 'อุปกรณ์ปลายทางแบบใช้สายทั่วไป'
  });
  E('Sniffer', {
    label: 'Sniffer', form: 'laptop', prefix: 'Sniffer', icon: 'fa-magnifying-glass', sniffer: true, color: 0x7f1d1d,
    ports: [port('Fa0', 'copper')],
    desc: 'เครื่องดักจับแพ็กเก็ต (Sniffer) รับทุกเฟรมที่วิ่งผ่านมาโดยไม่ทิ้ง ต่อกับ Hub เพื่อดูข้อมูลของเครื่องอื่น'
  });

  // ===== IoT =====
  const I = (id, o) => def(id, Object.assign({ cat: 'iot', kind: 'passive', prefix: 'IoT', icon: 'fa-microchip' }, o));
  I('MCU-PT', {
    label: 'MCU Board', form: 'board', prefix: 'MCU', color: 0x0e7490,
    ports: [...seq('D', 0, 5, 'iot'), port('USB0', 'usb')],
    desc: 'บอร์ดไมโครคอนโทรลเลอร์ (คล้าย Arduino) ต่อเซนเซอร์ด้วยสาย IoT และอัปโหลดโปรแกรมผ่าน USB'
  });
  I('SBC-PT', {
    label: 'SBC Board', form: 'board', prefix: 'SBC', kind: 'host', color: 0x166534,
    ports: [port('Fa0', 'copper'), ...seq('D', 0, 3, 'iot'), port('USB0', 'usb')],
    desc: 'คอมพิวเตอร์บอร์ดเดี่ยว (คล้าย Raspberry Pi) มีพอร์ต LAN ต่อเครือข่ายได้'
  });
  I('IoT-LED', { label: 'LED', form: 'led', prefix: 'LED', icon: 'fa-lightbulb', color: 0xef4444, ports: [port('D0', 'iot')], desc: 'หลอด LED ควบคุมการเปิด/ปิดจากบอร์ด MCU' });
  I('IoT-Fan', { label: 'Fan', form: 'fan', prefix: 'Fan', icon: 'fa-fan', color: 0x94a3b8, ports: [port('D0', 'iot')], desc: 'พัดลมระบายความร้อน ควบคุมจากบอร์ด MCU' });
  I('IoT-Motion', { label: 'Motion Detector', form: 'sensor', prefix: 'Motion', icon: 'fa-person-walking', color: 0xf8fafc, ports: [port('D0', 'iot')], desc: 'เซนเซอร์ตรวจจับการเคลื่อนไหว ส่งสัญญาณให้บอร์ด MCU' });
  I('IoT-Smoke', { label: 'Smoke Detector', form: 'sensor', prefix: 'Smoke', icon: 'fa-smog', color: 0xfef3c7, ports: [port('D0', 'iot')], desc: 'เซนเซอร์ตรวจจับควันไฟในห้องเซิร์ฟเวอร์' });

  // ===== Room =====
  def('Server-Rack', {
    cat: 'room', kind: 'host', form: 'rackserver', label: 'Server Rack 42U', prefix: 'RACK', icon: 'fa-server', server: true, color: 0x111827,
    ports: [port('Fa0', 'copper')],
    desc: 'ตู้มาตรฐาน 19 นิ้วสำหรับติดตั้งเซิร์ฟเวอร์ เปิดบริการ DHCP / DNS / HTTP ได้จากแท็บคุณสมบัติ'
  });
  def('UPS', {
    cat: 'room', kind: 'passive', form: 'ups', label: 'UPS', prefix: 'UPS', icon: 'fa-bolt', color: 0x27272a,
    ports: [],
    desc: 'เครื่องสำรองไฟ จ่ายไฟให้เซิร์ฟเวอร์และอุปกรณ์เครือข่ายเมื่อไฟดับ (ไม่มีพอร์ตเครือข่าย)'
  });

  return { MEDIA, CABLES, CABLE_ORDER, CATEGORIES, MODELS, MODEL_ORDER };
});
