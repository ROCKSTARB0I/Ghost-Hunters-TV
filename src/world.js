// The world engine: loads ONE map at a time (maps.js) and owns terrain
// height, collision, line of sight and the shared building blocks maps are
// made from (buildings, lamps, cars, fences, trees, water, the TV van).
import * as THREE from 'three';
import { PAL, toon, glow, part, rbox, sphere, cyl, cone, capsule, lathe, outline, INK, Batch, signTex, rng, switchable } from './toon.js';
import { MAPS } from './maps.js';

let active = null;
// ground height of whichever map is loaded (other modules import this)
export function groundY(x, z) { return active ? active.height(x, z) : 0; }
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export { smooth };

export class World {
  constructor(scene) {
    this.scene = scene; this.root = null;
    this.reset();
  }

  reset() {
    if (this.root) { this.scene.remove(this.root); this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.batch = new Batch();
    this.segs = []; this.circles = []; this.boxes = []; this.floors = []; this.lights = []; this.spots = {}; this.zones = []; this.props = []; this.doors = []; this.waters = [];
    this.grid = new Map();
    this.height = () => 0;
    this.bounds = { x0: -60, x1: 60, z0: -60, z1: 60 };
    this.look = { fog: 0x4a3a7a, near: 28, far: 110, hemi: 1.1, moon: 1.6 };
  }

  // load a map by id ('diner' | 'camp' | 'mansion')
  build(mapId = 'diner') {
    this.reset(); active = this; this.mapId = mapId;
    const M = MAPS[mapId] || MAPS.diner;
    this.info = M; M.build(this);
    this.batch.build(this.root);
    this.index();
    return this;
  }

  place(g, x, z, r = 0, y) { g.position.set(x, y ?? this.height(x, z), z); g.rotation.y = r; return g; }

  floorAt(x, z, y = 0) {
    let best = this.height(x, z);
    for (const f of this.floors) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 && f.y <= y + 0.6) best = Math.max(best, f.y);
    return best;
  }
  inWater(x, z) { for (const w of this.waters) if (((x - w.x) / w.rx) ** 2 + ((z - w.z) / w.rz) ** 2 < 1 && this.height(x, z) < w.y) return true; return false; }
  surface(p) { for (const s of this.surfaces || []) if (p.x > s.x0 && p.x < s.x1 && p.z > s.z0 && p.z < s.z1) return s.kind; return this.defaultSurface || 'grass'; }

