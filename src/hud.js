// On-screen overlays for each way of playing: the pre-show lot, hosts,
// the camcorder viewfinder, the ghost's powers, and the living room.
import { SEGMENTS, AUDIENCE } from './show.js';
import { GHOST_TYPES, COSTS } from './ghosts.js';

const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class Hud {
  constructor(game) {
    this.g = game; this.root = document.getElementById('ui');
    this.root.insertAdjacentHTML('beforeend', `<div id="toasts"></div><div id="banner"></div><div id="fade"></div>`);
    this.toasts = this.root.querySelector('#toasts'); this.mode = null; this.lines = []; this.typing = false;
  }
  toast(text, ms = 2200, cls = '') {
    const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = text;
    this.toasts.appendChild(d); setTimeout(() => d.classList.add('out'), ms); setTimeout(() => d.remove(), ms + 500);
  }
  banner(title, sub, ms = 4500) {
    const b = this.root.querySelector('#banner'); b.innerHTML = `<b>${esc(title)}</b><span>${esc(sub || '')}</span>`;
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on'); clearTimeout(this.bT); this.bT = setTimeout(() => b.classList.remove('on'), ms);
  }
  fade(on, ms = 600) { const f = this.root.querySelector('#fade'); f.style.transition = `opacity ${ms}ms`; f.style.opacity = on ? 1 : 0; }

  setMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode; this.root.querySelector('#hud')?.remove(); this.cache = {};
    if (!mode) return;
    const chat = `<div class="chat"><div class="log" id="h-log"></div><input id="h-say" maxlength="140" placeholder="say something… (Enter)"></div>`;
    const top = `<div class="topbar"><div class="pill live"><i></i>LIVE</div><div class="pill" id="h-time">0:00</div><div class="pill" id="h-view">0 watching</div></div>`;
    const html = {
      lobby: `<div id="hud" class="hud lobbyhud"><div class="codechip">ROOM <b id="h-code"></b></div><div class="rolechip" id="h-role"></div>
        <div class="roster" id="h-roster"></div><div class="prompt" id="h-prompt"></div>
        <div class="tip">Walk to a station and press <b>E</b>. Pick CAMERA, HOST, or a GHOST. Nobody picks a ghost? The AI haunts you.</div>${chat}</div>`,
      host: `<div id="hud" class="hud">${top}<div class="cue" id="h-cue"></div><div class="prompt" id="h-prompt"></div>
        <div class="tools"><span><b>LMB</b> VACUUM</span><span><b>F</b> TORCH</span><span><b>SPACE</b> JUMP</span></div>
        <div class="boometer"><span>BOO-METER</span><i><i id="h-boo"></i></i></div><div class="stam"><i id="h-stam"></i></div>${chat}</div>`,
      camera: `<div id="hud" class="hud">${top}
        <div class="vf"><i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i><div class="rec"><i></i>REC</div><div class="mode" id="h-cmode"></div><div class="plus">+</div>
          <div class="zoom"><span>W</span><i><i id="h-zoom"></i></i><span>T</span></div></div>
        <div class="cue small" id="h-cue"></div><div class="tools"><span><b>N</b> NIGHT VISION</span><span><b>F</b> LIGHT</span><span><b>RMB/Z</b> ZOOM</span><span><b>T</b> SELFIE</span></div><div class="stam"><i id="h-stam"></i></div>${chat}</div>`,
      ghost: `<div id="hud" class="hud ghosthud">${top}<div class="gname" id="h-gname"></div>
        <div class="ecto"><span>ECTOPLASM</span><i><i id="h-ecto"></i></i></div>
        <div class="powers" id="h-powers"></div><div class="tip small">WASD fly · SPACE/C up/down · SHIFT zoom · you go through walls. Crew can only see you when you manifest, get caught in torchlight, or show up in night vision.</div>${chat}</div>`,
      room: `<div id="hud" class="hud roomhud"><div class="topbar"><div class="pill live"><i></i>LIVE ON TV</div><div class="pill" id="h-time">0:00</div><div class="pill" id="h-view">0 watching</div><div class="pill" id="h-call"></div></div>
        <div class="prompt" id="h-prompt"></div><div class="tip small" id="h-roomtip">You're watching from home. <b>TAB</b> full-screen TV · <b>E</b> grab stuff / vote / phone · <b>LMB</b> use · <b>G</b> drop. The crew can't hear you unless you call.</div>${chat}</div>`,
    }[mode];
    this.root.insertAdjacentHTML('beforeend', html);
    const say = this.root.querySelector('#h-say');
    say.onfocus = () => { this.typing = true; this.g.input.release(); };
    say.onblur = () => { this.typing = false; };
    say.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = say.value.trim(); if (v) { this.g.net.send({ t: 'chat', text: v }); if (this.g.offline) this.chat({ name: this.g.ui.name, text: v, kind: 'crew' }); } say.value = ''; say.blur(); }
      if (e.key === 'Escape') say.blur();
    };
    if (mode === 'ghost') {
      const T = GHOST_TYPES[this.g.ghost.type];
      this.root.querySelector('#h-gname').textContent = T.name.toUpperCase();
      this.root.querySelector('#h-powers').innerHTML = [['1', 'BOO!', COSTS.boo], ['2', 'PRANK', COSTS.prank], ['3', 'MANIFEST', COSTS.manifest], ['4', T.special, T.cost], ['LMB', 'GRAB + YEET', 0]]
        .map(([k, n, c]) => `<div class="power" data-cost="${c}"><b>${k}</b><span>${n}</span>${c ? `<em>${c}</em>` : '<em>MANIFESTED</em>'}</div>`).join('');
    }
    this.renderChat(); this.roster();
  }
  openChat() { const i = this.root.querySelector('#h-say'); if (i) setTimeout(() => i.focus(), 0); }

  chat(m) { this.lines.push(m); if (this.lines.length > 60) this.lines.shift(); this.renderChat(); }
  renderChat() {
    const log = this.root.querySelector('#h-log'); if (!log) return;
    const room = this.mode === 'room', list = this.lines.filter(m => room || !m.bot).slice(room ? -14 : -5);
    log.innerHTML = list.map(m => `<div class="${m.bot ? 'bot' : m.kind || ''}"><b>${esc(m.name)}</b> ${esc(m.text)}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  }
  roster() {
    const box = this.root.querySelector('#h-roster'); if (!box) return;
    const g = this.g, net = g.net;
    box.innerHTML = net.roster.members.map(m => {
      const r = m.kind === 'audience' ? 'WATCHING' : m.look?.role === 'ghost' ? `GHOST · ${GHOST_TYPES[m.look.gt]?.name || ''}` : m.look?.role === 'camera' ? 'CAMERA' : 'HOST';
      return `<div class="${m.id === net.id ? 'me' : ''}"><i class="mic" data-mic="${m.id}"></i><b>${esc(m.name)}</b>${m.id === net.director ? '<em>DIRECTOR</em>' : ''}<span class="r ${m.look?.role || (m.kind === 'audience' ? 'aud' : 'host')}">${r}</span></div>`;
    }).join('');
  }

  update(dt) {
    const g = this.g, s = g.show, m = this.mode; if (!m) return;
    const $ = (id) => this.root.querySelector(id), set = (id, v, prop = 'textContent') => { const e = $(id); if (e && this.cache[id] !== v) { e[prop] = v; this.cache[id] = v; } };
    set('#h-time', fmt(s.left > 0 ? s.left : 0) + (s.left <= 0 && g.state === 'live' ? ' · GET TO THE VAN' : ''));
    set('#h-view', `${Math.round(s.viewers).toLocaleString()} watching ${s.trend > 50 ? '▲' : s.trend < -50 ? '▼' : ''}`);
    set('#h-prompt', g.prompt || '', 'innerHTML');
    if (m === 'lobby') {
      set('#h-code', g.net.code);
      const r = g.myRole?.role || 'host';
      set('#h-role', `YOU: ${r === 'ghost' ? GHOST_TYPES[g.myRole.gt]?.name.toUpperCase() : r.toUpperCase()}`);
      for (const i of this.root.querySelectorAll('[data-mic]')) { const id = Number(i.dataset.mic), lv = id === g.net.id ? g.voice.level : g.voice.speaking(id); i.classList.toggle('on', lv > 0.08); }
    }
    if (m === 'host' || m === 'camera') {
      const next = s.left <= 0 ? [SEGMENTS.find(x => x.id === 'signoff')] : s.nextSegments().slice(0, 2);
      const warn = s.lowFor > 5 ? '<div class="warn">RATINGS TANKING — DO SOMETHING</div>' : '';
      set('#h-cue', `<div class="ch">PRODUCER SAYS</div>${warn}` + next.map(x => `<div class="seg"><b>${x.title}</b>${x.cue}</div>`).join(''), 'innerHTML');
      const st = $('#h-stam'); if (st) { st.style.width = (g.player.stamina * 100) + '%'; st.parentElement.style.opacity = g.player.stamina < 0.98 ? 1 : 0; }
    }
    if (m === 'host') {
      const d = g.ghost.pos.distanceTo(g.player.pos), lvl = Math.max(0, 1 - d / 30) + (g.ghost.noise > 0.3 ? 0.2 : 0);
      const b = $('#h-boo'); if (b) b.style.width = Math.min(100, lvl * 100) + '%';
      this.booT = (this.booT || 0) - dt; if (lvl > 0.35 && this.booT <= 0) { this.booT = 1.2 - lvl; g.sfx.tone(null, { type: 'sine', path: [[0, 900 + lvl * 900]], dur: 0.05, gain: 0.05 }); }
    }
    if (m === 'camera') {
      const c = g.player.cam; set('#h-cmode', c.selfie ? 'SELFIE' : c.nv ? 'NIGHTSHOT' : c.light ? 'LIGHT' : 'AUTO');
      const z = $('#h-zoom'); if (z) z.style.width = (c.zoom * 100) + '%';
    }
    if (m === 'ghost') {
      const gh = g.ghost, e = $('#h-ecto'); if (e) e.style.width = gh.ecto + '%';
      for (const p of this.root.querySelectorAll('.power')) { const c = Number(p.dataset.cost); p.classList.toggle('off', c ? gh.ecto < c : gh.manifest <= 0); }
      this.root.querySelector('.ecto')?.classList.toggle('drain', gh.vacuumed > 0);
    }
    if (m === 'room') set('#h-call', g.caller ? `${g.nameOf(g.caller)} IS ON THE PHONE` : 'PHONE LINE OPEN');
  }
}
