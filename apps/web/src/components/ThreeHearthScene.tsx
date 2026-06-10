import { useEffect, useRef, useState, type RefObject } from "react";
import { loadCharacterWithAnimations, type CharacterAnimator } from "../characterAnimation";
import { CharacterEquipment } from "../characterEquipment";
import { loadModelById, clearModelCache, getModelEntry, isModelUrlAvailable } from "../modelAssets";
import { updateThirdPersonPlayer, triggerPlayerAttack, triggerPlayerJump } from "../thirdPersonPlayer";
import {
  HEARTH_VILLAGE_NPCS,
  findNearbyNpc,
  npcDialoguePayload,
  spawnVillageNpc,
  type NpcDialoguePayload,
  type VillageNpcInstance
} from "../villageNpcs";
import { SceneDialogueOverlay } from "./SceneDialogueOverlay";
type ThreeModule = any;

type Disposable = {
  dispose?: () => void;
};

type KeyState = Record<string, boolean>;

type SceneUiBridge = {
  setNearNpc: (npc: { id: string; name: string; title: string } | null) => void;
  openDialogue: (dialogue: NpcDialoguePayload) => void;
  closeDialogue: () => void;
  isDialogueOpen: () => boolean;
};

export function ThreeHearthScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const fpsRef = useRef<HTMLSpanElement | null>(null);
  const [nearNpc, setNearNpc] = useState<{ id: string; name: string; title: string } | null>(null);
  const [dialogue, setDialogue] = useState<NpcDialoguePayload | null>(null);
  const dialogueOpenRef = useRef(false);

  dialogueOpenRef.current = dialogue !== null;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;
    const threeModuleUrl = "https://esm.sh/three@0.176.0";
    const uiBridge: SceneUiBridge = {
      setNearNpc,
      openDialogue: setDialogue,
      closeDialogue: () => setDialogue(null),
      isDialogueOpen: () => dialogueOpenRef.current
    };

    void import(/* @vite-ignore */ threeModuleUrl).then((THREE) => {
      if (disposed) return;
      cleanup = mountGraybudVillage(THREE, mount, uiBridge, fpsRef);
    });

    const teardown = () => {
      disposed = true;
      cleanup?.();
    };

    import.meta.hot?.dispose(teardown);

    return teardown;
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && dialogue) {
        setDialogue(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogue]);

  return (
    <div className="three-scene-wrap">
      <div className="three-scene" ref={mountRef} />
      <SceneDialogueOverlay nearNpc={nearNpc} dialogue={dialogue} onClose={() => setDialogue(null)} />
      <div className="scene-fps" aria-hidden="true">
        <span ref={fpsRef}>-- FPS</span>
      </div>
      <div className="scene-hud" aria-hidden="true">
        <strong>灰芽火塘地</strong>
        <span>WASD 移动 · 左键 Throw · 空格跳跃 · E 对话 · 按住拖拽环视 · Shift 冲刺</span>
      </div>
    </div>
  );
}

