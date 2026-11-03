// The maps. Each is its own place with edges, picked in the lobby:
//   diner    Boo's Diner — a 24-hour diner block: diner + kitchen + freezer,
//            laundromat, gas station, neon parking lot, back alley
//   camp     Camp Wannagohome — cabins, mess hall, campfire, lake + dock,
//            outhouses, archery range, trails through thick woods
//   mansion  Harrow Mansion — a big creepy house you explore inside, with a
//            hedge maze, fountain and family graveyard out front
import * as THREE from 'three';
import { PAL, toon, glow, part, rbox, sphere, cyl, cone, capsule, lathe, rng, signTex } from './toon.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ------------------------------------------------------------------ toolkit
// a wall run from A to B (world coords) with doorway gaps [[t, width], ...]
// (t = distance from A). Draws chunky wall pieces + headers, adds collision.
function wallLine(W, ax, az, bx, bz, { h = 4, t = 0.3, color = 0x8a7aa8, gaps = [], y = 0, door = 2.3, trim } = {}) {
  const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, rot = Math.atan2(-dz, dx);
  const piece = (s0, s1, y0, y1) => {
    if (s1 - s0 < 0.02 || y1 - y0 < 0.02) return;
    const m = part(rbox(s1 - s0, y1 - y0, t, 0.05), color, ax + dx * (s0 + s1) / 2, y + (y0 + y1) / 2, az + dz * (s0 + s1) / 2, null, 0.02);
    m.rotation.y = rot; W.solid(m);
  };
  let s = 0;
  for (const [c, w] of [...gaps].sort((p, q) => p[0] - q[0])) {
    piece(s, c - w / 2, 0, h); piece(c - w / 2, c + w / 2, door, h);
    W.seg(ax + dx * s, az + dz * s, ax + dx * (c - w / 2), az + dz * (c - w / 2), y - 5, y + h);
    if (trim) for (const e of [c - w / 2, c + w / 2]) { const f = part(rbox(0.16, door, t + 0.12, 0.04), trim, ax + dx * e, y + door / 2, az + dz * e, null, 0.015); f.rotation.y = rot; W.solid(f); }
    s = c + w / 2;
  }
  piece(s, len, 0, h); W.seg(ax + dx * s, az + dz * s, bx, bz, y - 5, y + h);
}

// a rectangular building shell with doors on any side and windows that glow
// sides: 'n' (z0 edge) 's' (z1 edge) 'w' (x0 edge) 'e' (x1 edge)
function shell(W, { x0, z0, x1, z1, h = 4.2, color, trim = PAL.cream, floor = 0x7a6a8a, doors = {}, windows = true, roof = 0x3a2a5a, lit = 0xffd27a, sign, signSide = 's', signBg, signFg, y = 0 }) {
  const gapsOf = (side, len) => (doors[side] || []).map(d => Array.isArray(d) ? d : [d * len, 1.8]);
  const sides = { n: [x0, z0, x1, z0], s: [x1, z1, x0, z1], w: [x0, z1, x0, z0], e: [x1, z0, x1, z1] };
  for (const [k, [ax, az, bx, bz]] of Object.entries(sides)) wallLine(W, ax, az, bx, bz, { h, color, gaps: gapsOf(k, Math.hypot(bx - ax, bz - az)), y, trim });
  // floor, roof slab with a lip, glowing windows on the outside
  W.flat(x1 - x0, z1 - z0, (x0 + x1) / 2, (z0 + z1) / 2, floor, y + 0.03);
  W.floors.push({ x0, z0, x1, z1, y });
  const r = part(rbox(x1 - x0 + 0.5, 0.35, z1 - z0 + 0.5, 0.1), roof, (x0 + x1) / 2, y + h + 0.17, (z0 + z1) / 2, null, 0.03); W.solid(r);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), toon(0x2a2040)); ceil.rotation.x = Math.PI / 2; ceil.position.set((x0 + x1) / 2, y + h - 0.01, (z0 + z1) / 2); W.root.add(ceil);
  if (windows) {
    const win = glow(lit, 1.1);
    const add = (wx, wz, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), win); m.position.set(wx, y + 2, wz); m.rotation.y = ry; W.root.add(m); const f = part(rbox(1.6, 1.4, 0.08, 0.03), trim, wx, y + 2, wz, null, 0.015); f.rotation.y = ry; W.solid(f); };
    const n = (a, b) => Math.max(1, Math.floor(Math.abs(b - a) / 5));
    for (const [side, ax, bx, zz, ry, dz] of [['s', x0, x1, z1, 0, 0.17], ['n', x0, x1, z0, Math.PI, -0.17]]) {
      const k = n(ax, bx); for (let i = 0; i < k; i++) { const wx = ax + (i + 0.5) * (bx - ax) / k; if ((doors[side] || []).some(d => Math.abs((Array.isArray(d) ? d[0] : d * (bx - ax)) + ax - wx) < 1.6)) continue; add(wx, zz + dz, ry); }
    }
  }
  if (sign) W.sign(sign, (x0 + x1) / 2, y + h - 0.1, signSide === 's' ? z1 + 0.2 : z0 - 0.2, signSide === 's' ? 0 : Math.PI, { w: Math.min(x1 - x0 - 1, 8), h: 1.3, bg: signBg, fg: signFg });
}

