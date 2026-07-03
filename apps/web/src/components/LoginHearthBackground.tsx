import { useEffect, useRef } from "react";

/**
 * 登录页的 Three.js 背景。
 * 它是纯展示场景，不参与游戏状态，只负责火塘、森林剪影、星空和背景动效。
 */
export function LoginHearthBackground() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;
    const threeModuleUrl = "https://esm.sh/three@0.176.0";

    void import(/* @vite-ignore */ threeModuleUrl).then((THREE) => {
      if (disposed) return;
      // 登录页按需加载 Three，避免未进入 3D 页面时增加主包体积。
      cleanup = mountLoginHearth(THREE, mount);
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return <div className="login-hearth-bg" ref={mountRef} />;
}

function mountLoginHearth(THREE: any, mount: HTMLDivElement) {
  const disposables: Array<{ dispose?: () => void }> = [];
  // 独立 Scene + PerspectiveCamera，专门为登录页构图，不复用游戏主场景。
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x081018);
  scene.fog = new THREE.FogExp2(0x0a1520, 0.052);

  const camera = new THREE.PerspectiveCamera(52, mount.clientWidth / mount.clientHeight, 0.1, 100);
  camera.position.set(-1.42, 0.26, 7.55);
  camera.lookAt(new THREE.Vector3(0, 1.38, -0.12));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  // 背景铺满容器，DPR 限制在 2 以内，兼顾清晰度和性能。
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  mount.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x3a5060, 0.26));

  const moonLight = new THREE.DirectionalLight(0x9ab8d0, 0.2);
  moonLight.position.set(5, 14, -8);
  scene.add(moonLight);

  scene.add(new THREE.HemisphereLight(0xffb870, 0x142028, 0.16));
  createLoginStarfield(THREE, scene, disposables);
  createLoginDistantMountains(THREE, scene, disposables);

  const hearthGroup = new THREE.Group();
  // 火塘整体下移，让火焰从登录表单后方升起，形成前景/背景层次。
  hearthGroup.position.y = -0.85;
  scene.add(hearthGroup);

  const fireLight = new THREE.PointLight(0xff8a40, 24, 18);
  fireLight.position.set(0, 1.1, 0);
  hearthGroup.add(fireLight);

  const fireWarmth = new THREE.PointLight(0xff6020, 8, 9);
  fireWarmth.position.set(0, 0.35, 0.4);
  hearthGroup.add(fireWarmth);

  const swaying: Array<{ group: any; phase: number; speed: number; sway: number }> = [];
  // 树木是低面数剪影，位置和摆动相位随机化，避免背景过于机械。
  for (const cfg of [
    { x: -9.5, z: -5.8, scale: 3.4 },
    { x: -7.0, z: -7.2, scale: 2.9 },
    { x: -4.8, z: -8.5, scale: 2.5 },
    { x: -2.2, z: -9.0, scale: 2.1 },
    { x: 0.5, z: -9.2, scale: 2.3 },
    { x: 3.2, z: -8.6, scale: 2.7 },
    { x: 5.8, z: -7.8, scale: 3.1 },
    { x: 8.2, z: -6.5, scale: 3.5 },
    { x: -10.8, z: -3.5, scale: 2.2 },
    { x: 9.8, z: -3.2, scale: 2.4 }
  ]) {
    const tree = createLoginTree(THREE, cfg.scale, cfg.z, disposables);
    tree.position.set(cfg.x, 0, cfg.z);
    swaying.push({
      group: tree,
      phase: Math.random() * Math.PI * 2,
      speed: 0.35 + Math.random() * 0.35,
      sway: 0.012 + Math.random() * 0.015
    });
    scene.add(tree);
  }

  createLoginGatheringSeats(THREE, scene, disposables);
  createLoginHearthCore(THREE, hearthGroup, disposables);

  const flameGroup = new THREE.Group();
  // 火焰分为主火三层和外圈小火舌，后续 RAF 会分别做缩放/摇摆。
  const flameLayers: Array<{ mesh: any; baseX: number; baseZ: number; phase: number; speed: number }> = [];
  const mainOuter = createLoginFlameMesh(THREE, 0.95, 3.2, 0xff5a18, 0xff3a10, 1.6, 0.78, disposables);
  const mainInner = createLoginFlameMesh(THREE, 0.52, 2.3, 0xffe8b0, 0xffb040, 2.0, 0.88, disposables);
  const mainCore = createLoginFlameMesh(THREE, 0.28, 1.5, 0xffffff, 0xffeeaa, 2.2, 0.92, disposables);
  mainOuter.position.y = 0.08;
  mainInner.position.y = 0.08;
  mainCore.position.y = 0.08;
  flameGroup.add(mainOuter, mainInner, mainCore);

  for (let i = 0; i < 6; i += 1) {
    const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.4;
    const radius = 0.18 + Math.random() * 0.22;
    const mesh = createLoginFlameMesh(THREE, 0.22 + Math.random() * 0.18, 1.1 + Math.random() * 1.4, 0xff6820, 0xff4010, 1.4, 0.68, disposables);
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

  const emberCount = 72;
  // 余烬使用 Points + BufferGeometry，批量更新顶点比创建许多 Mesh 更轻。
  const emberPositions = new Float32Array(emberCount * 3);
  for (let i = 0; i < emberCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 0.65;
    emberPositions[i * 3] = Math.cos(angle) * radius;
    emberPositions[i * 3 + 1] = 0.08 + Math.random() * 3.8;
    emberPositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute("position", new THREE.BufferAttribute(emberPositions, 3));
  const emberMaterial = new THREE.PointsMaterial({
    color: 0xffcc88,
    size: 0.09,
    transparent: true,
    opacity: 0.52,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const embers = new THREE.Points(emberGeometry, emberMaterial);
  hearthGroup.add(embers);
  disposables.push(emberGeometry, emberMaterial);

  let frame = 0;
  let animationFrame = 0;
  const animate = () => {
    // 这个背景没有物理/输入，使用简单时间累加驱动展示动效即可。
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
    fireWarmth.intensity = 7 + Math.sin(frame * 2.8) * 1.2;

    for (const item of swaying) {
      item.group.rotation.z = Math.sin(frame * item.speed + item.phase) * item.sway;
    }

    for (let i = 0; i < emberCount; i += 1) {
      const y = emberPositions[i * 3 + 1] + 0.018;
      emberPositions[i * 3 + 1] = y > 5.2 ? 0.08 : y;
      emberPositions[i * 3] += Math.sin(frame * 2 + i) * 0.003;
      emberPositions[i * 3 + 2] += Math.cos(frame * 1.8 + i) * 0.003;
    }
    emberGeometry.attributes.position.needsUpdate = true;
    emberMaterial.opacity = 0.42 + Math.sin(frame * 3) * 0.08;

    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  };
  animate();

  const resize = () => {
    // 容器尺寸变化时同步相机宽高比和 renderer 尺寸，避免画面拉伸。
    camera.aspect = mount.clientWidth / mount.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(mount.clientWidth, mount.clientHeight);
  };
  window.addEventListener("resize", resize);

  return () => {
    // React 卸载时取消 RAF，并释放所有 geometry/material 与 renderer。
    window.removeEventListener("resize", resize);
    cancelAnimationFrame(animationFrame);
    for (const item of disposables) item.dispose?.();
    renderer.dispose();
    if (renderer.domElement.parentElement === mount) {
      mount.removeChild(renderer.domElement);
    }
  };
}

function createLoginStarfield(THREE: any, scene: any, disposables: Array<{ dispose?: () => void }>) {
  // 登录页星空是一次性生成的 Points 云，不需要每帧改动。
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
  const material = new THREE.PointsMaterial({ color: 0xd8e8ff, size: 0.1, transparent: true, opacity: 0.72 });
  scene.add(new THREE.Points(geometry, material));
  disposables.push(geometry, material);
}

function createLoginDistantMountains(THREE: any, scene: any, disposables: Array<{ dispose?: () => void }>) {
  // 远山用多层深色基础材质配合 fog，形成低成本景深。
  for (const layer of [
    { z: -22, color: 0x14242a, height: 6 },
    { z: -30, color: 0x0f1a20, height: 8 },
    { z: -38, color: 0x0a1218, height: 10 }
  ]) {
    const material = new THREE.MeshBasicMaterial({ color: layer.color, fog: true });
    disposables.push(material);
    for (let i = 0; i < 7; i += 1) {
      const peak = new THREE.Mesh(new THREE.BoxGeometry(7 + Math.random() * 3, layer.height + Math.random() * 2, 0.2), material);
      peak.position.set(-24 + i * 8, peak.geometry.parameters.height / 2, layer.z);
      scene.add(peak);
      disposables.push(peak.geometry);
    }
  }
}

function createLoginTree(THREE: any, scale: number, z: number, disposables: Array<{ dispose?: () => void }>) {
  // 树木用基础几何体搭剪影，避免登录页背景承担复杂模型加载。
  const group = new THREE.Group();
  const color = z > -5.5 ? 0x030806 : z > -7.5 ? 0x06110d : 0x0a1815;
  const material = new THREE.MeshBasicMaterial({ color, fog: z <= -7.5 });
  disposables.push(material);

  const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.14 * scale, 1.1 * scale, 0.1 * scale), material);
  trunk.position.y = 0.55 * scale;
  group.add(trunk);
  disposables.push(trunk.geometry);

  for (const layer of [
    { y: 1.05, w: 0.55, h: 1 },
    { y: 1.55, w: 0.75, h: 1.15 },
    { y: 2.05, w: 0.65, h: 1.05 },
    { y: 2.55, w: 0.5, h: 0.9 },
    { y: 2.95, w: 0.35, h: 0.7 }
  ]) {
    const crown = new THREE.Mesh(new THREE.ConeGeometry(layer.w * scale, layer.h * scale, 6), material);
    crown.position.y = layer.y * scale;
    group.add(crown);
    disposables.push(crown.geometry);
  }
  return group;
}

function createLoginGatheringSeats(THREE: any, scene: any, disposables: Array<{ dispose?: () => void }>) {
  // 周围坐木给火塘增加尺度感，也是简单 Mesh 组合。
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.98 });
  disposables.push(woodMat);
  for (const seat of [
    { x: -3.7, z: 6.1, ry: 0.72 },
    { x: 3.5, z: 6.3, ry: -0.62 },
    { x: -4.3, z: 5.0, ry: 1.08 },
    { x: 4.1, z: 4.9, ry: -1.0 }
  ]) {
    const log = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.17, 0.3), woodMat);
    log.position.set(seat.x, 0.08, seat.z);
    log.rotation.y = seat.ry;
    scene.add(log);
    disposables.push(log.geometry);
  }
}

