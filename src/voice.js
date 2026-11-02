// Voice: a WebRTC mesh signalled through the show server.
//  - crew hear crew in 3D from each avatar's head, muffled through walls
//  - the audience hears the crew through the broadcast camera's mic
//  - the audience (and the dead) can talk among themselves; the living crew never hear them
import * as THREE from 'three';

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const AUDIENCE_VOICE_CAP = 12;

export class Voice {
  constructor(game) {
    this.g = game; this.peers = new Map(); this.mic = null; this.micTrack = null; this.level = 0; this.ptt = localStorage.getItem('da_ptt') === '1';
    this.muted = false; this.state = 'off';
    game.net.on('from', (m) => { if (m.data && m.data.v) this.signal(m.from, m.data.v); });
    game.net.on('left', (m) => this.drop(m.id));
    game.net.on('roster', () => this.sync());
  }

  async enableMic() {
    if (this.mic) return true;
    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      this.micTrack = this.mic.getAudioTracks()[0];
      const ctx = this.g.audio.ctx;
      const src = ctx.createMediaStreamSource(this.mic);
      this.micAn = ctx.createAnalyser(); this.micAn.fftSize = 512; src.connect(this.micAn);
      this.buf = new Float32Array(this.micAn.fftSize);
      for (const p of this.peers.values()) p.sender?.replaceTrack(this.micTrack);
      this.state = 'on';
      return true;
    } catch (e) { this.state = 'denied'; return false; }
  }

  // mic loudness 0..1 (talking ~0.1-0.4, shouting/screaming > 0.7)
  update(dt) {
    let lvl = 0;
    if (this.micAn && !this.muted) {
      this.micAn.getFloatTimeDomainData(this.buf);
      let s = 0; for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
      lvl = Math.min(1, Math.sqrt(s / this.buf.length) * 6);
    }
    const open = !this.ptt || this.g.input.down('KeyV');
    if (this.micTrack) this.micTrack.enabled = open && !this.muted;
    if (!open) lvl = 0;
    this.level += (lvl - this.level) * Math.min(1, dt * (lvl > this.level ? 20 : 5));
    // place remote voices
    for (const p of this.peers.values()) this.place(p, dt);
  }

  // who should I have a call with?
  wanted() {
    const net = this.g.net, me = net.member(net.id); if (!me) return [];
    const aud = net.audience();
    return net.roster.members.filter(m => m.id !== net.id && (me.kind === 'crew' || m.kind === 'crew' || aud.length <= AUDIENCE_VOICE_CAP));
  }
  sync() {
    if (!this.g.audio.ctx) return;
    const want = new Set(this.wanted().map(m => m.id));
    for (const id of want) if (!this.peers.has(id) && this.g.net.id < id) this.call(id);   // lower id calls
    for (const id of [...this.peers.keys()]) if (!want.has(id)) this.drop(id);
  }

  makePeer(id) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const p = { id, pc, polite: this.g.net.id > id, making: false, ignore: false, level: 0 };
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    p.sender = tr.sender;
    if (this.micTrack) tr.sender.replaceTrack(this.micTrack);
    pc.onicecandidate = (e) => { if (e.candidate) this.g.net.send({ t: 'to', to: id, data: { v: { ice: e.candidate } } }); };
    pc.onnegotiationneeded = async () => {
      try { p.making = true; await pc.setLocalDescription(); this.g.net.send({ t: 'to', to: id, data: { v: { sdp: pc.localDescription } } }); }
      catch (e) { console.warn(e); } finally { p.making = false; }
    };
    pc.ontrack = (e) => this.attach(p, e.streams[0] || new MediaStream([e.track]));
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') pc.restartIce?.(); };
    this.peers.set(id, p);
    return p;
  }
  call(id) { if (!this.peers.has(id)) this.makePeer(id); }

  async signal(from, v) {
    let p = this.peers.get(from) || this.makePeer(from);
    const pc = p.pc;
    try {
      if (v.sdp) {
        const collision = v.sdp.type === 'offer' && (p.making || pc.signalingState !== 'stable');
        p.ignore = !p.polite && collision;
        if (p.ignore) return;
        await pc.setRemoteDescription(v.sdp);
        if (v.sdp.type === 'offer') { await pc.setLocalDescription(); this.g.net.send({ t: 'to', to: from, data: { v: { sdp: pc.localDescription } } }); }
      } else if (v.ice) {
        try { await pc.addIceCandidate(v.ice); } catch (e) { if (!p.ignore) throw e; }
      }
    } catch (e) { console.warn('voice', e); }
  }

  attach(p, stream) {
    const ctx = this.g.audio.ctx;
    // Chrome only feeds WebAudio from a remote stream that is also attached to a media element
    const el = new Audio(); el.srcObject = stream; el.muted = true; el.play().catch(() => {}); p.el = el;
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser(); an.fftSize = 256; src.connect(an);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000;
    const gain = ctx.createGain(); gain.gain.value = 0;
    const pan = ctx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 1.2; pan.rolloffFactor = 1.1; pan.maxDistance = 40;
    src.connect(lp); lp.connect(gain); gain.connect(pan); pan.connect(this.g.audio.voiceBus);
    const flat = ctx.createGain(); flat.gain.value = 0; lp.connect(flat); flat.connect(this.g.audio.voiceBus);
    Object.assign(p, { src, an, lp, gain, pan, flat, buf: new Uint8Array(an.fftSize) });
  }

  drop(id) {
    const p = this.peers.get(id); if (!p) return;
    try { p.pc.close(); } catch {}
    try { p.src?.disconnect(); p.pan?.disconnect(); p.flat?.disconnect(); } catch {}
    this.peers.delete(id);
  }

  // route one remote voice depending on where they are and where I am:
  //  pre-show: everyone hears everyone (green room)
  //  live, I'm in town (crew/ghost): town voices in 3D; the living room only
  //    through the phone — the caller clear, the rest of the room faint
  //  live, I'm in the living room: room voices in 3D; town voices come out of the TV
  place(p, dt) {
    if (!p.an) return;
    p.an.getByteTimeDomainData(p.buf);
    let s = 0; for (let i = 0; i < p.buf.length; i++) { const v = (p.buf[i] - 128) / 128; s += v * v; }
    p.level = Math.sqrt(s / p.buf.length) * 6;
    const g = this.g, av = g.avatars.get(p.id), t = g.audio.ctx.currentTime;
    const inRoom = (m) => m === 'room' || m === 'float' || m === 'yeet';
    const theirMode = av ? av.mode : (g.net.member(p.id)?.kind === 'audience' ? 'room' : 'crew');
    const meRoom = inRoom(g.player.mode) || g.place === 'room';
    let spatial = 0, flat = 0, filt = 'lowpass', freq = 20000, pos = null;
    if (g.state !== 'live') flat = 1;
    else if (!meRoom) {
      if (!inRoom(theirMode)) { spatial = 1; pos = theirMode === 'ghost' ? g.ghost.pos.clone().setY(g.ghost.pos.y + 1.4) : av?.headPos(); }
      else if (g.caller) { flat = g.caller === p.id ? 1.1 : 0.16; filt = 'bandpass'; freq = 1700; }     // the phone line
    } else {
      if (inRoom(theirMode)) { spatial = 1; pos = av?.headPos(); }
      else { flat = 0.75; freq = 5000; }                                                                // through the TV speaker
    }
    if (spatial && pos) {
      p.pan.positionX.setTargetAtTime(pos.x, t, 0.03); p.pan.positionY.setTargetAtTime(pos.y, t, 0.03); p.pan.positionZ.setTargetAtTime(pos.z, t, 0.03);
      const L = g.listenerPos;
      if (L && !meRoom && !g.world.los(L.x, L.z, pos.x, pos.z, Math.min(L.y, pos.y) + 0.3)) freq = 1100;
    }
    if (p.lp.type !== filt) { p.lp.type = filt; p.lp.Q.value = filt === 'bandpass' ? 0.9 : 0.7; }
    p.gain.gain.setTargetAtTime(spatial * 1.6, t, 0.08);
    p.flat.gain.setTargetAtTime(flat * 0.9, t, 0.08);
    p.lp.frequency.setTargetAtTime(freq, t, 0.1);
  }

  speaking(id) { const p = this.peers.get(id); return p ? p.level : 0; }
}