// furniture -------------------------------------------------------
const F = {
  table(W, x, z, w = 1.4, d = 0.9, color = PAL.wood, y = 0) { const g = new THREE.Group(); part(rbox(w, 0.1, d, 0.04), color, 0, 0.78, 0, g); for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) part(cyl(0.04, 0.05, 0.75, 6), PAL.woodDark, a * (w / 2 - 0.1), 0.38, b * (d / 2 - 0.1), g, 0.012); W.solid(W.place(g, x, z, 0, y)); W.box(x - w / 2, z - d / 2, x + w / 2, z + d / 2); },
  chair(W, x, z, r = 0, color = PAL.red, y = 0) { const g = new THREE.Group(); part(rbox(0.5, 0.08, 0.5, 0.03), color, 0, 0.46, 0, g, 0.015); part(rbox(0.5, 0.55, 0.07, 0.03), color, 0, 0.75, -0.22, g, 0.015); for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) part(cyl(0.025, 0.025, 0.45, 5), PAL.ink, a * 0.2, 0.22, b * 0.2, g, 0); W.solid(W.place(g, x, z, r, y)); },
  booth(W, x, z, r = 0, color = PAL.red, y = 0) { const g = new THREE.Group(); part(rbox(1.8, 0.45, 0.6, 0.12), color, 0, 0.23, 0, g); part(rbox(1.8, 0.75, 0.22, 0.1), color, 0, 0.75, -0.25, g); W.solid(W.place(g, x, z, r, y)); W.box(x - 0.95, z - 0.4, x + 0.95, z + 0.4); },
  stool(W, x, z, y = 0) { const g = new THREE.Group(); part(cyl(0.24, 0.22, 0.12, 14), PAL.red, 0, 0.78, 0, g); part(cyl(0.04, 0.06, 0.72, 8), PAL.metal, 0, 0.36, 0, g, 0.01); part(cyl(0.22, 0.24, 0.04, 12), PAL.metal, 0, 0.02, 0, g, 0.01); W.solid(W.place(g, x, z, 0, y)); },
  shelf(W, x, z, r = 0, w = 2, colors = [PAL.red, PAL.yellow, PAL.mint, PAL.blue, PAL.pink], y = 0, h = 2) { const g = new THREE.Group(), R = rng(Math.floor(x * 7 + z * 3) + 99); part(rbox(w, h, 0.5, 0.04), PAL.woodDark, 0, h / 2, 0, g); for (let s = 0; s < 4; s++) for (let i = 0; i < Math.floor(w / 0.25); i++) { if (R() < 0.15) continue; part(rbox(0.18, 0.28 + R() * 0.1, 0.32, 0.02), colors[(i + s) % colors.length], -w / 2 + 0.2 + i * 0.25, 0.3 + s * (h / 4.2), 0.06, g, 0.008); } W.solid(W.place(g, x, z, r, y)); const c = Math.abs(Math.cos(r)) > 0.5; W.box(x - (c ? w / 2 : 0.3), z - (c ? 0.3 : w / 2), x + (c ? w / 2 : 0.3), z + (c ? 0.3 : w / 2)); },
  bunk(W, x, z, r = 0, y = 0) { const g = new THREE.Group(); for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) part(cyl(0.05, 0.05, 2.0, 6), PAL.woodDark, a * 0.45, 1.0, b * 1.0, g, 0.012); for (const yy of [0.45, 1.5]) { part(rbox(1.0, 0.12, 2.1, 0.03), PAL.wood, 0, yy, 0, g); part(rbox(0.9, 0.14, 1.9, 0.06), 0x6a8acf, 0, yy + 0.12, 0, g); part(rbox(0.6, 0.12, 0.35, 0.06), PAL.white, 0, yy + 0.24, -0.75, g); } W.solid(W.place(g, x, z, r, y)); W.box(x - 0.55, z - 1.1, x + 0.55, z + 1.1); },
  crate(W, x, z, s = 0.8, r = 0, y) { const g = new THREE.Group(); part(rbox(s, s, s, 0.04), PAL.wood, 0, s / 2, 0, g); for (const yy of [0.12, s - 0.12]) part(rbox(s + 0.02, 0.1, s + 0.02, 0.02), PAL.woodDark, 0, yy, 0, g, 0.01); W.solid(W.place(g, x, z, r, y)); W.circle(x, z, s * 0.6); },
  barrel(W, x, z, y) { const g = new THREE.Group(); part(lathe([[0, 0], [0.38, 0], [0.45, 0.5], [0.38, 1.0], [0, 1.0]], 14), 0x8a4a2a, 0, 0, 0, g); for (const yy of [0.15, 0.85]) part(cyl(0.42, 0.42, 0.05, 14), PAL.ink, 0, yy, 0, g, 0); W.solid(W.place(g, x, z, 0, y)); W.circle(x, z, 0.45); },
  dumpster(W, x, z, r = 0, color = 0x2a6a4a) { const g = new THREE.Group(); part(rbox(2.4, 1.3, 1.4, 0.1), color, 0, 0.75, 0, g); const lid = part(rbox(2.5, 0.12, 1.5, 0.05), 0x1a3a2a, 0, 1.45, -0.05, g); lid.rotation.x = -0.25; for (const a of [-0.9, 0.9]) part(cyl(0.12, 0.12, 0.1, 10), PAL.ink, a, 0.12, 0.6, g, 0).rotation.x = Math.PI / 2; W.solid(W.place(g, x, z, r)); const c = Math.abs(Math.cos(r)) > 0.5; W.box(x - (c ? 1.25 : 0.75), z - (c ? 0.75 : 1.25), x + (c ? 1.25 : 0.75), z + (c ? 0.75 : 1.25)); },
  bench(W, x, z, r = 0) { const g = new THREE.Group(); part(rbox(1.8, 0.1, 0.45, 0.03), PAL.wood, 0, 0.5, 0, g); part(rbox(1.8, 0.4, 0.08, 0.03), PAL.wood, 0, 0.8, -0.2, g); for (const a of [-0.75, 0.75]) part(rbox(0.08, 0.5, 0.4, 0.02), PAL.ink, a, 0.25, 0, g, 0); W.solid(W.place(g, x, z, r)); W.circle(x, z, 0.6); },
  rug(W, x, z, w, d, color, y = 0) { W.flat(w, d, x, z, color, y + 0.05); },
};

// a checkerboard floor
function checker(W, w, d, x, z, a = '#1a1030', b = '#f2ecf8', tiles = 1.0, y = 0.04) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? a : b; g.fillRect(i * 16, j * 16, 16, 16); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / (tiles * 4), d / (tiles * 4)); t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return W.flat(w, d, x, z, 0, y, 0, new THREE.MeshToonMaterial({ map: t, gradientMap: toon(0).gradientMap }));
}

// a big neon sign on a pole
function neon(W, text, x, z, { bg = '#2a1a4a', fg = '#ff4ac8', h = 7, w = 5 } = {}) {
  const g = new THREE.Group(); part(cyl(0.16, 0.2, h, 10), PAL.ink, 0, h / 2, 0, g, 0); part(rbox(w + 0.4, 1.9, 0.4, 0.1), PAL.ink, 0, h + 0.6, 0, g, 0);
  W.solid(W.place(g, x, z)); W.circle(x, z, 0.3);
  for (const s of [1, -1]) W.sign(text, x, W.height(x, z) + h + 0.6, z + s * 0.21, s > 0 ? 0 : Math.PI, { w, h: 1.6, bg, fg, size: 110 });
  return W.glowPool(x, z + 2, 5, new THREE.Color(fg).getHex(), 0.25);
}

