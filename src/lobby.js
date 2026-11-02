// Studio 13 — Backstage: the pre-show lobby, its own room away from town.
// Walk around with your friends and pick a role by standing at a station and
// pressing E. The director pulls the big lever to go live.
import * as THREE from 'three';
import { PAL, toon, glow, part, rbox, sphere, cyl, cone, capsule, signTex, switchable } from './toon.js';
import { ghostModel, GHOST_TYPES } from './ghosts.js';
import { camcorder } from './gear.js';

export const LOT = new THREE.Vector3(-400, 0, -400);
const W = 22, D = 16, H = 6;

export class Lobby {
  constructor(game) {
    this.g = game; const r = this.root = new THREE.Group(); r.position.copy(LOT); game.scene.add(r);
    this.stations = []; this.ghostDolls = []; this.segs = [];
    const P = (x, z, y = 0) => new THREE.Vector3(LOT.x + x, LOT.y + y, LOT.z + z);
    // ---- the room: concrete floor, black studio walls, a lighting grid
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toon(0x5a5470)); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; r.add(floor);
    for (let i = -W / 2 + 2; i < W / 2; i += 2) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.04, D), toon(0x4a4460)); l.rotation.x = -Math.PI / 2; l.position.set(i, 0.003, 0); r.add(l); }
    const stage = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), new THREE.MeshToonMaterial({ map: checker(), gradientMap: toon(0).gradientMap })); stage.rotation.x = -Math.PI / 2; stage.position.set(0, 0.01, 1); r.add(stage);
    const wallMat = toon(0x2a2240);
    const wall = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat); m.position.set(x, H / 2, z); m.rotation.y = ry; m.receiveShadow = true; r.add(m); };
    wall(W, 0, -D / 2, 0); wall(W, 0, D / 2, Math.PI); wall(D, -W / 2, 0, Math.PI / 2); wall(D, W / 2, 0, -Math.PI / 2);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toon(0x1a1430)); ceil.rotation.x = Math.PI / 2; ceil.position.y = H; r.add(ceil);
    this.segs.push([-W / 2, -D / 2, W / 2, -D / 2], [-W / 2, D / 2, W / 2, D / 2], [-W / 2, -D / 2, -W / 2, D / 2], [W / 2, -D / 2, W / 2, D / 2]);
    // acoustic foam stripes + the show's logo painted big on the back wall
    for (let i = -W / 2 + 1; i < W / 2; i += 1.2) part(rbox(0.9, 1.6, 0.12, 0.05), 0x3a2e58, i, 1.0, -D / 2 + 0.07, r, 0.015);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: logoTex(), transparent: true, toneMapped: false })); logo.position.set(0, 4.2, -D / 2 + 0.05); r.add(logo);
    // lighting grid with studio lamps
    for (const z of [-4, 2]) part(cyl(0.06, 0.06, W - 2, 8), PAL.ink, 0, H - 0.6, z, r, 0).rotation.z = Math.PI / 2;
    const lampCol = [0xffd8a0, 0xffb0d0, 0xa0d8ff, 0xffd8a0];
    for (let i = 0; i < 4; i++) {
      const x = -6 + i * 4, g = new THREE.Group(); g.position.set(x, H - 0.75, -4); r.add(g);
      part(cyl(0.22, 0.32, 0.5, 12), PAL.ink, 0, 0, 0, g, 0.02).rotation.x = 0.7;
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.28, 14), glow(lampCol[i], 1.6)); lens.position.set(0, -0.2, 0.17); lens.rotation.x = 0.7 + Math.PI / 2; g.add(lens);
    }
    const key = switchable(new THREE.PointLight(0xffe0c0, 13, 26, 1.2)); key.position.set(0, H - 1.2, 0); r.add(key);
    const fill = switchable(new THREE.PointLight(0xb8a8ff, 10, 22, 1.2)); fill.position.set(-7, 3, 5); r.add(fill);
    // ---- the big monitor with the room code
    const mon = new THREE.Group(); mon.position.set(0, 0, -D / 2 + 0.8); r.add(mon);
    part(rbox(5.2, 3.0, 0.35, 0.14), PAL.ink, 0, 2.3, 0, mon, 0);
    this.codeCanvas = document.createElement('canvas'); this.codeCanvas.width = 768; this.codeCanvas.height = 432; this.codeTex = new THREE.CanvasTexture(this.codeCanvas); this.codeTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 2.7), new THREE.MeshBasicMaterial({ map: this.codeTex, toneMapped: false })); scr.position.set(0, 2.3, 0.18); mon.add(scr);
    this.segs.push([-2.7, -D / 2, -2.7, -D / 2 + 1.05], [2.7, -D / 2, 2.7, -D / 2 + 1.05], [-2.7, -D / 2 + 1.05, 2.7, -D / 2 + 1.05]);
    const label = (text, bg, x, z, y = 2.6, fg = '#fff') => { const s = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.55), new THREE.MeshBasicMaterial({ map: signTex(text, { bg, fg, size: 66, w: 440, h: 110 }), toneMapped: false })); s.position.set(x, y, z); r.add(s); return s; };
    const station = (o) => { o.pos = P(o.x, o.z); this.stations.push(o); };
    // CAMERA: a tripod with a camcorder on the stage edge
    { const g = new THREE.Group(); g.position.set(-6.5, 0, 1); r.add(g);
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2, l = part(cyl(0.03, 0.03, 1.6, 6), PAL.ink, Math.cos(a) * 0.3, 0.75, Math.sin(a) * 0.3, g, 0); l.rotation.set(Math.sin(a) * 0.2, 0, -Math.cos(a) * 0.2); }
      const c = camcorder(); c.position.y = 1.65; c.rotation.y = -0.9; g.add(c);
      label('CAMERA', '#ff4a5a', -6.5, 1);
      station({ id: 'camera', x: -6.5, z: 1.6, label: 'BE THE CAMERA OPERATOR' }); }
    // HOST: a desk with a mic on the stage
    { const g = new THREE.Group(); g.position.set(0, 0, 0.2); r.add(g);
      part(rbox(2.4, 1.0, 0.8, 0.12), PAL.red, 0, 0.5, 0, g); part(rbox(2.6, 0.1, 1.0, 0.05), PAL.cream, 0, 1.05, 0, g);
      part(cyl(0.02, 0.02, 0.35, 6), PAL.metal, 0.6, 1.25, 0, g, 0.01); part(sphere(0.07, 10, 8), 0x9a9aa8, 0.6, 1.45, 0.02, g, 0.012);
      const name = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.4), new THREE.MeshBasicMaterial({ map: signTex('YOUR HOST', { bg: '#fff1d6', fg: '#1a1030', size: 60, w: 400, h: 90 }) })); name.position.set(0, 0.55, 0.41); g.add(name);
      this.segs.push([-1.2, -0.2, 1.2, -0.2], [1.2, -0.2, 1.2, 0.6], [1.2, 0.6, -1.2, 0.6], [-1.2, 0.6, -1.2, -0.2]);
      label('HOST', '#4a9aff', 0, 0.2, 2.6);
      station({ id: 'host', x: 0, z: 1.3, label: 'BE A HOST' }); }
    // GHOST: four costumes floating over plinths along the right wall
    Object.keys(GHOST_TYPES).forEach((type, i) => {
      const x = W / 2 - 1.6, z = -4.5 + i * 2.6, g = new THREE.Group(); g.position.set(x, 0, z); r.add(g);
      part(cyl(0.55, 0.62, 0.45, 16), 0x2a1a4a, 0, 0.22, 0, g);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.04, 6, 24), glow(PAL.slime, 1.2)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.46; g.add(ring);
      const m = ghostModel(type); m.group.scale.multiplyScalar(0.55); m.group.position.y = 0.5; m.group.rotation.y = -Math.PI / 2; g.add(m.group);
      const nm = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.36), new THREE.MeshBasicMaterial({ map: signTex(GHOST_TYPES[type].name.toUpperCase(), { bg: '#2a1a4a', fg: '#7dff5a', size: 48, w: 480, h: 100 }), toneMapped: false })); nm.position.set(x - 0.75, 2.3, z); nm.rotation.y = -Math.PI / 2; r.add(nm);
      this.ghostDolls.push({ type, g: m.group, m });
      this.segs.push([x - 0.6, z - 0.6, x - 0.6, z + 0.6]);
      station({ id: 'ghost', type, x: x - 1.3, z, label: `PLAY AS ${GHOST_TYPES[type].name.toUpperCase()}` });
    });
    label('PLAY THE GHOST', '#2a1a4a', W / 2 - 0.1, 0, 4.2, '#7dff5a').rotation.y = -Math.PI / 2;
    // WARDROBE: costume rack + light-up vanity mirror on the left wall
    { const g = new THREE.Group(); g.position.set(-W / 2 + 1.2, 0, -3.5); r.add(g);
      part(cyl(0.04, 0.04, 2.2, 8), PAL.metal, 0, 1.1, -0.8, g, 0.01); part(cyl(0.04, 0.04, 2.2, 8), PAL.metal, 0, 1.1, 0.8, g, 0.01); part(cyl(0.04, 0.04, 1.7, 8), PAL.metal, 0, 2.2, 0, g, 0.01).rotation.x = Math.PI / 2;
      [PAL.red, PAL.mint, PAL.yellow, PAL.blue, PAL.pink].forEach((c, i) => { const shirt = part(rbox(0.5, 0.75, 0.12, 0.08), c, 0.05, 1.75, -0.6 + i * 0.3, g, 0.015); shirt.rotation.y = Math.PI / 2; });
      const mir = new THREE.Group(); mir.position.set(0, 1.6, 2.2); g.add(mir);
      part(rbox(0.12, 1.6, 1.2, 0.04), PAL.yellow, 0, 0, 0, mir); const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), new THREE.MeshBasicMaterial({ color: 0xbfe8ff })); glass.rotation.y = Math.PI / 2; glass.position.x = 0.07; mir.add(glass);
      for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(sphere(0.06, 8, 6), glow(0xfff0c0, 1.8)); b.position.set(0.08, 0.75, -0.5 + i * 0.2); mir.add(b); }
      this.segs.push([-W / 2 + 1.4, -4.5, -W / 2 + 1.4, -1.0]);
      label('WARDROBE', '#ffd84a', -W / 2 + 0.1, -2.5, 3.6, '#1a1030').rotation.y = Math.PI / 2;
      station({ id: 'wardrobe', x: -W / 2 + 2.6, z: -2.5, label: 'CHANGE OUTFIT' }); }
    // GO LIVE: a big red button on a pedestal by the exit doors
    { const g = new THREE.Group(); g.position.set(0, 0, D / 2 - 2.2); r.add(g);
      part(rbox(1.0, 1.1, 1.0, 0.1), PAL.ink, 0, 0.55, 0, g, 0);
      part(cyl(0.38, 0.4, 0.1, 18), PAL.yellow, 0, 1.15, 0, g, 0.015);
      const btn = part(cyl(0.3, 0.3, 0.18, 18), PAL.red, 0, 1.25, 0, g, 0.02); this.leverArm = btn; btn.userData.y = 1.25;
      const glowRing = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 24), glow(PAL.red, 1.6)); glowRing.rotation.x = Math.PI / 2; glowRing.position.y = 1.16; g.add(glowRing);
      this.segs.push([-0.5, D / 2 - 2.7, 0.5, D / 2 - 2.7], [0.5, D / 2 - 2.7, 0.5, D / 2 - 1.7], [0.5, D / 2 - 1.7, -0.5, D / 2 - 1.7], [-0.5, D / 2 - 1.7, -0.5, D / 2 - 2.7]);
      label('GO LIVE', '#ff4a5a', 0, D / 2 - 2.2, 2.4);
      station({ id: 'live', x: 0, z: D / 2 - 3.2, label: 'PRESS TO GO LIVE' }); }
    // exit doors with an ON AIR light above them
    { const g = new THREE.Group(); g.position.set(0, 0, D / 2 - 0.06); r.add(g);
      for (const s of [-1, 1]) part(rbox(1.2, 2.8, 0.1, 0.05), 0x4a4a5a, s * 0.62, 1.4, 0, g);
      const oa = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.45), new THREE.MeshBasicMaterial({ map: signTex('ON AIR', { bg: '#ff4a5a', size: 70, w: 320, h: 90 }), toneMapped: false })); oa.position.set(0, 3.2, -0.08); oa.rotation.y = Math.PI; g.add(oa); this.onAir = oa; }
    // couches + snack table + vending machine so it feels like a green room
    { const g = new THREE.Group(); g.position.set(-6, 0, 5.6); r.add(g);
      part(rbox(3.2, 0.5, 1.0, 0.18), PAL.purple, 0, 0.3, 0, g); part(rbox(3.2, 0.9, 0.3, 0.16), PAL.purple, 0, 0.75, 0.38, g);
      for (const s of [-1, 1]) part(rbox(0.35, 0.75, 1.0, 0.16), 0x7a4ad8, s * 1.65, 0.5, 0, g);
      this.segs.push([-7.8, 5.0, -4.2, 5.0], [-4.2, 5.0, -4.2, 6.2], [-7.8, 5.0, -7.8, 6.2]); }
    { const g = new THREE.Group(); g.position.set(6.5, 0, 5.8); r.add(g);
      part(rbox(1.2, 2.1, 0.9, 0.12), PAL.blue, 0, 1.05, 0, g); const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.3), glow(0xbfe8ff, 0.8)); win.position.set(-0.1, 1.2, -0.46); win.rotation.y = Math.PI; g.add(win);
      for (let i = 0; i < 9; i++) { const can = part(cyl(0.05, 0.05, 0.14, 8), [PAL.red, PAL.yellow, PAL.mint][i % 3], -0.35 + (i % 3) * 0.17, 0.75 + Math.floor(i / 3) * 0.35, -0.38, g, 0.008); }
      this.segs.push([5.9, 5.35, 7.1, 5.35], [7.1, 5.35, 7.1, 6.25], [5.9, 5.35, 5.9, 6.25]); }
    this.spawn = P(0, 3.4);
    this.tvCam = { pos: P(5, 4.6, 3.2), look: P(-1, 1.2, 0) };
  }

  near(p) { let b = null, bd = 1.8; for (const s of this.stations) { const d = Math.hypot(p.x - s.pos.x, p.z - s.pos.z); if (d < bd) { bd = d; b = s; } } return b; }
  contains(p) { return Math.abs(p.x - LOT.x) < W && Math.abs(p.z - LOT.z) < D; }

  collide(p, r) {
    const v = { x: p.x - LOT.x, z: p.z - LOT.z };
    for (const [ax, az, bx, bz] of this.segs) {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1e-9; let t = ((v.x - ax) * dx + (v.z - az) * dz) / l2; t = Math.max(0, Math.min(1, t));
      const ex = v.x - (ax + dx * t), ez = v.z - (az + dz * t), d2 = ex * ex + ez * ez;
      if (d2 < r * r && d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; v.x += ex * k; v.z += ez * k; }
    }
    v.x = Math.max(-W / 2 + r, Math.min(W / 2 - r, v.x)); v.z = Math.max(-D / 2 + r, Math.min(D / 2 - r, v.z));
    p.x = v.x + LOT.x; p.z = v.z + LOT.z;
  }

  drawCode(code, crew, audience, ghost, cam) {
    const x = this.codeCanvas.getContext('2d'), w = 768, h = 432;
    x.fillStyle = '#1a1030'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ff4a5a'; x.fillRect(0, 0, w, 74); x.fillStyle = '#fff'; x.font = '52px "Luckiest Guy", Anton'; x.textAlign = 'center'; x.fillText('PRE-SHOW', w / 2, 56);
    x.font = '600 34px Fredoka, Rajdhani'; x.fillStyle = '#9a8fb0'; x.fillText('ROOM CODE', w / 2, 132);
    x.font = '150px "Luckiest Guy", VT323'; x.fillStyle = '#7dff5a'; x.fillText(code, w / 2, 270);
    x.font = '600 32px Fredoka, Rajdhani'; x.fillStyle = '#fff'; x.fillText(`${crew} crew  ·  ${audience} watching from home`, w / 2, 336);
    x.fillStyle = '#ffd84a'; x.fillText(`camera: ${cam || 'nobody yet'}  ·  ghost: ${ghost}`, w / 2, 388);
    this.codeTex.needsUpdate = true;
  }

  update(dt, t) {
    this.ghostDolls.forEach((d, i) => { d.g.position.y = 0.5 + Math.sin(t * 2 + i) * 0.08; d.g.rotation.y = -Math.PI / 2 + Math.sin(t * 0.7 + i) * 0.5; });
    if (this.onAir) this.onAir.material.opacity = 1;
  }
}

function checker() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#1a1030' : '#fff1d6'; x.fillRect(i * 16, j * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}
function logoTex() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 250; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const draw = () => {
    const x = c.getContext('2d'); x.clearRect(0, 0, 1024, 250);
    x.font = '118px "Luckiest Guy"'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.lineWidth = 20; x.strokeStyle = '#1a1030'; x.strokeText('GHOST HUNTERS', 24, 130); x.fillStyle = '#fff1d6'; x.fillText('GHOST HUNTERS', 24, 130);
    const tw = x.measureText('GHOST HUNTERS').width;
    x.fillStyle = '#ff4a5a'; x.beginPath(); x.roundRect(54 + tw, 58, 160, 130, 24); x.fill(); x.fillStyle = '#fff'; x.font = '96px "Luckiest Guy"'; x.fillText('TV', 80 + tw, 130);
    t.needsUpdate = true;
  };
  draw(); document.fonts?.ready.then(() => document.fonts.load('118px "Luckiest Guy"')).then(draw);
  return t;
}
