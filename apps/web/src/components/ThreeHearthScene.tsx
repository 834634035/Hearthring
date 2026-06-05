import { useEffect, useRef } from "react";

export function ThreeHearthScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    const threeModuleUrl = "https://esm.sh/three@0.176.0";

    void import(/* @vite-ignore */ threeModuleUrl).then((THREE) => {
      if (disposed) return;
      cleanup = mountScene(THREE, mount);
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return <div className="three-scene" ref={mountRef} />;
}

function mountScene(THREE: any, mount: HTMLDivElement) {
  const disposables: Array<{ dispose?: () => void }> = [];

  const scene = new THREE.Scene();
  const atmosphereColor = 0x081018;
  scene.background = new THREE.Color(atmosphereColor);
  scene.fog = new THREE.FogExp2(0x0a1520, 0.056);

  const lookTarget = new THREE.Vector3(0, 1.38, -0.12);
  const camera = new THREE.PerspectiveCamera(52, mount.clientWidth / mount.clientHeight, 0.1, 100);
  camera.position.set(-1.42, 0.26, 7.55);
  camera.lookAt(lookTarget);

  const cameraDefaults = {
    posX: -1.42,
    posY: 0.26,
    posZ: 7.55,
    targetX: 0,
    targetY: 1.38,
    targetZ: -0.12,
    fov: 52
  };

  let sceneDisposed = false;
  let debugGui: { destroy: () => void } | undefined;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  mount.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0x3a5060, 0.26);
  scene.add(ambient);

  const moonLight = new THREE.DirectionalLight(0x9ab8d0, 0.2);
  moonLight.position.set(5, 14, -8);
  scene.add(moonLight);

  const fireSkyGlow = new THREE.HemisphereLight(0xffb870, 0x142028, 0.16);
  scene.add(fireSkyGlow);

  createStarfield(THREE, scene, disposables);

  // 火塘整体下移，在画面中更靠下
  const hearthYOffset = -0.85;
  const hearthGroup = new THREE.Group();
  hearthGroup.position.y = hearthYOffset;
  scene.add(hearthGroup);

  const fireLight = new THREE.PointLight(0xff8a40, 24, 18);
  fireLight.position.set(0, 1.1, 0);
  hearthGroup.add(fireLight);

  const fireWarmth = new THREE.PointLight(0xff6020, 8, 9);
  fireWarmth.position.set(0, 0.35, 0.4);
  hearthGroup.add(fireWarmth);

  const rimLight = new THREE.DirectionalLight(0x2a4550, 0.28);
  rimLight.position.set(-3, 4, -4);
  scene.add(rimLight);

  createDistantMountains(THREE, scene, disposables);

  const swaying: Array<{ group: any; phase: number; speed: number; sway: number }> = [];

  const treePositions = [
    { x: -9.5, z: -5.8, scale: 3.4 },
    { x: -7.0, z: -7.2, scale: 2.9 },
    { x: -4.8, z: -8.5, scale: 2.5 },
    { x: -2.2, z: -9.0, scale: 2.1 },
    { x: 0.5, z: -9.2, scale: 2.3 },
    { x: 3.2, z: -8.6, scale: 2.7 },
    { x: 5.8, z: -7.8, scale: 3.1 },
    { x: 8.2, z: -6.5, scale: 3.5 },
    { x: 10.5, z: -4.8, scale: 2.6 },
    { x: -10.8, z: -3.5, scale: 2.2 },
    { x: 9.8, z: -3.2, scale: 2.4 },
    { x: -6.5, z: -5.0, scale: 1.9 },
    { x: 6.8, z: -4.6, scale: 2.0 }
  ];
  for (const cfg of treePositions) {
    const tree = createTreeSilhouette(THREE, cfg.scale, cfg.z);
    tree.group.position.set(cfg.x, 0, cfg.z);
    swaying.push({
      group: tree.group,
      phase: Math.random() * Math.PI * 2,
      speed: 0.35 + Math.random() * 0.35,
      sway: 0.012 + Math.random() * 0.015
    });
    scene.add(tree.group);
    disposables.push(...tree.disposables);
  }

  const bushPositions = [
    { x: -5.5, z: -4.2, scale: 1.1 },
    { x: -3.8, z: -5.5, scale: 0.9 },
    { x: -1.5, z: -6.0, scale: 1.0 },
    { x: 1.8, z: -5.8, scale: 1.05 },
    { x: 4.2, z: -5.0, scale: 0.95 },
    { x: 5.8, z: -4.0, scale: 1.15 },
    { x: -7.2, z: -3.2, scale: 0.85 },
    { x: 7.5, z: -3.0, scale: 0.9 },
    { x: -2.8, z: -4.5, scale: 0.75 },
    { x: 3.0, z: -4.3, scale: 0.8 },
    { x: -9.0, z: -2.5, scale: 1.0 },
    { x: 9.2, z: -2.2, scale: 1.05 },
    { x: -4.5, z: -3.5, scale: 0.7 },
    { x: 4.8, z: -3.4, scale: 0.72 }
  ];
  for (const cfg of bushPositions) {
    const bush = createBushSilhouette(THREE, cfg.scale, cfg.z);
    bush.group.position.set(cfg.x, 0, cfg.z);
    swaying.push({
      group: bush.group,
      phase: Math.random() * Math.PI * 2,
      speed: 0.45 + Math.random() * 0.4,
      sway: 0.018 + Math.random() * 0.02
    });
    scene.add(bush.group);
    disposables.push(...bush.disposables);
  }

  // 暗处野兽双眼：被火光驱赶，只在极远处偶尔一闪即退
  const beastEyes: Array<{
    left: any;
    right: any;
    cycleDuration: number;
    cycleOffset: number;
    visibleDuration: number;
    phase: number;
  }> = [];
  const eyeSlots = [
    { x: -9.5, y: 0.52, z: -9.2, color: 0xccaa55, spacing: 0.2 },
    { x: 7.2, y: 0.46, z: -9.8, color: 0x88bb66, spacing: 0.18 },
    { x: -4.2, y: 0.4, z: -10.5, color: 0xddbb66, spacing: 0.16 }
  ];
  for (const [index, cfg] of eyeSlots.entries()) {
    const eyes = createBeastEyes(THREE, cfg.color, cfg.spacing, disposables);
    eyes.group.position.set(cfg.x, cfg.y, cfg.z);
    eyes.group.lookAt(0, 0.2, 0);
    scene.add(eyes.group);
    beastEyes.push({
      left: eyes.left,
      right: eyes.right,
      cycleDuration: 38 + index * 8 + Math.random() * 10,
      cycleOffset: index * 14 + Math.random() * 8,
      visibleDuration: 1.4 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2
    });
    eyes.left.material.opacity = 0;
    eyes.right.material.opacity = 0;
  }

  // 树上猫头鹰：明亮双眼，安静守望夏夜
  const owls: Array<{
    left: any;
    right: any;
    leftGlow: any;
    rightGlow: any;
    group: any;
    blinkOffset: number;
    blinkInterval: number;
    phase: number;
  }> = [];
  const owlSlots = [
    { x: -7.0, y: 3.35, z: -7.2, spacing: 0.15, rotY: 0.35 },
    { x: 5.8, y: 3.85, z: -7.8, spacing: 0.14, rotY: -0.45 },
    { x: -2.2, y: 2.75, z: -9.0, spacing: 0.13, rotY: 0.15 },
    { x: 8.2, y: 3.1, z: -6.5, spacing: 0.14, rotY: -0.25 }
  ];
  for (const cfg of owlSlots) {
    const owl = createOwlSilhouette(THREE, cfg.spacing, disposables);
    owl.group.position.set(cfg.x, cfg.y, cfg.z);
    owl.group.rotation.y = cfg.rotY;
    scene.add(owl.group);
    owls.push({
      left: owl.left,
      right: owl.right,
      leftGlow: owl.leftGlow,
      rightGlow: owl.rightGlow,
      group: owl.group,
      blinkOffset: Math.random() * 6,
      blinkInterval: 5.5 + Math.random() * 4,
      phase: Math.random() * Math.PI * 2
    });
  }

  createGatheringSeats(THREE, scene, disposables);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(5.2, 72),
    new THREE.MeshStandardMaterial({ color: 0x152420, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.001;
  hearthGroup.add(ground);
  disposables.push(ground.geometry, ground.material);

  createGroundPatterns(THREE, hearthGroup, disposables);
  createStoneRing(THREE, hearthGroup, disposables);
  createScatteredGravel(THREE, hearthGroup, disposables);
  createHearthDecor(THREE, hearthGroup, disposables);

  const flameGroup = new THREE.Group();
  const flameLayers: Array<{ mesh: any; baseX: number; baseZ: number; phase: number; speed: number }> = [];

  const flameBaseY = 0.08;
  const mainOuter = createFlameMesh(THREE, 0.95, 3.2, 0xff5a18, 0xff3a10, 1.6, 0.78, disposables);
  mainOuter.position.y = flameBaseY;
  flameGroup.add(mainOuter);

  const mainInner = createFlameMesh(THREE, 0.52, 2.3, 0xffe8b0, 0xffb040, 2.0, 0.88, disposables);
  mainInner.position.y = flameBaseY;
  flameGroup.add(mainInner);

  const mainCore = createFlameMesh(THREE, 0.28, 1.5, 0xffffff, 0xffeeaa, 2.2, 0.92, disposables);
  mainCore.position.y = flameBaseY;
  flameGroup.add(mainCore);

  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
    const radius = 0.18 + Math.random() * 0.22;
    const flameH = 1.1 + Math.random() * 1.4;
    const mesh = createFlameMesh(
      THREE,
      0.22 + Math.random() * 0.18,
      flameH,
      0xff6820,
      0xff4010,
      1.4 + Math.random() * 0.6,
      0.65 + Math.random() * 0.2,
      disposables
    );
    mesh.position.set(Math.cos(angle) * radius, 0.06, Math.sin(angle) * radius);
    mesh.rotation.y = angle;
    flameGroup.add(mesh);
    flameLayers.push({
      mesh,
      baseX: mesh.position.x,
      baseZ: mesh.position.z,
      phase: Math.random() * Math.PI * 2,
      speed: 1.6 + Math.random() * 1.4
    });
  }
  hearthGroup.add(flameGroup);
  flameGroup.renderOrder = 10;
  for (const child of flameGroup.children) {
    child.renderOrder = 10;
  }

  const ashCount = 48;
  const ashPositions = new Float32Array(ashCount * 3);
  const ashData: Array<{
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    maxLife: number;
    drift: number;
  }> = [];

  for (let i = 0; i < ashCount; i += 1) {
    const particle = spawnAshParticle(true);
    ashData.push(particle);
    ashPositions[i * 3] = particle.x;
    ashPositions[i * 3 + 1] = particle.y;
    ashPositions[i * 3 + 2] = particle.z;
  }

  const ashGeometry = new THREE.BufferGeometry();
  ashGeometry.setAttribute("position", new THREE.BufferAttribute(ashPositions, 3));
  disposables.push(ashGeometry);

  const ashMaterial = new THREE.PointsMaterial({
    color: 0xffcc88,
    size: 0.09,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });
  disposables.push(ashMaterial);

  const ashPoints = new THREE.Points(ashGeometry, ashMaterial);
  hearthGroup.add(ashPoints);

  const fireflyCount = 52;
  const fireflyPositions = new Float32Array(fireflyCount * 3);
  const fireflyData: Array<{
    x: number;
    y: number;
    z: number;
    phase: number;
    speed: number;
    radius: number;
    centerX: number;
    centerZ: number;
  }> = [];
  for (let i = 0; i < fireflyCount; i += 1) {
    const centerX = (Math.random() - 0.5) * 18;
    const centerZ = -3.5 - Math.random() * 5.5;
    const particle = {
      x: centerX + (Math.random() - 0.5) * 2,
      y: 0.35 + Math.random() * 2.2,
      z: centerZ + (Math.random() - 0.5) * 2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.25 + Math.random() * 0.35,
      radius: 0.15 + Math.random() * 0.35,
      centerX,
      centerZ
    };
    fireflyData.push(particle);
    fireflyPositions[i * 3] = particle.x;
    fireflyPositions[i * 3 + 1] = particle.y;
    fireflyPositions[i * 3 + 2] = particle.z;
  }
  const fireflyGeometry = new THREE.BufferGeometry();
  fireflyGeometry.setAttribute("position", new THREE.BufferAttribute(fireflyPositions, 3));
  disposables.push(fireflyGeometry);
  const fireflyMaterial = new THREE.PointsMaterial({
    color: 0xc8ee88,
    size: 0.07,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  });
  disposables.push(fireflyMaterial);
  const fireflies = new THREE.Points(fireflyGeometry, fireflyMaterial);
  scene.add(fireflies);

  function spawnAshParticle(randomY = false) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 0.55;
    return {
      x: Math.cos(angle) * radius,
      y: randomY ? 0.05 + Math.random() * 1.8 : 0.06 + Math.random() * 0.15,
      z: Math.sin(angle) * radius,
      vx: (Math.random() - 0.5) * 0.012,
      vy: 0.012 + Math.random() * 0.018,
      vz: (Math.random() - 0.5) * 0.012,
      life: 0,
      maxLife: 2.5 + Math.random() * 2.5,
      drift: Math.random() * Math.PI * 2
    };
  }

  const shardMaterial = new THREE.MeshStandardMaterial({
    color: 0xdfe9d0,
    emissive: 0x8faf9f,
    emissiveIntensity: 0.55,
    roughness: 0.35
  });
  disposables.push(shardMaterial);
  const shards: any[] = [];
  for (let i = 0; i < 9; i += 1) {
    const angle = (i / 9) * Math.PI * 2;
    if (Math.abs(Math.sin(angle)) < 0.55 && Math.cos(angle) > 0) continue;
    const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.16 + i * 0.01, 0), shardMaterial);
    shard.position.set(Math.cos(angle) * 2.6, 0.06, Math.sin(angle) * 2.6);
    shards.push(shard);
    hearthGroup.add(shard);
    disposables.push(shard.geometry);
  }

  let frame = 0;
  const animate = () => {
    frame += 0.016;

    const pulse = 1 + Math.sin(frame * 2.4) * 0.04;
    mainOuter.scale.set(pulse * 1.01, pulse * (1 + Math.cos(frame * 1.8) * 0.06), pulse);
    mainInner.scale.set(1 + Math.sin(frame * 3) * 0.03, 1 + Math.cos(frame * 2.2) * 0.05, 1);
    mainCore.scale.set(1 + Math.sin(frame * 3.5) * 0.03, 1 + Math.cos(frame * 2.6) * 0.04, 1);

    for (const layer of flameLayers) {
      const wobble = Math.sin(frame * layer.speed + layer.phase);
      layer.mesh.position.x = layer.baseX + wobble * 0.04;
      layer.mesh.position.z = layer.baseZ + Math.cos(frame * layer.speed * 0.8 + layer.phase) * 0.04;
      layer.mesh.scale.y = 1 + Math.sin(frame * layer.speed * 1.2 + layer.phase) * 0.1;
      layer.mesh.rotation.z = wobble * 0.08;
    }

    fireLight.intensity = 22 + Math.sin(frame * 3) * 2.5;
    fireLight.position.y = 1.05 + Math.sin(frame * 2.4) * 0.04;
    fireWarmth.intensity = 7 + Math.sin(frame * 2.8) * 1.2;

    for (const item of swaying) {
      const wind = Math.sin(frame * item.speed + item.phase);
      item.group.rotation.z = wind * item.sway;
      item.group.rotation.x = Math.sin(frame * item.speed * 0.7 + item.phase) * item.sway * 0.35;
    }

    // 兽眼：远处偶尔窥探，被火光惊退
    const eyeVisibilities = beastEyes.map((eyes) => {
      const cycleTime = (frame + eyes.cycleOffset) % eyes.cycleDuration;
      const fade = 0.7;
      const holdStart = eyes.cycleDuration * 0.08;
      const holdEnd = holdStart + eyes.visibleDuration;
      if (cycleTime < holdStart || cycleTime > holdEnd) return 0;
      const local = cycleTime - holdStart;
      const total = holdEnd - holdStart;
      if (local < fade) return (local / fade) ** 1.4;
      if (local > total - fade) return ((total - local) / fade) ** 2.2;
      return 1;
    });

    const allowedIndices = new Set(
      eyeVisibilities
        .map((visibility, index) => ({ visibility, index }))
        .filter((item) => item.visibility > 0.04)
        .sort((a, b) => b.visibility - a.visibility)
        .slice(0, 1)
        .map((item) => item.index)
    );

    beastEyes.forEach((eyes, index) => {
      let visibility = allowedIndices.has(index) ? eyeVisibilities[index] : 0;
      if (visibility <= 0) {
        eyes.left.material.opacity = 0;
        eyes.right.material.opacity = 0;
        eyes.left.scale.y = 1;
        eyes.right.scale.y = 1;
        return;
      }

      const glow = 0.35 + Math.sin(frame * 2.2 + eyes.phase) * 0.06;
      const cycleTime = (frame + eyes.cycleOffset) % eyes.cycleDuration;
      const holdStart = eyes.cycleDuration * 0.08;
      const local = cycleTime - holdStart;
      const blink = local > 0.6 && local < 0.72;
      const opacity = visibility * glow * (blink ? 0.15 : 1);
      const scaleY = blink ? 0.08 : 1;

      eyes.left.material.opacity = opacity;
      eyes.right.material.opacity = opacity;
      eyes.left.scale.y = scaleY;
      eyes.right.scale.y = scaleY;
    });

    // 猫头鹰：明亮双眼，缓慢眨动与微光
    for (const owl of owls) {
      const blinkCycle = (frame + owl.blinkOffset) % owl.blinkInterval;
      const blinking = blinkCycle > owl.blinkInterval - 0.18 && blinkCycle < owl.blinkInterval - 0.05;
      const eyeGlow = 0.82 + Math.sin(frame * 1.2 + owl.phase) * 0.1;
      const glowScale = 1 + Math.sin(frame * 0.9 + owl.phase) * 0.12;
      const eyeScaleY = blinking ? 0.06 : 1;
      const eyeOpacity = blinking ? 0.35 : eyeGlow;

      owl.left.material.opacity = eyeOpacity;
      owl.right.material.opacity = eyeOpacity;
      owl.left.scale.y = eyeScaleY;
      owl.right.scale.y = eyeScaleY;
      owl.leftGlow.material.opacity = eyeOpacity * 0.45;
      owl.rightGlow.material.opacity = eyeOpacity * 0.45;
      owl.leftGlow.scale.set(glowScale, glowScale, glowScale);
      owl.rightGlow.scale.set(glowScale, glowScale, glowScale);
      owl.group.rotation.z = Math.sin(frame * 0.35 + owl.phase) * 0.015;
    }

    for (let i = 0; i < fireflyCount; i += 1) {
      const p = fireflyData[i];
      p.phase += 0.016 * p.speed;
      p.x = p.centerX + Math.sin(p.phase) * p.radius;
      p.y += Math.sin(p.phase * 1.3) * 0.0008;
      p.z = p.centerZ + Math.cos(p.phase * 0.85) * p.radius;
      fireflyPositions[i * 3] = p.x;
      fireflyPositions[i * 3 + 1] = p.y;
      fireflyPositions[i * 3 + 2] = p.z;
    }
    fireflyGeometry.attributes.position.needsUpdate = true;
    fireflyMaterial.opacity = 0.48 + Math.sin(frame * 1.6) * 0.12;

    for (let i = 0; i < ashCount; i += 1) {
      const p = ashData[i];
      p.life += 0.016;
      p.x += p.vx + Math.sin(frame * 2 + p.drift) * 0.004;
      p.y += p.vy;
      p.z += p.vz + Math.cos(frame * 1.8 + p.drift) * 0.004;

      if (p.life >= p.maxLife || p.y > 5.5) {
        const next = spawnAshParticle();
        ashData[i] = next;
        p.x = next.x;
        p.y = next.y;
        p.z = next.z;
      }

      ashPositions[i * 3] = p.x;
      ashPositions[i * 3 + 1] = p.y;
      ashPositions[i * 3 + 2] = p.z;
    }
    ashGeometry.attributes.position.needsUpdate = true;
    ashMaterial.opacity = 0.42 + Math.sin(frame * 3) * 0.08;

    shards.forEach((shard, index) => {
      shard.rotation.y += 0.004 + index * 0.0004;
      shard.position.y = 0.06 + Math.sin(frame * 0.9 + index) * 0.012;
    });

    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  };
  let animationFrame = 0;
  animate();

  const resize = () => {
    camera.aspect = mount.clientWidth / mount.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(mount.clientWidth, mount.clientHeight);
  };
  window.addEventListener("resize", resize);

  if (import.meta.env.DEV) {
    void import("../hearthCameraDebug.ts").then(({ attachHearthCameraGui }) => {
      if (sceneDisposed) return;
      debugGui = attachHearthCameraGui(camera, lookTarget, cameraDefaults);
    });
  }

  return () => {
    sceneDisposed = true;
    debugGui?.destroy();
    window.removeEventListener("resize", resize);
    cancelAnimationFrame(animationFrame);
    for (const item of disposables) {
      item.dispose?.();
    }
    renderer.dispose();
    if (renderer.domElement.parentElement === mount) {
      mount.removeChild(renderer.domElement);
    }
  };
}

