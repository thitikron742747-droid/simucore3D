/* ==========================================================================
   SimuCore Activities — ภารกิจตรวจคะแนนอัตโนมัติ (คล้าย Activity Wizard ของ Packet Tracer)
   --------------------------------------------------------------------------
   แต่ละบทเรียนมี
   - start(t)  : แก้แม่แบบห้องให้ "ยังไม่เสร็จ" (ถอดสาย ลบ IP ปิดบริการ ฯลฯ) ให้นักเรียนทำเอง
   - tasks     : งานย่อย มีคำใบ้ และฟังก์ชัน check(ctx) คืน true เมื่อทำสำเร็จ
   ctx (สร้างใน workspace.js) มีตัวช่วย:
     dev(id) iface(id, name) ip(id) link(a, b, pred) up(a, b, cable)
     inNet(ip, network, mask) ping(fromId, toIp) web(fromId, url) flag(name)
   ping / web ทดสอบในเครือข่าย "สำเนา" จึงไม่รบกวนแอนิเมชันที่กำลังเล่น
   อ้างอิงอุปกรณ์ด้วยรหัส (id) ตามแม่แบบ จึงเปลี่ยนชื่ออุปกรณ์ได้โดยการตรวจไม่เพี้ยน
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SimActivities = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const M24 = '255.255.255.0';
  const byId = (t, id) => t.devices.find(d => d.id === id);
  const dropLink = (t, a, b) => { t.links = t.links.filter(([x, y]) => !((x === a && y === b) || (x === b && y === a))); };
  const setIface = (d, name, v) => {
    d.ifaces = (d.ifaces || []).filter(f => f.name !== name);
    if (v) d.ifaces.push(Object.assign({ name }, v));
  };
  const wifiTo = (ctx, client, ap) => !!ctx.link(client, ap, l => l.cable === 'wireless');

  const ACTIVITIES = {
    network: {
      title: 'ภารกิจ LAB 01 — ติดตั้งห้องคอมพิวเตอร์',
      intro: 'ห้องนี้ยังติดตั้งไม่เสร็จ: PC-4 ยังไม่ได้เสียบสาย และ PC-2 ถึง PC-4 ยังไม่มี IP ทำให้ทุกเครื่องคุยกันได้',
      start(t) {
        [3, 4, 5].forEach(id => { byId(t, id).ifaces = []; });
        dropLink(t, 5, 1);
      },
      tasks: [
        { title: 'ต่อสาย PC-4 เข้ากับ SW-1 ให้ไฟลิงก์เป็นสีเขียว', hint: 'PC กับ Switch เป็นอุปกรณ์ต่างชนิดกัน ใช้ Copper Straight-Through (หรือเลือก Automatically Choose)', check: c => c.up(5, 1) },
        {
          title: 'ตั้ง IP ให้ PC-2, PC-3, PC-4 อยู่วง 192.168.1.0/24 ไม่ซ้ำกับเครื่องอื่น',
          hint: 'เช่น 192.168.1.11, .12, .13 และ Subnet Mask 255.255.255.0 (คลิกที่เครื่อง → แท็บคุณสมบัติ)',
          check: c => [3, 4, 5].every(id => {
            const f = c.iface(id, 'Fa0');
            return f && c.inNet(f.ip, '192.168.1.0') && f.mask === M24 && c.countIp(f.ip) === 1;
          })
        },
        { title: 'ตั้ง IP จัดการของ SW-1 (Vlan1) เป็น 192.168.1.2', hint: 'คลิก SW-1 → ส่วน "Vlan1 — IP สำหรับจัดการสวิตช์"', check: c => { const f = c.iface(1, 'Vlan1'); return f && f.ip === '192.168.1.2' && f.mask === M24; } },
        { title: 'PC-1 ping PC-4 สำเร็จ', hint: 'เลือก PC-1 ที่แท็บ Console แล้วพิมพ์ ping ตามด้วย IP ของ PC-4', check: c => c.ping(2, c.ip(5)) },
        { title: 'PC-3 ping เครื่องพิมพ์ (192.168.1.50) สำเร็จ', hint: 'ถ้ายังไม่ได้ ตรวจว่า IP ของ PC-3 อยู่วงเดียวกับเครื่องพิมพ์', check: c => c.ping(4, '192.168.1.50') },
        { title: 'PC-2 ping สวิตช์ SW-1 (192.168.1.2) สำเร็จ', hint: 'สวิตช์จะตอบ ping ได้เมื่อตั้ง IP ที่ Vlan1 แล้วเท่านั้น', check: c => c.ping(3, '192.168.1.2') }
      ]
    },

    datacenter: {
      title: 'ภารกิจ LAB 02 — เปิดใช้งานศูนย์ข้อมูล',
      intro: 'ศูนย์ข้อมูลยังเปิดใช้งานไม่ได้: Core Router ยังไม่ได้ต่อ Fiber, DHCP Server ยังปิด และโน้ตบุ๊กช่างยังไม่ได้ต่อ Wi-Fi',
      start(t) {
        dropLink(t, 1, 2);
        byId(t, 3).services.dhcp.enabled = false;
        setIface(byId(t, 8), 'Fa0', null);
        setIface(byId(t, 10), 'Wireless0', { dhcp: true, ssid: '', key: '' });
      },
      tasks: [
        { title: 'ต่อ R-Core กับ SW-Core ด้วยสาย Fiber', hint: 'เลือกสาย Fiber จากหมวด Connections แล้วคลิก R-Core (พอร์ต Gi0/0/2) และ SW-Core (พอร์ต Gi1/1/x)', check: c => c.up(1, 2, 'fiber') },
        { title: 'เปิดบริการ DHCP บน RACK-A ให้แจก IP วง 10.0.0.0/24 และ Gateway 10.0.0.1', hint: 'คลิก RACK-A → บริการ DHCP: ติ๊กเปิด, IP เริ่มต้น 10.0.0.100, Gateway 10.0.0.1, DNS 10.0.0.20', check: c => { const s = c.dev(3).services.dhcp; return s.enabled && c.inNet(s.start, '10.0.0.0') && s.gw === '10.0.0.1'; } },
        { title: 'PC-DHCP ได้ IP อัตโนมัติจาก DHCP Server', hint: 'คลิก PC-DHCP ติ๊ก "รับ IP อัตโนมัติจาก DHCP" แล้วกด "ขอ IP จาก DHCP ตอนนี้" (หรือกดรันระบบ)', check: c => { const f = c.iface(8, 'Fa0'); return f && f.dhcp && c.inNet(f.ip, '10.0.0.0'); } },
        { title: 'Laptop-Tech เชื่อม Wi-Fi "DC-Staff" ได้', hint: 'คลิก Laptop-Tech → Wireless0 ใส่ SSID DC-Staff และรหัสผ่าน dc12345678 (ดูค่าได้ที่ AP-1)', check: c => wifiTo(c, 10, 9) },
        { title: 'Laptop-Tech เปิดเว็บ portal.school.local ได้', hint: 'Laptop ต้องได้ IP จาก DHCP ก่อน (ขอ IP ใหม่) แล้วกด "ทดสอบเว็บ"', check: c => c.web(10, 'portal.school.local') },
        { title: 'เข้า CLI ของ SW-Core ผ่านสาย Console จาก PC-Admin', hint: 'คลิก PC-Admin แล้วกดปุ่ม Terminal (หรือพิมพ์ terminal ที่ Console ของ PC-Admin)', check: c => c.flag('terminal:2') }
      ]
    },

    portal: {
      title: 'ภารกิจ LAB 03 — เปิดเว็บพอร์ทัลโรงเรียน',
      intro: 'ผู้ใช้เปิดเว็บโรงเรียนไม่ได้: Router ยังตั้งค่าฝั่งเซิร์ฟเวอร์ไม่ครบ, PC-1 ยังไม่มี Gateway/DNS และเว็บเซิร์ฟเวอร์ยังปิดอยู่',
      start(t) {
        setIface(byId(t, 1), 'Gi0/1', null);
        Object.assign(byId(t, 4), { gw: '', dns: '' });
        byId(t, 6).services.http.enabled = false;
      },
      tasks: [
        { title: 'ตั้ง IP ให้ R-1 พอร์ต Gi0/1 เป็น 192.168.2.1/24', hint: 'IP นี้คือ Default Gateway ของวงเซิร์ฟเวอร์ 192.168.2.0/24', check: c => { const f = c.iface(1, 'Gi0/1'); return f && f.ip === '192.168.2.1' && f.mask === M24; } },
        { title: 'ตั้ง Default Gateway ของ PC-1 เป็น 192.168.1.1', hint: 'Gateway ต้องเป็น IP ของพอร์ต Router ที่อยู่วงเดียวกับ PC', check: c => c.dev(4).gw === '192.168.1.1' },
        { title: 'ตั้ง DNS Server ของ PC-1 เป็น 192.168.2.100', hint: 'เครื่อง WEB-1 เปิดบริการ DNS ไว้', check: c => c.dev(4).dns === '192.168.2.100' },
        { title: 'เปิดบริการ HTTP บน WEB-1', hint: 'คลิก WEB-1 → บริการ HTTP → ติ๊กเปิด', check: c => c.dev(6).services.http.enabled },
        { title: 'PC-1 เปิด http://www.school.local ได้', hint: 'กด "ทดสอบเว็บ" เลือกเครื่อง PC-1 — ต้องผ่าน DNS → TCP → HTTP ครบ', check: c => c.web(4, 'www.school.local') },
        { title: 'Laptop-1 ping WEB-1 ข้ามวงเครือข่ายสำเร็จ', hint: 'ลอง tracert 192.168.2.100 ดูว่าผ่าน Router กี่ Hop', check: c => c.ping(5, '192.168.2.100') }
      ]
    },

    panorama: {
      title: 'ภารกิจ LAB 04 — เดินสำรวจห้องเซิร์ฟเวอร์',
      intro: 'สลับเป็นโหมดเดินสำรวจ 360° แล้วคลิกที่อุปกรณ์เพื่ออ่านคำอธิบายให้ครบ',
      start() {},
      tasks: [
        { title: 'เข้าโหมดเดินสำรวจ 360°', hint: 'กดปุ่ม "เดินสำรวจ 360°" ด้านบน', check: c => c.flag('tour') },
        { title: 'ศึกษา Core Router (R-Core)', hint: 'คลิกวงแหวนบนพื้นเพื่อเดินเข้าใกล้ แล้วคลิกที่อุปกรณ์', check: c => c.flag('viewed:1') },
        { title: 'ศึกษา Core Switch (SW-Core)', hint: 'อยู่ติดผนังด้านหลังข้าง R-Core', check: c => c.flag('viewed:2') },
        { title: 'ศึกษาตู้ Server Rack (RACK-A)', hint: 'ตู้สีดำสูงแถวหลัง', check: c => c.flag('viewed:3') },
        { title: 'ศึกษาเครื่องสำรองไฟ (UPS-1)', hint: 'อยู่มุมขวาด้านหลัง', check: c => c.flag('viewed:6') },
        { title: 'ศึกษา Access Point (AP-1)', hint: 'อุปกรณ์ทรงจานบนเสา', check: c => c.flag('viewed:9') },
        { title: 'ศึกษาเซิร์ฟเวอร์เว็บและ DNS (WEB-DNS)', hint: 'อยู่แถวหลังระหว่าง RACK-B กับ UPS', check: c => c.flag('viewed:5') }
      ]
    },

    wireless: {
      title: 'ภารกิจ LAB 05 — ติดตั้งอินเทอร์เน็ตบ้าน',
      intro: 'บ้านนี้ยังใช้อินเทอร์เน็ตไม่ได้: Cable Modem ยังไม่ได้ต่อเข้า Router, Smartphone ใส่รหัส Wi-Fi ผิด และ Tablet ยังไม่ได้ตั้ง Wi-Fi',
      start(t) {
        dropLink(t, 6, 7);
        setIface(byId(t, 11), 'Wireless0', { dhcp: true, ssid: '', key: '' });
      },
      tasks: [
        { title: 'ต่อ Cable-Modem เข้ากับพอร์ต Internet ของ Home-Router', hint: 'พอร์ต Port1 ของโมเด็ม → พอร์ต Internet (ไม่ใช่ Ethernet 1-4)', check: c => { const l = c.link(6, 7); if (!l || !l.up) return false; const end = l.a.dev === 7 ? l.a : l.b; return c.dev(7).ports[end.port].name === 'Internet'; } },
        { title: 'Home-Router ได้ IP จากผู้ให้บริการ (ISP) ที่พอร์ต Internet', hint: 'คลิก Home-Router → กด "ขอ IP จาก ISP ตอนนี้" หรือกดรันระบบ', check: c => { const f = c.iface(7, 'Internet'); return f && c.inNet(f.ip, '100.64.0.0'); } },
        { title: 'Smartphone เชื่อม Wi-Fi "HomeWiFi" ได้', hint: 'รหัสผ่านที่ถูกต้องดูได้ที่ Home-Router (ส่วน Wi-Fi)', check: c => wifiTo(c, 10, 7) },
        { title: 'Tablet เชื่อม Wi-Fi "HomeWiFi" ได้', hint: 'ใส่ทั้ง SSID และรหัสผ่านให้ตรงกับ Home-Router', check: c => wifiTo(c, 11, 7) },
        { title: 'Smartphone เปิด www.isp.net ได้ (ผ่าน NAT)', hint: 'Smartphone ต้องได้ IP จาก Home-Router ก่อน (กดรันระบบ) แล้วกด "ทดสอบเว็บ"', check: c => c.web(10, 'www.isp.net') },
        { title: 'พิสูจน์ว่า ISP-Web ping เข้ามาหา PC-Home ไม่ได้ (NAT ป้องกันไว้)', hint: 'PC-Home ต้องได้ IP ก่อน ข้อนี้ผ่านเมื่อ ping จากภายนอกเข้ามา "ไม่สำเร็จ"', check: c => c.inNet(c.ip(8), '192.168.0.0') && !c.ping(1, c.ip(8)) }
      ]
    },

    wan: {
      title: 'ภารกิจ LAB 06 — เชื่อมสำนักงานใหญ่กับสาขา',
      intro: 'สาขายังติดต่อสำนักงานใหญ่ไม่ได้: R2 ยังไม่มีพอร์ต Serial, ยังไม่ได้เดินสาย WAN และยังไม่มีเส้นทางกลับ',
      start(t) {
        const r1 = byId(t, 1), r2 = byId(t, 2);
        r1.clocks = {};
        r2.modules = [];
        r2.routes = [];
        setIface(r2, 'Se0/0/0', null);
        dropLink(t, 1, 2);
      },
      tasks: [
        { title: 'ติดตั้งโมดูล HWIC-2T ที่ R2', hint: 'คลิก R2 → โมดูลเสริม (Physical) → ติ๊ก HWIC-2T', check: c => c.dev(2).modules.includes('HWIC-2T') },
        { title: 'เดินสาย Serial ระหว่าง R1 กับ R2 โดยให้ R1 เป็นฝั่ง DCE', hint: 'เลือก Serial DCE แล้วคลิก R1 ก่อน (อุปกรณ์แรก = DCE) จากนั้นคลิก R2', check: c => { const l = c.link(1, 2, x => x.cable === 'serialDCE' || x.cable === 'serialDTE'); return !!l && c.net.dceEnd(l).dev === 1; } },
        { title: 'ตั้ง Clock Rate ฝั่ง DCE ให้ลิงก์ Serial เป็นสีเขียว', hint: 'คลิก R1 → ส่วน Se0/0/0 → Clock Rate เช่น 64000', check: c => { const l = c.link(1, 2, x => x.cable === 'serialDCE' || x.cable === 'serialDTE'); return !!l && l.up; } },
        { title: 'ตั้ง IP ของ R2 พอร์ต Serial เป็น 10.0.0.2 / 255.255.255.252', hint: 'ต้องอยู่วงเดียวกับ R1 (10.0.0.1/30) ซึ่งมี IP ใช้ได้แค่ 2 ตัว', check: c => { const d = c.dev(2), l = c.link(1, 2, x => x.cable === 'serialDCE' || x.cable === 'serialDTE'); if (!l) return false; const end = l.a.dev === 2 ? l.a : l.b; const f = d.ifaces.find(x => x.ports.includes(end.port)); return f && f.ip === '10.0.0.2' && f.mask === '255.255.255.252'; } },
        { title: 'เพิ่ม Static Route ที่ R2 ไปวง 192.168.10.0/24 ผ่าน 10.0.0.1', hint: 'คลิก R2 → Static Route พิมพ์ "192.168.10.0 255.255.255.0 10.0.0.1" หรือพิมพ์คำสั่ง ip route ที่ Console', check: c => c.dev(2).routes.some(r => r.via === '10.0.0.1' && ((r.net === '192.168.10.0' && r.mask === M24) || r.net === '0.0.0.0')) || c.dev(2).gw === '10.0.0.1' },
        { title: 'PC-A ping PC-B ข้ามสาย WAN สำเร็จ', hint: 'ถ้ายังไม่ได้ ใช้ tracert ดูว่าแพ็กเก็ตหยุดที่ไหน', check: c => c.ping(5, '192.168.20.10') },
        { title: 'เข้า CLI ของ R1 ผ่านสาย Console จาก Laptop-Admin', hint: 'คลิก Laptop-Admin แล้วกดปุ่ม Terminal จากนั้นลองพิมพ์ show controllers serial', check: c => c.flag('terminal:1') }
      ]
    }
  };

  return { ACTIVITIES };
});
