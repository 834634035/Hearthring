import { playAttackAnimation, playJumpAnimation, type CharacterAnimator } from "./characterAnimation";

export type ThirdPersonSettings = {
  walkSpeed: number;
  sprintSpeed: number;
  mouseSensitivity: number;
  cameraDistance: number;
  cameraHeight: number;
  lookAtHeight: number;
  /** 移动时角色对齐方向的角速度（弧度/秒） */
  moveTurnSpeed: number;
  /** 站立时鼠标环视的角速度（弧度/秒） */
  idleTurnSpeed: number;
  cameraFollowSpeed: number;
};

export type ThirdPersonPointer = {
  /** 当前相机环绕偏移（平滑后） */
  yaw: number;
  /** 鼠标输入累积的目标偏移/转向量 */
  yawTarget: number;
  pitch: number;
};

type KeyState = Record<string, boolean>;
const PLAYER_WORLD_LIMIT = 58;

export function triggerPlayerAttack(animator: CharacterAnimator) {
  if (animator.isActionLocked()) return false;
  return playAttackAnimation(animator) > 0;
}

export function triggerPlayerJump(animator: CharacterAnimator) {
  if (animator.isActionLocked()) return false;
  return playJumpAnimation(animator) > 0;
}

function angleDelta(from: number, to: number) {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

function rotateTowardAngle(from: number, to: number, maxStep: number) {
  const delta = angleDelta(from, to);
  if (Math.abs(delta) <= maxStep) return to;
  return from + Math.sign(delta) * maxStep;
}

function smoothStep(delta: number, speed: number) {
  return 1 - Math.exp(-speed * delta);
}

function terrainLift(x: number, z: number) {
  return Math.sin(x * 0.12 + z * 0.09) * 0.05;
}

function cameraYawFromCharacter(characterYaw: number, orbitYaw: number) {
  return characterYaw + Math.PI + orbitYaw;
}

function decayOrbitOffset(current: number, delta: number, speed: number) {
  const step = speed * delta;
  if (Math.abs(current) <= step) return 0;
  return current - Math.sign(current) * step;
}

/** 用相机与角色的实际相对位置计算移动轴向，避免与 character.rotation.y 形成反馈环 */
function getCameraMoveBasis(
  THREE: any,
  character: any,
  camera: any,
  fallbackYaw: number
) {
  const forward = new THREE.Vector3(
    character.position.x - camera.position.x,
    0,
    character.position.z - camera.position.z
  );
  if (forward.lengthSq() < 1e-4) {
    forward.set(-Math.sin(fallbackYaw), 0, -Math.cos(fallbackYaw));
  } else {
    forward.normalize();
  }
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  return { forward, right };
}

export function updateThirdPersonPlayer(
  THREE: any,
  character: any,
  animator: CharacterAnimator,
  camera: any,
  pointer: ThirdPersonPointer,
  keys: KeyState,
  delta: number,
  settings: ThirdPersonSettings,
  footOffsetY: number
) {
  const actionLocked = animator.isActionLocked();
  const jumpLocked = animator.isJumpLocked();
  const movementBlocked = actionLocked && !jumpLocked;
  const sprinting = !!keys.shift;
  const speed = (sprinting ? settings.sprintSpeed : settings.walkSpeed) * delta;
  const moveTurnRate = settings.moveTurnSpeed * (sprinting ? 1.2 : 1);
  const cameraSmooth = smoothStep(delta, settings.cameraFollowSpeed);
  const fallbackYaw = cameraYawFromCharacter(character.rotation.y, pointer.yaw);
  const { forward: viewForward, right: viewRight } = getCameraMoveBasis(
    THREE,
    character,
    camera,
    fallbackYaw
  );
  const moveDelta = new THREE.Vector3();

  if (!movementBlocked) {
    if (keys.w) moveDelta.add(viewForward);
    if (keys.s) moveDelta.sub(viewForward);
    if (keys.d) moveDelta.add(viewRight);
    if (keys.a) moveDelta.sub(viewRight);
  }

  const moving = moveDelta.lengthSq() > 0;

  if (moving) {
    animator.clearManualMode();
    const moveDirection = moveDelta.clone().normalize();
    moveDelta.copy(moveDirection).multiplyScalar(speed);
    character.position.x += moveDelta.x;
    character.position.z += moveDelta.z;

    // 倒退时保持面向前方，避免角色与相机互相追逐导致画面抖动
    const facingRotation =
      moveDirection.dot(viewForward) < -0.01
        ? Math.atan2(viewForward.x, viewForward.z)
        : Math.atan2(moveDirection.x, moveDirection.z);
    character.rotation.y = rotateTowardAngle(
      character.rotation.y,
      facingRotation,
      moveTurnRate * delta
    );

    pointer.yawTarget = decayOrbitOffset(pointer.yawTarget, delta, settings.cameraFollowSpeed * 1.4);
    pointer.yaw += angleDelta(pointer.yaw, pointer.yawTarget) * Math.min(1, cameraSmooth * 1.6);
  } else if (!movementBlocked && Math.abs(pointer.yawTarget) > 1e-5) {
    const before = character.rotation.y;
    const targetYaw = before + pointer.yawTarget;
    character.rotation.y = rotateTowardAngle(before, targetYaw, settings.idleTurnSpeed * delta);
    pointer.yawTarget -= angleDelta(before, character.rotation.y);
    pointer.yaw += angleDelta(pointer.yaw, 0) * Math.min(1, cameraSmooth);
  } else {
    pointer.yaw += angleDelta(pointer.yaw, 0) * Math.min(1, cameraSmooth);
  }

  character.position.x = THREE.MathUtils.clamp(character.position.x, -PLAYER_WORLD_LIMIT, PLAYER_WORLD_LIMIT);
  character.position.z = THREE.MathUtils.clamp(character.position.z, -PLAYER_WORLD_LIMIT, PLAYER_WORLD_LIMIT);
  character.position.y = footOffsetY + terrainLift(character.position.x, character.position.z);

  if (!actionLocked && !animator.isManualMode()) {
    if (!moving) {
      animator.setLocomotion("idle");
    } else if (sprinting) {
      animator.setLocomotion("run");
    } else {
      animator.setLocomotion("walk");
    }
  }

  const lookTarget = new THREE.Vector3(
    character.position.x,
    character.position.y + settings.lookAtHeight,
    character.position.z
  );

  const orbitYaw = cameraYawFromCharacter(character.rotation.y, pointer.yaw);
  const cosPitch = Math.cos(pointer.pitch);
  const sinPitch = Math.sin(pointer.pitch);
  const offset = new THREE.Vector3(
    Math.sin(orbitYaw) * cosPitch * settings.cameraDistance,
    sinPitch * settings.cameraDistance + settings.cameraHeight,
    Math.cos(orbitYaw) * cosPitch * settings.cameraDistance
  );

  camera.position.copy(lookTarget).add(offset);
  camera.lookAt(lookTarget);
}