// ======================================================================
// MAP 1 — BOO'S DINER
// ======================================================================
function diner(W) {
  W.bounds = { x0: -44, x1: 44, z0: -34, z1: 30 };
  W.height = () => 0;
  W.defaultSurface = 'road';
  W.look = { fog: 0x3a2a6a, near: 24, far: 90, hemi: 1.0, moon: 1.4 };
  // ground: asphalt everywhere with grass verges
  W.ground({ size: 100, color: (x, z) => new THREE.Color(Math.abs(z) < 4.1 ? PAL.road : (x > 20 && z > 8) || (z < -31) ? PAL.grass2 : 0x4a4560), tufts: 300, avoid: (x, z) => !((x > 20 && z > 8) || z < -31) });
  for (let x = -42; x < 42; x += 4) W.flat(2, 0.22, x, 0, PAL.line, 0.03);
  for (const s of [-1, 1]) { W.solid(part(rbox(88, 0.25, 3, 0.06), PAL.walk, 0, 0.12, s * 5.5, null, 0.02)); W.floors.push({ x0: -44, x1: 44, z0: s > 0 ? 4 : -7, z1: s > 0 ? 7 : -4, y: 0.25 }); }
  // road blocks at both ends (sawhorses + cones) so the map has edges
  for (const ex of [-42, 42]) for (let z = -3.5; z <= 3.5; z += 1.75) { const g = new THREE.Group(); part(rbox(1.5, 0.25, 0.1, 0.03), PAL.orange, 0, 0.9, 0, g); for (const a of [-0.6, 0.6]) part(rbox(0.08, 0.9, 0.5, 0.02), PAL.white, a, 0.45, 0, g, 0.01); W.solid(W.place(g, ex, z, Math.PI / 2)); }
  // perimeter: brick walls behind everything
  const brick = 0x8a3a3a;
  wallLine(W, -44, -34, 44, -34, { h: 3.2, color: brick }); wallLine(W, -44, 30, 44, 30, { h: 2.4, color: brick });
  wallLine(W, -44, -34, -44, -7, { h: 3.2, color: brick }); wallLine(W, 44, -34, 44, -7, { h: 3.2, color: brick });
  wallLine(W, -44, 7, -44, 30, { h: 2.4, color: brick }); wallLine(W, 44, 7, 44, 30, { h: 2.4, color: brick });
  W.seg(-44, -7, -44, 7); W.seg(44, -7, 44, 7);
  for (let x = -40; x <= 40; x += 13) for (const s of [-1, 1]) W.lamp(x + (s > 0 ? 6 : 0), s * 6.6);

  // ---- BOO'S DINER (north side): dining room + kitchen + freezer + office
  const D = { x0: -22, x1: 2, z0: -24, z1: -8 };
  shell(W, { ...D, h: 4.6, color: 0xff8ab0, trim: PAL.white, floor: 0xe8e0f0, doors: { s: [[12, 2.2]], n: [[20, 1.6]] }, roof: 0x4ad8ff, sign: "BOO'S DINER", signBg: '#4ad8ff', signFg: '#1a1030' });
  // checker floor in the dining room
  checker(W, 23.6, 7.6, -10, -12, '#1a1030', '#f2ecf8', 0.75);
  // kitchen wall with a swing-door gap + serving hatch, freezer + office partitions
  wallLine(W, -22, -16, 2, -16, { h: 4.6, color: 0xf0d0e0, gaps: [[13, 1.6]] });
  wallLine(W, -6, -24, -6, -16, { h: 4.6, color: 0xc8e8ff, gaps: [[4, 1.4]] });     // freezer
  wallLine(W, -14, -24, -14, -16, { h: 4.6, color: 0xf0d0e0, gaps: [[2, 1.4]] });    // office
  W.sign('KITCHEN', -9, 3.1, -15.82, 0, { w: 2.2, h: 0.5, bg: '#1a1030', fg: '#ffd84a', size: 60 });
  // counter + stools, booths by the windows, jukebox
  W.solid(part(rbox(7, 1.05, 0.9, 0.12), PAL.red, -15.5, 0.53, -14.6, null)); W.solid(part(rbox(7.4, 0.1, 1.1, 0.04), PAL.white, -15.5, 1.1, -14.6, null)); W.box(-19, -15.05, -12, -14.15);
  for (let i = 0; i < 5; i++) F.stool(W, -18.4 + i * 1.5, -13.4);
  for (let i = 0; i < 5; i++) { const bx = -19 + i * 4.4; if (Math.abs(bx + 10) < 2) continue; F.booth(W, bx, -9.2, Math.PI, PAL.mint); F.booth(W, bx, -11.6, 0, PAL.mint); F.table(W, bx, -10.4, 1.6, 0.8, PAL.white); }
  { const juke = part(rbox(1.0, 1.7, 0.6, 0.35), PAL.purple, 1, 0.85, -12, null); juke.rotation.y = -Math.PI / 2; const jg = new THREE.Mesh(sphere(0.3, 12, 8), glow(PAL.pink, 1.4)); jg.position.set(0, 0.4, 0.25); juke.add(jg); W.root.add(juke); W.props.push({ kind: 'jukebox', g: juke }); W.circle(1, -12, 0.5); }
  // kitchen: grill line, fryers, steel tables, fridge, hanging pans
  for (let i = 0; i < 2; i++) { const g = new THREE.Group(); part(rbox(1.8, 0.95, 0.9, 0.06), PAL.metal, 0, 0.48, 0, g); part(rbox(1.6, 0.06, 0.7, 0.02), PAL.ink, 0, 0.99, 0, g, 0); W.solid(W.place(g, -11 + i * 2, -23.3)); W.box(-11.9 + i * 2, -23.8, -10.1 + i * 2, -22.8); }
  W.solid(part(rbox(4, 0.9, 1, 0.05), PAL.metal, -10, 0.45, -19.6, null)); W.box(-12, -20.1, -8, -19.1);
  { const g = new THREE.Group(); part(rbox(1.3, 2.3, 0.9, 0.08), PAL.white, 0, 1.15, 0, g); part(rbox(0.06, 0.9, 0.06, 0.02), PAL.metal, 0.5, 1.6, 0.47, g, 0); W.solid(W.place(g, -7, -23.3)); W.box(-7.7, -23.8, -6.3, -22.8); }
  // freezer: frosty, hanging meat
  W.flat(7.6, 7.6, -2, -20, 0xd8f0ff, 0.05);
  for (let i = 0; i < 4; i++) { const m = part(capsule(0.25, 0.7, 8), 0xc84a5a, -3.5 + i * 1, 2.3, -20.5, null, 0.02); W.root.add(m); }
  W.light(-2, 3.6, -20, 0x9ad8ff, 6, 9);
  // office: desk, filing cabinet, a TV showing static
  F.table(W, -18, -20, 1.8, 0.9, PAL.woodDark); F.chair(W, -18, -21, 0, PAL.ink);
  { const tv = part(rbox(0.8, 0.6, 0.6, 0.1), PAL.ink, -18, 1.1, -20.1, null); const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), glow(0xc8d8ff, 1)); scr.position.z = 0.31; tv.add(scr); W.root.add(tv); }
  W.light(-10, 4.0, -12, 0xffe8f0, 10, 16); W.light(-10, 4.0, -20, 0xfff0d0, 7, 10);
  W.zones.push({ id: 'diner', name: "Boo's Diner", x: -10, z: -12, r: 9 }, { id: 'kitchen', name: 'Kitchen', x: -12, z: -20, r: 6 });

  // ---- SPIN CYCLE LAUNDROMAT
  shell(W, { x0: 6, z0: -22, x1: 20, z1: -8, h: 4.2, color: 0x6ac8ff, trim: PAL.white, floor: 0xd8d0e8, doors: { s: [[7, 2]] }, roof: 0xffd84a, sign: 'SPIN CYCLE', signBg: '#ffd84a', signFg: '#1a1030' });
  for (let i = 0; i < 6; i++) for (const zz of [-21.2, -15]) { if (zz > -16 && i === 3) continue; const m = part(rbox(1.0, 1.1, 0.9, 0.12), PAL.white, 7.5 + i * 2, 0.55, zz, null); if (zz > -16) m.rotation.y = Math.PI; const d = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), glow(0x9ae8ff, 0.9)); d.position.set(0, 0.1, 0.46); m.add(d); W.root.add(m); W.props.push({ kind: 'washer', g: m }); W.box(7 + i * 2, zz - 0.5, 8 + i * 2, zz + 0.5); }
  F.table(W, 13, -18, 6, 0.9, 0xd8c0a0);
  W.light(13, 3.7, -15, 0xe8f8ff, 8, 12);
  W.zones.push({ id: 'laundromat', name: 'Spin Cycle', x: 13, z: -15, r: 7 });

  // ---- GAS STATION (south side): canopy, pumps, little shop
  { const g = new THREE.Group(); part(rbox(14, 0.6, 8, 0.12), PAL.white, 0, 4.4, 0, g); part(rbox(14.2, 0.25, 8.2, 0.08), PAL.red, 0, 4.05, 0, g); for (const [a, b] of [[-5.5, -3], [5.5, -3], [-5.5, 3], [5.5, 3]]) part(rbox(0.4, 4, 0.4, 0.06), PAL.white, a, 2, b, g); W.solid(W.place(g, -14, 16)); for (const [a, b] of [[-5.5, -3], [5.5, -3], [-5.5, 3], [5.5, 3]]) W.circle(-14 + a, 16 + b, 0.3); }
  for (const px of [-18, -10]) { const g = new THREE.Group(); part(rbox(0.9, 1.7, 0.6, 0.1), PAL.red, 0, 0.85, 0, g); const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.3), glow(0x7dff5a, 1)); scr.position.set(0, 1.3, 0.31); g.add(scr); part(cyl(0.03, 0.03, 0.8, 6), PAL.ink, 0.5, 1.1, 0, g, 0).rotation.z = 0.4; W.solid(W.place(g, px, 16)); W.box(px - 0.5, 15.7, px + 0.5, 16.3); }
  W.glowPool(-14, 16, 7, 0xfff4d8, 0.3); W.light(-14, 3.6, 16, 0xfff4e0, 10, 16);
  shell(W, { x0: -24, z0: 22, x1: -4, z1: 29, h: 3.8, color: 0xffd84a, trim: PAL.red, floor: 0xe8e0d0, doors: { n: [[10, 2]] }, roof: PAL.red, sign: 'GAS & GHOSTS', signSide: 'n', signBg: '#ff4a5a' });
  for (let i = 0; i < 3; i++) F.shelf(W, -19 + i * 5, 25.5, 0, 3);
  { const cooler = part(rbox(3, 2, 0.8, 0.08), PAL.white, -14, 1, 28.3, null); const gl = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.6), glow(0xbfe8ff, 0.8)); gl.position.z = -0.41; gl.rotation.y = Math.PI; cooler.add(gl); W.root.add(cooler); W.box(-15.5, 27.9, -12.5, 28.7); }
  W.zones.push({ id: 'gas', name: 'Gas & Ghosts', x: -14, z: 20, r: 9 });

  // ---- parking lot + neon sign (west), back alley (north), empty lot + billboard (east)
  for (let i = 0; i < 6; i++) W.flat(0.18, 4, -38 + i * 3, -18, PAL.white, 0.03);
  const cols = [PAL.red, PAL.blue, PAL.yellow, PAL.mint, PAL.pink];
  W.car(-34.5, -18, Math.PI / 2, cols[0]); W.car(-28.5, -18, -Math.PI / 2, cols[2]); W.car(30, 2.6, 0, cols[3]); W.car(-30, -2.6, Math.PI, cols[1]); W.car(-30, 18, 0.2, cols[4]);
  neon(W, "BOO'S 24HR", -28, -10, { fg: '#ff4ac8' });
  for (const [x, z, r] of [[-20, -29, 0], [-12, -29.5, 0.1], [10, -29, -0.1], [16, -29.5, 0]]) F.dumpster(W, x, z, r, [0x2a6a4a, 0x3a4a8a][Math.floor(Math.abs(x)) % 2]);
  for (const [x, z] of [[-3, -30], [-2, -31], [24, -29], [25, -30.5]]) F.crate(W, x, z, 0.8 + Math.random() * 0.3, Math.random());
  for (const [x, z] of [[-26, -26], [4, -27], [30, -25]]) W.trashcan(x, z);
  W.light(-5, 3.5, -29, 0xffa84a, 7, 12); W.glowPool(-5, -29, 4, 0xffa84a, 0.3);
  W.zones.push({ id: 'alley', name: 'Back Alley', x: 0, z: -29, r: 10 }, { id: 'lot', name: 'Parking Lot', x: -32, z: -18, r: 8 });
  { const g = new THREE.Group(); for (const a of [-3, 3]) part(cyl(0.15, 0.15, 6, 8), PAL.ink, a, 3, 0, g, 0); part(rbox(8.4, 3.4, 0.3, 0.06), PAL.white, 0, 6.5, 0, g, 0.03); W.solid(W.place(g, 32, 18, -0.3)); const ad = W.sign('GHOST PROBLEM? JUST IGNORE IT', 32, 6.5, 18.2, -0.3, { w: 8, h: 3, bg: '#7dff5a', fg: '#1a1030', size: 54 }); ad.position.set(32 + Math.sin(-0.3) * 0.2, 6.5, 18 + Math.cos(-0.3) * 0.2); }
  W.busStop(8, 6.2);
  for (const [x, z] of [[-30, 5.4], [14, -5.4]]) W.hydrant(x, z);
  for (const [x, z] of [[-24, -5.2], [4, -5.2], [20, 5.2]]) W.trashcan(x, z);
  for (const [x, z] of [[-9, -7.4], [-7.6, -7.2], [8.4, -7.3], [-4, 21.6], [-23, 21.5], [30, 9]]) W.pumpkin(x, z, 0.8 + Math.random() * 0.4);
  W.scatterTrees(10, 22, 9, 42, 28, 3, (x, z) => Math.hypot(x - 32, z - 18) < 5);
  W.van(36, 1.6, 0);
  W.spots.ghost = V(-2, 1, -20); W.spots.menu = V(-11.5, 0.25, -5);
  W.zones.push({ id: 'street', name: 'Main Street', x: 0, z: 0, r: 20 });
  W.surfaces = [{ x0: -22, x1: 20, z0: -24, z1: -8, kind: 'wood' }];
}

