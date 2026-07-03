/**
 * Three.js 章节场景：负责村落探索、NPC 对话、角色控制和程序化环境。
 * React 只承载 HUD/弹层状态，WebGL 场景本体在 mountGraybudVillage 里创建和销毁。
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { CHAPTER_SCENES, type ChapterSceneDefinition } from "../chapterScenes";
import { loadCharacterWithAnimations, type CharacterAnimator } from "../characterAnimation";
import { CharacterEquipment } from "../characterEquipment";
import { loadModelById, clearModelCache, getModelEntry, isModelUrlAvailable } from "../modelAssets";
import { updateThirdPersonPlayer, triggerPlayerAttack, triggerPlayerJump } from "../thirdPersonPlayer";
import {
  findNearbyNpc,
  getNpcsForScene,
  npcDialoguePayload,
  spawnVillageNpc,
  type NpcDialoguePayload,
  type VillageNpcInstance
} from "../villageNpcs";
import { SceneDialogueOverlay } from "./SceneDialogueOverlay";
import type { ChapterQuestStep } from "../chapterQuestline";
type ThreeModule = any;

/** Three 的 geometry/material/texture 需要显式 dispose，避免切场景或 HMR 后占用 GPU 内存。 */
type Disposable = {
  dispose?: () => void;
};

type KeyState = Record<string, boolean>;

type SceneUiBridge = {
  /** WebGL 热循环通过桥接层通知 React，避免把 Three 对象塞进组件状态。 */
  setNearNpc: (npc: { id: string; name: string; title: string } | null) => void;
  openDialogue: (dialogue: NpcDialoguePayload) => void;
  closeDialogue: () => void;
  isDialogueOpen: () => boolean;
};

interface ThreeHearthSceneProps {
  /** 章节场景配置驱动相机、光照、出生点和环境功能开关。 */
  sceneDefinition?: ChapterSceneDefinition;
  activeQuest?: ChapterQuestStep | null;
  onQuestComplete?: (questId: string) => void;
}

export function ThreeHearthScene({
  sceneDefinition = CHAPTER_SCENES[0]!,
  activeQuest = null,
  onQuestComplete
}: ThreeHearthSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const fpsRef = useRef<HTMLSpanElement | null>(null);
  const [nearNpc, setNearNpc] = useState<{ id: string; name: string; title: string } | null>(null);
  const [dialogue, setDialogue] = useState<NpcDialoguePayload | null>(null);
  const dialogueOpenRef = useRef(false);

  // Three 的键盘/动画循环读取 ref，避免每帧触发 React 重渲染。
  dialogueOpenRef.current = dialogue !== null;

  // 每次切换章节场景都重建一次 WebGL 世界，旧世界在 cleanup 中释放资源。
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
      // 动态加载 Three，降低 web 首屏包体；加载完成后再挂载真实场景。
      cleanup = mountGraybudVillage(THREE, mount, uiBridge, fpsRef, sceneDefinition);
    });

    const teardown = () => {
      disposed = true;
      cleanup?.();
    };

    import.meta.hot?.dispose(teardown);

    return teardown;
  }, [sceneDefinition]);

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
      <SceneDialogueOverlay
        nearNpc={nearNpc}
        dialogue={dialogue}
        activeQuest={activeQuest}
        onQuestComplete={onQuestComplete}
        onClose={() => setDialogue(null)}
      />
      <div className="scene-fps" aria-hidden="true">
        <span ref={fpsRef}>-- FPS</span>
      </div>
      <div className="scene-hud" aria-hidden="true">
        <strong>{sceneDefinition.name}</strong>
        <span>WASD 移动 · 左键攻击 · 空格跳跃 · E 对话 · 按住拖拽环视 · Shift 冲刺</span>
        <span>{sceneDefinition.summary}</span>
      </div>
    </div>
  );
}

