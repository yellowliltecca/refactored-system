/* Continuous, gentle bee flight around the HoneyVine jar lid.
   Uses the exact supplied minecraft_-_bee.glb model already stored in assets/bee.glb. */

import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const visual = document.querySelector('.hero__visual');
const canvas = document.getElementById('jarBeeCanvas');
const image = visual?.querySelector('img');
const fallback = visual?.querySelector('.jar-bee-fallback');

function ensureFallbackBeeCount(count = 7) {
  if (!fallback) return;
  const names = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
  const source = fallback.querySelector('img');
  if (!source) return;
  while (fallback.querySelectorAll('img').length < count) {
    const index = fallback.querySelectorAll('img').length;
    const bee = source.cloneNode(true);
    bee.className = `jar-bee-fallback__${names[index]}`;
    bee.alt = '';
    fallback.appendChild(bee);
  }
}

if (visual && canvas && image) {
  // Give the jar orbit its own viewport layer. This keeps the entrance swarm
  // visible over the page while the jar bees remain visible above both.
  canvas.classList.add('jar-bee-global-layer');
  document.body.appendChild(canvas);
  if (fallback) {
    ensureFallbackBeeCount(7);
    fallback.classList.add('jar-bee-fallback-global', 'is-active');
    document.body.appendChild(fallback);
  }

  // Click targets and honey particles live in a transparent viewport overlay.
  // Only the small bee hit areas accept pointer input, so the rest of the page
  // remains fully clickable on desktop and touch devices.
  const interactionLayer = document.createElement('div');
  interactionLayer.className = 'jar-bee-interaction-layer';
  interactionLayer.setAttribute('aria-hidden', 'false');
  document.body.appendChild(interactionLayer);

  const fallbackReactionTimers = new WeakMap();
  const fallbackBeeTapCounts = new WeakMap();

  // A blocky, pixel-like puff inspired by Minecraft's bee damage/death particles.
  function createMinecraftSmokePuff(x, y) {
    const puff = document.createElement('span');
    puff.className = 'jar-bee-smoke-puff';
    puff.setAttribute('aria-hidden', 'true');

    const particles = [
      [-13, -5, 8, 0], [-7, -13, 7, 35], [2, -16, 9, 70],
      [12, -9, 8, 20], [16, 2, 7, 85], [9, 12, 9, 45],
      [-2, 15, 8, 100], [-13, 9, 7, 55], [-19, 1, 6, 120],
      [1, -3, 10, 0], [7, 5, 6, 140], [-6, 4, 7, 90]
    ];

    particles.forEach(([dx, dy, size, delay]) => {
      const particle = document.createElement('i');
      particle.style.setProperty('--dx', `${dx}px`);
      particle.style.setProperty('--dy', `${dy}px`);
      particle.style.setProperty('--particle-size', `${size}px`);
      particle.style.setProperty('--particle-delay', `${delay}ms`);
      puff.appendChild(particle);
    });

    puff.style.left = `${x}px`;
    puff.style.top = `${y}px`;
    interactionLayer.appendChild(puff);
    window.setTimeout(() => puff.remove(), 760);
  }

  function reactToFallbackBee(beeImage) {
    if (!beeImage.isConnected || beeImage.dataset.vanished === 'true') return;

    const tapCount = (fallbackBeeTapCounts.get(beeImage) || 0) + 1;
    fallbackBeeTapCounts.set(beeImage, tapCount);

    if (tapCount >= 4) {
      const rect = beeImage.getBoundingClientRect();
      createMinecraftSmokePuff(rect.left + rect.width / 2, rect.top + rect.height / 2);
      beeImage.dataset.vanished = 'true';
      beeImage.classList.remove('is-angry');
      beeImage.classList.add('is-vanishing');
      beeImage.style.pointerEvents = 'none';
      beeImage.setAttribute('aria-hidden', 'true');
      window.setTimeout(() => beeImage.remove(), 100);
      return;
    }

    beeImage.classList.remove('is-angry');
    // The bee flashes red for one second after each of the first three taps.
    void beeImage.offsetWidth;
    beeImage.classList.add('is-angry');
    const previousTimer = fallbackReactionTimers.get(beeImage);
    if (previousTimer) window.clearTimeout(previousTimer);
    const timer = window.setTimeout(() => {
      beeImage.classList.remove('is-angry');
      fallbackReactionTimers.delete(beeImage);
    }, 1000);
    fallbackReactionTimers.set(beeImage, timer);
  }

  function bindFallbackBeeInteractions() {
    if (!fallback) return;
    fallback.querySelectorAll('img').forEach((beeImage, index) => {
      if (beeImage.dataset.tapReactionBound === 'true') return;
      beeImage.dataset.tapReactionBound = 'true';
      beeImage.style.pointerEvents = 'auto';
      beeImage.style.cursor = 'pointer';
      beeImage.setAttribute('role', 'button');
      beeImage.setAttribute('tabindex', '0');
      beeImage.setAttribute('aria-label', `Пчела ${index + 1}. Нажмите четыре раза, чтобы она исчезла`);
      beeImage.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        reactToFallbackBee(beeImage);
      });
      beeImage.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          reactToFallbackBee(beeImage);
        }
      });
    });
  }

  bindFallbackBeeInteractions();
  visual.classList.add('is-jar-bee-loading');

  let renderer;
  let scene;
  let camera;
  let animationFrame = 0;
  let started = false;
  let inView = true;
  let layout = null;
  let startTime = 0;
  let previousTime = 0;
  let staticRender = false;
  const bees = [];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const localForward = new THREE.Vector3(0, 0, -1);
  const direction = new THREE.Vector3();
  const targetQuaternion = new THREE.Quaternion();
  const rollQuaternion = new THREE.Quaternion();
  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => resizeScene())
    : null;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  // The imported model has separate left/right wing pivot groups but no baked animation.
  // We flap those pivots directly and steer the body along its real flight tangent.
  function makeTemplate(source) {
    const model = source.clone(true);
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const longestSide = Math.max(size.x, size.y, size.z) || 1;
    const normalizer = 1.45 / longestSide;
    const normalized = new THREE.Group();
    normalized.add(model);
    normalized.scale.setScalar(normalizer);
    normalized.position.copy(center).multiplyScalar(-normalizer);
    normalized.updateMatrixWorld(true);
    return normalized;
  }

  function makeBee(template, config) {
    const model = template.clone(true);
    const wings = [];
    const materials = [];
    model.traverse((node) => {
      if (node.isMesh) {
        node.frustumCulled = false;
        if (node.material) {
          const cloneMaterial = (sourceMaterial) => {
            const material = sourceMaterial.clone();
            materials.push({
              material,
              baseColor: material.color?.clone() ?? null,
              baseEmissive: material.emissive?.clone() ?? null,
              baseEmissiveIntensity: material.emissiveIntensity ?? 0
            });
            return material;
          };
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
      config,
      baseScale: 1,
      phase: config.phase,
      hitTarget: null,
      clickCount: 0,
      removed: false,
      targetQuaternion: new THREE.Quaternion(),
      rollQuaternion: new THREE.Quaternion()
    };
  }

  const angryRed = new THREE.Color('#f02d27');

  function setBeeAngry(bee, angry) {
    bee.materials.forEach(({ material, baseColor, baseEmissive, baseEmissiveIntensity }) => {
      if (baseColor && material.color) {
        material.color.copy(angry ? baseColor.clone().lerp(angryRed, 0.78) : baseColor);
      }
      if (baseEmissive && material.emissive) {
        material.emissive.copy(angry ? baseEmissive.clone().lerp(angryRed, 0.92) : baseEmissive);
        material.emissiveIntensity = angry
          ? Math.max(baseEmissiveIntensity, 0.55)
          : baseEmissiveIntensity;
      }
    });
  }

  function removeJarBee(bee) {
    if (bee.removed) return;
    bee.removed = true;

    const rect = bee.hitTarget?.getBoundingClientRect();
    if (rect) {
      createMinecraftSmokePuff(rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

    if (bee.reactionTimer) window.clearTimeout(bee.reactionTimer);
    if (bee.hitTarget) {
      bee.hitTarget.disabled = true;
      bee.hitTarget.remove();
      bee.hitTarget = null;
    }
    if (scene) scene.remove(bee.root);
    bee.materials.forEach(({ material }) => material.dispose?.());
  }

  function reactToJarBee(bee) {
    if (bee.removed) return;
    bee.clickCount += 1;

    if (bee.clickCount >= 4) {
      removeJarBee(bee);
      return;
    }

    setBeeAngry(bee, true);
    if (bee.reactionTimer) window.clearTimeout(bee.reactionTimer);
    bee.reactionTimer = window.setTimeout(() => {
      setBeeAngry(bee, false);
      bee.reactionTimer = 0;
    }, 1000);
  }

  function createBeeHitTarget(bee, index) {
    const target = document.createElement('button');
    target.type = 'button';
    target.className = 'jar-bee-hit-target';
    target.setAttribute('aria-label', `Пчела ${index + 1}. Четыре нажатия — и она исчезнет`);
    target.title = 'Нажми на пчелу 4 раза, чтобы она испарилась';
    target.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      reactToJarBee(bee);
    });
    interactionLayer.appendChild(target);
    bee.hitTarget = target;
  }

  // Measure the jar image in viewport coordinates because the bee canvas is
  // fixed to the viewport. object-fit:contain is accounted for explicitly.
  function measureLayout() {
    const imageRect = image.getBoundingClientRect();
    const naturalWidth = Math.max(1, image.naturalWidth || imageRect.width);
    const naturalHeight = Math.max(1, image.naturalHeight || imageRect.height);
    const fit = Math.min(
      imageRect.width / naturalWidth,
      imageRect.height / naturalHeight
    );
    const contentWidth = Math.max(1, naturalWidth * fit);
    const contentHeight = Math.max(1, naturalHeight * fit);
    const imageLeft = imageRect.left + (imageRect.width - contentWidth) / 2;
    const imageTop = imageRect.top + (imageRect.height - contentHeight) / 2;
    const imageSize = Math.min(contentWidth, contentHeight);
    const capX = imageLeft + contentWidth * 0.5;
    const capTop = imageTop + contentHeight * 0.035;

    return {
      width: Math.max(1, window.innerWidth),
      height: Math.max(1, window.innerHeight),
      imageSize,
      capX,
      // Orbit stays attached to the upper rim of the lid at every breakpoint.
      orbitY: capTop + contentHeight * 0.012,
      radiusX: contentWidth * 0.305,
      radiusY: contentHeight * 0.042
    };
  }

  function updateFallbackLayout() {
    if (!fallback || !layout) return;
    const positions = [
      { x: layout.capX - layout.radiusX * 0.92, y: layout.orbitY - layout.radiusY * 0.38 },
      { x: layout.capX + layout.radiusX * 0.88, y: layout.orbitY + layout.radiusY * 0.34 },
      { x: layout.capX - layout.radiusX * 0.12, y: layout.orbitY - layout.radiusY * 1.18 },
      { x: layout.capX + layout.radiusX * 0.34, y: layout.orbitY + layout.radiusY * 1.02 },
      { x: layout.capX - layout.radiusX * 0.58, y: layout.orbitY + layout.radiusY * 0.82 },
      { x: layout.capX + layout.radiusX * 0.62, y: layout.orbitY - layout.radiusY * 0.92 },
      { x: layout.capX + layout.radiusX * 0.08, y: layout.orbitY + layout.radiusY * 0.08 }
    ];
    const size = clamp(layout.imageSize * 0.047, 25, 43);
    fallback.querySelectorAll('img').forEach((bee, index) => {
      const point = positions[index] || positions[0];
      bee.style.left = `${point.x}px`;
      bee.style.top = `${point.y}px`;
      bee.style.width = `${size}px`;
    });
  }

  let scrollLayoutFrame = 0;
  function scheduleScrollLayout() {
    if (scrollLayoutFrame) return;
    scrollLayoutFrame = requestAnimationFrame(() => {
      scrollLayoutFrame = 0;
      resizeScene();
    });
  }

  function resizeScene() {
    // Reposition the loading/failure sprites even before WebGL has finished loading.
    layout = measureLayout();
    updateFallbackLayout();
    if (!renderer || !camera) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    renderer.setSize(layout.width, layout.height, false);
    camera.left = -layout.width / 2;
    camera.right = layout.width / 2;
    camera.top = layout.height / 2;
    camera.bottom = -layout.height / 2;
    camera.updateProjectionMatrix();
    if (staticRender) renderStatic();
  }

  // Slow, imperfect loops with a little drift and changing speed — not rigid circles.
  function flightPosition(bee, seconds, currentLayout) {
    const cfg = bee.config;
    const phase = seconds * cfg.speed + cfg.phase
      + Math.sin(seconds * 0.42 + cfg.phase) * 0.13;
    const rx = currentLayout.radiusX * cfg.radiusX;
    const ry = currentLayout.radiusY * cfg.radiusY;
    const x = currentLayout.capX
      + Math.sin(phase) * rx
      + Math.sin(phase * 2.15 + cfg.phase) * rx * 0.075;
    const y = currentLayout.orbitY
      + Math.sin(phase * 1.72 + cfg.phase * 0.8) * ry
      + Math.cos(seconds * 0.58 + cfg.phase) * ry * 0.22;
    const z = cfg.depth + Math.sin(phase * 0.9 + cfg.phase) * 5;
    return { x, y, z };
  }

  function placeBee(bee, seconds, delta) {
    const p = flightPosition(bee, seconds, layout);
    const sample = 0.045;
    const before = flightPosition(bee, Math.max(0, seconds - sample), layout);
    const after = flightPosition(bee, seconds + sample, layout);

    bee.root.position.set(
      p.x - layout.width / 2,
      layout.height / 2 - p.y,
      p.z
    );

    if (bee.hitTarget) {
      bee.hitTarget.style.left = `${p.x}px`;
      bee.hitTarget.style.top = `${p.y}px`;
    }
    direction.set(
      after.x - before.x,
      -(after.y - before.y),
      after.z - before.z
    );
    if (direction.lengthSq() < 0.00001) direction.set(1, 0, 0);
    direction.normalize();

    targetQuaternion.setFromUnitVectors(localForward, direction);

    const headingBefore = Math.atan2(-(p.y - before.y), p.x - before.x);
    const headingAfter = Math.atan2(-(after.y - p.y), after.x - p.x);
    const turn = Math.atan2(
      Math.sin(headingAfter - headingBefore),
      Math.cos(headingAfter - headingBefore)
    );
    const bank = clamp(turn * 0.8, -0.24, 0.24);
    rollQuaternion.setFromAxisAngle(localForward, bank);
    targetQuaternion.multiply(rollQuaternion);
    bee.root.quaternion.slerp(targetQuaternion, 1 - Math.exp(-Math.max(delta, 0.001) * 6.5));

    const breathing = reducedMotion ? 1 : 1 + Math.sin(seconds * 2.1 + bee.phase) * 0.018;
    bee.root.scale.setScalar(bee.baseScale * breathing);
    bee.wings.forEach(({ pivot, side }) => {
      pivot.rotation.z = reducedMotion ? 0 : Math.sin(seconds * 49 + bee.phase) * 0.48 * side;
    });
  }

  function renderStatic() {
    if (!renderer || !layout) return;
    bees.forEach((bee) => placeBee(bee, 0, 1 / 60));
    renderer.render(scene, camera);
  }

  function stopLoop() {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
  }

  function animate(now) {
    animationFrame = 0;
    if (!renderer || !inView || document.hidden) return;
    const seconds = (now - startTime) / 1000;
    const delta = Math.min(0.05, Math.max(0.001, (now - previousTime) / 1000));
    previousTime = now;
    bees.forEach((bee) => placeBee(bee, seconds, delta));
    renderer.render(scene, camera);
    if (!reducedMotion) animationFrame = requestAnimationFrame(animate);
  }

  function startLoop() {
    if (!renderer || animationFrame || !inView || document.hidden) return;
    if (reducedMotion) {
      staticRender = true;
      renderStatic();
      return;
    }
    previousTime = performance.now();
    animationFrame = requestAnimationFrame(animate);
  }

  function showFallback(error) {
    console.warn('HoneyVine jar bee animation unavailable; using lightweight fallback.', error);
    visual.classList.remove('is-jar-bee-loading');
    visual.classList.add('has-jar-bee-fallback');
    fallback?.classList.add('is-active');
    bindFallbackBeeInteractions();
    bees.forEach((bee) => {
      if (bee.hitTarget) bee.hitTarget.hidden = true;
    });
    updateFallbackLayout();
    stopLoop();
    if (renderer) {
      renderer.dispose();
      renderer = null;
    }
  }

  async function initialize() {
    if (started) return;
    started = true;
    try {
      layout = measureLayout();
      updateFallbackLayout();
      if (!image.complete && image.decode) await image.decode();
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(new URL('./assets/bee.glb', import.meta.url).href);

      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power',
        premultipliedAlpha: false
      });
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;

      scene = new THREE.Scene();
      layout = measureLayout();
      camera = new THREE.OrthographicCamera(
        -layout.width / 2,
        layout.width / 2,
        layout.height / 2,
        -layout.height / 2,
        0.1,
        1000
      );
      camera.position.set(0, 0, 500);
      camera.lookAt(0, 0, 0);

      scene.add(new THREE.HemisphereLight(0xfff7df, 0x74431e, 2.2));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
      keyLight.position.set(-120, 150, 220);
      scene.add(keyLight);
      const warmFill = new THREE.DirectionalLight(0xffd16a, 0.85);
      warmFill.position.set(130, -80, 160);
      scene.add(warmFill);

      const template = makeTemplate(gltf.scene);
      // Seven bees use independent speeds, directions, depths and orbit widths.
      // The mixed clockwise/counter-clockwise paths create a lively but uncluttered swarm.
      const configs = [
        { phase: 0.45, speed: 0.43, radiusX: 1.00, radiusY: 0.88, size: 0.96, depth: 12 },
        { phase: 2.65, speed: -0.34, radiusX: 0.78, radiusY: 1.12, size: 0.88, depth: 4 },
        { phase: 4.75, speed: 0.28, radiusX: 1.12, radiusY: 0.72, size: 0.84, depth: -5 },
        { phase: 1.62, speed: -0.52, radiusX: 0.92, radiusY: 1.30, size: 0.82, depth: 16 },
        { phase: 3.78, speed: 0.37, radiusX: 1.24, radiusY: 0.66, size: 0.80, depth: -12 },
        { phase: 5.54, speed: -0.25, radiusX: 0.68, radiusY: 1.42, size: 0.76, depth: 8 },
        { phase: 2.08, speed: 0.58, radiusX: 1.32, radiusY: 0.98, size: 0.74, depth: -16 }
      ];
      const modelScale = clamp(layout.imageSize * 0.066, 21, 34);
      configs.forEach((config, index) => {
        const bee = makeBee(template, config);
        bee.baseScale = modelScale * config.size;
        bees.push(bee);
        scene.add(bee.root);
        createBeeHitTarget(bee, index);
      });

      resizeScene();
      resizeObserver?.observe(visual);
      window.addEventListener('resize', resizeScene, { passive: true });
      window.addEventListener('scroll', scheduleScrollLayout, { passive: true });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopLoop();
        else startLoop();
      });
      if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
          inView = entries[0]?.isIntersecting ?? true;
          if (inView) startLoop();
          else stopLoop();
        }, { threshold: 0.01 });
        observer.observe(visual);
      }
      startTime = performance.now();
      previousTime = startTime;
      bees.forEach((bee) => placeBee(bee, 0, 1 / 60));
      renderer.render(scene, camera);
      visual.classList.remove('is-jar-bee-loading');
      fallback?.classList.remove('is-active');
      startLoop();
    } catch (error) {
      showFallback(error);
    }
  }

  // Start the three 3D bees around the jar immediately on page entry.
  // They run concurrently with the independent edge-to-edge intro fly-by.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
}
