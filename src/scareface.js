// The jumpscare face: a realistic-looking horror face painted procedurally
// (shaded skin with mottling and veins, sunken black eye sockets with
// pinprick pupils, a gaping mouth with rotten teeth, blood, stringy hair),
// shown full-screen to the player who just got caught.

function rnd(seed) { let s = seed >>> 0; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// per-ghost variants of the painted fallback face
const LOOK = {
  edith: { skin: ['#c9c4b2', '#8f8d7c', '#4a4a40'], hair: 420, eye: '220,60,40', mouth: 1, tint: '#b8c4c0' },
  pete: { skin: ['#b8c8d8', '#6a7a98', '#262a40'], hair: 0, eye: '255,40,40', mouth: 1.35, tint: '#a8b8d8' },
  clank: { skin: ['#b8bcc4', '#6a6e78', '#24262c'], hair: 0, eye: '60,255,220', mouth: 0.8, tint: '#c0c8d0' },
  gloop: { skin: ['#a8d890', '#5a8a48', '#1a3014'], hair: 60, eye: '200,255,60', mouth: 1.2, tint: '#a8d0a0', slime: true },
};

export function paintScareFace(size = 1024, seed = 7, type = 'edith') {
  const L = LOOK[type] || LOOK.edith;
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'), R = rnd(seed), S = size / 1024;
  const cx = 512 * S, cy = 540 * S;
  x.fillStyle = '#020102'; x.fillRect(0, 0, size, size);
  // ---- head silhouette with pale, sickly skin
  x.save(); x.beginPath(); x.ellipse(cx, cy, 330 * S, 470 * S, 0, 0, Math.PI * 2); x.clip();
  let g = x.createRadialGradient(cx - 40 * S, cy - 120 * S, 40 * S, cx, cy, 520 * S);
  g.addColorStop(0, L.skin[0]); g.addColorStop(0.45, L.skin[1]); g.addColorStop(0.8, L.skin[2]); g.addColorStop(1, '#141410');
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  // skin mottling: many soft blotches
  for (let i = 0; i < 1400; i++) {
    const px = cx + (R() - 0.5) * 700 * S, py = cy + (R() - 0.5) * 960 * S, r = (4 + R() * 26) * S;
    const tone = R() < 0.5 ? `rgba(60,70,50,${R() * 0.08})` : `rgba(210,200,180,${R() * 0.06})`;
    const gg = x.createRadialGradient(px, py, 0, px, py, r); gg.addColorStop(0, tone); gg.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gg; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  // fine pores / grain
  const img = x.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (R() - 0.5) * 22; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  // hollow cheeks + temples (shadows)
  const shade = (px, py, rx, ry, a) => { const gg = x.createRadialGradient(px, py, 0, px, py, Math.max(rx, ry)); gg.addColorStop(0, `rgba(10,8,6,${a})`); gg.addColorStop(1, 'rgba(10,8,6,0)'); x.save(); x.translate(px, py); x.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); x.translate(-px, -py); x.fillStyle = gg; x.beginPath(); x.arc(px, py, Math.max(rx, ry), 0, 7); x.fill(); x.restore(); };
  for (const s of [-1, 1]) { shade(cx + s * 220 * S, cy + 110 * S, 120 * S, 190 * S, 0.65); shade(cx + s * 270 * S, cy - 210 * S, 90 * S, 140 * S, 0.55); shade(cx + s * 160 * S, cy + 60 * S, 40 * S, 120 * S, 0.35); }
  // veins: branching dark blue-purple lines
  const vein = (px, py, ang, len, w) => {
    x.strokeStyle = `rgba(40,30,70,${0.35 + R() * 0.25})`; x.lineWidth = w; x.lineCap = 'round';
    x.beginPath(); x.moveTo(px, py);
    for (let i = 0; i < len; i++) { ang += (R() - 0.5) * 0.7; px += Math.cos(ang) * 9 * S; py += Math.sin(ang) * 9 * S; x.lineTo(px, py); if (R() < 0.08 && w > 0.8) { x.stroke(); vein(px, py, ang + (R() - 0.5) * 2, len * 0.5, w * 0.6); x.beginPath(); x.moveTo(px, py); } }
    x.stroke();
  };
  for (let i = 0; i < 9; i++) vein(cx + (R() - 0.5) * 420 * S, cy - 300 * S + R() * 120 * S, Math.PI / 2 + (R() - 0.5), 20 + R() * 25, (1.5 + R() * 2) * S);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) vein(cx + s * (150 + R() * 60) * S, cy - 10 * S + R() * 40 * S, s > 0 ? 0.3 : Math.PI - 0.3, 14 + R() * 12, 1.4 * S);
  // ---- eyes: deep, wet black sockets with pinprick pupils
  for (const s of [-1, 1]) {
    const ex = cx + s * 125 * S, ey = cy - 70 * S;
    shade(ex, ey, 150 * S, 120 * S, 0.9);                          // bruised orbit
    g = x.createRadialGradient(ex, ey, 0, ex, ey, 92 * S); g.addColorStop(0, '#000'); g.addColorStop(0.7, '#050304'); g.addColorStop(1, 'rgba(20,10,10,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(ex, ey + 6 * S, 92 * S, 74 * S, s * 0.18, 0, 7); x.fill();
    // red rim of the lids
    x.strokeStyle = 'rgba(120,20,25,0.55)'; x.lineWidth = 6 * S; x.beginPath(); x.ellipse(ex, ey + 6 * S, 70 * S, 52 * S, s * 0.18, Math.PI * 0.05, Math.PI * 0.95); x.stroke();
    // pinprick pupil + glint
    const pg = x.createRadialGradient(ex + s * 6 * S, ey + 4 * S, 0, ex + s * 6 * S, ey + 4 * S, 22 * S); pg.addColorStop(0, 'rgba(255,240,220,0.95)'); pg.addColorStop(0.25, `rgba(${L.eye},0.85)`); pg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = pg; x.beginPath(); x.arc(ex + s * 6 * S, ey + 4 * S, 22 * S, 0, 7); x.fill();
    // black tears running down
    for (let k = 0; k < 2; k++) { const tx = ex + (R() - 0.5) * 50 * S; const tg = x.createLinearGradient(tx, ey + 50 * S, tx, ey + 330 * S); tg.addColorStop(0, 'rgba(5,0,0,0.85)'); tg.addColorStop(1, 'rgba(5,0,0,0)'); x.strokeStyle = tg; x.lineWidth = (6 + R() * 6) * S; x.beginPath(); x.moveTo(tx, ey + 50 * S); x.bezierCurveTo(tx + 6 * S, ey + 140 * S, tx - 8 * S, ey + 220 * S, tx + 4 * S, ey + 330 * S); x.stroke(); }
  }
  // ---- nose: collapsed, two dark slits
  shade(cx, cy + 80 * S, 60 * S, 40 * S, 0.5);
  for (const s of [-1, 1]) { x.fillStyle = '#0a0606'; x.beginPath(); x.ellipse(cx + s * 22 * S, cy + 95 * S, 14 * S, 22 * S, s * 0.5, 0, 7); x.fill(); }
  // ---- mouth: impossibly wide, gaping
  const my = cy + 270 * S, mw = 190 * S * L.mouth, mh = 210 * S * (0.8 + L.mouth * 0.2);
  g = x.createRadialGradient(cx, my + 20 * S, 10 * S, cx, my, mh); g.addColorStop(0, '#000'); g.addColorStop(0.6, '#120405'); g.addColorStop(1, '#3a0a0c');
  x.fillStyle = g; x.beginPath(); x.ellipse(cx, my, mw, mh, 0, 0, 7); x.fill();
  // gums
  x.fillStyle = '#5a1418'; x.beginPath(); x.ellipse(cx, my - mh * 0.72, mw * 0.92, 34 * S, 0, 0, Math.PI); x.fill(); x.beginPath(); x.ellipse(cx, my + mh * 0.74, mw * 0.85, 30 * S, 0, Math.PI, Math.PI * 2); x.fill();
  // rotten, uneven teeth
  const tooth = (tx, ty, w, h, down) => {
    const tg = x.createLinearGradient(tx, ty, tx, ty + (down ? h : -h)); tg.addColorStop(0, '#6a5a30'); tg.addColorStop(0.4, '#c8b88a'); tg.addColorStop(1, '#e8dcb8');
    x.fillStyle = tg; x.beginPath(); x.moveTo(tx - w / 2, ty); x.lineTo(tx + w / 2, ty); x.lineTo(tx + w * 0.1, ty + (down ? h : -h)); x.lineTo(tx - w * 0.15, ty + (down ? h * 0.92 : -h * 0.92)); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(40,20,10,0.6)'; x.lineWidth = 2 * S; x.stroke();
  };
  for (let i = 0; i < 12; i++) { const t = (i + 0.5) / 12 - 0.5, tx = cx + t * mw * 1.7; if (R() < 0.12) continue; tooth(tx, my - mh * 0.62 + Math.abs(t) * 60 * S, (26 + R() * 16) * S, (50 + R() * 50) * S, true); }
  for (let i = 0; i < 11; i++) { const t = (i + 0.5) / 11 - 0.5, tx = cx + t * mw * 1.6; if (R() < 0.15) continue; tooth(tx, my + mh * 0.66 - Math.abs(t) * 60 * S, (24 + R() * 14) * S, (40 + R() * 40) * S, false); }
  // saliva strings
  x.strokeStyle = 'rgba(200,200,190,0.35)'; x.lineWidth = 2 * S;
  for (let i = 0; i < 6; i++) { const sx = cx + (R() - 0.5) * mw * 1.2; x.beginPath(); x.moveTo(sx, my - mh * 0.5); x.quadraticCurveTo(sx + (R() - 0.5) * 30 * S, my + R() * 40 * S, sx + (R() - 0.5) * 20 * S, my + mh * 0.5); x.stroke(); }
  // blood from the corners of the mouth and chin
  for (let i = 0; i < 7; i++) {
    const bx = cx + (R() - 0.5) * mw * 1.6, by = my + mh * 0.6, len = (120 + R() * 260) * S, w = (6 + R() * 12) * S;
    const bg = x.createLinearGradient(bx, by, bx, by + len); bg.addColorStop(0, 'rgba(110,0,8,0.95)'); bg.addColorStop(1, 'rgba(60,0,4,0.0)');
    x.strokeStyle = bg; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(bx, by); x.bezierCurveTo(bx + 10 * S, by + len * 0.3, bx - 8 * S, by + len * 0.6, bx + 4 * S, by + len); x.stroke();
    x.fillStyle = 'rgba(110,0,8,0.9)'; x.beginPath(); x.arc(bx + 4 * S, by + len * 0.92, w * 0.7, 0, 7); x.fill();
  }
  x.restore();
  // ---- long stringy black hair falling over everything
  for (let i = 0; i < L.hair; i++) {
    const hx = cx + (R() - 0.5) * 760 * S, top = cy - 470 * S + R() * 40 * S, len = (500 + R() * 650) * S, side = hx < cx ? -1 : 1;
    if (Math.abs(hx - cx) < 170 * S && R() < 0.85) continue;          // mostly leave the face visible
    x.strokeStyle = `rgba(${4 + R() * 12},${3 + R() * 8},${3 + R() * 8},${0.5 + R() * 0.5})`; x.lineWidth = (1 + R() * 3) * S;
    x.beginPath(); x.moveTo(hx, top);
    x.bezierCurveTo(hx + side * R() * 60 * S, top + len * 0.3, hx + (R() - 0.5) * 80 * S, top + len * 0.7, hx + side * R() * 90 * S, top + len); x.stroke();
  }
  // ---- grade: harsh contrast, cold tint, vignette
  const vg = x.createRadialGradient(cx, cy, 200 * S, cx, cy, 720 * S); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.9)');
  x.fillStyle = vg; x.fillRect(0, 0, size, size);
  if (L.slime) for (let i = 0; i < 14; i++) { const sx = cx + (R() - 0.5) * 600 * S, sy = cy - 400 * S + R() * 300 * S, len = (150 + R() * 400) * S; const sg = x.createLinearGradient(sx, sy, sx, sy + len); sg.addColorStop(0, 'rgba(150,255,80,0.6)'); sg.addColorStop(1, 'rgba(150,255,80,0)'); x.strokeStyle = sg; x.lineWidth = (8 + R() * 14) * S; x.lineCap = 'round'; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + (R() - 0.5) * 20 * S, sy + len); x.stroke(); }
  x.globalCompositeOperation = 'multiply'; x.fillStyle = L.tint; x.fillRect(0, 0, size, size); x.globalCompositeOperation = 'source-over';
  return c;
}

