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

function isLikelyOneShot(name: string) {
  return /death|hit|attack|use_|pick|throw|spawn|jump|land|interact/i.test(name);
}

export function createCharacterAnimator(THREE: any, root: unknown, clips: LoadedGltf["animations"]): CharacterAnimator {
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
    const action = mixer.clipAction(clip, root);
    actions.set(clip.name, action);
    durations.set(clip.name, clip.duration);
  }

  mixer.addEventListener("finished", (event: { action: any }) => {
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
    nextAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    nextAction.clampWhenFinished = !loop;
    nextAction.setEffectiveWeight(1);
    nextAction.timeScale = 1;

    if (currentAction && currentAction !== nextAction) {
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
    if (actionLocked) return false;
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
  const [characterGltf, ...animationGltfs] = await Promise.all([
    loadModelById(THREE, characterId),
    ...packIds.map((id) => loadModelById(THREE, id))
  ]);

  const clips = characterGltf.animations?.length
    ? characterGltf.animations
    : animationGltfs.flatMap((gltf) => gltf.animations ?? []);

  const animator = createCharacterAnimator(THREE, characterGltf.scene, clips);

  return { characterGltf, animationGltfs, animator };
}