// ======================================================================
// MAP 2 — CAMP WANNAGOHOME
// ======================================================================
function camp(W) {
  const LAKE = { x: 24, z: 20, rx: 15, rz: 11 };
  const PADS = [[0, 0, 34], [1, -34, 18], [-28, 21, 7], [-31, -14, 8], [-30, 30, 9]];
  W.bounds = { x0: -46, x1: 46, z0: -46, z1: 46 };
  W.height = (x, z) => {
    let y = Math.sin(x * 0.09) * Math.cos(z * 0.07) * 0.8 + Math.sin(x * 0.23 + z * 0.17) * 0.25;
    for (const [px, pz, r] of PADS) y *= Math.min(1, Math.max(0, (Math.hypot(x - px, z - pz) - r * 0.6) / (r * 0.4)));   // flat pads for the camp + buildings
    const dl = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);
    if (dl < 1.3) y = y * Math.min(1, Math.max(0, (dl - 1) / 0.3)) - 2.0 * Math.max(0, 1 - dl / 1.3);
    const e = Math.max(Math.abs(x), Math.abs(z)) - 40; if (e > 0) y += e * e * 0.12;
    return y;
  };
  W.defaultSurface = 'grass';
  W.look = { fog: 0x2a3a4a, near: 18, far: 80, hemi: 0.9, moon: 1.3 };
  const grass = new THREE.Color(PAL.grass), grass2 = new THREE.Color(PAL.grass2), dirt = new THREE.Color(0x8a6a48), sand = new THREE.Color(0xd8c088);
  const path = (x, z) => { for (const [ax, az, bx, bz] of TRAILS) { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; let t = ((x - ax) * dx + (z - az) * dz) / l2; t = Math.max(0, Math.min(1, t)); if (Math.hypot(x - ax - dx * t, z - az - dz * t) < 1.6) return true; } return false; };
  const TRAILS = [[0, 0, 0, -22], [0, 0, 18, 12], [0, 0, -20, 12], [0, 0, -24, -10], [0, 0, -30, 30], [0, 0, 16, -14]];
  W.ground({ size: 110, res: 140, color: (x, z) => { const dl = Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz); if (dl < 1.08) return sand; if (Math.hypot(x, z) < 7 || path(x, z)) return dirt; return grass.clone().lerp(grass2, Math.sin(x * 0.4 + Math.cos(z * 0.3) * 2) * 0.5 + 0.5); }, tufts: 2400, avoid: (x, z) => Math.hypot(x, z) < 7 || path(x, z) });
  W.water(LAKE.x, LAKE.z, LAKE.rx, LAKE.rz, -0.6);
  // campfire with real flickering light + log seats
  { const g = new THREE.Group(); for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; part(new THREE.DodecahedronGeometry(0.22, 0), PAL.rock, Math.cos(a) * 0.75, 0.12, Math.sin(a) * 0.75, g, 0.02); } for (let i = 0; i < 4; i++) { const l = part(cyl(0.08, 0.08, 1.1, 6), PAL.woodDark, 0, 0.25, 0, g, 0.02); l.rotation.set(Math.PI / 2 - 0.5, i * Math.PI / 2, 0); } W.solid(W.place(g, 0, 0)); }
  { const flame = new THREE.Group(); for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(cone(0.32 - i * 0.07, 1.0 - i * 0.22, 8), glow([0xff5a1a, 0xffa01a, 0xfff04a][i], 1.6)); f.position.y = 0.5 + i * 0.05; flame.add(f); } W.place(flame, 0, 0); W.root.add(flame); const fire = W.light(0, W.height(0, 0) + 1.3, 0, 0xff8a3a, 30, 18); W.lights[W.lights.length - 1] = { kind: 'fire', light: fire, base: 30, flame }; W.circle(0, 0, 1); }
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.4, x = Math.cos(a) * 3.2, z = Math.sin(a) * 3.2, lg = new THREE.Group(); const l = part(cyl(0.28, 0.28, 2.2, 10), PAL.wood, 0, 0.28, 0, lg); l.rotation.z = Math.PI / 2; W.solid(W.place(lg, x, z, -a)); W.circle(x, z, 0.7); }
  // cabins with bunks, ringed round the clearing
  const cabin = (cx, cz, rot, name, color) => {
    const g = new THREE.Group(), w = 7, d = 6, h = 3.2, y = W.height(cx, cz) + 0.15;
    const c = Math.cos(rot), s = Math.sin(rot), Wp = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    const L = (a, b, gaps = []) => { const [ax, az] = Wp(...a), [bx, bz] = Wp(...b); wallLine(W, ax, az, bx, bz, { h, color, gaps, y, trim: PAL.cream }); };
    L([-w / 2, -d / 2], [w / 2, -d / 2]); L([w / 2, -d / 2], [w / 2, d / 2]); L([-w / 2, d / 2], [-w / 2, -d / 2]); L([w / 2, d / 2], [-w / 2, d / 2], [[3.5, 1.4]]);
    // gable roof
    const sh = new THREE.Shape(); sh.moveTo(-w / 2 - 0.5, 0); sh.lineTo(0, 2.2); sh.lineTo(w / 2 + 0.5, 0); sh.lineTo(-w / 2 - 0.5, 0);
    const rg = new THREE.ExtrudeGeometry(sh, { depth: d + 0.8, bevelEnabled: false }); rg.translate(0, 0, -(d + 0.8) / 2); rg.computeVertexNormals();
    const roofM = part(rg, 0x5a3a2a, 0, y + h, 0, g, 0.03); g.position.set(cx, 0, cz); g.rotation.y = rot; W.solid(g);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, d - 0.3), toon(PAL.wood)); fl.rotation.x = -Math.PI / 2; const fg = new THREE.Group(); fg.add(fl); fl.position.y = y + 0.03; fg.position.set(cx, 0, cz); fg.rotation.y = rot; W.root.add(fg);
    const [fx0, fz0] = Wp(-w / 2, -d / 2), [fx1, fz1] = Wp(w / 2, d / 2); W.floors.push({ x0: Math.min(fx0, fx1), x1: Math.max(fx0, fx1), z0: Math.min(fz0, fz1), z1: Math.max(fz0, fz1), y });
    for (const lx of [-2.4, 2.4]) { const [bx, bz] = Wp(lx, -1.2); F.bunk(W, bx, bz, rot, y); }
    const [sx, sz] = Wp(0, d / 2 + 0.25); W.sign(name, sx, y + h - 0.2, sz, rot, { w: 2.6, h: 0.6, bg: '#b07a4a', fg: '#fff', size: 70 });
    const [lx, lz] = Wp(1.2, d / 2 + 0.4); const lamp = new THREE.Mesh(sphere(0.12, 8, 6), glow(0xffc87a, 2)); lamp.position.set(lx, y + 2.6, lz); W.root.add(lamp); W.glowPool(lx, lz + 0.5 * c, 2.2, 0xffc87a, 0.3);
    W.zones.push({ id: name, name, x: cx, z: cz, r: 4 });
  };
  cabin(-14, -16, 0.6, 'CABIN 1', 0x9a5a3a); cabin(14, -18, -0.5, 'CABIN 2', 0x8a6a3a); cabin(-22, 8, 1.7, 'CABIN 3', 0x9a5a3a); cabin(-8, 22, 2.8, 'CABIN 4', 0x7a5a3a);
  // the mess hall: long tables, a serving counter, a moose head
  shell(W, { x0: -8, z0: -40, x1: 10, z1: -28, h: 4.2, color: 0x7a4a2a, trim: 0xe8c08a, floor: 0x9a7a5a, doors: { s: [[9, 2.2]] }, roof: 0x4a2a1a, sign: 'MESS HALL', signBg: '#e8c08a', signFg: '#4a2a1a', lit: 0xffc87a, y: W.height(1, -34) });
  { const y = W.height(1, -34); for (let i = 0; i < 3; i++) { F.table(W, -3 + i * 5, -34, 1.2, 4.5, PAL.wood, y); for (const s of [-1, 1]) { const b = part(rbox(0.4, 0.45, 4.5, 0.05), PAL.woodDark, -3 + i * 5 + s * 1.0, y + 0.23, -34, null); W.solid(b); } }
    W.solid(part(rbox(8, 1.0, 0.9, 0.08), PAL.metal, 1, y + 0.5, -38.6, null)); W.box(-3, -39.05, 5, -38.15);
    const moose = new THREE.Group(); part(sphere(0.6, 12, 10), 0x6a4a2a, 0, 0, 0, moose).scale.set(0.8, 0.9, 1.2); for (const s of [-1, 1]) { const ant = part(rbox(1.2, 0.1, 0.6, 0.05), PAL.cream, s * 0.9, 0.6, 0, moose, 0.015); ant.rotation.z = s * 0.4; } moose.position.set(1, y + 3.2, -39.6); W.root.add(moose);
    W.light(1, y + 3.6, -34, 0xffd8a0, 9, 14); }
  W.zones.push({ id: 'mess', name: 'Mess Hall', x: 1, z: -34, r: 8 });
  // the dock + canoes on the lake
  { const y = -0.3, dx = LAKE.x - 13, dz = LAKE.z - 2; const g = new THREE.Group(); for (let i = 0; i < 16; i++) part(rbox(0.44, 0.12, 2.2, 0.03), i % 2 ? PAL.wood : 0x9a6a3a, i * 0.47, 0, 0, g, 0.015); for (const s of [-1, 1]) for (let i = 0; i < 5; i++) part(cyl(0.1, 0.1, 1.6, 8), PAL.woodDark, i * 1.8, -0.7, s * 1.0, g, 0.015); W.solid(W.place(g, dx, dz, 0, y)); W.floors.push({ x0: dx - 0.3, x1: dx + 7.5, z0: dz - 1.1, z1: dz + 1.1, y: y + 0.06 }); }
  for (const [x, z, r, c] of [[LAKE.x + 2, LAKE.z - 4, 0.4, 0xff5a4a], [LAKE.x - 2, LAKE.z + 4, -0.8, 0x4a9aff]]) { const b = new THREE.Group(); const hull = part(lathe([[0, 0], [0.55, 0.05], [0.7, 0.4], [0, 0.4]], 10), c, 0, 0, 0, b); hull.scale.set(1, 1, 3); W.place(b, x, z, r, -0.75); W.root.add(b); W.props.push({ kind: 'boat', g: b, y: -0.75 }); }
  W.zones.push({ id: 'lake', name: 'Lake', x: LAKE.x, z: LAKE.z, r: 12 });
  // outhouses, archery range, flagpole, signposts
  for (const [x, z, r] of [[-30, 20, 0.5], [-27, 22, 0.2]]) { const g = new THREE.Group(); part(rbox(1.5, 2.4, 1.5, 0.08), PAL.wood, 0, 1.2, 0, g); part(rbox(1.8, 0.15, 1.8, 0.05), PAL.woodDark, 0, 2.5, 0, g); const m = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12, 0.6, 4.2), toon(PAL.ink)); m.position.set(0, 1.9, 0.76); g.add(m); W.solid(W.place(g, x, z, r)); W.circle(x, z, 0.9); }
  W.zones.push({ id: 'outhouse', name: 'Outhouses', x: -28, z: 21, r: 4 });
  for (let i = 0; i < 3; i++) { const g = new THREE.Group(); part(cyl(0.9, 0.9, 0.2, 20), PAL.white, 0, 1.2, 0, g).rotation.x = Math.PI / 2; for (const [r, c] of [[0.7, PAL.blue], [0.5, PAL.red], [0.25, PAL.yellow]]) { const ring = new THREE.Mesh(new THREE.CircleGeometry(r, 20), toon(c)); ring.position.set(0, 1.2, 0.11 + (0.7 - r) * 0.01); g.add(ring); } for (const s of [-1, 1]) part(cyl(0.05, 0.05, 1.6, 6), PAL.woodDark, s * 0.5, 0.6, -0.1, g, 0.01); W.solid(W.place(g, -34 + i * 3, -16, 0.3)); W.circle(-34 + i * 3, -16, 0.6); }
  W.zones.push({ id: 'archery', name: 'Archery Range', x: -30, z: -12, r: 6 });
  { const g = new THREE.Group(); part(cyl(0.06, 0.08, 9, 8), PAL.metal, 0, 4.5, 0, g, 0.01); const flag = part(rbox(1.6, 1, 0.03, 0.01), PAL.red, 0.8, 8.4, 0, g, 0.01); W.solid(W.place(g, 6, 4)); W.circle(6, 4, 0.2); }
  // entrance arch + van
  { const g = new THREE.Group(); for (const s of [-1, 1]) part(cyl(0.3, 0.35, 5, 8), PAL.woodDark, s * 3, 2.5, 0, g); part(rbox(7.4, 0.5, 0.5, 0.08), PAL.woodDark, 0, 5, 0, g); W.solid(W.place(g, -30, 30, -0.78)); for (const s of [-1, 1]) W.circle(-30 + s * 3 * Math.cos(-0.78), 30 - s * 3 * Math.sin(-0.78), 0.4);
    const sgn = W.sign('CAMP WANNAGOHOME', -30, W.height(-30, 30) + 4.2, 30, -0.78, { w: 6, h: 1.1, bg: '#b07a4a', fg: '#fff1d6', size: 74 }); }
  W.van(-36, 36, -0.78);
  // lanterns on posts along the trails
  for (const [x, z] of [[0, -11], [9, 6], [-10, 6], [-12, -5], [-15, 15], [8, -7]]) { const g = new THREE.Group(); part(cyl(0.05, 0.05, 1.6, 6), PAL.woodDark, 0, 0.8, 0, g, 0.01); const l = new THREE.Mesh(sphere(0.14, 8, 6), glow(0xffc87a, 2)); l.position.y = 1.7; g.add(l); W.solid(W.place(g, x, z)); W.glowPool(x, z, 2.4, 0xffc87a, 0.28); }
  // thick woods all round (keep clear of camp, lake, trails, buildings)
  const clear = (x, z) => Math.hypot(x, z) < 12 || Math.hypot((x - LAKE.x) / (LAKE.rx + 3), (z - LAKE.z) / (LAKE.rz + 3)) < 1 || path(x, z)
    || [[-14, -16], [14, -18], [-22, 8], [-8, 22], [1, -34], [-28, 21], [-31, -14], [-33, 33], [6, 4]].some(([a, b]) => Math.hypot(x - a, z - b) < 8) || (x > -9 && x < 11 && z > -41 && z < -27);
  W.scatterTrees(520, -54, -54, 54, 54, 21, clear, ['pine', 'pine', 'round', 'dead']);
  const R = rng(5); for (let i = 0; i < 50; i++) { const x = (R() - 0.5) * 90, z = (R() - 0.5) * 90; if (clear(x, z)) continue; R() < 0.5 ? W.rock(x, z, 0.6 + R() * 1.2, R) : W.mushroom(x, z, R); }
  for (const [x, z] of [[2.5, 1.8], [-2.8, -2], [-12.5, -13], [12, -15], [-6, 20]]) W.pumpkin(x, z, 0.9);
  W.spots.ghost = V(1, W.height(1, -34) + 1, -34); W.spots.menu = V(0, 0, 5);
  W.zones.push({ id: 'campfire', name: 'Campfire', x: 0, z: 0, r: 6 }, { id: 'woods', name: 'The Woods', x: -20, z: -30, r: 10 });
}

