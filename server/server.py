#!/usr/bin/env python3
"""DEAD AIR show server.

Serves the game files and runs the live rooms over one WebSocket (/ws):
crews (players), the audience (spectators), voice-call signalling, chat and
scare votes. The crew member who opened the room is the "director": their
game runs the house and the ghost, everyone else follows what they send.

    python3 dead-air/server/server.py 9730
"""
import base64, hashlib, json, os, random, socket, struct, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9730
MAX_CREW, MAX_AUDIENCE = 8, 96
WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXZ'

lock = threading.RLock()
rooms = {}          # code -> Room
next_id = [1]


class Member:
    def __init__(self, sock):
        self.sock, self.id = sock, next_id[0]
        next_id[0] += 1
        self.name, self.kind, self.room = 'Guest', 'audience', None
        self.look = {}
        self.send_lock = threading.Lock()
        self.alive = True

    def send(self, obj):
        data = json.dumps(obj, separators=(',', ':')).encode()
        n = len(data)
        head = bytes([0x81, n]) if n < 126 else (
            bytes([0x81, 126]) + struct.pack('>H', n) if n < 65536 else bytes([0x81, 127]) + struct.pack('>Q', n))
        try:
            with self.send_lock:
                self.sock.sendall(head + data)
        except OSError:
            self.alive = False

    def card(self):
        return {'id': self.id, 'name': self.name, 'kind': self.kind, 'look': self.look}


class Room:
    def __init__(self, code):
        self.code, self.members, self.director = code, {}, None
        self.phase, self.settings = 'lobby', {'minutes': 12, 'location': 'harrow', 'map': 'diner'}
        self.created = time.time()

    def crew(self): return [m for m in self.members.values() if m.kind == 'crew']

    def audience(self): return [m for m in self.members.values() if m.kind == 'audience']

    def roster(self):
        return {'t': 'roster', 'director': self.director, 'phase': self.phase, 'settings': self.settings,
                'members': [m.card() for m in self.members.values()]}

    def send_all(self, obj, skip=None):
        for m in list(self.members.values()):
            if m is not skip: m.send(obj)


def new_code():
    while True:
        code = ''.join(random.choice(CODE_CHARS) for _ in range(4))
        if code not in rooms: return code


def clean(s, n=24):
    s = ''.join(ch for ch in str(s) if ch.isprintable()).strip()
    return s[:n] or 'Guest'


def leave(m):
    r = m.room
    if not r: return
    m.room = None
    r.members.pop(m.id, None)
    if not r.members:
        rooms.pop(r.code, None)
        return
    r.send_all({'t': 'left', 'id': m.id})
    if r.director == m.id:
        crew = r.crew()
        # the director's game was running the episode; with them gone it ends
        r.director = crew[0].id if crew else None
        if r.phase != 'lobby':
            r.phase = 'lobby'
            r.send_all({'t': 'aborted', 'why': 'The director lost connection. Back to the van.'})
    r.send_all(r.roster())


def enter(m, r, kind):
    if kind == 'crew' and (len(r.crew()) >= MAX_CREW or r.phase != 'lobby'):
        kind = 'audience'     # full or already on air: watch instead
    if kind == 'audience' and len(r.audience()) >= MAX_AUDIENCE:
        m.send({'t': 'error', 'why': 'The studio audience is full.'}); return
    m.kind, m.room = kind, r
    r.members[m.id] = m
    if kind == 'crew' and r.director is None: r.director = m.id
    m.send({'t': 'joined', 'id': m.id, 'code': r.code, 'kind': kind})
    r.send_all(r.roster())
    if r.phase != 'lobby' and r.director in r.members:
        r.members[r.director].send({'t': 'need-sync', 'id': m.id})