// a real photo, made horrible: cold dead grade, black eye sockets with
// pinprick pupils, a stretched gaping mouth, black tears, blood, grain
export function horrify(img, cfg, size = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const sc = Math.max(size / img.width, size / img.height), w = img.width * sc, h = img.height * sc, ox = (size - w) / 2, oy = (size - h) / 2;
  const P = ([u, v]) => [ox + u * w, oy + v * h];
  // optional: keep only the face (soft oval), everything else goes black
  let src = img;
  if (cfg.faceMask) {
    const m = document.createElement('canvas'); m.width = img.width; m.height = img.height; const mx = m.getContext('2d');
    mx.drawImage(img, 0, 0);
    const [fx, fy, rx, ry] = cfg.faceMask, cx0 = fx * img.width, cy0 = fy * img.height, Rx = rx * img.width, Ry = ry * img.height;
    mx.globalCompositeOperation = 'destination-in';
    mx.save(); mx.translate(cx0, cy0); mx.scale(1, Ry / Rx);
    const gm = mx.createRadialGradient(0, 0, Rx * 0.82, 0, 0, Rx); gm.addColorStop(0, 'rgba(0,0,0,1)'); gm.addColorStop(1, 'rgba(0,0,0,0)');
    mx.fillStyle = gm; mx.beginPath(); mx.arc(0, 0, Rx, 0, Math.PI * 2); mx.fill(); mx.restore();
    src = m;
  }
  x.fillStyle = '#000'; x.fillRect(0, 0, size, size);
  x.filter = 'grayscale(0.75) contrast(1.45) brightness(0.8)'; x.drawImage(src, ox, oy, w, h); x.filter = 'none';
  // stretch the mouth downward so it gapes
  if (cfg.mouth) {
    const [mx, my] = P(cfg.mouth), mw = cfg.mouth[2] * w, mh = cfg.mouth[3] * h;
    const src = document.createElement('canvas'); src.width = mw * 1.4; src.height = mh * 2; src.getContext('2d').drawImage(c, mx - mw * 0.7, my - mh * 0.5, mw * 1.4, mh * 2, 0, 0, mw * 1.4, mh * 2);
    x.drawImage(src, mx - mw * 0.7, my - mh * 0.5, mw * 1.4, mh * 3.4);
    const g = x.createRadialGradient(mx, my + mh * 0.9, 0, mx, my + mh * 0.9, mw * 0.55); g.addColorStop(0, 'rgba(0,0,0,0.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(mx, my + mh * 0.9, mw * 0.5, mh * 1.3, 0, 0, 7); x.fill();
    if (cfg.blood !== false) for (let i = 0; i < 5; i++) { const bx = mx + (Math.random() - 0.5) * mw, by = my + mh * 2, len = 80 + Math.random() * 220; const bg = x.createLinearGradient(bx, by, bx, by + len); bg.addColorStop(0, 'rgba(110,0,8,0.9)'); bg.addColorStop(1, 'rgba(60,0,4,0)'); x.strokeStyle = bg; x.lineWidth = 5 + Math.random() * 9; x.lineCap = 'round'; x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + (Math.random() - 0.5) * 12, by + len); x.stroke(); }
  }
  // hollow black eyes with a glinting pinprick
  for (const e of cfg.eyes || []) {
    const [ex, ey] = P(e), r = e[2] * w;
    const g = x.createRadialGradient(ex, ey, 0, ex, ey, r * 1.9); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.95)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(ex, ey, r * 1.9, r * 1.6, 0, 0, 7); x.fill();
    const pg = x.createRadialGradient(ex, ey, 0, ex, ey, r * 0.3); pg.addColorStop(0, 'rgba(255,240,220,1)'); pg.addColorStop(0.3, 'rgba(220,40,30,0.85)'); pg.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = pg; x.beginPath(); x.arc(ex, ey, r * 0.3, 0, 7); x.fill();
    const tg = x.createLinearGradient(ex, ey + r, ex, ey + r * 7); tg.addColorStop(0, 'rgba(0,0,0,0.85)'); tg.addColorStop(1, 'rgba(0,0,0,0)');
    x.strokeStyle = tg; x.lineWidth = r * 0.35; x.beginPath(); x.moveTo(ex, ey + r); x.bezierCurveTo(ex + r * 0.2, ey + r * 3, ex - r * 0.3, ey + r * 5, ex + r * 0.1, ey + r * 7); x.stroke();
  }
  // cold, sick tint + grain + vignette
  x.globalCompositeOperation = 'multiply'; x.fillStyle = '#a8bcb4'; x.fillRect(0, 0, size, size); x.globalCompositeOperation = 'source-over';
  const id = x.getImageData(0, 0, size, size), d = id.data; for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 34; d[i] += n; d[i + 1] += n; d[i + 2] += n; } x.putImageData(id, 0, 0);
  const vg = x.createRadialGradient(size / 2, size / 2, size * 0.25, size / 2, size / 2, size * 0.72); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.92)');
  x.fillStyle = vg; x.fillRect(0, 0, size, size);
  return c;
}

