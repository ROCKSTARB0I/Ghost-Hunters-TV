// The ghosts. Four types, each with a model, stats and a special move.
// A ghost is driven by the AI (on the director's game) or by a player.
// Crew can't see a ghost unless it manifests, gets caught in torchlight,
// shows up in night vision, or just did something loud.
import * as THREE from 'three';
import { PAL, toon, glow, part, rbox, sphere, cyl, cone, capsule, lathe } from './toon.js';

export const GHOST_TYPES = {
  edith: { name: 'Edith the Diva', blurb: 'Dramatic. Floaty. Her scream knocks everyone flat.', color: 0xd8fff0, speed: 5.2, size: 1.25, special: 'DIVA SCREAM', cost: 55 },
  pete: { name: 'Poltergeist Pete', blurb: 'Tiny, fast, rude. Throws everything not nailed down.', color: 0xb8e8ff, speed: 7.4, size: 0.8, special: 'YEET STORM', cost: 50 },
  clank: { name: 'Sir Clanksalot', blurb: 'A knight with a fish for a sword. Slow, but his charge yeets.', color: 0xc8d8e8, speed: 4.2, size: 1.35, special: 'FISH CHARGE', cost: 50 },
  gloop: { name: 'Gloop', blurb: 'One eye, zero manners. Slime makes the crew slip and slide.', color: 0x8aff6a, speed: 5.0, size: 1.1, special: 'SLIME BOMB', cost: 45 },
};
export const COSTS = { boo: 15, prank: 10, manifest: 35 };

// ------------------------------------------------------------- models
function sheet(color, mat, h = 1.6, r = 0.6) {
  // classic sheet ghost: dome top, wavy hem
  const pts = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20, y = h - t * h; const rr = t < 0.35 ? Math.sin(t / 0.35 * Math.PI / 2) * r : r * (1 + (t - 0.35) * 0.35); pts.push([rr, y]); }
  pts[0][0] = 0.0001;
  const g = lathe(pts, 28), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0.25) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, y + Math.sin(a * 7) * 0.1 * (1 - y / 0.25)); } }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

function eyes(parent, y, z, spread, r, opts = {}) {
  const out = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(sphere(r, 14, 10), opts.white || new THREE.MeshBasicMaterial({ color: 0x1a1030, transparent: true }));
    e.position.set(s * spread, y, z); e.scale.set(1, opts.tall || 1.4, 0.5); parent.add(e); out.push(e);
    if (opts.lashes) for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(cyl(0.008, 0.008, 0.1, 4), new THREE.MeshBasicMaterial({ color: 0x1a1030, transparent: true })); l.position.set(s * (spread + 0.05 + i * 0.03), y + r * 1.3, z); l.rotation.z = -s * (0.3 + i * 0.35); parent.add(l); }
  }
  return out;
}

