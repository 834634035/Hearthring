import { playAttackAnimation, playJumpAnimation, type CharacterAnimator } from "./characterAnimation";

/**
 * Three.js 第三人称控制器。
 * 以角色 Object3D、相机和键盘状态为输入，每帧更新移动、朝向、地形起伏和相机跟随。
 */
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
  cameraSpringStiffness: number;
  cameraSpringDamping: number;
  lookAtFollowSpeed: number;
  speedDistanceBoost: number;
  lookAheadDistance: number;
  playerCollisionRadius: number;
  collisionCircles?: CollisionCircle[];
};

export type ThirdPersonPointer = {
  /** 当前相机环绕偏移（平滑后） */
  yaw: number;
  /** 鼠标输入累积的目标偏移/转向量 */
  yawTarget: number;
  pitch: number;
};

type KeyState = Record<string, boolean>;
export type CollisionCircle = {
  x: number;
  z: number;
  radius: number;
};
const PLAYER_WORLD_LIMIT = 58;

export function triggerPlayerAttack(animator: CharacterAnimator) {
  if (animator.isActionLocked() && !animator.isJumpLocked()) return false;
  return playAttackAnimation(animator) > 0;
}

export function triggerPlayerJump(animator: CharacterAnimator) {
  if (animator.isActionLocked()) return false;
  return playJumpAnimation(animator) > 0;
}

function angleDelta(from: number, to: number) {
  // 把角度差压到 -PI 到 PI，避免角色从 359 度绕远路转回 0 度。
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
  // 帧率无关的指数平滑，delta 越大单帧追得越多。
  return 1 - Math.exp(-speed * delta);
}

function terrainLift(x: number, z: number) {
  // 轻微的程序化地面起伏，让角色 y 轴不完全贴死在平面上。
  return Math.sin(x * 0.12 + z * 0.09) * 0.05;
}

function resolveCircleCollisions(
  THREE: any,
  position: any,
  playerRadius: number,
  circles: CollisionCircle[]
) {
  for (let pass = 0; pass < 3; pass += 1) {
    let moved = false;
    for (const circle of circles) {
      const dx = position.x - circle.x;
      const dz = position.z - circle.z;
      const minDistance = playerRadius + circle.radius;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= minDistance * minDistance) continue;

      const distance = Math.sqrt(distanceSq);
      if (distance < 1e-5) {
        position.x += minDistance;
      } else {
        const push = minDistance - distance;
        position.x += (dx / distance) * push;
        position.z += (dz / distance) * push;
      }
      moved = true;
    }
    if (!moved) break;
  }

  position.x = THREE.MathUtils.clamp(position.x, -PLAYER_WORLD_LIMIT, PLAYER_WORLD_LIMIT);
  position.z = THREE.MathUtils.clamp(position.z, -PLAYER_WORLD_LIMIT, PLAYER_WORLD_LIMIT);
}

function cameraYawFromCharacter(characterYaw: number, orbitYaw: number) {
  return characterYaw + Math.PI + orbitYaw;
}

