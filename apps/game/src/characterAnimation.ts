/**
 * Three.js 角色动画适配层。
 * 这里把 GLTF 里的 AnimationClip 包装成游戏可用的行走、奔跑、攻击、跳跃状态。
 */
export type LoadedGltf = {
  scene: unknown;
  animations: Array<{ name: string; duration: number }>;
};

export type LocomotionState = "idle" | "walk" | "run";

export type CharacterAnimator = {
  clipNames: string[];
  play: (clipName: string, options?: { loop?: boolean; fade?: number; restart?: boolean }) => boolean;
  playOneShot: (clipName: string, fade?: number, lockKind?: ActionLockKind) => boolean;
  playManual: (clipName: string, options?: { loop?: boolean }) => void;
  setLocomotion: (state: LocomotionState, fade?: number) => void;
  clearManualMode: () => void;
  isActionLocked: () => boolean;
  isJumpLocked: () => boolean;
  isManualMode: () => boolean;
  getClipDuration: (clipName: string) => number | undefined;
  update: (delta: number) => void;
  dispose: () => void;
};

type ActionLockKind = "attack" | "jump";

type PlayOptions = {
  loop?: boolean;
  fade?: number;
  restart?: boolean;
};

const LOCOMOTION_CLIPS: Record<LocomotionState, string[]> = {
  idle: ["Idle_A", "Idle_B", "idle"],
  walk: ["Walking_A", "Walking_B", "Walking_C"],
  run: ["Running_A", "Running_B"]
};

const ATTACK_CLIP = "Throw";

const JUMP_CLIP_CANDIDATES = ["Jump_Full_Short", "Jump_Full_Long", "Jump_Start"];
const SKELETON_UTILS_URL = "https://esm.sh/three@0.176.0/examples/jsm/utils/SkeletonUtils.js";

function isLikelyOneShot(name: string) {
  return /death|hit|attack|use_|pick|throw|spawn|jump|land|interact/i.test(name);
}

export function createCharacterAnimator(THREE: any, root: unknown, clips: LoadedGltf["animations"]): CharacterAnimator {
  // AnimationMixer 是 Three 官方动画入口，负责按 delta 推进骨骼/节点动画。
  const mixer = new THREE.AnimationMixer(root);
  const actions = new Map<string, any>();
  const durations = new Map<string, number>();
  let currentAction: any | undefined;
  let currentLocomotion: LocomotionState | null = null;
  let manualMode = false;
  let actionLocked = false;
  let lockKind: ActionLockKind | null = null;
  let lockedAction: any | undefined;

  for (const clip of clips) {
    // 每个 clipAction 都绑定到当前角色 root，避免多个角色共享同一个动作状态。
    const action = mixer.clipAction(clip, root);
    actions.set(clip.name, action);
    durations.set(clip.name, clip.duration);
  }

  mixer.addEventListener("finished", (event: { action: any }) => {
    // 一次性动作结束后解锁移动，让攻击/跳跃不会永久卡住角色控制。
    if (event.action === lockedAction) {
      actionLocked = false;
      lockKind = null;
      lockedAction = undefined;
    }
  });

  const play = (clipName: string, options: PlayOptions = {}) => {
    const { loop = true, fade = 0.25, restart = false } = options;
    const resolved = resolveClipName(actions, clipName);
    const nextAction = resolved ? actions.get(resolved) : undefined;
    if (!nextAction) return false;

    if (currentAction === nextAction && nextAction.isRunning() && !restart) {
      return true;
    }

    nextAction.reset();
    // 循环动作使用 LoopRepeat；攻击/跳跃等一次性动作播放完后停在最后一帧。
    nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    nextAction.clampWhenFinished = !loop;
    nextAction.setEffectiveWeight(1);
    nextAction.timeScale = 1;

    if (currentAction && currentAction !== nextAction) {
      // 通过 fadeIn/fadeOut 混合动作，减少待机、行走、奔跑切换时的抽帧感。
      currentAction.fadeOut(fade);
      nextAction.reset().fadeIn(fade).play();
    } else if (fade > 0) {
      nextAction.fadeIn(fade).play();
    } else {
      nextAction.play();
    }

    currentAction = nextAction;
    return true;
  };

  const playOneShot = (clipName: string, fade = 0.08, kind: ActionLockKind = "attack") => {
    if (actionLocked && !(lockKind === "jump" && kind === "attack")) return false;
    if (!play(clipName, { loop: false, fade, restart: true })) return false;
    actionLocked = true;
    lockKind = kind;
    lockedAction = currentAction;
    manualMode = false;
    currentLocomotion = null;
    return true;
  };

  const setLocomotion = (state: LocomotionState, fade = 0.15) => {
    if (actionLocked || manualMode) return;
    if (currentLocomotion === state) return;
    currentLocomotion = state;
    for (const clipName of LOCOMOTION_CLIPS[state]) {
      if (play(clipName, { loop: true, fade })) return;
    }
  };

  const playManual = (clipName: string, options: { loop?: boolean } = {}) => {
    manualMode = true;
    currentLocomotion = null;
    actionLocked = false;
    lockKind = null;
    lockedAction = undefined;
    const loop = options.loop ?? !isLikelyOneShot(clipName);
    play(clipName, { loop, fade: 0.2, restart: true });
  };

  return {
    clipNames: [...actions.keys()],
    play,
    playOneShot,
    playManual,
    setLocomotion,
    clearManualMode() {
      manualMode = false;
      currentLocomotion = null;
    },
    isActionLocked: () => actionLocked,
    isJumpLocked: () => lockKind === "jump",
    isManualMode: () => manualMode,
    getClipDuration(clipName: string) {
      const resolved = resolveClipName(actions, clipName);
      return resolved ? durations.get(resolved) : undefined;
    },
    update(delta: number) {
      mixer.update(delta);
    },
    dispose() {
      mixer.stopAllAction();
    }
  };
}

