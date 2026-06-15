export type SceneFeature =
  | "hearth"
  | "houses"
  | "herbRacks"
  | "ancestorPoles"
  | "creek"
  | "ravine"
  | "huntingBlind"
  | "cart"
  | "oxTracks";

export interface ChapterSceneAsset {
  modelId: string;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
}

export interface ChapterSceneDefinition {
  id: string;
  name: string;
  subtitle: string;
  type: string;
  summary: string;
  groundColor: number;
  pathColor: number;
  fogColor: number;
  skyColor: number;
  fireIntensity: number;
  moonIntensity: number;
  ambientIntensity: number;
  features: SceneFeature[];
  camera: {
    position: [number, number, number];
    lookAt: [number, number, number];
  };
  spawn: [number, number, number];
  assets: ChapterSceneAsset[];
}

export const CHAPTER_SCENES: ChapterSceneDefinition[] = [
  {
    id: "gray-sprout-hearth",
    name: "灰芽火塘",
    subtitle: "支火共同体的中心，祖名、草药和幼兽都围着火塘生活。",
    type: "settlement-core",
    summary: "第一章的情感锚点。玩家先相信青岚属于这里，再从火光里的潮声感到轻微不安。",
    groundColor: 0x314234,
    pathColor: 0x6b5a3f,
    fogColor: 0x101813,
    skyColor: 0x101813,
    fireIntensity: 16,
    moonIntensity: 0.65,
    ambientIntensity: 0.55,
    features: ["hearth", "houses", "herbRacks", "ancestorPoles"],
    camera: { position: [4.8, 4.2, 14.5], lookAt: [0, 1.4, 10.5] },
    spawn: [0, 0, 13.5],
    assets: [
      { modelId: "environment.rocks.stylizedNature.rockMedium1", position: [-8.8, 0, -5.6], scale: 1.1, rotation: [0, 0.4, 0] },
      { modelId: "environment.rocks.stylizedNature.pebbleRound1", position: [9.5, 0, -4.2], scale: 1.2, rotation: [0, 1.2, 0] },
      { modelId: "environment.groundCover.stylizedNature.grassCommonShort", position: [-15.5, 0, 12.4], scale: 1.8 },
      { modelId: "environment.groundCover.stylizedNature.plant1", position: [16.8, 0, 9.8], scale: 1.4 },
      { modelId: "environment.trees.stylizedNature.commonTree1", position: [-24.0, 0, -14.5], scale: 2.1, rotation: [0, -0.4, 0] }
    ]
  },
  {
    id: "gray-sprout-herb-field",
    name: "灰芽药草地",
    subtitle: "青息花、止血苔和苦根草集中生长，主部落的征收压力从这里落下来。",
    type: "gathering-area",
    summary: "采集教学与生态异常的第一处证据。药草田边缘有被异常兽蹄踏坏的痕迹。",
    groundColor: 0x4d5f34,
    pathColor: 0x8a7347,
    fogColor: 0x182416,
    skyColor: 0x182416,
    fireIntensity: 4,
    moonIntensity: 0.8,
    ambientIntensity: 0.72,
    features: ["herbRacks"],
    camera: { position: [4.2, 4.0, 16.0], lookAt: [0, 0.9, 8.5] },
    spawn: [0, 0, 17.0],
    assets: [
      { modelId: "environment.groundCover.stylizedNature.fern1", position: [-12.5, 0, -5.8], scale: 2.0 },
      { modelId: "environment.groundCover.stylizedNature.plant7", position: [-4.6, 0, -11.5], scale: 1.8 },
      { modelId: "environment.groundCover.stylizedNature.clover1", position: [7.2, 0, -6.0], scale: 2.2 },
      { modelId: "environment.mushrooms.stylizedNature.mushroomCommon", position: [14.0, 0, 6.8], scale: 1.5 },
      { modelId: "environment.bushes.stylizedNature.bushCommonFlowers", position: [-18.5, 0, 11.5], scale: 1.8 }
    ]
  },
  {
    id: "sprout-seeking-ravine",
    name: "寻芽溪谷",
    subtitle: "成人礼偏离旧鹿径后的溪谷，盐痕青息花藏在潮湿石缝边。",
    type: "rite-location",
    summary: "青岚第一次与潮纹、鹿角纹交叉的地点。溪水的盐味暗示西方线索，但不解释真相。",
    groundColor: 0x35423a,
    pathColor: 0x59614f,
    fogColor: 0x111b1d,
    skyColor: 0x111b1d,
    fireIntensity: 2.5,
    moonIntensity: 1.1,
    ambientIntensity: 0.64,
    features: ["creek", "ravine", "ancestorPoles"],
    camera: { position: [2.2, 4.4, 17.0], lookAt: [0, 0.9, 8.4] },
    spawn: [0, 0, 18.5],
    assets: [
      { modelId: "environment.trees.stylizedNature.twistedTree1", position: [-18.5, 0, -11.0], scale: 2.4, rotation: [0, 0.7, 0] },
      { modelId: "environment.rocks.stylizedNature.rockPathRoundThin", position: [-7.5, 0.03, -5.8], scale: 2.2, rotation: [0, 0.2, 0] },
      { modelId: "environment.flowers.stylizedNature.flower3Single", position: [7.6, 0, -10.5], scale: 1.7 },
      { modelId: "environment.groundCover.stylizedNature.grassWispyTall", position: [16.4, 0, -2.2], scale: 1.9 }
    ]
  },
  {
    id: "branch-hunting-ground",
    name: "支属猎场",
    subtitle: "少年第一次跟随猎队的小猎区域，追踪、伏击、救援都在这里发生。",
    type: "hunting-area",
    summary: "节奏从生活任务转向危险任务。地上出现裂甲牛迁徙异常的旧蹄印。",
    groundColor: 0x2f4932,
    pathColor: 0x5d5135,
    fogColor: 0x0f1713,
    skyColor: 0x0f1713,
    fireIntensity: 2,
    moonIntensity: 0.9,
    ambientIntensity: 0.58,
    features: ["huntingBlind", "oxTracks"],
    camera: { position: [-4.0, 4.0, 16.0], lookAt: [0, 1.0, 8.6] },
    spawn: [0, 0, 16.5],
    assets: [
      { modelId: "environment.trees.stylizedNature.commonTree3", position: [-22.0, 0, -8.5], scale: 2.1, rotation: [0, 0.3, 0] },
      { modelId: "environment.bushes.stylizedNature.bushCommon", position: [18.8, 0, -2.0], scale: 2.0 },
      { modelId: "environment.rocks.stylizedNature.rockMedium2", position: [-9.5, 0, 8.8], scale: 1.3 },
      { modelId: "props.weapons.kaykit.bowWithString", position: [-6.0, 0.78, 12.0], scale: 0.9, rotation: [0.1, 1.4, 0.4] },
      { modelId: "props.weapons.kaykit.quiver", position: [-4.6, 0.7, 12.4], scale: 0.85, rotation: [0.2, -0.5, 0] }
    ]
  },
  {
    id: "joint-hunt-grassland",
    name: "共猎草场",
    subtitle: "鹿角多个支属联合围猎裂甲牛的开阔草地，压力和协作同时出现。",
    type: "joint-hunt-area",
    summary: "第一章的动作收束。草场、药草车、猎具和异常震动共同指向更大的王兽危机。",
    groundColor: 0x566734,
    pathColor: 0x7d6840,
    fogColor: 0x192014,
    skyColor: 0x192014,
    fireIntensity: 3,
    moonIntensity: 0.82,
    ambientIntensity: 0.76,
    features: ["cart", "oxTracks", "huntingBlind"],
    camera: { position: [3.2, 4.2, 19.5], lookAt: [0, 0.9, 10.0] },
    spawn: [0, 0, 20.0],
    assets: [
      { modelId: "environment.groundCover.stylizedNature.grassCommonTall", position: [-17.5, 0, -6.5], scale: 2.4 },
      { modelId: "environment.rocks.stylizedNature.rockMedium3", position: [14.0, 0, -14.0], scale: 1.4 },
      { modelId: "environment.trees.stylizedNature.commonTree5", position: [-26.0, 0, -22.0], scale: 2.0 },
      { modelId: "props.weapons.kaykit.bow", position: [6.8, 0.78, 11.8], scale: 0.9, rotation: [0.1, -1.3, -0.2] },
      { modelId: "props.weapons.kaykit.arrowBowBundle", position: [8.0, 0.7, 12.8], scale: 0.9, rotation: [0, 0.4, 0] }
    ]
  }
];

export function getChapterScene(id: string) {
  return CHAPTER_SCENES.find((scene) => scene.id === id) ?? CHAPTER_SCENES[0]!;
}
