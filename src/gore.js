// Death by ghost: a real jumpscare for the victim, then their body bursts
// into gore — limbs and head torn off as tumbling chunks, meaty gibs and
// bone bits, a spray of blood droplets that splat on the ground, and a
// neck stump that keeps pumping for a couple of seconds.
import * as THREE from 'three';
import { toon, glow, sphere, cone, capsule, INK } from './toon.js';

const BLOOD = new THREE.MeshToonMaterial({ color: 0xb0001a, gradientMap: toon(0).gradientMap });
const MEAT = [0x8a0a1a, 0xc8303a, 0x6a0a14, 0xe0606a].map(c => toon(c));
const BONE = toon(0xfff2d8);
const DROP_GEO = new THREE.SphereGeometry(0.035, 6, 4);
const MAX_DROPS = 900;

function splatTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 64, 26, 0, 7); x.fill();
  for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28, d = 24 + Math.random() * 32, r = 3 + Math.random() * 9; x.beginPath(); x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, 7); x.fill(); x.lineWidth = r; x.strokeStyle = '#fff'; x.beginPath(); x.moveTo(64, 64); x.lineTo(64 + Math.cos(a) * d * 0.9, 64 + Math.sin(a) * d * 0.9); x.stroke(); }
  return new THREE.CanvasTexture(c);
}

export class Gore {
  constructor(game) {
    this.g = game; this.chunks = []; this.drops = []; this.splats = []; this.fountains = [];
    this.splatTexs = [splatTex(), splatTex(), splatTex()];
    this.dropMesh = new THREE.InstancedMesh(DROP_GEO, BLOOD, MAX_DROPS); this.dropMesh.count = 0; this.dropMesh.frustumCulled = false;
    game.scene.add(this.dropMesh);
    this.M4 = new THREE.Matrix4();
  }