export function ghostModel(type) {
  const T = GHOST_TYPES[type], g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const mat = new THREE.MeshToonMaterial({ color: T.color, gradientMap: toon(0xffffff).gradientMap, transparent: true, opacity: 1, emissive: new THREE.Color(T.color).multiplyScalar(0.8) });
  const ink = new THREE.MeshBasicMaterial({ color: PAL.ink, side: THREE.BackSide, transparent: true });
  const add = (m, inkW = 0.04) => { body.add(m); m.castShadow = false; if (inkW) { const o = new THREE.Mesh(m.geometry, ink); o.scale.setScalar(1 + inkW); m.add(o); } return m; };
  const extra = { mats: [mat, ink], body };
  if (type === 'edith') {
    const s = add(sheet(T.color, mat, 1.9, 0.65)); s.position.y = 0.3;
    extra.eyes = eyes(body, 1.75, 0.55, 0.17, 0.09, { lashes: true });
    const lips = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.03, 6, 14), new THREE.MeshBasicMaterial({ color: 0xff2a6a, transparent: true })); lips.position.set(0, 1.47, 0.6); lips.scale.y = 0.6; body.add(lips); extra.mouth = lips;
    const tiara = new THREE.Group(); tiara.position.set(0, 2.15, 0.05); body.add(tiara);
    for (let i = -2; i <= 2; i++) { const sp = new THREE.Mesh(cone(0.05, 0.18 - Math.abs(i) * 0.03, 4), glow(0xffd84a, 1.3)); sp.position.set(i * 0.1, 0, 0.15 - Math.abs(i) * 0.04); tiara.add(sp); }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), glow(0xff4ac8, 1.6)); gem.position.set(0, 0.02, 0.2); tiara.add(gem);
    for (let i = 0; i < 14; i++) { const a = -Math.PI * 0.85 + i / 13 * Math.PI * 0.7 + Math.PI / 2; const pearl = new THREE.Mesh(sphere(0.045, 8, 6), toon(PAL.white)); pearl.position.set(Math.cos(a) * 0.5, 1.22 - Math.sin(i / 13 * Math.PI) * 0.12, Math.sin(a) * 0.48); body.add(pearl); }
    for (const s2 of [-1, 1]) { const arm = add(new THREE.Mesh(capsule(0.1, 0.5, 8), mat)); arm.position.set(s2 * 0.62, 1.2, 0.15); arm.rotation.z = s2 * 1.0; extra['arm' + s2] = arm; }
  } else if (type === 'pete') {
    const s = add(sheet(T.color, mat, 1.1, 0.42)); s.position.y = 0.4;
    extra.eyes = eyes(body, 1.18, 0.38, 0.11, 0.07, { tall: 1.2 });
    const grin = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 6, 14, Math.PI), new THREE.MeshBasicMaterial({ color: 0x1a1030, transparent: true })); grin.position.set(0.02, 1.02, 0.4); grin.rotation.z = Math.PI + 0.15; body.add(grin); extra.mouth = grin;
    const cap = new THREE.Group(); cap.position.set(0, 1.45, -0.02); cap.rotation.set(-0.15, Math.PI, 0.1); body.add(cap);
    part(new THREE.SphereGeometry(0.32, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), PAL.red, 0, 0, 0, cap, 0.02);
    part(cyl(0.18, 0.18, 0.03, 14), PAL.red, 0, 0, 0.3, cap, 0.015).scale.set(1.2, 1, 1.6);
    const tongue = new THREE.Mesh(capsule(0.04, 0.06, 6), new THREE.MeshBasicMaterial({ color: 0xff5a7a, transparent: true })); tongue.position.set(0.05, 0.94, 0.41); tongue.rotation.x = 0.4; body.add(tongue);
  } else if (type === 'clank') {
    const s = add(sheet(T.color, mat, 1.5, 0.55)); s.position.y = 0.2;
    // knight helmet with a visor slit and a plume
    const helm = new THREE.Group(); helm.position.y = 1.85; body.add(helm);
    part(cyl(0.42, 0.45, 0.62, 16), PAL.metal, 0, 0, 0, helm, 0.03); part(sphere(0.42, 16, 8), PAL.metal, 0, 0.3, 0, helm, 0.03).scale.y = 0.6;
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.06), glow(0x7dffd8, 2)); slit.position.set(0, 0.05, 0.43); helm.add(slit); extra.eyes = [slit];
    const plume = part(capsule(0.08, 0.5, 8), PAL.red, 0, 0.62, -0.12, helm, 0.02); plume.rotation.x = -0.7;
    for (const s2 of [-1, 1]) part(sphere(0.22, 12, 8), PAL.metal, s2 * 0.55, 1.45, 0, body, 0.03).scale.y = 0.7;
    // the fish
    const fish = new THREE.Group(); fish.position.set(0.7, 1.1, 0.3); fish.rotation.set(0.3, 0, -0.5); body.add(fish);
    const fb = part(sphere(0.18, 14, 10), 0x6ab8ff, 0, 0.45, 0, fish, 0.02); fb.scale.set(0.5, 2.6, 1);
    part(cone(0.2, 0.25, 4), 0x4a98df, 0, 0.0, 0, fish, 0.02).rotation.z = Math.PI;
    const fe = new THREE.Mesh(sphere(0.035, 8, 6), toon(PAL.white)); fe.position.set(0.08, 0.85, 0.06); fish.add(fe);
    part(cyl(0.04, 0.04, 0.3, 6), PAL.woodDark, 0, 1.0, 0, fish, 0.015);
    extra.fish = fish;
  } else if (type === 'gloop') {
    const blob = add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 28, 20), mat)); blob.position.y = 0.75; blob.scale.set(1, 0.85, 1); extra.blob = blob;
    for (let i = 0; i < 6; i++) { const d = add(new THREE.Mesh(sphere(0.18, 10, 8), mat), 0.06); const a = i / 6 * Math.PI * 2; d.position.set(Math.cos(a) * 0.65, 0.15, Math.sin(a) * 0.65); }
    const eye = new THREE.Mesh(sphere(0.3, 18, 14), toon(PAL.white)); eye.position.set(0, 1.05, 0.52); body.add(eye);
    const pup = new THREE.Mesh(sphere(0.13, 12, 10), toon(PAL.ink)); pup.position.set(0, 0, 0.22); eye.add(pup); extra.eyes = [pup]; extra.eyeball = eye;
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.2, 18), new THREE.MeshBasicMaterial({ color: 0x1a4a10, transparent: true })); mouth.position.set(0, 0.62, 0.72); body.add(mouth); extra.mouth = mouth;
    for (let i = 0; i < 3; i++) { const drip = new THREE.Mesh(capsule(0.05, 0.2, 6), mat); drip.position.set(-0.3 + i * 0.3, 0.2, 0.6); body.add(drip); }
  }
  g.scale.setScalar(T.size / 1.25 + 0.2);
  const shine = new THREE.PointLight(T.color, 0, 6, 2); shine.position.y = 1.2; g.add(shine); extra.shine = shine;
  return { group: g, ...extra };
}

