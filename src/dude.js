// Silly people: jointed cartoon humans with exaggerated proportions and
// goofy faces (big noses, bulgy eyes, thick brows). Three body styles.
import * as THREE from 'three';
import { PAL, toon, part, rbox, sphere, cyl, capsule } from './toon.js';

export const STYLES = {
  wobbly: { name: 'Wobbly', head: 0.24, neck: 0.06, torso: [0.26, 0.5], hip: 0.2, arm: [0.055, 0.42, 0.4], hand: 0.12, leg: [0.075, 0.42, 0.42], foot: [0.16, 0.12, 0.36], nose: 0.07, eye: 0.075, height: 1 },
  bobble: { name: 'Bobblehead', head: 0.42, neck: 0.05, torso: [0.22, 0.38], hip: 0.17, arm: [0.05, 0.26, 0.24], hand: 0.1, leg: [0.065, 0.26, 0.26], foot: [0.14, 0.1, 0.3], nose: 0.1, eye: 0.12, height: 1 },
  lanky: { name: 'Lanky', head: 0.2, neck: 0.22, torso: [0.18, 0.62], hip: 0.15, arm: [0.04, 0.5, 0.48], hand: 0.1, leg: [0.055, 0.56, 0.56], foot: [0.13, 0.1, 0.38], nose: 0.09, eye: 0.06, height: 1 },
};

const SKINS = [0xffcfa8, 0xe8a878, 0xb87a50, 0x8a5a3a, 0xffe0c8, 0x6a4028];

// crew outfits (the wardrobe cycles through these)
export const LOOKS = [
  { name: 'Big Head Barry', style: 'bobble', skin: 0xe8a878, shirt: PAL.red, pants: 0x2a2a4a, hair: true, hairColor: 0x3a2010 },
  { name: 'Mustache Mike', style: 'wobbly', skin: 0x8a5a3a, shirt: PAL.mint, pants: 0x5a3a2a, hat: 'headlamp', mustache: true, hair: true },
  { name: 'Lanky Lou', style: 'lanky', skin: 0xffcfa8, shirt: PAL.yellow, pants: 0x1a1a2a, hat: 'beanie', hatColor: PAL.blue },
  { name: 'Cap Carl', style: 'wobbly', skin: 0xffcfa8, shirt: PAL.blue, pants: 0x3a4a8a, hat: 'cap', hatColor: PAL.red, hair: true },
  { name: 'Bobble Bea', style: 'bobble', skin: 0xffe0c8, shirt: PAL.purple, pants: 0x3a5a3a, hair: true, hairColor: 0xd8a040 },
  { name: 'Stretch', style: 'lanky', skin: 0xb87a50, shirt: PAL.pink, pants: 0x4a3a2a, mustache: true, hair: true, hairColor: 0x1a1010 },
  { name: 'Headlamp Hank', style: 'bobble', skin: 0x6a4028, shirt: PAL.orange, pants: 0x2a3a5a, hat: 'headlamp' },
  { name: 'Wobbly Wendy', style: 'wobbly', skin: 0xffe0c8, shirt: 0x9a5aff, pants: 0x1a1a2a, hat: 'beanie', hatColor: PAL.yellow, hair: true, hairColor: 0xa83a1a },
];