function mountGraybudVillage(
  THREE: ThreeModule,
  mount: HTMLDivElement,
  ui: SceneUiBridge,
  fpsRef: RefObject<HTMLSpanElement | null>,
  sceneDefinition: ChapterSceneDefinition
) {
  const disposables: Disposable[] = [];
  // Scene 是整个 Three 世界根节点，背景色和雾效都绑定在这里。
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sceneDefinition.skyColor);
  scene.fog = new THREE.FogExp2(sceneDefinition.fogColor, sceneDefinition.id === "sprout-seeking-ravine" ? 0.038 : 0.028);

  // 透视相机用于第三人称跟随，初始位置来自章节配置。
  const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.1, 180);
  camera.position.set(...sceneDefinition.camera.position);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  // 色彩空间和 ACES tone mapping 让火光/夜景更接近真实曝光。
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(getScenePixelRatio());
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  // 可交互世界统一挂到 world 下；天空、星场等远景可以直接挂 scene。
  const world = new THREE.Group();
  scene.add(world);

  // 半球光给基础环境亮度，月光负责方向阴影，火光负责营地中心的暖色照明。
  const ambient = new THREE.HemisphereLight(0xb8cfc6, 0x2a1b12, sceneDefinition.ambientIntensity);
  scene.add(ambient);

  const moon = new THREE.DirectionalLight(0x9db6c7, sceneDefinition.moonIntensity);
  moon.position.set(-9, 16, 8);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  scene.add(moon);

  const fireLight = new THREE.PointLight(0xff7a2a, sceneDefinition.fireIntensity, 24, 1.4);
  fireLight.position.set(0, 1.25, 0);
  fireLight.castShadow = false;
  scene.add(fireLight);
  exposeSceneDiagnostics(renderer, scene, world, sceneDefinition.id);

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
  // 外部角色模型按包围盒贴地后，仍用该偏移维持脚底高度。
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
  const sceneNpcs = getNpcsForScene(sceneDefinition.id);

  createGround(THREE, world, disposables, sceneDefinition);
  // 场景功能由 ChapterSceneDefinition.features 决定，便于复用同一个 renderer 逻辑生成不同地点。
  createSceneFeatures(THREE, world, disposables, sceneDefinition);
  createForestRing(THREE, world, disposables);
  createDistantHills(THREE, scene, disposables);
  createStarfield(THREE, scene, disposables);
  void loadChapterSceneAssets(THREE, world, sceneDefinition, disposables, () => sceneDisposed);

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
      character.position.set(sceneDefinition.spawn[0], playerFootOffsetY + sceneDefinition.spawn[1], sceneDefinition.spawn[2]);
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
    sceneNpcs.map((definition) => spawnVillageNpc(THREE, world, loadModelById, definition, disposables, sceneDefinition.id))
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
      console.info("[hearth] scene npcs:", npcs.map((npc) => npc.definition.name).join(", "));
    })
    .catch((error: unknown) => {
      console.error("Failed to load village npc:", error);
    });

  if (sceneDefinition.id === "gray-sprout-hearth") void (async () => {
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
    renderer.setPixelRatio(getScenePixelRatio());
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
        writeSceneDiagnostics(renderer, scene, world, sceneDefinition.id);
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
      camera.position.set(...sceneDefinition.camera.position);
      camera.lookAt(...sceneDefinition.camera.lookAt);
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
    clearSceneDiagnostics(renderer);
    if (renderer.domElement.parentElement === mount) {
      mount.removeChild(renderer.domElement);
    }
  };
}

function getScenePixelRatio() {
  return Math.min(window.devicePixelRatio || 1, 1.5);
}

function exposeSceneDiagnostics(renderer: any, scene: any, world: any, sceneId: string) {
  const global = window as typeof window & {
    __THREE_HEARTH_SCENE__?: {
      renderer: unknown;
      get state(): Record<string, unknown>;
    };
  };

  global.__THREE_HEARTH_SCENE__ = {
    renderer: renderer.info,
    get state() {
      return getSceneDiagnostics(renderer, scene, world, sceneId);
    }
  };
  writeSceneDiagnostics(renderer, scene, world, sceneId);
}

function getSceneDiagnostics(renderer: any, scene: any, world: any, sceneId: string) {
  let meshes = 0;
  let instancedMeshes = 0;
  let points = 0;
  let lights = 0;
  world.traverse((object: any) => {
    if (object.isInstancedMesh) instancedMeshes += 1;
    if (object.isMesh) meshes += 1;
    if (object.isPoints) points += 1;
    if (object.isLight) lights += 1;
  });
  scene.traverse((object: any) => {
    if (object.isLight) lights += 1;
  });
  return {
    sceneId,
    meshes,
    instancedMeshes,
    points,
    lights,
    pixelRatio: renderer.getPixelRatio(),
    render: renderer.info.render,
    memory: renderer.info.memory
  };
}

