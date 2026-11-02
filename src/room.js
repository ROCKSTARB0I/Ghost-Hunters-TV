// The Living Room: where the audience (and the yeeted) watch the show live.
// A big CRT plays the broadcast. Popcorn, a lighter, things that burn, a
// fire extinguisher, a vote board, and a rotary phone that calls the crew.
import * as THREE from 'three';
import { PAL, toon, glow, part, rbox, sphere, cyl, cone, capsule, lathe, INK, signTex, switchable } from './toon.js';
import { flashlight } from './gear.js';

export const ROOM = new THREE.Vector3(400, 0, 400);      // far from town
const W = 12, D = 9, Hh = 3.4;

export class Room {
  constructor(game) {
    this.g = game; const root = this.root = new THREE.Group(); root.position.copy(ROOM); game.scene.add(root);
    this.segs = []; this.items = []; this.flammable = []; this.fires = []; this.buttons = []; this.popcorn = []; this.spray = [];
    this.build();
    // the broadcast lands on the TV through a render target
    this.rt = new THREE.WebGLRenderTarget(640, 360, { colorSpace: THREE.SRGBColorSpace });
    this.tvMat.uniforms.map.value = this.rt.texture;
    this.tvCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 220);
  }

  local(x, y, z) { return new THREE.Vector3(x, y, z).add(ROOM); }

  build() {
    const r = this.root;
    // shell: wallpaper walls, wood floor, ceiling, baseboards
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toon(0xb07a4a)); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; r.add(floor);
    for (let i = -W / 2; i < W / 2; i += 0.5) { const l = new THREE.Mesh(new THREE.PlaneGeometry(0.02, D), toon(0x8a5a3a)); l.rotation.x = -Math.PI / 2; l.position.set(i, 0.002, 0); r.add(l); }
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), toon(0xfff1d6)); ceil.rotation.x = Math.PI / 2; ceil.position.y = Hh; r.add(ceil);
    const wallTex = stripes();
    const wall = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, Hh), new THREE.MeshToonMaterial({ map: wallTex, gradientMap: toon(0).gradientMap })); m.position.set(x, Hh / 2, z); m.rotation.y = ry; m.receiveShadow = true; r.add(m); part(rbox(w, 0.18, 0.06, 0.02), PAL.white, x - Math.sin(ry) * 0.03, 0.09, z - Math.cos(ry) * 0.03, r, 0.01).rotation.y = ry; };
    wall(W, 0, -D / 2, 0); wall(W, 0, D / 2, Math.PI); wall(D, -W / 2, 0, Math.PI / 2); wall(D, W / 2, 0, -Math.PI / 2);
    const c = (ax, az, bx, bz) => this.segs.push([ax, az, bx, bz]);
    c(-W / 2, -D / 2, W / 2, -D / 2); c(-W / 2, D / 2, W / 2, D / 2); c(-W / 2, -D / 2, -W / 2, D / 2); c(W / 2, -D / 2, W / 2, D / 2);
    // painted night window with curtains
    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.6), new THREE.MeshBasicMaterial({ map: nightWindow() })); win.position.set(W / 2 - 0.02, 1.8, 1.5); win.rotation.y = -Math.PI / 2; r.add(win);
    part(rbox(0.12, 1.8, 2.4, 0.04), PAL.white, W / 2 - 0.05, 1.8, 1.5, r, 0.015).scale.x = 0.5;
    for (const s of [-1, 1]) { const cu = part(rbox(0.08, 2.4, 0.7, 0.04), PAL.red, W / 2 - 0.15, 1.6, 1.5 + s * 1.35, r, 0.02); this.flame(cu, 0.9); }
    // the TV: a chunky CRT on a stand, showing the live feed
    const tv = new THREE.Group(); tv.position.set(0, 0, -D / 2 + 0.7); r.add(tv);
    part(rbox(2.6, 0.6, 0.9, 0.08), 0x7a4a2a, 0, 0.3, 0, tv);
    part(rbox(2.3, 1.55, 1.2, 0.25), 0x3a3a4a, 0, 1.4, 0, tv);
    part(rbox(2.05, 1.3, 0.06, 0.1), PAL.ink, 0, 1.42, 0.6, tv, 0);
    this.tvMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, t: { value: 0 }, on: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D map; uniform float t, on; varying vec2 vUv;
        void main(){ vec2 q = vUv - 0.5; vec2 uv = 0.5 + q * (1.0 + 0.08 * dot(q,q));
          vec3 c = texture2D(map, uv).rgb;
          c *= 0.85 + 0.15 * sin(uv.y * 900.0); c *= smoothstep(0.52, 0.45, abs(q.x)) * smoothstep(0.52, 0.45, abs(q.y));
          float n = fract(sin(dot(uv * t, vec2(12.9, 78.2))) * 43758.5);
          c = mix(vec3(n * 0.6), c, on);
          gl_FragColor = vec4(c * 1.15, 1.0); }`,
      toneMapped: false,
    });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.16), this.tvMat); scr.position.set(0, 1.42, 0.64); tv.add(scr); this.screen = scr;
    const tvGlow = switchable(new THREE.PointLight(0x9ac8ff, 6, 7, 1.6)); tvGlow.position.set(0, 1.4, 1.6); tv.add(tvGlow); this.tvGlow = tvGlow;
    const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.18), new THREE.MeshBasicMaterial({ map: signTex('● LIVE', { bg: '#ff4a5a', size: 70, w: 256, h: 76 }) })); sticker.position.set(0.85, 2.05, 0.61); sticker.rotation.z = -0.1; tv.add(sticker);
    for (const s of [-1, 1]) { const ant = part(cyl(0.015, 0.015, 0.9, 6), PAL.metal, s * 0.2, 2.5, 0, tv, 0); ant.rotation.z = s * 0.45; }
    this.segs.push([-1.3, -D / 2, -1.3, -D / 2 + 1.2], [1.3, -D / 2, 1.3, -D / 2 + 1.2], [-1.3, -D / 2 + 1.2, 1.3, -D / 2 + 1.2]);
    // couch (burnable), coffee table, rug
    const rug = new THREE.Mesh(new THREE.CircleGeometry(2.4, 32), toon(0xd85a8a)); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, 0.6); rug.scale.y = 0.7; r.add(rug);
    const couch = new THREE.Group(); couch.position.set(0, 0, 2.6); r.add(couch);
    part(rbox(3.4, 0.55, 1.1, 0.2), 0x5a9aff, 0, 0.35, 0, couch); part(rbox(3.4, 0.9, 0.35, 0.18), 0x5a9aff, 0, 0.85, 0.4, couch);
    for (const s of [-1, 1]) part(rbox(0.4, 0.8, 1.1, 0.18), 0x4a8aef, s * 1.75, 0.55, 0, couch);
    for (let i = -1; i <= 1; i++) part(rbox(1.0, 0.18, 0.85, 0.1), 0x7ab0ff, i * 1.05, 0.7, -0.05, couch);
    this.flame(couch, 1.6, 'couch'); this.box(-1.95, 2.0, 1.95, 3.25);
    this.seats = [-1.05, 0, 1.05].map(x => this.local(x, 0, 2.5));
    const table = new THREE.Group(); table.position.set(0, 0, 0.7); r.add(table);
    part(rbox(1.8, 0.1, 0.9, 0.04), PAL.wood, 0, 0.45, 0, table); for (const [x, z] of [[0.8, 0.35], [-0.8, 0.35], [0.8, -0.35], [-0.8, -0.35]]) part(cyl(0.04, 0.04, 0.45, 6), PAL.woodDark, x, 0.22, z, table, 0.01);
    this.box(-0.9, 0.25, 0.9, 1.15);
    // popcorn machine
    const pm = new THREE.Group(); pm.position.set(-W / 2 + 1, 0, -D / 2 + 1.2); r.add(pm);
    part(rbox(1, 0.9, 0.8, 0.06), PAL.red, 0, 0.45, 0, pm); part(rbox(0.9, 0.9, 0.7, 0.04), PAL.glass, 0, 1.35, 0, pm, 0.015).material = new THREE.MeshToonMaterial({ color: 0xdff8ff, transparent: true, opacity: 0.35, gradientMap: toon(0).gradientMap });
    for (let i = 0; i < 40; i++) { const k = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), toon(PAL.cream)); k.position.set((Math.random() - 0.5) * 0.7, 0.95 + Math.random() * 0.3, (Math.random() - 0.5) * 0.5); pm.add(k); }
    part(rbox(1.0, 0.25, 0.8, 0.06), PAL.red, 0, 1.92, 0, pm); const ps = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: signTex('POPCORN', { bg: '#ffd84a', fg: '#ff4a5a', size: 64, w: 256, h: 64 }) })); ps.position.set(0, 1.92, 0.41); pm.add(ps);
    this.box(-W / 2 + 0.5, -D / 2 + 0.8, -W / 2 + 1.5, -D / 2 + 1.6);
    this.item('popcorn', popcornBucket(), this.local(-W / 2 + 1, 1.0, -D / 2 + 1.75), 'GRAB POPCORN');
    // side table: phone + lamp; lighter on the coffee table; extinguisher by the door
    const side = new THREE.Group(); side.position.set(2.6, 0, 2.6); r.add(side);
    part(rbox(0.7, 0.7, 0.7, 0.05), PAL.woodDark, 0, 0.35, 0, side);
    const phone = new THREE.Group(); phone.position.set(-0.05, 0.7, 0); side.add(phone);
    part(rbox(0.35, 0.14, 0.3, 0.06), PAL.red, 0, 0.07, 0, phone, 0.015);
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), toon(PAL.white)); dial.rotation.x = -Math.PI / 2 + 0.5; dial.position.set(0, 0.145, 0.05); phone.add(dial);
    const handset = new THREE.Group(); handset.position.set(0, 0.17, -0.04); phone.add(handset); this.handset = handset;
    part(capsule(0.035, 0.28, 8), PAL.red, 0, 0.02, 0, handset, 0.012).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) part(sphere(0.06, 10, 8), PAL.red, s * 0.16, 0.0, 0, handset, 0.012);
    this.phonePos = this.local(2.55, 0.85, 2.6); this.box(2.25, 2.25, 2.95, 2.95);
    const lamp = new THREE.Group(); lamp.position.set(0.18, 0.7, 0.12); side.add(lamp);
    part(cyl(0.02, 0.06, 0.4, 8), PAL.yellow, 0, 0.2, 0, lamp, 0.01);
    const shade = part(cyl(0.12, 0.2, 0.22, 12), PAL.cream, 0, 0.45, 0, lamp, 0.015); this.flame(shade, 0.4);
    const ll = switchable(new THREE.PointLight(0xffd08a, 8, 9, 1.4)); ll.position.set(2.8, 1.5, 2.7); this.root.add(ll);
    this.item('lighter', lighter(), this.local(0.4, 0.52, 0.7), 'GRAB LIGHTER');
    this.item('extinguisher', extinguisher(), this.local(W / 2 - 0.5, 0, D / 2 - 0.6), 'GRAB FIRE EXTINGUISHER');
    this.item('flashlight', flashlight(), this.local(-0.4, 0.55, 0.7), 'GRAB FLASHLIGHT');
    // burnables: trash can, plant, magazine pile, armchair, bookshelf
    const trash = new THREE.Group(); trash.position.set(-2.8, 0, 2.6); r.add(trash); part(lathe([[0, 0], [0.22, 0], [0.26, 0.5], [0, 0.5]], 12), PAL.metal, 0, 0, 0, trash); this.flame(trash, 0.4); this.circle(-2.8, 2.6, 0.3);
    const plant = new THREE.Group(); plant.position.set(-W / 2 + 0.6, 0, 3.6); r.add(plant); part(cyl(0.25, 0.2, 0.45, 10), PAL.orange, 0, 0.22, 0, plant); for (let i = 0; i < 5; i++) part(sphere(0.3, 10, 8), PAL.leaf2, Math.cos(i) * 0.2, 0.75 + i * 0.1, Math.sin(i) * 0.2, plant); this.flame(plant, 0.6); this.circle(-W / 2 + 0.6, 3.6, 0.35);
    const chair = new THREE.Group(); chair.position.set(-3.6, 0, 0.4); chair.rotation.y = 0.9; r.add(chair); part(rbox(1.0, 0.5, 1.0, 0.18), 0xffb84a, 0, 0.35, 0, chair); part(rbox(1.0, 0.9, 0.3, 0.16), 0xffb84a, 0, 0.8, -0.4, chair); this.flame(chair, 1.0); this.circle(-3.6, 0.4, 0.6);
    const shelf = new THREE.Group(); shelf.position.set(W / 2 - 0.3, 0, -2.4); shelf.rotation.y = -Math.PI / 2; r.add(shelf); part(rbox(1.6, 2.2, 0.4, 0.04), PAL.woodDark, 0, 1.1, 0, shelf);
    for (let y = 0; y < 4; y++) for (let i = 0; i < 6; i++) part(rbox(0.16, 0.36, 0.28, 0.02), [PAL.red, PAL.blue, PAL.yellow, PAL.mint, PAL.purple][(y + i) % 5], -0.6 + i * 0.24, 0.3 + y * 0.5, 0.02, shelf, 0.01);
    this.flame(shelf, 1.0); this.box(W / 2 - 0.5, -3.2, W / 2, -1.6);
    // vote board on the left wall: big arcade buttons
    const board = new THREE.Group(); board.position.set(-W / 2 + 0.06, 1.6, -0.9); board.rotation.y = Math.PI / 2; r.add(board); this.board = board;
    part(rbox(3.8, 2.0, 0.12, 0.08), 0x2a1a4a, 0, 0, 0, board);
    const title = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.36), new THREE.MeshBasicMaterial({ map: signTex('MESS WITH THE CREW', { bg: '#2a1a4a', fg: '#7dff5a', size: 60, w: 768, h: 80 }) })); title.position.set(0, 0.78, 0.07); board.add(title);
    // lights: a warm ceiling lamp
    const cl = switchable(new THREE.PointLight(0xfff0d0, 5, 14, 1.6)); cl.position.set(0, Hh - 0.6, 0.6); r.add(cl);
    const bulb = new THREE.Mesh(sphere(0.18, 12, 8), glow(0xfff0c0, 1.5)); bulb.position.copy(cl.position); r.add(bulb);
    this.fireLights = [0, 1].map(() => { const l = switchable(new THREE.PointLight(0xff7a2a, 0, 6, 1.6)); r.add(l); return l; });
    // door (decor) + framed photo of the crew van
    part(rbox(1.1, 2.2, 0.1, 0.05), PAL.woodDark, -2, 1.1, D / 2 - 0.06, r);
    part(sphere(0.06, 8, 6), PAL.yellow, -2.4, 1.1, D / 2 - 0.15, r, 0.01);
    this.spawn = this.local(0, 0, 1.6);
  }

  // build the vote buttons from the event list
  makeButtons(events) {
    for (const b of this.buttons) this.board.remove(b.g);
    this.buttons = [];
    const keys = Object.keys(events), cols = 4, cw = 0.86;
    keys.forEach((k, i) => {
      const g = new THREE.Group(), x = -1.29 + (i % cols) * cw, y = 0.3 - Math.floor(i / cols) * 0.62;
      g.position.set(x, y, 0.08); this.board.add(g);
      const col = k === 'hunt' || k === 'release' ? PAL.red : [PAL.yellow, PAL.mint, PAL.pink, PAL.blue, PAL.orange][i % 5];
      part(cyl(0.2, 0.22, 0.08, 18), PAL.ink, 0, 0, 0, g, 0).rotation.x = Math.PI / 2;
      const cap = part(cyl(0.16, 0.16, 0.1, 18), col, 0, 0, 0.06, g, 0.012); cap.rotation.x = Math.PI / 2;
      const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.16), new THREE.MeshBasicMaterial({ map: signTex(events[k].label, { bg: '#2a1a4a', fg: '#fff', size: 52, w: 400, h: 80, border: '#2a1a4a' }), transparent: true })); lbl.position.set(0, -0.27, 0.01); g.add(lbl);
      this.buttons.push({ key: k, g, cap, pos: () => g.getWorldPosition(new THREE.Vector3()) });
    });
  }

  item(kind, obj, pos, label) { obj.position.copy(pos); this.g.scene.add(obj); this.items.push({ kind, obj, home: pos.clone(), label, holder: 0 }); }
  flame(obj, size, kind) { this.flammable.push({ obj, size, burn: 0, char: 0, kind, mats: null }); }
  box(x0, z0, x1, z1) { this.segs.push([x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]); }
  circle(x, z, r) { const n = 6; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, b = (i + 1) / n * Math.PI * 2; this.segs.push([x + Math.cos(a) * r, z + Math.sin(a) * r, x + Math.cos(b) * r, z + Math.sin(b) * r]); } }

  // push a point (world) out of the room's colliders
  collide(p, r) {
    const lx = p.x - ROOM.x, lz = p.z - ROOM.z, v = { x: lx, z: lz };
    for (const [ax, az, bx, bz] of this.segs) {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz; let t = ((v.x - ax) * dx + (v.z - az) * dz) / l2; t = Math.max(0, Math.min(1, t));
      const ex = v.x - (ax + dx * t), ez = v.z - (az + dz * t), d2 = ex * ex + ez * ez;
      if (d2 < r * r && d2 > 1e-10) { const d = Math.sqrt(d2), k = (r - d) / d; v.x += ex * k; v.z += ez * k; }
    }
    v.x = Math.max(-W / 2 + r, Math.min(W / 2 - r, v.x)); v.z = Math.max(-D / 2 + r, Math.min(D / 2 - r, v.z));
    p.x = v.x + ROOM.x; p.z = v.z + ROOM.z;
  }
  contains(p) { return Math.abs(p.x - ROOM.x) < W && Math.abs(p.z - ROOM.z) < D; }

  // ------------------------------------------------------------ fire!
  ignite(i) {
    const f = this.flammable[i]; if (!f || f.burn > 0) return;
    f.burn = 0.01; this.g.sfx.fire(f.obj.getWorldPosition(new THREE.Vector3()));
    if (!f.flames) {
      f.flames = new THREE.Group(); f.obj.add(f.flames);
      const box = new THREE.Box3().setFromObject(f.obj), c = box.getCenter(new THREE.Vector3()); f.obj.worldToLocal(c);
      for (let k = 0; k < 6; k++) { const fl = new THREE.Mesh(cone(0.12 * f.size, 0.5 * f.size, 6), glow([0xff4a1a, 0xffa01a, 0xfff04a][k % 3], 1.8)); fl.position.set(c.x + (Math.random() - 0.5) * f.size * 0.8, c.y + 0.2, c.z + (Math.random() - 0.5) * f.size * 0.5); f.flames.add(fl); }
    }
    f.flames.visible = true;
  }
  douse(i) { const f = this.flammable[i]; if (!f || f.burn <= 0) return; f.burn = 0; if (f.flames) f.flames.visible = false; this.g.sfx.noiseHit(f.obj.getWorldPosition(new THREE.Vector3()), { f: 3000, q: 0.5, dur: 0.6, gain: 0.3 }); }

  update(dt, t, viewer) {
    this.tvMat.uniforms.t.value = t;
    // fire grows, chars things, spreads to neighbours
    const burning = [];
    for (const [i, f] of this.flammable.entries()) {
      if (f.burn <= 0) continue;
      f.burn = Math.min(1, f.burn + dt * 0.15); f.char = Math.min(1, f.char + dt * 0.04);
      if (!f.mats) { f.mats = []; f.obj.traverse(o => { if (o.isMesh && o.material && o.material.isMeshToonMaterial && !f.flames.children.includes(o)) { o.material = o.material.clone(); f.mats.push(o.material); f.base = f.base || o.material.color.clone(); } }); }
      for (const m of f.mats) m.color.lerp(new THREE.Color(0x2a2020), dt * 0.04);
      f.flames.children.forEach((fl, k) => { fl.scale.set(0.6 + f.burn, (0.6 + f.burn) * (0.8 + Math.sin(t * 14 + k * 2) * 0.25 + Math.random() * 0.15), 0.6 + f.burn); fl.rotation.y += dt * 3; });
      const wp = f.obj.getWorldPosition(new THREE.Vector3()); burning.push([wp, f.burn * f.size]);
      if (this.g.isDirector && f.burn > 0.5 && Math.random() < dt * 0.25) {
        for (const [j, o] of this.flammable.entries()) if (o.burn <= 0 && o.obj.getWorldPosition(new THREE.Vector3()).distanceTo(wp) < 2.6) { this.g.fx({ k: 'room', a: 'ignite', i: j }); break; }
      }
      if (Math.random() < dt * 0.5) this.g.sfx.fire(wp);
    }
    burning.sort((a, b) => b[1] - a[1]);
    this.fireLights.forEach((l, k) => { const b = burning[k]; if (b) { l.position.copy(b[0]).sub(ROOM).setY(1.2); l.intensity = 12 * b[1] * (0.8 + Math.random() * 0.3); } else l.intensity = 0; });
    // popcorn pieces bounce around
    for (const p of this.popcorn) {
      if (p.rest) continue;
      p.v.y -= 9.8 * dt; p.m.position.addScaledVector(p.v, dt); p.m.rotation.x += dt * 8;
      if (p.m.position.y < 0.04) { p.m.position.y = 0.04; p.v.y *= -0.4; p.v.x *= 0.6; p.v.z *= 0.6; if (Math.abs(p.v.y) < 0.4) p.rest = true; }
      this.collide(p.m.position, 0.05);
    }
    if (this.popcorn.length > 300) { const old = this.popcorn.shift(); this.g.scene.remove(old.m); }
    // extinguisher spray
    for (const s of this.spray) { s.m.position.addScaledVector(s.v, dt); s.v.multiplyScalar(0.96); s.life -= dt; s.m.scale.setScalar(1 + (1 - s.life) * 3); s.m.material.opacity = Math.max(0, s.life * 0.8); }
    this.spray = this.spray.filter(s => { if (s.life <= 0) { this.g.scene.remove(s.m); return false; } return true; });
    // the phone handset lifts when someone's on a call
    this.handset.position.y = this.g.caller ? 0.5 : 0.17; this.handset.rotation.z = this.g.caller ? 0.6 : 0;
  }

  // render the broadcast feed onto the TV
  renderTV(renderer, scene, cam) {
    const c = this.tvCam; c.position.copy(cam.pos); c.quaternion.copy(cam.quat); c.fov = cam.fov; c.updateProjectionMatrix();
    const prev = renderer.getRenderTarget(); renderer.setRenderTarget(this.rt); renderer.render(scene, c); renderer.setRenderTarget(prev);
  }

  throwPopcorn(from, dir) {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), toon(PAL.cream)); m.position.copy(from); this.g.scene.add(m);
      this.popcorn.push({ m, v: dir.clone().multiplyScalar(5 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 1.5 + Math.random(), (Math.random() - 0.5) * 1.5)) });
    }
  }
  sprayFoam(from, dir) {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(sphere(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })); m.position.copy(from); this.g.scene.add(m);
      this.spray.push({ m, v: dir.clone().multiplyScalar(7).add(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5), (Math.random() - 0.5)).multiplyScalar(1.5)), life: 1 });
    }
  }
}

function popcornBucket() {
  const g = new THREE.Group();
  const b = part(lathe([[0, 0], [0.13, 0], [0.18, 0.32], [0, 0.32]], 14), PAL.white, 0, 0, 0, g, 0.012);
  for (let i = 0; i < 4; i++) { const s = part(new THREE.CylinderGeometry(0.181, 0.131, 0.32, 14, 1, true, i * Math.PI / 2, Math.PI / 4), PAL.red, 0, 0.16, 0, g, 0); }
  for (let i = 0; i < 14; i++) { const k = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), toon(PAL.cream)); k.position.set((Math.random() - 0.5) * 0.24, 0.33 + Math.random() * 0.06, (Math.random() - 0.5) * 0.24); g.add(k); }
  return g;
}
function lighter() {
  const g = new THREE.Group();
  part(rbox(0.08, 0.14, 0.04, 0.015), PAL.pink, 0, 0.07, 0, g, 0.01);
  part(rbox(0.06, 0.04, 0.035, 0.008), PAL.metal, 0, 0.16, 0, g, 0.008);
  const fl = new THREE.Mesh(cone(0.02, 0.07, 6), glow(0xffa01a, 2)); fl.position.y = 0.22; fl.visible = false; g.add(fl); g.userData.flame = fl;
  return g;
}
function extinguisher() {
  const g = new THREE.Group();
  part(capsule(0.11, 0.4, 10), PAL.red, 0, 0.32, 0, g, 0.015);
  part(cyl(0.03, 0.03, 0.1, 6), PAL.ink, 0, 0.62, 0, g, 0.01);
  const hose = part(cyl(0.02, 0.02, 0.3, 6), PAL.ink, 0.08, 0.58, 0.05, g, 0.008); hose.rotation.z = -1.0;
  part(rbox(0.16, 0.03, 0.04, 0.01), PAL.ink, 0.0, 0.66, 0, g, 0.008);
  return g;
}
function stripes() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#ffe8b8'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 64) { x.fillStyle = '#ffd08a'; x.fillRect(i, 0, 26, 256); x.fillStyle = '#ff9aa8'; x.fillRect(i + 40, 0, 6, 256); }
  for (let y = 16; y < 256; y += 64) for (let i = 52; i < 256; i += 64) { x.fillStyle = '#ff7a8a'; x.beginPath(); x.arc(i - 19, y, 6, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 1.6); return t;
}
function nightWindow() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 180; const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 180); g.addColorStop(0, '#2a1a5a'); g.addColorStop(1, '#8a4a8a'); x.fillStyle = g; x.fillRect(0, 0, 256, 180);
  x.fillStyle = '#fff6d0'; x.beginPath(); x.arc(190, 50, 26, 0, 7); x.fill();
  for (let i = 0; i < 40; i++) { x.fillStyle = '#fff'; x.fillRect(Math.random() * 256, Math.random() * 100, 2, 2); }
  x.fillStyle = '#1a3a2a'; for (let i = 0; i < 8; i++) { x.beginPath(); x.moveTo(i * 34, 180); x.lineTo(i * 34 + 17, 110 + Math.random() * 20); x.lineTo(i * 34 + 34, 180); x.fill(); }
  x.fillStyle = '#fff'; x.fillRect(126, 0, 6, 180); x.fillRect(0, 88, 256, 6);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
