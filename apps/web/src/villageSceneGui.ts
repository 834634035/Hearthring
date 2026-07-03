import { GUI } from "lil-gui";
import type { CharacterAnimator } from "./characterAnimation";
import {
  CharacterEquipment,
  KAYKIT_WEAPON_OPTIONS,
  idForWeaponLabel,
  labelForWeaponId
} from "./characterEquipment";

/**
 * Three.js 开发调参面板。
 * lil-gui 不参与正式玩法，只把相机、移动、灯光、雾效和角色装备参数暴露出来方便现场调试。
 */
export type VillageMovementSettings = {
  walkSpeed: number;
  sprintSpeed: number;
  mouseSensitivity: number;
};

export type VillageThirdPersonSettings = {
  cameraDistance: number;
  cameraHeight: number;
  lookAtHeight: number;
  moveTurnSpeed: number;
  idleTurnSpeed: number;
  cameraFollowSpeed: number;
};

export type VillageLightingSettings = {
  fireIntensity: number;
  moonIntensity: number;
  ambientIntensity: number;
};

export type VillageFogSettings = {
  density: number;
};

type CameraLike = {
  position: { x: number; y: number; z: number; set?: (x: number, y: number, z: number) => void };
  fov: number;
  updateProjectionMatrix: () => void;
  rotation: { y: number; x: number };
};

type PointerLike = {
  yaw: number;
  yawTarget?: number;
  pitch: number;
};

type SceneLike = {
  fog: { density: number } | null;
};

