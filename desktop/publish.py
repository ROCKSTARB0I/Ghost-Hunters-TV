#!/usr/bin/env python3
"""Publishes Ghost Hunters TV to GitHub in one commit. Every installed .exe then updates itself on its next start.

Uploads the game files listed in version.json, version.json itself, and the repo's source files (server, desktop
launcher code). Never uploads real photos (media/scares/real.*), faces.local.json, or any token. Files that were
removed locally are removed from the repo too.

  python3 desktop/release.py     first, when game files changed (bumps version.json)
  python3 desktop/publish.py     then this

Uses the same GitHub token as the Server Control panel (server-manager/github-token.txt).
"""
import base64, hashlib, json, os, sys, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
REPO, BRANCH = 'ROCKSTARB0I/Ghost-Hunters-TV', 'main'
TOKEN_FILE = os.path.join(os.path.dirname(GAME), 'server-manager', 'github-token.txt')
SOURCES = ['server/server.py', 'desktop/release.py', 'desktop/publish.py', 'desktop/pack.py', 'desktop/ghosthunters.c',
           'desktop/ghosthunters.rc', 'desktop/ghosthunters.manifest', 'desktop/icon.ico', '.gitignore', 'README.md']
KEEP = ('server.json',)          # written by the Server Control panel; never delete it


def private(rel):
    low = rel.lower()
    return low.startswith('media/scares/real.') or 'faces.local' in low or low.endswith('.heic') or 'token' in low


def gh(method, path, body=None, ok404=False):
    req = urllib.request.Request(f'https://api.github.com/repos/{REPO}{path}', method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Authorization': f'Bearer {TOKEN}', 'Accept': 'application/vnd.github+json',
                                          'User-Agent': 'ghost-hunters-publish', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if ok404 and e.code in (404, 409): return None
        sys.exit(f'GitHub said {e.code} for {method} {path}: {e.read()[:300].decode("utf-8", "replace")}')


def blob_sha(data): return hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest()


def main():
    global TOKEN
    try: TOKEN = open(TOKEN_FILE).read().strip()
    except OSError: sys.exit(f'No GitHub token at {TOKEN_FILE}.')
    man = json.load(open(os.path.join(GAME, 'version.json')))
    want = [r for r in list(man['files']) + ['version.json'] + SOURCES if not private(r) and os.path.isfile(os.path.join(GAME, r))]

    ref = gh('GET', f'/git/ref/heads/{BRANCH}', ok404=True)
    if not ref:      # brand-new empty repo: make a first commit so there is a branch to build on
        gh('PUT', '/contents/README.md', {'message': 'Start Ghost Hunters TV', 'branch': BRANCH,
                                          'content': base64.b64encode(open(os.path.join(GAME, 'README.md'), 'rb').read()).decode()})
        ref = gh('GET', f'/git/ref/heads/{BRANCH}')
    head = ref['object']['sha']
    base_tree = gh('GET', f'/git/commits/{head}')['tree']['sha']
    remote = {e['path']: e['sha'] for e in gh('GET', f'/git/trees/{base_tree}?recursive=1')['tree'] if e['type'] == 'blob'}

    tree, sent = [], 0
    for rel in want:
        data = open(os.path.join(GAME, rel), 'rb').read()
        if remote.get(rel) == blob_sha(data): continue
        b = gh('POST', '/git/blobs', {'content': base64.b64encode(data).decode(), 'encoding': 'base64'})
        tree.append({'path': rel, 'mode': '100644', 'type': 'blob', 'sha': b['sha']}); sent += len(data)
    wanted = set(want)
    for rel in remote:
        if rel not in wanted and rel not in KEEP:
            tree.append({'path': rel, 'mode': '100644', 'type': 'blob', 'sha': None})
    if not tree:
        print('GitHub is already up to date.'); return
    new_tree = gh('POST', '/git/trees', {'base_tree': base_tree, 'tree': tree})['sha']
    commit = gh('POST', '/git/commits', {'message': f"Ghost Hunters TV version {man['version']}", 'tree': new_tree, 'parents': [head]})['sha']
    gh('PATCH', f'/git/refs/heads/{BRANCH}', {'sha': commit})
    adds = sum(1 for t in tree if t['sha']); dels = len(tree) - adds
    print(f"Published version {man['version']}: {adds} files uploaded ({sent // 1024} KB), {dels} removed. Commit {commit[:7]}.")


if __name__ == '__main__':
    main()
