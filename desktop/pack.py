#!/usr/bin/env python3
"""Builds GhostHuntersTV.exe: compiles the launcher (ghosthunters.c) and glues the whole game onto the end of it.

The result is ONE file. Inside the pack: every game file listed in version.json, the launcher settings
(config.json) and Microsoft's small WebView2 loader (a backup if ours can't start the web engine).
Never packs real photos (media/scares/real.*) or faces.local.json — version.json doesn't list them.

  python3 desktop/release.py      first, whenever game files changed (bumps version.json)
  python3 desktop/pack.py         ->  <build>/dist/GhostHuntersTV.exe  and  GhostHuntersTV.zip

Tools live on the external drive (shared with OVERDRIVE): GHT_BUILD, default /Volumes/QUICKSILVER/overdrive-build,
which holds zig/ (the compiler), webview2-sdk/ and shim/. Output goes to <drive>/ghosthunters-build/dist.
"""
import hashlib, json, os, struct, subprocess, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
TOOLS = os.environ.get('GHT_BUILD') or '/Volumes/QUICKSILVER/overdrive-build'
OUT = os.path.join(os.path.dirname(TOOLS), 'ghosthunters-build', 'dist')
SDK = os.path.join(TOOLS, 'webview2-sdk', 'pkg', 'build', 'native')


def compile_launcher(out):
    libs = ['user32', 'gdi32', 'shell32', 'shlwapi', 'ole32', 'advapi32', 'winhttp', 'bcrypt', 'dwmapi']
    cmd = [os.path.join(TOOLS, 'zig', 'zig'), 'build-exe', '-target', 'x86_64-windows-gnu', '-O', 'ReleaseSmall', '-fstrip',
           '--subsystem', 'windows', '-lc', '-I', os.path.join(TOOLS, 'shim'), '-I', os.path.join(SDK, 'include'),
           'ghosthunters.c', 'ghosthunters.rc', *[f'-l{l}' for l in libs], '--name', 'GhostHuntersTV', f'-femit-bin={out}']
    subprocess.run(cmd, cwd=HERE, check=True)


def main():
    man = json.load(open(os.path.join(GAME, 'version.json')))
    files, stale = {}, []
    for rel, want in man['files'].items():
        data = open(os.path.join(GAME, rel), 'rb').read()
        if hashlib.sha1(data).hexdigest() != want: stale.append(rel)
        files[rel] = data
    if stale:
        sys.exit(f'{len(stale)} file(s) changed since version.json was made (e.g. {stale[0]}). Run desktop/release.py first.')
    files['version.json'] = open(os.path.join(GAME, 'version.json'), 'rb').read()
    files['_launcher/config.json'] = open(os.path.join(HERE, 'config.json'), 'rb').read()
    files['_native/WebView2Loader.dll'] = open(os.path.join(SDK, 'x64', 'WebView2Loader.dll'), 'rb').read()
    os.makedirs(OUT, exist_ok=True)
    exe = os.path.join(OUT, 'GhostHuntersTV.exe')
    compile_launcher(exe)
    launcher_size = os.path.getsize(exe)
    # [launcher][file bytes...][index][b'GHPAK001'][u64 index offset]
    with open(exe, 'ab') as f:
        entries = []
        for rel in sorted(files):
            entries.append((rel, f.tell(), len(files[rel]))); f.write(files[rel])
        idx = f.tell()
        f.write(struct.pack('<I', len(entries)))
        for rel, off, size in entries:
            b = rel.encode(); f.write(struct.pack('<H', len(b)) + b + struct.pack('<QQ', off, size))
        f.write(b'GHPAK001' + struct.pack('<Q', idx))
    z = os.path.join(OUT, 'GhostHuntersTV.zip')
    with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf: zf.write(exe, 'GhostHuntersTV/GhostHuntersTV.exe')
    mb = lambda n: f'{n / 1048576:.1f} MB'
    print(f'version {man["version"]}: launcher {launcher_size // 1024} KB + {len(files)} packed files')
    print(f'built {exe} ({mb(os.path.getsize(exe))}), {z} ({mb(os.path.getsize(z))})')


if __name__ == '__main__':
    main()