function createStarfield(THREE: any, scene: any, disposables: Array<{ dispose?: () => void }>) {
  const count = 340;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.38;
    const radius = 52 + Math.random() * 18;
    positions[i * 3] = Math.cos(theta) * Math.sin(phi) * radius;
    positions[i * 3 + 1] = Math.cos(phi) * radius + 4;
    positions[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * radius - 18;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  disposables.push(geometry);
  const material = new THREE.PointsMaterial({
    color: 0xd8e8ff,
    size: 0.1,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    sizeAttenuation: true
  });
  disposables.push(material);
  scene.add(new THREE.Points(geometry, material));
}

function createGatheringSeats(THREE: any, scene: any, disposables: Array<{ dispose?: () => void }>) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.98 });
  const blanketMat = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.95 });
  disposables.push(woodMat, blanketMat);

  const seats = [
    { x: -3.7, z: 6.1, ry: 0.72, w: 0.82, h: 0.17, d: 0.3 },
    { x: 3.5, z: 6.3, ry: -0.62, w: 0.76, h: 0.16, d: 0.28 },
    { x: -4.3, z: 5.0, ry: 1.08, w: 0.66, h: 0.14, d: 0.25 },
    { x: 4.1, z: 4.9, ry: -1.0, w: 0.64, h: 0.14, d: 0.25 }
  ];
  for (const seat of seats) {
    const log = new THREE.Mesh(new THREE.BoxGeometry(seat.w, seat.h, seat.d), woodMat);
    log.position.set(seat.x, seat.h / 2, seat.z);
    log.rotation.y = seat.ry;
    scene.add(log);
    disposables.push(log.geometry);

    const pad = new THREE.Mesh(new THREE.BoxGeometry(seat.w * 0.82, 0.025, seat.d * 0.75), blanketMat);
    pad.position.set(seat.x, seat.h + 0.012, seat.z);
    pad.rotation.y = seat.ry;
    scene.add(pad);
    disposables.push(pad.geometry);
  }
}

