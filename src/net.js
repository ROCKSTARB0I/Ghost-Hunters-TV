// Connection to the DEAD AIR show server: rooms, roster, relay.
export class Net {
  constructor() {
    this.ws = null; this.id = 0; this.code = ''; this.kind = 'crew'; this.roster = { members: [] };
    this.handlers = {}; this.queue = []; this.open = false;
  }

  // where the show server is: a fixed <meta>, the page's own server when it
  // came from one, or — when played from GitHub Pages — the address the
  // Server Control panel publishes to server.json in the game's repo
  async base() {
    const meta = document.querySelector('meta[name="ght-server"]')?.content || window.ghostHuntersDesktop?.server;
    if (meta) return meta.replace(/\/$/, '');
    const hosted = location.hostname.endsWith('github.io') || location.hostname === 'play.ghosthunters' || location.hostname.endsWith('.ruffdogs.game');   // GitHub Pages, the .exe or the Ruff Dogs Launcher
    if (!hosted) return location.origin;
    const tries = ['https://api.github.com/repos/ROCKSTARB0I/Ghost-Hunters-TV/contents/server.json?ref=main', 'https://raw.githubusercontent.com/ROCKSTARB0I/Ghost-Hunters-TV/main/server.json?t=' + Date.now()];
    for (const u of tries) {
      try {
        const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) continue;
        const j = await r.json(), data = j.content ? JSON.parse(atob(j.content.replace(/\n/g, ''))) : j;
        if (data.server) return data.server.replace(/\/$/, '');
      } catch {}
    }
    throw new Error('The show server is offline right now.');
  }
  async url() { return (await this.base()).replace(/^http/, 'ws') + '/ws'; }

  async connect() {
    if (this.ws && this.ws.readyState <= 1) return;
    const url = await this.url();
    return new Promise((res, rej) => {
      const ws = this.ws = new WebSocket(url);
      const t = setTimeout(() => rej(new Error('The show server is not answering.')), 6000);
      ws.onopen = () => { clearTimeout(t); this.open = true; for (const m of this.queue) ws.send(m); this.queue = []; res(); };
      ws.onerror = () => { clearTimeout(t); rej(new Error('Could not reach the show server.')); };
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