function mountGraybudVillage(
  THREE: ThreeModule,
  mount: HTMLDivElement,
  ui: SceneUiBridge,
  fpsRef: RefObject<HTMLSpanElement | null>
) {
  const disposables: Disposable[] = [];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x101813);
  scene.fog = new THREE.FogExp2(0x101813, 0.028);

  const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.1, 180);
  camera.position.set(2.26, 2.69, 4.39);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  const world = new THREE.Group();
  scene.add(world);

  const ambient = new THREE.HemisphereLight(0xb8cfc6, 0x2a1b12, 0.55);
  scene.add(ambient);

  const moon = new THREE.DirectionalLight(0x9db6c7, 0.65);
  moon.position.set(-9, 16, 8);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  scene.add(moon);

  const fireLight = new THREE.PointLight(0xff7a2a, 16, 24, 1.4);
  fireLight.position.set(0, 1.25, 0);
  fireLight.castShadow = true;
  scene.add(fireLight);

  const movement = { walkSpeed: 4.2, sprintSpeed: 8, mouseSensitivity: 0.004 };
  const thirdPerson = {
    cameraDistance: 2.5,
    cameraHeight: 0.85,
    lookAtHeight: 1.5,
    moveTurnSpeed: 8,
    idleTurnSpeed: 4,
    cameraFollowSpeed: 10
  };
  const lighting = { fireIntensity: fireLight.intensity, moonIntensity: moon.intensity, ambientIntensity: ambient.intensity };
  const fogSettings = { density: scene.fog.density };

  let sceneDisposed = false;
  let playerCharacter: any | undefined;
  let playerFootOffsetY = 0;
  let playerAnimator: CharacterAnimator | undefined;
  const characterAnimators: CharacterAnimator[] = [];
  const characterEquipment: CharacterEquipment[] = [];
  let universalAnimator: CharacterAnimator | undefined;
  const villageNpcs: VillageNpcInstance[] = [];
  let nearbyNpc: VillageNpcInstance | undefined;
  let nearbyNpcId: string | null = null;
  let sceneGui:
    | {
        registerCharacter: (
          animator: CharacterAnimator,
          equipment: CharacterEquipment,
          ctx: { THREE: unknown; loadModelById: typeof loadModelById }
        ) => void;
        destroy: () => void;
      }
    | undefined;

  const registerCharacterToGui = (animator: CharacterAnimator, equipment: CharacterEquipment) => {
    sceneGui?.registerCharacter(animator, equipment, { THREE, loadModelById });
  };

  createGround(THREE, world, disposables);
  createHearth(THREE, world, disposables);
  createHouses(THREE, world, disposables);
  createVillageDetails(THREE, world, disposables);
  createForestRing(THREE, world, disposables);
  createDistantHills(THREE, scene, disposables);
  createStarfield(THREE, scene, disposables);

  void loadCharacterWithAnimations(
    THREE,
    loadModelById,
    "characters.npc.kaykit.barbarian",
    ["animations.kaykit.rigMedium.general", "animations.kaykit.rigMedium.movementBasic"]
  )
    .then(({ characterGltf, animator }) => {
      if (sceneDisposed) {
        animator.dispose();
        return;
      }

      const character = characterGltf.scene as any;
      character.name = "Player";
      character.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const bounds = new THREE.Box3().setFromObject(character);
      const size = bounds.getSize(new THREE.Vector3());
      const targetHeight = 1.65;
      if (size.y > 0) {
        character.scale.setScalar(targetHeight / size.y);
      }
      bounds.setFromObject(character);
      playerFootOffsetY = -bounds.min.y;
      character.position.set(0, playerFootOffsetY, 5.2);
      character.rotation.y = -1.208;
      world.add(character);

      playerCharacter = character;
      playerAnimator = animator;
      character.updateMatrixWorld(true);

      character.traverse((child: any) => {
        if (child.geometry) disposables.push(child.geometry);
        if (child.material) {
          if (Array.isArray(child.material)) disposables.push(...child.material);
          else disposables.push(child.material);
        }
      });

      const equipment = new CharacterEquipment(character);
      characterEquipment.push(equipment);

      void equipment
        .equip(THREE, loadModelById, "right", "props.weapons.kaykit.sword1Handed")
        .then(() => {
          if (sceneDisposed) return;
          registerCharacterToGui(animator, equipment);
        })
        .catch((error: unknown) => {
          console.error("Failed to equip default weapon:", error);
          registerCharacterToGui(animator, equipment);
        });

      const started = animator.play("Idle_A", { fade: 0 });
      if (!started) {
        animator.play("idle", { fade: 0 });
      }
      console.info("[hearth] character clips:", animator.clipNames.join(", "));
      characterAnimators.push(animator);
    })
    .catch((error: unknown) => {
      console.error("Failed to load test character:", error);
    });

  void Promise.all(
    HEARTH_VILLAGE_NPCS.map((definition) => spawnVillageNpc(THREE, world, loadModelById, definition, disposables))
  )
    .then((npcs) => {
      if (sceneDisposed) {
        for (const npc of npcs) npc.animator.dispose();
        return;
      }
      villageNpcs.push(...npcs);
      for (const npc of npcs) {
        characterAnimators.push(npc.animator);
      }
      console.info("[hearth] village npcs:", npcs.map((npc) => npc.definition.name).join(", "));
    })
    .catch((error: unknown) => {
      console.error("Failed to load village npc:", error);
    });

  void (async () => {
    try {
      const ualEntry = await getModelEntry("characters.prototype.ual.standard");
      const ualAvailable = await isModelUrlAvailable(ualEntry.path);
      if (!ualAvailable) {
        console.warn(
          "[hearth] UAL prototype skipped — copy UAL1_Standard.glb to apps/web/public/models/characters/prototype/ual1-standard.glb"
        );
        return;
      }

      const { characterGltf, animator } = await loadCharacterWithAnimations(
        THREE,
        loadModelById,
        "characters.prototype.ual.standard",
        []
      );
      if (sceneDisposed) {
        animator.dispose();
        return;
      }

      const character = characterGltf.scene as any;
      character.name = "Universal Animation Library Prototype";
      character.traverse((child: any) => {
        if (child.isMesh || child.isSkinnedMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const bounds = new THREE.Box3().setFromObject(character);
      const size = bounds.getSize(new THREE.Vector3());
      const targetHeight = 1.72;
      if (size.y > 0) {
        character.scale.setScalar(targetHeight / size.y);
      }
      bounds.setFromObject(character);
      character.position.set(-2.65, -bounds.min.y, 2.35);
      character.rotation.y = Math.PI * 0.82;
      world.add(character);

      character.traverse((child: any) => {
        if (child.geometry) disposables.push(child.geometry);
        if (child.material) {
          if (Array.isArray(child.material)) disposables.push(...child.material);
          else disposables.push(child.material);
        }
      });

      const started = animator.play("Idle_Torch_Loop", { fade: 0 });
      if (!started) {
        animator.play("Idle_Loop", { fade: 0 });
      }
      universalAnimator = animator;
      characterAnimators.push(animator);
      console.info("[hearth] UAL clips:", animator.clipNames.join(", "));
    } catch (error: unknown) {
      console.error("Failed to load Universal Animation Library character:", error);
    }
  })();

  const keys: KeyState = {};
  const pointer = {
    dragging: false,
    pressed: false,
    dragThreshold: 5,
    x: 0,
    y: 0,
    pressX: 0,
    pressY: 0,
    yaw: 0,
    yawTarget: 0,
    pitch: 0.13
  };

  if (import.meta.env.DEV) {
    void import("../villageSceneGui.ts").then(({ attachVillageSceneGui }) => {
      if (sceneDisposed) return;
      sceneGui = attachVillageSceneGui({
        camera,
        pointer,
        movement,
        thirdPerson,
        lighting,
        fog: fogSettings,
        fireLight,
        moon,
        ambient,
        scene
      });      for (let i = 0; i < characterAnimators.length; i += 1) {
        const equipment = characterEquipment[i];
        if (equipment) {
          sceneGui.registerCharacter(characterAnimators[i]!, equipment, { THREE, loadModelById });
        }
      }
    });
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (ui.isDialogueOpen()) {
      if (event.key === "Escape") {
        ui.closeDialogue();
      }
      return;
    }

    keys[event.key.toLowerCase()] = true;
    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat && playerAnimator) {
        triggerPlayerJump(playerAnimator);
      }
    }
    if (!event.repeat && event.key.toLowerCase() === "e" && nearbyNpc) {
      ui.openDialogue(npcDialoguePayload(nearbyNpc));
    }
    if (universalAnimator) {
      const clipName = universalClipForKey(event.key);
      if (clipName) {
        universalAnimator.play(clipName, { fade: 0.18, restart: true, loop: !["Sword_Attack", "Spell_Simple_Shoot"].includes(clipName) });
      }
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    keys[event.key.toLowerCase()] = false;
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    pointer.pressed = true;
    pointer.dragging = false;
    pointer.pressX = event.clientX;
    pointer.pressY = event.clientY;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!pointer.pressed) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.dragging) {
      const totalDx = event.clientX - pointer.pressX;
      const totalDy = event.clientY - pointer.pressY;
      if (totalDx * totalDx + totalDy * totalDy >= pointer.dragThreshold * pointer.dragThreshold) {
        pointer.dragging = true;
      }
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (!pointer.dragging) return;
    pointer.yawTarget -= dx * movement.mouseSensitivity;
    pointer.pitch -= dy * movement.mouseSensitivity;
    pointer.pitch = THREE.MathUtils.clamp(pointer.pitch, -0.25, 1.05);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (pointer.pressed && !pointer.dragging && playerAnimator) {
      triggerPlayerAttack(playerAnimator);
    }
    pointer.pressed = false;
    pointer.dragging = false;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
  };
  const onResize = () => {
    camera.aspect = mount.clientWidth / mount.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(mount.clientWidth, mount.clientHeight);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointerleave", onPointerUp);

  const clock = new THREE.Clock();
  const animated = collectAnimatedObjects(world);
  let animationFrame = 0;
  let fpsSmooth = 60;
  let fpsHudAccum = 0;

  const animate = () => {
    if (sceneDisposed) return;

    const delta = Math.min(clock.getDelta(), 0.045);
    const elapsed = clock.elapsedTime;

    if (delta > 0) {
      fpsSmooth = fpsSmooth * 0.88 + (1 / delta) * 0.12;
      fpsHudAccum += delta;
      if (fpsHudAccum >= 0.25 && fpsRef.current) {
        fpsHudAccum = 0;
        fpsRef.current.textContent = `${Math.round(fpsSmooth)} FPS`;
      }
    }

    if (playerCharacter && playerAnimator && !ui.isDialogueOpen()) {
      updateThirdPersonPlayer(
        THREE,
        playerCharacter,
        playerAnimator,
        camera,
        pointer,
        keys,
        delta,
        { ...movement, ...thirdPerson },
        playerFootOffsetY
      );

      nearbyNpc = findNearbyNpc(playerCharacter, villageNpcs);
      const nextNearId = nearbyNpc?.definition.id ?? null;
      if (nextNearId !== nearbyNpcId) {
        nearbyNpcId = nextNearId;
        ui.setNearNpc(
          nearbyNpc
            ? {
                id: nearbyNpc.definition.id,
                name: nearbyNpc.definition.name,
                title: nearbyNpc.definition.title
              }
            : null
        );
      }
    } else if (!playerCharacter || !playerAnimator) {
      camera.position.set(2.26, 2.69, 4.39);
      camera.lookAt(0, 1.5, 5.2);
    }

    updateVillageAnimation(animated, fireLight, lighting, elapsed);
    for (const animator of characterAnimators) {
      animator.update(delta);
    }

    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  };
  animate();

  return () => {
    sceneDisposed = true;
    sceneGui?.destroy();
    for (const animator of characterAnimators) {
      animator.dispose();
    }
    for (const equipment of characterEquipment) {
      equipment.dispose();
    }
    cancelAnimationFrame(animationFrame);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onResize);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    renderer.domElement.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    renderer.domElement.removeEventListener("pointerleave", onPointerUp);

    sceneGui?.destroy();
    clearModelCache();
    for (const item of disposables) item.dispose?.();
    renderer.dispose();
    if (renderer.domElement.parentElement === mount) {
      mount.removeChild(renderer.domElement);
    }
  };
}

