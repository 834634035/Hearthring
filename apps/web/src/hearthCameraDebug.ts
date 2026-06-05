import { GUI } from "lil-gui";

interface CameraLike {
  position: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void };
  fov: number;
  updateProjectionMatrix: () => void;
  lookAt: (target: { x: number; y: number; z: number }) => void;
}

interface LookTargetLike {
  x: number;
  y: number;
  z: number;
  set: (x: number, y: number, z: number) => void;
}

interface CameraDefaults {
  posX: number;
  posY: number;
  posZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  fov: number;
}

export function attachHearthCameraGui(camera: CameraLike, lookTarget: LookTargetLike, defaults: CameraDefaults) {
  const gui = new GUI({ title: "火塘相机调试", width: 320 });
  gui.domElement.style.zIndex = "20";

  const params = { ...defaults };

  const apply = () => {
    camera.position.set(params.posX, params.posY, params.posZ);
    lookTarget.set(params.targetX, params.targetY, params.targetZ);
    camera.fov = params.fov;
    camera.updateProjectionMatrix();
    camera.lookAt(lookTarget);
  };

  const posFolder = gui.addFolder("相机位置");
  posFolder.add(params, "posX", -20, 20, 0.01).onChange(apply);
  posFolder.add(params, "posY", -5, 15, 0.01).onChange(apply);
  posFolder.add(params, "posZ", 1, 25, 0.01).onChange(apply);
  posFolder.open();

  const targetFolder = gui.addFolder("注视点");
  targetFolder.add(params, "targetX", -10, 10, 0.01).onChange(apply);
  targetFolder.add(params, "targetY", -5, 10, 0.01).onChange(apply);
  targetFolder.add(params, "targetZ", -10, 10, 0.01).onChange(apply);
  targetFolder.open();

  gui.add(params, "fov", 20, 90, 1).onChange(apply);

  const actions = {
    复制配置到控制台: () => {
      const snippet = [
        `camera.position.set(${params.posX.toFixed(2)}, ${params.posY.toFixed(2)}, ${params.posZ.toFixed(2)});`,
        `lookTarget.set(${params.targetX.toFixed(2)}, ${params.targetY.toFixed(2)}, ${params.targetZ.toFixed(2)});`,
        `camera.fov = ${params.fov.toFixed(1)};`
      ].join("\n");
      console.log("[火塘相机配置]\n" + snippet);
      void navigator.clipboard?.writeText(snippet);
    },
    重置默认: () => {
      Object.assign(params, defaults);
      gui.controllersRecursive().forEach((controller) => controller.updateDisplay());
      apply();
    }
  };

  gui.add(actions, "复制配置到控制台");
  gui.add(actions, "重置默认");

  apply();
  return gui;
}