  collide(p, r, y = 0) {
    for (const o of this.near(p.x, p.z)) {
      if (o.c) { const dx = p.x - o.c.x, dz = p.z - o.c.z, d = Math.hypot(dx, dz), m = r + o.c.r; if (d < m && d > 1e-6) { p.x += dx / d * (m - d); p.z += dz / d * (m - d); } }
      else if (o.b) {
        const b = o.b, cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1)), dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 < r * r) { if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x += dx / d * (r - d); p.z += dz / d * (r - d); } else { p.x += r; } }
      } else if (o.s) {
        const s = o.s; if (y < s.y0 || y > s.y1) continue;
        const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz; let t = ((p.x - s.ax) * dx + (p.z - s.az) * dz) / l2; t = Math.max(0, Math.min(1, t));
        const ex = p.x - (s.ax + dx * t), ez = p.z - (s.az + dz * t), d2 = ex * ex + ez * ez;
        if (d2 < r * r && d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += ex * k; p.z += ez * k; }
      }
    }
    const B = this.bounds; p.x = Math.max(B.x0, Math.min(B.x1, p.x)); p.z = Math.max(B.z0, Math.min(B.z1, p.z));
  }

  // ------------------------------------------------------------ generic pieces maps are made of
  // the ground: a height-mapped sheet coloured per vertex, with grass tufts
  ground({ size = 140, cx = 0, cz = 0, res = 120, color, tufts = 1800, tuftColor = 0x4cb05a, avoid = () => false }) {
    const g = new THREE.PlaneGeometry(size, size, res, res); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, z = p.getZ(i) + cz; p.setX(i, x); p.setZ(i, z); p.setY(i, this.height(x, z));
      const c = color(x, z); col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon(0xffffff).gradientMap }));
    m.receiveShadow = true; this.root.add(m);
    if (!tufts) return;
    const tuft = new THREE.ConeGeometry(0.07, 0.35, 4), R = rng(7), im = new THREE.InstancedMesh(tuft, toon(tuftColor), tufts), M4 = new THREE.Matrix4();
    let k = 0, guard = 0;
    while (k < tufts && guard++ < tufts * 20) {
      const x = cx + (R() - 0.5) * size, z = cz + (R() - 0.5) * size;
      if (avoid(x, z) || this.inWater(x, z)) continue;
      M4.compose(new THREE.Vector3(x, this.height(x, z) + 0.12, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.5, R() * 6, (R() - 0.5) * 0.5)), new THREE.Vector3(1, 0.6 + R() * 0.8, 1));
      im.setMatrixAt(k++, M4);
    }
    im.count = k; this.root.add(im);
  }

  // a flat coloured slab (roads, floors, rugs, parking lots)
  flat(w, d, x, z, color, y = 0.02, rot = 0, mat) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat || toon(color)); m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, y, z); m.receiveShadow = true; this.root.add(m); return m;
  }

  // a soft additive pool of light on the floor, plus (optionally) a real light
  glowPool(x, z, r = 3, color = 0xffd27a, op = 0.35, y) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28), poolMat(color, op)); m.rotation.x = -Math.PI / 2; m.position.set(x, (y ?? this.floorAt(x, z, 2)) + 0.03, z); this.root.add(m); return m;
  }
  light(x, y, z, color = 0xffd8a0, intensity = 12, dist = 14) {
    const l = switchable(new THREE.PointLight(color, intensity, dist, 1.5)); l.position.set(x, y, z); this.root.add(l); this.lights.push({ kind: 'lamp', light: l, base: intensity }); return l;
  }

  // a sign board with text
  sign(text, x, y, z, ry = 0, { w = 3, h = 0.8, bg = '#ff4a5a', fg = '#fff', size = 84 } = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: signTex(text, { bg, fg, size, w: Math.round(w * 160), h: Math.round(h * 160) }), toneMapped: false }));
    m.position.set(x, y, z); m.rotation.y = ry; this.root.add(m); return m;
  }

  // instanced trees: list of [x, z, scale, rot, kind] (kind 'pine' | 'round' | 'dead')
  forest(list) {
    const inst = (geo, mat, items) => { if (!items.length) return; const im = new THREE.InstancedMesh(geo, mat, items.length), M4 = new THREE.Matrix4(); items.forEach(([x, z, s, r], i) => { M4.compose(new THREE.Vector3(x, this.height(x, z), z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r, 0)), new THREE.Vector3(s, s, s)); im.setMatrixAt(i, M4); }); im.castShadow = true; im.receiveShadow = true; this.root.add(im); };
    const ink = (g, w) => { const c = g.clone(), p = c.attributes.position, n = c.attributes.normal; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * w, p.getY(i) + n.getY(i) * w, p.getZ(i) + n.getZ(i) * w); return c; };
    const trunk = cyl(0.18, 0.28, 3, 8); trunk.translate(0, 1.5, 0);
    const blob = new THREE.IcosahedronGeometry(1.6, 2); { const p = blob.attributes.position; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(1 + Math.sin(v.x * 3) * 0.08 + Math.cos(v.y * 4) * 0.08); p.setXYZ(i, v.x, v.y * 0.9, v.z); } blob.computeVertexNormals(); blob.translate(0, 3.9, 0); }
    const pines = mergeCones();
    const dead = new THREE.Group(); // bare branches for the spooky ones
    const round = list.filter(t => t[4] === 'round'), pine = list.filter(t => t[4] === 'pine'), bare = list.filter(t => t[4] === 'dead');
    for (const [geo, mat, items, w] of [[trunk, toon(PAL.bark), [...round, ...pine, ...bare], 0.05], [blob, toon(PAL.leaf2), round, 0.07], [pines, toon(PAL.pine), pine, 0.07]]) { inst(geo, mat, items); inst(ink(geo, w), INK, items); }
    for (const [x, z, s, r] of bare) {
      const g = new THREE.Group();
      for (let i = 0; i < 5; i++) { const a = r + i * 1.3, br = part(cyl(0.04, 0.09, 1.6, 6), PAL.bark, Math.cos(a) * 0.4, 2.6 + i * 0.25, Math.sin(a) * 0.4, g, 0.02); br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); }
      g.scale.setScalar(s); this.solid(this.place(g, x, z));
    }
    for (const [x, z, s] of list) this.circle(x, z, 0.35 * s);
  }

  // scatter trees in a region, keeping clear of a test function
  scatterTrees(n, x0, z0, x1, z1, seed, keepClear = () => false, kinds = ['pine', 'round']) {
    const R = rng(seed), out = [];
    for (let i = 0, g = 0; i < n && g < n * 30; g++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0); if (keepClear(x, z)) continue;
      out.push([x, z, 0.8 + R() * 0.6, R() * 6, kinds[Math.floor(R() * kinds.length)]]); i++;
    }
    this.forest(out); return out;
  }

  rock(x, z, s = 1, R = Math.random) { const r = part(new THREE.DodecahedronGeometry(0.5 * s, 0), PAL.rock, x, this.height(x, z) + 0.2 * s, z, null, 0.03); r.rotation.set(R(), R(), R()); this.solid(r); if (s > 0.8) this.circle(x, z, 0.45 * s); }
  mushroom(x, z, R = Math.random) { const g = new THREE.Group(); part(cyl(0.08, 0.1, 0.35, 8), PAL.cream, 0, 0.17, 0, g, 0.015); part(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), R() < 0.5 ? PAL.red : PAL.purple, 0, 0.32, 0, g, 0.02); this.solid(this.place(g, x, z)); }

  // a lake / pond: an ellipse of shiny water with moon glints
  water(x, z, rx, rz, y = -0.55) {
    const w = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshToonMaterial({ color: 0x3a7aff, gradientMap: toon(0).gradientMap, transparent: true, opacity: 0.85, emissive: 0x0a1a5a }));
    w.rotation.x = -Math.PI / 2; w.scale.set(rx, rz, 1); w.position.set(x, y, z); this.root.add(w);
    for (let i = 0; i < 16; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + Math.random(), 0.06), glow(0xd8f0ff, 1.2)); s.rotation.x = -Math.PI / 2; s.position.set(x + (Math.random() - 0.5) * rx, y + 0.01, z + (Math.random() - 0.5) * rz * 0.6); s.material = s.material.clone(); s.material.transparent = true; this.root.add(s); this.props.push({ kind: 'glint', g: s, t: Math.random() * 6 }); }
    this.waters.push({ x, z, rx, rz, y });
  }

  // a jack-o'-lantern (pranks can make them dance)
  pumpkin(x, z, s = 1, y) {
    const g = new THREE.Group();
    const body = new THREE.SphereGeometry(0.38, 16, 12), p = body.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i), a = Math.atan2(v.z, v.x); const k = 1 + Math.cos(a * 8) * 0.05; p.setXYZ(i, v.x * k * 1.15, v.y * 0.85, v.z * k * 1.15); }
    body.computeVertexNormals();
    part(body, toon(PAL.orange), 0, 0.32, 0, g, 0.025);
    part(cyl(0.04, 0.06, 0.18, 6), toon(0x4a7a2a), 0, 0.68, 0, g, 0.015).rotation.z = 0.3;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), new THREE.MeshBasicMaterial({ map: pumpkinFace(Math.floor(Math.random() * 4)), transparent: true, toneMapped: false })); face.position.set(0, 0.34, 0.4); g.add(face);
    g.scale.setScalar(s); this.place(g, x, z, Math.random() * 1.2 - 0.6, y ?? this.floorAt(x, z, 1)); this.root.add(g);
    this.props.push({ kind: 'pumpkin', g, face }); this.circle(x, z, 0.4 * s);
  }

  // walls around a rectangle (with optional gaps) — invisible collision only
  edge(x0, z0, x1, z1) { this.seg(x0, z0, x1, z0); this.seg(x1, z0, x1, z1); this.seg(x1, z1, x0, z1); this.seg(x0, z1, x0, z0); this.bounds = { x0: x0 + 0.5, z0: z0 + 0.5, x1: x1 - 0.5, z1: z1 - 0.5 }; }

  solid(m) { this.batch.add(m); }                    // static: merged
  seg(ax, az, bx, bz, y0 = -5, y1 = 50) { this.segs.push({ ax, az, bx, bz, y0, y1 }); }
  circle(x, z, r) { this.circles.push({ x, z, r }); }
  box(x0, z0, x1, z1) { this.boxes.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) }); }
  // rotated rectangle outline as four segments
  rect(cx, cz, w, d, rot, y0, y1) {
    const c = Math.cos(rot), s = Math.sin(rot), pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => [cx + a * c + b * s, cz - a * s + b * c]);
    for (let i = 0; i < 4; i++) this.seg(pts[i][0], pts[i][1], pts[(i + 1) % 4][0], pts[(i + 1) % 4][1], y0, y1);
  }
  index() {
    const add = (k, o) => { if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(o); };
    const cell = (x, z) => `${Math.floor(x / 8)},${Math.floor(z / 8)}`;
    for (const c of this.circles) add(cell(c.x, c.z), { c });
    for (const b of this.boxes) for (let x = Math.floor(b.x0 / 8); x <= Math.floor(b.x1 / 8); x++) for (let z = Math.floor(b.z0 / 8); z <= Math.floor(b.z1 / 8); z++) add(`${x},${z}`, { b });
    for (const s of this.segs) {
      const n = Math.ceil(Math.hypot(s.bx - s.ax, s.bz - s.az) / 4) + 1, seen = new Set();
      for (let i = 0; i <= n; i++) { const k = cell(s.ax + (s.bx - s.ax) * i / n, s.az + (s.bz - s.az) * i / n); if (!seen.has(k)) { seen.add(k); add(k, { s }); } }
    }
  }
  near(x, z) {
    const out = new Set(), cx = Math.floor(x / 8), cz = Math.floor(z / 8);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of this.grid.get(`${cx + i},${cz + j}`) || []) out.add(o);
    return out;
  }

  los(ax, az, bx, bz, y = 1) {
    for (const s of this.segs) {
      if (y < s.y0 || y > s.y1) continue;
      const d = (bx - ax) * (s.bz - s.az) - (bz - az) * (s.bx - s.ax); if (Math.abs(d) < 1e-9) continue;
      const t = ((s.ax - ax) * (s.bz - s.az) - (s.az - az) * (s.bx - s.ax)) / d, u = ((s.ax - ax) * (bz - az) - (s.az - az) * (bx - ax)) / d;
      if (t > 0.001 && t < 0.999 && u >= 0 && u <= 1) return false;
    }
    return true;
  }

  zoneAt(x, z) { for (const zn of this.zones) if (Math.hypot(x - zn.x, z - zn.z) < zn.r) return zn; return null; }

  // a street lamp; face = which way the arm points (radians)
  lamp(x, z, face, y) {
    const g = new THREE.Group();
    part(cyl(0.09, 0.13, 4.6, 10), PAL.ink, 0, 2.3, 0, g, 0);
    const arm = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 12, Math.PI), toon(PAL.ink)); arm.position.set(0.5, 4.6, 0); g.add(arm);
    part(cone(0.35, 0.35, 10), PAL.ink, 1.0, 4.45, 0, g, 0);
    const bulb = new THREE.Mesh(sphere(0.18, 12, 8), glow(0xffe08a, 2)); bulb.position.set(1.0, 4.25, 0); g.add(bulb);
    face = face ?? (z > 0 ? Math.PI : 0); this.place(g, x, z, face, y ?? this.floorAt(x, z, 1));
    this.solid(g);
    // the pool of light on the pavement is a soft additive decal (cheap and cartoony)
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.4, 28), poolMat(0xffd27a, 0.35));
    pool.rotation.x = -Math.PI / 2; pool.position.set(x + Math.cos(face) * 1, this.floorAt(x, z, 1) + 0.03, z - Math.sin(face) * 1); this.root.add(pool);
    this.circle(x, z, 0.2);
    this.props.push({ kind: 'lamp', bulb, pool, pos: new THREE.Vector3(x, 4.2, z) });
  }

  car(x, z, r, color) {
    const g = new THREE.Group();
    part(rbox(4.0, 0.9, 1.9, 0.35), color, 0, 0.75, 0, g);
    part(rbox(2.2, 0.8, 1.7, 0.3), color, -0.2, 1.45, 0, g);
    for (const s of [-1, 1]) part(rbox(1.9, 0.55, 0.05, 0.02), PAL.glass, -0.2, 1.5, s * 0.86, g, 0.015);
    part(rbox(0.05, 0.55, 1.5, 0.02), PAL.glass, 0.9, 1.5, 0, g, 0.015);
    for (const [a, b] of [[1.3, 0.95], [1.3, -0.95], [-1.3, 0.95], [-1.3, -0.95]]) { const w = part(cyl(0.42, 0.42, 0.3, 14), PAL.ink, a, 0.42, b, g, 0); w.rotation.x = Math.PI / 2; part(cyl(0.2, 0.2, 0.32, 10), PAL.metal, a, 0.42, b, g, 0).rotation.x = Math.PI / 2; }
    for (const s of [-1, 1]) { const h = new THREE.Mesh(sphere(0.14, 10, 8), glow(0xfff4c0, 1.4)); h.position.set(2.0, 0.85, s * 0.6); g.add(h); }
    this.place(g, x, z, r, 0.02); this.solid(g);
    const c = Math.abs(Math.cos(r)) > 0.5; this.box(x - (c ? 2 : 1), z - (c ? 1 : 2), x + (c ? 2 : 1), z + (c ? 1 : 2));
  }
  hydrant(x, z) { const g = new THREE.Group(); part(lathe([[0, 0], [0.2, 0], [0.18, 0.1], [0.15, 0.55], [0.18, 0.62], [0.12, 0.8], [0, 0.85]], 12), PAL.red, 0, 0, 0, g); part(cyl(0.06, 0.06, 0.44, 8), PAL.red, 0, 0.45, 0, g).rotation.z = Math.PI / 2; this.solid(this.place(g, x, z, 0, this.floorAt(x, z, 1))); this.circle(x, z, 0.25); }
  trashcan(x, z) {
    const g = new THREE.Group(); part(lathe([[0, 0], [0.32, 0], [0.36, 0.9], [0, 0.9]], 14), 0x6a9a8a, 0, 0, 0, g);
    const lid = part(lathe([[0, 0], [0.4, 0], [0.38, 0.06], [0.1, 0.14], [0, 0.16]], 14), 0x5a8a7a, 0, 0.9, 0, g);
    this.place(g, x, z, 0, this.floorAt(x, z, 1)); this.root.add(g); this.circle(x, z, 0.38);
    this.props.push({ kind: 'trash', g, lid, base: g.position.clone(), pos: g.position });
  }
  busStop(x, z) {
    const g = new THREE.Group();
    part(rbox(4, 0.12, 1.6, 0.05), PAL.blue, 0, 2.5, 0, g);
    for (const a of [-1.9, 1.9]) part(cyl(0.06, 0.06, 2.5, 8), PAL.metal, a, 1.25, -0.6, g, 0.015);
    part(rbox(3.6, 0.1, 0.5, 0.04), PAL.wood, 0, 0.55, -0.3, g);
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.7), new THREE.MeshBasicMaterial({ map: adTex(), toneMapped: false })); ad.position.set(0, 1.5, -0.72); g.add(ad);
    this.place(g, x, z, Math.PI, 0.25); this.solid(g); this.box(x - 2, z - 0.2, x + 2, z + 0.9);
  }

  building({ x, z, rot = 0, w, d, h = 4.5, color, trim = PAL.cream, roof = 'flat', roofColor = 0x4a3a6a, sign, signBg, signFg, door = 1.6, floorY = 0.25, windowsLit = true, interior }) {
    const g = new THREE.Group(), t = 0.3;
    const wall = (ww, hh, xx, zz, ry = 0) => { const m = part(rbox(ww, hh, t, 0.06), color, xx, hh / 2, zz, g); m.rotation.y = ry; return m; };
    wall(w, h, 0, -d / 2); wall(d, h, -w / 2, 0, Math.PI / 2); wall(d, h, w / 2, 0, Math.PI / 2);
    const side = (w - door) / 2;
    wall(side, h, -w / 2 + side / 2, d / 2); wall(side, h, w / 2 - side / 2, d / 2);
    part(rbox(door + 0.1, h - 2.4, t, 0.06), color, 0, 2.4 + (h - 2.4) / 2, d / 2, g);
    // trim + door frame
    part(rbox(w + 0.3, 0.3, d + 0.3, 0.08), trim, 0, h, 0, g);
    for (const s of [-1, 1]) part(rbox(0.18, 2.5, 0.42, 0.05), trim, s * (door / 2 + 0.05), 1.25, d / 2, g, 0.02);
    part(rbox(door + 0.5, 0.2, 0.44, 0.05), trim, 0, 2.45, d / 2, g, 0.02);
    // floor + roof
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, d - 0.3), toon(0x8a6a8a)); fl.rotation.x = -Math.PI / 2; fl.position.y = 0.02; g.add(fl);
    if (roof === 'flat') part(rbox(w + 0.4, 0.35, d + 0.4, 0.1), roofColor, 0, h + 0.2, 0, g);
    else {
      const sh = new THREE.Shape(); sh.moveTo(-w / 2 - 0.4, 0); sh.lineTo(0, h * 0.55); sh.lineTo(w / 2 + 0.4, 0); sh.lineTo(-w / 2 - 0.4, 0);
      const rg = new THREE.ExtrudeGeometry(sh, { depth: d + 0.6, bevelEnabled: false }); rg.translate(0, 0, -(d + 0.6) / 2); rg.computeVertexNormals();
      part(rg, roofColor, 0, h + 0.05, 0, g, 0.03);
    }
    // glowing windows on the front and sides
    const win = glow(windowsLit ? 0xffd27a : 0x6a7aa8, windowsLit ? 1.2 : 0.6);
    const wnd = (wx, wy, wz, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.1), win); m.position.set(wx, wy, wz); m.rotation.y = ry; g.add(m); const f = part(rbox(1.4, 1.3, 0.12, 0.04), trim, wx, wy, wz - Math.cos(ry) * 0.02, g, 0.02); f.rotation.y = ry; f.scale.z = 0.5; };
    for (const s of [-1, 1]) wnd(s * (door / 2 + side / 2), 2.0, d / 2 + 0.17, 0);
    for (const s of [-1, 1]) for (let i = -1; i <= 1; i += 2) wnd(s * (w / 2 + 0.17), 2.0, i * d / 4, s * Math.PI / 2);
    if (sign) {
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(w - 1, 6), 1.2), new THREE.MeshBasicMaterial({ map: signTex(sign, { bg: signBg || '#ff4a5a', fg: signFg || '#fff' }), toneMapped: false }));
      sm.position.set(0, h - 0.2, d / 2 + 0.2); g.add(sm);
    }
    if (interior) interior(g, w, d);
    g.position.set(x, floorY, z); g.rotation.y = rot;
    // statics merged; interior props marked 'live' stay real objects
    const live = []; g.traverse(o => { if (o.userData.live) live.push(o); });
    for (const o of live) { o.updateMatrixWorld(true); }
    g.updateMatrixWorld(true);
    const keep = new THREE.Group();
    for (const o of live) { const wp = new THREE.Vector3(), wq = new THREE.Quaternion(); o.getWorldPosition(wp); o.getWorldQuaternion(wq); o.parent.remove(o); o.position.copy(wp); o.quaternion.copy(wq); this.root.add(o); }
    this.solid(g);
    // collision: walls in world space (door gap in front)
    const c = Math.cos(rot), s = Math.sin(rot), W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const S = (a, b) => { const p = W(...a), q = W(...b); this.seg(p[0], p[1], q[0], q[1], -5, h + 1); };
    S([-w / 2, -d / 2], [w / 2, -d / 2]); S([-w / 2, -d / 2], [-w / 2, d / 2]); S([w / 2, -d / 2], [w / 2, d / 2]);
    S([-w / 2, d / 2], [-door / 2, d / 2]); S([door / 2, d / 2], [w / 2, d / 2]);
    const [fx, fz] = W(0, 0);
    this.floors.push({ x0: fx - Math.abs(w * c + d * s) / 2 + 0.2, x1: fx + Math.abs(w * c + d * s) / 2 - 0.2, z0: fz - Math.abs(-w * s + d * c) / 2 + 0.2, z1: fz + Math.abs(-w * s + d * c) / 2 - 0.2, y: floorY });
    return { g, W, door: new THREE.Vector3(...[W(0, d / 2 + 1)].map(([a, b]) => [a, floorY, b])[0]) };
  }

  fence(ax, az, bx, bz, gap) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 0.5), dx = (bx - ax) / len, dz = (bz - az) / len, g = new THREE.Group();
    for (let i = 0; i <= n; i++) {
      if (gap && Math.abs(i - n / 2) < 2) continue;
      const p = part(rbox(0.14, 1.0, 0.06, 0.03), PAL.white, ax + dx * i * 0.5, 0.5, az + dz * i * 0.5, g, 0.015);
      p.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
    }
    g.position.y = 0.25; this.solid(g);
    if (gap) { this.seg(ax, az, ax + dx * (len / 2 - 1), az + dz * (len / 2 - 1), -5, 1); this.seg(ax + dx * (len / 2 + 1), az + dz * (len / 2 + 1), bx, bz, -5, 1); }
    else this.seg(ax, az, bx, bz, -5, 1);
  }

  // the crew's TV van, parked at (x, z); the crew start next to it and sign off there
  van(x = 0, z = 0, rot = 0) {
    const g = new THREE.Group();
    part(rbox(5.2, 2.2, 2.3, 0.45), PAL.white, 0, 1.55, 0, g);
    part(rbox(1.6, 1.2, 2.2, 0.4), PAL.white, 2.8, 1.05, 0, g);
    part(rbox(0.06, 0.8, 2.0, 0.03), PAL.glass, 3.62, 1.35, 0, g, 0.015);
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.1), new THREE.MeshBasicMaterial({ map: signTex('GHOST HUNTERS TV', { bg: '#ff4a5a', fg: '#fff', w: 1024, h: 256, size: 130 }), toneMapped: false }));
    for (const s of [-1, 1]) { const l = logo.clone(); l.position.set(-0.3, 1.8, s * 1.17); l.rotation.y = s > 0 ? 0 : Math.PI; g.add(l); }
    for (const [a, b] of [[1.9, 1.15], [1.9, -1.15], [-1.7, 1.15], [-1.7, -1.15]]) { const w = part(cyl(0.5, 0.5, 0.35, 14), PAL.ink, a, 0.5, b, g, 0); w.rotation.x = Math.PI / 2; part(cyl(0.25, 0.25, 0.37, 10), PAL.yellow, a, 0.5, b, g, 0).rotation.x = Math.PI / 2; }
    part(cyl(0.06, 0.06, 1.6, 8), PAL.metal, -1, 3.4, 0, g, 0.015);
    const dish = part(lathe(Array.from({ length: 8 }, (_, i) => [i * 0.11, (i * 0.11) ** 2 * 0.8]), 20), PAL.white, -1, 4.3, 0, g); dish.rotation.x = -0.9;
    part(rbox(0.8, 0.25, 0.3, 0.08), PAL.red, 0.8, 2.8, 0, g); const lb = new THREE.Mesh(sphere(0.12, 8, 6), glow(PAL.red, 2)); lb.position.set(0.8, 2.98, 0); g.add(lb);
    this.place(g, x, z, rot); this.solid(g);
    this.rect(x, z, 6.8, 2.6, rot, -5, 4);
    const side = new THREE.Vector3(1.5, 0, 2.6).applyAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    this.spots.van = new THREE.Vector3(x + side.x, this.floorAt(x + side.x, z + side.z, 1), z + side.z);
    this.vanLight = lb;
    const vl = switchable(new THREE.PointLight(0xffe0b0, 18, 14, 1.6)); vl.position.set(this.spots.van.x, this.spots.van.y + 3, this.spots.van.z); this.root.add(vl);
  }

  // jack-o'-lanterns everywhere (it's the night after Halloween)
  update(dt, t) {
    for (const L of this.lights) if (L.kind === 'fire') { L.light.intensity = L.light.userData.on ? L.base * (0.75 + Math.sin(t * 13) * 0.08 + Math.random() * 0.2) : 0; L.flame.scale.y = 0.85 + Math.sin(t * 9) * 0.1 + Math.random() * 0.1; }
    for (const p of this.props) {
      if (p.kind === 'boat') { p.g.position.y = (p.y ?? -0.75) + Math.sin(t * 1.3) * 0.05; p.g.rotation.z = Math.sin(t * 0.9) * 0.05; }
      else if (p.kind === 'glint') p.g.material.opacity = 0.5 + Math.sin(t * 2 + p.t) * 0.5;
      else if (p.kind === 'trash' && p.dance > 0) {
        p.dance -= dt; p.g.position.y = p.base.y + Math.abs(Math.sin(t * 12)) * 0.3; p.g.rotation.z = Math.sin(t * 10) * 0.2; p.lid.position.y = 0.9 + Math.abs(Math.sin(t * 14)) * 0.25;
        if (p.dance <= 0) { p.g.position.y = p.base.y; p.g.rotation.z = 0; p.lid.position.y = 0.9; }
      } else if (p.kind === 'jukebox' && p.dance > 0) { p.dance -= dt; p.g.scale.y = 1 + Math.abs(Math.sin(t * 8)) * 0.08; }
      else if (p.kind === 'washer' && p.dance > 0) { p.dance -= dt; p.g.rotation.y = Math.sin(t * 30) * 0.05; }
      else if (p.kind === 'chandelier') p.g.rotation.z = Math.sin(t * 0.8) * (p.dance > 0 ? 0.35 : 0.04), p.dance = Math.max(0, (p.dance || 0) - dt);
      else if (p.kind === 'pumpkin' && p.dance > 0) { p.dance -= dt; p.g.position.y += Math.sin(t * 20) * 0.01; p.g.rotation.y += dt * 8; }
    }
  }
}