export function attachVillageSceneGui(options: {
  camera: CameraLike;
  pointer: PointerLike;
  movement: VillageMovementSettings;
  thirdPerson?: VillageThirdPersonSettings;
  lighting: VillageLightingSettings;
  fog: VillageFogSettings;
  fireLight: { intensity: number };
  moon: { intensity: number };
  ambient: { intensity: number };
  scene: SceneLike;
}) {
  const gui = new GUI({ title: "灰芽火塘地 · 控制", width: 340 });
  gui.domElement.style.zIndex = "30";

  // 记录初始相机参数，便于调乱后快速恢复到场景配置里的默认视角。
  const cameraDefaults = {
    yaw: options.pointer.yaw,
    pitch: options.pointer.pitch,
    fov: options.camera.fov,
    posX: options.camera.position.x,
    posY: options.camera.position.y,
    posZ: options.camera.position.z
  };

  const cameraParams = { ...cameraDefaults };

  const applyCamera = () => {
    // 第三人称模式下直接改 pointer；下一帧控制器会用 pointer 重算 Three 相机位置。
    options.pointer.yaw = cameraParams.yaw;
    if (options.pointer.yawTarget !== undefined) {
      options.pointer.yawTarget = cameraParams.yaw;
    }
    options.pointer.pitch = cameraParams.pitch;
    options.camera.fov = cameraParams.fov;
    options.camera.updateProjectionMatrix();
  };

  const cameraFolder = gui.addFolder("相机");
  cameraFolder.add(cameraParams, "yaw", -Math.PI, Math.PI, 0.01).name(options.thirdPerson ? "环绕偏移 yaw" : "水平角 yaw").onChange(applyCamera);
  cameraFolder.add(cameraParams, "pitch", -0.35, 1.1, 0.01).name("俯仰 pitch").onChange(applyCamera);
  cameraFolder.add(cameraParams, "fov", 35, 95, 1).name("视野 FOV").onChange(applyCamera);
  if (!options.thirdPerson) {
    cameraFolder.add(cameraParams, "posX", -18, 18, 0.05).name("位置 X").onChange(() => {
      options.camera.position.x = cameraParams.posX;
    });
    cameraFolder.add(cameraParams, "posY", 0.5, 8, 0.05).name("位置 Y").onChange(() => {
      options.camera.position.y = cameraParams.posY;
    });
    cameraFolder.add(cameraParams, "posZ", -18, 18, 0.05).name("位置 Z").onChange(() => {
      options.camera.position.z = cameraParams.posZ;
    });
  }
  cameraFolder.open();

  const moveFolder = gui.addFolder("移动");
  moveFolder.add(options.movement, "walkSpeed", 1, 12, 0.1).name("行走速度");
  moveFolder.add(options.movement, "sprintSpeed", 2, 20, 0.1).name("冲刺速度 Shift");
  moveFolder.add(options.movement, "mouseSensitivity", 0.001, 0.012, 0.0005).name("鼠标灵敏度");
  if (options.thirdPerson) {
    moveFolder.add(options.thirdPerson, "cameraDistance", 2.5, 12, 0.1).name("相机距离");
    moveFolder.add(options.thirdPerson, "cameraHeight", 0.2, 3.5, 0.05).name("相机高度");
    moveFolder.add(options.thirdPerson, "lookAtHeight", 0.8, 2.2, 0.05).name("注视高度");
    moveFolder.add(options.thirdPerson, "moveTurnSpeed", 8, 32, 0.5).name("移动转向");
    moveFolder.add(options.thirdPerson, "idleTurnSpeed", 4, 24, 0.5).name("待机转向");
    moveFolder.add(options.thirdPerson, "cameraFollowSpeed", 4, 28, 0.5).name("相机跟随");
  }
  moveFolder.open();

  const lightFolder = gui.addFolder("光照");
  lightFolder
    .add(options.lighting, "fireIntensity", 0, 40, 0.5)
    .name("火光强度");
  lightFolder
    .add(options.lighting, "moonIntensity", 0, 2, 0.05)
    .name("月光强度")
    .onChange((value: number) => {
      options.moon.intensity = value;
    });
  lightFolder
    .add(options.lighting, "ambientIntensity", 0, 2, 0.05)
    .name("环境光强度")
    .onChange((value: number) => {
      options.ambient.intensity = value;
    });
  lightFolder.open();

  const fogFolder = gui.addFolder("雾效");
  fogFolder
    .add(options.fog, "density", 0, 0.12, 0.001)
    .name("浓度")
    .onChange((value: number) => {
      if (options.scene.fog) options.scene.fog.density = value;
    });
  fogFolder.open();

  const syncFromScene = () => {
    // 把当前 Three 相机/指针状态同步回 GUI，适合手动绕场景后复制参数。
    cameraParams.yaw = options.pointer.yaw;
    cameraParams.pitch = options.pointer.pitch;
    cameraParams.fov = options.camera.fov;
    cameraParams.posX = options.camera.position.x;
    cameraParams.posY = options.camera.position.y;
    cameraParams.posZ = options.camera.position.z;
    gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
  };

  const actions = {
    同步当前相机到面板: () => syncFromScene(),
    复制相机配置: () => {
      syncFromScene();
      const snippet = [
        `camera.position.set(${cameraParams.posX.toFixed(2)}, ${cameraParams.posY.toFixed(2)}, ${cameraParams.posZ.toFixed(2)});`,
        `pointer.yaw = ${cameraParams.yaw.toFixed(3)};`,
        `pointer.pitch = ${cameraParams.pitch.toFixed(3)};`,
        `camera.fov = ${cameraParams.fov.toFixed(1)};`
      ].join("\n");
      console.log("[灰芽场景相机配置]\n" + snippet);
      void navigator.clipboard?.writeText(snippet);
    },
    重置相机默认: () => {
      Object.assign(cameraParams, cameraDefaults);
      if (options.camera.position.set) {
        options.camera.position.set(cameraDefaults.posX, cameraDefaults.posY, cameraDefaults.posZ);
      } else {
        options.camera.position.x = cameraDefaults.posX;
        options.camera.position.y = cameraDefaults.posY;
        options.camera.position.z = cameraDefaults.posZ;
      }
      applyCamera();
      gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
    }
  };

  gui.add(actions, "同步当前相机到面板");
  gui.add(actions, "复制相机配置");
  gui.add(actions, "重置相机默认");

  let characterFolder: GUI | undefined;

  const registerCharacter = (
    animator: CharacterAnimator,
    equipment: CharacterEquipment,
    ctx: {
      THREE: unknown;
      loadModelById: (three: unknown, id: string) => Promise<{ scene: unknown }>;
    }
  ) => {
    characterFolder?.destroy();
    characterFolder = gui.addFolder("角色");

    // 动画列表来自当前 GLTF 的 clipNames，可直接测试 AnimationMixer 里的任意片段。
    const animParams = {
      clip: animator.clipNames.includes("Idle_A") ? "Idle_A" : animator.clipNames[0] ?? ""
    };
    characterFolder
      .add(animParams, "clip", animator.clipNames)
      .name("动作")
      .onChange((name: string) => {
        animator.playManual(name);
      });

    const weaponLabels = KAYKIT_WEAPON_OPTIONS.map((option) => option.label);
    // 装备切换会动态加载模型并挂到角色骨骼插槽上。
    const equipParams = {
      rightWeapon: labelForWeaponId(equipment.getEquippedId("right")),
      leftWeapon: labelForWeaponId(equipment.getEquippedId("left"))
    };

    characterFolder
      .add(equipParams, "rightWeapon", weaponLabels)
      .name("右手武器")
      .onChange((label: string) => {
        void equipment.equip(ctx.THREE, ctx.loadModelById, "right", idForWeaponLabel(label)).catch(console.error);
      });
    characterFolder
      .add(equipParams, "leftWeapon", weaponLabels)
      .name("左手武器/盾")
      .onChange((label: string) => {
        void equipment.equip(ctx.THREE, ctx.loadModelById, "left", idForWeaponLabel(label)).catch(console.error);
      });

    characterFolder.open();
  };

  return {
    registerCharacter,
    syncFromScene,
    destroy() {
      characterFolder?.destroy();
      gui.destroy();
    }
  };
}