function createOwlSilhouette(
  THREE: any,
  spacing: number,
  disposables: Array<{ dispose?: () => void }>
) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x050807, fog: false });
  disposables.push(bodyMat);

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bodyMat);
  body.scale.set(1.1, 0.85, 0.75);
  group.add(body);
  disposables.push(body.geometry);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bodyMat);
  head.position.y = 0.18;
  group.add(head);
  disposables.push(head.geometry);

  for (const side of [-1, 1]) {
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4), bodyMat);
    tuft.position.set(side * 0.08, 0.28, 0);
    tuft.rotation.z = side * 0.25;
    group.add(tuft);
    disposables.push(tuft.geometry);
  }

  const eyeGeo = new THREE.SphereGeometry(0.042, 8, 8);
  const glowGeo = new THREE.SphereGeometry(0.085, 8, 8);
  disposables.push(eyeGeo, glowGeo);

  const eyeMat = new THREE.MeshBasicMaterial({
    color: 0xffdd55,
    transparent: true,
    opacity: 0.92,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffcc44,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  disposables.push(eyeMat, glowMat);

  const left = new THREE.Mesh(eyeGeo, eyeMat);
  const right = new THREE.Mesh(eyeGeo, eyeMat.clone());
  const leftGlow = new THREE.Mesh(glowGeo, glowMat);
  const rightGlow = new THREE.Mesh(glowGeo, glowMat.clone());
  disposables.push(right.material, rightGlow.material);

  left.position.set(-spacing / 2, 0.19, 0.1);
  right.position.set(spacing / 2, 0.19, 0.1);
  leftGlow.position.copy(left.position);
  rightGlow.position.copy(right.position);

  group.add(leftGlow, rightGlow, left, right);
  return { group, left, right, leftGlow, rightGlow };
}

function createGroundPatterns(THREE: any, parent: any, disposables: Array<{ dispose?: () => void }>) {
  const lineMat = new THREE.MeshStandardMaterial({ color: 0x24302c, roughness: 1, metalness: 0 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0x3a4540, roughness: 0.95 });
  disposables.push(lineMat, accentMat);

  const rings = [
    { inner: 0.95, outer: 1.02 },
    { inner: 1.48, outer: 1.55 },
    { inner: 2.05, outer: 2.12 },
    { inner: 2.75, outer: 2.82 }
  ];
  for (const ring of rings) {
    const mesh = new THREE.Mesh(new THREE.RingGeometry(ring.inner, ring.outer, 64), lineMat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.008;
    parent.add(mesh);
    disposables.push(mesh.geometry);
  }

  // 放射状刻痕
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2;
    const groove = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.012, 1.6), accentMat);
    groove.position.set(Math.cos(angle) * 0.8, 0.01, Math.sin(angle) * 0.8);
    groove.rotation.y = -angle;
    parent.add(groove);
    disposables.push(groove.geometry);
  }

  // 内圈灰烬面
  const ashBed = new THREE.Mesh(
    new THREE.CircleGeometry(0.88, 48),
    new THREE.MeshStandardMaterial({ color: 0x121816, roughness: 1, emissive: 0x1a0e08, emissiveIntensity: 0.15 })
  );
  ashBed.rotation.x = -Math.PI / 2;
  ashBed.position.y = 0.006;
  parent.add(ashBed);
  disposables.push(ashBed.geometry, ashBed.material);
}

