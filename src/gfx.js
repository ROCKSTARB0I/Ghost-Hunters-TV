// Renderer and the three looks of DEAD AIR:
//   EYES      what a host sees: filmic, dark, grain and vignette
//   BROADCAST the camcorder feed: tape noise, chroma bleed, scanlines,
//             night-vision with an infrared illuminator, lens breathing
//   BODYCAM   a host's chest camera (audience alt feed): fisheye, low-res
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FINAL = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, mode: { value: 0 }, nv: { value: 0 }, res: { value: new THREE.Vector2(1, 1) },
    grain: { value: 0.035 }, vignette: { value: 0.6 }, fear: { value: 0 }, glitch: { value: 0 }, dead: { value: 0 }, fade: { value: 1 },
    signal: { value: 1 }, ghostView: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, mode, nv, grain, vignette, fear, glitch, dead, fade, signal, ghostView; uniform vec2 res;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    float n1(float x){ return fract(sin(x*91.3)*47453.1); }
    vec3 tape(vec2 uv){
      // horizontal line jitter, stronger on glitches and weak signal
      float line = floor(uv.y * res.y / 2.0);
      float jit = (h(vec2(line, floor(time*30.0))) - 0.5) * (0.0012 + glitch * 0.03 + (1.0-signal)*0.02);
      float roll = step(0.985 - glitch*0.2, h(vec2(floor(time*8.0), 3.0))) * glitch;
      uv.x += jit + sin(uv.y*40.0 + time*12.0) * roll * 0.02;
      // chroma bleeds horizontally (luma sharp, colour smeared)
      vec3 c = texture2D(tDiffuse, uv).rgb;
      vec3 cl = texture2D(tDiffuse, uv + vec2(0.0025, 0.0)).rgb, cr = texture2D(tDiffuse, uv - vec2(0.0025, 0.0)).rgb;
      float y = dot(c, vec3(0.299,0.587,0.114));
      vec3 chroma = (cl + cr + c) / 3.0 - dot((cl+cr+c)/3.0, vec3(0.299,0.587,0.114));
      c = vec3(y) + chroma * 0.95;
      c.r = mix(c.r, texture2D(tDiffuse, uv + vec2(0.0018,0.0)).r, 0.5);
      c.b = mix(c.b, texture2D(tDiffuse, uv - vec2(0.0018,0.0)).b, 0.5);
      return c;
    }
    void main(){
      vec2 uv = vUv;
      vec3 c;
      if (mode > 1.5) {                       // bodycam: barrel distortion, lower res
        vec2 q = uv - 0.5; float r2 = dot(q,q); uv = 0.5 + q * (1.0 - 0.28 * r2 - 0.12);
        vec2 px = vec2(480.0, 270.0); uv = (floor(uv*px)+0.5)/px;
        c = tape(uv);
        c = mix(c, vec3(dot(c, vec3(0.3,0.59,0.11))), 0.35);
      } else if (mode > 0.5) {                // broadcast camcorder
        vec2 q = uv - 0.5; uv = 0.5 + q * (1.0 - 0.04 * dot(q,q));
        c = tape(uv);
        // slight lift + crush like consumer CCD
        c = pow(max(c, 0.0), vec3(0.95)) * 1.06;
      } else {
        c = texture2D(tDiffuse, uv).rgb;
        // fear pulls colour and pulses the edges
        float s = dot(c, vec3(0.3,0.59,0.11)); c = mix(c, vec3(s), fear * 0.6);
      }
      if (nv > 0.5 && mode > 0.5) {
        float y = dot(c, vec3(0.299,0.587,0.114));
        y = pow(y * 3.2, 0.62);
        c = vec3(0.12, 1.0, 0.35) * y + vec3(0.02, 0.05, 0.02);
        c += (h(uv*res + time) - 0.5) * 0.18;
      }
      // grain: luminance-weighted, animated
      float g = h(uv * res + fract(time * 13.7) * 100.0) - 0.5;
      float gs = grain * (mode > 0.5 ? 1.4 : 1.0) * (1.0 + (1.0-signal)*4.0);
      c += g * gs * (0.6 + 0.4 * (1.0 - dot(c, vec3(0.33))));
      if (mode > 0.5) {
        // scanlines + faint head-switching noise at the bottom
        c *= 0.94 + 0.06 * sin(uv.y * res.y * 1.5707);
        float bottom = smoothstep(0.03, 0.0, uv.y);
        c = mix(c, vec3(h(vec2(uv.x*400.0, time))), bottom * 0.6);
        // weak signal: snow
        c = mix(c, vec3(h(uv*res*0.5 + time*60.0)), (1.0 - signal) * 0.85);
      }
      // vignette
      vec2 q = vUv - 0.5;
      float v = smoothstep(0.85, 0.2, length(q * vec2(1.0, 0.85)) * vignette * (1.0 + fear * 0.4));
      c *= mix(1.0, v, mode > 1.5 ? 1.0 : 0.85);
      // the ghost sees the living world through a minty, wobbly haze
      if (ghostView > 0.5) { float l = dot(c, vec3(0.3,0.59,0.11)); c = mix(c, vec3(0.5,1.0,0.8) * (l * 1.3 + 0.08), 0.45); }
      // death: drain to black-red
      c = mix(c, vec3(dot(c, vec3(0.5,0.3,0.2))) * vec3(0.6,0.1,0.08), dead);
      gl_FragColor = vec4(c * fade, 1.0);
    }`,
};

export class Gfx {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.setPixelRatio(1);
    r.toneMapping = THREE.NoToneMapping;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a1a4a);
    this.scene.fog = new THREE.Fog(0x4a3a7a, 28, 110);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 300);
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.final = new ShaderPass(FINAL);
    this.composer.addPass(this.final);
    this.U = this.final.uniforms;
    this.mode = 'eyes';
    this.resize();
    addEventListener('resize', () => this.resize());
    this.buildSky();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.U.res.value.set(w, h);
  }

  setMode(m) {
    this.mode = m;
    this.U.mode.value = m === 'eyes' ? 0 : m === 'broadcast' ? 1 : 2;
    this.bloom.strength = m === 'eyes' ? 0.55 : 0.7;
  }

  buildSky() {
    // candy-night gradient dome with twinkling stars
    const sky = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { t: { value: 0 } },
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform float t; varying vec3 vD;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9,78.2,37.7)))*43758.5); }
        void main(){
          vec3 d = normalize(vD); float up = max(d.y, 0.0);
          vec3 col = mix(vec3(0.36,0.22,0.55), vec3(0.08,0.05,0.22), pow(up, 0.6));
          col = mix(col, vec3(0.95,0.45,0.55), pow(1.0 - up, 10.0) * 0.5);
          vec3 cell = floor(d * 90.0);
          float s = step(0.985, h(cell)) * smoothstep(0.1, 0.35, up);
          col += s * (0.6 + 0.4 * sin(t * 3.0 + h(cell + 1.0) * 40.0)) * vec3(1.0, 0.95, 0.8);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }));
    sky.renderOrder = -1; this.scene.add(sky); this.sky = sky;
    // the moon has a face, and it is judging you
    const mc = document.createElement('canvas'); mc.width = mc.height = 256; const x = mc.getContext('2d');
    x.fillStyle = '#fff6d0'; x.beginPath(); x.arc(128, 128, 120, 0, 7); x.fill();
    x.fillStyle = '#efe0a8'; for (const [a, b, r] of [[80, 70, 20], [170, 160, 26], [100, 190, 14], [190, 80, 12]]) { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); }
    x.fillStyle = '#3a2a4a'; x.beginPath(); x.ellipse(95, 115, 10, 16, 0, 0, 7); x.ellipse(160, 115, 10, 16, 0, 0, 7); x.fill();
    x.strokeStyle = '#3a2a4a'; x.lineWidth = 7; x.lineCap = 'round'; x.beginPath(); x.moveTo(100, 170); x.quadraticCurveTo(128, 160, 158, 172); x.stroke();
    x.beginPath(); x.moveTo(80, 92); x.lineTo(108, 98); x.moveTo(175, 92); x.lineTo(147, 98); x.stroke();
    const mt = new THREE.CanvasTexture(mc); mt.colorSpace = THREE.SRGBColorSpace;
    const moonM = new THREE.Mesh(new THREE.CircleGeometry(11, 40), new THREE.MeshBasicMaterial({ map: mt, fog: false, toneMapped: false, transparent: true }));
    moonM.position.set(-60, 58, 90); moonM.lookAt(0, 0, 0); this.scene.add(moonM); this.moonMesh = moonM;
    const halo = new THREE.Mesh(new THREE.CircleGeometry(22, 40), new THREE.MeshBasicMaterial({ color: 0xffe8b0, transparent: true, opacity: 0.12, fog: false, depthWrite: false }));
    halo.position.copy(moonM.position).multiplyScalar(1.01); halo.lookAt(0, 0, 0); this.scene.add(halo);
    // puffy cartoon clouds drifting
    this.clouds = [];
    const cm = new THREE.MeshBasicMaterial({ color: 0x8a6ab8, fog: false, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group(), a = i / 9 * Math.PI * 2, r = 100;
      for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(new THREE.CircleGeometry(4 + Math.random() * 3, 20), cm); p.position.set(k * 4.5 - 9, Math.sin(k * 1.3) * 2, 0); g.add(p); }
      g.position.set(Math.cos(a) * r, 40 + Math.random() * 18, Math.sin(a) * r); g.lookAt(0, g.position.y, 0); this.scene.add(g); this.clouds.push({ g, a, r });
    }
    const moon = this.moon = new THREE.DirectionalLight(0xb8c8ff, 1.6);
    moon.position.set(-30, 40, 45); moon.target.position.set(0, 0, 0);
    moon.castShadow = true; moon.shadow.mapSize.set(1024, 1024);
    const sc = moon.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 5; sc.far = 140;
    moon.shadow.bias = -0.0008; moon.shadow.normalBias = 0.04;
    this.scene.add(moon, moon.target);
    this.hemi = new THREE.HemisphereLight(0x9a8aff, 0x2a4a3a, 1.1);
    this.scene.add(this.hemi);
  }

  // keep the moon's shadow box centred on the action
  follow(p) {
    this.moon.position.set(p.x - 30, 40, p.z + 45); this.moon.target.position.set(p.x, 0, p.z);
    for (const c of this.clouds) { c.a += 0.0004; c.g.position.x = Math.cos(c.a) * c.r; c.g.position.z = Math.sin(c.a) * c.r; c.g.lookAt(0, c.g.position.y, 0); }
    this.sky.material.uniforms.t.value = this.U.time.value;
  }

  render(dt) {
    this.U.time.value += dt;
    this.composer.render(dt);
  }
}