// ======================================================================
// MAP 3 — HARROW MANSION
// ======================================================================
function mansion(W) {
  W.bounds = { x0: -36, x1: 36, z0: -34, z1: 38 };
  W.height = () => 0;
  W.defaultSurface = 'grass';
  W.look = { fog: 0x3a2a5a, near: 20, far: 85, hemi: 0.85, moon: 1.3 };
  W.ground({ size: 90, color: (x, z) => new THREE.Color((Math.abs(x) < 2 && z > 6) ? 0x8a8090 : (z > 6 ? 0x2f6a40 : 0x3a5a3a)), tufts: 900, avoid: (x, z) => (z < 6 && Math.abs(x) < 26) || Math.abs(x) < 2 });
  // wrought-iron fence round the grounds, gate at the front
  const ironFence = (ax, az, bx, bz) => { const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 0.35), g = new THREE.Group(); for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; part(cyl(0.03, 0.03, 2.2, 6), PAL.ink, x, 1.1, z, g, 0); part(cone(0.06, 0.18, 6), PAL.ink, x, 2.25, z, g, 0); } W.solid(g); W.seg(ax, az, bx, bz); };
  ironFence(-36, 38, -3, 38); ironFence(3, 38, 36, 38); ironFence(-36, -34, -36, 38); ironFence(36, -34, 36, 38); ironFence(-36, -34, 36, -34);
  for (const s of [-1, 1]) { W.solid(part(rbox(0.8, 3.4, 0.8, 0.06), PAL.rock, s * 3.4, 1.7, 38, null)); W.circle(s * 3.4, 38, 0.5); }
  W.sign('HARROW MANSION', 0, 3.8, 38.1, 0, { w: 6, h: 0.9, bg: '#2a1a4a', fg: '#ffd84a', size: 72 });
  // gravel drive up to the door
  W.flat(4, 32, 0, 22, 0x8a8090, 0.02);
  // the house: one big footprint split into rooms by inner walls with doorways
  const X0 = -26, X1 = 26, Z0 = -28, Z1 = 6, H = 6, wallC = 0x5a4a8a, trim = 0xb8a8ff;
  shell(W, { x0: X0, z0: Z0, x1: X1, z1: Z1, h: H, color: wallC, trim, floor: 0x6a4a3a, doors: { s: [[26, 2.6]], n: [[26, 2]], e: [[21, 2.2]] }, roof: 0x2a1a4a, lit: 0x9aff8a, sign: 'KEEP OUT (PLEASE)', signBg: '#2a1a4a', signFg: '#ffd84a' });
  // a steep slate roof, two pointy towers and a columned porch so it reads as a MANSION
  { const sh = new THREE.Shape(); sh.moveTo(-(Z1 - Z0) / 2 - 0.6, 0); sh.lineTo(-3, 6); sh.lineTo(3, 6); sh.lineTo((Z1 - Z0) / 2 + 0.6, 0); sh.lineTo(-(Z1 - Z0) / 2 - 0.6, 0);
    const rg = new THREE.ExtrudeGeometry(sh, { depth: X1 - X0 + 1.2, bevelEnabled: false }); rg.translate(0, 0, -(X1 - X0 + 1.2) / 2); rg.computeVertexNormals();
    const r = part(rg, 0x3a2a5a, 0, H + 0.35, (Z0 + Z1) / 2, null, 0.04); r.rotation.y = Math.PI / 2; W.solid(r);
    for (let i = 0; i < 5; i++) { const x = X0 + 6 + i * 10; if (Math.abs(x) < 3) continue; const d = new THREE.Group(); part(rbox(1.6, 1.8, 1.4, 0.06), 0x5a4a8a, 0, 0.9, 0, d); const cap = part(cone(1.25, 1.1, 4), 0x2a1a4a, 0, 2.3, 0, d, 0.03); cap.rotation.y = Math.PI / 4; const wn = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.0), glow(0x9aff8a, 1.0)); wn.position.set(0, 0.95, 0.71); d.add(wn); W.solid(W.place(d, x, Z1 - 1.6, 0, H + 1.6)); }
    for (const sx of [X0, X1]) { const t = new THREE.Group(); part(cyl(3, 3, H + 4, 16), 0x6a5a9a, 0, (H + 4) / 2, 0, t); part(cone(3.6, 6, 16), 0x2a1a4a, 0, H + 7, 0, t, 0.04); for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + 0.4, wn = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.4), glow(k % 2 ? 0x9aff8a : 0xffd27a, 1)); wn.position.set(Math.sin(a) * 3.02, H + 1.5, Math.cos(a) * 3.02); wn.rotation.y = a; t.add(wn); } W.solid(W.place(t, sx, Z1)); W.circle(sx, Z1, 3.1); }
    // porch: steps, four columns, a little pediment over the front door
    for (let i = 0; i < 3; i++) { W.solid(part(rbox(8 - i, 0.18, 1.0, 0.03), PAL.rock, 0, 0.09 + i * 0.0, Z1 + 2.6 - i * 0.9, null)); }
    W.solid(part(rbox(8.4, 0.35, 0.35, 0.05), PAL.cream, 0, 4.2, Z1 + 2.6, null));
    for (const x of [-3.6, -1.8, 1.8, 3.6]) { W.solid(part(cyl(0.2, 0.24, 4.1, 12), PAL.cream, x, 2.05, Z1 + 2.6, null)); W.circle(x, Z1 + 2.6, 0.25); }
    const ped = new THREE.Shape(); ped.moveTo(-4.4, 0); ped.lineTo(0, 1.4); ped.lineTo(4.4, 0); ped.lineTo(-4.4, 0); const pg = new THREE.ExtrudeGeometry(ped, { depth: 3, bevelEnabled: false }); pg.computeVertexNormals(); W.solid(part(pg, 0x3a2a5a, 0, 4.37, Z1 - 0.2, null, 0.03));
    W.light(0, 3.6, Z1 + 1.6, 0x9aff8a, 7, 9); }
  // inner walls: foyer / gallery spine / rooms either side
  const IW = (ax, az, bx, bz, gaps) => wallLine(W, ax, az, bx, bz, { h: H, color: 0x6a5a9a, gaps, trim });
  IW(-6, 6, -6, -28, [[4, 2.2], [22, 2.2]]);      // west of the central hall
  IW(6, 6, 6, -28, [[4, 2.2], [22, 2.2]]);        // east of the central hall
  IW(-26, -10, -6, -10, [[10, 2.2]]); IW(6, -10, 26, -10, [[10, 2.2]]);   // split each wing front/back
  // FOYER + GALLERY (centre strip x -6..6): grand stairs (decor), portraits with eyes, rug runner
  F.rug(W, 0, -11, 3, 30, 0x7a1a2a);
  for (let i = 0; i < 7; i++) W.solid(part(rbox(5, 0.3, 0.7, 0.05), 0x7a3a5a, 0, 0.15 + i * 0.3, -24 - i * 0.6, null));
  W.box(-2.5, -28, 2.5, -23.6);
  for (const [i, pz] of [-1.5, -6, -11, -20.5, -25].entries()) for (const s of [-1, 1]) { const f = part(rbox(1.3, 1.7, 0.1, 0.04), 0xd8a84a, s * 5.8, 2.8, pz, null); f.rotation.y = -s * Math.PI / 2; const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), new THREE.MeshBasicMaterial({ map: portraitTex((i + (s > 0 ? 1 : 0)) % 2 ? 1 : -1) })); pic.position.z = 0.06; f.add(pic); W.root.add(f); }
  // BALLROOM (east front): chandelier that swings, checker dance floor, piano
  checker(W, 14, 10, 16, -2, '#2a1a3a', '#8a7ab8', 1.0, 0.05);
  for (const [x, z] of [[9.5, -7.5], [22.5, -7.5], [9.5, 3.5], [22.5, 3.5]]) { W.solid(part(cyl(0.35, 0.4, H, 14), 0x8a7ab8, x, H / 2, z, null)); W.circle(x, z, 0.4); }
  for (let i = 0; i < 6; i++) for (const zz of [-9.3, 5.3]) F.chair(W, 10 + i * 2.4, zz, zz > 0 ? Math.PI : 0, 0x6a1a4a);
  for (const [x, z] of [[7, -9], [25, -9]]) { const g = new THREE.Group(); part(cyl(0.05, 0.12, 1.6, 8), 0xd8a84a, 0, 0.8, 0, g, 0.01); for (const k of [-1, 0, 1]) { const fl = new THREE.Mesh(cone(0.06, 0.14, 6), glow(0xffd27a, 2)); fl.position.set(k * 0.25, 1.75, 0); g.add(fl); } W.solid(W.place(g, x, z)); W.circle(x, z, 0.2); }
  { const ch = new THREE.Group(); ch.position.set(16, 5.2, -2); part(new THREE.TorusGeometry(1.1, 0.07, 6, 24), 0xd8a84a, 0, 0, 0, ch).rotation.x = Math.PI / 2; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, c = new THREE.Mesh(sphere(0.1, 8, 6), glow(0xffd27a, 2)); c.position.set(Math.cos(a) * 1.1, 0.15, Math.sin(a) * 1.1); ch.add(c); } W.root.add(ch); W.props.push({ kind: 'chandelier', g: ch }); }
  { const g = new THREE.Group(); part(rbox(1.6, 1.3, 0.7, 0.05), PAL.ink, 0, 0.65, 0, g); part(rbox(1.5, 0.05, 0.3, 0.01), PAL.white, 0, 0.8, 0.45, g, 0.005); W.solid(W.place(g, 23, 2.5, Math.PI)); W.box(22, 2, 24, 3); }
  W.light(16, 4.6, -2, 0xffd8a0, 16, 18);
  // LIBRARY (west front): shelves on every wall, armchairs, a fireplace
  for (let i = 0; i < 4; i++) F.shelf(W, -24 + i * 4.6, -9.5, Math.PI, 3.6, [0x6a2a2a, 0x2a4a6a, 0x4a6a2a, 0x6a5a2a], 0, 3.2);
  for (let i = 0; i < 2; i++) F.shelf(W, -25.6, 0 - i * 4.4, Math.PI / 2, 3.6, [0x6a2a2a, 0x2a4a6a, 0x4a6a2a], 0, 3.2);
  for (const [x, z, r] of [[-16, -2, 0.4], [-12, -2, -0.4]]) { const g = new THREE.Group(); part(rbox(1.1, 0.5, 1.1, 0.18), 0x8a2a3a, 0, 0.35, 0, g); part(rbox(1.1, 1.0, 0.3, 0.16), 0x8a2a3a, 0, 0.85, -0.45, g); W.solid(W.place(g, x, z, r)); W.circle(x, z, 0.7); }
  { const fp = new THREE.Group(); part(rbox(3, 2.2, 0.8, 0.06), 0x6a6a7a, 0, 1.1, 0, fp); part(rbox(1.6, 1.2, 0.2, 0.04), PAL.ink, 0, 0.7, 0.35, fp, 0); const fire = new THREE.Mesh(cone(0.4, 0.8, 8), glow(0x7dff5a, 1.6)); fire.position.set(0, 0.6, 0.3); fp.add(fire); W.solid(W.place(fp, -14, 5.4, Math.PI)); W.box(-15.5, 5, -12.5, 5.8); W.light(-14, 1.5, 4, 0x7dff5a, 8, 10); }
  // DINING (west back): long table set for a ghostly feast
  F.table(W, -16, -19, 7, 1.6, 0x4a2a1a);
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) F.chair(W, -19 + i * 1.2, -19 + s * 1.2, s > 0 ? Math.PI : 0, 0x6a1a2a);
  for (let i = 0; i < 3; i++) { const c = part(cyl(0.05, 0.05, 0.3, 8), PAL.cream, -18.5 + i * 2.5, 0.98, -19, null, 0.01); W.root.add(c); const fl = new THREE.Mesh(cone(0.05, 0.12, 6), glow(0xffd27a, 2)); fl.position.set(-18.5 + i * 2.5, 1.2, -19); W.root.add(fl); }
  W.light(-16, 3, -19, 0xffc87a, 7, 12);
  // KITCHEN (east back): stove, pots, hanging cleavers, a big pantry
  for (let i = 0; i < 3; i++) { const g = new THREE.Group(); part(rbox(1.8, 0.95, 0.9, 0.06), 0x6a6a7a, 0, 0.48, 0, g); W.solid(W.place(g, 10 + i * 2, -27.3)); W.box(9.1 + i * 2, -27.8, 10.9 + i * 2, -26.8); }
  F.table(W, 16, -19, 3, 1.4, 0x8a7a6a);
  F.shelf(W, 25.6, -18, -Math.PI / 2, 4, [0xd8c088, 0xc8e8ff, 0xff8a6a], 0, 2.6);
  for (const [x, z] of [[11, -20], [12, -21]]) F.barrel(W, x, z);
  W.light(16, 4, -19, 0xd8ffd0, 6, 12);
  // CONSERVATORY: a glass room stuck on the east side with dead plants
  { const gx0 = 26, gx1 = 34, gz0 = -14, gz1 = 0; const glass = new THREE.MeshToonMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.25, gradientMap: toon(0).gradientMap, depthWrite: false });
    for (const [ax, az, bx, bz] of [[gx0, gz0, gx1, gz0], [gx1, gz0, gx1, gz1], [gx1, gz1, gx0, gz1]]) { const len = Math.hypot(bx - ax, bz - az), m = new THREE.Mesh(new THREE.PlaneGeometry(len, 4), glass); m.position.set((ax + bx) / 2, 2, (az + bz) / 2); m.rotation.y = Math.atan2(-(bz - az), bx - ax); W.root.add(m); W.seg(ax, az, bx, bz); for (let i = 0; i <= len; i += 2) { const p = part(rbox(0.12, 4, 0.12, 0.03), PAL.white, ax + (bx - ax) * i / len, 2, az + (bz - az) * i / len, null, 0.01); W.solid(p); } }
    W.flat(gx1 - gx0, gz1 - gz0, (gx0 + gx1) / 2, (gz0 + gz1) / 2, 0x8a9a8a, 0.03); W.floors.push({ x0: gx0, x1: gx1, z0: gz0, z1: gz1, y: 0 });
    for (let i = 0; i < 6; i++) { const x = gx0 + 1.5 + (i % 2) * 4.5, z = gz0 + 2 + Math.floor(i / 2) * 5; const g = new THREE.Group(); part(cyl(0.4, 0.3, 0.6, 10), PAL.orange, 0, 0.3, 0, g); for (let k = 0; k < 4; k++) { const st = part(cyl(0.02, 0.03, 1.2, 4), 0x6a5a3a, (k - 1.5) * 0.1, 1.0, 0, g, 0.008); st.rotation.z = (k - 1.5) * 0.3; } W.solid(W.place(g, x, z)); W.circle(x, z, 0.45); } }
  W.zones.push({ id: 'foyer', name: 'Foyer', x: 0, z: 0, r: 5 }, { id: 'gallery', name: 'Gallery', x: 0, z: -14, r: 6 }, { id: 'ballroom', name: 'Ballroom', x: 16, z: -2, r: 7 }, { id: 'library', name: 'Library', x: -16, z: -2, r: 7 }, { id: 'dining', name: 'Dining Room', x: -16, z: -19, r: 7 }, { id: 'kitchen', name: 'Kitchen', x: 16, z: -19, r: 7 }, { id: 'conservatory', name: 'Conservatory', x: 30, z: -7, r: 5 });
  // ---- the grounds: hedge maze (west), fountain (centre), family graveyard (east), dead trees
  const hedge = 0x2a5a2a, hW = (ax, az, bx, bz) => { const len = Math.hypot(bx - ax, bz - az); const m = part(rbox(len + 0.9, 2.4, 0.9, 0.3), hedge, (ax + bx) / 2, 1.2, (az + bz) / 2, null, 0.03); m.rotation.y = Math.atan2(-(bz - az), bx - ax); W.solid(m); W.seg(ax, az, bx, bz); };
  const MZ = [[-30, 10, -8, 10], [-30, 10, -30, 34], [-30, 34, -8, 34], [-8, 10, -8, 18], [-8, 24, -8, 34], [-26, 14, -12, 14], [-26, 14, -26, 30], [-22, 18, -22, 34], [-26, 30, -16, 30], [-18, 18, -18, 26], [-14, 22, -14, 30], [-18, 18, -12, 18]];
  for (const m of MZ) hW(...m);
  { const g = new THREE.Group(); part(cyl(2.6, 2.8, 0.7, 24), PAL.rock, 0, 0.35, 0, g); part(cyl(0.3, 0.4, 2, 10), PAL.rock, 0, 1.3, 0, g); part(cyl(1, 0.8, 0.3, 16), PAL.rock, 0, 2.3, 0, g); const wtr = new THREE.Mesh(new THREE.CircleGeometry(2.4, 24), glow(0x4a9aff, 0.6)); wtr.rotation.x = -Math.PI / 2; wtr.position.y = 0.66; g.add(wtr); W.solid(W.place(g, 12, 18)); W.circle(12, 18, 2.8); }
  const R = rng(9), jokes = ['HERE LIES BOB\nHE TRIED', 'I TOLD YOU\nI WAS SICK', 'BACK IN\n5 MIN', 'GHOSTED', 'BRB'];
  for (let i = 0; i < 12; i++) { const x = 20 + (i % 4) * 3.4, z = 22 + Math.floor(i / 4) * 4; const g = new THREE.Group(); part(rbox(1.0, 1.2, 0.3, 0.12), PAL.rock, 0, 0.6, 0, g); part(cyl(0.5, 0.5, 0.3, 16), PAL.rock, 0, 1.2, 0, g).rotation.x = Math.PI / 2; if (i < jokes.length) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.7), new THREE.MeshBasicMaterial({ map: epitaph(jokes[i]), transparent: true })); t.position.set(0, 0.85, 0.16); g.add(t); } g.rotation.z = (R() - 0.5) * 0.25; W.solid(W.place(g, x, z, (R() - 0.5) * 0.3)); W.circle(x, z, 0.5); }
  W.zones.push({ id: 'maze', name: 'Hedge Maze', x: -19, z: 22, r: 10 }, { id: 'graves', name: 'Family Graves', x: 25, z: 26, r: 6 });
  W.forest([[-33, 2, 1.2, 1, 'dead'], [33, 8, 1.1, 2, 'dead'], [18, 34, 1, 3, 'dead'], [-33, 36, 1.3, 4, 'dead'], [30, 36, 0.9, 5, 'dead'], [-20, 36, 1, 6, 'dead']]);
  for (const [x, z] of [[-3, 8], [3, 8], [-2.6, 30], [2.6, 30], [10, 21], [14, 15]]) W.pumpkin(x, z, 1);
  for (const [x, z] of [[-4, 14], [4, 14], [-4, 26], [4, 26]]) W.lamp(x, z, x < 0 ? 0 : Math.PI);
  W.van(8, 32, 0.1);
  W.spots.ghost = V(0, 1, -20); W.spots.menu = V(0, 0, 9);
  W.surfaces = [{ x0: X0, x1: X1, z0: Z0, z1: Z1, kind: 'wood' }];
}

