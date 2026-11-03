// GHOST HUNTERS TV — boot, the session flow (menu → lobby lot → live show →
// end card) and the glue between town, crew, ghost, living room and audience.
import * as THREE from 'three';
import { Gfx } from './gfx.js';
import { World, groundY } from './world.js';
import { Lobby, LOT } from './lobby.js';
import { Room, ROOM } from './room.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { UI } from './ui.js';
import { Net } from './net.js';
import { Sfx } from './sfx.js';
import { Voice } from './voice.js';
import { Ghost, GHOST_TYPES, COSTS, ghostModel } from './ghosts.js';
import { Dude } from './dude.js';
import { Gore } from './gore.js';
import { ScareOverlay } from './scareface.js';
import { Show, SEGMENTS, AUDIENCE } from './show.js';
import { LOOKS } from './dude.js';
import { camcorder, flashlight, vacuumNozzle, vacuumTank } from './gear.js';
import { PAL, toon, glow, part, rbox, sphere, cone, capsule, cyl } from './toon.js';

const V3 = (a) => new THREE.Vector3(...a);

// someone else, drawn as a bean (crew on the lot, in town, or in the living room)
class Avatar {
  constructor(game, mem) {
    this.g = game; this.id = mem.id; this.name = mem.name; this.lookI = mem.look?.i || 0;
    this.body = new Dude(LOOKS[this.lookI] || LOOKS[0]); game.scene.add(this.body.group);
    this.pos = new THREE.Vector3(); this.target = new THREE.Vector3(); this.yaw = 0; this.tyaw = 0; this.have = false;
    this.mode = 'crew'; this.role = 'host'; this.light = true; this.vac = false; this.voice = 0; this.cam = null; this.pitch = 0; this.speed = 0; this.air = 0; this.held = null;
    this.items = { camera: camcorder(), torch: flashlight(), vac: vacuumNozzle() };
    this.tank = vacuumTank(); this.tank.scale.setScalar(0.8); this.body.back.add(this.tank);
    this.light3 = new THREE.SpotLight(0xfff4d0, 0, 26, 0.5, 0.55, 2); game.scene.add(this.light3, this.light3.target);
    this.tag = nameTag(this.name); this.tag.position.y = 2.25; this.body.group.add(this.tag);
  }
  apply(s) {
    if (this.mode === 'dying' && s.m === 'crew') return;
    this.target.set(...s.p); this.tyaw = s.y; this.pitch = s.pi || 0; this.speed = s.sp || 0; this.air = s.air || 0; this.mode = s.m; this.role = s.r; this.light = !!s.l; this.vac = !!s.vc; this.voice = s.v || 0; this.cam = s.cam || null; this.held = s.h || null;
    if (s.i !== undefined && s.i !== this.lookI) { this.lookI = s.i; const old = this.body; this.g.scene.remove(old.group); this.body = new Dude(LOOKS[s.i] || LOOKS[0]); this.g.scene.add(this.body.group); this.body.back.add(this.tank); this.body.group.add(this.tag); }
    if (!this.have) { this.pos.copy(this.target); this.yaw = this.tyaw; this.have = true; }
  }
  get alive() { return this.mode === 'crew'; }
  // a remote player's own 'dying' state must not be overwritten by stale packets
  headPos() { return this.pos.clone().setY(this.pos.y + 1.15); }
  update(dt) {
    const b = this.body, far = this.pos.distanceTo(this.target) > 4;
    if (far) this.pos.copy(this.target); else this.pos.lerp(this.target, Math.min(1, dt * 12));
    let d = this.tyaw - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; this.yaw += d * Math.min(1, dt * 12);
    const ghostRole = this.mode === 'ghost';
    if (b.exploded && this.mode === 'room') { this.g.scene.remove(b.group); this.body = new Dude(LOOKS[this.lookI] || LOOKS[0]); this.g.scene.add(this.body.group); this.body.back.add(this.tank); this.body.group.add(this.tag); return this.update(dt); }
    b.group.visible = this.have && !ghostRole && !b.exploded;
    b.group.position.copy(this.pos); b.group.rotation.y = this.yaw + Math.PI;
    b.setGhost(this.mode === 'float');
    Object.assign(b.pose, { speed: this.speed, pitch: -this.pitch, air: this.air, talk: this.voice, aim: this.vac || this.role !== 'camera', scared: this.scared > 0 ? 1 : 0 });
    this.scared = Math.max(0, (this.scared || 0) - dt);
    const isCam = this.role === 'camera' || this.role === 'solo';
    const want = this.mode !== 'crew' ? (this.held ? this.g.roomHeld(this.held) : null) : isCam ? this.items.camera : this.items.vac;
    if (b.hold !== want) b.holdItem(want);
    if (this.mode === 'yeet') { b.group.rotation.x += dt * 12; b.group.rotation.z += dt * 7; } else { b.group.rotation.x = 0; b.group.rotation.z = 0; }
    b.animate(dt);
    this.tank.visible = this.mode === 'crew' && !isCam;
    // their torch / camera light
    const L = this.light3, eye = this.headPos(), f = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    if (this.mode === 'crew' && isCam && this.cam) { L.position.set(...this.cam.p); L.target.position.copy(L.position).add(new THREE.Vector3(0, 0, -6).applyQuaternion(new THREE.Quaternion(...this.cam.q))); L.intensity = this.cam.l && !this.cam.nv ? (this.cam.sf ? 1.2 : 12) : 0; }
    else if (this.mode === 'crew') { L.position.copy(eye); L.target.position.copy(eye).addScaledVector(f, 8); L.intensity = this.light ? 16 : 0; }
    else L.intensity = 0;
    this.tag.visible = this.g.place === 'room' ? this.mode !== 'crew' : this.g.state !== 'live';
  }
  dispose() { this.g.scene.remove(this.body.group, this.light3, this.light3.target); }
}

function nameTag(name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = 'bold 40px Rajdhani'; const w = Math.min(250, x.measureText(name).width + 28);
  x.fillStyle = 'rgba(26,16,48,0.85)'; x.beginPath(); x.roundRect(128 - w / 2, 6, w, 50, 25); x.fill();
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.2, 0.3, 1); s.renderOrder = 99; return s;
}