function universalClipForKey(key: string) {  const clips: Record<string, string> = {
    "1": "Idle_Torch_Loop",
    "2": "Walk_Loop",
    "3": "Jog_Fwd_Loop",
    "4": "Sword_Attack",
    "5": "Spell_Simple_Shoot"
  };
  return clips[key];
}

function collectAnimatedObjects(world: any) {
  const flames: any[] = [];
  const embers: any[] = [];
  const trees: any[] = [];
  const banners: any[] = [];

  world.traverse((object: any) => {
    if (object.userData.kind === "flame") flames.push(object);
    if (object.userData.kind === "ember") embers.push(object);
    if (object.userData.kind === "tree") trees.push(object);
    if (object.userData.kind === "banner") banners.push(object);
  });

  return { flames, embers, trees, banners };
}

function updateVillageAnimation(
  animated: ReturnType<typeof collectAnimatedObjects>,
  fireLight: any,
  lighting: { fireIntensity: number },
  elapsed: number
) {
  const base = lighting.fireIntensity;
  fireLight.intensity = base + Math.sin(elapsed * 8) * (base * 0.1) + Math.sin(elapsed * 17) * (base * 0.06);

  animated.flames.forEach((flame, index) => {
    const pulse = 1 + Math.sin(elapsed * (4.5 + index * 0.3) + index) * 0.1;
    flame.scale.set(1 + Math.sin(elapsed * 3 + index) * 0.05, pulse, 1 + Math.cos(elapsed * 2.8 + index) * 0.05);
    flame.rotation.y += 0.012 + index * 0.002;
  });

  animated.embers.forEach((points) => {
    const attr = points.geometry.getAttribute("position");
    for (let i = 0; i < attr.count; i += 1) {
      const y = attr.getY(i) + 0.018 + Math.sin(elapsed + i) * 0.003;
      attr.setY(i, y > 4.5 ? 0.25 : y);
      attr.setX(i, attr.getX(i) + Math.sin(elapsed * 1.6 + i) * 0.002);
      attr.setZ(i, attr.getZ(i) + Math.cos(elapsed * 1.3 + i) * 0.002);
    }
    attr.needsUpdate = true;
  });

  animated.trees.forEach((tree, index) => {
    tree.rotation.z = Math.sin(elapsed * 0.55 + index) * 0.018;
  });

  animated.banners.forEach((banner, index) => {
    banner.rotation.z = Math.sin(elapsed * 1.4 + index) * 0.08;
  });
}