function createStoneRing(THREE: any, parent: any, disposables: Array<{ dispose?: () => void }>) {
  const stoneColors = [0x5a6258, 0x636b62, 0x525a52, 0x6a7268, 0x4e5650];
  const viewAngle = Math.atan2(-1.42, 7.55);
  const viewGap = 0.72;
  const blocksView = (angle: number) => {
    let delta = angle - viewAngle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return Math.abs(delta) < viewGap;
  };

  const layFlatStone = (radius: number, angle: number, w: number, d: number, h: number, color: number) => {
    if (blocksView(angle)) return;
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.02 });
    disposables.push(material);
    const stone = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    stone.position.set(Math.cos(angle) * radius, h / 2 + 0.004, Math.sin(angle) * radius);
    stone.rotation.y = -angle + (Math.random() - 0.5) * 0.35;
    stone.rotation.x = (Math.random() - 0.5) * 0.18;
    stone.rotation.z = (Math.random() - 0.5) * 0.14;
    parent.add(stone);
    disposables.push(stone.geometry);
  };

  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
    const radius = 1.52 + (Math.random() - 0.5) * 0.06;
    layFlatStone(
      radius,
      angle,
      0.46 + Math.random() * 0.14,
      0.34 + Math.random() * 0.12,
      0.07 + Math.random() * 0.04,
      stoneColors[i % stoneColors.length]
    );
  }

  for (let i = 0; i < 14; i += 1) {
    const angle = (i / 14) * Math.PI * 2 + 0.12;
    layFlatStone(1.78 + (Math.random() - 0.5) * 0.08, angle, 0.32, 0.26, 0.05, stoneColors[(i + 2) % stoneColors.length]);
  }

  for (let i = 0; i < 10; i += 1) {
    const angle = (i / 10) * Math.PI * 2;
    layFlatStone(1.18 + (Math.random() - 0.5) * 0.05, angle, 0.22, 0.18, 0.04, stoneColors[(i + 1) % stoneColors.length]);
  }
}