// full-screen overlay that slams a ghost's face into view with a shake
export class ScareOverlay {
  constructor(renderer) {
    const el = this.el = document.createElement('div'); el.id = 'scare';
    el.innerHTML = `<canvas width="1024" height="1024"></canvas><i class="flash"></i>`;
    document.body.appendChild(el);
    this.cv = el.querySelector('canvas'); this.faces = {};
    // each ghost: its photo (if one is in media/scares) or a painted stand-in
    Promise.all(['media/scares/faces.json', 'media/scares/faces.local.json'].map(u => fetch(u).then(r => r.ok ? r.json() : {}).catch(() => ({}))))
      .then(([shared, local]) => ({ ...shared, ...local })).then(cfg => {
      for (const type of ['edith', 'pete', 'clank', 'gloop']) {
        this.faces[type] = paintScareFace(1024, 7 + type.length * 31, type);
        const c = cfg[type];
        // ghosts without a photo get a sculpted, film-graded 3D face (rendered a moment after load)
        if (!c || c.drawn || !c.eyes) continue;     // painted face (made above)
        const tryLoad = (exts) => { if (!exts.length) return; const img = new Image(); img.onload = () => { this.faces[type] = horrify(img, c); }; img.onerror = () => tryLoad(exts.slice(1)); img.src = `media/scares/${c.file || type}.${exts[0]}`; };
        tryLoad(['png', 'jpg', 'jpeg', 'webp']);
      }
    });
  }
  // the scare: a far-off flash, a split second of static, then the face
  // slams in, twitching and tearing like a broken tape, under flickering static
  play(type = 'edith', ms = 1100) {
    const f = this.faces[type] || paintScareFace(1024, 7, type);
    const el = this.el, cv = this.cv, cx = cv.getContext('2d');
    if (!this.st) { this.st = document.createElement('canvas'); this.st.className = 'static'; this.st.width = 240; this.st.height = 135; el.appendChild(this.st); }
    const st = this.st, sx = st.getContext('2d'), simg = sx.createImageData(240, 135);
    el.classList.add('on'); cancelAnimationFrame(this.raf);
    const t0 = performance.now();
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      if (t > ms / 1000) { el.classList.remove('on'); return; }
      // TV static, stronger during the gap and the glitches
      const gap = t > 0.09 && t < 0.17;
      const glitch = Math.random() < 0.18;
      for (let i = 0; i < simg.data.length; i += 4) { const v = Math.random() * 255; simg.data[i] = simg.data[i + 1] = simg.data[i + 2] = v; simg.data[i + 3] = 255; }
      sx.putImageData(simg, 0, 0);
      st.style.opacity = gap ? 1 : glitch ? 0.55 : 0.12 + Math.random() * 0.1;
      // the face: small and far, gone, then right in your face and growing
      let scale, show = true;
      if (t < 0.09) scale = 0.35 + t * 2;
      else if (gap) { show = false; scale = 1; }
      else scale = 1.15 + (t - 0.17) * 0.55;
      cx.clearRect(0, 0, 1024, 1024);
      if (show) {
        // twitch: jump to a random offset now and then
        if (glitch || !this.jx) { this.jx = (Math.random() - 0.5) * 70; this.jy = (Math.random() - 0.5) * 50; }
        cx.drawImage(f, 0, 0, 1024, 1024);
        // tear horizontal slices sideways like a damaged tape
        const slices = glitch ? 6 : 1;
        for (let k = 0; k < slices; k++) { const y = Math.random() * 1024, h = 10 + Math.random() * 60, off = (Math.random() - 0.5) * 140; cx.drawImage(f, 0, y, 1024, h, off, y, 1024, h); }
        // colour split on glitch frames
        if (glitch) { cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = 0.35; cx.drawImage(f, 14, 0, 1024, 1024); cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; }
      }
      cv.style.transform = `translate(calc(-50% + ${show ? this.jx : 0}px), calc(-50% + ${show ? this.jy : 0}px)) scale(${scale})`;
      cv.style.opacity = show ? 1 : 0;
      this.raf = requestAnimationFrame(frame);
    };
    frame();
  }
}