  // tear a Dude apart at its current pose; dir = which way the force came from
  explode(dude, dir = new THREE.Vector3(0, 0, 1)) {
    if (dude.exploded) return; dude.exploded = true;
    dude.group.updateMatrixWorld(true);
    const center = new THREE.Vector3(); dude.chest.getWorldPosition(center); center.y += 0.25;
    const take = (obj, speed, up) => {
      const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
      obj.matrixWorld.decompose(wp, wq, ws);
      const c = obj.clone(true); c.position.copy(wp); c.quaternion.copy(wq); c.scale.copy(ws);
      this.g.scene.add(c);
      const out = wp.clone().sub(center); out.y = 0; if (out.lengthSq() < 1e-4) out.set(Math.random() - 0.5, 0, Math.random() - 0.5); out.normalize();
      const v = out.multiplyScalar(speed * (0.6 + Math.random() * 0.8)).addScaledVector(dir, speed * 0.5); v.y = up * (0.7 + Math.random() * 0.6);
      this.chunks.push({ m: c, v, w: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18), life: 45, bleed: 1.6, r: 0.18 });
      return c;
    };
    // pieces: head, each upper arm (with forearm + hand), each leg, and the torso
    const head = take(dude.head, 5, 9);
    for (const a of dude.arms) take(a.sh, 7, 6);
    for (const l of dude.legs) take(l.hp, 5, 5);
    const torso = new THREE.Group(); dude.chest.children.filter(o => o.isMesh).forEach(o => torso.add(o.clone(true)));
    dude.chest.updateMatrixWorld(true); dude.chest.matrixWorld.decompose(torso.position, torso.quaternion, torso.scale);
    this.g.scene.add(torso); this.chunks.push({ m: torso, v: dir.clone().multiplyScalar(2).setY(3), w: new THREE.Vector3(Math.random() * 6, 0, Math.random() * 6), life: 45, bleed: 3, r: 0.3 });
    dude.group.visible = false;
    // gibs + bone bits
    for (let i = 0; i < 26; i++) {
      const bone = i % 6 === 0;
      const geo = bone ? capsule(0.025, 0.12, 5) : new THREE.DodecahedronGeometry(0.05 + Math.random() * 0.08, 0);
      const m = new THREE.Mesh(geo, bone ? BONE : MEAT[i % MEAT.length]); m.castShadow = true;
      if (!bone) { const ink = new THREE.Mesh(geo, INK); ink.scale.setScalar(1.15); m.add(ink); }
      m.position.copy(center).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4));
      this.g.scene.add(m);
      const v = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 7).addScaledVector(dir, 2); v.y = 3 + Math.random() * 8;
      this.chunks.push({ m, v, w: new THREE.Vector3(Math.random() * 20, Math.random() * 20, 0), life: 40, bleed: 0.4, r: 0.06 });
    }
    // the burst: a big spray of droplets and a red puff
    for (let i = 0; i < 260; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 9).addScaledVector(dir, 1.5);
      this.drop(center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3)), v);
    }
    const puff = new THREE.Mesh(sphere(0.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xc0001a, transparent: true, opacity: 0.85, depthWrite: false }));
    puff.position.copy(center); this.g.scene.add(puff); this.chunks.push({ m: puff, puff: true, life: 0.5, v: new THREE.Vector3(), w: new THREE.Vector3() });
    // the neck stump keeps going for a bit
    this.fountains.push({ obj: torso, t: 2.6, at: new THREE.Vector3(0, dude.S.torso[1] + 0.1, 0) });
    this.splat(center.clone().setY(this.g.world.floorAt(center.x, center.z, center.y) + 0.01), 1.6);
    this.g.sfx.gore?.(center);
    return center;
  }

  drop(p, v) {
    if (this.drops.length >= MAX_DROPS) this.drops.shift();
    this.drops.push({ p, v, life: 3 });
  }

  splat(p, size = 0.5) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: 0x9a0014, alphaMap: this.splatTexs[Math.floor(Math.random() * 3)], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.rotation.set(-Math.PI / 2, 0, Math.random() * 6.28); m.position.copy(p);
    this.g.scene.add(m); this.splats.push({ m, life: 90 });
    if (this.splats.length > 220) { const o = this.splats.shift(); this.g.scene.remove(o.m); }
  }

  floor(p) { const r = this.g.room; return r && r.contains(p) ? r.root.position.y : this.g.world.floorAt(p.x, p.z, p.y + 0.2); }

  update(dt) {
    // chunks: tumble, bounce, smear, bleed
    for (const c of this.chunks) {
      c.life -= dt;
      if (c.puff) { c.m.scale.setScalar(1 + (0.5 - c.life) * 6); c.m.material.opacity = Math.max(0, c.life * 1.6); continue; }
      if (c.rest) { if (c.life < 3) c.m.position.y -= dt * 0.08; continue; }
      c.v.y -= 16 * dt; c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; c.m.rotation.z += c.w.z * dt;
      if (c.bleed > 0) { c.bleed -= dt; if (Math.random() < 0.6) this.drop(c.m.position.clone(), c.v.clone().multiplyScalar(0.2).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random(), (Math.random() - 0.5) * 1.5))); }
      const fl = this.floor(c.m.position);
      if (c.m.position.y < fl + c.r * 0.6) {
        c.m.position.y = fl + c.r * 0.6;
        if (Math.abs(c.v.y) > 2) { this.splat(c.m.position.clone().setY(fl + 0.012), 0.3 + Math.min(1, Math.abs(c.v.y) * 0.08)); if (c.r > 0.1) this.g.sfx.splat(c.m.position); }
        c.v.y *= -0.3; c.v.x *= 0.55; c.v.z *= 0.55; c.w.multiplyScalar(0.5);
        if (c.v.length() < 0.5) c.rest = true;
      }
    }
    this.chunks = this.chunks.filter(c => { if (c.life <= 0) { this.g.scene.remove(c.m); return false; } return true; });
    // stump fountain
    for (const f of this.fountains) {
      f.t -= dt; const wp = f.obj.localToWorld(f.at.clone()), up = new THREE.Vector3(0, 1, 0).applyQuaternion(f.obj.quaternion);
      for (let i = 0; i < 5; i++) this.drop(wp.clone(), up.clone().multiplyScalar(3 + Math.random() * 3 * (0.5 + Math.sin(f.t * 12) * 0.5)).add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2)));
    }
    this.fountains = this.fountains.filter(f => f.t > 0);
    // droplets fly, then splat
    const M4 = this.M4, s = new THREE.Vector3(1, 1, 1), q = new THREE.Quaternion();
    let n = 0;
    for (const d of this.drops) {
      d.v.y -= 16 * dt; d.p.addScaledVector(d.v, dt); d.life -= dt;
      const fl = this.floor(d.p);
      if (d.p.y < fl) { if (Math.random() < 0.18) this.splat(d.p.clone().setY(fl + 0.011), 0.15 + Math.random() * 0.25); d.life = 0; continue; }
      s.set(1, 1 + Math.min(2.5, d.v.length() * 0.15), 1); q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.v.clone().normalize());
      M4.compose(d.p, q, s); this.dropMesh.setMatrixAt(n++, M4);
    }
    this.drops = this.drops.filter(d => d.life > 0);
    this.dropMesh.count = n; this.dropMesh.instanceMatrix.needsUpdate = true;
    for (const sp of this.splats) { sp.life -= dt; if (sp.life < 5) sp.m.material.opacity = Math.max(0, sp.life / 5); }
    this.splats = this.splats.filter(sp => { if (sp.life <= 0) { this.g.scene.remove(sp.m); return false; } return true; });
  }

  clear() {
    for (const c of this.chunks) this.g.scene.remove(c.m); for (const s of this.splats) this.g.scene.remove(s.m);
    this.chunks = []; this.splats = []; this.drops = []; this.fountains = [];
  }
}