function createScatteredGravel(THREE: any, parent: any, disposables: Array<{ dispose?: () => void }>) {
  const gravelMat = new THREE.MeshStandardMaterial({ color: 0x454e49, roughness: 0.98 });
  const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x565f59, roughness: 0.96 });
  disposables.push(gravelMat, pebbleMat);

  for (let i = 0; i < 85; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.55 + Math.random() * 3.6;
    const size = 0.04 + Math.random() * 0.07;
    const h = 0.02 + Math.random() * 0.035;
    const mat = Math.random() > 0.45 ? gravelMat : pebbleMat;
    const pebble = new THREE.Mesh(new THREE.BoxGeometry(size, h, size * (0.7 + Math.random() * 0.5)), mat);
    pebble.position.set(Math.cos(angle) * radius, h / 2 + 0.003, Math.sin(angle) * radius);
    pebble.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    parent.add(pebble);
    disposables.push(pebble.geometry);
  }
}

function createHearthDecor(THREE: any, parent: any, disposables: Array<{ dispose?: () => void }>) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.95 });
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xc8bfb0, roughness: 0.8 });
  const runeMat = new THREE.MeshStandardMaterial({
    color: 0x8a9a88,
    emissive: 0x4a6a58,
    emissiveIntensity: 0.35,
    roughness: 0.6
  });
  disposables.push(woodMat, boneMat, runeMat);

  // 火塘内木炭
  for (let i = 0; i < 7; i += 1) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 6), woodMat);
    log.position.set((Math.random() - 0.5) * 0.5, 0.04, (Math.random() - 0.5) * 0.5);
    log.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.4, Math.random() * Math.PI, (Math.random() - 0.5) * 0.3);
    parent.add(log);
    disposables.push(log.geometry);
  }

  // 石环旁骨饰与刻纹板
  const decorSpots = [
    { x: 1.95, z: 0.35, ry: 0.4 },
    { x: -1.85, z: -0.55, ry: -0.6 },
    { x: 0.45, z: 2.05, ry: 1.2 },
    { x: -0.65, z: -1.95, ry: 2.4 }
  ];
  for (const spot of decorSpots) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.05, 0.28), runeMat);
    slab.position.set(spot.x, 0.028, spot.z);
    slab.rotation.y = spot.ry;
    parent.add(slab);
    disposables.push(slab.geometry);

    for (let i = 0; i < 3; i += 1) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.18 - i * 0.04, 0.012, 0.025), runeMat);
      mark.position.set(spot.x, 0.055, spot.z);
      mark.rotation.y = spot.ry + i * 0.15;
      parent.add(mark);
      disposables.push(mark.geometry);
    }
  }

  // 散落兽骨
  for (let i = 0; i < 5; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.9 + Math.random() * 1.4;
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.22, 5), boneMat);
    bone.position.set(Math.cos(angle) * radius, 0.025, Math.sin(angle) * radius);
    bone.rotation.set(Math.PI / 2, Math.random() * Math.PI, 0);
    parent.add(bone);
    disposables.push(bone.geometry);
  }
}

