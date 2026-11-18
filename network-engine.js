/* ==========================================================================
   SimuCore Network Engine v4 — "ระบบหลังบ้าน" จำลองการทำงานแบบ Cisco Packet Tracer
   --------------------------------------------------------------------------
   ไฟล์นี้ไม่มีโค้ด 3D หรือ DOM เป็นตัวจำลองเครือข่ายล้วน ๆ (ทดสอบด้วย Node ได้)
   ข้อมูลรุ่นอุปกรณ์/สายอยู่ใน device-catalog.js

   สิ่งที่จำลอง
   - Layer 1 : สายตรง / ไขว้ / Fiber / Serial DCE-DTE / Console / Octal / Phone /
               Coaxial / USB / IoT และ Wi-Fi (SSID + รหัสผ่าน)
               Hub / Repeater / Modem / Cloud ทวนสัญญาณ (ไม่ดู MAC)
   - Layer 2 : Ethernet, ARP, Switch เรียนรู้ MAC, HDLC บนสาย Serial
   - Layer 3 : IPv4, Subnet, Default Gateway, Router + Static Route, TTL, ICMP,
               NAT (PAT) บน Wireless Router / ไฟร์วอลล์ / Router
   - Layer 4 : UDP, TCP 3-way handshake
   - Layer 7 : DNS, HTTP, DHCP (บน Server, Router, Wireless Router, ASA)
   - CLI     : ping, tracert, ipconfig, arp, nslookup, show ... (รายอุปกรณ์)

   หลักการ: แต่ละอุปกรณ์มี "พอร์ต" (ของจริงที่เสียบสาย) และ "อินเทอร์เฟซ" (ที่ตั้ง IP)
   - PC / Router : 1 พอร์ต = 1 อินเทอร์เฟซ
   - Switch      : ทุกพอร์ตรวมเป็น Vlan1 (สลับเฟรมด้วย MAC Table)
   - WRT300N/ASA : พอร์ต Internet/outside 1 อินเทอร์เฟซ + พอร์ต LAN/inside รวมเป็นสวิตช์ในตัว
   ทำงานเป็น "จังหวะ (tick)" เหมือน Simulation Mode: เรียก net.step() 1 ครั้ง =
   เฟรมทุกเฟรมที่อยู่บนสายเดินทางไปถึงอุปกรณ์ถัดไป 1 ช่วง
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./device-catalog.js'));
  else root.NetSim = factory(root.NetCatalog);
})(typeof self !== 'undefined' ? self : this, function (CAT) {
  'use strict';

  const { MODELS, CABLES, MEDIA } = CAT;
  const BROADCAST_MAC = 'FF:FF:FF:FF:FF:FF';
  const BROADCAST_IP = '255.255.255.255';
  const HDLC = 'HDLC';

  const ROUTERS = new Set(['router', 'gateway']);          // ส่งต่อแพ็กเก็ตข้ามวงได้
  const L3 = new Set(['host', 'router', 'gateway', 'switch']);
  const DATA = new Set(['copper', 'fiber', 'serial', 'wlan', 'radio']);
  const AUTO_ORDER = [
    ['copper', 'copper'], ['fiber', 'fiber'], ['serial', 'serial'],
    ['rs232', 'console'], ['console', 'rs232'], ['async', 'console'], ['console', 'async'],
    ['phone', 'phone'], ['coax', 'coax'], ['usb', 'usb'], ['iot', 'iot']
  ];
  // รูปแบบข้อมูลจากเวอร์ชันก่อน (v3) → รุ่นอุปกรณ์ใหม่
  const LEGACY = { pc_desk: 'PC-PT', web_server: 'Server-PT', server_rack: 'Server-Rack', switch: '2960-24TT', router: '2911', ups: 'UPS' };

  /* ---------------------------- ตัวช่วยเรื่อง IP ---------------------------- */
  function isIp(s) {
    if (typeof s !== 'string') return false;
    const m = s.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    return !!m && m.slice(1).every(o => Number(o) <= 255);
  }
  function ipToInt(s) { return s.trim().split('.').reduce((a, o) => ((a * 256) + Number(o)) >>> 0, 0) >>> 0; }
  function intToIp(n) { return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); }
  function isMask(s) {
    if (!isIp(s)) return false;
    const inv = (~ipToInt(s)) >>> 0;
    return ((inv & (inv + 1)) >>> 0) === 0;
  }
  function maskBits(s) { let n = ipToInt(s), c = 0; while (n) { c += n & 1; n >>>= 1; } return c; }
  function netInt(ip, mask) { return (ipToInt(ip) & ipToInt(mask)) >>> 0; }
  function sameNet(a, b, mask) { return netInt(a, mask) === netInt(b, mask); }
  function netAddr(ip, mask) { return intToIp(netInt(ip, mask)); }
  function bcastAddr(ip, mask) { return intToIp((netInt(ip, mask) | (~ipToInt(mask))) >>> 0); }
  function hex2(n) { return (n & 255).toString(16).toUpperCase().padStart(2, '0'); }
  const clone = o => JSON.parse(JSON.stringify(o || {}));

  /* ------------------------------ ตัวช่วยเรื่องสาย ------------------------------ */
  function mediaFits(cable, ma, mb) {
    return CABLES[cable].media.some(([x, y]) => (x === ma && y === mb) || (x === mb && y === ma));
  }
  function copperCable(pa, pb) {
    if (pa.autoMdix || pb.autoMdix) return 'straight';
    return !!pa.mdix === !!pb.mdix ? 'cross' : 'straight';
  }
  function cableFor(pa, pb) {
    const m = pa.media;
    if (m === 'copper') return copperCable(pa, pb);
    if (m === 'console') return pb.media === 'async' ? 'octal' : 'console';
    return { fiber: 'fiber', serial: 'serialDCE', rs232: 'console', async: 'octal', phone: 'phone', coax: 'coax', usb: 'usb', iot: 'iot', wlan: 'wireless', radio: 'wireless' }[m];
  }

  /* ------------------------- อธิบายเฟรม (PDU Info) ------------------------- */
  const ICMP_NAMES = {
    'echo-request': 'Echo Request (ping)',
    'echo-reply': 'Echo Reply (ตอบ ping)',
    'dest-unreachable': 'Destination Unreachable',
    'ttl-exceeded': 'Time Exceeded (TTL หมด)'
  };
  // ความยาวสายสูงสุดตามมาตรฐาน (เมตร) — เกินแล้วลิงก์ไม่ขึ้น
  const MAX_LEN = { straight: 100, cross: 100, fiber: 2000, coax: 500, console: 15, octal: 15, usb: 5, iot: 10 };
  const WIFI_RANGE = 46;      // ระยะสัญญาณ Wi-Fi ที่โล่ง ไม่มีผนังกั้น (เมตร) ≈ จุดที่สัญญาณเหลือ -80 dBm
  const WIFI_MIN = -80;       // สัญญาณต่ำกว่านี้เชื่อมต่อไม่ได้ (dBm)
  // เส้นตรง (ax,az)→(bx,bz) ตัดผ่านผนัง [x1,z1,x2,z2] หรือไม่
  function crosses(ax, az, bx, bz, w) {
    const [x1, z1, x2, z2] = w;
    const d = (bx - ax) * (z2 - z1) - (bz - az) * (x2 - x1);
    if (Math.abs(d) < 1e-9) return false;
    const t = ((x1 - ax) * (z2 - z1) - (z1 - az) * (x2 - x1)) / d;
    const u = ((x1 - ax) * (bz - az) - (z1 - az) * (bx - ax)) / d;
    return t > 1e-6 && t < 1 - 1e-6 && u >= 0 && u <= 1;
  }
  const isFlood = f => !!(f && f.pkt && f.pkt.data && f.pkt.data.flood);
  function protoOf(f) {
    if (f.type === 'ARP') return 'ARP';
    if (isFlood(f)) return 'DDoS';
    if (f.pkt.proto === 'ICMP') return 'ICMP';
    return f.pkt.data.app || f.pkt.proto;
  }
  function describe(f) {
    const layers = [];
    let summary;
    layers.push(f.srcMac === HDLC
      ? { layer: 'Layer 2 · Data Link', text: 'HDLC — สาย Serial แบบจุดต่อจุด (Point-to-Point) ไม่ต้องใช้ MAC Address' }
      : { layer: 'Layer 2 · Data Link', text: `Ethernet II  ${f.srcMac} → ${f.dstMac}${f.dstMac === BROADCAST_MAC ? ' (Broadcast)' : ''}` });
    if (f.type === 'ARP') {
      const a = f.arp;
      summary = a.op === 'request' ? 'ARP Request' : 'ARP Reply';
      layers.push({
        layer: 'ARP',
        text: a.op === 'request' ? `ถามว่า "ใครใช้ IP ${a.tpa}? ช่วยบอก ${a.spa} หน่อย"` : `ตอบว่า "IP ${a.spa} อยู่ที่ MAC ${a.sha}"`
      });
    } else {
      const p = f.pkt, d = p.data;
      layers.push({ layer: 'Layer 3 · Network', text: `IPv4  ${p.src} → ${p.dst}   TTL=${p.ttl}` });
      if (p.proto === 'ICMP') {
        summary = (d.flood ? 'Ping Flood ' : 'ICMP ') + ICMP_NAMES[d.type].split(' (')[0];
        layers.push({ layer: 'ICMP', text: `${ICMP_NAMES[d.type]}  id=${d.id} seq=${d.seq}${d.flood ? '  ⚠ แพ็กเก็ตโจมตี (DDoS)' : ''}` });
      } else {
        layers.push({ layer: 'Layer 4 · Transport', text: `${p.proto}  พอร์ต ${d.sport} → ${d.dport}${d.flags ? '   Flags: ' + d.flags : ''}` });
        summary = p.proto + (d.flags ? ' ' + d.flags : '');
        if (d.app === 'DNS') {
          const m = d.msg;
          summary = m.qr === 'query' ? 'DNS Query' : 'DNS Response';
          layers.push({ layer: 'Layer 7 · DNS', text: m.qr === 'query' ? `ถามหา IP ของชื่อ "${m.name}"` : (m.ip ? `"${m.name}" คือ ${m.ip}` : `ไม่พบชื่อ "${m.name}" (NXDOMAIN)`) });
        } else if (d.app === 'DHCP') {
          const m = d.msg;
          summary = 'DHCP ' + m.op;
          layers.push({ layer: 'Layer 7 · DHCP', text: m.op + (m.yiaddr ? `  แจก IP ${m.yiaddr} / ${m.mask}  Gateway ${m.gw || '-'}` : `  จากเครื่อง ${m.chaddr}`) });
        } else if (d.app === 'HTTP') {
          const m = d.msg;
          summary = m.method ? `HTTP ${m.method}` : `HTTP ${m.status}`;
          layers.push({ layer: 'Layer 7 · HTTP', text: m.method ? `${m.method} ${m.path} HTTP/1.1  (Host: ${m.host})` : `HTTP/1.1 ${m.status} ${m.statusText}` });
        }
      }
    }
    return { proto: protoOf(f), summary, layers };
  }

  /* =======================================================================
     งาน (Job) = สิ่งที่ผู้ใช้สั่งให้อุปกรณ์ทำ เช่น ping / เปิดเว็บ / ขอ DHCP
     ======================================================================= */
  class Job {
    constructor(net, dev, out) {
      this.net = net; this.dev = dev;
      this.out = out || function () {};
      this.started = false; this.done = false; this.result = null;
    }
    finish(result) { this.done = true; this.result = result; if (this.onDone) this.onDone(result); }
    onPacket() {}
  }

  class PingJob extends Job {
    constructor(net, dev, dst, count, out) { super(net, dev, out); this.dst = dst; this.count = count || 4; this.seq = 0; this.rx = 0; }
    start() {
      this.id = this.net._icmpId++;
      this.out(`Pinging ${this.dst} with 32 bytes of data:`);
      this._send();
    }
    _send() {
      this.seq++;
      this.sentTick = this.net.tick;
      if (this.dev.ifaces.some(f => f.ip === this.dst) || this.dst.startsWith('127.')) {
        this.rx++; this.waiting = false;
        this.out(`Reply from ${this.dst}: bytes=32 time<1ms TTL=128`, 'ok');
        return;
      }
      this.waiting = true;
      const r = this.net._l3Send(this.dev, {
        dst: this.dst, ttl: ROUTERS.has(this.dev.kind) ? 255 : 128, proto: 'ICMP',
        data: { type: 'echo-request', id: this.id, seq: this.seq }
      });
      if (!r.ok) { this.waiting = false; this.out('Destination host unreachable. ' + r.hint, 'err'); }
    }
    onPacket(pkt) {
      if (pkt.proto !== 'ICMP' || !this.waiting) return;
      const d = pkt.data;
      if (d.id !== this.id || d.seq !== this.seq) return;
      this.waiting = false;
      if (d.type === 'echo-reply') {
        this.rx++;
        this.out(`Reply from ${pkt.src}: bytes=32 time=${this.net.tick - this.sentTick}ms TTL=${pkt.ttl}`, 'ok');
      } else if (d.type === 'dest-unreachable') this.out(`Reply from ${pkt.src}: Destination host unreachable.`, 'err');
      else this.out(`Reply from ${pkt.src}: TTL expired in transit.`, 'err');
    }
    onIdle() {
      if (this.waiting) { this.waiting = false; this.out('Request timed out.', 'err'); }
      if (this.seq < this.count) return this._send();
      const lost = this.count - this.rx;
      this.out(`Ping statistics for ${this.dst}:`);
      this.out(`    Packets: Sent = ${this.count}, Received = ${this.rx}, Lost = ${lost} (${Math.round(lost * 100 / this.count)}% loss)`);
      this.finish({ ok: this.rx > 0, sent: this.count, received: this.rx });
    }
  }

  class TraceJob extends Job {
    constructor(net, dev, dst, out) { super(net, dev, out); this.dst = dst; this.ttl = 0; this.timeouts = 0; }
    start() {
      this.id = this.net._icmpId++;
      this.out(`Tracing route to ${this.dst} over a maximum of 30 hops:`);
      this._next();
    }
    _next() {
      this.ttl++; this.got = null; this.sentTick = this.net.tick;
      const r = this.net._l3Send(this.dev, { dst: this.dst, ttl: this.ttl, proto: 'ICMP', data: { type: 'echo-request', id: this.id, seq: this.ttl } });
      if (!r.ok) { this.out('Destination host unreachable. ' + r.hint, 'err'); this.failed = true; }
    }
    onPacket(pkt) {
      if (pkt.proto === 'ICMP' && pkt.data.id === this.id && pkt.data.seq === this.ttl) { this.got = pkt; this.gotTick = this.net.tick; }
    }
    onIdle() {
      if (this.failed) return this.finish({ ok: false });
      const n = String(this.ttl).padStart(3, ' ');
      if (!this.got) {
        this.out(`${n}     *        Request timed out.`, 'err');
        if (++this.timeouts >= 2 || this.ttl >= 30) return this.finish({ ok: false });
        return this._next();
      }
      this.timeouts = 0;
      const type = this.got.data.type;
      this.out(`${n}     ${this.gotTick - this.sentTick} ms     ${this.got.src}`, type === 'dest-unreachable' ? 'err' : 'ok');
      if (type === 'echo-reply') { this.out('Trace complete.'); return this.finish({ ok: true, hops: this.ttl }); }
      if (type === 'dest-unreachable') { this.out('Destination host unreachable.', 'err'); return this.finish({ ok: false }); }
      if (this.ttl >= 30) return this.finish({ ok: false });
      this._next();
    }
  }

  // เปิดเว็บ (DNS → TCP 3-way handshake → HTTP GET) หรือ nslookup อย่างเดียว (dnsOnly)
  class WebJob extends Job {
    constructor(net, dev, target, out, dnsOnly) {
      super(net, dev, out);
      const clean = String(target).trim().replace(/^https?:\/\//i, '');
      const cut = clean.indexOf('/');
      this.host = (cut < 0 ? clean : clean.slice(0, cut)).toLowerCase();
      this.path = cut < 0 ? '/' : clean.slice(cut);
      this.dnsOnly = !!dnsOnly;
      this.sport = net._ephemeral++;
    }
    _fail(error) { this.phase = 'failed'; this.error = error; }
    _send(pkt) { const r = this.net._l3Send(this.dev, pkt); if (!r.ok) this._fail('Destination host unreachable. ' + r.hint); }
    start() {
      if (isIp(this.host) && !this.dnsOnly) { this.ip = this.host; return this._connect(); }
      if (!isIp(this.dev.dns)) return this._fail('ยังไม่ได้ตั้งค่า DNS Server ที่เครื่องนี้ จึงแปลงชื่อ "' + this.host + '" เป็น IP ไม่ได้');
      this.phase = 'dns';
      this._send({ dst: this.dev.dns, ttl: 128, proto: 'UDP', data: { sport: this.sport, dport: 53, app: 'DNS', msg: { qr: 'query', name: this.host } } });
    }
    _connect() {
      this.phase = 'syn';
      this._send({ dst: this.ip, ttl: 128, proto: 'TCP', data: { sport: this.sport, dport: 80, flags: 'SYN' } });
    }
    onPacket(pkt) {
      const d = pkt.data;
      if (this.phase === 'dns' && d.app === 'DNS' && d.msg.qr === 'response') {
        if (d.msg.ip) { this.ip = d.msg.ip; this.phase = 'resolved'; } else this._fail(`DNS ไม่พบชื่อ "${this.host}" (NXDOMAIN)`);
      } else if (this.phase === 'syn' && pkt.proto === 'TCP' && pkt.src === this.ip) {
        if (d.flags === 'SYN+ACK') {
          this.phase = 'ack';
          this._send({ dst: this.ip, ttl: 128, proto: 'TCP', data: { sport: this.sport, dport: 80, flags: 'ACK' } });
        } else if (d.flags === 'RST') this._fail('Connection refused — เครื่องปลายทางไม่ได้เปิดบริการ HTTP (พอร์ต 80)');
      } else if (this.phase === 'get' && d.app === 'HTTP') {
        this.response = d.msg; this.phase = 'done';
      }
    }
    onIdle() {
      switch (this.phase) {
        case 'resolved':
          this.out(`DNS: ${this.host} → ${this.ip}`, 'ok');
          if (this.dnsOnly) return this.finish({ ok: true, ip: this.ip });
          return this._connect();
        case 'ack':
          this.phase = 'get';
          return this._send({ dst: this.ip, ttl: 128, proto: 'TCP', data: { sport: this.sport, dport: 80, flags: 'PSH+ACK', app: 'HTTP', msg: { method: 'GET', path: this.path, host: this.host } } });
        case 'done':
          this.out(`HTTP/1.1 ${this.response.status} ${this.response.statusText}  (จาก ${this.ip})`, 'ok');
          return this.finish({ ok: true, ip: this.ip, host: this.host, path: this.path, response: this.response });
        case 'failed':
          this.out(this.error, 'err');
          return this.finish({ ok: false, error: this.error, host: this.host });
        default: {
          const msg = this.phase === 'dns' ? 'DNS request timed out — ติดต่อ DNS Server ไม่ได้'
            : 'Request timed out — ติดต่อเซิร์ฟเวอร์ ' + (this.ip || this.host) + ' ไม่ได้';
          this.out(msg, 'err');
          return this.finish({ ok: false, error: msg, host: this.host });
        }
      }
    }
  }

  class DhcpJob extends Job {
    constructor(net, dev, fi, out) { super(net, dev, out); this.fi = fi; }
    start() {
      const f = this.dev.ifaces[this.fi];
      if (!f) { this.out('อุปกรณ์นี้ไม่มีอินเทอร์เฟซที่ขอ IP ได้', 'err'); this.phase = 'none'; return; }
      this.xid = this.net._icmpId++;
      f.ip = ''; f.mask = '';
      if (!this.net.ifaceUp(this.dev, this.fi)) { this.phase = 'down'; return; }
      this.phase = 'discover';
      this.out(`${f.name}: กำลังขอ IP Address จาก DHCP Server (DISCOVER)...`);
      this._bcast('DISCOVER');
    }
    _bcast(op) {
      const f = this.dev.ifaces[this.fi];
      const msg = { op, xid: this.xid, chaddr: f.mac };
      if (op === 'REQUEST') { msg.requested = this.offer.yiaddr; msg.server = this.offer.server; }
      this.net._ifaceTx(this.dev, this.fi, {
        srcMac: f.mac, dstMac: BROADCAST_MAC, type: 'IPv4',
        pkt: { src: '0.0.0.0', dst: BROADCAST_IP, ttl: 128, proto: 'UDP', data: { sport: 68, dport: 67, app: 'DHCP', msg } }
      });
    }
    onPacket(pkt) {
      const m = pkt.data.msg;
      if (!m || m.xid !== this.xid) return;
      if (m.op === 'OFFER' && this.phase === 'discover') { this.offer = m; this.phase = 'offered'; }
      else if (m.op === 'ACK' && this.phase === 'request') {
        const dev = this.dev, f = dev.ifaces[this.fi];
        f.ip = m.yiaddr; f.mask = m.mask;
        dev.gw = m.gw || ''; dev.dns = m.dns || '';
        // Wireless Router / ASA: ส่งต่อ DNS ที่ได้จาก ISP ให้เครื่องในบ้าน
        if (dev.kind === 'gateway' && dev.services && dev.services.dhcp && !dev.services.dhcp.dns) dev.services.dhcp.dns = m.dns || '';
        this.phase = 'done';
      }
    }
    onIdle() {
      const f = this.dev.ifaces[this.fi];
      if (this.phase === 'none') return this.finish({ ok: false });
      if (this.phase === 'down') {
        this.out(`DHCP request failed. — ${f.name} ยังไม่ได้เชื่อมต่อ (ตรวจสาย / SSID Wi-Fi)`, 'err');
        return this.finish({ ok: false });
      }
      if (this.phase === 'offered') { this.phase = 'request'; return this._bcast('REQUEST'); }
      if (this.phase === 'done') {
        this.out(`DHCP request successful.  ${f.name}: IP ${f.ip}  Mask ${f.mask}  Gateway ${this.dev.gw || '-'}  DNS ${this.dev.dns || '-'}`, 'ok');
        return this.finish({ ok: true, ip: f.ip });
      }
      this.out('DHCP request failed. — ไม่พบ DHCP Server ในวงเครือข่ายนี้', 'err');
      this.finish({ ok: false });
    }
  }

  /* =======================================================================
     Network : ตัวเครือข่ายทั้งหมด
     ======================================================================= */
  class Network {
    constructor() {
      this.devices = new Map();
      this.links = new Map();
      this.wire = [];
      this._next = [];
      this.jobs = [];
      this.tick = 0;
      this._events = [];
      this._linkId = 1; this._icmpId = 1; this._ephemeral = 49152;
      this._busyTicks = 0;
      this.scale = 1;            // 1 หน่วยในฉาก 3D = กี่เมตร (วิทยาเขตแบบย่อส่วนใช้ 4)
      this.walls = [];           // ผนังในฉาก [x1,z1,x2,z2,ลดสัญญาณ dB] ใช้คำนวณ Wi-Fi
      this.stp = false;          // Spanning Tree (แบบย่อ): บล็อกสายที่ทำให้เกิดลูประหว่างสวิตช์
      this.flood = null;         // ตัวสร้าง Ping Flood (จำลอง DDoS)
      this.floodStats = null;
    }

    /* ---------------------------- สร้างอุปกรณ์ ---------------------------- */
    addDevice(cfg) {
      const modelId = cfg.model || LEGACY[cfg.type] || cfg.type;
      const spec = MODELS[modelId];
      if (!spec) throw new Error('ไม่รู้จักรุ่นอุปกรณ์: ' + modelId);
      const id = Number(cfg.id);
      const D = spec.defaults || {};
      const dev = {
        id, model: modelId, spec, kind: spec.kind,
        name: cfg.name || `${spec.prefix}-${id}`,
        x: cfg.x || 0, z: cfg.z || 0,
        ports: [], ifaces: [], modules: [],
        gw: cfg.gw !== undefined ? cfg.gw : (D.gw || ''),
        dns: cfg.dns !== undefined ? cfg.dns : (D.dns || ''),
        routes: (cfg.routes || D.routes || []).map(r => ({ net: r.net, mask: r.mask, via: r.via })),
        arp: new Map(), macTable: new Map(), pending: new Map(), leases: new Map(),
        natTable: new Map(), natRev: new Map(), natNext: 1024
      };
      spec.ports.forEach(p => dev.ports.push(Object.assign({}, p, { link: null, clock: 0 })));
      if (spec.wireless) {
        for (let i = 1; i <= (spec.wireless.slots || 16); i++) dev.ports.push({ name: `WLAN-${i}`, media: 'radio', hidden: true, link: null, clock: 0 });
      }
      (cfg.modules || D.modules || []).forEach(m => this._installModulePorts(dev, m));
      const clocks = cfg.clocks || D.clocks || {};
      dev.ports.forEach(p => { if (clocks[p.name]) p.clock = Number(clocks[p.name]) || 0; });
      this._renumber(dev);

      // ค่าอินเทอร์เฟซ: ค่าเริ่มต้นของรุ่น → ข้อมูลรูปแบบเก่า → ค่าที่บันทึกไว้
      const saved = new Map();
      const put = (name, v) => saved.set(name, Object.assign({}, saved.get(name), v));
      (D.ifaces || []).forEach(f => put(f.name, f));
      if (Array.isArray(cfg.ports)) cfg.ports.forEach((p, i) => { if (p && (p.ip || p.mask) && dev.ports[i]) put(dev.ports[i].name, { ip: p.ip, mask: p.mask }); });
      (cfg.ifaces || []).forEach(f => put(f.name, f));
      this._buildIfaces(dev, saved);
      const first = dev.ifaces[0];
      if (first && (cfg.ip || cfg.mask)) { first.ip = cfg.ip || first.ip; first.mask = cfg.mask || first.mask; }
      if (first && cfg.dhcpClient) first.dhcp = true;
      dev.ifaces.forEach(f => { if (f.ip && !f.mask) f.mask = '255.255.255.0'; });

      // บริการ (Server: HTTP/DNS/DHCP, Router/Gateway: DHCP)
      const ds = D.services || {}, cs = cfg.services || {};
      const dhcp = Object.assign({ enabled: false, start: '', count: 50, mask: '255.255.255.0', gw: '', dns: '' }, ds.dhcp, cs.dhcp);
      if (spec.server) {
        dev.services = {
          http: Object.assign({ enabled: false, title: 'School Information Portal', body: 'ยินดีต้อนรับสู่ระบบสารสนเทศของโรงเรียน' }, ds.http, cs.http),
          dns: Object.assign({ enabled: false, records: [] }, ds.dns, cs.dns),
          dhcp
        };
        dev.services.dns.records = (dev.services.dns.records || []).map(r => ({ name: String(r.name).toLowerCase(), ip: r.ip }));
      } else if (ROUTERS.has(spec.kind)) dev.services = { dhcp };
      if (spec.wireless) dev.wifi = Object.assign({ ssid: 'Default', key: '' }, D.wifi, cfg.wifi);
      if (ROUTERS.has(spec.kind)) dev.nat = Object.assign({ enabled: false, outside: '' }, D.nat, cfg.nat);
      // ACL / Firewall: รายการ IP ต้นทางที่ถูกปฏิเสธ (ใช้ได้ทั้งเราเตอร์และเครื่องเซิร์ฟเวอร์)
      dev.acl = (cfg.acl || []).filter(r => r && isIp(r.ip)).map(r => ({ ip: r.ip, mask: isMask(r.mask || '') ? r.mask : '255.255.255.255' }));

      this.devices.set(id, dev);
      return dev;
    }

    _installModulePorts(dev, name) {
      const mod = (dev.spec.modules || []).find(m => m.name === name);
      if (!mod || dev.modules.includes(name)) return false;
      mod.ports.forEach(p => dev.ports.push(Object.assign({}, p, { module: name, link: null, clock: 0 })));
      dev.modules.push(name);
      return true;
    }

    _renumber(dev) {
      dev.ports.forEach((p, i) => { p.mac = `00:1A:${hex2(dev.id >> 8)}:${hex2(dev.id)}:${hex2(i >> 8)}:${hex2(i + 1)}`; });
    }

    _snapshotIfaces(dev) {
      const m = new Map();
      dev.ifaces.forEach(f => m.set(f.name, { ip: f.ip, mask: f.mask, dhcp: f.dhcp, ssid: f.ssid, key: f.key }));
      return m;
    }

    _buildIfaces(dev, saved) {
      const spec = dev.spec, P = dev.ports;
      const pick = pred => P.map((p, i) => (pred(p, i) ? i : -1)).filter(i => i >= 0);
      const mk = (name, ports) => {
        const s = saved.get(name) || {};
        return { name, ports, ip: s.ip || '', mask: s.mask || '', dhcp: !!s.dhcp, ssid: s.ssid || '', key: s.key || '', mac: '' };
      };
      let list = [];
      switch (dev.kind) {
        case 'host':
          list = spec.bridgeIface ? [mk(spec.bridgeIface, pick(p => DATA.has(p.media)))]
            : pick(p => DATA.has(p.media)).map(i => mk(P[i].name, [i]));
          break;
        case 'router':
          list = pick(p => p.media === 'copper' || p.media === 'fiber' || p.media === 'serial').map(i => mk(P[i].name, [i]));
          break;
        case 'switch':
          list = [mk('Vlan1', pick(p => p.media === 'copper' || p.media === 'fiber'))];
          break;
        case 'ap':
          list = [mk('BVI1', pick(p => p.media === 'copper' || p.media === 'fiber' || p.media === 'radio'))];
          break;
        case 'gateway':
          list = [mk(spec.outsideName, [spec.outside]), mk(spec.insideName, pick((p, i) => i !== spec.outside && DATA.has(p.media)))];
          break;
        default:
          list = [];
      }
      list.forEach((f, n) => { f.mac = f.ports.length === 1 ? P[f.ports[0]].mac : `00:1A:${hex2(dev.id >> 8)}:${hex2(dev.id)}:FE:${hex2(n + 1)}`; });
      dev.ifaces = list;
    }

    // ติดตั้ง / ถอดโมดูลเสริม (เช่น HWIC-2T เพิ่มพอร์ต Serial)
    setModule(devId, name, on) {
      const dev = this.devices.get(Number(devId));
      if (!dev) return { ok: false, error: 'ไม่พบอุปกรณ์' };
      const mod = (dev.spec.modules || []).find(m => m.name === name);
      if (!mod) return { ok: false, error: `${dev.spec.label} ใส่โมดูล ${name} ไม่ได้` };
      const saved = this._snapshotIfaces(dev);
      if (on) {
        if (!this._installModulePorts(dev, name)) return { ok: true };
      } else {
        if (!dev.modules.includes(name)) return { ok: true };
        if (dev.ports.some(p => p.module === name && p.link)) return { ok: false, error: 'ถอดสายที่เสียบอยู่กับโมดูลนี้ออกก่อน (เหมือนต้องปิดเครื่องและถอดสายก่อนถอดการ์ด)' };
        const map = [], kept = [];
        dev.ports.forEach((p, i) => { if (p.module === name) map[i] = -1; else { map[i] = kept.length; kept.push(p); } });
        dev.ports = kept;
        for (const l of this.links.values()) {
          if (l.a.dev === dev.id) l.a.port = map[l.a.port];
          if (l.b.dev === dev.id) l.b.port = map[l.b.port];
        }
        dev.modules = dev.modules.filter(m => m !== name);
      }
      this._renumber(dev);
      this._buildIfaces(dev, saved);
      dev.arp.clear(); dev.pending.clear(); dev.macTable.clear();
      return { ok: true };
    }

    removeDevice(id) {
      const dev = this.devices.get(Number(id));
      if (!dev) return;
      dev.ports.forEach(p => { if (p.link) this.disconnect(p.link); });
      this.devices.delete(dev.id);
      this.jobs = this.jobs.filter(j => j.dev !== dev);
    }

    /* ------------------------------ ข้อมูลช่วย ------------------------------ */
    ifaceOfPort(dev, portIdx) { return dev.ifaces.findIndex(f => f.ports.includes(portIdx)); }
    primaryIp(dev) { const f = dev.ifaces.find(x => isIp(x.ip)); return f ? f.ip : ''; }
    ifaceUp(dev, fi) {
      const f = dev.ifaces[fi];
      return !!f && f.ports.some(pi => {
        const l = dev.ports[pi].link ? this.links.get(dev.ports[pi].link) : null;
        return l && l.data && l.up;
      });
    }
    portLabel(dev, i) { const p = dev.ports[i]; return `${p.name} (${MEDIA[p.media]})`; }

    linkStatus(link) {
      const st = this._baseStatus(link);
      if (st.up && this.stp && this._stpBlocked().has(link.id)) {
        return { up: false, stp: true, reason: 'STP บล็อกพอร์ตนี้ไว้ (Blocking) เพื่อกันลูป — เป็นเส้นสำรองเมื่อเส้นหลักเสีย' };
      }
      return st;
    }
    // Spanning Tree แบบย่อ: ไล่สายระหว่างสวิตช์/ฮับ/AP ตามลำดับ สายที่ทำให้ครบวงจะถูกบล็อก
    _stpBlocked() {
      const parent = new Map();
      const find = x => { while (parent.get(x) !== x) x = parent.get(x); return x; };
      for (const d of this.devices.values()) if (d.kind === 'switch' || d.kind === 'hub' || d.kind === 'ap') parent.set(d.id, d.id);
      const blocked = new Set();
      for (const l of this.links.values()) {
        if (!l.data || !parent.has(l.a.dev) || !parent.has(l.b.dev) || !this._baseStatus(l).up) continue;
        const ra = find(l.a.dev), rb = find(l.b.dev);
        if (ra === rb) blocked.add(l.id); else parent.set(ra, rb);
      }
      return blocked;
    }
    // ระยะทางจริงระหว่างอุปกรณ์ (เมตร) — เผื่อสายโค้งตามราง 10%
    distance(A, B) { return Math.round(Math.hypot((A.x || 0) - (B.x || 0), (A.z || 0) - (B.z || 0)) * (this.scale || 1) * 1.1); }
    // ความแรงสัญญาณ Wi-Fi (dBm) จาก AP ไปยังจุด (x,z): -30 dBm ที่ 1 ม. ลดลงตามระยะ และลดเพิ่มทุกผนังที่ผ่าน
    rssiAt(ap, x, z) {
      const d = Math.max(1, Math.hypot((ap.x || 0) - x, (ap.z || 0) - z) * (this.scale || 1));
      let loss = 0;
      for (const w of this.walls) if (crosses(ap.x || 0, ap.z || 0, x, z, w)) loss += w[4] || 4;
      return Math.round(-30 - 30 * Math.log10(d) - loss);
    }
    wallsBetween(ap, x, z) { return this.walls.filter(w => crosses(ap.x || 0, ap.z || 0, x, z, w)).length; }
    // จุดบนเส้นทางสาย: ยึดกับอุปกรณ์ {dev, dx, dy, dz} หรือพิกัดอิสระ {x, y, z}
    routePoint(p) {
      const d = p.dev !== undefined && this.devices.get(p.dev);
      return d ? { x: (d.x || 0) + (p.dx || 0), y: (p.dy || 0), z: (d.z || 0) + (p.dz || 0) } : { x: p.x || 0, y: p.y || 0, z: p.z || 0 };
    }
    // ความยาวสาย (เมตร): ถ้าจัดเส้นทางเองจะวัดตามเส้นทางจริง (รวมแนวตั้ง) ไม่งั้นวัดเส้นตรง + เผื่อ 10%
    cableLength(link) {
      const A = this.devices.get(link.a.dev), B = this.devices.get(link.b.dev);
      if (!A || !B) return 0;
      if (!link.route || !link.route.length) return this.distance(A, B);
      const pts = [{ x: A.x || 0, y: 0.5, z: A.z || 0 }, ...link.route.map(p => this.routePoint(p)), { x: B.x || 0, y: 0.5, z: B.z || 0 }];
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
      return Math.round(len * (this.scale || 1) * 1.03);
    }
    _baseStatus(link) {
      const A = this.devices.get(link.a.dev), B = this.devices.get(link.b.dev);
      if (!A || !B) return { up: false, reason: 'อุปกรณ์ถูกลบ' };
      const pa = A.ports[link.a.port], pb = B.ports[link.b.port];
      if (!pa || !pb) return { up: false, reason: 'พอร์ตถูกถอดออก' };
      const max = MAX_LEN[link.cable];
      if (max) {
        const len = this.cableLength(link);
        if (len > max) {
          const tip = (link.cable === 'straight' || link.cable === 'cross') ? ' — ระยะไกลต้องใช้สาย Fiber' : '';
          return { up: false, tooLong: true, len, max, reason: `${CABLES[link.cable].th}ยาว ${len} ม. เกินมาตรฐาน ${max} ม.${tip}` };
        }
      }
      if (link.cable === 'straight' || link.cable === 'cross') {
        const need = copperCable(pa, pb);
        if (!(pa.autoMdix || pb.autoMdix) && need !== link.cable) {
          return { up: false, need, reason: `ใช้${CABLES[link.cable].th}ผิดประเภท ต้องใช้${CABLES[need].th}` };
        }
      }
      if (link.cable === 'serialDCE' || link.cable === 'serialDTE') {
        const d = this.dceEnd(link);
        const dev = this.devices.get(d.dev), p = dev.ports[d.port];
        if (!(p.clock > 0)) return { up: false, reason: `ฝั่ง DCE (${dev.name} ${p.name}) ยังไม่ได้ตั้ง Clock Rate` };
      }
      return { up: true, reason: '' };
    }
    dceEnd(link) {
      if (link.cable === 'serialDCE') return link.a;
      if (link.cable === 'serialDTE') return link.b;
      return null;
    }
    linkLabel(link) {
      const a = this.devices.get(link.a.dev), b = this.devices.get(link.b.dev);
      return `${a.name} ${a.ports[link.a.port].name} ↔ ${b.name} ${b.ports[link.b.port].name}`;
    }

    // คืนอุปกรณ์ปลายสาย Console/Octal (ใช้กับคำสั่ง terminal)
    consoleTarget(devId) {
      const dev = this.devices.get(Number(devId));
      if (!dev) return null;
      for (const p of dev.ports) {
        if (!p.link || (p.media !== 'rs232' && p.media !== 'async')) continue;
        const l = this.links.get(p.link);
        const other = l.a.dev === dev.id ? l.b : l.a;
        return this.devices.get(other.dev) || null;
      }
      return null;
    }

    /* ------------------------------ เดินสาย ------------------------------ */
    connect(aId, aPort, bId, bPort, cable) {
      const a = this.devices.get(Number(aId)), b = this.devices.get(Number(bId));
      if (!a || !b) return { ok: false, error: 'ไม่พบอุปกรณ์ที่เลือก' };
      if (a === b) return { ok: false, error: 'ต้นทางและปลายทางต้องเป็นคนละอุปกรณ์' };
      if (!cable || cable === 'utp') cable = 'auto';
      if (cable !== 'auto' && !CABLES[cable]) return { ok: false, error: 'ไม่รู้จักชนิดสาย ' + cable };
      if (cable === 'wireless') return { ok: false, error: 'การเชื่อมต่อไร้สายเกิดขึ้นเองเมื่อตั้ง SSID และรหัสผ่านให้ตรงกับ Access Point' };
      const given = v => (v === null || v === undefined || v === '' ? null : Number(v));
      const ga = given(aPort), gb = given(bPort);
      for (const [d, g] of [[a, ga], [b, gb]]) {
        if (g === null) continue;
        const p = d.ports[g];
        if (!p || p.hidden) return { ok: false, error: `ไม่พบพอร์ตที่เลือกบน ${d.name}` };
        if (p.link) return { ok: false, error: `พอร์ต ${p.name} ของ ${d.name} มีสายเสียบอยู่แล้ว` };
      }
      // ระยะเกินสายทองแดง → ให้ลองต่อด้วย Fiber ก่อน
      const far = this.distance(a, b) > MAX_LEN.straight;
      const pairs = cable === 'auto' ? (far ? [['fiber', 'fiber']].concat(AUTO_ORDER) : AUTO_ORDER)
        : CABLES[cable].media.flatMap(([x, y]) => (x === y ? [[x, y]] : [[x, y], [y, x]]));
      // เลือกพอร์ตว่างอัตโนมัติ: Wireless Router / ไฟร์วอลล์ ให้เครื่องลูกข่ายลงพอร์ต LAN
      // ส่วนโมเด็ม / Cloud / Router ของ ISP ให้ลงพอร์ต Internet (outside)
      const free = (d, media, peer) => {
        const cands = d.ports.map((p, i) => i).filter(i => !d.ports[i].link && !d.ports[i].hidden && d.ports[i].media === media);
        if (d.kind === 'gateway' && cands.length > 1) {
          const wantOut = peer.kind === 'hub' || peer.kind === 'router' || peer.kind === 'gateway';
          const miss = i => ((i === d.spec.outside) !== wantOut ? 1 : 0);
          cands.sort((x, y) => miss(x) - miss(y) || x - y);
        }
        return cands.length ? cands[0] : -1;
      };
      let pa = -1, pb = -1;
      for (const [ma, mb] of pairs) {
        const ia = ga !== null ? (a.ports[ga].media === ma ? ga : -1) : free(a, ma, b);
        const ib = gb !== null ? (b.ports[gb].media === mb ? gb : -1) : free(b, mb, a);
        if (ia >= 0 && ib >= 0) { pa = ia; pb = ib; break; }
      }
      if (pa < 0) {
        const label = cable === 'auto' ? 'สายชนิดใด' : CABLES[cable].th;
        if (ga !== null && gb !== null) {
          return { ok: false, error: `พอร์ต ${a.ports[ga].name} (${MEDIA[a.ports[ga].media]}) กับ ${b.ports[gb].name} (${MEDIA[b.ports[gb].media]}) ต่อด้วย${label}ไม่ได้` };
        }
        if (ga !== null && cable !== 'auto') return { ok: false, error: `พอร์ต ${a.ports[ga].name} (${MEDIA[a.ports[ga].media]}) ใช้กับ${label}ไม่ได้` };
        return { ok: false, error: `${a.name} กับ ${b.name} ไม่มีพอร์ตว่างที่ต่อด้วย${label}ได้` };
      }
      if (cable === 'auto') cable = cableFor(a.ports[pa], b.ports[pb]);
      return this._link(a, pa, b, pb, cable);
    }

    _link(a, pa, b, pb, cable) {
      const net = this;
      const link = {
        id: this._linkId++, cable,
        a: { dev: a.id, port: pa }, b: { dev: b.id, port: pb },
        data: CABLES[cable].data !== false,
        get up() { return net.linkStatus(this).up; }
      };
      a.ports[pa].link = link.id; b.ports[pb].link = link.id;
      this.links.set(link.id, link);
      const res = { ok: true, link };
      if (cable === 'straight' || cable === 'cross') res.expected = copperCable(a.ports[pa], b.ports[pb]);
      return res;
    }

    disconnect(linkId) {
      const link = this.links.get(Number(linkId));
      if (!link) return;
      for (const end of [link.a, link.b]) {
        const d = this.devices.get(end.dev);
        if (!d || !d.ports[end.port]) continue;
        d.ports[end.port].link = null;
        for (const [mac, port] of d.macTable) if (port === end.port) d.macTable.delete(mac);
      }
      this.links.delete(link.id);
      this.wire = this.wire.filter(t => t.link !== link.id);
    }

    // จับคู่การ์ด Wi-Fi กับ Access Point ที่ SSID + รหัสผ่านตรงกัน (เลือกตัวที่ใกล้ที่สุด)
    syncWireless() {
      const res = { added: 0, removed: 0 };
      const aps = [...this.devices.values()].filter(d => d.spec.wireless);
      // ต่อได้ทั้ง Wi-Fi หลัก และ Wi-Fi แขก (Guest) ถ้า AP เปิดไว้
      const guestOk = (f, ap) => !!(ap.wifi.guest && ap.wifi.guest.ssid) && ap.wifi.guest.ssid === f.ssid && (ap.wifi.guest.key || '') === (f.key || '');
      const ok = (f, ap) => !!f.ssid && ((ap.wifi.ssid === f.ssid && (ap.wifi.key || '') === (f.key || '')) || guestOk(f, ap));
      for (const link of [...this.links.values()]) {
        if (link.cable !== 'wireless') continue;
        const [c, ap] = this.devices.get(link.a.dev).ports[link.a.port].media === 'wlan' ? [link.a, link.b] : [link.b, link.a];
        const cdev = this.devices.get(c.dev), adev = this.devices.get(ap.dev);
        const f = cdev.ifaces[this.ifaceOfPort(cdev, c.port)];
        if (!f || !ok(f, adev) || this.rssiAt(adev, cdev.x || 0, cdev.z || 0) < WIFI_MIN) { this.disconnect(link.id); res.removed++; }
      }
      for (const dev of this.devices.values()) {
        dev.ports.forEach((p, i) => {
          if (p.media !== 'wlan' || p.link) return;
          const f = dev.ifaces[this.ifaceOfPort(dev, i)];
          if (!f || !f.ssid) return;
          const sig = ap => this.rssiAt(ap, dev.x || 0, dev.z || 0);
          const cands = aps.filter(ap => ap !== dev && ok(f, ap) && sig(ap) >= WIFI_MIN && ap.ports.some(q => q.media === 'radio' && !q.link));
          if (!cands.length) return;
          cands.sort((x, y) => sig(y) - sig(x));      // เลือก AP ที่สัญญาณแรงที่สุด
          const ap = cands[0];
          const lr = this._link(dev, i, ap, ap.ports.findIndex(q => q.media === 'radio' && !q.link), 'wireless');
          if (lr.ok && guestOk(f, ap)) lr.link.guest = true;
          res.added++;
        });
      }
      return res;
    }

    clearTables() {
      for (const d of this.devices.values()) { d.arp.clear(); d.macTable.clear(); d.pending.clear(); d.natTable.clear(); d.natRev.clear(); }
    }

    /* ------------------------- บันทึก / โหลดสถานะ -------------------------- */
    serialize() {
      return {
        version: 4,
        stp: this.stp || undefined,
        scale: this.scale !== 1 ? this.scale : undefined,
        walls: this.walls.length ? clone(this.walls) : undefined,
        devices: [...this.devices.values()].map(d => {
          const clocks = {};
          d.ports.forEach(p => { if (p.clock) clocks[p.name] = p.clock; });
          return {
            id: d.id, model: d.model, name: d.name, x: d.x, z: d.z, modules: d.modules.slice(),
            ifaces: d.ifaces.map(f => ({ name: f.name, ip: f.ip, mask: f.mask, dhcp: f.dhcp, ssid: f.ssid, key: f.key })),
            clocks, gw: d.gw, dns: d.dns, routes: d.routes,
            services: d.services ? clone(d.services) : undefined,
            wifi: d.wifi ? clone(d.wifi) : undefined,
            nat: d.nat ? clone(d.nat) : undefined,
            acl: d.acl && d.acl.length ? clone(d.acl) : undefined
          };
        }),
        links: [...this.links.values()].filter(l => l.cable !== 'wireless').map(l => ({
          a: l.a.dev, aPort: l.a.port, b: l.b.dev, bPort: l.b.port, cable: l.cable,
          route: l.route && l.route.length ? clone(l.route) : undefined
        }))
      };
    }

    /* --------------------------- กลไกเดินเวลา ---------------------------- */
    busy() { return this.wire.length > 0 || this.jobs.length > 0; }
    _emit(ev) { ev.tick = this.tick; this._events.push(ev); return ev; }
    _info(dev, text, extra) { return this._emit(Object.assign({ kind: 'info', dev: dev.id, text }, extra)); }
    _drop(dev, text, frame) { return this._emit({ kind: 'drop', dev: dev.id, text, proto: frame ? protoOf(frame) : null }); }

    _tx(dev, portIdx, frame) {
      const port = dev.ports[portIdx];
      const link = port && port.link ? this.links.get(port.link) : null;
      if (!link) { this._drop(dev, `พอร์ต ${port ? port.name : '?'} ไม่ได้เสียบสาย → ส่งเฟรมออกไม่ได้`, frame); return false; }
      if (!link.data) return false;
      const st = this.linkStatus(link);
      if (!st.up) { this._drop(dev, `ลิงก์ ${port.name} ดาวน์ (${st.reason}) → ส่งเฟรมออกไม่ได้`, frame); return false; }
      const peer = (link.a.dev === dev.id && link.a.port === portIdx) ? link.b : link.a;
      this._next.push({ link: link.id, from: dev.id, to: peer.dev, toPort: peer.port, frame });
      return true;
    }

    // ส่งเฟรมออกทางอินเทอร์เฟซ (ถ้ามีหลายพอร์ต = สวิตช์ในตัว เลือกพอร์ตจาก MAC Table)
    _ifaceTx(dev, fi, frame, exceptPort) {
      const f = dev.ifaces[fi];
      if (f.ports.length === 1) return this._tx(dev, f.ports[0], frame);
      if (frame.dstMac !== BROADCAST_MAC) {
        const p = dev.macTable.get(frame.dstMac);
        if (p !== undefined && f.ports.includes(p) && p !== exceptPort) return this._tx(dev, p, frame);
      }
      let sent = false;
      f.ports.forEach(p => {
        if (p === exceptPort) return;
        const l = dev.ports[p].link ? this.links.get(dev.ports[p].link) : null;
        if (l && l.data && l.up) { this._tx(dev, p, frame); sent = true; }
      });
      if (!sent && exceptPort === undefined) this._drop(dev, `${f.name}: ไม่มีพอร์ตที่เชื่อมต่ออยู่ → ส่งไม่ได้`, frame);
      return sent;
    }

    // มีแต่แพ็กเก็ตโจมตีอยู่บนสาย = งานของผู้ใช้เดินต่อได้ (ไม่ต้องรอ Flood จบ)
    _legitQuiet() { return !this.wire.some(t => !isFlood(t.frame)) && !this._next.some(t => !isFlood(t.frame)); }
    _jobTick() {
      const job = this.jobs[0];
      if (job) {
        if (!job.started) { job.started = true; job.start(); } else job.onIdle();
        if (job.done) this.jobs.shift();
      }
    }

    // เริ่ม / หยุด Ping Flood จากเครื่องผู้โจมตี (perTick แพ็กเก็ตต่อจังหวะ รวม total แพ็กเก็ต)
    startFlood(srcId, dst, opts) {
      const dev = this.devices.get(Number(srcId));
      if (!dev || !isIp(dst)) return false;
      const o = opts || {};
      this.flood = { dev, dst, perTick: o.perTick || 4, left: o.total || 100, seq: 0 };
      this.floodStats = { sent: 0, acl: 0, reached: 0, overloadDrops: 0, legitDrops: 0 };
      return true;
    }
    stopFlood() { this.flood = null; }
    _floodTick() {
      const f = this.flood;
      if (!f) return;
      if (!this.devices.has(f.dev.id)) { this.flood = null; return; }
      for (let i = 0; i < f.perTick && f.left > 0; i++, f.left--) {
        this.floodStats.sent++;
        this._l3Send(f.dev, { dst: f.dst, ttl: 128, proto: 'ICMP', data: { type: 'echo-request', id: 7777, seq: ++f.seq, flood: true } });
      }
      if (f.left <= 0) this.flood = null;
    }
    // เซิร์ฟเวอร์รับ Ping ท่วมมากเกินไปใน 3 จังหวะล่าสุด → ทรัพยากรเต็ม
    _overloaded(dev) {
      const h = dev._hits;
      if (!h) return false;
      let n = 0;
      for (const [t, c] of h) { if (t >= this.tick - 2) n += c; else h.delete(t); }
      return n >= 6;
    }

    step() {
      this._events = [];
      if (this.wire.length === 0 && this.flood) this._floodTick();
      if (this.wire.length === 0) {
        this._busyTicks = 0;
        this._expirePending();
        const job = this.jobs[0];
        if (job && this._next.length === 0) {
          if (!job.started) { job.started = true; job.start(); } else job.onIdle();
          if (job.done) this.jobs.shift();
        }
      } else {
        this.tick++;
        this._busyTicks++;
        const arriving = this.wire;
        this.wire = [];
        for (const t of arriving) {
          const info = describe(t.frame);
          const link = this.links.get(t.link);
          this._emit({ kind: 'tx', link: t.link, cable: link ? link.cable : '', from: t.from, to: t.to, frame: t.frame, proto: info.proto, summary: info.summary, layers: info.layers });
        }
        for (const t of arriving) this._deliver(t);
        if (this.flood) { this._floodTick(); if (this._legitQuiet()) this._jobTick(); }
      }
      this.wire = this.wire.concat(this._next);
      this._next = [];
      if (this.wire.length > 150 || this._busyTicks > 150) {
        this.wire = [];
        this._emit({ kind: 'storm', text: 'ตรวจพบ Broadcast Storm! มีลูประหว่างสวิตช์/ฮับ (ไม่มี STP) เฟรมวนไม่รู้จบ — ระบบหยุดการจำลองรอบนี้' });
      }
      return this._events;
    }

    run(maxSteps) {
      const all = [];
      let n = maxSteps || 8000;
      while (this.busy() && n-- > 0) all.push(...this.step());
      return all;
    }

    _expirePending() {
      for (const dev of this.devices.values()) {
        if (!dev.pending.size) continue;
        const entries = [...dev.pending.entries()];
        dev.pending.clear();
        for (const [ip, pend] of entries) {
          this._drop(dev, `ARP หา MAC ของ ${ip} ไม่เจอ (ไม่มีใครตอบ) → ทิ้งแพ็กเก็ต`);
          if (!ROUTERS.has(dev.kind)) continue;
          for (const pkt of pend.packets) this._icmpError(dev, pkt, 'dest-unreachable');
        }
      }
    }

    _deliver(t) {
      const dev = this.devices.get(t.to);
      if (!dev) return;
      if (dev.kind === 'hub') return this._hubRx(dev, t.toPort, t.frame);
      if (dev.kind === 'passive') return;
      this._l2Rx(dev, t.toPort, t.frame);
    }

    /* ------------------------------ Layer 1 ------------------------------ */
    _hubRx(dev, inPort, frame) {
      const out = dev.ports.map((p, i) => i).filter(i => {
        if (i === inPort || !dev.ports[i].link) return false;
        const l = this.links.get(dev.ports[i].link);
        return l.data && l.up;
      });
      if (!out.length) return this._drop(dev, 'ไม่มีพอร์ตอื่นที่เชื่อมต่อ → สัญญาณสิ้นสุดที่นี่', frame);
      const what = dev.spec.cat === 'wan' ? 'แปลงสัญญาณและส่งต่อ' : 'ทวนสัญญาณออกทุกพอร์ตยกเว้นพอร์ตที่รับมา (ไม่ดู MAC)';
      this._info(dev, `Layer 1: ${what}`);
      out.forEach(i => this._tx(dev, i, frame));
    }

    /* ------------------------------ Layer 2 ------------------------------ */
    _l2Rx(dev, inPort, frame) {
      const fi = this.ifaceOfPort(dev, inPort);
      if (fi < 0) return this._drop(dev, `พอร์ต ${dev.ports[inPort].name} ไม่ได้ใช้รับส่งข้อมูล`, frame);
      const f = dev.ifaces[fi];
      const switchy = dev.kind === 'switch' || dev.kind === 'ap' || dev.kind === 'gateway';
      const who = dev.kind === 'gateway' ? 'สวิตช์ในตัว: ' : '';
      if (f.ports.length > 1) {
        if (frame.srcMac !== BROADCAST_MAC && dev.macTable.get(frame.srcMac) !== inPort) {
          dev.macTable.set(frame.srcMac, inPort);
          if (switchy) this._info(dev, `${who}เรียนรู้ MAC ${frame.srcMac} อยู่ที่พอร์ต ${dev.ports[inPort].name} (บันทึกลง MAC Table)`);
        }
        // Wi-Fi แขก: เครื่องแขกคุยได้แค่กับเราเตอร์ (ออกอินเทอร์เน็ต) เข้าเครื่องอื่นในบ้านไม่ได้
        const inLink = dev.ports[inPort].link && this.links.get(dev.ports[inPort].link);
        if (inLink && inLink.guest && frame.dstMac !== BROADCAST_MAC && frame.dstMac !== f.mac &&
            ![...this.devices.values()].some(d => (d.kind === 'router' || d.kind === 'gateway') && d.ifaces.some(x => x.mac === frame.dstMac))) {
          return this._drop(dev, 'Wi-Fi แขก (Guest): แยกจากเครือข่ายในบ้าน — เข้าถึงอุปกรณ์อื่นในบ้านไม่ได้ ออกได้แค่อินเทอร์เน็ต', frame);
        }
        if (frame.dstMac === BROADCAST_MAC) {
          if (switchy) this._info(dev, `${who}ปลายทางเป็น Broadcast → ส่งออกทุกพอร์ตยกเว้นพอร์ตที่รับมา (Flood)`);
          this._ifaceTx(dev, fi, frame, inPort);
          return this._l3Rx(dev, fi, frame, true);
        }
        if (frame.dstMac === f.mac) return this._l3Rx(dev, fi, frame, false);
        const out = dev.macTable.get(frame.dstMac);
        if (out === undefined) {
          if (switchy) this._info(dev, `${who}ยังไม่รู้จัก MAC ${frame.dstMac} → ส่งออกทุกพอร์ต (Unknown Unicast Flood)`);
          this._ifaceTx(dev, fi, frame, inPort);
          return;
        }
        if (out === inPort) return this._drop(dev, 'ปลายทางอยู่พอร์ตเดียวกับที่รับมา → ไม่ส่งต่อ (Filter)', frame);
        if (switchy) this._info(dev, `${who}พบ MAC ปลายทางใน MAC Table → ส่งต่อเฉพาะพอร์ต ${dev.ports[out].name}`);
        this._tx(dev, out, frame);
        return;
      }
      if (frame.srcMac !== HDLC && frame.dstMac !== BROADCAST_MAC && frame.dstMac !== f.mac) {
        if (dev.spec.sniffer) return this._info(dev, `Sniffer ดักจับเฟรม ${protoOf(frame)} ของ ${frame.srcMac} → ${frame.dstMac} ไว้ได้ (โหมด Promiscuous)`, { accept: true });
        return this._drop(dev, 'MAC ปลายทางไม่ใช่ของเครื่องนี้ → ทิ้งเฟรม', frame);
      }
      this._l3Rx(dev, fi, frame, frame.dstMac === BROADCAST_MAC);
    }

    _arpRx(dev, fi, frame, bridged) {
      const a = frame.arp, f = dev.ifaces[fi];
      if (!isIp(f.ip) || a.tpa !== f.ip) {
        if (bridged || f.ports.length > 1) return;
        return this._drop(dev, `ARP ถามหา ${a.tpa} ไม่ใช่ IP ของฉัน → ทิ้ง`, frame);
      }
      dev.arp.set(a.spa, { mac: a.sha, iface: fi });
      if (a.op === 'request') {
        this._info(dev, `ARP ถามหา IP ของฉัน → จำ ${a.spa} = ${a.sha} แล้วตอบ ARP Reply กลับ`, { accept: true });
        this._ifaceTx(dev, fi, { srcMac: f.mac, dstMac: a.sha, type: 'ARP', arp: { op: 'reply', sha: f.mac, spa: f.ip, tha: a.sha, tpa: a.spa } });
      } else {
        this._info(dev, `ได้ ARP Reply → บันทึก ${a.spa} = ${a.sha} ลง ARP Table`, { accept: true });
      }
      const pend = dev.pending.get(a.spa);
      if (pend) {
        dev.pending.delete(a.spa);
        for (const pkt of pend.packets) this._ifaceTx(dev, pend.iface, { srcMac: dev.ifaces[pend.iface].mac, dstMac: a.sha, type: 'IPv4', pkt });
      }
    }

    /* ------------------------------ Layer 3 ------------------------------ */
    _route(dev, dst) {
      let best = null;
      dev.ifaces.forEach((f, i) => {
        if (!isIp(f.ip) || !isMask(f.mask) || !sameNet(f.ip, dst, f.mask) || !this.ifaceUp(dev, i)) return;
        const bits = maskBits(f.mask);
        if (!best || bits > best.bits) best = { iface: i, nextHop: dst, bits, connected: true };
      });
      const viaIface = via => dev.ifaces.findIndex((f, i) => isIp(f.ip) && isMask(f.mask) && sameNet(f.ip, via, f.mask) && this.ifaceUp(dev, i));
      if (ROUTERS.has(dev.kind)) {
        for (const r of dev.routes) {
          if (!isIp(r.net) || !isMask(r.mask) || !isIp(r.via) || !sameNet(r.net, dst, r.mask)) continue;
          const bits = maskBits(r.mask);
          if (best && bits <= best.bits) continue;
          const vi = viaIface(r.via);
          if (vi >= 0) best = { iface: vi, nextHop: r.via, bits, connected: false };
        }
      }
      if (!best && isIp(dev.gw)) {
        const vi = viaIface(dev.gw);
        if (vi >= 0) best = { iface: vi, nextHop: dev.gw, bits: -1, connected: false };
      }
      return best;
    }

    _noRouteHint(dev) {
      if (!dev.ifaces.some(f => isIp(f.ip))) return '(ยังไม่ได้ตั้งค่า IP Address)';
      if (!dev.ifaces.some((f, i) => isIp(f.ip) && this.ifaceUp(dev, i))) return '(การ์ดเครือข่ายยังไม่ได้เชื่อมต่อ หรือลิงก์ดาวน์)';
      if (ROUTERS.has(dev.kind)) return '(ไม่มีเส้นทางใน Routing Table)';
      if (!dev.gw) return '(ปลายทางอยู่คนละวงเครือข่าย และยังไม่ได้ตั้ง Default Gateway)';
      return '(Default Gateway ไม่ได้อยู่ในวงเครือข่ายเดียวกับเครื่อง หรือลิงก์ดาวน์)';
    }

    _l3Send(dev, pkt) {
      const r = this._route(dev, pkt.dst);
      if (!r) {
        const hint = this._noRouteHint(dev);
        this._drop(dev, `ไม่มีเส้นทางไป ${pkt.dst} ${hint}`);
        return { ok: false, hint };
      }
      const f = dev.ifaces[r.iface];
      if (!pkt.src) pkt.src = f.ip;
      // สาย Serial: จุดต่อจุด ไม่ต้องใช้ ARP
      if (f.ports.length === 1 && dev.ports[f.ports[0]].media === 'serial') {
        this._tx(dev, f.ports[0], { srcMac: HDLC, dstMac: HDLC, type: 'IPv4', pkt });
        return { ok: true };
      }
      if (pkt.dst === bcastAddr(f.ip, f.mask)) {
        this._ifaceTx(dev, r.iface, { srcMac: f.mac, dstMac: BROADCAST_MAC, type: 'IPv4', pkt });
        return { ok: true };
      }
      const known = dev.arp.get(r.nextHop);
      if (known) {
        this._ifaceTx(dev, r.iface, { srcMac: f.mac, dstMac: known.mac, type: 'IPv4', pkt });
        return { ok: true };
      }
      let pend = dev.pending.get(r.nextHop);
      if (!pend) {
        pend = { iface: r.iface, packets: [] };
        dev.pending.set(r.nextHop, pend);
        const why = r.connected ? `ปลายทาง ${pkt.dst} อยู่วงเดียวกัน` : `ปลายทาง ${pkt.dst} อยู่คนละวง ต้องส่งผ่าน ${r.nextHop}`;
        this._info(dev, `${why} แต่ยังไม่รู้ MAC ของ ${r.nextHop} → พักแพ็กเก็ตไว้ แล้วส่ง ARP Request แบบ Broadcast`);
        this._ifaceTx(dev, r.iface, {
          srcMac: f.mac, dstMac: BROADCAST_MAC, type: 'ARP',
          arp: { op: 'request', sha: f.mac, spa: f.ip, tha: '00:00:00:00:00:00', tpa: r.nextHop }
        });
      }
      pend.packets.push(pkt);
      return { ok: true };
    }

    _icmpError(dev, orig, type, srcIp) {
      if (orig.proto === 'ICMP' && orig.data.type !== 'echo-request') return;
      if (!isIp(orig.src) || orig.src === '0.0.0.0') return;
      const d = orig.data || {};
      this._l3Send(dev, { src: srcIp, dst: orig.src, ttl: 255, proto: 'ICMP', data: { type, id: d.id, seq: d.seq, sport: d.sport, dport: d.dport } });
    }

    _l3Rx(dev, fi, frame, isBcast) {
      const f = dev.ifaces[fi];
      const bridged = f.ports.length > 1;
      if (frame.type === 'ARP') return this._arpRx(dev, fi, frame, bridged && isBcast);
      const pkt = frame.pkt;
      if (pkt.proto === 'UDP' && pkt.data.app === 'DHCP') return this._dhcpRx(dev, fi, frame);
      const rule = dev.acl && dev.acl.find(r => isIp(pkt.src) && sameNet(pkt.src, r.ip, r.mask));
      if (rule) {
        if (isFlood(frame) && this.floodStats) this.floodStats.acl++;
        return this._drop(dev, `${ROUTERS.has(dev.kind) ? 'ACL' : 'Firewall ของเครื่อง'} ปฏิเสธแพ็กเก็ตจาก ${pkt.src} (deny ${rule.ip}${rule.mask !== '255.255.255.255' ? ' ' + rule.mask : ''})`, frame);
      }
      if (!isIp(f.ip)) {
        if (!bridged) this._drop(dev, `${f.name} ยังไม่ได้ตั้ง IP → ทิ้งแพ็กเก็ต`, frame);
        return;
      }
      // NAT ขาเข้า: แปลง IP สาธารณะกลับเป็น IP ภายใน
      const outIdx = this._natOutIdx(dev);
      if (outIdx === fi && pkt.dst === f.ip) {
        const back = this._natIn(dev, pkt);
        if (back) {
          this._info(dev, back.fwd ? `Port Forwarding: ${pkt.proto} พอร์ต ${pkt.data.dport} → ส่งต่อให้เครื่องภายใน ${back.dst}:${back.data.dport}`
            : `NAT ขาเข้า: แปลงปลายทาง ${pkt.dst} กลับเป็นเครื่องภายใน ${back.dst}`, { accept: true });
          delete back.fwd;
          return this._forward(dev, fi, back, frame, true);
        }
      }
      const mine = dev.ifaces.some(x => x.ip === pkt.dst) || pkt.dst === BROADCAST_IP || pkt.dst === bcastAddr(f.ip, f.mask);
      if (mine) return this._l4Rx(dev, pkt);
      if (ROUTERS.has(dev.kind)) return this._forward(dev, fi, pkt, frame, false);
      if (!bridged || !isBcast) this._drop(dev, `IP ปลายทาง ${pkt.dst} ไม่ใช่ของเครื่องนี้ → ทิ้งแพ็กเก็ต`, frame);
    }

    _natOutIdx(dev) {
      if (!dev.nat || !dev.nat.enabled) return -1;
      return dev.ifaces.findIndex(f => f.name === dev.nat.outside);
    }
    _natField(pkt) { return pkt.proto === 'ICMP' ? 'id' : 'sport'; }
    // Port Forwarding: ตอบกลับจากเครื่องภายในที่ถูก forward → ใช้พอร์ตสาธารณะเดิม
    _fwdRule(dev, test) { return ((dev.nat && dev.nat.forwards) || []).find(test); }
    _natOut(dev, pkt, outIp) {
      const fw = pkt.proto !== 'ICMP' && this._fwdRule(dev, r => r.proto === pkt.proto && r.ip === pkt.src && Number(r.toPort || r.port) === pkt.data.sport);
      if (fw) return Object.assign({}, pkt, { src: outIp, data: Object.assign({}, pkt.data, { sport: Number(fw.port) }) });
      const field = this._natField(pkt);
      const orig = pkt.data[field];
      const key = `${pkt.proto}|${pkt.src}|${orig}`;
      let pub = dev.natRev.get(key);
      if (!pub) {
        pub = dev.natNext++;
        dev.natRev.set(key, pub);
        dev.natTable.set(`${pkt.proto}|${pub}`, { ip: pkt.src, port: orig, pub, proto: pkt.proto, outIp });
      }
      return Object.assign({}, pkt, { src: outIp, data: Object.assign({}, pkt.data, { [field]: pub }) });
    }
    _natIn(dev, pkt) {
      const field = pkt.proto === 'ICMP' ? 'id' : 'dport';
      const m = dev.natTable.get(`${pkt.proto}|${pkt.data[field]}`);
      if (!m) {
        // ไม่มีรายการ NAT แต่ตรงกับกฎ Port Forwarding → ส่งเข้าเครื่องภายในที่กำหนด
        const fw = pkt.proto !== 'ICMP' && this._fwdRule(dev, r => r.proto === pkt.proto && Number(r.port) === pkt.data.dport && isIp(r.ip));
        if (!fw) return null;
        return Object.assign({}, pkt, { dst: fw.ip, fwd: true, data: Object.assign({}, pkt.data, { dport: Number(fw.toPort || fw.port) }) });
      }
      return Object.assign({}, pkt, { dst: m.ip, data: Object.assign({}, pkt.data, { [field]: m.port }) });
    }

    _forward(dev, inFi, pkt, frame, translated) {
      const inF = dev.ifaces[inFi];
      if (pkt.dst === BROADCAST_IP || frame.dstMac === BROADCAST_MAC || pkt.dst === bcastAddr(inF.ip, inF.mask)) {
        return this._drop(dev, 'เราเตอร์ไม่ส่งต่อ Broadcast ข้ามวงเครือข่าย (แบ่ง Broadcast Domain)', frame);
      }
      const outIdx = this._natOutIdx(dev);
      if (!translated && outIdx === inFi) {
        const inside = dev.ifaces.some((x, i) => i !== outIdx && isIp(x.ip) && isMask(x.mask) && sameNet(x.ip, pkt.dst, x.mask));
        if (inside) {
          return this._drop(dev, dev.spec.firewall
            ? 'ไฟร์วอลล์ปิดกั้น: ไม่อนุญาตให้เครื่องภายนอกเริ่มเชื่อมต่อเข้ามาในเครือข่ายภายใน'
            : 'NAT: เครื่องภายนอกเข้าถึง IP ภายในโดยตรงไม่ได้ (ไม่มีรายการใน NAT Table)', frame);
        }
      }
      if (pkt.ttl <= 1) {
        this._drop(dev, 'TTL เหลือ 0 → ทิ้งแพ็กเก็ต แล้วแจ้ง ICMP Time Exceeded กลับต้นทาง', frame);
        return this._icmpError(dev, pkt, 'ttl-exceeded', inF.ip);
      }
      const r = this._route(dev, pkt.dst);
      if (!r) {
        this._drop(dev, `ไม่มีเส้นทางไป ${pkt.dst} ใน Routing Table → แจ้ง ICMP Destination Unreachable`, frame);
        return this._icmpError(dev, pkt, 'dest-unreachable', inF.ip);
      }
      let out = Object.assign({}, pkt, { ttl: pkt.ttl - 1 });
      if (outIdx >= 0 && r.iface === outIdx && inFi !== outIdx) {
        const pubIp = dev.ifaces[outIdx].ip;
        const before = out.src;
        out = this._natOut(dev, out, pubIp);
        this._info(dev, `NAT ขาออก (PAT): เปลี่ยนต้นทาง ${before} → ${pubIp} พอร์ต ${out.data[this._natField(out)]} เพื่อออกอินเทอร์เน็ต`);
      }
      const o = dev.ifaces[r.iface];
      this._info(dev, `Routing: ${pkt.dst} → ออกทาง ${o.name}${r.connected ? ' (เครือข่ายที่ต่อตรง)' : ' ผ่าน ' + r.nextHop}  ลด TTL เหลือ ${out.ttl}`);
      this._l3Send(dev, out);
    }

    /* --------------------------- Layer 4 – 7 ----------------------------- */
    _toJob(dev, pkt) {
      const job = this.jobs[0];
      if (job && job.started && !job.done && job.dev === dev) job.onPacket(pkt);
    }

    _l4Rx(dev, pkt) {
      const d = pkt.data;
      const own = dev.ifaces.some(f => f.ip === pkt.dst) ? pkt.dst : undefined;
      if (d.flood && d.type === 'echo-request') {
        if (!dev._hits) dev._hits = new Map();
        dev._hits.set(this.tick, (dev._hits.get(this.tick) || 0) + 1);
        if (this.floodStats) this.floodStats.reached++;
      }
      if (this._overloaded(dev)) {
        if (d.flood) {
          if (this.floodStats) this.floodStats.overloadDrops++;
          if (!dev._ovTick || dev._ovTick !== this.tick) { dev._ovTick = this.tick; this._drop(dev, 'CPU 100% — ถูก Ping ท่วม (DDoS) จนรับไม่ไหว ต้องทิ้งคำขอ'); }
          return;
        }
        if (this.floodStats) this.floodStats.legitDrops++;
        return this._drop(dev, `เซิร์ฟเวอร์ทำงานหนักเกินไปจากการโจมตี (CPU 100%) → ทิ้งคำขอของผู้ใช้จริงจาก ${pkt.src}`);
      }
      if (pkt.proto === 'ICMP') {
        if (d.type === 'echo-request') {
          if (!d.flood) this._info(dev, `ได้รับ ICMP Echo Request จาก ${pkt.src} → ตอบ Echo Reply กลับ`, { accept: true });
          this._l3Send(dev, { src: own, dst: pkt.src, ttl: ROUTERS.has(dev.kind) ? 255 : 128, proto: 'ICMP', data: { type: 'echo-reply', id: d.id, seq: d.seq, flood: d.flood || undefined } });
        } else {
          if (d.flood) return;
          this._info(dev, `ได้รับ ICMP ${ICMP_NAMES[d.type]} จาก ${pkt.src}`, { accept: d.type === 'echo-reply' });
          this._toJob(dev, pkt);
        }
        return;
      }
      const sv = dev.services;
      if (pkt.proto === 'UDP' && d.dport === 53) {
        if (!sv || !sv.dns || !sv.dns.enabled) return this._drop(dev, 'เครื่องนี้ไม่ได้เปิดบริการ DNS → ทิ้ง');
        const rec = sv.dns.records.find(r => r.name === d.msg.name);
        this._info(dev, rec ? `DNS: พบ "${d.msg.name}" = ${rec.ip} → ตอบกลับ` : `DNS: ไม่พบชื่อ "${d.msg.name}" → ตอบ NXDOMAIN`, { accept: true });
        this._l3Send(dev, { src: own, dst: pkt.src, ttl: 128, proto: 'UDP', data: { sport: 53, dport: d.sport, app: 'DNS', msg: { qr: 'response', name: d.msg.name, ip: rec ? rec.ip : null } } });
        return;
      }
      if (pkt.proto === 'TCP' && d.dport === 80) {
        const reply = (flags, extra) => this._l3Send(dev, { src: own, dst: pkt.src, ttl: 128, proto: 'TCP', data: Object.assign({ sport: 80, dport: d.sport, flags }, extra) });
        if (!sv || !sv.http || !sv.http.enabled) {
          this._info(dev, 'ไม่ได้เปิดบริการ HTTP (พอร์ต 80 ปิด) → ตอบ TCP RST ปฏิเสธการเชื่อมต่อ');
          return reply('RST');
        }
        if (d.flags === 'SYN') { this._info(dev, 'TCP ขั้นที่ 1: ได้รับ SYN → ตอบ SYN+ACK', { accept: true }); return reply('SYN+ACK'); }
        if (d.flags === 'ACK') return this._info(dev, 'TCP ขั้นที่ 3: ได้รับ ACK → เชื่อมต่อสำเร็จ (3-way handshake ครบ)', { accept: true });
        if (d.app === 'HTTP') {
          this._info(dev, `Web Server ได้รับ HTTP ${d.msg.method} ${d.msg.path} → ส่งหน้าเว็บกลับ (200 OK)`, { accept: true });
          return reply('PSH+ACK', { app: 'HTTP', msg: { status: 200, statusText: 'OK', title: sv.http.title, body: sv.http.body, server: dev.name } });
        }
        return;
      }
      if (pkt.proto === 'TCP' && d.flags === 'SYN+ACK') this._info(dev, 'TCP ขั้นที่ 2: ได้รับ SYN+ACK → ตอบ ACK', { accept: true });
      this._toJob(dev, pkt);
    }

    _dhcpRx(dev, fi, frame) {
      const pkt = frame.pkt, m = pkt.data.msg, f = dev.ifaces[fi];
      const sv = dev.services && dev.services.dhcp;
      const bridged = f.ports.length > 1;
      if (m.op === 'DISCOVER' || m.op === 'REQUEST') {
        if (!sv || !sv.enabled || !isIp(f.ip) || !isIp(sv.start) || !isMask(f.mask) || !sameNet(f.ip, sv.start, f.mask)) {
          if (bridged && dev.kind !== 'gateway') return;
          return this._drop(dev, ROUTERS.has(dev.kind)
            ? 'ไม่ได้เปิด DHCP บนอินเทอร์เฟซนี้ และเราเตอร์ไม่ส่งต่อ Broadcast → ทิ้ง'
            : 'ไม่ใช่ DHCP Server → ทิ้งข้อความ DHCP', frame);
        }
        if (m.op === 'REQUEST' && m.server && m.server !== f.ip) return;
        let ip = dev.leases.get(m.chaddr);
        if (!ip) {
          const used = new Set(dev.leases.values());
          // ข้าม IP ที่มีเครื่องใช้อยู่แล้ว (รวมเครื่องที่ได้ IP ไปก่อนบันทึกงาน) ยกเว้นเครื่องที่กำลังขอ
          for (const d of this.devices.values()) d.ifaces.forEach(x => { if (x.ip && x.mac !== m.chaddr) used.add(x.ip); });
          const start = ipToInt(sv.start);
          for (let i = 0; i < (Number(sv.count) || 1); i++) {
            const cand = intToIp((start + i) >>> 0);
            if (!used.has(cand)) { ip = cand; break; }
          }
          if (!ip) return this._drop(dev, 'DHCP Pool เต็ม ไม่มี IP ให้แจกแล้ว', frame);
          dev.leases.set(m.chaddr, ip);
        }
        const op = m.op === 'DISCOVER' ? 'OFFER' : 'ACK';
        this._info(dev, `DHCP Server: ได้รับ ${m.op} → ส่ง ${op} ${op === 'OFFER' ? 'เสนอ' : 'ยืนยัน'} IP ${ip}`, { accept: true });
        this._ifaceTx(dev, fi, {
          srcMac: f.mac, dstMac: m.chaddr, type: 'IPv4',
          pkt: {
            src: f.ip, dst: ip, ttl: 128, proto: 'UDP',
            data: { sport: 67, dport: 68, app: 'DHCP', msg: { op, xid: m.xid, chaddr: m.chaddr, yiaddr: ip, mask: sv.mask || '255.255.255.0', gw: sv.gw, dns: sv.dns, server: f.ip } }
          }
        });
        return;
      }
      if (m.chaddr === f.mac) {
        this._info(dev, `ได้รับ DHCP ${m.op} : IP ${m.yiaddr}`, { accept: true });
        this._toJob(dev, pkt);
      }
    }

    /* ---------------------- คำสั่งระดับสูงที่หน้าบ้านเรียก --------------------- */
    _queue(job, onDone) { job.onDone = onDone; this.jobs.push(job); return job; }
    _dev(id) { return this.devices.get(Number(id)); }
    ping(devId, dst, count, out, onDone) { return this._queue(new PingJob(this, this._dev(devId), dst, count, out), onDone); }
    trace(devId, dst, out, onDone) { return this._queue(new TraceJob(this, this._dev(devId), dst, out), onDone); }
    browse(devId, url, out, onDone) { return this._queue(new WebJob(this, this._dev(devId), url, out, false), onDone); }
    nslookup(devId, name, out, onDone) { return this._queue(new WebJob(this, this._dev(devId), name, out, true), onDone); }
    dhcp(devId, out, onDone, fi) {
      const dev = this._dev(devId);
      if (fi === undefined) {
        fi = dev.ifaces.findIndex((f, i) => f.dhcp && this.ifaceUp(dev, i));
        if (fi < 0) fi = dev.ifaces.findIndex(f => f.dhcp);
        if (fi < 0) fi = dev.ifaces.findIndex((f, i) => this.ifaceUp(dev, i));
        if (fi < 0) fi = 0;
      }
      return this._queue(new DhcpJob(this, dev, fi, out), onDone);
    }

    /* ------------------------- ตรวจสอบการตั้งค่า --------------------------- */
    validate() {
      const issues = [];
      const add = (level, dev, msg) => issues.push({ level, dev: dev ? dev.id : null, name: dev ? dev.name : '', msg });
      const seen = new Map();
      const allIps = new Set();
      for (const d of this.devices.values()) d.ifaces.forEach(f => { if (isIp(f.ip)) allIps.add(f.ip); });

      for (const d of this.devices.values()) {
        const visible = d.ports.filter(p => !p.hidden);
        if (!d.ports.some(p => p.link) && visible.length && d.kind !== 'passive') {
          add('warn', d, d.ports.some(p => p.media === 'wlan') && !visible.some(p => p.media !== 'wlan')
            ? 'ยังไม่ได้เชื่อมต่อ Wi-Fi (ตรวจ SSID และรหัสผ่านให้ตรงกับ Access Point)'
            : 'ยังไม่ได้เชื่อมต่อสายสัญญาณ');
        }
        if (!L3.has(d.kind)) continue;
        d.ifaces.forEach((f, i) => {
          const linked = f.ports.some(pi => d.ports[pi].link);
          if (d.kind === 'switch') { if (!f.ip) return; }
          if (!f.ip) {
            if (f.dhcp) { if (linked) add('warn', d, `${f.name}: ตั้งให้รับ IP จาก DHCP แต่ยังไม่ได้รับ IP`); }
            else if (linked) add('error', d, `${f.name}: ยังไม่ได้กำหนด IP Address`);
            else if (d.ports[f.ports[0]] && d.ports[f.ports[0]].media === 'wlan' && f.ssid) add('warn', d, `${f.name}: ไม่พบ Access Point ที่ใช้ SSID "${f.ssid}" และรหัสผ่านนี้`);
            return;
          }
          if (!isIp(f.ip)) return add('error', d, `${f.name}: IP Address "${f.ip}" ผิดรูปแบบ`);
          if (!isMask(f.mask) || maskBits(f.mask) === 0) return add('error', d, `${f.name}: Subnet Mask "${f.mask}" ไม่ถูกต้อง`);
          if (maskBits(f.mask) < 31 && (f.ip === netAddr(f.ip, f.mask) || f.ip === bcastAddr(f.ip, f.mask))) {
            add('error', d, `${f.name}: ${f.ip} เป็น Network/Broadcast Address ใช้ตั้งให้เครื่องไม่ได้`);
          }
          if (seen.has(f.ip)) add('error', d, `IP ${f.ip} ซ้ำกับ ${seen.get(f.ip)} (IP Conflict)`);
          else seen.set(f.ip, d.name);
          void i;
        });
        // วงเครือข่ายซ้อนกันบนเราเตอร์ตัวเดียว
        if (ROUTERS.has(d.kind)) {
          const nets = d.ifaces.filter(f => isIp(f.ip) && isMask(f.mask));
          for (let x = 0; x < nets.length; x++) for (let y = x + 1; y < nets.length; y++) {
            const m = maskBits(nets[x].mask) < maskBits(nets[y].mask) ? nets[x].mask : nets[y].mask;
            if (sameNet(nets[x].ip, nets[y].ip, m)) add('error', d, `${nets[x].name} กับ ${nets[y].name} อยู่วงเครือข่ายเดียวกัน (เราเตอร์ 1 พอร์ตต้องเป็น 1 วง)`);
          }
        }
        if ((d.kind === 'host' || d.kind === 'switch') && d.gw) {
          const f = d.ifaces.find(x => isIp(x.ip) && isMask(x.mask));
          if (!isIp(d.gw)) add('error', d, `Default Gateway "${d.gw}" ผิดรูปแบบ`);
          else if (f && !d.ifaces.some(x => isIp(x.ip) && isMask(x.mask) && sameNet(x.ip, d.gw, x.mask))) add('error', d, `Default Gateway ${d.gw} อยู่คนละวงเครือข่ายกับเครื่อง (${netAddr(f.ip, f.mask)}/${maskBits(f.mask)})`);
          else if (f && !allIps.has(d.gw)) add('warn', d, `ไม่พบอุปกรณ์ที่ใช้ IP ${d.gw} (Default Gateway)`);
        }
      }
      for (const l of this.links.values()) {
        const st = this.linkStatus(l);
        if (!st.up && !st.stp) add('error', this.devices.get(l.a.dev), `สาย ${this.linkLabel(l)}: ${st.reason}`);
      }
      // ลูประหว่างสวิตช์/ฮับ (union-find)
      const parent = new Map();
      const find = x => { while (parent.get(x) !== x) x = parent.get(x); return x; };
      for (const d of this.devices.values()) if (d.kind === 'switch' || d.kind === 'hub' || d.kind === 'ap') parent.set(d.id, d.id);
      for (const l of this.links.values()) {
        if (!l.data || !l.up || !parent.has(l.a.dev) || !parent.has(l.b.dev)) continue;
        const ra = find(l.a.dev), rb = find(l.b.dev);
        if (ra === rb) { add('warn', this.devices.get(l.a.dev), 'พบลูประหว่างสวิตช์/ฮับ (ระบบนี้ไม่มี STP) อาจเกิด Broadcast Storm'); break; }
        parent.set(ra, rb);
      }
      return issues;
    }

    /* ------------------------------- CLI -------------------------------- */
    prompt(dev) { return dev.kind === 'host' ? `${dev.name}>` : `${dev.name}#`; }

    exec(devId, line, out) {
      const dev = this.devices.get(Number(devId));
      const text = line.trim().replace(/\s+/g, ' ');
      const low = text.toLowerCase();
      const args = text.split(' ');
      const cmd = args[0].toLowerCase();
      const pad = (s, n) => String(s).padEnd(n, ' ');
      const needIp = v => {
        if (isIp(v)) return true;
        out(v ? `"${v}" ไม่ใช่ IP Address ที่ถูกต้อง` : 'กรุณาระบุ IP Address ปลายทาง', 'err');
        return false;
      };
      const kind = dev.kind;

      if (cmd === 'help' || cmd === '?') {
        const common = ['ping <ip>              ทดสอบการเชื่อมต่อ (ICMP)', 'tracert <ip>           ดูเส้นทางที่แพ็กเก็ตวิ่งผ่าน'];
        const rt = ['show ip route          ดู Routing Table', 'show ip interface brief', 'show arp', 'show running-config', 'show controllers serial   ดูฝั่ง DCE/DTE และ Clock Rate', 'show ip nat translations', 'ip route <net> <mask> <next-hop>      เพิ่ม Static Route', 'no ip route <net> <mask> <next-hop>   ลบ Static Route'];
        const by = {
          host: common.concat(['ipconfig [/all]        ดูค่า IP ของเครื่อง', 'ipconfig /renew        ขอ IP ใหม่จาก DHCP Server', 'ipconfig /release      คืน IP ให้ DHCP Server', 'arp -a / arp -d         ดู / ล้าง ARP Table', 'nslookup <ชื่อ>         ถาม DNS Server', 'web <url>              เปิดเว็บ (DNS → TCP → HTTP)', 'terminal               เข้า CLI ของอุปกรณ์ที่ต่อสาย Console ไว้']),
          router: common.concat(rt, ['terminal               (เมื่อมีโมดูล Async) เข้า CLI ผ่านสาย Octal']),
          gateway: common.concat(rt, ['ipconfig /renew        ขอ IP ที่พอร์ต Internet/outside ใหม่', 'show dot11 associations   ดูเครื่องที่ต่อ Wi-Fi']),
          switch: common.concat(['show mac-address-table', 'clear mac-address-table', 'show interfaces status', 'show ip interface brief', 'show running-config']),
          ap: ['show dot11 associations   ดูเครื่องที่เชื่อมต่อ Wi-Fi', 'show mac-address-table'],
          hub: ['(อุปกรณ์ Layer 1 ไม่มีระบบปฏิบัติการ จึงไม่มีคำสั่ง)'],
          passive: ['(อุปกรณ์นี้ไม่มี CLI)']
        };
        by[kind].forEach(l => out('  ' + l));
        return false;
      }
      if (kind === 'hub' || kind === 'passive') { out('อุปกรณ์นี้ไม่มี Command Line', 'err'); return false; }

      if (kind !== 'ap') {
        if (cmd === 'ping') { if (!needIp(args[1])) return false; this.ping(dev.id, args[1], 4, out); return true; }
        if (cmd === 'tracert' || cmd === 'traceroute') { if (!needIp(args[1])) return false; this.trace(dev.id, args[1], out); return true; }
      }

      if (kind === 'host' || kind === 'gateway') {
        if (low === 'ipconfig /renew') {
          if (!dev.ifaces.length) { out('ไม่มีการ์ดเครือข่าย', 'err'); return false; }
          this.dhcp(dev.id, out, null, kind === 'gateway' ? 0 : undefined); return true;
        }
        if (low === 'ipconfig /release') {
          dev.ifaces.forEach(f => { if (f.dhcp) { f.ip = ''; f.mask = ''; } });
          out('คืน IP Address ที่ได้จาก DHCP แล้ว');
          return false;
        }
      }

      if (kind === 'host') {
        if (cmd === 'ipconfig') {
          const all = args[1] && args[1].toLowerCase() === '/all';
          dev.ifaces.forEach(f => {
            out(`${f.name} Connection:${this.ifaceUp(dev, dev.ifaces.indexOf(f)) ? '' : ' (Media disconnected)'}`);
            if (all) out(`   Physical Address. . . . : ${f.mac}`);
            if (all) out(`   DHCP Enabled. . . . . . : ${f.dhcp ? 'Yes' : 'No'}`);
            if (all && f.ssid) out(`   SSID. . . . . . . . . . : ${f.ssid}`);
            out(`   IPv4 Address. . . . . . : ${f.ip || '0.0.0.0'}`);
            out(`   Subnet Mask . . . . . . : ${f.mask || '0.0.0.0'}`);
          });
          out(`   Default Gateway . . . . : ${dev.gw || '0.0.0.0'}`);
          out(`   DNS Server. . . . . . . : ${dev.dns || '0.0.0.0'}`);
          return false;
        }
        if (low === 'arp -a') {
          if (!dev.arp.size) { out('No ARP Entries Found'); return false; }
          out('  Internet Address      Physical Address      Type');
          for (const [ip, e] of dev.arp) out(`  ${pad(ip, 22)}${pad(e.mac, 22)}dynamic`);
          return false;
        }
        if (low === 'arp -d') { dev.arp.clear(); out('ล้าง ARP Table แล้ว'); return false; }
        if (cmd === 'nslookup') { if (!args[1]) { out('กรุณาระบุชื่อที่ต้องการค้นหา', 'err'); return false; } this.nslookup(dev.id, args[1], out); return true; }
        if (cmd === 'web' || cmd === 'curl') { if (!args[1]) { out('กรุณาระบุ URL', 'err'); return false; } this.browse(dev.id, args[1], out); return true; }
      }

      const ifBrief = () => {
        out('Interface          IP-Address        Status');
        dev.ifaces.forEach((f, i) => {
          let st = this.ifaceUp(dev, i) ? 'up' : 'down';
          if (f.ports.length === 1) {
            const p = dev.ports[f.ports[0]];
            const l = p.link ? this.links.get(p.link) : null;
            if (l && !l.up) st = 'down (' + this.linkStatus(l).reason + ')';
          }
          out(`${pad(f.name, 19)}${pad(f.ip || 'unassigned', 18)}${st}`);
        });
      };

      if (ROUTERS.has(kind)) {
        if (low === 'show ip route') {
          out('Codes: C - connected, S - static, S* - default');
          let n = 0;
          dev.ifaces.forEach((f, i) => {
            if (!isIp(f.ip) || !isMask(f.mask) || !this.ifaceUp(dev, i)) return;
            out(`C    ${netAddr(f.ip, f.mask)}/${maskBits(f.mask)} is directly connected, ${f.name}`); n++;
          });
          dev.routes.forEach(r => { out(`S    ${r.net}/${isMask(r.mask) ? maskBits(r.mask) : '?'} via ${r.via}`); n++; });
          if (isIp(dev.gw)) { out(`S*   0.0.0.0/0 via ${dev.gw}`); n++; }
          if (!n) out('(ยังไม่มีเส้นทาง — ตั้ง IP ให้อินเทอร์เฟซและเสียบสายก่อน)');
          return false;
        }
        if (low === 'show ip interface brief' || low === 'show ip int brief') { ifBrief(); return false; }
        if (low === 'show arp' || low === 'show ip arp') {
          if (!dev.arp.size) { out('(ARP Table ว่าง)'); return false; }
          out('Address           Hardware Addr        Interface');
          for (const [ip, e] of dev.arp) out(`${pad(ip, 18)}${pad(e.mac, 21)}${dev.ifaces[e.iface] ? dev.ifaces[e.iface].name : '?'}`);
          return false;
        }
        if (low === 'show ip nat translations') {
          if (!dev.nat || !dev.nat.enabled) { out('NAT ยังไม่ได้เปิดใช้งานบนอุปกรณ์นี้'); return false; }
          if (!dev.natTable.size) { out('(ยังไม่มีรายการแปลง — ลอง ping ออกไปภายนอกก่อน)'); return false; }
          out('Pro  Inside local          Inside global');
          for (const m of dev.natTable.values()) out(`${pad(m.proto.toLowerCase(), 5)}${pad(m.ip + ':' + m.port, 22)}${m.outIp}:${m.pub}`);
          return false;
        }
        if (low.startsWith('show controllers')) {
          const serials = dev.ports.filter(p => p.media === 'serial');
          if (!serials.length) { out('อุปกรณ์นี้ไม่มีพอร์ต Serial (ลองใส่โมดูล HWIC-2T / NIM-2T)'); return false; }
          serials.forEach(p => {
            const l = p.link ? this.links.get(p.link) : null;
            let role = 'ไม่ได้เสียบสาย';
            if (l) {
              const d = this.dceEnd(l);
              const isDce = d.dev === dev.id && dev.ports[d.port] === p;
              role = isDce ? `DCE V.35, clock rate ${p.clock || 'ยังไม่ได้ตั้ง'}` : 'DTE V.35 (รับสัญญาณนาฬิกาจากฝั่ง DCE)';
            }
            out(`Interface ${p.name}: ${role}`);
          });
          return false;
        }
        const no = low.startsWith('no ip route ');
        if (no || low.startsWith('ip route ')) {
          const [net, mask, via] = args.slice(no ? 3 : 2);
          if (!isIp(net) || !isMask(mask) || !isIp(via)) { out('รูปแบบ: ip route <network> <mask> <next-hop>', 'err'); return false; }
          dev.routes = dev.routes.filter(r => !(r.net === net && r.mask === mask && r.via === via));
          if (!no) dev.routes.push({ net, mask, via });
          out(no ? 'ลบ Static Route แล้ว' : `เพิ่ม Static Route: ${net}/${maskBits(mask)} via ${via}`, 'ok');
          return false;
        }
      }

      if (kind === 'switch' || kind === 'ap' || kind === 'gateway') {
        if (low === 'show mac-address-table' || low === 'show mac address-table') {
          out('          Mac Address Table');
          out('Vlan    Mac Address          Type       Port');
          if (!dev.macTable.size) out('(ว่าง — จะเรียนรู้ MAC เมื่อมีเฟรมวิ่งผ่าน)');
          for (const [mac, p] of dev.macTable) out(`   1    ${pad(mac, 21)}DYNAMIC    ${dev.ports[p].name}`);
          return false;
        }
        if (low === 'show dot11 associations' || low === 'show wireless clients') {
          if (!dev.wifi) { out('อุปกรณ์นี้ไม่มี Wi-Fi', 'err'); return false; }
          out(`SSID: ${dev.wifi.ssid}   ความปลอดภัย: ${dev.wifi.key ? 'WPA2-PSK' : 'ไม่มีรหัสผ่าน (Open)'}`);
          const clients = this.wifiClients(dev);
          if (!clients.length) out('(ยังไม่มีเครื่องเชื่อมต่อ)');
          clients.forEach(c => out(`  ${pad(c.dev.name, 18)}${pad(c.iface.mac, 20)}${c.iface.ip || '(ยังไม่มี IP)'}`));
          return false;
        }
      }
      if (kind === 'switch') {
        if (low === 'clear mac-address-table' || low === 'clear mac address-table') { dev.macTable.clear(); out('ล้าง MAC Address Table แล้ว'); return false; }
        if (low === 'show interfaces status' || low === 'show int status') {
          out('Port        Status');
          dev.ports.forEach(p => {
            if (!p.link || p.media === 'console') return;
            const l = this.links.get(p.link), st = this.linkStatus(l);
            out(`${pad(p.name, 12)}${st.up ? 'connected' : 'notconnect (' + st.reason + ')'}`);
          });
          return false;
        }
        if (low === 'show ip interface brief' || low === 'show ip int brief') { ifBrief(); return false; }
      }
      if (low === 'show running-config' || low === 'show run') {
        out('Building configuration...');
        out(`hostname ${dev.name}`);
        dev.ifaces.forEach((f, i) => {
          out('!');
          out(`interface ${f.name}`);
          if (f.dhcp) out(' ip address dhcp');
          else if (f.ip) out(` ip address ${f.ip} ${f.mask}`);
          else out(' no ip address');
          if (f.ports.length === 1 && dev.ports[f.ports[0]].clock) out(` clock rate ${dev.ports[f.ports[0]].clock}`);
          if (dev.nat && dev.nat.enabled) out(i === this._natOutIdx(dev) ? ' ip nat outside' : ' ip nat inside');
        });
        out('!');
        if (dev.services && dev.services.dhcp && dev.services.dhcp.enabled) {
          const s = dev.services.dhcp;
          out('ip dhcp pool LAN');
          out(` network ${s.start} ${s.mask}  (เริ่มแจกที่ ${s.start} จำนวน ${s.count})`);
          if (s.gw) out(` default-router ${s.gw}`);
          if (s.dns) out(` dns-server ${s.dns}`);
          out('!');
        }
        if (dev.nat && dev.nat.enabled) out(`ip nat inside source list 1 interface ${dev.nat.outside} overload`);
        dev.routes.forEach(r => out(`ip route ${r.net} ${r.mask} ${r.via}`));
        if (isIp(dev.gw)) out(kind === 'switch' ? `ip default-gateway ${dev.gw}` : `ip route 0.0.0.0 0.0.0.0 ${dev.gw}`);
        out('end');
        return false;
      }

      out(`% ไม่รู้จักคำสั่ง "${text}" — พิมพ์ help เพื่อดูคำสั่งที่ใช้ได้`, 'err');
      return false;
    }

    wifiClients(ap) {
      const list = [];
      ap.ports.forEach(p => {
        if (p.media !== 'radio' || !p.link) return;
        const l = this.links.get(p.link);
        const c = l.a.dev === ap.id ? l.b : l.a;
        const dev = this.devices.get(c.dev);
        list.push({ dev, iface: dev.ifaces[this.ifaceOfPort(dev, c.port)] });
      });
      return list;
    }
  }

  // สร้างเครือข่ายจากข้อมูลที่บันทึกไว้ (รองรับข้อมูลรูปแบบเวอร์ชันเก่า)
  Network.load = function (data) {
    const net = new Network();
    net.scale = Number(data.scale) > 0 ? Number(data.scale) : 1;
    net.walls = Array.isArray(data.walls) ? clone(data.walls) : [];
    (data.devices || []).forEach(d => { try { net.addDevice(d); } catch (e) { /* ข้ามอุปกรณ์ที่ไม่รู้จัก */ } });
    (data.links || []).forEach(l => {
      const r = net.connect(l.a, l.aPort, l.b, l.bPort, l.cable);
      if (r.ok && Array.isArray(l.route) && l.route.length) r.link.route = clone(l.route);
    });
    net.stp = !!data.stp;
    net.syncWireless();
    return net;
  };

  return {
    Network, MODELS, CABLES, MEDIA, CATEGORIES: CAT.CATEGORIES, CABLE_ORDER: CAT.CABLE_ORDER, MODEL_ORDER: CAT.MODEL_ORDER, BROADCAST_MAC,
    isIp, isMask, maskBits, sameNet, netAddr, bcastAddr, mediaFits, cableFor, describe, MAX_LEN, WIFI_RANGE, WIFI_MIN
  };
});
