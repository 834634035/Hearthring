export type ChapterInteractionKind = "collect" | "inspect" | "help" | "ritual" | "trap";

export interface ChapterInteractionDefinition {
  id: string;
  sceneId: string;
  questId: string;
  label: string;
  verb: string;
  description: string;
  itemName: string;
  kind: ChapterInteractionKind;
  position: [number, number, number];
  color: number;
}

export const CHAPTER_INTERACTIONS: ChapterInteractionDefinition[] = [
  {
    id: "hearth-add-wood",
    sceneId: "gray-sprout-hearth",
    questId: "q1-hearth-morning-lesson",
    label: "干柴堆",
    verb: "添柴",
    description: "火舌抬高了一点，青岚听见灰烬里短暂的潮声。",
    itemName: "灰芽火种",
    kind: "ritual",
    position: [4.2, 0, 3.8],
    color: 0xf0a24a
  },
  {
    id: "hearth-ancestor-plate",
    sceneId: "gray-sprout-hearth",
    questId: "q1-hearth-morning-lesson",
    label: "祖名木牌",
    verb: "整理",
    description: "有一枚旧木牌没有刻名，只被火熏出一道像水纹的暗线。",
    itemName: "无名木牌拓痕",
    kind: "inspect",
    position: [-8.6, 0, -6.4],
    color: 0xd4b06a
  },
  {
    id: "herb-qingxi-flower",
    sceneId: "gray-sprout-herb-field",
    questId: "q2-herb-field-chores",
    label: "青息花",
    verb: "采集",
    description: "花茎湿冷，根部却带着不该出现在药田里的盐白。",
    itemName: "青息花束",
    kind: "collect",
    position: [-9.0, 0, -8.5],
    color: 0x9fcf80
  },
  {
    id: "herb-blood-moss",
    sceneId: "gray-sprout-herb-field",
    questId: "q2-herb-field-chores",
    label: "止血苔",
    verb: "采集",
    description: "苔片厚实，可以做急救包扎，养母会放心一点。",
    itemName: "止血苔包",
    kind: "collect",
    position: [10.8, 0, 7.8],
    color: 0x88aa5d
  },
  {
    id: "herb-beast-track",
    sceneId: "gray-sprout-herb-field",
    questId: "q2-herb-field-chores",
    label: "异常兽蹄",
    verb: "记录",
    description: "蹄印很深，方向却像在绕开水气。",
    itemName: "兽蹄记录",
    kind: "inspect",
    position: [17.0, 0, -11.5],
    color: 0xc1a075
  },
  {
    id: "ravine-salt-flower",
    sceneId: "sprout-seeking-ravine",
    questId: "q3-sprout-seeking-rite",
    label: "盐痕青息花",
    verb: "采集",
    description: "花瓣边缘结着盐晶，像被远方的水脉喊过名字。",
    itemName: "盐痕青息花",
    kind: "collect",
    position: [8.2, 0, -12.0],
    color: 0xbfd6ca
  },
  {
    id: "ravine-old-deer-path",
    sceneId: "sprout-seeking-ravine",
    questId: "q3-sprout-seeking-rite",
    label: "旧鹿径",
    verb: "查看",
    description: "石缝里的鹿角刻痕被潮气磨亮，寻芽礼的旧路并不只通向灰芽。",
    itemName: "旧鹿径刻痕",
    kind: "inspect",
    position: [-12.0, 0, 3.8],
    color: 0xd8c28e
  },
  {
    id: "hunt-injured-hunter",
    sceneId: "branch-hunting-ground",
    questId: "q4-rescue-in-fog",
    label: "受伤猎手",
    verb: "救援",
    description: "你用止血苔压住伤口，猎手的呼吸稳了下来。",
    itemName: "猎手的谢意",
    kind: "help",
    position: [12.6, 0, 9.0],
    color: 0xdc7658
  },
  {
    id: "hunt-ox-track",
    sceneId: "branch-hunting-ground",
    questId: "q4-rescue-in-fog",
    label: "裂甲牛蹄印",
    verb: "追踪",
    description: "蹄印突然折向药草地，像被某种苦味驱赶。",
    itemName: "裂甲牛蹄印拓片",
    kind: "inspect",
    position: [-11.0, 0, -8.2],
    color: 0xb98b5c
  },
  {
    id: "joint-herb-cart",
    sceneId: "joint-hunt-grassland",
    questId: "q5-cracked-ox-joint-hunt",
    label: "贡草车",
    verb: "加固",
    description: "车绳勒紧，贡草队能多撑一次冲撞。",
    itemName: "加固绳结",
    kind: "help",
    position: [-9.0, 0, 10.5],
    color: 0xd19a5c
  },
  {
    id: "joint-hide-snare",
    sceneId: "joint-hunt-grassland",
    questId: "q5-cracked-ox-joint-hunt",
    label: "兽皮绊索",
    verb: "布置",
    description: "绊索埋进草里，猎队终于有了喘息的距离。",
    itemName: "临时绊索",
    kind: "trap",
    position: [10.5, 0, -5.6],
    color: 0xc5a16a
  },
  {
    id: "joint-wounded-runner",
    sceneId: "joint-hunt-grassland",
    questId: "q5-cracked-ox-joint-hunt",
    label: "伤员",
    verb: "稳定",
    description: "伤员抓住你的手，低声说溪水这两天一直发苦。",
    itemName: "苦水传言",
    kind: "help",
    position: [17.0, 0, 12.5],
    color: 0xdf7d5c
  },
  {
    id: "ravine-bitter-water",
    sceneId: "sprout-seeking-ravine",
    questId: "q6-bitter-water-clue",
    label: "发苦溪水",
    verb: "尝试",
    description: "水味苦涩，像混入了热沙和烧过的石粉。",
    itemName: "苦水样本",
    kind: "inspect",
    position: [2.5, 0, -6.5],
    color: 0x78a8b6
  },
  {
    id: "ravine-avoid-water",
    sceneId: "sprout-seeking-ravine",
    questId: "q6-bitter-water-clue",
    label: "避水兽迹",
    verb: "记录",
    description: "小兽宁愿绕进石缝，也不愿踩近溪边。",
    itemName: "避水兽迹记录",
    kind: "inspect",
    position: [16.0, 0, 2.6],
    color: 0xc2ad7e
  }
];

export function getInteractionsForScene(sceneId: string) {
  return CHAPTER_INTERACTIONS.filter((interaction) => interaction.sceneId === sceneId);
}

export function getInteractionById(id: string) {
  return CHAPTER_INTERACTIONS.find((interaction) => interaction.id === id);
}