function createDistantMountains(THREE: any, scene: any, disposables: Array<{ dispose?: () => void }>) {
  // 远山放在树丛之后：使用极薄剪影（几乎无 Z 厚度），固定在最远层级，避免圆锥体底面伸到树前面
  const depth = 0.2;
  const layers = [
    {
      z: -22,
      color: 0x14242a,
      peaks: [
        { x: -22, w: 8, h: 6.2 },
        { x: -14, w: 6, h: 5.1 },
        { x: -6, w: 7, h: 6.8 },
        { x: 3, w: 9, h: 7.4 },
        { x: 12, w: 7, h: 6 },
        { x: 21, w: 8.5, h: 6.6 }
      ]
    },
    {
      z: -30,
      color: 0x0f1a20,
      peaks: [
        { x: -24, w: 10, h: 8.2 },
        { x: -12, w: 8, h: 7.2 },
        { x: 0, w: 11, h: 9.1 },
        { x: 14, w: 9, h: 8 },
        { x: 25, w: 10, h: 8.6 }
      ]
    },
    {
      z: -38,
      color: 0x0a1218,
      peaks: [
        { x: -20, w: 12, h: 10.5 },
        { x: -5, w: 10, h: 9.8 },
        { x: 10, w: 11, h: 10.2 },
        { x: 24, w: 12, h: 9.5 }
      ]
    }
  ];

  const mountainsRoot = new THREE.Group();
  mountainsRoot.name = "distant-mountains";

  for (const layer of layers) {
    const material = new THREE.MeshBasicMaterial({ color: layer.color, fog: true });
    disposables.push(material);
    const group = new THREE.Group();
    group.position.z = layer.z;

    for (const peak of layer.peaks) {
      const body = new THREE.Mesh(new THREE.BoxGeometry(peak.w, peak.h, depth), material);
      body.position.set(peak.x, peak.h / 2, 0);
      group.add(body);
      disposables.push(body.geometry);

      const crest = new THREE.Mesh(new THREE.BoxGeometry(peak.w * 0.55, peak.h * 0.18, depth), material);
      crest.position.set(peak.x, peak.h + peak.h * 0.04, 0);
      group.add(crest);
      disposables.push(crest.geometry);
    }

    mountainsRoot.add(group);
  }

  scene.add(mountainsRoot);
}