// ---------------------------------------------------------------- jumpscare
// a horrible face that lunges at the camera. Only the victim sees it.
export class Jumpscare {
  constructor(camera) {
    const g = this.group = new THREE.Group(); g.visible = false; camera.add(g);
    const skin = new THREE.MeshBasicMaterial({ color: 0xd8e8e0 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), skin);
    { const p = head.geometry.attributes.position; for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); y *= 1.35; if (y < 0) { x *= 1 - Math.min(0.45, -y * 0.5); } if (z > 0.2 && y < -0.05 && Math.abs(x) < 0.28) z -= 0.25; p.setXYZ(i, x * (1 + Math.sin(y * 9) * 0.04), y, z); } head.geometry.computeVertexNormals(); }
    g.add(head);
    const black = new THREE.MeshBasicMaterial({ color: 0x050008 });
    for (const s of [-1, 1]) {
      const sock = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), black); sock.scale.set(1, 1.4, 0.5); sock.position.set(s * 0.18, 0.18, 0.42); g.add(sock);
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), glow(0xff1a1a, 3)); pin.position.set(s * 0.17, 0.16, 0.5); g.add(pin);
      const vein = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.4), black); vein.position.set(s * 0.26, -0.1, 0.44); vein.rotation.z = s * 0.3; g.add(vein);
    }
    const mouth = this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.24, 20, 16), black); mouth.scale.set(0.9, 1.6, 0.4); mouth.position.set(0, -0.32, 0.42); g.add(mouth);
    const teeth = new THREE.MeshBasicMaterial({ color: 0xf0e8c8 });
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 4), teeth); const a = (i / 8 - 0.5) * 2.2;
      t.position.set(Math.sin(a) * 0.19, -0.32 + s * (0.3 - Math.abs(Math.sin(a)) * 0.08), 0.47); t.rotation.z = s > 0 ? Math.PI : 0; g.add(t);
    }
    for (let i = 0; i < 26; i++) { const h = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 1.2 + Math.random() * 0.8), black); h.position.set((Math.random() - 0.5) * 1.1, -0.1 - Math.random() * 0.3, 0.2 + Math.random() * 0.25); h.rotation.z = (Math.random() - 0.5) * 0.3; g.add(h); }
    g.traverse(o => { if (o.isMesh) { o.renderOrder = 999; o.material.depthTest = false; o.frustumCulled = false; } });
    this.t = 0;
  }
  start() { this.t = 0; this.group.visible = true; }
  update(dt) {
    if (!this.group.visible) return false;
    this.t += dt;
    const t = this.t, lunge = Math.min(1, t / 0.22);
    const z = -3.2 + lunge * 2.75 + Math.max(0, t - 0.22) * 0.25;
    const shake = t > 0.18 ? 0.04 : 0.01;
    this.group.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake - 0.05, z);
    this.group.rotation.set((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.15);
    this.mouth.scale.y = 1.6 + Math.min(1, t * 5) * 0.9 + Math.sin(t * 60) * 0.1;
    if (t > 0.95) { this.group.visible = false; return true; }
    return false;
  }
}