function createGround(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x314234, roughness: 0.96 });
  const pathMat = new THREE.MeshStandardMaterial({ color: 0x6b5a3f, roughness: 1 });
  disposables.push(groundMat, pathMat);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(32, 96), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  parent.add(ground);
  disposables.push(ground.geometry);

  const paths = [
    { x: 0, z: 4.7, w: 3.2, d: 14, ry: 0 },
    { x: -5.8, z: 1.2, w: 2.2, d: 9.5, ry: -0.9 },
    { x: 6.1, z: 0.8, w: 2, d: 9, ry: 0.85 }
  ];

  for (const path of paths) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(path.w, 0.025, path.d), pathMat);
    mesh.position.set(path.x, 0.016, path.z);
    mesh.rotation.y = path.ry;
    mesh.receiveShadow = true;
    parent.add(mesh);
    disposables.push(mesh.geometry);
  }
}

function createHearth(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x77705f, roughness: 0.9 });
  const ashMat = new THREE.MeshStandardMaterial({ color: 0x20201b, emissive: 0x2a1106, emissiveIntensity: 0.2, roughness: 1 });
  const seedMat = new THREE.MeshStandardMaterial({ color: 0xffdf8a, emissive: 0xff6c24, emissiveIntensity: 1.6, roughness: 0.35 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x392417, roughness: 0.9 });
  disposables.push(ringMat, ashMat, seedMat, woodMat);

  const hearth = new THREE.Group();
  parent.add(hearth);

  const ash = new THREE.Mesh(new THREE.CircleGeometry(1.45, 48), ashMat);
  ash.rotation.x = -Math.PI / 2;
  ash.position.y = 0.025;
  hearth.add(ash);
  disposables.push(ash.geometry);

  for (let i = 0; i < 28; i += 1) {
    const angle = (i / 28) * Math.PI * 2;
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.32), ringMat);
    stone.position.set(Math.cos(angle) * 1.65, 0.11, Math.sin(angle) * 1.65);
    stone.rotation.y = -angle + Math.sin(i) * 0.16;
    stone.castShadow = true;
    hearth.add(stone);
    disposables.push(stone.geometry);
  }

  for (let i = 0; i < 7; i += 1) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.15, 8), woodMat);
    log.position.set(Math.sin(i) * 0.22, 0.14, Math.cos(i * 1.8) * 0.22);
    log.rotation.set(Math.PI / 2, i * 0.48, i * 0.7);
    log.castShadow = true;
    hearth.add(log);
    disposables.push(log.geometry);
  }

  const flameColors = [
    [0xff531d, 0xff2d12],
    [0xffa83f, 0xff5b1e],
    [0xfff1b5, 0xffa43a]
  ];
  flameColors.forEach(([color, emissive], index) => {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.74 - index * 0.18, 2.2 - index * 0.48, 9, 1, true),
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 1.8,
        transparent: true,
        opacity: 0.76,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    flame.position.y = 0.2;
    flame.userData.kind = "flame";
    hearth.add(flame);
    disposables.push(flame.geometry, flame.material);
  });

  const fireSeed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), seedMat);
  fireSeed.position.set(0, 0.7, 0);
  fireSeed.castShadow = true;
  hearth.add(fireSeed);
  disposables.push(fireSeed.geometry);

  const emberCount = 90;
  const positions = new Float32Array(emberCount * 3);
  for (let i = 0; i < emberCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 0.8;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 0.2 + Math.random() * 4;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const emberMat = new THREE.PointsMaterial({
    color: 0xffcc78,
    size: 0.08,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  embers.userData.kind = "ember";
  hearth.add(embers);
  disposables.push(emberGeo, emberMat);
}

function createHouses(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const houses = [
    { x: -7.4, z: -3.5, ry: 0.5, scale: 1.25 },
    { x: 7.6, z: -3.7, ry: -0.55, scale: 1.2 },
    { x: -9.3, z: 3.4, ry: 1.15, scale: 1.05 },
    { x: 8.9, z: 3.2, ry: -1.1, scale: 1.05 },
    { x: -3.8, z: -8.2, ry: 0.05, scale: 0.95 },
    { x: 4.0, z: -8.4, ry: -0.1, scale: 0.95 }
  ];

  houses.forEach((house) => {
    const group = createGraybudHouse(THREE, house.scale, disposables);
    group.position.set(house.x, 0, house.z);
    group.rotation.y = house.ry;
    parent.add(group);
  });
}

function createGraybudHouse(THREE: ThreeModule, scale: number, disposables: Disposable[]) {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x7a6246, roughness: 0.88 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x483522, roughness: 0.98 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 1 });
  const antlerMat = new THREE.MeshStandardMaterial({ color: 0xcab896, roughness: 0.72 });
  disposables.push(wallMat, roofMat, darkMat, antlerMat);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.35 * scale, 1.55 * scale, 1.65 * scale, 12), wallMat);
  body.position.y = 0.82 * scale;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  disposables.push(body.geometry);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.85 * scale, 1.35 * scale, 12), roofMat);
  roof.position.y = 2.15 * scale;
  roof.castShadow = true;
  group.add(roof);
  disposables.push(roof.geometry);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.62 * scale, 0.9 * scale, 0.08 * scale), darkMat);
  door.position.set(0, 0.48 * scale, 1.43 * scale);
  group.add(door);
  disposables.push(door.geometry);

  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * scale, 0.035 * scale, 0.62 * scale, 6), antlerMat);
    horn.position.set(side * 0.32 * scale, 2.72 * scale, 0.06 * scale);
    horn.rotation.z = side * 0.62;
    horn.castShadow = true;
    group.add(horn);
    disposables.push(horn.geometry);
  }

  return group;
}