function writeSceneDiagnostics(renderer: any, scene: any, world: any, sceneId: string) {
  renderer.domElement.dataset.sceneDiagnostics = JSON.stringify(getSceneDiagnostics(renderer, scene, world, sceneId));
}

function clearSceneDiagnostics(renderer: any) {
  const global = window as typeof window & { __THREE_HEARTH_SCENE__?: { renderer?: unknown } };
  if (global.__THREE_HEARTH_SCENE__?.renderer === renderer.info) {
    delete global.__THREE_HEARTH_SCENE__;
  }
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
  // 这里只放手写环境动效；角色动画交给 AnimationMixer。
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
  // 火光强度叠加两组正弦波，模拟不规则闪烁。
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

function createGround(
  THREE: ThreeModule,
  parent: any,
  disposables: Disposable[],
  sceneDefinition: ChapterSceneDefinition
) {
  // 地面由大圆盘和路径方块组成，材质全部加入 disposables 统一释放。
  const groundMat = new THREE.MeshStandardMaterial({ color: sceneDefinition.groundColor, roughness: 0.96 });
  const pathMat = new THREE.MeshStandardMaterial({ color: sceneDefinition.pathColor, roughness: 1 });
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

// 根据章节 features 组合场景模块，让不同地图共享同一套生成函数。
function createSceneFeatures(
  THREE: ThreeModule,
  parent: any,
  disposables: Disposable[],
  sceneDefinition: ChapterSceneDefinition
) {
  if (sceneDefinition.features.includes("hearth")) createHearth(THREE, parent, disposables);
  if (sceneDefinition.features.includes("houses")) createHouses(THREE, parent, disposables);
  if (sceneDefinition.features.includes("ancestorPoles")) {
    createTotemPole(THREE, parent, disposables, -2.7, -2.1);
    createTotemPole(THREE, parent, disposables, 2.8, -2.0);
  }
  if (sceneDefinition.features.includes("herbRacks")) createHerbRacks(THREE, parent, disposables);
  if (sceneDefinition.features.includes("creek")) createCreek(THREE, parent, disposables);
  if (sceneDefinition.features.includes("ravine")) createRavine(THREE, parent, disposables);
  if (sceneDefinition.features.includes("huntingBlind")) createHuntingBlind(THREE, parent, disposables);
  if (sceneDefinition.features.includes("cart")) createHerbCart(THREE, parent, disposables);
  if (sceneDefinition.features.includes("oxTracks")) createOxTracks(THREE, parent, disposables);
}

async function loadChapterSceneAssets(
  THREE: ThreeModule,
  parent: any,
  sceneDefinition: ChapterSceneDefinition,
  disposables: Disposable[],
  isDisposed: () => boolean
) {
  const loaded = await Promise.allSettled(
    sceneDefinition.assets.map(async (placement) => {
      const gltf = await loadModelById(THREE, placement.modelId);
      return { placement, object: (gltf.scene as any).clone(true) };
    })
  );

  for (const result of loaded) {
    if (isDisposed()) return;
    if (result.status === "rejected") {
      console.warn("[chapter-scene] asset skipped:", result.reason);
      continue;
    }

    const { placement, object } = result.value;
    object.position.set(...placement.position);
    if (placement.rotation) object.rotation.set(...placement.rotation);
    object.scale.setScalar(placement.scale ?? 1);
    object.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    parent.add(object);
  }
}

function createHearth(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  // 火塘是场景视觉中心：石环/木柴使用 InstancedMesh，火焰和余烬负责动态氛围。
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

  const instanceDummy = new THREE.Object3D();
  const stoneGeometry = new THREE.BoxGeometry(0.42, 0.18, 0.32);
  const stones = new THREE.InstancedMesh(stoneGeometry, ringMat, 28);
  stones.castShadow = true;
  stones.receiveShadow = true;
  hearth.add(stones);
  disposables.push(stoneGeometry);
  for (let i = 0; i < 28; i += 1) {
    const angle = (i / 28) * Math.PI * 2;
    instanceDummy.position.set(Math.cos(angle) * 1.65, 0.11, Math.sin(angle) * 1.65);
    instanceDummy.rotation.set(0, -angle + Math.sin(i) * 0.16, 0);
    instanceDummy.scale.setScalar(1);
    instanceDummy.updateMatrix();
    stones.setMatrixAt(i, instanceDummy.matrix);
  }
  stones.instanceMatrix.needsUpdate = true;

  const logGeometry = new THREE.CylinderGeometry(0.08, 0.1, 1.15, 8);
  const logs = new THREE.InstancedMesh(logGeometry, woodMat, 7);
  logs.castShadow = true;
  hearth.add(logs);
  disposables.push(logGeometry);
  for (let i = 0; i < 7; i += 1) {
    instanceDummy.position.set(Math.sin(i) * 0.22, 0.14, Math.cos(i * 1.8) * 0.22);
    instanceDummy.rotation.set(Math.PI / 2, i * 0.48, i * 0.7);
    instanceDummy.scale.setScalar(1);
    instanceDummy.updateMatrix();
    logs.setMatrixAt(i, instanceDummy.matrix);
  }
  logs.instanceMatrix.needsUpdate = true;

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

// 房屋由少量基础几何体拼装，适合保持低面数并快速调整布局。
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

function createHerbRacks(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  // 草药架使用重复的小几何体营造采集/晾晒区域。
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3c2819, roughness: 0.94 });
  const herbMat = new THREE.MeshStandardMaterial({ color: 0x7fa45a, roughness: 0.88 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x92744d, roughness: 0.92 });
  disposables.push(woodMat, herbMat, clothMat);

  const racks = [
    { x: -4.2, z: 3.3, ry: 0.4 },
    { x: 4.4, z: 3.2, ry: -0.35 },
    { x: -1.8, z: 6.3, ry: 0 },
    { x: 2.2, z: -2.8, ry: 0.2 }
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

    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.025, 0.55), clothMat);
    mat.position.set(0, 0.06, -0.34);
    mat.receiveShadow = true;
    group.add(mat);
    disposables.push(mat.geometry);
  }
}

