// Spooky Hollow: an open cartoon town at night — Main Street, a cemetery,
// a crooked mansion on the hill, and woods with a campground and a lake.
// Owns terrain height, collision and the landmarks the show uses.
import * as THREE from 'three';
import { PAL, toon, glow, part, rbox, sphere, cyl, cone, capsule, lathe, outline, INK, Batch, signTex, rng, switchable } from './toon.js';

export const BOUNDS = 74;
const LAKE = { x: 18, z: 44, r: 13 };
const HILL = { x: 38, z: -44, r: 22, h: 5 };

export function groundY(x, z) {
  let y = 0;
  const dh = Math.hypot(x - HILL.x, z - HILL.z);
  if (dh < HILL.r) y += HILL.h * (0.5 + 0.5 * Math.cos(dh / HILL.r * Math.PI));
  const dl = Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.3);
  if (dl < LAKE.r + 3) y -= 1.1 * Math.max(0, Math.min(1, (LAKE.r + 3 - dl) / 5));
  y += Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.25;
  // town is flat: fade the bumps out smoothly around Main Street and the pre-show lot
  const sx = Math.max(0, -62 - x, x - 30), sz = Math.max(0, Math.abs(z) - 9), ds = Math.hypot(sx, sz);
  const dl2 = Math.hypot(x + 56, z + 16);
  const flat = Math.min(smooth(ds / 5), smooth((dl2 - 10) / 4));
  y *= flat;
  const edge = Math.max(Math.abs(x), Math.abs(z)) - 64;      // the world curls up at the very edge
  if (edge > 0) y += edge * edge * 0.05;
  return y;
}
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export const WATER_Y = -0.55;

export class World {
  constructor(scene) {
    this.scene = scene; this.root = new THREE.Group(); scene.add(this.root);
    this.batch = new Batch();
    this.segs = []; this.circles = []; this.boxes = []; this.floors = []; this.lights = []; this.spots = {}; this.zones = []; this.props = []; this.doors = [];
    this.grid = new Map();
  }

  build() {
    this.terrain(); this.street(); this.townBuildings(); this.cemetery(); this.mansion(); this.woods(); this.camp(); this.lake(); this.cabin(); this.van(); this.pumpkins();
    this.batch.build(this.root);
    this.index();
    return this;
  }