function createVillageDetails(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3c2819, roughness: 0.94 });
  const herbMat = new THREE.MeshStandardMaterial({ color: 0x7fa45a, roughness: 0.88 });
  const hideMat = new THREE.MeshStandardMaterial({ color: 0x9b7553, roughness: 0.95 });
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0x8c3f2c, roughness: 0.82 });
  disposables.push(woodMat, herbMat, hideMat, bannerMat);

  createTotemPole(THREE, parent, disposables, -2.7, -2.1);
  createTotemPole(THREE, parent, disposables, 2.8, -2.0);

  const racks = [
    { x: -4.2, z: 3.3, ry: 0.4 },
    { x: 4.4, z: 3.2, ry: -0.35 },
    { x: -1.8, z: 6.3, ry: 0 }
  ];

  for (const rack of racks) {
    const group = new THREE.Group();
    group.position.set(rack.x, 0, rack.z);
    group.rotation.y = rack.ry;
    parent.add(group);

    for (const x of [-0.6, 0.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.45, 6), woodMat);
      post.position.set(x, 0.72, 0);
      post.castShadow = true;
      group.add(post);
      disposables.push(post.geometry);
    }

    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.45, 6), woodMat);
    beam.position.y = 1.3;
    beam.rotation.z = Math.PI / 2;
    beam.castShadow = true;
    group.add(beam);
    disposables.push(beam.geometry);

    for (let i = 0; i < 6; i += 1) {
      const herb = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 5), herbMat);
      herb.position.set(-0.45 + i * 0.18, 0.95, 0.02);
      herb.rotation.x = Math.PI;
      herb.castShadow = true;
      group.add(herb);
      disposables.push(herb.geometry);
    }
  }

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const radius = 13.2 + Math.sin(i * 1.7) * 0.6;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.25, 6), woodMat);
    post.position.set(Math.cos(angle) * radius, 0.62, Math.sin(angle) * radius);
    post.rotation.z = Math.sin(i) * 0.08;
    post.castShadow = true;
    parent.add(post);
    disposables.push(post.geometry);
  }

  for (let i = 0; i < 5; i += 1) {
    const mat = i % 2 === 0 ? hideMat : bannerMat;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.035), mat);
    banner.position.set(-6 + i * 3, 1.65, 7.1 + Math.sin(i) * 0.4);
    banner.rotation.y = 0.2 - i * 0.08;
    banner.userData.kind = "banner";
    parent.add(banner);
    disposables.push(banner.geometry);
  }
}

