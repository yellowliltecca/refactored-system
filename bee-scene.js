/* One-time natural bee fly-by for HoneyVine.
   The storefront stays visible immediately; this transparent overlay is not a preloader. */

const overlay = document.getElementById('beeEntry');
const canvas = document.getElementById('beeEntryCanvas');
const fallback = document.getElementById('beeEntryFallback');

// Eight independent, gently curved flight paths. Each bee starts near the swarm,
// then disperses in a different direction with its own timing and flight rhythm.
const flights = [
  // Every route begins just beyond one viewport edge and finishes beyond another.
  // Coordinates are normalized to half the visible viewport: +/-1 is the edge.
  { start: [-1.18,  0.76], c1: [-0.72,  0.92], c2: [ 0.62, -0.34], end: [ 1.18, -0.72], delay: 0.00, duration: 7.10, phase: 0.25, size: 0.88 },
  { start: [ 1.18,  0.68], c1: [ 0.72,  0.94], c2: [-0.62, -0.38], end: [-1.18, -0.76], delay: 0.18, duration: 7.35, phase: 1.10, size: 0.86 },
  { start: [-0.72,  1.18], c1: [-0.86,  0.66], c2: [ 0.52, -0.62], end: [ 0.78, -1.18], delay: 0.36, duration: 6.95, phase: 2.05, size: 0.90 },
  { start: [ 0.76, -1.18], c1: [ 0.86, -0.66], c2: [-0.58,  0.66], end: [-0.74,  1.18], delay: 0.54, duration: 7.45, phase: 2.90, size: 0.88 },
  { start: [-1.18, -0.46], c1: [-0.70, -0.34], c2: [ 0.64,  0.42], end: [ 1.18,  0.48], delay: 0.72, duration: 7.05, phase: 3.75, size: 0.84 },
  { start: [ 1.18, -0.38], c1: [ 0.68, -0.54], c2: [-0.66,  0.56], end: [-1.18,  0.54], delay: 0.90, duration: 7.55, phase: 4.65, size: 0.88 },
  { start: [ 0.12,  1.18], c1: [ 0.58,  0.72], c2: [-0.56, -0.72], end: [-0.14, -1.18], delay: 1.08, duration: 7.20, phase: 5.50, size: 0.86 },
  { start: [-0.18, -1.18], c1: [-0.60, -0.72], c2: [ 0.58,  0.72], end: [ 0.18,  1.18], delay: 1.26, duration: 7.40, phase: 6.35, size: 0.84 }
];

let started = false;
let finished = false;
let animationFrame = 0;
let resizeHandler = null;
let activeRenderer = null;
let fallbackTimer = 0;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const smoothstep = (value) => value * value * (3 - 2 * value);

function finishEntry() {
  if (finished) return;
  finished = true;
  if (fallbackTimer) window.clearTimeout(fallbackTimer);
  if (animationFrame) cancelAnimationFrame(animationFrame);
  if (resizeHandler) window.removeEventListener('resize', resizeHandler);
  if (activeRenderer) {
    activeRenderer.dispose();
    activeRenderer = null;
  }
  overlay?.classList.add('is-done');
  window.setTimeout(() => overlay?.remove(), 380);
}

function runSpriteFallback() {
  if (started || finished || !overlay || !fallback) return;
  started = true;
  fallback.classList.add('is-active');
  fallbackTimer = window.setTimeout(finishEntry, 9000);
}

function prepareBeeModel(THREE, source) {
  const bee = source.clone(true);
  bee.updateMatrixWorld(true);

  // In this GLB the stinger is on local +Z, so the bee's face/nose points along -Z.
  const bounds = new THREE.Box3().setFromObject(bee);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const longestSide = Math.max(size.x, size.y, size.z) || 1;
  const normalizer = 1.45 / longestSide;

  const normalized = new THREE.Group();
  normalized.add(bee);
  normalized.scale.setScalar(normalizer);
  normalized.position.copy(center).multiplyScalar(-normalizer);
  normalized.updateMatrixWorld(true);
  return { normalized };
}

