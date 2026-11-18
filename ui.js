/* ==========================================================================
   SimuCore UI Kit — ตัวโหลด, Toast, กล่องยืนยัน ใช้ร่วมกันทุกหน้า
     UI.loader.show(title, steps, sub) → step(i) → done() → hide()
     UI.toast(message, 'ok' | 'err' | 'warn' | 'info')
     UI.confirm({ title, message, confirmText, danger }) → Promise<boolean>
   ========================================================================== */
(function () {
  'use strict';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  const PACKET_COLORS = ['var(--amber)', 'var(--signal)', 'var(--violet)', 'var(--fiber)', 'var(--link)'];

  /* -------------------------------- ตัวโหลด -------------------------------- */
  let L = null;
  function build() {
    if (L) return L;
    const root = el('div', 'sc-loader');
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');
    const box = el('div', 'sc-loader__box');
    const wire = el('div', 'sc-wire');
    const cable = el('div', 'sc-wire__cable');
    const packet = el('div', 'sc-wire__packet');
    cable.append(packet);
    wire.append(el('div', 'sc-wire__port'), cable, el('div', 'sc-wire__port'));
    const head = el('div');
    const title = el('div', 'sc-loader__title');
    const sub = el('div', 'sc-loader__sub');
    head.append(title, sub);
    const steps = el('ul', 'sc-steps');
    const bar = el('div', 'sc-loader__bar');
    const fill = el('span');
    bar.append(fill);
    box.append(wire, head, steps, bar);
    root.append(box);
    document.body.append(root);
    L = { root, title, sub, steps, fill, packet, items: [] };
    return L;
  }
  const loader = {
    show(title, steps, sub) {
      const l = build();
      l.title.textContent = title || 'กำลังโหลด…';
      l.sub.textContent = sub || '';
      l.steps.innerHTML = '';
      l.items = (steps || []).map(s => { const li = el('li', '', s); l.steps.append(li); return li; });
      l.steps.hidden = !l.items.length;
      l.fill.style.width = '0%';
      l.packet.style.setProperty('--packet', PACKET_COLORS[0]);
      // บังคับ reflow เพื่อให้ transition ทำงานตอนเปิด
      void l.root.offsetWidth;
      l.root.classList.add('is-on');
      if (l.items.length) this.step(0);
    },
    step(i, text) {
      const l = build();
      l.items.forEach((li, k) => { li.classList.toggle('is-done', k < i); li.classList.toggle('is-active', k === i); });
      if (text && l.items[i]) l.items[i].textContent = text;
      if (l.items.length) l.fill.style.width = `${Math.round((i / l.items.length) * 100)}%`;
      l.packet.style.setProperty('--packet', PACKET_COLORS[i % PACKET_COLORS.length]);
    },
    done(title) {
      const l = build();
      l.items.forEach(li => { li.classList.remove('is-active'); li.classList.add('is-done'); });
      l.fill.style.width = '100%';
      l.packet.style.setProperty('--packet', 'var(--link)');
      if (title) l.title.textContent = title;
    },
    fail(title, sub) {
      const l = build();
      l.items.forEach(li => { if (li.classList.contains('is-active')) { li.classList.remove('is-active'); li.classList.add('is-fail'); } });
      l.title.textContent = title;
      l.sub.textContent = sub || '';
      l.packet.style.setProperty('--packet', 'var(--fault)');
    },
    hide() { if (L) L.root.classList.remove('is-on'); },
    // เดินทีละขั้นพร้อมหน่วงเล็กน้อย ให้ผู้ใช้เห็นว่าระบบทำอะไรอยู่
    async run(title, steps, fns, sub) {
      this.show(title, steps, sub);
      for (let i = 0; i < steps.length; i++) {
        this.step(i);
        if (fns && fns[i]) await fns[i]();
        await wait(reduced ? 0 : 140);
      }
      this.done();
    }
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  /* --------------------------------- Toast --------------------------------- */
  let toastBox = null;
  function toast(message, type, ms) {
    if (!toastBox) { toastBox = el('div', 'sc-toasts'); toastBox.setAttribute('aria-live', 'polite'); document.body.append(toastBox); }
    const t = el('div', `sc-toast sc-toast--${type || 'info'}`, message);
    toastBox.append(t);
    while (toastBox.children.length > 3) toastBox.firstElementChild.remove();
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 260); }, ms || 3200);
    return t;
  }

  /* ------------------------------ กล่องยืนยัน ------------------------------ */
  function confirmDialog(o) {
    return new Promise(resolve => {
      const prevFocus = document.activeElement;
      const wrap = el('div', 'sc-dialog');
      wrap.setAttribute('role', 'alertdialog');
      wrap.setAttribute('aria-modal', 'true');
      const panel = el('div', 'sc-dialog__panel');
      const title = el('h2', 'sc-dialog__title', o.title || 'ยืนยัน');
      const msg = el('p', 'sc-dialog__msg', o.message || '');
      const actions = el('div', 'sc-dialog__actions');
      const cancel = el('button', 'sc-btn sc-btn--ghost', o.cancelText || 'ยกเลิก');
      const ok = el('button', `sc-btn ${o.danger ? 'sc-btn--danger' : 'sc-btn--primary'}`, o.confirmText || 'ยืนยัน');
      cancel.type = ok.type = 'button';
      actions.append(cancel, ok);
      panel.append(title, msg, actions);
      wrap.append(panel);
      document.body.append(wrap);
      const close = v => {
        document.removeEventListener('keydown', onKey, true);
        wrap.classList.add('is-out');
        setTimeout(() => { wrap.remove(); if (prevFocus && prevFocus.focus) prevFocus.focus(); }, 180);
        resolve(v);
      };
      const onKey = e => {
        if (e.key === 'Escape') { e.stopPropagation(); close(false); }
        if (e.key === 'Tab') { e.preventDefault(); (document.activeElement === ok ? cancel : ok).focus(); }
      };
      document.addEventListener('keydown', onKey, true);
      cancel.onclick = () => close(false);
      ok.onclick = () => close(true);
      wrap.addEventListener('click', e => { if (e.target === wrap) close(false); });
      (o.danger ? cancel : ok).focus();
    });
  }

  window.UI = { loader, toast, confirm: confirmDialog, reduced, wait };
})();