function createTotemPole(
  THREE: ThreeModule,
  parent: any,
  disposables: Disposable[],
  x: number,
  z: number
) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x50321f, roughness: 0.88 });
  const markMat = new THREE.MeshStandardMaterial({ color: 0xd0c097, emissive: 0x49351d, emissiveIntensity: 0.25, roughness: 0.65 });
  disposables.push(woodMat, markMat);

  const pole = new THREE.Group();
  pole.position.set(x, 0, z);
  parent.add(pole);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.6, 8), woodMat);
  trunk.position.y = 1.3;
  trunk.castShadow = true;
  pole.add(trunk);
  disposables.push(trunk.geometry);

  for (const side of [-1, 1]) {
    const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.2, 6), markMat);
    antler.position.set(side * 0.35, 2.45, 0);
    antler.rotation.z = side * 0.75;
    antler.castShadow = true;
    pole.add(antler);
    disposables.push(antler.geometry);
  }

  for (let i = 0; i < 4; i += 1) {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.035), markMat);
    mark.position.set(0, 0.7 + i * 0.34, 0.17);
    mark.rotation.z = i * 0.32;
    pole.add(mark);
    disposables.push(mark.geometry);
  }
}

function createForestRing(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x251a12, roughness: 0.98 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x162c1d, roughness: 0.92 });
  disposables.push(trunkMat, leafMat);

  for (let i = 0; i < 64; i += 1) {
    const angle = (i / 64) * Math.PI * 2;
    const radius = 17 + Math.sin(i * 2.1) * 2.2 + Math.random() * 2;
    const scale = 0.82 + Math.random() * 0.8;
    const tree = new THREE.Group();
    tree.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    tree.rotation.y = -angle;
    tree.userData.kind = "tree";
    parent.add(tree);

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, 2.3 * scale, 7), trunkMat);
    trunk.position.y = 1.15 * scale;
    trunk.castShadow = true;
    tree.add(trunk);
    disposables.push(trunk.geometry);

    for (let layer = 0; layer < 3; layer += 1) {
      const crown = new THREE.Mesh(new THREE.ConeGeometry((0.9 - layer * 0.16) * scale, 1.5 * scale, 7), leafMat);
      crown.position.y = (2 + layer * 0.58) * scale;
      crown.castShadow = true;
      tree.add(crown);
      disposables.push(crown.geometry);
    }
  }
}

function createDistantHills(THREE: ThreeModule, scene: any, disposables: Disposable[]) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x16251f, fog: true });
  disposables.push(mat);

  for (let i = 0; i < 14; i += 1) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(6 + Math.random() * 5, 6 + Math.random() * 6, 5), mat);
    hill.position.set(-42 + i * 6.5, -0.2, -36 - Math.random() * 8);
    hill.rotation.y = Math.random() * Math.PI;
    scene.add(hill);
    disposables.push(hill.geometry);
  }
}

function createStarfield(THREE: ThreeModule, scene: any, disposables: Disposable[]) {
  const count = 260;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const radius = 48 + Math.random() * 48;
    positions[i * 3] = Math.cos(theta) * radius;
    positions[i * 3 + 1] = 15 + Math.random() * 28;
    positions[i * 3 + 2] = Math.sin(theta) * radius;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xe8f2ff, size: 0.11, transparent: true, opacity: 0.72 });
  scene.add(new THREE.Points(geometry, material));
  disposables.push(geometry, material);
}