  // ------------------------------------------------------------ helpers
  solid(m) { this.batch.add(m); }                    // static: merged
  seg(ax, az, bx, bz, y0 = -5, y1 = 50) { this.segs.push({ ax, az, bx, bz, y0, y1 }); }
  circle(x, z, r) { this.circles.push({ x, z, r }); }
  box(x0, z0, x1, z1) { this.boxes.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1) }); }
  // rotated rectangle outline as four segments
  rect(cx, cz, w, d, rot, y0, y1) {
    const c = Math.cos(rot), s = Math.sin(rot), pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([a, b]) => [cx + a * c + b * s, cz - a * s + b * c]);
    for (let i = 0; i < 4; i++) this.seg(pts[i][0], pts[i][1], pts[(i + 1) % 4][0], pts[(i + 1) % 4][1], y0, y1);
  }
  place(g, x, z, r = 0, y) { g.position.set(x, y ?? groundY(x, z), z); g.rotation.y = r; return g; }

  // spatial hash of colliders for fast queries
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

  floorAt(x, z, y = 0) {
    let best = groundY(x, z);
    for (const f of this.floors) if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1 && f.y <= y + 0.6) best = Math.max(best, f.y);
    return best;
  }
  inWater(x, z) { return Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.3) < LAKE.r && groundY(x, z) < WATER_Y; }

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
    const B = BOUNDS; p.x = Math.max(-B, Math.min(B, p.x)); p.z = Math.max(-B, Math.min(B, p.z));
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

  // ------------------------------------------------------------ terrain
  terrain() {
    const N = 120, S = 160, g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position, col = [];
    const c1 = new THREE.Color(PAL.grass), c2 = new THREE.Color(PAL.grass2), cd = new THREE.Color(PAL.dirt), sand = new THREE.Color(0xd8c088);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = groundY(x, z); p.setY(i, y);
      const n = Math.sin(x * 0.3 + Math.cos(z * 0.2) * 2) * 0.5 + 0.5;
      let c = c1.clone().lerp(c2, n);
      const dl = Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.3);
      if (dl < LAKE.r + 2.5) c.lerp(sand, Math.min(1, (LAKE.r + 2.5 - dl) / 2));
      if (Math.hypot(x - 42, z - 34) < 9) c.lerp(cd, 0.6);       // camp clearing
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon(0xffffff).gradientMap }));
    m.receiveShadow = true; this.root.add(m);
    // grass tufts
    const tuft = new THREE.ConeGeometry(0.07, 0.35, 4), mat = toon(0x4cb05a), R = rng(7);
    const im = new THREE.InstancedMesh(tuft, mat, 2600), M4 = new THREE.Matrix4();
    let k = 0;
    while (k < 2600) {
      const x = (R() - 0.5) * 140, z = (R() - 0.5) * 140;
      if ((Math.abs(z) < 9 && x < 30) || this.inWater(x, z)) continue;
      M4.compose(new THREE.Vector3(x, groundY(x, z) + 0.12, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 0.5, R() * 6, (R() - 0.5) * 0.5)), new THREE.Vector3(1, 0.6 + R() * 0.8, 1));
      im.setMatrixAt(k++, M4);
    }
    this.root.add(im);
  }

  // ------------------------------------------------------------ main street
  street() {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(92, 8), toon(PAL.road)); road.rotation.x = -Math.PI / 2; road.position.set(-16, 0.02, 0); road.receiveShadow = true; this.root.add(road);
    for (let x = -60; x < 28; x += 4) { const d = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.25), toon(PAL.line)); d.rotation.x = -Math.PI / 2; d.position.set(x, 0.03, 0); this.root.add(d); }
    for (const s of [-1, 1]) {
      const walk = part(rbox(92, 0.25, 3, 0.06), PAL.walk, -16, 0.12, s * 5.5, null, 0.02); this.solid(walk);
      this.floors.push({ x0: -62, x1: 30, z0: s > 0 ? 4 : -7, z1: s > 0 ? 7 : -4, y: 0.25 });
    }
    // lamp posts with fake light pools
    for (let x = -56; x <= 24; x += 13) for (const s of [-1, 1]) this.lamp(x + (s > 0 ? 6 : 0), s * 6.6);
    // parked cars, hydrants, trash cans, mailbox, bus stop, benches
    const R = rng(3), carCols = [PAL.red, PAL.blue, PAL.yellow, PAL.mint, PAL.pink, PAL.orange];
    for (const [x, z, r] of [[-47, 2.6, 0], [-33, -2.6, Math.PI], [-19, 2.6, 0], [-4, -2.6, Math.PI], [9, 2.6, 0.06], [20, -2.6, Math.PI]]) this.car(x, z, r, carCols[Math.floor(R() * carCols.length)]);
    for (const [x, z] of [[-41, -5], [-12, 5], [14, -5]]) this.hydrant(x, z);
    for (const [x, z] of [[-30, -5.2], [-16, -5.2], [3, 5.2], [-50, 5.2]]) this.trashcan(x, z);
    this.busStop(-26, 6.2);
    this.spots.street = new THREE.Vector3(-16, 0, 0);
    this.zones.push({ id: 'street', name: 'Main Street', x: -16, z: 0, r: 30 });
  }

  lamp(x, z) {
    const g = new THREE.Group();
    part(cyl(0.09, 0.13, 4.6, 10), PAL.ink, 0, 2.3, 0, g, 0);
    const arm = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 12, Math.PI), toon(PAL.ink)); arm.position.set(0.5, 4.6, 0); g.add(arm);
    part(cone(0.35, 0.35, 10), PAL.ink, 1.0, 4.45, 0, g, 0);
    const bulb = new THREE.Mesh(sphere(0.18, 12, 8), glow(0xffe08a, 2)); bulb.position.set(1.0, 4.25, 0); g.add(bulb);
    this.place(g, x, z, z > 0 ? Math.PI : 0, 0.25);
    this.solid(g);
    // the pool of light on the pavement is a soft additive decal (cheap and cartoony)
    const pool = new THREE.Mesh(new THREE.CircleGeometry(3.4, 28), poolMat(0xffd27a, 0.35));
    pool.rotation.x = -Math.PI / 2; pool.position.set(x + (z > 0 ? -1 : 1), 0.27, z * 0.85); this.root.add(pool);
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
  hydrant(x, z) { const g = new THREE.Group(); part(lathe([[0, 0], [0.2, 0], [0.18, 0.1], [0.15, 0.55], [0.18, 0.62], [0.12, 0.8], [0, 0.85]], 12), PAL.red, 0, 0, 0, g); part(cyl(0.06, 0.06, 0.44, 8), PAL.red, 0, 0.45, 0, g).rotation.z = Math.PI / 2; this.solid(this.place(g, x, z, 0, 0.25)); this.circle(x, z, 0.25); }
  trashcan(x, z) {
    const g = new THREE.Group(); part(lathe([[0, 0], [0.32, 0], [0.36, 0.9], [0, 0.9]], 14), 0x6a9a8a, 0, 0, 0, g);
    const lid = part(lathe([[0, 0], [0.4, 0], [0.38, 0.06], [0.1, 0.14], [0, 0.16]], 14), 0x5a8a7a, 0, 0.9, 0, g);
    this.place(g, x, z, 0, 0.25); this.root.add(g); this.circle(x, z, 0.38);
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

  // ------------------------------------------------------------ buildings
  // a hollow, enterable box building: front faces +z in local space
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

  townBuildings() {
    const diner = this.building({ x: -40, z: -14, w: 12, d: 9, h: 4.6, color: 0xff8ab0, trim: PAL.white, sign: "BOO'S DINER", signBg: '#4ad8ff', signFg: '#1a1030', interior: (g, w, d) => {
      part(rbox(6, 1.1, 0.8, 0.15), PAL.red, -1, 0.55, -d / 2 + 2.2, g);
      part(rbox(6.2, 0.12, 1.0, 0.05), PAL.white, -1, 1.15, -d / 2 + 2.2, g);
      for (let i = 0; i < 5; i++) { part(cyl(0.25, 0.22, 0.12, 12), PAL.red, -3.5 + i * 1.25, 0.75, -d / 2 + 3.1, g); part(cyl(0.05, 0.08, 0.7, 8), PAL.metal, -3.5 + i * 1.25, 0.35, -d / 2 + 3.1, g, 0.01); }
      for (const s of [-1, 1]) { part(rbox(1.6, 0.9, 0.9, 0.2), PAL.mint, 4, 0.45, s * 1.2, g); part(rbox(1.2, 0.08, 0.8, 0.03), PAL.white, 4, 0.8, s * 2.1 - s * 0.9 + s * 0.0, g); }
      const juke = part(rbox(1.0, 1.7, 0.6, 0.35), PAL.purple, 5, 0.85, -d / 2 + 0.7, g); juke.userData.live = true;
      const jg = new THREE.Mesh(sphere(0.3, 12, 8), glow(PAL.pink, 1.4)); jg.position.set(0, 0.4, 0.25); juke.add(jg);
      this.props.push({ kind: 'jukebox', g: juke });
    } });
    this.spots.diner = diner.door; this.zones.push({ id: 'diner', name: "Boo's Diner", x: -40, z: -14, r: 8 });
    this.boxColl(-40, -14, 12, 9, 0, [[-1, -14 - 4.5 + 2.2, 6, 0.8]]);
    this.building({ x: -25, z: -14, w: 9, d: 8, h: 4.2, color: 0x6ac8ff, trim: PAL.white, sign: 'SPIN CYCLE', signBg: '#ffd84a', signFg: '#1a1030', interior: (g, w, d) => {
      for (let i = 0; i < 4; i++) { const m = part(rbox(1.0, 1.1, 0.9, 0.12), PAL.white, -3 + i * 1.6, 0.55, -d / 2 + 0.8, g); const door = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), glow(0x9ae8ff, 0.9)); door.position.set(0, 0.1, 0.46); m.add(door); m.userData.live = true; this.props.push({ kind: 'washer', g: m }); }
    } });
    this.zones.push({ id: 'laundromat', name: 'Spin Cycle Laundromat', x: -25, z: -14, r: 6 });
    this.building({ x: -11, z: -14.5, w: 10, d: 9, h: 5, color: PAL.yellow, trim: PAL.red, sign: 'SPOOKY SLICE', signBg: '#ff4a5a', interior: (g, w, d) => {
      part(rbox(2, 1.4, 1.2, 0.3), PAL.ink, -3, 0.7, -d / 2 + 1, g); const fire = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16), glow(0xff7a2a, 2)); fire.position.set(-3, 0.75, -d / 2 + 1.62); g.add(fire);
      for (const [a, b] of [[1.5, -1], [1.5, 1.6], [-1, 1.6]]) { part(cyl(0.7, 0.7, 0.08, 16), PAL.red, a, 0.8, b, g); part(cyl(0.07, 0.07, 0.8, 8), PAL.metal, a, 0.4, b, g, 0.01); }
    } });
    this.zones.push({ id: 'pizza', name: 'Spooky Slice', x: -11, z: -14.5, r: 6 });
    // south side: small houses with yards
    for (const [x, c, rc] of [[-48, 0xb08ae8, 0x5a3a8a], [-36, 0x8ae8b0, 0x2a6a4a], [-22, 0xffb08a, 0x8a3a2a], [-6, 0xe8e08a, 0x6a5a2a], [8, 0x8ab0ff, 0x2a3a8a]]) {
      this.building({ x, z: 15, rot: Math.PI, w: 7, d: 7, h: 3.6, color: c, trim: PAL.white, roof: 'gable', roofColor: rc, windowsLit: Math.random() < 0.6 });
      this.fence(x - 4.5, 10.2, x + 4.5, 10.2, true);
    }
    this.zones.push({ id: 'houses', name: 'Elm Street Houses', x: -20, z: 15, r: 18 });
  }
  boxColl() {}

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

  // ------------------------------------------------------------ cemetery
  cemetery() {
    const cx = 16, cz = -28, R = rng(11);
    const jokes = ['HERE LIES BOB\nHE TRIED', 'I TOLD YOU\nI WAS SICK', 'BACK IN\n5 MIN', 'ERROR 404\nBODY NOT FOUND', 'RIP\nIN PEPPERONI', 'DIG ME\nLATER', 'BRB', 'GHOSTED'];
    let j = 0;
    for (let i = 0; i < 26; i++) {
      const x = cx - 11 + (i % 7) * 3.6 + (R() - 0.5), z = cz - 8 + Math.floor(i / 7) * 4 + (R() - 0.5);
      const g = new THREE.Group(), tall = R() < 0.25;
      if (tall) { part(rbox(0.5, 1.8, 0.5, 0.06), PAL.rock, 0, 0.9, 0, g); part(rbox(1.2, 0.35, 0.36, 0.08), PAL.rock, 0, 1.4, 0, g); }
      else {
        part(rbox(1.0, 1.2, 0.3, 0.12), PAL.rock, 0, 0.6, 0, g); part(cyl(0.5, 0.5, 0.3, 16, 1), PAL.rock, 0, 1.2, 0, g).rotation.x = Math.PI / 2;
        if (j < jokes.length && R() < 0.5) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.7), new THREE.MeshBasicMaterial({ map: epitaph(jokes[j++]), transparent: true })); t.position.set(0, 0.85, 0.16); g.add(t); }
      }
      g.rotation.z = (R() - 0.5) * 0.25;
      this.solid(this.place(g, x, z, (R() - 0.5) * 0.4));
      this.circle(x, z, 0.5);
    }
    // iron fence with a gate
    const fence = (ax, az, bx, bz) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.floor(len / 0.35), g = new THREE.Group();
      for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, z = az + (bz - az) * t; part(cyl(0.03, 0.03, 1.6, 6), PAL.ink, x, groundY(x, z) + 0.8, z, g, 0); part(cone(0.06, 0.18, 6), PAL.ink, x, groundY(x, z) + 1.65, z, g, 0); }
      this.solid(g); this.seg(ax, az, bx, bz, -5, 2);
    };
    fence(cx - 14, cz - 11, cx + 14, cz - 11); fence(cx - 14, cz - 11, cx - 14, cz + 9); fence(cx + 14, cz - 11, cx + 14, cz + 9);
    fence(cx - 14, cz + 9, cx - 2, cz + 9); fence(cx + 2, cz + 9, cx + 14, cz + 9);
    const arch = new THREE.Group(); for (const s of [-1, 1]) part(rbox(0.5, 3, 0.5, 0.08), PAL.rock, s * 2.2, 1.5, 0, arch);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.8), new THREE.MeshBasicMaterial({ map: signTex('REST IN PIECES', { bg: '#2a2040', fg: '#7dff5a', size: 62 }), toneMapped: false })); sg.position.y = 3.1; arch.add(sg);
    this.solid(this.place(arch, cx, cz + 9));
    // crypt
    const crypt = new THREE.Group(); part(rbox(4, 3, 4, 0.1), PAL.rock, 0, 1.5, 0, crypt); part(cone(3.1, 1.6, 4), 0x6a6888, 0, 3.8, 0, crypt).rotation.y = Math.PI / 4;
    const dr = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2), toon(PAL.ink)); dr.position.set(0, 1, 2.02); crypt.add(dr);
    this.solid(this.place(crypt, cx + 8, cz - 7)); this.box(cx + 6, cz - 9, cx + 10, cz - 5);
    this.spots.cemetery = new THREE.Vector3(cx, groundY(cx, cz), cz);
    this.zones.push({ id: 'cemetery', name: 'Rest In Pieces Cemetery', x: cx, z: cz, r: 14 });
  }

  // ------------------------------------------------------------ the mansion
  mansion() {
    const x = HILL.x, z = HILL.z, y = groundY(x, z) - 0.1;
    const m = this.building({ x, z, rot: -0.3, w: 14, d: 11, h: 6, color: 0x5a4a8a, trim: 0xb8a8ff, roof: 'gable', roofColor: 0x2a1a4a, floorY: y, windowsLit: false, sign: 'KEEP OUT (PLEASE)', signBg: '#2a1a4a', signFg: '#ffd84a', door: 2.2, interior: (g, w, d) => {
      // grand stair (decor), portraits with eyes that follow you, a chandelier
      for (let i = 0; i < 6; i++) part(rbox(4, 0.3, 0.6, 0.05), 0x7a3a5a, 0, 0.15 + i * 0.3, -d / 2 + 1 + i * 0.0 + 0.6 * (5 - i) * 0 + 0.3, g).position.z = -d / 2 + 0.6 + (5 - i) * 0.6;
      for (const s of [-1, 1]) { const f = part(rbox(1.4, 1.8, 0.1, 0.04), 0xd8a84a, s * (w / 2 - 0.3), 2.6, 0, g); f.rotation.y = -s * Math.PI / 2; const pic = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), new THREE.MeshBasicMaterial({ map: portraitTex(s), toneMapped: true })); pic.position.z = 0.06; f.add(pic); }
      const ch = new THREE.Group(); ch.position.set(0, 5.2, 0); g.add(ch); ch.userData.live = true;
      part(new THREE.TorusGeometry(0.9, 0.06, 6, 20), 0xd8a84a, 0, 0, 0, ch).rotation.x = Math.PI / 2;
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, c = new THREE.Mesh(sphere(0.1, 8, 6), glow(0xffd27a, 2)); c.position.set(Math.cos(a) * 0.9, 0.15, Math.sin(a) * 0.9); ch.add(c); }
      this.props.push({ kind: 'chandelier', g: ch });
    } });
    // wonky towers
    for (const [ox, oz, tilt, h] of [[-7.5, -5, 0.12, 9], [7.2, -4.2, -0.18, 11], [6, 5.4, 0.08, 7.5]]) {
      const t = new THREE.Group(); part(cyl(1.3, 1.6, h, 14), 0x5a4a8a, 0, h / 2, 0, t); part(cone(1.9, 3.4, 14), 0x2a1a4a, 0, h + 1.6, 0, t);
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.45, 14), glow(0x7dff5a, 1.2)); w.position.set(0, h * 0.7, 1.4); t.add(w);
      t.rotation.z = tilt; const c = Math.cos(-0.3), s = Math.sin(-0.3);
      this.solid(this.place(t, x + ox * c + oz * s, z - ox * s + oz * c, 0, y)); this.circle(x + ox * c + oz * s, z - ox * s + oz * c, 1.6);
    }
    this.spots.mansion = m.door; this.zones.push({ id: 'mansion', name: 'Harrow Mansion', x, z, r: 11 });
    // winding path up the hill
    for (let i = 0; i < 26; i++) { const t = i / 25, px = 24 + (x - 24) * t + Math.sin(t * 6) * 3, pz = -8 + (z + 2 - -8) * t; const st = new THREE.Mesh(new THREE.CircleGeometry(0.7, 10), toon(0x9a8a7a)); st.rotation.x = -Math.PI / 2; st.position.set(px, groundY(px, pz) + 0.04, pz); this.root.add(st); }
  }

  // ------------------------------------------------------------ the woods
  woods() {
    const R = rng(21), lolly = [], pines = [];
    for (let i = 0; i < 520; i++) {
      const x = (R() - 0.5) * 146, z = (R() - 0.5) * 146;
      if (Math.abs(z) < 24 && x < 32 && x > -64) continue;   // town
      if (Math.hypot(x + 56, z + 16) < 12 || Math.hypot(x + 55, z - 10) < 7) continue;   // pre-show lot + van
      if (Math.hypot(x - 16, z + 28) < 17) continue;      // cemetery
      if (Math.hypot(x - HILL.x, z - HILL.z) < 14) continue;
      if (Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.3) < LAKE.r + 3) continue;
      if (Math.hypot(x - 42, z - 34) < 10 || Math.hypot(x - 56, z - 56) < 8 || Math.hypot(x + 50, z - 14) < 8) continue;
      if (x > -2 && x < 4 && z > 8 && z < 40) continue;   // trail
      const s = 0.8 + R() * 0.7;
      (R() < 0.45 ? pines : lolly).push([x, z, s, R() * 6]);
      this.circle(x, z, 0.35 * s);
    }
    const inst = (geo, mat, list, f) => { const im = new THREE.InstancedMesh(geo, mat, list.length), M4 = new THREE.Matrix4(); list.forEach((t, i) => { f(t)(M4); im.setMatrixAt(i, M4); }); im.castShadow = true; im.receiveShadow = true; this.root.add(im); return im; };
    const S = (x, z, s, r, dy = 0) => (M4) => M4.compose(new THREE.Vector3(x, groundY(x, z) + dy * s, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r, 0)), new THREE.Vector3(s, s, s));
    const ink = (g, w) => { const c = g.clone(), p = c.attributes.position, n = c.attributes.normal; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * w, p.getY(i) + n.getY(i) * w, p.getZ(i) + n.getZ(i) * w); return c; };
    // lollipop trees: trunk + lumpy canopy
    const trunk = cyl(0.18, 0.28, 3, 8); trunk.translate(0, 1.5, 0);
    const blob = new THREE.IcosahedronGeometry(1.6, 2); { const p = blob.attributes.position; for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); v.multiplyScalar(1 + Math.sin(v.x * 3) * 0.08 + Math.cos(v.y * 4) * 0.08); p.setXYZ(i, v.x, v.y * 0.9, v.z); } blob.computeVertexNormals(); blob.translate(0, 3.9, 0); }
    const pineG = mergeCones();
    for (const [geo, mat, list, w] of [[trunk, toon(PAL.bark), [...lolly, ...pines], 0.05], [blob, toon(PAL.leaf2), lolly, 0.07], [pineG, toon(PAL.pine), pines, 0.07]]) {
      inst(geo, mat, list, ([x, z, s, r]) => S(x, z, s, r));
      inst(ink(geo, w), INK, list, ([x, z, s, r]) => S(x, z, s, r));
    }
    // rocks + mushrooms
    for (let i = 0; i < 60; i++) {
      const x = (R() - 0.5) * 140, z = (R() - 0.5) * 140; if (Math.abs(z) < 24 && x < 32) continue;
      if (R() < 0.5) { const r = part(new THREE.DodecahedronGeometry(0.4 + R() * 0.7, 0), PAL.rock, x, groundY(x, z) + 0.2, z, null, 0.03); r.rotation.set(R(), R(), R()); this.solid(r); }
      else { const g = new THREE.Group(); part(cyl(0.08, 0.1, 0.35, 8), PAL.cream, 0, 0.17, 0, g, 0.015); part(new THREE.SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), R() < 0.5 ? PAL.red : PAL.purple, 0, 0.32, 0, g, 0.02); this.solid(this.place(g, x, z)); }
    }
    this.zones.push({ id: 'woods', name: 'Whispering Woods', x: 45, z: 15, r: 22 });
    // trail signpost
    const sp = new THREE.Group(); part(cyl(0.08, 0.08, 2.4, 8), PAL.wood, 0, 1.2, 0, sp);
    [['CAMP ->', 0.3, 0], ['<- TOWN', -0.4, 1.8], ['LAKE ->', 0.6, 0.6]].forEach(([t, ry, dy], i) => { const b = part(rbox(1.4, 0.35, 0.08, 0.04), PAL.wood, 0.4, 2.0 - i * 0.45, 0, sp, 0.02); b.rotation.y = ry; const tx = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.3), new THREE.MeshBasicMaterial({ map: signTex(t, { bg: '#b07a4a', fg: '#fff', size: 70 }) })); tx.position.z = 0.05; b.add(tx); });
    this.solid(this.place(sp, 2, 10)); this.circle(2, 10, 0.2);
  }

  camp() {
    const x = 42, z = 34;
    // campfire with a real flickering light
    const g = new THREE.Group();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; part(new THREE.DodecahedronGeometry(0.22, 0), PAL.rock, Math.cos(a) * 0.7, 0.12, Math.sin(a) * 0.7, g, 0.02); }
    for (let i = 0; i < 4; i++) { const l = part(cyl(0.08, 0.08, 1.1, 6), PAL.woodDark, 0, 0.25, 0, g, 0.02); l.rotation.set(Math.PI / 2 - 0.5, i * Math.PI / 2, 0); }
    this.solid(this.place(g, x, z));
    const flame = new THREE.Group(); for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(cone(0.3 - i * 0.07, 0.9 - i * 0.2, 8), glow([0xff5a1a, 0xffa01a, 0xfff04a][i], 1.6)); f.position.y = 0.45 + i * 0.05; flame.add(f); }
    this.place(flame, x, z); this.root.add(flame);
    const fire = switchable(new THREE.PointLight(0xff8a3a, 30, 16, 1.6)); fire.position.set(x, groundY(x, z) + 1.2, z); this.root.add(fire);
    this.lights.push({ kind: 'fire', light: fire, base: 30, flame });
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.4, l = part(cyl(0.25, 0.25, 2.2, 10), PAL.wood, 0, 0.25, 0, new THREE.Group()); const lg = new THREE.Group(); lg.add(l); l.rotation.z = Math.PI / 2; this.solid(this.place(lg, x + Math.cos(a) * 2.6, z + Math.sin(a) * 2.6, -a)); this.circle(x + Math.cos(a) * 2.6, z + Math.sin(a) * 2.6, 0.6); }
    // tents
    for (const [tx, tz, c] of [[x - 5, z - 3, PAL.orange], [x + 4, z - 5, PAL.blue], [x + 5, z + 3, PAL.yellow]]) {
      const t = new THREE.Group(); const tg = part(cone(1.6, 2.0, 4), c, 0, 1.0, 0, t); tg.rotation.y = Math.PI / 4; tg.scale.set(1.2, 1, 0.9);
      const flap = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.1), toon(PAL.ink)); flap.position.set(0, 0.55, 1.05); flap.rotation.x = -0.45; t.add(flap);
      this.solid(this.place(t, tx, tz, Math.atan2(x - tx, z - tz))); this.circle(tx, tz, 1.4);
    }
    // marshmallow sticks, cooler, outhouse
    const cool = new THREE.Group(); part(rbox(0.9, 0.55, 0.55, 0.1), PAL.red, 0, 0.28, 0, cool); part(rbox(0.92, 0.12, 0.57, 0.05), PAL.white, 0, 0.6, 0, cool); this.solid(this.place(cool, x + 1.8, z + 2.2, 0.5)); this.circle(x + 1.8, z + 2.2, 0.5);
    const oh = new THREE.Group(); part(rbox(1.5, 2.4, 1.5, 0.08), PAL.wood, 0, 1.2, 0, oh); part(rbox(1.8, 0.15, 1.8, 0.05), PAL.woodDark, 0, 2.5, 0, oh);
    const moon = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12, 0.6, 4.2), toon(PAL.ink)); moon.position.set(0, 1.9, 0.76); oh.add(moon);
    const ohDoor = part(rbox(1.0, 1.9, 0.06, 0.03), PAL.woodDark, 0, 0.95, 0.76, oh, 0.02);
    this.solid(this.place(oh, x - 9, z + 6, 0.6)); this.circle(x - 9, z + 6, 0.9);
    this.spots.camp = new THREE.Vector3(x, groundY(x, z), z);
    this.spots.outhouse = new THREE.Vector3(x - 9, groundY(x - 9, z + 6), z + 6);
    this.zones.push({ id: 'camp', name: 'Camp Wannagohome', x, z, r: 10 });
  }

  lake() {
    const w = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r + 1.5, 48), new THREE.MeshToonMaterial({ color: 0x3a7aff, gradientMap: toon(0).gradientMap, transparent: true, opacity: 0.85, emissive: 0x0a1a5a }));
    w.rotation.x = -Math.PI / 2; w.scale.y = 1 / 1.3; w.position.set(LAKE.x, WATER_Y, LAKE.z); this.root.add(w); this.water = w;
    // moon glitter streaks
    for (let i = 0; i < 18; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.6 + Math.random(), 0.06), glow(0xd8f0ff, 1.2)); s.rotation.x = -Math.PI / 2; s.position.set(LAKE.x - 4 + Math.random() * 8, WATER_Y + 0.01, LAKE.z - 6 + Math.random() * 6); this.root.add(s); this.props.push({ kind: 'glint', g: s, t: Math.random() * 6 }); }
    // dock + rowboat
    const dock = new THREE.Group();
    for (let i = 0; i < 12; i++) part(rbox(2.0, 0.12, 0.42, 0.03), i % 2 ? PAL.wood : 0x9a6a3a, 0, 0, -i * 0.46, dock, 0.015);
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) part(cyl(0.1, 0.1, 1.4, 8), PAL.woodDark, s * 0.9, -0.6, -i * 1.6, dock, 0.015);
    this.place(dock, LAKE.x - 2, LAKE.z - LAKE.r * 0.8 + 3, Math.PI, 0.05); this.solid(dock);
    this.floors.push({ x0: LAKE.x - 3, x1: LAKE.x - 1, z0: LAKE.z - LAKE.r * 0.8 + 3, z1: LAKE.z - LAKE.r * 0.8 + 8.5, y: 0.1 });
    const boat = new THREE.Group(); const hull = part(lathe([[0, 0], [0.7, 0.05], [0.85, 0.45], [0, 0.45]], 10), 0xff5a4a, 0, 0, 0, boat); hull.scale.set(1, 1, 2.2);
    this.place(boat, LAKE.x + 3, LAKE.z - 4, 0.5, WATER_Y - 0.2); this.root.add(boat); this.props.push({ kind: 'boat', g: boat });
    this.spots.lake = new THREE.Vector3(LAKE.x - 2, 0.1, LAKE.z - LAKE.r * 0.8 + 6);
    this.zones.push({ id: 'lake', name: 'Lake Kinda-Spooky', x: LAKE.x, z: LAKE.z, r: LAKE.r + 2 });
  }

  cabin() {
    const c = this.building({ x: 56, z: 56, rot: -2.4, w: 7, d: 6, h: 3.4, color: 0x9a5a3a, trim: 0xe8c08a, roof: 'gable', roofColor: 0x4a2a1a, floorY: groundY(56, 56) + 0.1, sign: 'CABIN', signBg: '#e8c08a', signFg: '#4a2a1a', interior: (g, w, d) => {
      part(rbox(1.8, 0.5, 1.0, 0.1), 0x8a3a3a, -1.5, 0.25, -d / 2 + 1, g); part(rbox(1.2, 0.7, 0.8, 0.1), PAL.wood, 1.5, 0.35, -d / 2 + 1, g);
      const hd = new THREE.Group(); part(sphere(0.35, 12, 10), 0x6a4a2a, 0, 0, 0, hd); for (const s of [-1, 1]) part(cone(0.08, 0.8, 6), PAL.cream, s * 0.3, 0.4, 0, hd, 0.015).rotation.z = -s * 0.6;
      hd.position.set(0, 2.3, -d / 2 + 0.35); g.add(hd);
    } });
    this.spots.cabin = c.door; this.zones.push({ id: 'cabin', name: 'Creepy Cabin', x: 56, z: 56, r: 6 });
  }

  // the crew's TV van: chunky, with a satellite dish, parked at the edge of town
  van() {
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
    this.place(g, -55, 10, 0.1, 0.02); this.solid(g);
    this.rect(-55, 10, 6.8, 2.6, 0.1, -5, 4);
    this.spots.van = new THREE.Vector3(-53, 0.25, 6.5);
    this.vanLight = lb;
    const vl = switchable(new THREE.PointLight(0xffe0b0, 18, 14, 1.6)); vl.position.set(-53, 3, 8); this.root.add(vl);
  }

  // jack-o'-lanterns everywhere (it's the night after Halloween)
  pumpkins() {
    const R = rng(31), mat = toon(PAL.orange), stem = toon(0x4a7a2a);
    const spots = [[-38, -9.4], [-37, -9.2], [-24, -9.5], [-9, -9.6], [-48, 10.6], [-22, 10.4], [8, 10.6], [14, -18], [18, -18.6], [38, -32], [36, -32.5], [40, 30], [44, 30.5], [3, 9], [-54, 13.5], [55, 51], [-6, 10.5]];
    for (const [x, z] of spots) {
      const g = new THREE.Group(), s = 0.7 + R() * 0.6;
      const body = new THREE.SphereGeometry(0.38, 16, 12), p = body.attributes.position;
      for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i), a = Math.atan2(v.z, v.x); const k = 1 + Math.cos(a * 8) * 0.05; p.setXYZ(i, v.x * k * 1.15, v.y * 0.85, v.z * k * 1.15); }
      body.computeVertexNormals();
      part(body, mat, 0, 0.32, 0, g, 0.025);
      part(cyl(0.04, 0.06, 0.18, 6), stem, 0, 0.68, 0, g, 0.015).rotation.z = 0.3;
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.4), new THREE.MeshBasicMaterial({ map: pumpkinFace(Math.floor(R() * 4)), transparent: true, toneMapped: false }));
      face.position.set(0, 0.34, 0.4); g.add(face);
      g.scale.setScalar(s);
      const y = this.floorAt(x, z, 1);
      this.place(g, x, z, R() * 1.2 - 0.6, y); this.root.add(g);
      this.props.push({ kind: 'pumpkin', g, face });
      this.circle(x, z, 0.4 * s);
    }
  }

  // per-frame: fire flicker, bobbing boat, possessed trash cans, glints
  update(dt, t) {
    for (const L of this.lights) if (L.kind === 'fire') { L.light.intensity = L.light.userData.on ? L.base * (0.75 + Math.sin(t * 13) * 0.08 + Math.random() * 0.2) : 0; L.flame.scale.y = 0.85 + Math.sin(t * 9) * 0.1 + Math.random() * 0.1; }
    for (const p of this.props) {
      if (p.kind === 'boat') { p.g.position.y = WATER_Y - 0.2 + Math.sin(t * 1.3) * 0.05; p.g.rotation.z = Math.sin(t * 0.9) * 0.05; }
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