function createCreek(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  // 溪流用半透明材质和盐痕几何体表现任务线索。
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x365b67,
    emissive: 0x102c34,
    emissiveIntensity: 0.28,
    roughness: 0.42,
    transparent: true,
    opacity: 0.78
  });
  const saltMat = new THREE.MeshStandardMaterial({ color: 0xd9d1b7, roughness: 0.7 });
  disposables.push(waterMat, saltMat);

  const creek = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.035, 18), waterMat);
  creek.position.set(0.8, 0.04, -1.4);
  creek.rotation.y = -0.18;
  creek.receiveShadow = true;
  parent.add(creek);
  disposables.push(creek.geometry);

  for (let i = 0; i < 22; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const salt = new THREE.Mesh(new THREE.BoxGeometry(0.5 + (i % 3) * 0.16, 0.018, 0.08), saltMat);
    salt.position.set(0.8 + side * (1.1 + Math.sin(i) * 0.18), 0.065, -8 + i * 0.72);
    salt.rotation.y = Math.sin(i * 1.3) * 0.7;
    parent.add(salt);
    disposables.push(salt.geometry);
  }
}

function createRavine(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2b3029, roughness: 1 });
  disposables.push(rockMat);

  for (let i = 0; i < 16; i += 1) {
    for (const side of [-1, 1]) {
      const rock = new THREE.Mesh(new THREE.ConeGeometry(1.2 + Math.random() * 0.7, 1.8 + Math.random() * 1.6, 5), rockMat);
      rock.position.set(side * (4.2 + Math.random() * 1.2), 0.75, -7 + i * 0.9);
      rock.rotation.set(Math.random() * 0.18, Math.random() * Math.PI, side * 0.24);
      rock.castShadow = true;
      rock.receiveShadow = true;
      parent.add(rock);
      disposables.push(rock.geometry);
    }
  }
}