function createLoginHearthCore(THREE: any, parent: any, disposables: Array<{ dispose?: () => void }>) {
  // 火塘底座、灰床、石圈和木柴都是静态几何，统一登记到 disposables。
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(5.2, 72),
    new THREE.MeshStandardMaterial({ color: 0x152420, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.001;
  parent.add(ground);
  disposables.push(ground.geometry, ground.material);

  const ashBed = new THREE.Mesh(
    new THREE.CircleGeometry(0.88, 48),
    new THREE.MeshStandardMaterial({ color: 0x121816, roughness: 1, emissive: 0x1a0e08, emissiveIntensity: 0.15 })
  );
  ashBed.rotation.x = -Math.PI / 2;
  ashBed.position.y = 0.006;
  parent.add(ashBed);
  disposables.push(ashBed.geometry, ashBed.material);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a6258, roughness: 0.92 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.95 });
  disposables.push(stoneMat, woodMat);
  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.34), stoneMat);
    stone.position.set(Math.cos(angle) * 1.52, 0.05, Math.sin(angle) * 1.52);
    stone.rotation.y = -angle;
    parent.add(stone);
    disposables.push(stone.geometry);
  }
  for (let i = 0; i < 7; i += 1) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.55, 6), woodMat);
    log.position.set((Math.random() - 0.5) * 0.5, 0.04, (Math.random() - 0.5) * 0.5);
    log.rotation.set(Math.PI / 2, Math.random() * Math.PI, 0);
    parent.add(log);
    disposables.push(log.geometry);
  }
}

function createLoginFlameMesh(
  THREE: any,
  radius: number,
  height: number,
  color: number,
  emissive: number,
  emissiveIntensity: number,
  opacity: number,
  disposables: Array<{ dispose?: () => void }>
) {
  // 火焰几何体向上平移半个高度，让 mesh 原点位于火舌底部，方便缩放动画。
  const geometry = new THREE.ConeGeometry(radius, height, 10, 1, true);
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
