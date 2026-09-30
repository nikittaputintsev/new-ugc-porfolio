const THREE = window.THREE;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function initPaperCrumple(root) {
  const src = root.dataset.src;
  const width = Number(root.dataset.width) || 320;
  const height = Number(root.dataset.height) || 400;
  const crumpleAmount = Number(root.dataset.crumpleAmount) || 0.85;
  const crumpleDuration = Number(root.dataset.crumpleDuration) || 0.55;
  const releaseDuration = Number(root.dataset.releaseDuration) || 0.4;
  const image = root.querySelector('.paper-crumple-fallback');
  const canvas = root.querySelector('.paper-crumple-canvas');
  const hit = root.querySelector('.paper-crumple-hit');
  const status = root.querySelector('.paper-crumple-sr');
  if (!THREE) {
    status.textContent = 'Interactive paper unavailable. Showing the original image.';
    return;
  }
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const aspect = height / width;
  const gridX = 30;
  const gridY = Math.round(gridX * aspect);
  const geometry = new THREE.PlaneGeometry(1, aspect, gridX, gridY);
  const position = geometry.attributes.position;
  const original = new Float32Array(position.array);
  const phases = Array.from({ length: position.count }, (_, index) => (index * 1.61803398875) % (Math.PI * 2));
  let renderer;
  let texture;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (error) {
    status.textContent = 'Interactive paper unavailable. Showing the original image.';
    return;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.z = 3.25;
  const ambient = new THREE.HemisphereLight(0xffffff, 0xaaa0a0, 1.5);
  const key = new THREE.DirectionalLight(0xfff5e8, 2.2);
  key.position.set(-1.5, 2.2, 4);
  scene.add(ambient, key);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const sheet = new THREE.Mesh(geometry, material);
  sheet.castShadow = true;
  scene.add(sheet);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  let current = 0;
  let target = 0;
  let x = 0;
  let y = 0;
  let targetX = 0;
  let targetY = 0;
  let held = false;
  let ready = false;
  let pointerId = null;
  let lastTime = performance.now();
  let frame = 0;
  let stageWidth = 1;
  let stageHeight = 1;

  function deform(amount) {
    const fold = clamp(amount, 0, 1);
    const squeeze = 1 - fold * 0.68;
    const wrinkle = fold * 0.09;
    for (let index = 0; index < position.count; index += 1) {
      const offset = index * 3;
      const ox = original[offset];
      const oy = original[offset + 1];
      const edge = Math.max(Math.abs(ox) * 2, Math.abs(oy / aspect) * 2);
      const waveA = Math.sin(ox * 30 + phases[index]) * Math.cos(oy * 24 - phases[index] * 0.7);
      const waveB = Math.sin((ox + oy) * 48 + phases[index] * 1.7);
      const pinch = 1 - fold * 0.18 * (1 - Math.min(1, edge));
      position.array[offset] = ox * squeeze * pinch;
      position.array[offset + 1] = oy * squeeze * pinch;
      position.array[offset + 2] = (waveA * wrinkle + waveB * wrinkle * 0.45) * (1 - edge * 0.35);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
  }

  function resize() {
    const rect = root.getBoundingClientRect();
    stageWidth = Math.max(1, rect.width);
    stageHeight = Math.max(1, rect.height);
    camera.aspect = stageWidth / stageHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(stageWidth, stageHeight, false);
    const fit = Math.min(1.45, stageHeight / (aspect * 1.65), stageWidth / 1.65);
    sheet.scale.set(fit, fit, fit);
  }

  function animate(time) {
    frame = requestAnimationFrame(animate);
    const dt = Math.min(0.04, Math.max(0.001, (time - lastTime) / 1000));
    lastTime = time;
    const duration = held ? crumpleDuration : releaseDuration;
    const blend = reduced.matches ? 1 : 1 - Math.exp(-dt / Math.max(0.06, duration));
    current += (target - current) * blend;
    x += (targetX - x) * Math.min(1, dt * 12);
    y += (targetY - y) * Math.min(1, dt * 12);
    deform(current);
    sheet.position.set(x, y, 0);
    sheet.rotation.x = held ? clamp((targetY - y) * -0.012, -0.16, 0.16) : sheet.rotation.x * 0.88;
    sheet.rotation.y = held ? clamp((targetX - x) * 0.012, -0.16, 0.16) : sheet.rotation.y * 0.88;
    renderer.render(scene, camera);
  }

  function finish() {
    held = false;
    target = 0;
    targetX = 0;
    targetY = 0;
    hit.dataset.held = 'false';
    hit.setAttribute('aria-pressed', 'false');
    if (pointerId !== null && hit.hasPointerCapture(pointerId)) hit.releasePointerCapture(pointerId);
    pointerId = null;
  }

  function pointerDown(event) {
    if (!ready || event.button !== 0 || !event.isPrimary) return;
    event.preventDefault();
    held = true;
    pointerId = event.pointerId;
    hit.setPointerCapture(pointerId);
    hit.dataset.held = 'true';
    hit.setAttribute('aria-pressed', 'true');
    target = clamp(crumpleAmount, 0, 1);
  }

  function pointerMove(event) {
    if (!held || event.pointerId !== pointerId) return;
    const rect = root.getBoundingClientRect();
    targetX = clamp((event.clientX - rect.left - stageWidth / 2) * 0.004, -0.65, 0.65);
    targetY = clamp((stageHeight / 2 - (event.clientY - rect.top)) * 0.004, -0.65, 0.65);
  }

  function keyDown(event) {
    if (!ready) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      finish();
    } else if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      held = true;
      target = clamp(crumpleAmount, 0, 1);
      hit.dataset.held = 'true';
      hit.setAttribute('aria-pressed', 'true');
    }
  }

  function keyUp(event) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      finish();
    }
  }

  hit.addEventListener('pointerdown', pointerDown);
  hit.addEventListener('pointermove', pointerMove);
  hit.addEventListener('pointerup', finish);
  hit.addEventListener('pointercancel', finish);
  hit.addEventListener('keydown', keyDown);
  hit.addEventListener('keyup', keyUp);
  window.addEventListener('resize', resize);
  resize();
  deform(0);

  const loader = new THREE.TextureLoader();
  loader.load(src, loaded => {
    texture = loaded;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    material.map = texture;
    material.needsUpdate = true;
    ready = true;
    root.dataset.status = 'ready';
    hit.disabled = false;
    canvas.style.visibility = 'visible';
    image.style.visibility = 'hidden';
    status.textContent = 'Interactive paper ready. Hold and drag the image to crumple it.';
  }, undefined, () => {
    root.dataset.status = 'error';
    status.textContent = 'Interactive paper unavailable. Showing the original image.';
  });

  animate(lastTime);
  root._paperCleanup = () => {
    cancelAnimationFrame(frame);
    window.removeEventListener('resize', resize);
    geometry.dispose();
    material.dispose();
    texture?.dispose();
    renderer.dispose();
  };
}

document.querySelectorAll('[data-paper-crumple]').forEach(initPaperCrumple);