function cloneBee(THREE, template, phase) {
  const model = template.normalized.clone(true);
  const wings = [];
  const materials = [];

  model.traverse((node) => {
    if (node.isMesh) {
      node.frustumCulled = false;
      const cloneMaterial = (material) => {
        const copy = material.clone();
        copy.transparent = true;
        copy.depthWrite = false;
        materials.push({ material: copy, baseOpacity: material.opacity ?? 1 });
        return copy;
      };
      if (node.material) {
        node.material = Array.isArray(node.material)
          ? node.material.map(cloneMaterial)
          : cloneMaterial(node.material);
      }
    }
    if (!node.isMesh && /wing/i.test(node.name)) {
      wings.push({ pivot: node, side: /left/i.test(node.name) ? -1 : 1 });
    }
  });

  const root = new THREE.Group();
  root.add(model);
  return {
    root,
    wings,
    materials,
    phase,
    targetQuaternion: new THREE.Quaternion(),
    rollQuaternion: new THREE.Quaternion()
  };
}

function worldSizeAt(THREE, camera, z) {
  const distance = Math.max(0.25, camera.position.z - z);
  const height = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  return { width: height * camera.aspect, height };
}

function cubicPoint(a, b, c, d, t) {
  const u = 1 - t;
  return [
    u*u*u*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t*t*t*d[0],
    u*u*u*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t*t*t*d[1]
  ];
}

function cubicTangent(a, b, c, d, t) {
  const u = 1 - t;
  return [
    3*u*u*(b[0]-a[0]) + 6*u*t*(c[0]-b[0]) + 3*t*t*(d[0]-c[0]),
    3*u*u*(b[1]-a[1]) + 6*u*t*(c[1]-b[1]) + 3*t*t*(d[1]-c[1])
  ];
}

function sampleWorldPosition(THREE, camera, flight, progress, elapsed) {
  const [px, py] = cubicPoint(flight.start, flight.c1, flight.c2, flight.end, progress);
  const tangent = cubicTangent(flight.start, flight.c1, flight.c2, flight.end, progress);
  const length = Math.hypot(tangent[0], tangent[1]) || 1;
  const normalX = -tangent[1] / length;
  const normalY = tangent[0] / length;

  // Gentle, irregular bee-like drift layered over the main route.
  const drift = Math.sin(progress * Math.PI * 4.2 + flight.phase) * 0.026
    + Math.sin(elapsed * 1.55 + flight.phase) * 0.014;
  const bob = Math.sin(elapsed * 2.15 + flight.phase) * 0.026
    + Math.sin(progress * Math.PI * 6.0 + flight.phase) * 0.012;
  const z = THREE.MathUtils.lerp(-5.5, -0.8, progress)
    + Math.sin(elapsed * 1.25 + flight.phase) * 0.035;
  const view = worldSizeAt(THREE, camera, z);

  return new THREE.Vector3(
    (px + normalX * drift) * view.width * 0.5,
    (py + normalY * drift + bob) * view.height * 0.5,
    z
  );
}

