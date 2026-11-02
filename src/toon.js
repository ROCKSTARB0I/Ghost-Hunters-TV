// Cartoon look: 3-step toon shading, ink outlines (inverted hulls), a
// candy-coloured night palette, and shape helpers for chunky props.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PAL = {
  grass: 0x3f8f4a, grass2: 0x2f7a40, dirt: 0x8a6a48, road: 0x3a3550, line: 0xffe066, walk: 0x9a8fb0,
  bark: 0x6b4630, leaf: 0x2f9a5a, leaf2: 0x46b86a, pine: 0x1f7a52, rock: 0x8a88a0,
  red: 0xff4a5a, orange: 0xff9a3a, yellow: 0xffd84a, mint: 0x6af0c0, sky: 0x6a5ad8, pink: 0xff7ac8, purple: 0x8a5ae8, blue: 0x4a9aff,
  cream: 0xfff1d6, white: 0xffffff, ink: 0x1a1030, wood: 0xb07a4a, woodDark: 0x7a4a2a, metal: 0xb8c0d8, glass: 0x9ae8ff,
  ghost: 0xe8fff6, slime: 0x7dff5a,
};

// toon gradient: 3 hard bands
const grad = (() => {
  const d = new Uint8Array([70, 70, 70, 255, 160, 160, 160, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();

const cache = new Map();
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!opts.unique && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: grad, ...opts });
  delete m.unique;
  if (!opts.unique) cache.set(key, m);
  return m;
}
export function glow(color, intensity = 1.5) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false }); }

export const INK = new THREE.MeshBasicMaterial({ color: PAL.ink, side: THREE.BackSide });

// inverted-hull outline: a slightly inflated back-face copy along normals
export function outline(mesh, w = 0.03) {
  const g = mesh.geometry.clone();
  const p = g.attributes.position, n = g.attributes.normal;
  if (!n) g.computeVertexNormals();
  const N = g.attributes.normal;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + N.getX(i) * w, p.getY(i) + N.getY(i) * w, p.getZ(i) + N.getZ(i) * w);
  const o = new THREE.Mesh(g, INK); o.raycast = () => {};
  mesh.add(o);
  return o;
}

// a mesh with toon material + outline, added to parent at x,y,z
export function part(geo, color, x = 0, y = 0, z = 0, parent, ink = 0.025, opts) {
  const m = new THREE.Mesh(geo, typeof color === 'number' ? toon(color, opts) : color);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (ink) outline(m, ink);
  if (parent) parent.add(m);
  return m;
}

// rounded box with smooth normals so outlines stay connected
export function rbox(w, h, d, r = 0.08, seg = 3) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2), p = g.attributes.position;
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    const c = new THREE.Vector3(Math.max(-ix, Math.min(ix, v.x)), Math.max(-iy, Math.min(iy, v.y)), Math.max(-iz, Math.min(iz, v.z)));
    const d2 = v.clone().sub(c); if (d2.lengthSq() > 0) d2.normalize().multiplyScalar(r);
    p.setXYZ(i, c.x + d2.x, c.y + d2.y, c.z + d2.z);
  }
  g.computeVertexNormals();
  return g;
}

export const sphere = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
export const cyl = (rt, rb, h, s = 16) => new THREE.CylinderGeometry(rt, rb, h, s);
export const cone = (r, h, s = 16) => new THREE.ConeGeometry(r, h, s);
export const capsule = (r, l, s = 12) => new THREE.CapsuleGeometry(r, l, 6, s);
export const lathe = (pts, s = 20) => new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(Math.max(0.0001, a), b)), s);

// merge many static toon meshes per material to keep draw calls low
export class Batch {
  constructor() { this.groups = new Map(); }
  add(mesh) {
    mesh.updateMatrixWorld(true);
    const list = [];
    mesh.traverse(m => { if (m.isMesh) list.push(m); });
    for (const m of list) {
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      if (!this.groups.has(m.material)) this.groups.set(m.material, []);
      this.groups.get(m.material).push(g);
    }
  }
  build(parent) {
    for (const [mat, list] of this.groups) {
      for (let i = 0; i < list.length; i += 400) {
        const g = mergeGeometries(list.slice(i, i + 400)); if (!g) continue;
        const m = new THREE.Mesh(g, mat); m.castShadow = mat !== INK; m.receiveShadow = mat !== INK; m.matrixAutoUpdate = false;
        parent.add(m);
      }
    }
  }
}

// lights that switch by intensity (changing light count recompiles shaders)
export function switchable(l, power = l.intensity) {
  l.userData.power = power; let on = true;
  Object.defineProperty(l, 'visible', { configurable: true, get: () => true, set: (v) => { on = v; l.intensity = v ? l.userData.power : 0; } });
  Object.defineProperty(l.userData, 'on', { configurable: true, get: () => on });
  return l;
}
export function setPower(l, p) { l.userData.power = p; if (l.userData.on) l.intensity = p; }

// canvas sign / label texture
export function signTex(text, { w = 512, h = 128, bg = '#ff4a5a', fg = '#fff', font = 'Anton', size = 84, border = '#1a1030' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = border; x.fillRect(0, 0, w, h); x.fillStyle = bg; x.fillRect(8, 8, w - 16, h - 16);
  x.fillStyle = fg; x.font = `${size}px "${font}", Impact, sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
