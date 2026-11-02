// Toy-like kit: the ghost vacuum (backpack + hose + nozzle), a chunky
// flashlight, and the broadcast camera.
import * as THREE from 'three';
import { PAL, toon, glow, part, rbox, sphere, cyl, cone, capsule } from './toon.js';

export function flashlight() {
  const g = new THREE.Group();
  part(cyl(0.06, 0.06, 0.32, 12), PAL.yellow, 0, 0, 0, g, 0.015).rotation.x = Math.PI / 2;
  part(cyl(0.1, 0.07, 0.12, 14), PAL.yellow, 0, 0, 0.2, g, 0.015).rotation.x = Math.PI / 2;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.085, 14), glow(0xfff4c0, 2)); lens.position.z = 0.265; g.add(lens); g.userData.lens = lens;
  part(rbox(0.05, 0.04, 0.08, 0.015), PAL.red, 0, 0.065, -0.05, g, 0.01);
  return g;
}

// nozzle held in the hand; the tank rides the back (added separately)
export function vacuumNozzle() {
  const g = new THREE.Group();
  part(cyl(0.07, 0.09, 0.5, 12), PAL.metal, 0, 0, 0.12, g, 0.015).rotation.x = Math.PI / 2;
  part(cyl(0.16, 0.09, 0.22, 14), PAL.mint, 0, 0, 0.46, g, 0.02).rotation.x = Math.PI / 2;
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.15, 14), glow(0x7dffd8, 0.4)); mouth.position.z = 0.575; g.add(mouth); g.userData.mouth = mouth;
  part(rbox(0.08, 0.14, 0.12, 0.03), PAL.red, 0, -0.1, 0.0, g, 0.012);
  return g;
}
export function vacuumTank() {
  const g = new THREE.Group();
  part(capsule(0.2, 0.45, 12), PAL.mint, 0, 0, 0, g, 0.02);
  part(cyl(0.21, 0.21, 0.08, 14), PAL.ink, 0, 0.12, 0, g, 0);
  const gauge = new THREE.Mesh(sphere(0.07, 10, 8), glow(0x7dff5a, 1.2)); gauge.position.set(0, 0.32, 0.12); g.add(gauge); g.userData.gauge = gauge;
  for (const s of [-1, 1]) part(cyl(0.02, 0.02, 0.6, 6), PAL.ink, s * 0.16, 0, 0.18, g, 0);
  return g;
}

// the broadcast camcorder: chunky, with a big red REC light
export function camcorder() {
  const g = new THREE.Group();
  part(rbox(0.3, 0.26, 0.46, 0.07), PAL.ink, 0, 0, 0, g, 0.015);
  part(cyl(0.12, 0.14, 0.2, 16), 0x3a3a58, 0, 0.0, 0.31, g, 0.015).rotation.x = Math.PI / 2;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), glow(0x4ad8ff, 0.8)); lens.position.set(0, 0, 0.415); g.add(lens);
  const tally = new THREE.Mesh(sphere(0.035, 8, 6), glow(PAL.red, 3)); tally.position.set(0.1, 0.16, 0.18); g.add(tally); g.userData.tally = tally;
  part(rbox(0.07, 0.17, 0.32, 0.03), PAL.ink, 0, 0.19, -0.02, g, 0.01);
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.06), glow(0xfff4c0, 1.5)); lamp.position.set(0, 0.25, 0.15); g.add(lamp); g.userData.lamp = lamp;
  const screen = part(rbox(0.03, 0.16, 0.22, 0.02), 0x2a2a3a, 0.18, 0.02, 0.02, g, 0.01);
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.14), glow(0x5ab0ff, 0.6)); scr.rotation.y = Math.PI / 2; scr.position.set(0.017, 0, 0); screen.add(scr);
  return g;
}
