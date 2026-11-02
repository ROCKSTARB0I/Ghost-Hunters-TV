// Keyboard + mouse, with a drag-to-look fallback when pointer lock is
// blocked (embedded browsers, iframes).
export class Input {
  constructor(el) {
    this.el = el; this.keys = new Set(); this.pressed = new Set(); this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false; this.dragging = false; this.mouse = new Set(); this.enabled = false;
    this.sens = Number(localStorage.getItem('da_sens') || 1);
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.enabled && ['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.clear(); });
    el.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.mouse.add(e.button); this.pressed.add('Mouse' + e.button);
      if (!this.locked) {
        try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {}
        this.dragging = true;
      }
    });
    addEventListener('mouseup', (e) => { this.mouse.delete(e.button); this.dragging = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === el; });
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || this.dragging) { this.dx += e.movementX; this.dy += e.movementY; }
    });
    el.addEventListener('wheel', (e) => { if (this.enabled) { this.wheel += Math.sign(e.deltaY); e.preventDefault(); } }, { passive: false });
  }
  down(c) { return this.keys.has(c); }
  hit(c) { return this.pressed.has(c); }
  look() { const r = [this.dx * 0.0022 * this.sens, this.dy * 0.0022 * this.sens]; this.dx = this.dy = 0; return r; }
  endFrame() { this.pressed.clear(); this.wheel = 0; }
  release() { if (document.pointerLockElement) document.exitPointerLock(); }
}
