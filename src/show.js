// The broadcast: ratings that react to what's actually on camera, the
// run-of-show (segments), the simulated home audience chat, and audience
// votes from the living room.
export const SEGMENTS = [
  { id: 'intro', title: 'COLD OPEN', cue: 'Host: introduce the show on camera. Be dramatic. Point at stuff.', pts: 400 },
  { id: 'scare', title: 'GOT SPOOKED', cue: 'Get a crew member scared on camera.', pts: 500 },
  { id: 'prank', title: 'POLTERGEIST ACTIVITY', cue: 'Film something getting haunted (dancing bins, honks, flying pumpkins).', pts: 500 },
  { id: 'moneyshot', title: 'THE MONEY SHOT', cue: 'Get the ghost clearly on camera. Night vision helps. Torches reveal it.', pts: 1200 },
  { id: 'caller', title: 'CALLER ON THE LINE', cue: 'Take a call from a viewer live on air.', pts: 400 },
  { id: 'vacuum', title: 'GHOST BUSTED', cue: 'Vacuum the ghost until it pops. Light it up first.', pts: 2500 },
  { id: 'signoff', title: 'SIGN-OFF', cue: 'Everyone left standing: back to the van to sign off.', pts: 600 },
];

// what the living room can vote for
export const AUDIENCE = {
  honk: { label: 'CLOWN HONKS', cost: 1 },
  chicken: { label: 'CHICKEN RAIN', cost: 2 },
  disco: { label: 'DISCO MODE', cost: 1 },
  slime: { label: 'SLIME TIME', cost: 2 },
  energy: { label: 'GHOST ENERGY', cost: 3 },
  reveal: { label: 'REVEAL GHOST', cost: 3 },
  hunt: { label: 'RELEASE THE GHOST', cost: 5 },
};

const HANDLES = ['nightowl', 'grave_digger', 'skeptic_sam', 'boo_berry', 'mothman_fan', 'xX_spooky_Xx', 'tina_from_ohio', 'evpguy', 'ouija_queen', 'lurker', 'cryptid_kid', 'paranormal_pam', 'jumpscare_jim', 'not_a_ghost', 'hauntedhank', 'saltcircle', 'casper_irl', 'static_sally', 'emf_enjoyer', 'lights_out_lou', 'momo', 'gravy_ghost', 'bean_enjoyer', 'certified_spooker'];
const LINES = {
  idle: ['love this show', 'first time watching', 'my cat is hiding under the bed', 'the camera guy breathes like a vacuum', 'hi mom', 'is this sponsored by flashlights', 'this town is so cute and evil', 'check the mansion!!', 'i can hear the pizza place from here'],
  talk: ['lmao', 'the host is NOT ok', 'ask the ghost if it likes jazz', 'they are so doomed', 'stop talking and LISTEN', 'this is better than my wedding', 'bro is narrating his own funeral', 'say hi to chat!!'],
  scare: ['WHAT WAS THAT', 'did you hear that??', 'NOPE', 'i spilled my cereal', 'BEHIND YOU', 'clip it CLIP IT', 'ghosts arent real (said nervously)', 'the scream 😭'],
  ghost: ['OMG', 'I SAW IT', 'THERE THERE THERE', 'freeze frame!!!', 'its so cute??', 'rewind rewind', 'the ghost is literally me', 'its serving', 'IT HAS A FACE'],
  vacuum: ['SUCK IT UP', 'VACUUM VACUUM VACUUM', 'the noise lmao', 'GET IT', 'dyson sponsor incoming'],
  yeet: ['WHAT', 'HE EXPLODED', 'bro turned into soup', 'that was NOT in the script', 'clean up on aisle 5', 'RIP', 'F', 'ratings just doubled', 'see you on the couch', 'i need a minute', 'THE HEAD WENT SO FAR'],
  dark: ['night vision makes everyone look like a frog', 'what is that shape', 'green mode lets go'],
  bored: ['boring', 'nothing is happening', 'changing channel', 'show us something', 'zzz', 'is the camera pointed at a wall?', 'bring back the host', 'my microwave is more haunted'],
  audience: ['WE DID THAT', 'the living room is powerful', 'chat is in control now', 'democracy works'],
  caller: ['someone called in lmao', 'hi caller!!', 'put me on the phone next', 'the caller is unhinged'],
};

export class Show {
  constructor(game) { this.g = game; this.reset(); }
  reset(minutes = 10) {
    this.length = minutes * 60; this.time = 0; this.viewers = 0; this.trend = 0;
    this.peak = 0; this.sum = 0; this.samples = 0; this.boredFor = 0; this.lowFor = 0; this.score = 0;
    this.done = new Set(); this.events = []; this.lastEvent = -99; this.votes = {}; this.voteCool = {};
    this.chatT = 1; this.mood = 'idle'; this.cancelled = false; this.history = []; this.introTalk = 0; this.ghostOnCam = 0;
  }
  get left() { return Math.max(-999, this.length - this.time); }
  bump(kind, p, amount) { this.events.push({ kind, p: p ? p.clone() : null, t: this.time, amount }); this.lastEvent = this.time; }