function createFlameMesh(
  THREE: any,
  radius: number,
  height: number,
  color: number,
  emissive: number,
  emissiveIntensity: number,
  opacity: number,
  disposables: Array<{ dispose?: () => void }>
) {
  const geometry = new THREE.ConeGeometry(radius, height, 10, 1, true);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y > -height / 2 + 0.05) {
      const jitter = (Math.random() - 0.5) * radius * 0.35;
      position.setX(i, position.getX(i) + jitter);
      position.setZ(i, position.getZ(i) + (Math.random() - 0.5) * radius * 0.35);
    }
  }
  position.needsUpdate = true;
  geometry.translate(0, height / 2, 0);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    transparent: true,
    opacity,
    flatShading: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  disposables.push(geometry, material);
  return new THREE.Mesh(geometry, material);
}

function treeSilhouetteColor(z: number) {
  if (z > -5.5) return { color: 0x030806, fog: false };
  if (z > -7.5) return { color: 0x06110d, fog: false };
  return { color: 0x0a1815, fog: true };
}

function bushSilhouetteColor(z: number) {
  if (z > -4.2) return { color: 0x010302, fog: false };
  if (z > -5.5) return { color: 0x040907, fog: false };
  return { color: 0x07100c, fog: true };
}

function createTreeSilhouette(THREE: any, scale: number, z: number) {
  const group = new THREE.Group();
  const disposables: Array<{ dispose?: () => void }> = [];
  const { color, fog } = treeSilhouetteColor(z);
  const bark = new THREE.MeshBasicMaterial({ color, fog });
  disposables.push(bark);

  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.14 * scale, 1.1 * scale, 0.1 * scale), bark);
  trunk.position.y = 0.55 * scale;
  group.add(trunk);
  disposables.push(trunk.geometry);

  const crownLayers = [
    { y: 1.05, rx: 0, rz: 0, w: 0.55, h: 1.0 },
    { y: 1.55, rx: 0.1, rz: -0.08, w: 0.75, h: 1.15 },
    { y: 2.05, rx: -0.06, rz: 0.1, w: 0.65, h: 1.05 },
    { y: 2.55, rx: 0.05, rz: -0.05, w: 0.5, h: 0.9 },
    { y: 2.95, rx: -0.04, rz: 0.06, w: 0.35, h: 0.7 }
  ];

  for (const layer of crownLayers) {
    const crown = new THREE.Mesh(new THREE.ConeGeometry(layer.w * scale, layer.h * scale, 6), bark);
    crown.position.y = layer.y * scale;
    crown.rotation.x = layer.rx;
    crown.rotation.z = layer.rz;
    group.add(crown);
    disposables.push(crown.geometry);
  }

  for (let i = 0; i < 3; i += 1) {
    const branch = new THREE.Mesh(new THREE.ConeGeometry(0.18 * scale, 0.55 * scale, 5), bark);
    branch.position.set((Math.random() - 0.5) * 0.5 * scale, (1.2 + Math.random() * 1.2) * scale, 0);
    branch.rotation.z = (Math.random() - 0.5) * 0.8;
    group.add(branch);
    disposables.push(branch.geometry);
  }

  return { group, disposables };
}