function getCameraSpringState(THREE: any, camera: any, lookTarget: any) {
  const state = camera.userData.thirdPersonSpring as { velocity: any; lookTarget: any } | undefined;
  if (state) return state;

  const nextState = {
    velocity: new THREE.Vector3(),
    lookTarget: lookTarget.clone()
  };
  camera.userData.thirdPersonSpring = nextState;
  return nextState;
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
  // 动作锁用于保护攻击/跳跃等一次性动画，防止移动状态立刻把它覆盖。
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
  const moveDirection = new THREE.Vector3();
  const keyboardTurnInput = (keys.a ? 1 : 0) - (keys.d ? 1 : 0);
  const hasForwardBackInput = keys.w || keys.s;
  // moveDelta 使用 Three.Vector3 汇总 WASD 输入，再统一归一化，保证斜向移动不超速。
  const moveDelta = new THREE.Vector3();

  if (!movementBlocked) {
    if (hasForwardBackInput && keyboardTurnInput !== 0) {
      character.rotation.y += keyboardTurnInput * moveTurnRate * delta;
    }
    const driveForward =
      hasForwardBackInput && keyboardTurnInput !== 0
        ? new THREE.Vector3(Math.sin(character.rotation.y), 0, Math.cos(character.rotation.y))
        : viewForward;
    if (keys.w) moveDelta.add(driveForward);
    if (keys.s) moveDelta.sub(driveForward);
  }

  const moving = moveDelta.lengthSq() > 0;
  const speedFactor = moving ? (sprinting ? 1 : settings.walkSpeed / settings.sprintSpeed) : 0;

  if (moving) {
    animator.clearManualMode();
    moveDirection.copy(moveDelta).normalize();
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
  } else if (!movementBlocked && (Math.abs(pointer.yawTarget) > 1e-5 || keyboardTurnInput !== 0)) {
    pointer.yawTarget += keyboardTurnInput * settings.idleTurnSpeed * delta;
    const turnStep = Math.min(Math.abs(pointer.yawTarget), settings.idleTurnSpeed * delta) * Math.sign(pointer.yawTarget);
    character.rotation.y += turnStep;
    pointer.yawTarget -= turnStep;
    pointer.yaw += angleDelta(pointer.yaw, 0) * Math.min(1, cameraSmooth);
  } else {
    pointer.yaw += angleDelta(pointer.yaw, 0) * Math.min(1, cameraSmooth);
  }

  character.position.x = THREE.MathUtils.clamp(character.position.x, -PLAYER_WORLD_LIMIT, PLAYER_WORLD_LIMIT);
  character.position.z = THREE.MathUtils.clamp(character.position.z, -PLAYER_WORLD_LIMIT, PLAYER_WORLD_LIMIT);
  resolveCircleCollisions(THREE, character.position, settings.playerCollisionRadius, settings.collisionCircles ?? []);
  character.position.y = footOffsetY + terrainLift(character.position.x, character.position.z);

  // 根据移动状态驱动 AnimationMixer 中的待机/行走/奔跑循环。
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
    character.position.y + settings.lookAtHeight + speedFactor * 0.16,
    character.position.z
  );
  if (moving) {
    lookTarget.add(moveDirection.clone().multiplyScalar(settings.lookAheadDistance * speedFactor));
  }

  // 相机位置由角色朝向、鼠标环绕 yaw/pitch 和跟随距离共同决定。
  const orbitYaw = cameraYawFromCharacter(character.rotation.y, pointer.yaw);
  const cosPitch = Math.cos(pointer.pitch);
  const sinPitch = Math.sin(pointer.pitch);
  const dynamicDistance = settings.cameraDistance + settings.speedDistanceBoost * speedFactor;
  const offset = new THREE.Vector3(
    Math.sin(orbitYaw) * cosPitch * dynamicDistance,
    sinPitch * dynamicDistance + settings.cameraHeight,
    Math.cos(orbitYaw) * cosPitch * dynamicDistance
  );

  const desiredCameraPosition = lookTarget.clone().add(offset);
  const spring = getCameraSpringState(THREE, camera, lookTarget);
  const springDelta = Math.min(delta, 0.05);
  const springForce = desiredCameraPosition
    .clone()
    .sub(camera.position)
    .multiplyScalar(settings.cameraSpringStiffness);
  const dampingForce = spring.velocity.clone().multiplyScalar(settings.cameraSpringDamping);

  spring.velocity.add(springForce.sub(dampingForce).multiplyScalar(springDelta));
  camera.position.add(spring.velocity.clone().multiplyScalar(springDelta));
  spring.lookTarget.lerp(lookTarget, smoothStep(delta, settings.lookAtFollowSpeed));
  camera.lookAt(spring.lookTarget);
}