async function start3D() {
  if (started || finished || !overlay || !canvas) return;

  const THREE = await import('three');
  const { GLTFLoader } = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(new URL('./assets/bee.glb', import.meta.url).href);
  if (started || finished) return;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
    premultipliedAlpha: false
  });

  started = true;
  activeRenderer = renderer;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / Math.max(1, window.innerHeight), 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0xfff7df, 0x77502b, 2.5));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
  keyLight.position.set(-3, 5, 8);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xffd16a, 0.9);
  fillLight.position.set(4, -2, 5);
  scene.add(fillLight);

  const template = prepareBeeModel(THREE, gltf.scene);
  const bees = flights.map((flight) => ({
    ...cloneBee(THREE, template, flight.phase),
    flight
  }));
  bees.forEach((bee) => scene.add(bee.root));

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const maxFinish = Math.max(...flights.map((flight) => flight.delay + flight.duration));
  const startTime = performance.now();
  let previousFrame = startTime;

  resizeHandler = () => {
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
  };
  window.addEventListener('resize', resizeHandler, { passive: true });

  // Nose direction in the original model. We align this axis to the actual flight vector,
  // not permanently to the camera, so each bee turns into its own direction of travel.
  const localForward = new THREE.Vector3(0, 0, -1);
  const localRollAxis = new THREE.Vector3(0, 0, -1);
  const futurePosition = new THREE.Vector3();
  const previousPosition = new THREE.Vector3();
  const worldDirection = new THREE.Vector3();
  const tangentBefore = new THREE.Vector2();
  const tangentAfter = new THREE.Vector2();

  function animate(now) {
    if (finished) return;
    const elapsed = (now - startTime) / 1000;
    const frameDelta = Math.min(0.05, Math.max(0.001, (now - previousFrame) / 1000));
    previousFrame = now;

    bees.forEach((bee) => {
      const flight = bee.flight;
      const raw = clamp((elapsed - flight.delay) / flight.duration, 0, 1);
      const progress = smoothstep(raw);
      const position = sampleWorldPosition(THREE, camera, flight, progress, elapsed);
      bee.root.position.copy(position);

      const scale = THREE.MathUtils.lerp(0.54, flight.size * 1.06, progress)
        * (1 + (reducedMotion ? 0 : Math.sin(elapsed * 2.2 + bee.phase) * 0.012));
      bee.root.scale.setScalar(scale);

      // Estimate the real 3D direction from nearby points on the route, including depth travel.
      const sampleSeconds = 0.055;
      const rawAhead = clamp(raw + sampleSeconds / flight.duration, 0, 1);
      const rawBehind = clamp(raw - sampleSeconds / flight.duration, 0, 1);
      const progressAhead = smoothstep(rawAhead);
      const progressBehind = smoothstep(rawBehind);
      futurePosition.copy(sampleWorldPosition(THREE, camera, flight, progressAhead, elapsed + sampleSeconds));
      previousPosition.copy(sampleWorldPosition(THREE, camera, flight, progressBehind, Math.max(0, elapsed - sampleSeconds)));
      worldDirection.subVectors(futurePosition, previousPosition);
      if (worldDirection.lengthSq() < 0.000001) {
        const tangent = cubicTangent(flight.start, flight.c1, flight.c2, flight.end, progress);
        worldDirection.set(tangent[0], tangent[1], 0.75);
      }
      worldDirection.normalize();

      bee.targetQuaternion.setFromUnitVectors(localForward, worldDirection);

      // Bank the body into curves. A bee leans slightly as its heading changes.
      const beforeT = Math.max(0, progress - 0.018);
      const afterT = Math.min(1, progress + 0.018);
      const a = cubicTangent(flight.start, flight.c1, flight.c2, flight.end, beforeT);
      const b = cubicTangent(flight.start, flight.c1, flight.c2, flight.end, afterT);
      tangentBefore.set(a[0], a[1]).normalize();
      tangentAfter.set(b[0], b[1]).normalize();
      const turn = Math.atan2(
        tangentBefore.x * tangentAfter.y - tangentBefore.y * tangentAfter.x,
        tangentBefore.dot(tangentAfter)
      );
      const bank = clamp(turn * 2.1 + (reducedMotion ? 0 : Math.sin(elapsed * 1.7 + bee.phase) * 0.025), -0.34, 0.34);
      bee.rollQuaternion.setFromAxisAngle(localRollAxis, bank);
      bee.targetQuaternion.multiply(bee.rollQuaternion);
      bee.root.quaternion.slerp(bee.targetQuaternion, 1 - Math.exp(-frameDelta * 7.0));

      const fadeIn = smoothstep(clamp(raw / 0.075, 0, 1));
      const fadeOut = 1 - smoothstep(clamp((raw - 0.86) / 0.14, 0, 1));
      const opacity = clamp(fadeIn * fadeOut, 0, 1);
      bee.materials.forEach(({ material, baseOpacity }) => {
        material.opacity = baseOpacity * opacity;
      });

      bee.wings.forEach(({ pivot, side }) => {
        pivot.rotation.z = reducedMotion ? 0 : Math.sin(elapsed * 48 + bee.phase) * 0.48 * side;
      });
    });

    renderer.render(scene, camera);
    if (elapsed >= maxFinish + 0.12) {
      finishEntry();
      return;
    }
    animationFrame = requestAnimationFrame(animate);
  }

  animationFrame = requestAnimationFrame(animate);
}

function boot() {
  // The page is already visible. Bees begin only when the site is entered.
  start3D().catch((error) => {
    console.warn('HoneyVine 3D entrance animation unavailable:', error);
    if (!started && !finished) runSpriteFallback();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
