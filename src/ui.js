// Menus: the title screen (big chunky logo + sticker buttons), the small
// lobby overlay, settings, and the end-of-episode card.
import { LOOKS } from './dude.js';
import { MAPS } from './maps.js';
import { SEGMENTS } from './show.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function logo() {
  return `<div class="logo"><div class="l1">GHOST</div><div class="l2">HUNTERS<span class="tv">TV<i></i></span></div><div class="tag">live from Spooky Hollow</div></div>`;
}

export class UI {
  constructor(game) { this.g = game; this.root = $('#ui'); this.name = localStorage.getItem('ght_name') || ''; }
  clear() { this.root.querySelectorAll('.screen').forEach(e => e.remove()); }
  mount(html) { this.clear(); this.root.insertAdjacentHTML('beforeend', html); const el = this.root.lastElementChild; this.sounds(el); return el; }
  sounds(el) { el.querySelectorAll('button').forEach(b => { b.addEventListener('mouseenter', () => this.g.sfx.ctx && this.g.sfx.uiHover()); b.addEventListener('click', () => { this.g.sfx.start(); this.g.sfx.uiPress(); }); }); }
  prefill(code, kind) { this.pre = { code, kind }; const c = $('#m-code'); if (c) c.value = code; }

  title(msg) {
    const el = this.mount(`
    <div class="screen title live">
      <div class="menu-side">
        ${logo()}
        <nav class="mlist">
          <button data-a="host"><i></i>HOST A SHOW</button>
          <div class="row"><button data-a="join"><i></i>JOIN A SHOW</button><div class="codein" data-for="join"><input maxlength="4" placeholder="CODE"><button class="go">GO</button></div></div>
          <div class="row"><button data-a="watch"><i></i>WATCH A SHOW</button><div class="codein" data-for="watch"><input maxlength="4" placeholder="CODE"><button class="go">GO</button></div></div>
          <button data-a="solo"><i></i>PLAY SOLO</button>
          <button data-a="how"><i></i>HOW TO PLAY</button>
          <button data-a="set"><i></i>SETTINGS</button>
        </nav>
        <div class="msg ${msg ? 'on' : ''}">${esc(msg || '')}</div>
      </div>
      <label class="who">PLAYING AS<input id="m-name" maxlength="16" placeholder="your name" value="${esc(this.name)}"></label>
      <div class="onair"><div class="h"><i></i>SHOW SERVER</div><div id="m-shows" class="shows">checking…</div></div>
      <div class="ver">v0.2 · Ruff Dogs Studios · best with 3–6 friends</div>
    </div>`);
    const nameI = $('#m-name', el), save = () => { this.name = nameI.value.trim().slice(0, 16); localStorage.setItem('ght_name', this.name); };
    nameI.oninput = save;
    const need = () => { save(); if (!this.name) { nameI.focus(); nameI.parentElement.classList.remove('shake'); void nameI.offsetWidth; nameI.parentElement.classList.add('shake'); this.say('Type a name first.'); return false; } return true; };
    const openCode = (kind) => {
      el.querySelectorAll('.codein').forEach(c => c.classList.toggle('on', c.dataset.for === kind && !c.classList.contains('on')));
      const box = el.querySelector(`.codein[data-for="${kind}"]`); if (box.classList.contains('on')) setTimeout(() => box.querySelector('input').focus(), 50);
    };
    const go = (kind) => {
      const box = el.querySelector(`.codein[data-for="${kind}"]`), code = box.querySelector('input').value;
      if (code.length !== 4) { box.querySelector('input').focus(); this.say('Room codes are 4 letters.'); return; }
      if (kind === 'join') { if (need()) this.g.joinShow(code, 'crew'); }
      else { if (!this.name) this.name = 'Viewer' + Math.floor(Math.random() * 999); this.g.joinShow(code, 'audience'); }
    };
    el.querySelectorAll('.codein').forEach(box => {
      const inp = box.querySelector('input');
      inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z]/g, ''); };
      inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') go(box.dataset.for); if (e.key === 'Escape') box.classList.remove('on'); };
      box.querySelector('.go').onclick = () => go(box.dataset.for);
    });
    const act = {
      host: () => { if (need()) this.g.hostShow(); },
      join: () => openCode('join'), watch: () => openCode('watch'),
      solo: () => { if (need()) this.g.soloShow(); },
      set: () => this.settings(),
      how: () => this.howTo(),
    };
    el.querySelectorAll('.mlist [data-a]').forEach(b => b.onclick = () => act[b.dataset.a]());
    if (this.pre) { openCode(this.pre.kind); el.querySelector(`.codein[data-for="${this.pre.kind}"] input`).value = this.pre.code; this.pre = null; }
    this.g.listShows((list) => {
      const box = $('#m-shows', el); if (!box) return;
      if (list === null) { box.innerHTML = '<p>Can\'t reach the show server from this browser. Solo still works.</p>'; return; }
      if (!list.length) { box.innerHTML = '<p>Server is online. Host a show, or ask a friend for their 4-letter code and press JOIN.</p>'; return; }
      box.innerHTML = list.map(s => `<div class="showrow"><div><b>${esc(s.director)}'s show</b><span>${s.code} · ${s.phase === 'lobby' ? 'pre-show' : 'live'} · ${s.crew} crew · ${s.audience} watching</span></div>${s.phase === 'lobby' ? `<button class="mini" data-j="${s.code}">JOIN</button>` : ''}<button class="mini" data-w="${s.code}">WATCH</button></div>`).join('');
      box.querySelectorAll('[data-j]').forEach(b => b.onclick = () => { if (need()) this.g.joinShow(b.dataset.j, 'crew'); });
      box.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { if (!this.name) this.name = 'Viewer' + Math.floor(Math.random() * 999); this.g.joinShow(b.dataset.w, 'audience'); });
      this.sounds(box);
    });
  }
  say(t) { const m = $('.title .msg'); if (!m) return; m.textContent = t; m.classList.add('on'); clearTimeout(this.sayT); this.sayT = setTimeout(() => m.classList.remove('on'), 2500); }

  // a simple, friendly guide in tabs
  howTo(tab = 0) {
    const key = (k) => `<kbd>${k}</kbd>`;
    const pages = [
      { t: 'THE GAME', html: `
        <div class="big-idea">You and your friends are making a <b>ghost-hunting TV show</b>. Find the ghost, get it on camera, and suck it into your vacuum before it gets you!</div>
        <ol class="steps">
          <li><b>Click HOST A SHOW</b> on the menu. You'll get a 4-letter <b>room code</b>.</li>
          <li><b>Send the code</b> to your friends. They click JOIN A SHOW and type it in.</li>
          <li>Everyone walks around the studio. <b>Walk up to a sign and press ${key('E')}</b> to pick your job: Camera, Host, or a Ghost.</li>
          <li>The host of the room presses the <b>big red GO LIVE button</b>. Now you're on TV!</li>
        </ol>
        <div class="tipbox">Playing alone? Click <b>PLAY SOLO</b>. You hold the camera and the computer plays the ghost.</div>` },
      { t: 'THE JOBS', html: `
        <div class="jobs">
          <div class="job host"><h4>HOST</h4><p>Walk around and talk to the camera.</p><p>Shine your <b>flashlight</b> at a ghost to make it show up.</p><p><b>Hold left click</b> to vacuum a ghost you can see.</p></div>
          <div class="job cam"><h4>CAMERA</h4><p>What you see <b>is the TV show</b>.</p><p>Press ${key('N')} for night vision. Ghosts glow green in it!</p><p>Keep your friends and the ghost <b>on screen</b> to get more viewers.</p></div>
          <div class="job ghost"><h4>GHOST <span>(optional)</span></h4><p>Fly anywhere, even through walls.</p><p>${key('1')} BOO &nbsp;${key('2')} prank &nbsp;${key('3')} show yourself &nbsp;${key('4')} special move</p><p>While you're showing yourself, <b>click</b> a crew member to get them.</p></div>
          <div class="job home"><h4>WATCHING FROM HOME</h4><p>Watch the show on the TV in the living room.</p><p>Press the <b>buttons on the wall</b> to mess with the crew.</p><p>Pick up the <b>phone</b> to talk to them live.</p></div>
        </div>
        <div class="tipbox">If nobody picks a ghost, the computer is the ghost. If the ghost gets you, you end up in the living room. You can still watch and help!</div>` },
      { t: 'HOW TO WIN', html: `
        <div class="wins">
          <div><h4>THE CREW WINS</h4><p>if you <b>vacuum up the ghost</b>, or if everyone gets <b>back to the van</b> when time runs out.</p></div>
          <div><h4>THE GHOST WINS</h4><p>if it <b>gets every crew member</b>.</p></div>
          <div><h4>EVERYBODY LOSES</h4><p>if the <b>viewers number</b> gets too low. Boring shows get cancelled! Talk, scream, and film spooky stuff.</p></div>
        </div>
        <div class="tipbox">Look at the yellow sticky note in the corner. It tells you what to film next for extra points.</div>` },
      { t: 'CONTROLS', html: `
        <div class="keys">
          <div>${key('W')}${key('A')}${key('S')}${key('D')}<span>walk</span></div>
          <div>${key('MOUSE')}<span>look around (click the game first)</span></div>
          <div>${key('SHIFT')}<span>run</span></div>
          <div>${key('SPACE')}<span>jump (ghost: fly up)</span></div>
          <div>${key('E')}<span>use things, pick a job, open stuff</span></div>
          <div>${key('F')}<span>flashlight on/off</span></div>
          <div>${key('LEFT CLICK')}<span>vacuum (host) / grab (ghost)</span></div>
          <div>${key('N')}<span>night vision (camera)</span></div>
          <div>${key('T')}<span>flip the camera to film yourself</span></div>
          <div>${key('ENTER')}<span>type in chat</span></div>
          <div>${key('TAB')}<span>full-screen TV (living room)</span></div>
        </div>` },
    ];
    const el = this.mount(`
    <div class="screen modal live"><div class="paper how">
      <h2>HOW TO PLAY</h2>
      <div class="tabs">${pages.map((p, i) => `<button class="tab ${i === tab ? 'on' : ''}" data-t="${i}">${p.t}</button>`).join('')}</div>
      <div class="page">${pages[tab].html}</div>
      <div class="howfoot">
        <button class="sticker small s5" id="h-back">BACK</button>
        ${tab < pages.length - 1 ? `<button class="sticker small s1" id="h-next">NEXT</button>` : `<button class="sticker small s1" id="h-solo">TRY IT SOLO</button>`}
      </div>
    </div></div>`);
    el.querySelectorAll('[data-t]').forEach(b => b.onclick = () => this.howTo(Number(b.dataset.t)));
    $('#h-back', el).onclick = () => this.title();
    $('#h-next', el)?.addEventListener('click', () => this.howTo(tab + 1));
    $('#h-solo', el)?.addEventListener('click', () => { if (!this.name) this.name = 'Player'; localStorage.setItem('ght_name', this.name); this.g.soloShow(); });
  }

  settings() {
    const vol = Number(localStorage.getItem('ght_vol') ?? 0.9), mus = Number(localStorage.getItem('ght_music') ?? 0.5), sens = Number(localStorage.getItem('da_sens') || 1), ptt = localStorage.getItem('da_ptt') === '1';
    const el = this.mount(`
    <div class="screen modal live"><div class="paper">
      <h2>SETTINGS</h2>
      <label>VOLUME <input type="range" id="s-vol" min="0" max="1" step="0.05" value="${vol}"></label>
      <label>MUSIC <input type="range" id="s-mus" min="0" max="1" step="0.05" value="${mus}"></label>
      <label>MOUSE <input type="range" id="s-sens" min="0.3" max="2.5" step="0.05" value="${sens}"></label>
      <label class="check"><input type="checkbox" id="s-ptt" ${ptt ? 'checked' : ''}> PUSH-TO-TALK (hold V)</label>
      <div class="microw"><button class="sticker small s2" id="s-mic">TEST MIC</button><div class="meter"><i id="s-lvl"></i></div></div>
      <button class="sticker s1" id="s-back">BACK</button>
    </div></div>`);
    $('#s-vol', el).oninput = (e) => { localStorage.setItem('ght_vol', e.target.value); if (this.g.sfx.master) this.g.sfx.master.gain.value = Number(e.target.value); };
    $('#s-mus', el).oninput = (e) => { localStorage.setItem('ght_music', e.target.value); if (this.g.sfx.musicBus) this.g.sfx.musicBus.gain.value = Number(e.target.value); };
    $('#s-sens', el).oninput = (e) => { localStorage.setItem('da_sens', e.target.value); this.g.input.sens = Number(e.target.value); };
    $('#s-ptt', el).onchange = (e) => { localStorage.setItem('da_ptt', e.target.checked ? '1' : '0'); this.g.voice.ptt = e.target.checked; };
    $('#s-mic', el).onclick = async () => { this.g.sfx.start(); await this.g.voice.enableMic(); this.meter = $('#s-lvl', el); };
    $('#s-back', el).onclick = () => { this.meter = null; this.g.state === 'lobby' ? this.lobby() : this.title(); };
  }

  // small overlay while walking around the pre-show lot
  lobby() {
    const g = this.g;
    const el = this.mount(`<div class="screen lobbyui live">
      <button class="sticker small s5" id="l-leave">LEAVE</button>
      <button class="sticker small s2" id="l-invite">COPY INVITE</button>
      <button class="sticker small s3" id="l-watch">COPY WATCH LINK</button>
      <button class="sticker small s4" id="l-mic">${g.voice.mic ? 'MIC ON' : 'TURN ON MIC'}</button>
      ${g.isDirector ? `<div class="len">MAP ${Object.entries(MAPS).map(([id, M]) => `<button class="mini ${(g.net.roster.settings?.map || 'diner') === id ? 'on' : ''}" data-map="${id}" title="${M.blurb}">${M.name.toUpperCase()}</button>`).join('')}</div>` : `<div class="len">MAP: ${(MAPS[g.net.roster.settings?.map] || MAPS.diner).name.toUpperCase()}</div>`}
      ${g.isDirector ? `<div class="len">SHOW LENGTH ${[6, 10, 15].map(n => `<button class="mini ${(g.net.roster.settings?.minutes || 10) === n ? 'on' : ''}" data-min="${n}">${n} MIN</button>`).join('')}</div>` : ''}
    </div>`);
    const base = location.origin + location.pathname;
    const copy = (t, b) => navigator.clipboard?.writeText(t).then(() => { const o = b.textContent; b.textContent = 'COPIED!'; setTimeout(() => b.textContent = o, 1200); }).catch(() => prompt('Copy this:', t));
    $('#l-leave', el).onclick = () => g.offline ? (g.offline = false, location.reload()) : g.leaveShow();
    $('#l-invite', el).onclick = (e) => copy(`${base}?join=${g.net.code}`, e.target);
    $('#l-watch', el).onclick = (e) => copy(`${base}?watch=${g.net.code}`, e.target);
    $('#l-mic', el).onclick = async (e) => { const ok = await g.voice.enableMic(); e.target.textContent = ok ? 'MIC ON' : 'MIC BLOCKED'; };
    el.querySelectorAll('[data-min]').forEach(b => b.onclick = () => { g.net.send({ t: 'settings', settings: { minutes: Number(b.dataset.min) } }); if (g.offline) g.net.roster.settings.minutes = Number(b.dataset.min); el.querySelectorAll('[data-min]').forEach(x => x.classList.toggle('on', x === b)); });
    el.querySelectorAll('[data-map]').forEach(b => b.onclick = () => { const map = b.dataset.map; g.net.send({ t: 'settings', settings: { map } }); if (g.offline) g.net.roster.settings.map = map; g.sfx.click?.(); el.querySelectorAll('[data-map]').forEach(x => x.classList.toggle('on', x === b)); g.hud.toast(`Tonight's location: ${MAPS[map].name}. ${MAPS[map].blurb}`, 2600); });
    if (g.offline) { $('#l-invite', el).style.display = 'none'; $('#l-watch', el).style.display = 'none'; }
  }

  results(r) {
    const head = r.winner === 'crew' ? 'THE CREW WINS!' : r.winner === 'ghost' ? 'THE GHOST WINS!' : 'EVERYBODY LOSES';
    const grade = r.cancelled ? 'replaced by a cooking show' : r.score > 4000 ? 'renewed for 47 seasons' : r.score > 1800 ? 'moved to the 4am slot' : 'quietly cancelled';
    const el = this.mount(`
    <div class="screen results live"><div class="paper big">
      <div class="kick">GHOST HUNTERS TV · EPISODE REPORT</div>
      <h1 class="${r.winner}">${head}</h1>
      <div class="why">${esc(r.why || '')}</div>
      <div class="grade">the network says: <b>${grade}</b></div>
      <div class="stats"><div><b>${r.peak.toLocaleString()}</b>peak viewers</div><div><b>${r.score.toLocaleString()}</b>points</div><div><b>${r.survivors}/${r.crew}</b>crew not yeeted</div><div><b>${esc(r.ghost)}</b>${r.ghostPlayer ? 'played by ' + esc(r.ghostPlayer) : 'played by the AI'}</div></div>
      <canvas id="r-graph" width="900" height="140"></canvas>
      <div class="segs">${SEGMENTS.map(s => `<span class="${r.done.includes(s.id) ? 'ok' : ''}">${r.done.includes(s.id) ? '★' : '☆'} ${s.title}</span>`).join('')}</div>
      <button class="sticker s1" id="r-back">BACK TO THE LOT</button>
    </div></div>`);
    const c = $('#r-graph', el), x = c.getContext('2d'), h = r.history.length ? r.history : [0], max = Math.max(...h, 1);
    x.lineWidth = 6; x.strokeStyle = '#ff4a5a'; x.lineJoin = 'round'; x.beginPath();
    h.forEach((v, i) => { const px = 10 + i / Math.max(1, h.length - 1) * 880, py = 130 - v / max * 115; i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.stroke();
    $('#r-back', el).onclick = () => this.g.afterResults();
    if (r.winner === 'crew') this.g.sfx.cheer(); else if (r.winner === 'ghost') { this.g.sfx.laugh(1.2); this.g.sfx.wooo(null, 0.8); } else this.g.sfx.aww();
  }

  update() { if (this.meter) this.meter.style.width = Math.min(100, this.g.voice.level * 140) + '%'; }
}
