#!/usr/bin/env python3
"""Marks a new version of Ghost Hunters TV for the self-updating .exe.

Writes version.json at the game root: a version number (bumped by one each run) and the SHA-1 of every game file.
Publish afterwards (desktop/publish.py); every installed .exe downloads the changed files the next time it starts.

  python3 desktop/release.py
"""
import hashlib, json, os

GAME = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'server', 'desktop', 'tools'}
SKIP_FILES = {'version.json', 'README.md', '.gitignore'}


def private(rel):
    """Real photos and the local face settings stay on this computer."""
    low = rel.lower()
    return low.startswith('media/scares/real.') or low.endswith('faces.local.json') or low.endswith('.heic')


def game_files():
    files = {}
    for root, dirs, names in os.walk(GAME):
        rel_root = os.path.relpath(root, GAME)
        dirs[:] = sorted(d for d in dirs if not d.startswith('.') and not (rel_root == '.' and d in SKIP_DIRS))
        for n in sorted(names):
            if n.startswith('.') or n in SKIP_FILES: continue
            rel = os.path.normpath(os.path.join(rel_root, n)).replace(os.sep, '/')
            if private(rel): continue
            with open(os.path.join(root, n), 'rb') as f: files[rel] = hashlib.sha1(f.read()).hexdigest()
    return files


if __name__ == '__main__':
    path = os.path.join(GAME, 'version.json')
    try: old = json.load(open(path))['version']
    except Exception: old = 0
    files = game_files()
    json.dump({'version': old + 1, 'files': files}, open(path, 'w'), indent=1)
    print(f'version {old + 1}: {len(files)} game files')