function mergeCones() {
  const parts = [[1.8, 2.2, 1.6], [1.4, 1.8, 2.8], [1.0, 1.5, 3.9]].map(([r, h, y]) => { const c = cone(r, h, 10); c.translate(0, y + 0.6, 0); return c.toNonIndexed(); });
  const g = new THREE.BufferGeometry(), pos = [], nor = [];
  for (const p of parts) { pos.push(...p.attributes.position.array); nor.push(...p.attributes.normal.array); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

function poolMat(color, op) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  return new THREE.MeshBasicMaterial({ color, map: new THREE.CanvasTexture(c), transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
}

function epitaph(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 200; const x = c.getContext('2d');
  x.fillStyle = '#3a3850'; x.font = 'bold 34px "Rajdhani", sans-serif'; x.textAlign = 'center';
  text.split('\n').forEach((l, i) => x.fillText(l, 128, 70 + i * 44));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function pumpkinFace(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 100; const x = c.getContext('2d');
  x.fillStyle = '#ffd84a'; x.shadowColor = '#ff8a1a'; x.shadowBlur = 12;
  const tri = (a, b, s, up = 1) => { x.beginPath(); x.moveTo(a - s, b + s * up); x.lineTo(a + s, b + s * up); x.lineTo(a, b - s * up); x.fill(); };
  if (kind === 0) { tri(38, 36, 14); tri(90, 36, 14); }
  else if (kind === 1) { x.beginPath(); x.arc(38, 36, 13, 0, 7); x.arc(90, 36, 13, 0, 7); x.fill(); }
  else if (kind === 2) { tri(38, 36, 14, -1); tri(90, 36, 14, -1); }
  else { tri(38, 36, 14); x.beginPath(); x.arc(90, 36, 13, 0, 7); x.fill(); }
  x.beginPath(); x.moveTo(20, 62); x.quadraticCurveTo(64, 100, 108, 62); x.quadraticCurveTo(64, 80, 20, 62); x.fill();
  if (kind % 2) { x.fillStyle = '#000'; x.fillRect(50, 68, 10, 10); x.fillRect(70, 68, 10, 10); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function portraitTex(s) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 176; const x = c.getContext('2d');
  x.fillStyle = s > 0 ? '#4a2a5a' : '#2a4a5a'; x.fillRect(0, 0, 128, 176);
  x.fillStyle = s > 0 ? '#ffd8b0' : '#d8ffd0'; x.beginPath(); x.ellipse(64, 74, 34, 44, 0, 0, 7); x.fill();
  x.fillStyle = '#1a1030'; x.beginPath(); x.ellipse(64, 150, 50, 40, 0, 0, 7); x.fill();
  if (s > 0) { x.fillStyle = '#5a3a1a'; x.fillRect(30, 30, 68, 18); } else { x.fillStyle = '#8a8a8a'; x.beginPath(); x.ellipse(64, 34, 40, 18, 0, Math.PI, 0); x.fill(); }
  x.fillStyle = '#fff'; for (const ex of [50, 78]) { x.beginPath(); x.arc(ex, 70, 9, 0, 7); x.fill(); }
  x.fillStyle = '#000'; for (const ex of [53, 81]) { x.beginPath(); x.arc(ex, 72, 4, 0, 7); x.fill(); }
  x.strokeStyle = '#000'; x.lineWidth = 3; x.beginPath(); x.arc(64, 92, 12, 0.2, Math.PI - 0.2); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function adTex() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#7dff5a'; x.fillRect(0, 0, 512, 256); x.fillStyle = '#1a1030';
  x.font = '64px "Anton", Impact'; x.textAlign = 'center'; x.fillText('GHOST PROBLEM?', 256, 90);
  x.font = '600 34px "Rajdhani"'; x.fillText('just ignore it lol', 256, 150); x.font = '600 26px "Rajdhani"'; x.fillText('a message from the town council', 256, 210);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
