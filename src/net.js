// Connection to the Ghost Hunters TV show server: rooms, roster, relay.
export class Net {
  constructor() {
    this.ws = null; this.id = 0; this.code = ''; this.kind = 'crew'; this.roster = { members: [] };
    this.handlers = {}; this.queue = []; this.open = false;
  }

  // Where the show server is, in order:
  //  1. a fixed address (<meta name="ght-server"> or the old .exe's config)
  //  2. the page's own server, when the page really came from a show server
  //     (checked by asking it, so the Ruff Dogs dev launcher's /play/ pages don't fool us)
  //  3. the address Server Control publishes to server.json in the game's repo
  //     (GitHub Pages, the .exe, the Ruff Dogs Launcher, anywhere else)
  // The tunnel address changes whenever the server restarts, so a failed
  // connect looks it up again once before giving up.
  async base(fresh = false) {
    const meta = document.querySelector('meta[name="ght-server"]')?.content || window.ghostHuntersDesktop?.server;
    if (meta) return meta.replace(/\/$/, '');
    if (!fresh && this.found) return this.found;
    if (/^https?:$/.test(location.protocol) && !this.notSelf && await this.isShowServer(location.origin)) return this.found = location.origin;
    this.notSelf = true;
    const api = 'https://api.github.com/repos/ROCKSTARB0I/Ghost-Hunters-TV/contents/server.json?ref=main';
    const raw = 'https://raw.githubusercontent.com/ROCKSTARB0I/Ghost-Hunters-TV/main/server.json?t=' + Date.now();
    let why = 'GitHub did not answer';
    for (const [u, h] of [[api, { Accept: 'application/vnd.github.raw+json' }], [raw, {}]]) {
      try {
        const r = await fetch(u, { cache: 'no-store', headers: h }); if (!r.ok) { why = `GitHub said ${r.status}`; continue; }
        let j = await r.json(); if (j.content) j = JSON.parse(atob(j.content.replace(/\n/g, '')));
        const srv = String(j.server || '').trim().replace(/\/$/, '');
        if (/^https?:\/\//.test(srv)) return this.found = srv;
        why = 'no server address is published';
      } catch (e) { why = 'no internet or GitHub is blocked'; }
    }
    throw new Error(`Can't find the show server (${why}). The host has to turn the server on in Server Control.`);
  }
  async isShowServer(origin) {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 1500);
      const r = await fetch(origin + '/api/shows', { cache: 'no-store', signal: ctl.signal }); clearTimeout(t);
      return r.ok && 'shows' in await r.json();
    } catch { return false; }
  }
  async url(fresh) { return (await this.base(fresh)).replace(/^http/, 'ws') + '/ws'; }

  async connect() {
    if (this.ws && this.ws.readyState <= 1) return;
    try { await this.open1(await this.url()); }
    catch (e) {
      if (this.ws) { this.ws.onclose = null; try { this.ws.close(); } catch {} }
      const before = this.found; this.found = null;
      const again = await this.url(true);
      if (again === (before || '').replace(/^http/, 'ws') + '/ws') throw new Error(`The show server isn't answering (${e.message}). It may be off or restarting; try again in a minute.`);
      await this.open1(again);
    }
  }
  open1(url) {
    return new Promise((res, rej) => {
      const ws = this.ws = new WebSocket(url);
      const t = setTimeout(() => { ws.onerror = null; try { ws.close(); } catch {} rej(new Error('timed out')); }, 8000);
      ws.onopen = () => { clearTimeout(t); this.open = true; for (const m of this.queue) ws.send(m); this.queue = []; res(); };
      ws.onerror = () => { clearTimeout(t); rej(new Error('connection refused')); };
      ws.onclose = () => { this.open = false; this.emit('closed', {}); };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'hello') this.id = m.id;
        if (m.t === 'joined') { this.id = m.id; this.code = m.code; this.kind = m.kind; }
        if (m.t === 'roster') { this.roster = m; const me = m.members.find(x => x.id === this.id); if (me) this.kind = me.kind; }
        this.emit(m.t, m);
      };
    });
  }

  on(t, f) { (this.handlers[t] ||= []).push(f); }
  emit(t, m) { for (const f of this.handlers[t] || []) f(m); for (const f of this.handlers['*'] || []) f(m); }
  send(obj) {
    const s = JSON.stringify(obj);
    if (this.open && this.ws.readyState === 1) this.ws.send(s); else this.queue.push(s);
  }
  get director() { return this.roster.director; }
  get isDirector() { return this.roster.director === this.id; }
  member(id) { return this.roster.members.find(m => m.id === id); }
  crew() { return this.roster.members.filter(m => m.kind === 'crew'); }
  audience() { return this.roster.members.filter(m => m.kind === 'audience'); }
}