function createHuntingBlind(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  // 狩猎伏棚是程序化小道具组合，提供场景辨识度和遮挡层次。
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2e2117, roughness: 0.96 });
  const hideMat = new THREE.MeshStandardMaterial({ color: 0x8d6848, roughness: 0.94 });
  disposables.push(woodMat, hideMat);

  const blind = new THREE.Group();
  blind.position.set(-2.2, 0, 2.7);
  blind.rotation.y = 0.32;
  parent.add(blind);

  for (const x of [-0.7, 0.7]) {
    for (const z of [-0.35, 0.35]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.6, 6), woodMat);
      post.position.set(x, 0.8, z);
      post.castShadow = true;
      blind.add(post);
      disposables.push(post.geometry);
    }
  }

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.95), woodMat);
  deck.position.y = 0.82;
  deck.castShadow = true;
  deck.receiveShadow = true;
  blind.add(deck);
  disposables.push(deck.geometry);

  const screen = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.72, 0.06), hideMat);
  screen.position.set(0, 1.26, -0.44);
  screen.castShadow = true;
  blind.add(screen);
  disposables.push(screen.geometry);
}

function createHerbCart(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1d, roughness: 0.94 });
  const herbMat = new THREE.MeshStandardMaterial({ color: 0x8da75e, roughness: 0.85 });
  disposables.push(woodMat, herbMat);

  const cart = new THREE.Group();
  cart.position.set(-1.8, 0, 2.6);
  cart.rotation.y = -0.24;
  parent.add(cart);

  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.35, 1.1), woodMat);
  bed.position.y = 0.48;
  bed.castShadow = true;
  cart.add(bed);
  disposables.push(bed.geometry);

  for (const x of [-0.9, 0.9]) {
    for (const z of [-0.62, 0.62]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12), woodMat);
      wheel.position.set(x, 0.28, z);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      cart.add(wheel);
      disposables.push(wheel.geometry);
    }
  }

  for (let i = 0; i < 11; i += 1) {
    const bundle = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.72, 6), herbMat);
    bundle.position.set(-0.85 + i * 0.17, 0.88, Math.sin(i) * 0.2);
    bundle.rotation.x = Math.PI / 2 + Math.sin(i) * 0.28;
    bundle.castShadow = true;
    cart.add(bundle);
    disposables.push(bundle.geometry);
  }
}

function createOxTracks(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x1d1a14, roughness: 1 });
  disposables.push(trackMat);

  for (let i = 0; i < 18; i += 1) {
    const z = 5.2 - i * 0.58;
    for (const x of [-0.42, 0.42]) {
      const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.018, 0.42), trackMat);
      hoof.position.set(x + Math.sin(i * 0.8) * 0.16, 0.055, z);
      hoof.rotation.y = Math.sin(i * 0.4) * 0.4;
      parent.add(hoof);
      disposables.push(hoof.geometry);
    }
  }
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

// 图腾柱用层叠标记强化部落符号，同时保持几何体很轻。
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
  // 远处森林使用 InstancedMesh 批量绘制，减少 draw call。
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x251a12, roughness: 0.98 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x162c1d, roughness: 0.92 });
  disposables.push(trunkMat, leafMat);

  const treeCount = 64;
  const dummy = new THREE.Object3D();
  const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.18, 2.3, 7);
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMat, treeCount);
  trunks.castShadow = true;
  parent.add(trunks);
  disposables.push(trunkGeometry);

  const crownGeometries = [0, 1, 2].map((layer) => new THREE.ConeGeometry(0.9 - layer * 0.16, 1.5, 7));
  const crowns = crownGeometries.map((geometry) => {
    const mesh = new THREE.InstancedMesh(geometry, leafMat, treeCount);
    mesh.castShadow = true;
    parent.add(mesh);
    disposables.push(geometry);
    return mesh;
  });

  for (let i = 0; i < treeCount; i += 1) {
    const angle = (i / 64) * Math.PI * 2;
    const radius = 17 + Math.sin(i * 2.1) * 2.2 + Math.random() * 2;
    const scale = 0.82 + Math.random() * 0.8;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    dummy.position.set(x, 1.15 * scale, z);
    dummy.rotation.set(0, -angle, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let layer = 0; layer < 3; layer += 1) {
      dummy.position.set(x, (2 + layer * 0.58) * scale, z);
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      crowns[layer]!.setMatrixAt(i, dummy.matrix);
    }
  }

  trunks.instanceMatrix.needsUpdate = true;
  for (const crown of crowns) {
    crown.instanceMatrix.needsUpdate = true;
  }
}

// 远山直接挂到 scene，配合雾效形成背景层次。
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

// 星场使用 Points + BufferGeometry，一次提交大量点位，比逐个 Mesh 更轻。
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