export class Dude {
  constructor(opt = {}) {
    const S = this.S = STYLES[opt.style || 'wobbly'];
    const skin = toon(opt.skin ?? SKINS[0]), shirt = toon(opt.shirt ?? PAL.red), pants = toon(opt.pants ?? 0x3a4a8a), shoe = toon(opt.shoes ?? PAL.ink);
    const g = this.group = new THREE.Group(), rig = this.rig = new THREE.Group(); g.add(rig);
    const legLen = S.leg[1] + S.leg[2], hipY = legLen + S.foot[1] * 0.6;
    // hips + torso
    const hips = this.hips = new THREE.Group(); hips.position.y = hipY; rig.add(hips);
    part(capsule(S.hip, 0.06, 10), pants, 0, 0.02, 0, hips, 0.025).scale.set(1.1, 1, 0.8);
    const chest = this.chest = new THREE.Group(); chest.position.y = 0.05; hips.add(chest);
    const t = part(capsule(S.torso[0], S.torso[1] - S.torso[0], 12), shirt, 0, S.torso[1] / 2 + 0.05, 0, chest, 0.025); t.scale.z = 0.75;
    // neck + head
    const neckY = S.torso[1] + 0.12;
    part(cyl(0.05, 0.06, S.neck + 0.08, 8), skin, 0, neckY + S.neck / 2, 0, chest, 0.02);
    const head = this.head = new THREE.Group(); head.position.y = neckY + S.neck + S.head * 0.85; chest.add(head);
    const hm = part(sphere(S.head, 22, 16), skin, 0, 0, 0, head, 0.03); hm.scale.set(0.95, 1.05, 0.95);
    this.face(head, S, opt, skin);
    // arms: shoulder -> elbow -> hand
    this.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * (S.torso[0] + 0.05), S.torso[1] - 0.02, 0); chest.add(sh);
      part(capsule(S.arm[0] * 1.15, S.arm[1] - S.arm[0] * 2, 8), shirt, 0, -S.arm[1] / 2, 0, sh, 0.02);
      const el = new THREE.Group(); el.position.y = -S.arm[1]; sh.add(el);
      part(capsule(S.arm[0], S.arm[2] - S.arm[0] * 2, 8), skin, 0, -S.arm[2] / 2, 0, el, 0.02);
      const hand = new THREE.Group(); hand.position.y = -S.arm[2]; el.add(hand);
      part(sphere(S.hand, 12, 10), skin, 0, -S.hand * 0.6, 0, hand, 0.02).scale.set(0.8, 1, 1);
      part(capsule(S.hand * 0.28, S.hand * 0.5, 6), skin, s * -S.hand * 0.1, -S.hand * 0.4, S.hand * 0.75, hand, 0.015).rotation.x = 0.9;
      this.arms.push({ s, sh, el, hand });
    }
    // legs: hip -> knee -> big shoe
    this.legs = [];
    for (const s of [-1, 1]) {
      const hp = new THREE.Group(); hp.position.set(s * S.hip * 0.55, 0, 0); hips.add(hp);
      part(capsule(S.leg[0] * 1.15, S.leg[1] - S.leg[0] * 2, 8), pants, 0, -S.leg[1] / 2, 0, hp, 0.02);
      const kn = new THREE.Group(); kn.position.y = -S.leg[1]; hp.add(kn);
      part(capsule(S.leg[0], S.leg[2] - S.leg[0] * 2, 8), pants, 0, -S.leg[2] / 2, 0, kn, 0.02);
      const ft = new THREE.Group(); ft.position.y = -S.leg[2]; kn.add(ft);
      const [fw, fh, fl] = S.foot; part(rbox(fw, fh, fl, fh * 0.45), shoe, 0, -fh * 0.3, fl * 0.3, ft, 0.02);
      this.legs.push({ s, hp, kn, ft });
    }
    if (opt.hat) this.hat(head, S, opt);
    this.t = Math.random() * 9; this.walk = 0; this.pose = { speed: 0, air: 0, scared: 0, talk: 0, hold: false, pitch: 0 };
    this.hold = null; this.squash = 0; this.squashV = 0;
    this.back = new THREE.Group(); this.back.position.set(0, S.torso[1] * 0.55, -S.torso[0] * 0.9); this.chest.add(this.back);
    this.parts = { head: this.head, arms: this.arms, legs: this.legs, chest: this.chest, hips: this.hips };
  }

  // carry something in the right hand (camera, vacuum, popcorn…)
  holdItem(obj) {
    const hand = this.arms.find(a => a.s > 0).hand;
    if (this.hold && this.hold.parent === hand) hand.remove(this.hold);
    this.hold = obj; this.pose.hold = !!obj;
    if (obj) { obj.position.set(0, -this.S.hand * 0.6, this.S.hand * 0.5); obj.rotation.set(0, 0, 0); hand.add(obj); }
  }
  land(k = 1) { this.squashV -= 5 * k; }
  setGhost() {}
  get alive() { return !this.exploded;
  }

  face(head, S, opt, skin) {
    const r = S.head, f = new THREE.Group(); f.position.z = r * 0.9; head.add(f); this.faceG = f;
    // bulgy eyes that look slightly different directions
    this.pupils = [];
    for (const s of [-1, 1]) {
      const e = part(sphere(S.eye, 14, 10), PAL.white, s * r * 0.36, r * 0.18, -S.eye * 0.2, f, 0.015);
      const p = new THREE.Mesh(sphere(S.eye * 0.42, 10, 8), toon(PAL.ink)); p.position.set((s > 0 ? -0.15 : 0.25) * S.eye, 0, S.eye * 0.75); e.add(p); this.pupils.push(p);
      const lid = part(new THREE.SphereGeometry(S.eye * 1.08, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), skin, 0, 0, 0, e, 0.012); lid.rotation.x = -0.25;
      const brow = part(capsule(S.eye * 0.25, S.eye * 1.2, 6), opt.hairColor ?? 0x3a2010, s * r * 0.36, r * 0.18 + S.eye * 1.5, S.eye * 0.3, f, 0.01);
      brow.rotation.z = Math.PI / 2 + s * 0.25; this['brow' + s] = brow;
    }
    // big goofy nose
    const n = part(sphere(S.nose, 12, 10), skin, 0, -r * 0.05, S.nose * 0.6, f, 0.02); n.scale.set(1, 1.1, 1.2);
    // mouth: a dark grin that opens when talking, with a couple of teeth
    const m = this.mouth = new THREE.Group(); m.position.set(0, -r * 0.42, 0.02); f.add(m);
    const lip = new THREE.Mesh(new THREE.CircleGeometry(r * 0.28, 18, Math.PI, Math.PI), toon(0x4a1018)); lip.position.z = 0.01; m.add(lip);
    for (const s of [-1, 1]) { const tooth = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.09, r * 0.08), toon(PAL.white)); tooth.position.set(s * r * 0.06, -r * 0.035, 0.012); m.add(tooth); }
    if (opt.mustache) for (const s of [-1, 1]) { const ms = part(capsule(r * 0.07, r * 0.25, 6), opt.hairColor ?? 0x3a2010, s * r * 0.17, -r * 0.27, S.nose * 0.5, f, 0.012); ms.rotation.z = s * 1.25; }
    for (const s of [-1, 1]) part(sphere(r * 0.2, 10, 8), skin, s * r * 0.98, 0, -r * 0.05, head, 0.02).scale.set(0.45, 1, 0.8);   // ears
    if (opt.hair) { const h = part(new THREE.SphereGeometry(r * 1.04, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), opt.hairColor ?? 0x3a2010, 0, r * 0.05, -r * 0.04, head, 0.02); h.rotation.x = -0.2; }
  }

  hat(head, S, opt) {
    const r = S.head, h = new THREE.Group(); h.position.y = r * 0.82; head.add(h);
    if (opt.hat === 'cap') { part(new THREE.SphereGeometry(r * 1.02, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), opt.hatColor ?? PAL.blue, 0, -r * 0.15, 0, h, 0.02); part(cyl(r * 0.6, r * 0.6, 0.02, 16), opt.hatColor ?? PAL.blue, 0, -r * 0.12, r * 0.85, h, 0.015).scale.set(1, 1, 1.3); }
    else if (opt.hat === 'beanie') { part(new THREE.SphereGeometry(r * 1.05, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), opt.hatColor ?? PAL.red, 0, -r * 0.2, 0, h, 0.02); part(sphere(r * 0.25, 8, 6), PAL.white, 0, r * 0.85, 0, h, 0.015); }
    else if (opt.hat === 'headlamp') { part(new THREE.TorusGeometry(r * 0.98, r * 0.06, 6, 20), PAL.ink, 0, -r * 0.45, 0, h, 0).rotation.x = Math.PI / 2; part(rbox(r * 0.4, r * 0.28, r * 0.2, 0.02), PAL.yellow, 0, -r * 0.45, r, h, 0.015); }
  }

  animate(dt) {
    const P = this.pose; this.t += dt;
    this.squashV += (-this.squash * 90 - this.squashV * 9) * dt; this.squash += this.squashV * dt;
    this.rig.scale.set(1 - this.squash * 0.4, 1 + this.squash, 1 - this.squash * 0.4);
    const sp = Math.min(1.5, P.speed / 3.5); this.walk += dt * (P.speed > 0.1 ? 5 + P.speed * 1.6 : 0);
    const w = this.walk, sw = Math.sin(w);
    this.rig.position.y = Math.abs(Math.cos(w)) * 0.06 * sp;
    this.chest.rotation.set(sp * 0.15, sw * 0.12 * sp, sw * 0.05 * sp);
    this.head.rotation.set(-P.pitch * 0.5 + Math.sin(this.t * 1.3) * 0.03, Math.sin(this.t * 0.7) * 0.08, Math.sin(w) * 0.06 * sp);
    for (const L of this.legs) { const ph = Math.sin(w + (L.s > 0 ? 0 : Math.PI)); L.hp.rotation.x = -ph * 0.7 * sp - (P.air ? 0.5 : 0); L.kn.rotation.x = Math.max(0, Math.sin(w + (L.s > 0 ? 0 : Math.PI) + 1.2)) * 1.1 * sp + (P.air ? 0.8 : 0); L.ft.rotation.x = -L.kn.rotation.x * 0.3; }
    for (const A of this.arms) {
      const ph = Math.sin(w + (A.s > 0 ? Math.PI : 0));
      if (P.scared > 0.5) { A.sh.rotation.set(Math.sin(this.t * 25 + A.s) * 0.4, 0, A.s * (2.6 + Math.sin(this.t * 30) * 0.2)); A.el.rotation.x = -0.6; }   // flailing
      else if (P.hold && A.s > 0) { A.sh.rotation.set(-1.15 - P.pitch * 0.6, 0, 0.1); A.el.rotation.x = -0.45; A.hand.rotation.x = 1.6 + P.pitch * 0.4; }
      else { A.sh.rotation.set(ph * 0.8 * sp, 0, A.s * (0.12 + (P.air ? 1.2 : 0))); A.el.rotation.x = -0.25 - sp * 0.5; }
    }
    // talking flaps the jaw; eyebrows bounce
    const talk = Math.max(P.scared * 0.9, P.talk * 3);
    this.mouth.scale.set(1, 0.6 + Math.min(1.4, talk) + Math.sin(this.t * 18) * talk * 0.2, 1);
    this.brow1.position.y = this.S.head * 0.18 + this.S.eye * (1.5 + P.scared * 0.6 + Math.sin(this.t * 2) * 0.05);
    this.brow1.position.y = this.brow1.position.y; this['brow-1'].position.y = this.brow1.position.y;
  }
}