function createBushSilhouette(THREE: any, scale: number, z: number) {
  const group = new THREE.Group();
  const disposables: Array<{ dispose?: () => void }> = [];
  const { color, fog } = bushSilhouetteColor(z);
  const leaf = new THREE.MeshBasicMaterial({ color, fog });
  disposables.push(leaf);

  const blobCount = 3 + Math.floor(Math.random() * 3);
  for (let i = 0; i < blobCount; i += 1) {
    const w = (0.35 + Math.random() * 0.35) * scale;
    const h = (0.28 + Math.random() * 0.3) * scale;
    const blob = new THREE.Mesh(new THREE.SphereGeometry(w, 6, 5), leaf);
    blob.scale.y = 0.65 + Math.random() * 0.25;
    blob.position.set((Math.random() - 0.5) * 0.5 * scale, h * 0.6, (Math.random() - 0.5) * 0.4 * scale);
    group.add(blob);
    disposables.push(blob.geometry);
  }

  for (let i = 0; i < 2; i += 1) {
    const twig = new THREE.Mesh(new THREE.ConeGeometry(0.12 * scale, 0.35 * scale, 5), leaf);
    twig.position.set((Math.random() - 0.5) * 0.3 * scale, 0.2 * scale, 0);
    twig.rotation.z = (Math.random() - 0.5) * 0.5;
    group.add(twig);
    disposables.push(twig.geometry);
  }

  return { group, disposables };
}

function createBeastEyes(
  THREE: any,
  color: number,
  spacing: number,
  disposables: Array<{ dispose?: () => void }>
) {
  const group = new THREE.Group();
  const geometry = new THREE.SphereGeometry(0.055, 8, 8);
  disposables.push(geometry);

  const leftMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const rightMat = leftMat.clone();
  disposables.push(leftMat, rightMat);

  const left = new THREE.Mesh(geometry, leftMat);
  const right = new THREE.Mesh(geometry, rightMat);
  left.position.x = -spacing / 2;
  right.position.x = spacing / 2;
  group.add(left, right);

  return { group, left, right };
}