export function playAttackAnimation(animator: CharacterAnimator) {
  if (animator.playOneShot(ATTACK_CLIP, 0.08)) {
    return animator.getClipDuration(ATTACK_CLIP) ?? 0.65;
  }
  return 0;
}

export function playJumpAnimation(animator: CharacterAnimator) {
  for (const clipName of JUMP_CLIP_CANDIDATES) {
    if (animator.playOneShot(clipName, 0.08, "jump")) {
      return animator.getClipDuration(clipName) ?? 0.55;
    }
  }
  return 0;
}

function resolveClipName(actions: Map<string, any>, clipName: string) {
  if (actions.has(clipName)) return clipName;
  const action = findAction(actions, clipName);
  if (!action) return undefined;
  for (const [name, candidate] of actions) {
    if (candidate === action) return name;
  }
  return undefined;
}

function findAction(actions: Map<string, any>, clipName: string) {
  if (actions.has(clipName)) return actions.get(clipName);

  const normalized = clipName.toLowerCase();

  for (const [name, action] of actions) {
    if (name.toLowerCase() === normalized) return action;
  }

  if (normalized === "idle") {
    for (const preferred of LOCOMOTION_CLIPS.idle) {
      if (actions.has(preferred)) return actions.get(preferred);
    }
  }

  if (normalized === "walk" || normalized === "walking") {
    for (const preferred of LOCOMOTION_CLIPS.walk) {
      if (actions.has(preferred)) return actions.get(preferred);
    }
  }

  if (normalized === "run" || normalized === "running") {
    for (const preferred of LOCOMOTION_CLIPS.run) {
      if (actions.has(preferred)) return actions.get(preferred);
    }
  }

  for (const [name, action] of actions) {
    const lower = name.toLowerCase();
    if (lower.startsWith(`${normalized}_`) || lower.startsWith(normalized)) {
      return action;
    }
  }

  for (const [name, action] of actions) {
    const lower = name.toLowerCase();
    if (normalized === "idle" && lower.includes("jump")) continue;
    if (lower.includes(normalized)) return action;
  }

  return undefined;
}

export async function loadCharacterWithAnimations(
  THREE: unknown,
  loadModelById: (three: unknown, id: string) => Promise<LoadedGltf>,
  characterId: string,
  animationPackIds: string | string[]
) {
  const packIds = Array.isArray(animationPackIds) ? animationPackIds : [animationPackIds];
  // 角色模型和动画包并行加载，动画包可以只提供 clips，不必重复角色网格。
  const [sourceCharacterGltf, ...animationGltfs] = await Promise.all([
    loadModelById(THREE, characterId),
    ...packIds.map((id) => loadModelById(THREE, id))
  ]);
  const characterGltf = {
    ...sourceCharacterGltf,
    scene: await cloneCharacterScene(sourceCharacterGltf.scene)
  };

  const clips = characterGltf.animations?.length
    ? characterGltf.animations
    : animationGltfs.flatMap((gltf) => gltf.animations ?? []);

  const animator = createCharacterAnimator(THREE, characterGltf.scene, clips);

  return { characterGltf, animationGltfs, animator };
}

async function cloneCharacterScene(scene: unknown) {
  try {
    // SkeletonUtils.clone 会正确复制蒙皮骨骼，多个 NPC/玩家实例才能独立播放动画。
    const { clone } = await import(/* @vite-ignore */ SKELETON_UTILS_URL);
    return clone(scene);
  } catch (error) {
    console.warn("[character] SkeletonUtils clone unavailable, falling back to Object3D.clone:", error);
    const object = scene as { clone?: (recursive?: boolean) => unknown };
    return object.clone ? object.clone(true) : scene;
  }
}