// ------------------------------------------------------------- the ghost
export class Ghost {
  constructor(game, type = 'edith') {
    this.g = game; this.setType(type);
    this.pos = new THREE.Vector3(38, 5, -44); this.vel = new THREE.Vector3(); this.yaw = 0; this.pitch = 0;
    this.ecto = 100; this.manifest = 0; this.noise = 0; this.revealed = 0; this.charge = 0; this.vacuumed = 0; this.captured = false;
    this.ctrl = 'ai'; this.owner = 0; this.t = 0;
    this.ai = { goal: null, timer: 2, target: null, mood: 'roam' };
  }
  setType(type) {
    if (this.m) this.g.scene.remove(this.m.group); this._a = -1;
    this.type = type; this.T = GHOST_TYPES[type]; this.m = ghostModel(type); this.g.scene.add(this.m.group);
  }

  // can a given viewer see me? 0..1
  visibilityFor(viewer) {
    if (this.captured) return 0;
    if (viewer === 'self') return 0.8;
    let v = Math.max(this.manifest > 0 ? 1 : 0, this.noise, this.revealed);
    if (viewer === 'nv') v = Math.max(v, 0.75);
    if (viewer === 'dead') v = Math.max(v, 0.5);
    return Math.max(v, 0.04 + Math.sin(this.t * 3) * 0.03);      // a faint shimmer if you look really hard
  }

  // shared per-frame: timers, reveal by crew torches, animation
  update(dt, crew, viewer) {
    this.t += dt;
    this.manifest = Math.max(0, this.manifest - dt);
    this.noise = Math.max(0, this.noise - dt * 0.6);
    this.charge = Math.max(0, this.charge - dt);
    // torchlight reveals ghosts
    let rev = 0;
    for (const c of crew) {
      if (!c.alive || !c.light) continue;
      const to = this.pos.clone().setY(this.pos.y + 1).sub(c.eye), d = to.length();
      if (d < 10 && to.normalize().dot(c.fwd) > 0.9) rev = Math.max(rev, 0.65 * (1 - d / 12));
    }
    this.revealed += (rev - this.revealed) * Math.min(1, dt * 6);
    const m = this.m;
    m.shine.intensity = this.manifest > 0 ? 6 : 0;
    m.group.position.copy(this.pos); m.group.rotation.y = this.yaw;
    // floaty bob + type wiggles
    const b = m.body; b.position.y = Math.sin(this.t * 2.2) * 0.12; b.rotation.z = Math.sin(this.t * 1.6) * 0.06; b.rotation.x = Math.min(0.4, this.vel.length() * 0.04);
    if (m.arm1) { m.arm1.rotation.z = 1.0 + Math.sin(this.t * 3) * 0.3; m['arm-1'].rotation.z = -1.0 - Math.sin(this.t * 3 + 1) * 0.3; }
    if (m.blob) { const k = 1 + Math.sin(this.t * 5) * 0.06; m.blob.scale.set(k, 0.85 / k, k); }
    if (m.fish) m.fish.rotation.z = -0.5 + (this.charge > 0 ? -1.0 : Math.sin(this.t * 2) * 0.15);
    if (m.mouth) m.mouth.scale.y = 0.6 + (this.noise > 0.3 ? 0.8 : 0) + Math.sin(this.t * 4) * 0.05;
  }

  // how see-through to draw the ghost for the current view
  paint(a) {
    const m = this.m; if (a === this._a) return; this._a = a;
    for (const mt of m.mats) mt.opacity = a * (mt.side === THREE.BackSide ? 0.9 : 0.85);
    m.group.traverse(o => { if (o.material && o.material.transparent && !m.mats.includes(o.material) && o.material.opacity !== undefined) o.material.opacity = a; });
    m.group.visible = a > 0.02 && this.g.state === 'live';
  }

  // ------------------------------------------------------- abilities
  can(cost) { return this.ecto >= cost && !this.captured; }
  spend(cost) { this.ecto -= cost; }