  direct(dt, ctx) {
    const { cam, crew, ghost, frustum, los } = ctx;
    this.time += dt;
    let interest = 0, inShot = 0, talking = 0, scared = 0;
    for (const c of crew) {
      if (!c.alive) continue;
      const head = c.pos.clone().setY(c.pos.y + 1.1), d = head.distanceTo(cam.pos);
      const seen = (c.camera && c.selfie) || (!c.camera && d < 12 && frustum.containsPoint(head) && los(cam.pos, head));
      if (seen) { inShot++; if (c.voice > 0.08) talking++; }
    }
    for (const a of this.g.avatars?.values() || []) if (a.scared > 0 && a.mode === 'crew' && frustum.containsPoint(a.headPos())) scared++;
    if (this.g.player?.scared > 0 && this.g.player.mode === 'crew' && frustum.containsPoint(this.g.player.eye)) scared++;
    interest += inShot * 0.4 + talking * 1.0 + scared * 3;
    if (scared) this.complete('scare');
    // the ghost on camera
    const gp = ghost.pos.clone().setY(ghost.pos.y + 1.2);
    const ghostShot = ctx.ghostVisOnCam > 0.3 && gp.distanceTo(cam.pos) < 22 && frustum.containsPoint(gp) && los(cam.pos, gp);
    if (ghostShot) { interest += 10; this.ghostOnCam += dt; if (this.ghostOnCam > 1.2) this.complete('moneyshot'); }
    for (const e of this.events) {
      const age = this.time - e.t; if (age > 5) continue;
      const shot = e.p && frustum.containsPoint(e.p) && e.p.distanceTo(cam.pos) < 25 && los(cam.pos, e.p);
      interest += e.amount * (shot ? 2 : (!e.p || e.p.distanceTo(cam.pos) < 12) ? 0.8 : 0.2) * (1 - age / 5);
      if (shot && e.kind === 'prank') this.complete('prank');
    }
    this.events = this.events.filter(e => this.time - e.t < 6);
    if (ctx.caller) interest += 2;
    if (cam.nv) interest += 0.3;
    if (interest < 0.5) this.boredFor += dt; else this.boredFor = Math.max(0, this.boredFor - dt * 2);
    interest -= Math.min(3, Math.max(0, this.boredFor - 8) * 0.12);
    // viewers
    const base = 2200 + crew.length * 900 + ctx.audience * 2500;
    if (!this.viewers) this.viewers = base;
    const target = base * (0.6 + Math.max(-0.5, interest) * 0.35) + this.score * 1.4;
    this.trend += ((target - this.viewers) * 0.12 - this.trend) * Math.min(1, dt * 0.8);
    this.viewers = Math.max(150, this.viewers + this.trend * dt);
    this.peak = Math.max(this.peak, this.viewers); this.sum += this.viewers * dt; this.samples += dt;
    if (Math.floor(this.time) !== Math.floor(this.time - dt)) this.history.push(Math.round(this.viewers));
    if (this.viewers < base * 0.3 && this.time > 90) this.lowFor += dt; else this.lowFor = Math.max(0, this.lowFor - dt);
    if (this.lowFor > 35) this.cancelled = true;
    // cold open: a host talking on camera
    if (!this.done.has('intro') && talking) { this.introTalk += dt; if (this.introTalk > 5) this.complete('intro'); }
    this.mood = ghostShot ? 'ghost' : this.time - this.lastEvent < 3 && this.events.some(e => e.kind === 'yeet') ? 'yeet' : this.events.some(e => e.kind === 'vacuum') ? 'vacuum' : ctx.caller ? 'caller'
      : this.events.some(e => e.kind === 'audience') ? 'audience' : this.time - this.lastEvent < 4 ? 'scare' : this.boredFor > 12 ? 'bored' : talking ? 'talk' : cam.nv ? 'dark' : 'idle';
  }

  complete(id) {
    if (this.done.has(id)) return false;
    this.done.add(id);
    const s = SEGMENTS.find(x => x.id === id);
    this.score += s.pts; this.trend += 1000;
    this.g.fx({ k: 'segment', id });
    return true;
  }
  nextSegments() { return SEGMENTS.filter(s => !this.done.has(s.id) && s.id !== 'signoff' && s.id !== 'vacuum').concat(SEGMENTS.filter(s => s.id === 'vacuum' && !this.done.has(s.id))); }

  botChat(dt) {
    this.chatT -= dt * (0.4 + Math.min(4, this.viewers / 3000)) * (['ghost', 'yeet', 'vacuum'].includes(this.mood) ? 3 : 1);
    if (this.chatT > 0) return null;
    this.chatT = 0.7 + Math.random() * 2.2;
    const pool = LINES[this.mood] || LINES.idle, line = Math.random() < 0.8 ? pool[Math.floor(Math.random() * pool.length)] : LINES.idle[Math.floor(Math.random() * LINES.idle.length)];
    return { name: HANDLES[Math.floor(Math.random() * HANDLES.length)] + (Math.random() < 0.4 ? Math.floor(Math.random() * 99) : ''), text: line, bot: true };
  }

  vote(key, weight, n) {
    const ev = AUDIENCE[key]; if (!ev) return null;
    if ((this.voteCool[key] || 0) > this.time) return null;
    if (key === 'hunt' && this.time < 90) return null;
    this.votes[key] = (this.votes[key] || 0) + weight;
    if (this.votes[key] >= this.need(key, n)) { this.votes[key] = 0; this.voteCool[key] = this.time + (key === 'hunt' ? 90 : ev.cost >= 3 ? 40 : 15); return key; }
    return null;
  }
  need(key, n) { const c = AUDIENCE[key].cost; return Math.max(1, Math.ceil(n * (c >= 5 ? 0.6 : c >= 3 ? 0.45 : 0.3))); }

  pack() { return { v: Math.round(this.viewers), tr: Math.round(this.trend), t: +this.time.toFixed(1), L: this.length, sc: this.score, d: [...this.done], m: this.mood, pk: Math.round(this.peak), vo: this.votes, vc: this.voteCool, lo: +this.lowFor.toFixed(1) }; }
  unpack(m) { this.viewers = m.v; this.trend = m.tr; this.time = m.t; this.length = m.L; this.score = m.sc; this.done = new Set(m.d); this.mood = m.m; this.peak = m.pk; this.votes = m.vo || {}; this.voteCool = m.vc || {}; this.lowFor = m.lo; }
}