export const MAPS = {
  diner: { name: "Boo's Diner", blurb: 'A 24-hour diner block: kitchen, freezer, laundromat, gas station, back alley.', build: diner },
  camp: { name: 'Camp Wannagohome', blurb: 'Cabins, a mess hall, the campfire, a lake and very thick woods.', build: camp },
  mansion: { name: 'Harrow Mansion', blurb: 'A huge creepy house full of rooms, with a hedge maze and graveyard out front.', build: mansion },
};

// little canvas helpers (shared look with the old town)
function portraitTex(s) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 176; const x = c.getContext('2d');
  x.fillStyle = s > 0 ? '#4a2a5a' : '#2a4a5a'; x.fillRect(0, 0, 128, 176);
  x.fillStyle = s > 0 ? '#ffd8b0' : '#d8ffd0'; x.beginPath(); x.ellipse(64, 74, 34, 44, 0, 0, 7); x.fill();
  x.fillStyle = '#1a1030'; x.beginPath(); x.ellipse(64, 150, 50, 40, 0, 0, 7); x.fill();
  x.fillStyle = '#fff'; for (const ex of [50, 78]) { x.beginPath(); x.arc(ex, 70, 9, 0, 7); x.fill(); }
  x.fillStyle = '#000'; for (const ex of [53, 81]) { x.beginPath(); x.arc(ex, 72, 4, 0, 7); x.fill(); }
  x.strokeStyle = '#000'; x.lineWidth = 3; x.beginPath(); x.arc(64, 92, 12, 0.2, Math.PI - 0.2); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function epitaph(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 200; const x = c.getContext('2d');
  x.fillStyle = '#3a3850'; x.font = 'bold 34px "Rajdhani", sans-serif'; x.textAlign = 'center';
  text.split('\n').forEach((l, i) => x.fillText(l, 128, 70 + i * 44));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