  // movement for a controller: wish is a world-space direction (y = up/down)
  move(dt, wish, boost = 1) {
    const sp = (this.charge > 0 ? 14 : this.T.speed) * boost * (this.vacuumed > 0 ? 0.35 : 1);
    this.vel.lerp(wish.clone().multiplyScalar(sp), Math.min(1, dt * 4));
    this.pos.addScaledVector(this.vel, dt);
    const W = this.g.world, fl = W.floorAt(this.pos.x, this.pos.z, this.pos.y + 1);
    this.pos.y = Math.max(fl + 0.05, Math.min(fl + 12, this.pos.y));
    const B = 72; this.pos.x = Math.max(-B, Math.min(B, this.pos.x)); this.pos.z = Math.max(-B, Math.min(B, this.pos.z));
    if (this.vel.lengthSq() > 0.2 && this.charge <= 0) { const want = Math.atan2(this.vel.x, this.vel.z); let d = want - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; this.yaw += d * Math.min(1, dt * 6); }
    if (!this.vacuumed) this.ecto = Math.min(100, this.ecto + dt * 6);
  }

  // the AI: wander toward the crew, prank, boo, then manifest and chase
  think(dt, crew) {
    const A = this.ai, alive = crew.filter(c => c.alive);
    A.timer -= dt;
    const nearest = () => { let b = null, bd = 1e9; for (const c of alive) { const d = c.pos.distanceTo(this.pos); if (d < bd) { bd = d; b = c; } } return [b, bd]; };
    const [near, nd] = nearest();
    let wish = new THREE.Vector3();
    if (this.vacuumed > 0 && near) { wish = this.pos.clone().sub(near.pos).setY(0).normalize(); A.mood = 'flee'; A.timer = 3; }
    else if (A.mood === 'hunt' && A.target && A.target.alive) {
      const d = A.target.pos.distanceTo(this.pos);
      wish = A.target.pos.clone().sub(this.pos); wish.y = (A.target.pos.y + 0.3 - this.pos.y); wish.normalize();
      if (this.manifest < 1 && this.can(COSTS.manifest)) this.g.ghostAct('manifest');
      if (this.type === 'clank' && d < 9 && d > 3 && this.can(this.T.cost)) this.g.ghostAct('special');
      if (d < 1.3 && this.manifest > 0) { this.g.ghostAct('grab', A.target.id); A.mood = 'roam'; A.timer = 8; }
      if (A.timer <= 0 || this.manifest <= 0 && !this.can(COSTS.manifest)) { A.mood = 'roam'; A.timer = 6; }
    } else {
      if (!A.goal || A.timer <= 0 || this.pos.distanceTo(A.goal) < 2) {
        A.timer = 4 + Math.random() * 6;
        if (near && Math.random() < 0.75) A.goal = near.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10));
        else { const z = this.g.world.zones[Math.floor(Math.random() * this.g.world.zones.length)]; A.goal = new THREE.Vector3(z.x, 0, z.z); }
        A.goal.y = this.g.world.floorAt(A.goal.x, A.goal.z, 5) + 0.3;
        // what to do next
        if (near && nd < 14) {
          const r = Math.random(), anger = this.g.show ? Math.min(1, this.g.show.time / 120) : 0.5;
          if (r < 0.3 && this.can(COSTS.prank)) this.g.ghostAct('prank');
          else if (r < 0.5 && nd < 8 && this.can(COSTS.boo)) this.g.ghostAct('boo');
          else if (r < 0.62 && this.can(this.T.cost)) this.g.ghostAct('special');
          else if (r < 0.62 + anger * 0.3 && this.can(COSTS.manifest + 10)) { A.mood = 'hunt'; A.target = near; A.timer = 12; }
        }
      }
      wish = A.goal.clone().sub(this.pos); const dist = wish.length(); wish.normalize().multiplyScalar(Math.min(1, dist / 3) * 0.75);
    }
    this.move(dt, wish);
  }

  pack() { const r = (v) => +v.toFixed(2); return { p: [r(this.pos.x), r(this.pos.y), r(this.pos.z)], y: r(this.yaw), e: Math.round(this.ecto), mf: r(this.manifest), n: r(this.noise), ch: r(this.charge), ty: this.type, v: [r(this.vel.x), r(this.vel.y), r(this.vel.z)], cap: this.captured ? 1 : 0 }; }
  unpack(m) {
    if (m.ty !== this.type) this.setType(m.ty);
    this.netPos = new THREE.Vector3(...m.p); this.yaw = m.y; this.ecto = m.e; this.manifest = m.mf; this.noise = Math.max(this.noise, m.n); this.charge = m.ch; this.vel.set(...m.v); this.captured = !!m.cap;
  }
  follow(dt) { if (this.netPos) { if (this.netPos.distanceTo(this.pos) > 4) this.pos.copy(this.netPos); else this.pos.lerp(this.netPos, Math.min(1, dt * 10)); } }
}