def handle(m, msg):
    t = msg.get('t')
    with lock:
        r = m.room
        if t == 'create':
            leave(m)
            m.name, m.look = clean(msg.get('name')), msg.get('look') or {}
            r = Room(new_code()); rooms[r.code] = r
            enter(m, r, 'crew')
        elif t == 'join':
            code = str(msg.get('code', '')).upper().strip()
            if code not in rooms:
                m.send({'t': 'error', 'why': 'No show is broadcasting on channel ' + code + '.'}); return
            leave(m)
            m.name, m.look = clean(msg.get('name')), msg.get('look') or {}
            enter(m, rooms[code], 'crew' if msg.get('as') == 'crew' else 'audience')
        elif t == 'shows':
            # shows are private: you can only get in with the 4-letter code a friend gives you.
            # Only report how busy the server is.
            m.send({'t': 'shows', 'list': [], 'count': len(rooms)})
        elif not r:
            return
        elif t == 'leave':
            leave(m)
        elif t == 'look':            # appearance + chosen role (camera/host/ghost) + ghost type
            m.look = msg.get('look') or {}
            r.send_all(r.roster())
        elif t == 'swap':            # crew <-> audience while in the lobby
            want = 'crew' if msg.get('as') == 'crew' else 'audience'
            if r.phase == 'lobby' and want != m.kind and not (want == 'crew' and len(r.crew()) >= MAX_CREW):
                m.kind = want
                if want == 'audience' and r.director == m.id:
                    crew = r.crew(); r.director = crew[0].id if crew else None
                if want == 'crew' and r.director is None: r.director = m.id
                r.send_all(r.roster())
        elif t == 'settings' and m.id == r.director:
            r.settings.update({k: v for k, v in (msg.get('settings') or {}).items() if k in ('minutes', 'location', 'difficulty', 'camera', 'ghost', 'ghostType', 'map')})
            r.send_all(r.roster())
        elif t == 'phase' and m.id == r.director:
            r.phase = msg.get('phase', 'lobby')
            r.send_all(r.roster())
        elif t == 'to':              # private: WebRTC signalling, sync snapshots
            dest = r.members.get(msg.get('to'))
            if dest: dest.send({'t': 'from', 'from': m.id, 'data': msg.get('data')})
        elif t == 'chat':
            text = ''.join(ch for ch in str(msg.get('text', '')) if ch.isprintable()).strip()[:160]
            if text: r.send_all({'t': 'chat', 'from': m.id, 'name': m.name, 'kind': m.kind, 'text': text})
        elif t == 'vote':            # audience scare votes go to the director's game
            d = r.members.get(r.director)
            if d: d.send({'t': 'vote', 'from': m.id, 'key': str(msg.get('key', ''))[:24]})
        else:                        # game traffic (state, events): fan out to the room
            msg['from'] = m.id
            r.send_all(msg, skip=m)


# ------------------------------------------------------------------ websocket
def recvn(sock, n):
    buf = bytearray()
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk: raise ConnectionError
        buf += chunk
    return bytes(buf)


def ws_recv(sock):
    msg = b''
    while True:
        b1, b2 = recvn(sock, 2)
        op, masked, n = b1 & 0x0F, b2 & 0x80, b2 & 0x7F
        if n == 126: n = struct.unpack('>H', recvn(sock, 2))[0]
        elif n == 127: n = struct.unpack('>Q', recvn(sock, 8))[0]
        if n > 1_000_000: raise ConnectionError
        mask = recvn(sock, 4) if masked else b'\0\0\0\0'
        raw = recvn(sock, n)
        if masked and n:
            k = (mask * (n // 4 + 1))[:n]
            raw = (int.from_bytes(raw, 'big') ^ int.from_bytes(k, 'big')).to_bytes(n, 'big')
        if op == 8: raise ConnectionError
        if op == 9:
            sock.sendall(bytes([0x8A, len(raw)]) + raw); continue
        if op == 10: continue
        msg += raw
        if b1 & 0x80: return msg.decode('utf-8', 'replace')


TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
         '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
         '.woff2': 'font/woff2', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.ico': 'image/x-icon'}


class H(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *a): pass

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        if path == '/ws' and self.headers.get('Upgrade', '').lower() == 'websocket':
            return self.websocket()
        if path == '/api/shows':
            with lock:
                body = json.dumps({'shows': len(rooms), 'crew': sum(len(r.crew()) for r in rooms.values()),
                                   'audience': sum(len(r.audience()) for r in rooms.values())}).encode()
            return self.reply(200, body, 'application/json')
        for prefix in ('/ghost-hunters-tv/', '/'):
            if path.startswith(prefix):
                path = path[len(prefix) - 1:]; break
        if path.endswith('/'): path += 'index.html'
        f = os.path.normpath(os.path.join(ROOT, path.lstrip('/')))
        if not f.startswith(ROOT) or '/server' in f[len(ROOT):] or not os.path.isfile(f):
            return self.reply(404, b'not found', 'text/plain')
        with open(f, 'rb') as fh: body = fh.read()
        self.reply(200, body, TYPES.get(os.path.splitext(f)[1], 'application/octet-stream'))

    def reply(self, code, body, ctype):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def websocket(self):
        key = self.headers.get('Sec-WebSocket-Key', '')
        acc = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
        self.send_response(101)
        self.send_header('Upgrade', 'websocket'); self.send_header('Connection', 'Upgrade')
        self.send_header('Sec-WebSocket-Accept', acc); self.end_headers()
        sock = self.connection
        sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        sock.settimeout(90)
        m = Member(sock)
        m.send({'t': 'hello', 'id': m.id})
        try:
            while m.alive:
                try: handle(m, json.loads(ws_recv(sock)))
                except (ValueError, KeyError, TypeError, AttributeError): pass
        except Exception:
            pass
        finally:
            with lock: leave(m)
            self.close_connection = True


if __name__ == '__main__':
    srv = ThreadingHTTPServer(('0.0.0.0', PORT), H)
    srv.daemon_threads = True
    print(f'Ghost Hunters TV on http://localhost:{PORT}/', flush=True)
    srv.serve_forever()
