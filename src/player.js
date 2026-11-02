// The local player. Modes:
//   crew   a bean on foot: walk, sprint, jump, third-person camera
//          (the camera operator looks through the camcorder instead)
//   ghost  fly anywhere, through walls, third-person
//   yeet   flying through the air after a ghost grabbed you
//   float  yeeted: a little ghost bean drifting around watching
import * as THREE from 'three';
import { switchable, setPower } from './toon.js';

export class Player {
  constructor(game) {
    this.g = game;
    this.pos = new THREE.Vector3(-52, 0.25, 4); this.vel = new THREE.Vector3();
    this.yaw = Math.PI / 2; this.pitch = -0.1; this.mode = 'crew'; this.role = 'host';
    this.onGround = true; this.stamina = 1; this.lightOn = true; this.speed = 0; this.slip = 0;
    this.eye = new THREE.Vector3(); this.fwd = new THREE.Vector3(); this.viewQuat = new THREE.Quaternion();
    this.camPos = new THREE.Vector3(); this.camQuat = new THREE.Quaternion(); this.camDist = 3.4;
    this.vacuum = false; this.scared = 0; this.spin = 0; this.yeetT = 0;
    // flashlight
    const s = this.torch = switchable(new THREE.SpotLight(0xfff4d0, 16, 30, 0.5, 0.55, 2));
    s.castShadow = true; s.shadow.mapSize.set(512, 512); s.shadow.bias = -0.0004;
    game.scene.add(s, s.target);
    // camcorder rig
    this.cam = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 60, zoom: 0, nv: false, light: true, selfie: false };
    const cl = this.camLight = switchable(new THREE.SpotLight(0xffe8c8, 12, 24, 0.55, 0.55, 2));
    game.scene.add(cl, cl.target);
  }

  get isCamera() { return this.mode === 'crew' && (this.role === 'camera' || this.role === 'solo'); }

  update(dt, inp) {
    const g = this.g, W = g.world;
    let [lx, ly] = inp.look();
    if (inp.down('ArrowLeft')) lx -= 1.8 * dt; if (inp.down('ArrowRight')) lx += 1.8 * dt;
    if (inp.down('ArrowUp')) ly -= 1.2 * dt; if (inp.down('ArrowDown')) ly += 1.2 * dt;
    const zk = this.isCamera ? this.cam.fov / 60 : 1;
    const selfie = this.isCamera && this.cam.selfie;
    this.yaw -= lx * zk * (selfie ? -1 : 1); this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - ly * zk * (selfie ? -1 : 1)));
    const flip = selfie ? -1 : 1;
    const f = ((inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0)) * flip;
    const s = ((inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0)) * flip;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const wish = new THREE.Vector3(-sin * f + cos * s, 0, -cos * f - sin * s); if (wish.lengthSq() > 1) wish.normalize();

    if (this.mode === 'ghost') return this.updateGhost(dt, inp, wish);
    if (this.mode === 'float') return this.updateFloat(dt, inp, wish);
    if (this.mode === 'yeet') return this.updateYeet(dt);

    // ---- crew on foot (or a viewer walking around the living room)
    const W2 = this.mode === 'room' ? { inWater: () => false, collide: (p, r) => g.room.collide(p, r), floorAt: () => 0, surface: () => 'wood' }
      : g.lobby && g.lobby.contains(this.pos) ? { inWater: () => false, collide: (p, r) => g.lobby.collide(p, r), floorAt: () => g.lobby.root.position.y, surface: () => 'road' } : W;
    const sprint = inp.down('ShiftLeft') && f > 0 && this.stamina > 0.05;
    this.stamina = Math.max(0, Math.min(1, this.stamina + (sprint ? -dt / 5 : dt / 7)));
    const wet = W2.inWater(this.pos.x, this.pos.z);
    let max = (sprint ? 6.2 : 3.6) * (wet ? 0.5 : 1) * (this.vacuum ? 0.6 : 1);
    const slime = g.slimeAt?.(this.pos) ? 1 : 0; this.slip += (slime - this.slip) * Math.min(1, dt * 4);
    const accel = this.onGround ? (this.slip > 0.5 ? 1.2 : 12) : 3;
    this.vel.x += (wish.x * max - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wish.z * max - this.vel.z) * Math.min(1, accel * dt);
    if (inp.hit('Space') && this.onGround) { this.vel.y = 6.2; this.onGround = false; g.sfx?.jump(this.pos); g.body?.land(-0.6); }
    this.vel.y -= 18 * dt;
    const p = this.pos;
    p.addScaledVector(this.vel, dt);
    W2.collide(p, 0.42, p.y + 0.5);
    const fl = W2.floorAt(p.x, p.z, p.y);
    if (p.y <= fl) {
      if (!this.onGround && this.vel.y < -4) { g.body?.land(Math.min(2, -this.vel.y / 8)); g.sfx?.land(p, -this.vel.y); }
      p.y = fl; this.vel.y = 0; this.onGround = true;
    } else if (p.y - fl > 0.05 && this.vel.y <= 0 && p.y - fl < 0.4 && this.onGround) { p.y = fl; this.vel.y = 0; }  // walk down steps
    else this.onGround = p.y - fl < 0.02;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.stride = (this.stride || 0) + this.speed * dt;
    if (this.onGround && this.stride > (sprint ? 1.1 : 0.8)) { this.stride = 0; g.sfx?.step(p, wet ? 'water' : W2.surface?.(p) || (Math.abs(p.z) < 7 && p.x < 30 ? 'road' : 'grass'), sprint ? 1 : 0.6, true); }
    this.rigs(dt);
  }

  updateGhost(dt, inp, wish) {
    const gh = this.g.ghost, up = (inp.down('Space') ? 1 : 0) - (inp.down('KeyC') || inp.down('ControlLeft') ? 1 : 0);
    wish.y = up * 0.8; if (wish.lengthSq() > 1) wish.normalize();
    gh.move(dt, wish, inp.down('ShiftLeft') ? 1.5 : 1);
    if (Math.hypot(wish.x, wish.z) < 0.1) { let d = (this.yaw + Math.PI) - gh.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; gh.yaw += d * Math.min(1, dt * 3); }
    this.pos.copy(gh.pos);
    this.rigs(dt);
  }

  updateFloat(dt, inp, wish) {
    const up = (inp.down('Space') ? 1 : 0) - (inp.down('KeyC') ? 1 : 0);
    this.vel.lerp(wish.multiplyScalar(5).add(new THREE.Vector3(0, up * 4, 0)), Math.min(1, dt * 3));
    this.pos.addScaledVector(this.vel, dt);
    const fl = this.g.world.floorAt(this.pos.x, this.pos.z, this.pos.y + 1);
    this.pos.y = Math.max(fl + 0.2, Math.min(fl + 25, this.pos.y));
    this.speed = this.vel.length();
    this.rigs(dt);
  }

  // ballistic flight with tumbling until we hit the ground, then become a floaty ghost
  updateYeet(dt) {
    this.yeetT += dt; this.vel.y -= 14 * dt;
    this.pos.addScaledVector(this.vel, dt); this.spin += dt * 9;
    const fl = this.g.world.floorAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.pos.y < fl && this.vel.y < 0) {
      this.pos.y = fl;
      if (Math.abs(this.vel.y) > 4 && this.yeetT < 6) { this.vel.y *= -0.35; this.vel.x *= 0.5; this.vel.z *= 0.5; this.g.sfx?.splat(this.pos); }
      else { this.vel.set(0, 0, 0); this.g.onLanded(); }
    }
    this.speed = 0;
    this.rigs(dt);
  }

  // cameras + flashlight
  rigs(dt) {
    const g = this.g;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    this.viewQuat.copy(q); this.fwd.set(0, 0, -1).applyQuaternion(q);
    const head = this.mode === 'ghost' ? 1.4 : (this.headH || 1.4);
    this.eye.set(this.pos.x, this.pos.y + head, this.pos.z);
    // third-person boom, pulled in when something is in the way
    const want = this.mode === 'ghost' ? 4.6 : this.mode === 'float' ? 3.5 : 3.4;
    const back = this.fwd.clone().multiplyScalar(-want).add(new THREE.Vector3(0, 0.55, 0)).add(new THREE.Vector3(Math.cos(this.yaw) * 0.6, 0, -Math.sin(this.yaw) * 0.6));
    let d = 1;
    const inLobby = g.lobby && g.lobby.contains(this.pos);
    if (this.mode !== 'ghost' && this.mode !== 'float' && !inLobby) for (let k = 1; k <= 6; k++) { const t = k / 6, px = this.eye.x + back.x * t, pz = this.eye.z + back.z * t; if (!g.world.los(this.eye.x, this.eye.z, px, pz, this.eye.y) || g.world.floorAt(px, pz, this.eye.y) > this.eye.y + back.y * t - 0.3) { d = Math.max(0.15, (k - 1) / 6); break; } }
    this.camDist += (d - this.camDist) * Math.min(1, dt * (d < this.camDist ? 20 : 4));
    this.camPos.copy(this.eye).addScaledVector(back, this.camDist);
    if (inLobby) { g.lobby.collide(this.camPos, 0.25); this.camPos.y = Math.min(this.camPos.y, g.lobby.root.position.y + 5.5); }
    if (this.mode === 'yeet') { this.camPos.copy(this.eye).add(new THREE.Vector3(Math.sin(this.spin * 0.3) * 4, 2, Math.cos(this.spin * 0.3) * 4)); this.camQuat.setFromRotationMatrix(new THREE.Matrix4().lookAt(this.camPos, this.eye, new THREE.Vector3(0, 1, 0))); }
    else this.camQuat.copy(q);
    // torch in the left mitten points where you look
    const torchOn = this.mode === 'crew' && !this.isCamera && this.lightOn && this.g.state === 'live';
    this.torch.visible = torchOn;
    this.torch.position.copy(this.eye).add(new THREE.Vector3(-0.35, -0.3, 0).applyQuaternion(q));
    this.torch.target.position.copy(this.eye).addScaledVector(this.fwd, 8);
    // camcorder: handheld spring, zoom, selfie
    if (this.isCamera) {
      const c = this.cam;
      let tp, tq;
      if (c.selfie) {
        tp = this.eye.clone().addScaledVector(this.fwd, 1.5).add(new THREE.Vector3(0, 0.1, 0));
        tq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(tp, this.eye.clone().add(new THREE.Vector3(0, -0.05, 0)), new THREE.Vector3(0, 1, 0)));
      } else { tp = this.eye.clone().add(new THREE.Vector3(0.1, 0.05, -0.2).applyQuaternion(q)); tq = q.clone(); }
      const t = performance.now() / 1000;
      tq.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * 1.3) * 0.005, Math.sin(t * 0.9) * 0.005, Math.sin(t * 0.7) * 0.008 + Math.sin(this.stride * 4) * 0.01 * Math.min(1, this.speed / 4))));
      c.pos.lerp(tp, 1 - Math.exp(-dt * 20)); c.quat.slerp(tq, 1 - Math.exp(-dt * (14 - c.zoom * 8)));
      c.fov = 60 - c.zoom * 42;
      const cf = new THREE.Vector3(0, 0, -1).applyQuaternion(c.quat);
      this.camLight.visible = c.light && !c.nv;
      setPower(this.camLight, c.selfie ? 1.2 : 12);
      this.camLight.position.copy(c.pos).add(new THREE.Vector3(0, 0.15, 0)); this.camLight.target.position.copy(c.pos).addScaledVector(cf, 6);
    } else this.camLight.visible = false;
  }
}