class Game {
  constructor() {
    this.gfx = new Gfx(document.getElementById('view'));
    this.scene = this.gfx.scene; this.scene.add(this.gfx.camera);
    this.input = new Input(document.getElementById('view'));
    this.sfx = new Sfx(); this.audio = this.sfx;
    this.net = new Net();
    this.hud = new Hud(this); this.ui = new UI(this);
    this.voice = new Voice(this);
    this.show = new Show(this);
    this.clock = new THREE.Clock(); this.t = 0;
    this.state = 'boot'; this.place = 'world'; this.avatars = new Map(); this.offline = false; this.roles = {}; this.caller = 0;
    this.camRig = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 60, nv: false, light: true };
    this.sendT = 0; this.ghostT = 0; this.worldT = 0; this.slimes = []; this.chickens = []; this.projectiles = []; this.held = null; this.tvFull = false;
    this.frustum = new THREE.Frustum(); this.tmpCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 80);
  }

  async boot() {
    this.world = new World(this.scene).build('diner'); this.applyLook();
    this.lobby = new Lobby(this);
    this.room = new Room(this);
    this.room.makeButtons(AUDIENCE);
    this.player = new Player(this); this.player.headH = this.body ? this.body.head.getWorldPosition(new THREE.Vector3()).y : 1.4;
    this.ghost = new Ghost(this, 'edith'); this.ghost.m.group.visible = false;
    this.gore = new Gore(this); this.scare = new ScareOverlay(this.gfx.renderer);
    this.makeBody(Number(localStorage.getItem('ght_look') || 0));
    this.wire();
    window.__ght = this;
    this.state = 'menu'; this.ui.title();
    const unlock = () => { this.sfx.start(); this.sfx.music(true); };
    addEventListener('pointerdown', unlock, { once: true }); addEventListener('keydown', unlock, { once: true });
    const q = new URLSearchParams(location.search), code = (q.get('join') || q.get('watch') || '').toUpperCase();
    if (code) { history.replaceState(null, '', location.pathname); this.ui.prefill(code, q.get('watch') ? 'watch' : 'join'); }
    this.loop();
  }

  makeBody(i) {
    if (this.body) { this.scene.remove(this.body.group); }
    this.lookI = i;
    this.body = new Dude(LOOKS[i] || LOOKS[0]); this.scene.add(this.body.group);
    this.myItems = { camera: camcorder(), vac: vacuumNozzle() };
    this.myTank = vacuumTank(); this.myTank.scale.setScalar(0.8); this.body.back.add(this.myTank);
    // where the eyes are on this body (bobbleheads and lanky folk differ a lot)
    this.body.group.position.set(0, 0, 0); this.body.group.rotation.set(0, 0, 0); this.body.group.updateMatrixWorld(true);
    if (this.player) this.player.headH = this.body.head.getWorldPosition(new THREE.Vector3()).y;
  }
  setLook(i) { localStorage.setItem('ght_look', i); this.makeBody(i); this.sendLook(); }
  sendLook(extra) { this.myRole = { ...(this.myRole || {}), ...(extra || {}) }; this.net.send({ t: 'look', look: { i: this.lookI, ...this.myRole } }); }

  // ---------------------------------------------------------------- net
  wire() {
    const n = this.net;
    n.on('roster', () => {
      for (const [id, a] of this.avatars) if (!n.member(id)) { a.dispose(); this.avatars.delete(id); }
      if (this.state === 'live' && this.isDirector && this.roles && !this.offline) {
        const gid = this.ghostInfo?.id; if (gid && !n.member(gid)) { this.ghostInfo.id = 0; this.ghost.ctrl = 'ai'; this.fx({ k: 'ghostai' }); }
      }
      this.hud.roster();
    });
    n.on('chat', (m) => this.hud.chat(m));
    n.on('start', (m) => this.beginEpisode(m));
    n.on('s', (m) => this.avatarFor(m.from)?.apply(m));
    n.on('g', (m) => { if (!this.ghostAuth) this.ghost.unpack(m); });
    n.on('w', (m) => { if (!this.isDirector) this.show.unpack(m.s); });
    n.on('ev', (m) => this.applyEv(m.ev, m.from));
    n.on('vote', (m) => this.onVote(m));
    n.on('vac', (m) => this.onVac(m));
    n.on('need-sync', (m) => this.sendSync(m.id));
    n.on('from', (m) => { if (m.data?.sync) this.lateJoin(m.data.sync); });
    n.on('end', (m) => this.endEpisode(m.r, true));
    n.on('aborted', (m) => { this.leaveLive(); this.toLobby(); this.hud.toast(m.why, 4000); });
    n.on('error', (m) => { this.hud.toast(m.why, 4000); if (this.state === 'joining') { this.state = 'menu'; this.ui.title(m.why); } });
    n.on('joined', () => this.toLobby());
    n.on('closed', () => { if (!this.offline && this.state !== 'menu') { this.leaveLive(); this.state = 'menu'; this.ui.title('Lost connection to the show server.'); } });
  }
  get isDirector() { return this.offline || this.net.isDirector; }
  get ghostAuth() { return this.state === 'live' && (this.ghostInfo?.id ? this.ghostInfo.id === this.net.id : this.isDirector); }
  fx(ev) { this.applyEv(ev, this.net.id); if (!this.offline) this.net.send({ t: 'ev', ev }); }

  avatarFor(id) {
    if (id === this.net.id) return null;
    let a = this.avatars.get(id);
    if (!a) { const mem = this.net.member(id); if (!mem) return null; a = new Avatar(this, mem); this.avatars.set(id, a); }
    return a;
  }

  async connect(f) {
    this.state = 'joining';
    try { await this.net.connect(); this.offline = false; f(); }
    catch (e) { this.state = 'menu'; this.ui.title(e.message + ' Solo still works!'); }
  }
  hostShow() { this.connect(() => this.net.send({ t: 'create', name: this.ui.name, look: { i: this.lookI } })); }
  joinShow(code, as) { this.connect(() => this.net.send({ t: 'join', code, as, name: this.ui.name || 'Viewer', look: { i: this.lookI } })); }
  async listShows(cb) { try { await this.net.connect(); this.net.on('shows', (m) => cb(m.list)); this.net.send({ t: 'shows' }); } catch { cb(null); } }
  soloShow() {
    this.offline = true; this.net.id = 1; this.net.code = 'SOLO'; this.net.kind = 'crew'; this.net.open = false;
    this.net.roster = { director: 1, phase: 'lobby', settings: { minutes: 10 }, members: [{ id: 1, name: this.ui.name, kind: 'crew', look: { i: this.lookI } }] };
    this.net.send = () => {};
    this.toLobby();
  }
  leaveShow() { this.net.send({ t: 'leave' }); this.leaveLive(); this.state = 'menu'; this.place = 'world'; this.ui.title(); }

  // ------------------------------------------------------------ lobby
  toLobby() {
    this.hideMenuScene();
    this.state = 'lobby'; this.myRole = { role: 'host' }; this.sendLook();
    this.ui.lobby(); this.hud.setMode('lobby');
    const crew = this.net.kind === 'crew';
    this.place = crew ? 'world' : 'room';
    const p = this.player; p.mode = crew ? 'crew' : 'float'; p.role = 'host'; p.vel.set(0, 0, 0);
    if (crew) { p.pos.copy(this.lobby.spawn).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 2)); p.yaw = 0; }
    else { p.mode = 'room'; p.pos.copy(this.room.spawn); p.yaw = 0; }
    this.input.enabled = true;
    this.voice.sync();
  }

  rolesSummary() {
    const crew = this.net.crew(), cam = crew.find(m => m.look?.role === 'camera'), gh = crew.find(m => m.look?.role === 'ghost');
    return { cam, gh };
  }

  startShow() {
    if (!this.isDirector) return;
    const crew = this.net.crew(), roles = {};
    const ghost = crew.find(m => m.look?.role === 'ghost');
    let cam = crew.find(m => m.look?.role === 'camera' && m !== ghost);
    const hunters = crew.filter(m => m !== ghost);
    if (!hunters.length) { this.hud.toast('Someone has to hunt the ghost! (Only the ghost is here.)', 3000); return; }
    if (!cam) cam = hunters.find(m => m.id === this.net.id) || hunters[0];
    for (const m of hunters) roles[m.id] = hunters.length === 1 ? 'solo' : m === cam ? 'camera' : 'host';
    const type = ghost?.look?.gt || this.net.roster.settings?.ghostType || Object.keys(GHOST_TYPES)[Math.floor(Math.random() * 4)];
    const m = { t: 'start', roles, map: this.net.roster.settings?.map || 'diner', ghost: { id: ghost ? ghost.id : 0, type }, minutes: this.net.roster.settings?.minutes || 10, seed: Math.random() * 1e9 | 0 };
    if (!this.offline) { this.net.send({ t: 'phase', phase: 'live' }); this.net.send(m); }
    this.beginEpisode(m);
  }

  beginEpisode(m) {
    this.ui.clear(); this.state = 'live'; this.startInfo = m;
    this.roles = m.roles; this.ghostInfo = { ...m.ghost };
    if (this.world.mapId !== (m.map || 'diner')) { this.hideMenuScene(); this.world.build(m.map || 'diner'); }
    this.applyLook();
    this.show.reset(m.minutes);
    this.ghost.setType(m.ghost.type); this.ghost.ecto = 100; this.ghost.captured = false; this.ghost.manifest = 0; this.ghost.pos.copy(this.world.spots.ghost); this.ghost.ctrl = m.ghost.id ? 'player' : 'ai';
    for (const s of this.slimes) this.scene.remove(s.m); this.slimes = [];
    this.gore.clear(); if (this.body.exploded) this.makeBody(this.lookI);
    for (const c of this.chickens) this.scene.remove(c.m); this.chickens = [];
    const me = this.net.id, p = this.player;
    p.vel.set(0, 0, 0); p.cam.nv = false; p.cam.zoom = 0; p.cam.light = true; p.lightOn = true; p.stamina = 1;
    if (m.ghost.id === me) { p.mode = 'ghost'; this.place = 'world'; p.pos.copy(this.ghost.pos); this.hud.setMode('ghost'); }
    else if (m.roles[me]) {
      p.mode = 'crew'; p.role = m.roles[me]; this.place = 'world';
      const i = Object.keys(m.roles).indexOf(String(me)), van = this.world.spots.van;
      p.pos.set(van.x + (i % 4) * 1.2, van.y, van.z + Math.floor(i / 4) * 1.2); p.pos.y = this.world.floorAt(p.pos.x, p.pos.z, van.y + 1); p.yaw = -Math.PI / 2; p.pitch = -0.05;
      p.cam.selfie = p.role === 'solo'; if (p.role === 'solo') p.yaw += Math.PI;
      this.hud.setMode(p.isCamera ? 'camera' : 'host');
    } else { p.mode = 'room'; this.place = 'room'; p.pos.copy(this.room.spawn); p.yaw = 0; this.hud.setMode('room'); }
    this.input.enabled = true;
    this.sfx.start(); this.sfx.onAir(); this.sfx.music(true, 0.3);
    this.hud.fade(true, 0); setTimeout(() => this.hud.fade(false, 1200), 250);
    const gt = GHOST_TYPES[m.ghost.type];
    this.hud.banner(p.mode === 'ghost' ? `YOU ARE ${gt.name.toUpperCase()}` : p.mode === 'room' ? 'YOU ARE WATCHING FROM HOME' : p.isCamera ? 'YOU ARE THE CAMERA' : 'YOU ARE A HOST',
      p.mode === 'ghost' ? `${gt.blurb} Scare them. Yeet them. Don't get vacuumed.` : p.mode === 'room' ? 'Watch the TV, mess with the crew from the vote board, call them on the phone.' : `Tonight's ghost: ${gt.name}. Film it, vacuum it, survive.`);
    if (!this.voice.mic && p.mode !== 'room') this.voice.enableMic();
  }

  // fog + sky light for the loaded map
  applyLook(L = this.world.look) { const f = this.scene.fog; f.color.set(L.fog); f.near = L.near; f.far = L.far; this.gfx.hemi.intensity = L.hemi; this.gfx.moon.intensity = L.moon; }

  leaveLive() {
    this.hud.setMode(null); this.input.release();
    for (const a of this.avatars.values()) a.dispose(); this.avatars.clear();
    this.ghost.m.group.visible = false; this.sfx.vacuum(false); this.caller = 0;
  }

  sendSync(id) {
    if (this.state !== 'live' || !this.isDirector) return;
    this.net.send({ t: 'to', to: id, data: { sync: { start: this.startInfo, ghostId: this.ghostInfo.id, caller: this.caller } } });
  }
  lateJoin(s) { if (this.state === 'live') return; this.beginEpisode(s.start); this.ghostInfo.id = s.ghostId; this.caller = s.caller; }

  // everyone's crew info (for ghost reveal, ratings, AI)
  crewList() {
    const out = [], p = this.player;
    if (this.roles[this.net.id]) out.push({ id: this.net.id, name: this.ui.name, pos: p.pos, alive: p.mode === 'crew', light: p.mode === 'crew' && !p.isCamera && p.lightOn, eye: p.eye, fwd: p.fwd, voice: this.voice.level, camera: p.isCamera, selfie: p.cam.selfie, vac: this.vacuumOn });
    for (const [id, a] of this.avatars) {
      if (!this.roles[id]) continue;
      const f = new THREE.Vector3(-Math.sin(a.yaw) * Math.cos(a.pitch), Math.sin(a.pitch), -Math.cos(a.yaw) * Math.cos(a.pitch));
      out.push({ id, name: a.name, pos: a.pos, alive: a.mode === 'crew', light: a.mode === 'crew' && a.light && a.role === 'host', eye: a.headPos(), fwd: f, voice: a.voice, camera: a.role === 'camera' || a.role === 'solo', selfie: !!a.cam?.sf, vac: a.vac });
    }
    return out;
  }

  // ------------------------------------------------------- ghost powers
  // called by whoever controls the ghost (AI on director, or the ghost player)
  ghostAct(kind, arg) {
    const gh = this.ghost, p = gh.pos;
    if (kind === 'boo' && gh.can(COSTS.boo)) { gh.spend(COSTS.boo); this.fx({ k: 'boo', p: p.toArray() }); }
    else if (kind === 'prank' && gh.can(COSTS.prank)) {
      const props = this.world.props.map((o, i) => [o, i]).filter(([o]) => ['trash', 'pumpkin', 'jukebox', 'washer', 'chandelier', 'lamp'].includes(o.kind));
      let best = null, bd = 12; for (const [o, i] of props) { const d = (o.g ? o.g.getWorldPosition(new THREE.Vector3()) : o.pos).distanceTo(p); if (d < bd) { bd = d; best = i; } }
      gh.spend(COSTS.prank);
      if (best !== null) this.fx({ k: 'prank', i: best }); else this.fx({ k: 'honk', p: p.toArray() });
    }
    else if (kind === 'manifest' && gh.can(COSTS.manifest) && gh.manifest <= 0) { gh.spend(COSTS.manifest); this.fx({ k: 'manifest' }); }
    else if (kind === 'special' && gh.can(gh.T.cost)) { gh.spend(gh.T.cost); this.fx({ k: 'special', type: gh.type, p: p.toArray(), y: gh.yaw }); }
    else if (kind === 'grab') {
      if (gh.manifest <= 0) return;
      const c = this.crewList().find(c => c.id === arg && c.alive); if (!c) return;
      const dir = c.pos.clone().sub(p).setY(0).normalize();
      this.fx({ k: 'kill', id: c.id, d: dir.toArray(), p: c.pos.toArray() });
    }
  }
  tryGrab() {   // ghost player clicked: grab the closest crew member in front
    const gh = this.ghost; if (gh.manifest <= 0) { this.hud.toast('MANIFEST FIRST (3) TO GRAB', 1500); return; }
    let best = null, bd = 2.2; for (const c of this.crewList()) { if (!c.alive) continue; const d = c.pos.distanceTo(gh.pos.clone().setY(c.pos.y)); if (d < bd) { bd = d; best = c; } }
    if (best) this.ghostAct('grab', best.id); else this.sfx.tone(null, { type: 'sine', path: [[0, 300], [0.2, 150]], dur: 0.2, gain: 0.15 });
  }

  // ------------------------------------------------------------- events
  applyEv(ev, from) {
    const S = this.sfx, W = this.world, gh = this.ghost;
    switch (ev.k) {
      case 'boo': {
        const p = V3(ev.p); S.boo(p); gh.noise = 1;
        this.scareNear(p, 7);
        if (this.isDirector) this.show.bump('boo', p.clone().setY(p.y + 1), 4);
        break;
      }
      case 'prank': {
        const o = W.props[ev.i]; if (!o) break;
        const pos = o.g ? o.g.getWorldPosition(new THREE.Vector3()) : o.pos.clone();
        o.dance = 4; gh.noise = Math.max(gh.noise, 0.6);
        if (o.kind === 'trash') { S.honk(pos); S.thunk(pos); }
        else if (o.kind === 'pumpkin') { S.laugh(0.5); S.squeak(pos); }
        else if (o.kind === 'jukebox') { S.airhorn(); }
        else if (o.kind === 'washer') { S.clank(pos); }
        else if (o.kind === 'chandelier') { S.shatter(pos); }
        else if (o.kind === 'lamp') { o.flick = 3; S.tone(pos, { type: 'square', path: [[0, 120]], dur: 0.5, gain: 0.08, filter: 600 }); }
        if (this.isDirector) this.show.bump('prank', pos, 3);
        break;
      }
      case 'honk': S.honk(V3(ev.p)); if (this.isDirector) this.show.bump('prank', V3(ev.p), 2); break;
      case 'manifest': gh.manifest = 9; S.manifest(gh.pos); S.wooo(gh.pos, gh.type === 'pete' ? 1.5 : gh.type === 'clank' ? 0.7 : 1); if (this.isDirector) this.show.bump('manifest', gh.pos.clone().setY(gh.pos.y + 1), 5); break;
      case 'special': this.special(ev); break;
      case 'kill': {
        const p = V3(ev.p), dir = V3(ev.d);
        gh.manifest = Math.max(gh.manifest, 2); gh.noise = 1;
        const name = this.nameOf(ev.id);
        if (ev.id === this.net.id) {
          const pl = this.player; pl.mode = 'dying'; pl.vel.set(0, 0, 0); this.dieT = 0; this.deathDir = dir; this.deathAt = pl.pos.clone();
          this.scare.play(gh.type, 1000); S.jumpscare(); this.shake = 1.2;
          setTimeout(() => { this.gore.explode(this.body, dir); this.hud.banner('YOU DIED', 'Messily. Welcome to the living room.'); }, 950);
        } else {
          const a = this.avatars.get(ev.id);
          if (a) { a.mode = 'dying'; setTimeout(() => this.gore.explode(a.body, dir), 600); }
          S.wooo(gh.pos, 0.7, 1.2);
        }
        setTimeout(() => this.hud.toast(`${name.toUpperCase()} EXPLODED`, 3500, 'bad'), 900);
        if (this.isDirector) { this.show.bump('yeet', p.clone().setY(p.y + 1), 14); this.show.mood = 'yeet'; }
        break;
      }
      case 'yeet': {
        const p = V3(ev.p); S.yeet(p); S.laugh(1);
        if (ev.id === this.net.id) { const pl = this.player; pl.mode = 'yeet'; pl.vel.set(...ev.v); pl.yeetT = 0; this.hud.banner('YOU GOT YEETED', 'Welcome to the living room. You can still watch, vote and call in.'); }
        const a = this.avatars.get(ev.id); if (a) { a.mode = 'yeet'; }
        const name = this.nameOf(ev.id); this.hud.toast(`${name.toUpperCase()} GOT YEETED`, 3500, 'bad');
        if (this.isDirector) { this.show.bump('yeet', p.clone().setY(p.y + 1), 12); this.show.mood = 'yeet'; }
        break;
      }
      case 'captured': S.cheer(); this.hud.banner('GHOST BUSTED!', 'The crew vacuumed it up. Viewers are losing their minds.'); gh.captured = true; if (this.isDirector) this.show.complete('vacuum'); break;
      case 'ghostai': this.ghostInfo.id = 0; this.ghost.ctrl = 'ai'; this.hud.toast('THE GHOST PLAYER LEFT · AI TAKES OVER', 3000); break;
      case 'segment': { const s = SEGMENTS.find(x => x.id === ev.id); this.show.done.add(ev.id); this.hud.toast(`★ ${s.title}  +${s.pts}`, 3000, 'good'); S.ding(); break; }
      case 'audience': this.audienceEvent(ev); break;
      case 'room': this.roomEv(ev, from); break;
    }
  }

  nameOf(id) { return id === this.net.id ? this.ui.name : this.net.member(id)?.name || 'Someone'; }

  scareNear(p, r) {
    const me = this.player;
    if (me.mode === 'crew' && me.pos.distanceTo(p) < r) { me.scared = 1.4; if (me.onGround) me.vel.y = 5; this.sfx.scream(null); this.shake = 0.6; }
    for (const a of this.avatars.values()) if (a.mode === 'crew' && a.pos.distanceTo(p) < r) { a.scared = 1.4; this.sfx.scream(a.headPos()); }
  }

  special(ev) {
    const S = this.sfx, p = V3(ev.p), gh = this.ghost, me = this.player;
    gh.noise = 1;
    if (ev.type === 'edith') {
      S.diva(p); this.shake = 1;
      if (me.mode === 'crew') { const d = me.pos.distanceTo(p); if (d < 13) { const push = me.pos.clone().sub(p).setY(0).normalize().multiplyScalar(14 * (1 - d / 13)); me.vel.add(push); me.vel.y = 6; me.scared = 1.5; me.lightOn = false; } }
      for (const L of this.world.props) if (L.kind === 'lamp' && L.pos.distanceTo(p) < 16) L.flick = 4;
    } else if (ev.type === 'pete') {
      S.laugh(0.6);
      const targets = this.crewList().filter(c => c.alive && c.pos.distanceTo(p) < 18);
      for (let i = 0; i < 6; i++) { const t = targets[i % Math.max(1, targets.length)]; const to = t ? t.pos.clone() : p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10)); this.launch(p.clone().setY(p.y + 1.5), to, i * 0.15); }
    } else if (ev.type === 'clank') {
      S.clank(p); S.tone(p, { type: 'sawtooth', path: [[0, 200], [0.6, 120]], dur: 0.7, gain: 0.15, filter: 800 });
      gh.charge = 1.6; gh.manifest = Math.max(gh.manifest, 2.5);
      if (this.ghostAuth) { gh.yaw = ev.y; gh.vel.set(Math.sin(ev.y) * 14, 0, Math.cos(ev.y) * 14); }
    } else if (ev.type === 'gloop') {
      S.gloop(p); this.addSlime(p, 4.5, 25);
    }
    if (this.isDirector) this.show.bump('special', p.clone().setY(p.y + 1), 7);
  }

  addSlime(p, r, life) {
    const fl = this.world.floorAt(p.x, p.z, p.y + 1);
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 28), new THREE.MeshBasicMaterial({ color: 0x7dff5a, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, fl + 0.06, p.z); this.scene.add(m);
    for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(sphere(0.12 + Math.random() * 0.15, 8, 6), toon(0x7dff5a)); b.position.set(p.x + (Math.random() - 0.5) * r * 1.4, fl + 0.05, p.z + (Math.random() - 0.5) * r * 1.4); b.scale.y = 0.4; m.attach(b); }
    this.slimes.push({ m, p: new THREE.Vector3(p.x, fl, p.z), r, life });
  }
  slimeAt(p) { return this.slimes.some(s => Math.hypot(p.x - s.p.x, p.z - s.p.z) < s.r && Math.abs(p.y - s.p.y) < 1.5); }

  // a pumpkin (or rubber chicken) arcing at someone
  launch(from, to, delay = 0, kind = 'pumpkin') {
    setTimeout(() => {
      const m = kind === 'chicken' ? chickenModel() : pumpkinBall(); m.position.copy(from); this.scene.add(m);
      const dt = 1.1, v = to.clone().setY(to.y + 1).sub(from).divideScalar(dt); v.y += 0.5 * 14 * dt;
      this.projectiles.push({ m, v, life: 4, kind });
    }, delay * 1000);
  }

  audienceEvent(ev) {
    const S = this.sfx, at = V3(ev.p);
    if (ev.a === 'honk') { S.honk(at.clone().add(new THREE.Vector3(2, 1, 0))); S.honk(at.clone().add(new THREE.Vector3(-2, 1, 1))); }
    else if (ev.a === 'chicken') { S.laugh(0.6); for (let i = 0; i < 14; i++) { const f = at.clone().add(new THREE.Vector3((Math.random() - 0.5) * 14, 18 + Math.random() * 6, (Math.random() - 0.5) * 14)); this.launch(f, f.clone().setY(groundY(f.x, f.z)), i * 0.12, 'chicken'); } }
    else if (ev.a === 'disco') { this.disco = 10; S.airhorn(); }
    else if (ev.a === 'slime') { S.gloop(at); this.addSlime(at, 3.5, 20); }
    else if (ev.a === 'energy') { if (this.ghostAuth) this.ghost.ecto = 100; this.ghost.noise = 1; S.wooo(this.ghost.pos, 1.2); }
    else if (ev.a === 'reveal') { this.ghost.manifest = Math.max(this.ghost.manifest, 6); S.manifest(this.ghost.pos); }
    else if (ev.a === 'hunt') { if (this.ghostAuth) { this.ghost.ecto = 100; if (this.ghost.ctrl === 'ai') { this.ghost.ai.mood = 'hunt'; this.ghost.ai.target = this.crewList().find(c => c.alive) || null; this.ghost.ai.timer = 14; } } S.wooo(this.ghost.pos, 0.6, 1.4); }
    this.hud.toast(`THE AUDIENCE CHOSE: ${AUDIENCE[ev.a].label}`, 2500);
    if (this.isDirector) this.show.bump('audience', at.clone().setY(at.y + 1), 3);
  }

  onVote(m) {
    if (!this.isDirector || this.state !== 'live') return;
    const n = this.offline ? 1 : Math.max(1, this.roomCount());
    const k = this.show.vote(m.key, 1, n);
    if (k) { const c = this.camRig.pos; this.fx({ k: 'audience', a: k, p: [c.x, this.world.floorAt(c.x, c.z, c.y), c.z] }); }
  }
  roomCount() { return this.net.audience().length + [...this.avatars.values()].filter(a => a.mode === 'float' || a.mode === 'room').length + (this.player.mode === 'room' || this.player.mode === 'float' ? 1 : 0); }

  // vacuum reports go to whoever runs the ghost
  onVac(m) { if (this.ghostAuth) this.vacHits = (this.vacHits || []).concat([{ from: V3(m.p), dir: V3(m.d), t: performance.now() }]); }

  roomEv(ev, from) {
    const R = this.room;
    if (ev.a === 'ignite') R.ignite(ev.i);
    else if (ev.a === 'douse') R.douse(ev.i);
    else if (ev.a === 'pop') { if (from !== this.net.id) R.throwPopcorn(V3(ev.p), V3(ev.d)); }
    else if (ev.a === 'foam') { if (from !== this.net.id) R.sprayFoam(V3(ev.p), V3(ev.d)); }
    else if (ev.a === 'grab') { const it = R.items[ev.i]; if (it) { it.holder = from; if (from !== this.net.id) it.obj.visible = false; } }
    else if (ev.a === 'drop') { const it = R.items[ev.i]; if (it) { it.holder = 0; it.obj.visible = true; it.obj.position.copy(V3(ev.p)); } }
    else if (ev.a === 'call') { this.caller = ev.id; this.sfx.ring(); this.hud.toast(`${this.nameOf(ev.id).toUpperCase()} IS CALLING IN LIVE!`, 3500, 'good'); if (this.isDirector) { this.callT = 0; } }
    else if (ev.a === 'hang') { if (this.caller === ev.id) this.caller = 0; this.sfx.click(800, 0.2); }
  }
  roomHeld(kind) { if (!this.remoteHeld) this.remoteHeld = {}; if (!this.remoteHeld[kind]) { const it = this.room.items.find(i => i.kind === kind); this.remoteHeld[kind] = it ? it.obj.clone() : null; if (this.remoteHeld[kind]) this.remoteHeld[kind].position.set(0, 0, 0); } return this.remoteHeld[kind]; }

  // after the jumpscare: watch your own remains for a moment, then the couch
  dying(dt) {
    this.dieT += dt;
    if (this.dieT > 4.2 && this.player.mode === 'dying') { this.player.mode = 'yeet'; this.onLanded(); }
  }

  // yeeted crew land… in the living room
  onLanded() {
    const p = this.player; this.sfx.splat(null);
    this.hud.fade(true, 200);
    setTimeout(() => { if (this.body.exploded) this.makeBody(this.lookI); p.mode = 'room'; this.place = 'room'; p.pos.copy(this.room.spawn); p.vel.set(0, 0, 0); this.hud.setMode('room'); this.hud.fade(false, 800); this.hud.toast('YOU WOKE UP ON THE COUCH. THE SHOW GOES ON.', 3500); }, 450);
  }

  endEpisode(r, remote) {
    if (this.state !== 'live') return;
    if (!remote && this.isDirector && !this.offline) { this.net.send({ t: 'end', r }); this.net.send({ t: 'phase', phase: 'lobby' }); }
    this.state = 'results'; this.leaveLive(); this.sfx.music(true, 0);
    this.ui.results(r);
  }
  finish(why, winner) {
    const s = this.show, crew = this.crewList();
    this.endEpisode({ peak: Math.round(s.peak), avg: Math.round(s.sum / Math.max(1, s.samples)), score: s.score, survivors: crew.filter(c => c.alive).length, crew: crew.length, done: [...s.done], history: s.history.filter((_, i) => i % 3 === 0), people: crew.map(c => ({ name: c.name, alive: c.alive })), why, winner, ghost: GHOST_TYPES[this.ghost.type].name, ghostPlayer: this.ghostInfo.id ? this.nameOf(this.ghostInfo.id) : null, cancelled: s.cancelled });
  }
  afterResults() { if (this.offline) { this.toLobby(); } else this.toLobby(); }

  // ---------------------------------------------------------- the loop
  loop() { requestAnimationFrame(() => this.loop()); this.tick(Math.min(0.05, this.clock.getDelta())); }
  async snap(name, frames = 3) { for (let i = 0; i < frames; i++) this.tick(1 / 30); const url = this.gfx.renderer.domElement.toDataURL('image/jpeg', 0.85); await fetch('http://127.0.0.1:9731/' + name, { method: 'POST', body: url }); return name; }

  tick(dt) {
    this.t += dt;
    const inp = this.input, p = this.player;
    if (this.state === 'menu' || this.state === 'joining' || this.state === 'boot') this.menuCam(dt);
    else {
      if (p.mode === 'dying') this.dying(dt);
      else if (!this.hud.typing) p.update(dt, inp);
      if (p.mode === 'room' || (this.place === 'room' && p.mode !== 'ghost')) this.roomPhysics(dt);
      this.controls(dt);
      for (const a of this.avatars.values()) a.update(dt);
      this.drawSelf(dt);
      if (this.state === 'live') this.live(dt);
      else if (this.state === 'lobby') this.lobbyTick(dt);
      this.sendState(dt);
      this.view(dt);
    }
    this.world.update(dt, this.t); this.lobby.update(dt, this.t); this.room.update(dt, this.t);
    this.updateFx(dt); this.gore.update(dt);
    this.voice.update(dt);
    this.hud.update(dt); this.ui.update(dt);
    this.gfx.follow(this.place === 'room' ? this.camRig.pos : p.pos);
    // the living room TV shows the broadcast (or the lot during the pre-show)
    if (this.place === 'room' && (this.frameN = (this.frameN || 0) + 1) % 2 === 0) {
      const L = this.lobby.tvCam, feed = this.state === 'live' ? this.camRig : { pos: L.pos, quat: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(L.pos, L.look, new THREE.Vector3(0, 1, 0))), fov: 62 };
      this.ghost.paint(this.ghost.visibilityFor(this.camRig.nv ? 'nv' : 'cam'));
      const op = this.avatars.get(this.camId), opVis = op?.body.group.visible; if (op) op.body.group.visible = false;   // don't film the inside of the operator's own camera
      this.room.renderTV(this.gfx.renderer, this.scene, feed);
      if (op) op.body.group.visible = opVis;
      this.ghost.paint(this.ghost.visibilityFor(this.viewer || 'eyes'));
    }
    this.gfx.render(dt);
    inp.endFrame();
  }

  // the title screen: we ARE the TV camera. The host does his intro to us
  // with a mic, the intern sweeps a flashlight behind him, Edith rises up
  // over the host's shoulder, the intern sees her first, she yells BOO,
  // everybody flails, she vanishes in a puff, and the host carries on.
  menuScene() {
    const c = this.world.spots.menu.clone(), y = this.world.floorAt(c.x, c.z, 1) + 0.02;
    const host = new Dude({ style: 'bobble', skin: 0xe8a878, shirt: PAL.red, pants: 0x2a2a4a, hair: true, hairColor: 0x3a2010 });
    const intern = new Dude({ style: 'lanky', skin: 0xffcfa8, shirt: PAL.yellow, pants: 0x1a1a2a, hat: 'beanie', hatColor: PAL.blue });
    host.group.position.set(c.x, y, c.z); host.group.rotation.y = 0.05;                 // facing the camera
    intern.group.position.set(c.x - 2.1, y, c.z - 2.4); intern.group.rotation.y = 0.6;
    const mic = new THREE.Group(); part(cyl(0.025, 0.03, 0.22, 8), PAL.ink, 0, 0.11, 0, mic, 0.01); part(sphere(0.055, 10, 8), 0x9a9aa8, 0, 0.25, 0, mic, 0.012);
    host.holdItem(mic);
    const torch = flashlight(); torch.scale.setScalar(0.9); intern.holdItem(torch);
    const beam = new THREE.SpotLight(0xfff4d0, 8, 12, 0.35, 0.5, 2); this.scene.add(beam, beam.target);
    for (const d of [host, intern]) this.scene.add(d.group);
    const ghost = ghostModel('edith'); ghost.group.scale.multiplyScalar(0.9); this.scene.add(ghost.group);
    const puff = new THREE.Mesh(sphere(0.9, 14, 10), new THREE.MeshBasicMaterial({ color: 0xe8fff6, transparent: true, opacity: 0, depthWrite: false })); this.scene.add(puff);
    this.menu = { host, intern, ghost, puff, beam, c, y, t: 0 };
  }

  menuCam(dt) {
    if (!this.menu) this.menuScene();
    const M = this.menu, cam = this.gfx.camera, c = M.c, t = this.t;
    // the TV camera: fixed tripod-ish shot of the host, slight handheld drift
    const wide = cam.aspect > 1.1;
    cam.position.set(c.x - (wide ? 1.9 : 0.15) + Math.sin(t * 0.3) * 0.05, M.y + 1.55 + Math.sin(t * 0.5) * 0.02, c.z + 4.6);
    cam.lookAt(c.x - (wide ? 1.35 : 0.1), M.y + 1.25, c.z - 0.6);
    if (cam.fov !== 40) { cam.fov = 40; cam.updateProjectionMatrix(); }
    this.gfx.setMode('eyes'); this.gfx.U.nv.value = 0; this.gfx.U.ghostView.value = 0;
    this.body.group.visible = false; this.player.torch.visible = false;
    const { host, intern, ghost, puff, beam } = M;
    M.t += dt; const k = M.t % 13;
    // defaults
    let hostTalk = (Math.sin(t * 8) > -0.2 ? 0.22 : 0.04), hostScared = 0, internScared = 0, gVis = 0, jump = 0;
    host.arms.find(a => a.s < 0).sh.rotation.z = 0;
    let headTurn = 0; const lookBack = (d, amt) => { headTurn = amt; };
    if (k < 4) {                                                       // the intro
      intern.group.rotation.y = 0.6 + Math.sin(t * 0.9) * 0.6;
    } else if (k < 6.6) {                                              // Edith rises behind the host
      const r = Math.min(1, (k - 4) / 1.8); gVis = r;
      ghost.group.position.set(c.x + 1.0, M.y - 1.6 + r * 1.75, c.z - 0.9); ghost.group.rotation.y = -0.25;
      if (k > 5.3) { internScared = 1; intern.group.rotation.y += ((Math.atan2(c.x + 0.75 - intern.group.position.x, c.z - 0.9 - intern.group.position.z)) - intern.group.rotation.y) * Math.min(1, dt * 8); }   // the intern sees her
      else intern.group.rotation.y = 0.6 + Math.sin(t * 0.9) * 0.6;
    } else if (k < 8.6) {                                              // BOO!
      if (!M.booed) { M.booed = true; if (this.sfx.ctx) { this.sfx.boo(null); setTimeout(() => this.sfx.scream(null), 120); } }
      gVis = 1; const b = k - 6.6;
      ghost.group.position.set(c.x + 1.05, M.y + 0.35 + Math.sin(t * 12) * 0.03, c.z - 0.35); ghost.group.rotation.y = -0.45; ghost.body.scale.setScalar(1 + Math.max(0, 0.4 - b) * 0.8);
      hostScared = 1; internScared = 1; jump = Math.max(0, Math.sin(b * 5)) * 0.4 * Math.max(0, 1 - b / 1.6);
      lookBack(host, 0.9);
    } else if (k < 9.4) {                                              // poof
      const f = (k - 8.6) / 0.8; gVis = 1 - f;
      puff.position.copy(ghost.group.position).setY(ghost.group.position.y + 1.2); puff.scale.setScalar(0.6 + f * 1.6); puff.material.opacity = (1 - f) * 0.7;
      hostScared = f < 0.5 ? 1 : 0; internScared = 1; ghost.body.scale.setScalar(1);
      if (!M.poofed) { M.poofed = true; if (this.sfx.ctx) this.sfx.pop(); }
    } else {                                                           // the host pulls himself together
      M.booed = false; M.poofed = false; puff.material.opacity = 0;
      internScared = k < 10.5 ? 1 : 0;
      hostTalk = k < 10.2 ? 0 : hostTalk;
      lookBack(host, k < 10.2 ? Math.sin((k - 9.4) * 9) * 0.6 : 0);
      if (k > 10.2 && k < 11) host.arms.find(a => a.s < 0).sh.rotation.z = -2.2;   // a little "everything's fine" wave
    }
    ghost.group.visible = gVis > 0.01; for (const m of ghost.mats) m.opacity = gVis * 0.9;
    ghost.body.position.y = Math.sin(t * 2.2) * 0.08;
    host.pose.talk = hostScared ? 0.4 : hostTalk; host.pose.scared = hostScared; intern.pose.scared = internScared;
    host.rig.position.y = jump;
    for (const d of [host, intern]) { d.pose.speed = 0; d.animate(dt); }
    host.head.rotation.y += headTurn;
    // the intern's flashlight beam
    const hand = intern.arms.find(a => a.s > 0).hand.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(Math.sin(intern.group.rotation.y), -0.15, Math.cos(intern.group.rotation.y));
    beam.position.copy(hand); beam.target.position.copy(hand).addScaledVector(dir, 6);
    this.sfx.setListener(cam.position, cam.quaternion);
  }
  hideMenuScene() { if (!this.menu) return; const M = this.menu; for (const o of [M.host.group, M.intern.group, M.ghost.group, M.puff, M.beam, M.beam.target]) this.scene.remove(o); this.menu = null; }

  // my own bean (third person), held items
  drawSelf(dt) {
    const p = this.player, b = this.body;
    const show = (p.mode === 'crew' && (!p.isCamera || p.cam.selfie)) || p.mode === 'room' || p.mode === 'float' || p.mode === 'dying';
    b.group.visible = show && !(this.place === 'room' && this.tvFull) && !b.exploded;
    b.group.position.copy(p.pos); b.group.rotation.set(p.mode === 'yeet' ? p.spin : 0, p.yaw + Math.PI, p.mode === 'yeet' ? p.spin * 0.6 : 0);
    b.setGhost(p.mode === 'float');
    Object.assign(b.pose, { speed: p.speed, pitch: -p.pitch, air: p.onGround ? 0 : 1, talk: this.voice.level, aim: p.mode === 'crew' && !p.isCamera, scared: p.scared > 0 ? 1 : 0, wave: 0 });
    p.scared = Math.max(0, (p.scared || 0) - dt);
    const want = p.mode === 'crew' ? (p.isCamera ? this.myItems.camera : this.myItems.vac) : p.mode === 'room' && this.held ? this.held.obj : null;
    if (b.hold !== want) { if (want && want.parent) want.parent.remove(want); b.holdItem(want); if (want) want.position.set(0, 0, 0); }
    this.myTank.visible = p.mode === 'crew' && !p.isCamera;
    const cm = this.myItems.camera.userData; if (cm.lamp) { cm.lamp.visible = !p.cam.selfie; cm.tally.visible = true; }
    b.animate(dt, p.vel);
  }

  // ----------------------------------------------------------- controls
  controls(dt) {
    const p = this.player, inp = this.input, S = this.sfx;
    if (inp.hit('Enter') && !this.hud.typing) { this.hud.openChat(); return; }
    this.prompt = '';
    if (p.mode === 'crew') {
      if (inp.hit('KeyF')) { if (p.isCamera) p.cam.light = !p.cam.light; else p.lightOn = !p.lightOn; S.click(2400); }
      if (p.isCamera) {
        if (inp.hit('KeyN')) { p.cam.nv = !p.cam.nv; S.click(1600); }
        if (inp.hit('KeyT')) { p.cam.selfie = !p.cam.selfie; S.pop(); }
        p.cam.zoom = Math.max(0, Math.min(1, p.cam.zoom - inp.wheel * 0.08 + (inp.mouse.has(2) ? dt * 0.8 : 0) - (inp.down('KeyZ') ? dt * 0.8 : 0)));
      }
      this.vacuumOn = (!p.isCamera || p.role === 'solo') && inp.mouse.has(0) && this.state === 'live';
      p.vacuum = this.vacuumOn;
      if (this.state === 'lobby') this.lobbyInteract();
    } else if (p.mode === 'ghost' && this.state === 'live') {
      const gh = this.ghost;
      if (inp.hit('Digit1')) this.ghostAct('boo');
      if (inp.hit('Digit2')) this.ghostAct('prank');
      if (inp.hit('Digit3')) this.ghostAct('manifest');
      if (inp.hit('Digit4') || inp.hit('KeyQ')) this.ghostAct('special');
      if (inp.hit('Mouse0')) this.tryGrab();
    } else if (p.mode === 'room' || p.mode === 'float') this.roomInteract();
  }

  lobbyInteract() {
    const p = this.player, st = this.lobby.near(p.pos), inp = this.input;
    if (!st) return;
    if (st.id === 'live') this.prompt = this.isDirector ? '<b>E</b> PRESS THE BIG RED BUTTON · GO LIVE' : 'ONLY THE DIRECTOR CAN GO LIVE';
    else if (st.id === 'wardrobe') this.prompt = `<b>E</b> CHANGE OUTFIT · ${LOOKS[(this.lookI + 1) % LOOKS.length].name.toUpperCase()}`;
    else this.prompt = `<b>E</b> ${st.label}`;
    if (!inp.hit('KeyE')) return;
    this.sfx.uiPress();
    if (st.id === 'camera') { this.sendLook({ role: 'camera' }); this.hud.toast('YOU ARE THE CAMERA', 1500, 'good'); }
    else if (st.id === 'host') { this.sendLook({ role: 'host' }); this.hud.toast('YOU ARE A HOST', 1500, 'good'); }
    else if (st.id === 'ghost') { const taken = this.net.crew().find(m => m.id !== this.net.id && m.look?.role === 'ghost'); if (taken) { this.hud.toast(`${taken.name} is already the ghost`, 2000); return; } this.sendLook({ role: 'ghost', gt: st.type }); this.sfx.wooo(null, 1); this.hud.toast(`YOU ARE ${GHOST_TYPES[st.type].name.toUpperCase()}`, 2000, 'good'); if (this.isDirector) this.net.send({ t: 'settings', settings: { ghostType: st.type } }); }
    else if (st.id === 'wardrobe') { this.setLook((this.lookI + 1) % LOOKS.length); this.sfx.pop(); }
    else if (st.id === 'live') { if (this.isDirector) { this.lobby.leverArm.position.y = 1.15; this.sfx.clank(st.pos); this.sfx.airhorn(); setTimeout(() => this.startShow(), 700); } }
  }

  roomPhysics(dt) {}

  roomInteract() {
    const p = this.player, R = this.room, inp = this.input, S = this.sfx;
    if (inp.hit('Tab')) { this.tvFull = !this.tvFull; S.click(1000); }
    if (this.tvFull) { this.prompt = 'WATCHING FULL SCREEN · TAB TO GET UP'; return; }
    const eye = p.eye, f = p.fwd;
    let best = null, bs = 0;
    const consider = (pos, reach, label, act) => { const d = pos.distanceTo(eye); if (d > reach) return; const dot = pos.clone().sub(eye).normalize().dot(f); const s = dot - d * 0.1; if (dot > 0.55 && s > bs) { bs = s; best = { label, act }; } };
    if (!this.held) R.items.forEach((it, i) => { if (!it.holder) consider(it.obj.position, 2.4, `<b>E</b> ${it.label}`, () => { this.held = it; it.holder = this.net.id; this.fx({ k: 'room', a: 'grab', i }); S.pop(); }); });
    consider(R.phonePos, 2.4, this.caller === this.net.id ? '<b>E</b> HANG UP' : this.caller ? `${this.nameOf(this.caller).toUpperCase()} IS ON THE PHONE` : this.state === 'live' ? '<b>E</b> CALL THE SHOW LIVE' : 'THE PHONE WORKS WHEN THE SHOW IS LIVE', () => {
      if (this.caller === this.net.id) this.fx({ k: 'room', a: 'hang', id: this.net.id });
      else if (!this.caller && this.state === 'live') { this.fx({ k: 'room', a: 'call', id: this.net.id }); if (!this.voice.mic) this.voice.enableMic(); }
    });
    for (const b of R.buttons) consider(b.pos(), 2.6, `<b>E</b> VOTE: ${AUDIENCE[b.key].label}`, () => {
      b.cap.position.z = 0.02; setTimeout(() => b.cap.position.z = 0.06, 150); S.uiPress();
      if (this.state !== 'live') { this.hud.toast('VOTES OPEN WHEN THE SHOW IS LIVE', 1500); return; }
      this.net.send({ t: 'vote', key: b.key }); if (this.offline) this.onVote({ key: b.key });
    });
    if (best) { this.prompt = best.label; if (inp.hit('KeyE')) best.act(); }
    else if (this.held) this.prompt = `<b>LMB</b> USE · <b>G</b> DROP`;
    // using what you hold
    if (this.held) {
      const k = this.held.kind, from = eye.clone().addScaledVector(f, 0.5).add(new THREE.Vector3(0, -0.25, 0));
      if (inp.hit('KeyG')) { const at = p.pos.clone().addScaledVector(f, 0.6).setY(ROOM.y + 0.5); this.fx({ k: 'room', a: 'drop', i: R.items.indexOf(this.held), p: at.toArray() }); this.held = null; return; }
      if (k === 'popcorn' && inp.hit('Mouse0')) { R.throwPopcorn(from, f); this.net.send({ t: 'ev', ev: { k: 'room', a: 'pop', p: from.toArray(), d: f.toArray() } }); S.pop(); }
      if (k === 'popcorn' && inp.hit('Mouse2')) { S.tone(null, { type: 'square', path: [[0, 180]], dur: 0.08, gain: 0.1, filter: 900 }); S.noiseHit(null, { f: 2500, dur: 0.08, gain: 0.2 }); }
      if (k === 'lighter') { this.held.obj.userData.flame.visible = inp.mouse.has(0); if (inp.hit('Mouse0')) { S.click(4000, 0.1); const i = this.flammableAt(from, f); if (i >= 0) this.fx({ k: 'room', a: 'ignite', i }); } }
      if (k === 'extinguisher' && inp.mouse.has(0)) { this.foamT = (this.foamT || 0) - dt; if (this.foamT <= 0) { this.foamT = 0.06; R.sprayFoam(from, f); this.net.send({ t: 'ev', ev: { k: 'room', a: 'foam', p: from.toArray(), d: f.toArray() } }); S.noiseHit(null, { f: 3000, q: 0.4, dur: 0.1, gain: 0.15 }); const i = this.flammableAt(from, f, true); if (i >= 0) this.fx({ k: 'room', a: 'douse', i }); } }
    }
  }
  flammableAt(from, f, burning) {
    let best = -1, bd = 4;
    this.room.flammable.forEach((o, i) => { if (burning ? o.burn <= 0 : o.burn > 0) return; const w = new THREE.Box3().setFromObject(o.obj).getCenter(new THREE.Vector3()); const d = w.distanceTo(from); if (d < bd && w.sub(from).normalize().dot(f) > 0.7) { bd = d; best = i; } });
    return best;
  }

  lobbyTick(dt) {
    const crew = this.net.crew(), { cam, gh } = this.rolesSummary();
    this.lobby.drawCodeT = (this.lobby.drawCodeT || 0) - dt;
    if (this.lobby.drawCodeT <= 0) { this.lobby.drawCodeT = 0.5; this.lobby.drawCode(this.net.code, crew.length, this.net.audience().length, gh ? `${gh.name} as ${GHOST_TYPES[gh.look.gt]?.name || 'a ghost'}` : 'AI', cam?.name); }
    this.lobby.leverArm.position.y += (1.25 - this.lobby.leverArm.position.y) * Math.min(1, dt * 4);
  }

  // ------------------------------------------------------------ live
  live(dt) {
    const gh = this.ghost, p = this.player, crew = this.crewList();
    this.updateCamRig(dt);
    // ghost: whoever owns it moves it
    if (this.ghostAuth) {
      if (gh.ctrl === 'ai') gh.think(dt, crew);
      this.vacuum(dt, crew);
      this.ghostT -= dt;
      if (this.ghostT <= 0 && !this.offline) { this.ghostT = 1 / 15; this.net.send({ t: 'g', ...gh.pack() }); }
    } else gh.follow(dt);
    // vacuum reports from me
    if (this.vacuumOn && p.mode === 'crew') {
      this.sfx.vacuum(true, this.ghostInBeam(p.eye, p.fwd) ? 1 : 0);
      this.vacSendT = (this.vacSendT || 0) - dt;
      if (this.vacSendT <= 0 && !this.ghostAuth) { this.vacSendT = 0.1; this.net.send({ t: 'vac', p: p.eye.toArray(), d: p.fwd.toArray() }); }
      if (this.ghostAuth) this.vacHits = (this.vacHits || []).concat([{ from: p.eye.clone(), dir: p.fwd.clone(), t: performance.now() }]);
    } else this.sfx.vacuum(false);
    this.viewer = p.mode === 'ghost' ? 'self' : (p.isCamera && p.cam.nv) ? 'nv' : p.mode === 'room' || p.mode === 'float' ? 'eyes' : 'eyes';
    gh.update(dt, crew, this.viewer);
    // director: ratings + the clock
    if (this.isDirector) this.direct(dt, crew);
    const line = this.show.botChat(dt); if (line) this.hud.chat(line);
    // music gets frantic when the ghost is manifested near the crew
    const near = crew.some(c => c.alive && c.pos.distanceTo(gh.pos) < 10);
    this.sfx.music(true, gh.manifest > 0 && near ? 1 : near ? 0.4 : 0.15);
  }

  ghostInBeam(from, dir) {
    const gh = this.ghost; if (gh.captured) return false;
    const vis = Math.max(gh.manifest > 0 ? 1 : 0, gh.noise, gh.revealed);
    const to = gh.pos.clone().setY(gh.pos.y + 1).sub(from), d = to.length();
    return vis > 0.3 && d < 8 && to.normalize().dot(dir) > 0.88;
  }
  vacuum(dt, crew) {
    const gh = this.ghost, now = performance.now();
    this.vacHits = (this.vacHits || []).filter(h => now - h.t < 150);
    let pulled = false;
    for (const h of this.vacHits) if (this.ghostInBeam(h.from, h.dir)) { pulled = true; gh.pos.lerp(h.from, dt * 0.35); }
    gh.vacuumed = pulled ? 0.3 : Math.max(0, gh.vacuumed - dt);
    if (pulled) { gh.ecto -= dt * 20; gh.noise = Math.max(gh.noise, 0.7); if (this.isDirector) this.show.bump('vacuum', gh.pos.clone().setY(gh.pos.y + 1), 3 * dt * 10); }
    if (gh.ecto <= 0 && !gh.captured) { gh.ecto = 0; this.fx({ k: 'captured' }); }
    this.vacHits = [];
  }

  updateCamRig(dt) {
    const c = this.camRig, p = this.player, camId = Object.keys(this.roles).find(id => this.roles[id] === 'camera' || this.roles[id] === 'solo');
    this.camId = Number(camId);
    if (Number(camId) === this.net.id && p.mode === 'crew') { c.pos.copy(p.cam.pos); c.quat.copy(p.cam.quat); c.fov = p.cam.fov; c.nv = p.cam.nv; c.light = p.cam.light; c.selfie = p.cam.selfie; }
    else { const a = this.avatars.get(Number(camId)); if (a && a.cam && a.mode === 'crew') { c.pos.lerp(V3(a.cam.p), Math.min(1, dt * 14)); c.quat.slerp(new THREE.Quaternion(...a.cam.q), Math.min(1, dt * 14)); c.fov = a.cam.f; c.nv = !!a.cam.nv; c.light = !!a.cam.l; }
      else if (a && a.mode !== 'crew') { /* camera op got yeeted: the camera lies in the grass */ c.dropped = true; } }
    this.tmpCam.position.copy(c.pos); this.tmpCam.quaternion.copy(c.quat); this.tmpCam.fov = c.fov; this.tmpCam.updateProjectionMatrix(); this.tmpCam.updateMatrixWorld(true);
    this.frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.tmpCam.projectionMatrix, this.tmpCam.matrixWorldInverse));
  }

  direct(dt, crew) {
    const s = this.show, gh = this.ghost;
    s.direct(dt, { cam: this.camRig, crew, ghost: gh, frustum: this.frustum, los: (a, b) => this.world.los(a.x, a.z, b.x, b.z, Math.min(a.y, b.y) + 0.5), audience: this.offline ? 0 : this.net.audience().length, caller: !!this.caller, ghostVisOnCam: gh.visibilityFor(this.camRig.nv ? 'nv' : 'cam') });
    this.worldT -= dt;
    if (this.worldT <= 0 && !this.offline) { this.worldT = 0.25; this.net.send({ t: 'w', s: s.pack() }); }
    if (this.caller) { this.callT = (this.callT || 0) + dt; if (this.callT > 6) s.complete('caller'); }
    const hunters = crew.filter(c => c.alive);
    if (gh.captured) { this.capT = (this.capT || 0) + dt; if (this.capT > 4) { this.capT = 0; return this.finish('The crew vacuumed the ghost live on air. The phones are ringing off the hook.', 'crew'); } }
    const dyingNow = this.player.mode === 'dying' || [...this.avatars.values()].some(a => a.mode === 'dying');
    if (!hunters.length && dyingNow) return;      // let the gore play out first
    if (!hunters.length) return this.finish(`${GHOST_TYPES[gh.type].name} yeeted the entire crew. Highest rated episode in network history.`, 'ghost');
    if (s.cancelled) return this.finish('Nobody was watching. The network swapped to a cooking show.', 'nobody');
    if (s.left <= 0) {
      const van = this.world.spots.van, home = hunters.every(c => c.pos.distanceTo(van) < 9);
      if (home) { s.complete('signoff'); return this.finish('The crew signed off from the van. The ghost is still out there. Probably waving.', 'crew'); }
      if (s.left < -120) return this.finish('The crew never made it back to the van. The intern ate all the snacks.', 'ghost');
    }
  }

  // ---------------------------------------------------------- the view
  view(dt) {
    const cam = this.gfx.camera, p = this.player, G = this.gfx, c = this.camRig;
    let mode = 'eyes', fov = 70, nv = false;
    this.shake = Math.max(0, (this.shake || 0) - dt * 1.5);
    if (p.mode === 'dying') {
      if (this.dieT < 0.95) { cam.position.copy(p.isCamera ? p.cam.pos : p.camPos); cam.quaternion.copy(p.isCamera ? p.cam.quat : p.camQuat); }
      else { const a = (this.dieT - 0.95) * 0.5, at = this.deathAt; cam.position.set(at.x + Math.sin(a) * 4.5, at.y + 2.6, at.z + Math.cos(a) * 4.5); cam.lookAt(at.x, at.y + 0.3, at.z); }
      fov = 70;
    }
    else if (this.place === 'room' && this.tvFull && this.state === 'live') { cam.position.copy(c.pos); cam.quaternion.copy(c.quat); fov = c.fov; mode = 'broadcast'; nv = c.nv; const op = this.avatars.get(this.camId); if (op) op.body.group.visible = false; }
    else if (p.mode === 'crew' && p.isCamera && this.state === 'live') { cam.position.copy(p.cam.pos); cam.quaternion.copy(p.cam.quat); fov = p.cam.fov; mode = 'broadcast'; nv = p.cam.nv; }
    else if (p.mode === 'room' || (p.mode === 'float' && this.place === 'room')) {
      cam.position.copy(p.eye).setY(p.pos.y + 1.45); cam.quaternion.copy(p.viewQuat); fov = 75;    // first person in the living room
      this.body.group.visible = false;
    }
    else { cam.position.copy(p.camPos); cam.quaternion.copy(p.camQuat); fov = p.mode === 'ghost' ? 75 : 70; }
    if (this.shake > 0) cam.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake * 0.2, (Math.random() - 0.5) * this.shake * 0.2, 0));
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    G.setMode(mode); G.U.nv.value = nv ? 1 : 0; G.U.fear.value = 0; G.U.dead.value = 0; G.U.signal.value = 1; G.U.glitch.value = this.shake * 0.4;
    // the ghost player sees the world tinted spooky green
    G.U.ghostView.value = p.mode === 'ghost' ? 1 : 0;
    this.ghost.paint(this.ghost.visibilityFor(mode === 'broadcast' && nv ? 'nv' : this.viewer || 'eyes'));
    this.sfx.setListener(cam.position, cam.quaternion);
    this.listenerPos = cam.position.clone();
  }

  sendState(dt) {
    if (this.offline) return;
    this.sendT -= dt; if (this.sendT > 0) return; this.sendT = 1 / 15;
    const p = this.player, c = p.cam, r = (v) => +v.toFixed(3);
    this.net.send({ t: 's', p: [r(p.pos.x), r(p.pos.y), r(p.pos.z)], y: r(p.yaw), pi: r(p.pitch), sp: r(p.speed), air: p.onGround ? 0 : 1, m: p.mode, r: p.role, l: p.lightOn ? 1 : 0, vc: this.vacuumOn ? 1 : 0, v: r(this.voice.level), i: this.lookI, h: this.held?.kind || null,
      cam: p.mode === 'crew' && p.isCamera ? { p: c.pos.toArray().map(r), q: c.quat.toArray().map(r), f: r(c.fov), nv: c.nv ? 1 : 0, l: c.light ? 1 : 0, sf: c.selfie ? 1 : 0 } : null });
  }

  updateFx(dt) {
    for (const s of this.slimes) { s.life -= dt; s.m.material.opacity = Math.min(0.7, s.life * 0.3); }
    this.slimes = this.slimes.filter(s => { if (s.life <= 0) { this.scene.remove(s.m); return false; } return true; });
    for (const pr of this.projectiles) {
      pr.v.y -= 14 * dt; pr.m.position.addScaledVector(pr.v, dt); pr.m.rotation.x += dt * 8; pr.life -= dt;
      const fl = this.world.floorAt(pr.m.position.x, pr.m.position.z, pr.m.position.y);
      const me = this.player;
      if (me.mode === 'crew' && pr.m.position.distanceTo(me.pos.clone().setY(me.pos.y + 0.8)) < 0.9 && !pr.hit) { pr.hit = true; me.vel.add(pr.v.clone().setY(0).multiplyScalar(0.4)); me.vel.y = 4; this.sfx.splat(null); this.shake = 0.5; me.scared = 0.8; }
      if (pr.m.position.y < fl) { pr.m.position.y = fl; if (pr.kind === 'chicken') { this.sfx.squeak(pr.m.position); pr.v.set(0, 0, 0); pr.life = Math.min(pr.life, 3); } else { this.sfx.splat(pr.m.position); pr.life = 0; } }
    }
    this.projectiles = this.projectiles.filter(pr => { if (pr.life <= 0) { this.scene.remove(pr.m); return false; } return true; });
    // disco: lamps cycle colours
    if (this.disco > 0) { this.disco -= dt; for (const L of this.world.props) if (L.kind === 'lamp') { const h = (this.t * 2 + L.pos.x * 0.1) % 1; L.bulb.material.color.setHSL(h, 1, 0.6); L.pool.material.color.setHSL(h, 1, 0.5); } if (this.disco <= 0) for (const L of this.world.props) if (L.kind === 'lamp') { L.bulb.material.color.set(0xffe08a).multiplyScalar(2); L.pool.material.color.set(0xffd27a); } }
    for (const L of this.world.props) if (L.kind === 'lamp' && L.flick > 0) { L.flick -= dt; const on = Math.random() < 0.5 || L.flick <= 0; L.bulb.visible = on; L.pool.visible = on; }
  }
}

function pumpkinBall() { const g = new THREE.Group(); part(sphere(0.3, 12, 10), PAL.orange, 0, 0, 0, g, 0.02).scale.y = 0.85; part(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 6), 0x4a7a2a, 0, 0.27, 0, g, 0.01); return g; }
function chickenModel() {
  const g = new THREE.Group();
  part(capsule(0.12, 0.25, 8), PAL.yellow, 0, 0, 0, g, 0.015).rotation.z = Math.PI / 2;
  part(sphere(0.1, 10, 8), PAL.yellow, 0.24, 0.1, 0, g, 0.015);
  part(cone(0.035, 0.09, 6), PAL.orange, 0.36, 0.1, 0, g, 0.01).rotation.z = -Math.PI / 2;
  for (let i = 0; i < 3; i++) part(sphere(0.03, 6, 4), PAL.red, 0.22 + i * 0.03, 0.2, 0, g, 0);
  return g;
}

const game = new Game();
game.boot().catch(e => { console.error(e); document.getElementById('ui').insertAdjacentHTML('beforeend', `<pre class="crash">${e.stack || e}</pre>`); });
