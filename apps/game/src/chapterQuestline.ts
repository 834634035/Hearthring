export type ChapterQuestStatus = "active" | "completed" | "locked";

export interface ChapterQuestStep {
  id: string;
  title: string;
  sceneId: string;
  npcId: string;
  npcName: string;
  summary: string;
  objectives: string[];
  requiredInteractionIds: string[];
  conflict: string;
  reward: string;
  completionLine: string;
}

export const CHAPTER_QUESTLINE: ChapterQuestStep[] = [
  {
    id: "q1-hearth-morning-lesson",
    title: "守火晨课",
    sceneId: "gray-sprout-hearth",
    npcId: "graybud-shaman",
    npcName: "灰芽巫",
    summary: "从火塘日常开始，让青岚先被灰芽接住，再从火声里感到不安。",
    objectives: ["给火塘添柴", "整理祖名木牌", "向灰芽巫回报火色"],
    requiredInteractionIds: ["hearth-add-wood", "hearth-ancestor-plate"],
    conflict: "青岚短暂听见火中有潮声。",
    reward: "获得灰芽火种，解锁火塘与祖名的基础线索。",
    completionLine: "火接住你了。去药草地帮你养母，别让主部落使者先看见那片被踏坏的草。"
  },
  {
    id: "q2-herb-field-chores",
    title: "药草地杂务",
    sceneId: "gray-sprout-herb-field",
    npcId: "graybud-foster-mother",
    npcName: "灰芽养母",
    summary: "把生计压力落到具体的草药、征收和兽蹄痕上。",
    objectives: ["采集青息花", "采集止血苔", "记录异常兽蹄"],
    requiredInteractionIds: ["herb-qingxi-flower", "herb-blood-moss", "herb-beast-track"],
    conflict: "药草地边缘被异常兽蹄踏坏。",
    reward: "获得青息花束与兽蹄记录，解锁采集循环入口。",
    completionLine: "这些蹄印不该往水边绕。带着青息花去溪谷，寻芽礼不能再拖。"
  },
  {
    id: "q3-sprout-seeking-rite",
    title: "寻芽礼",
    sceneId: "sprout-seeking-ravine",
    npcId: "graybud-shaman",
    npcName: "灰芽巫",
    summary: "让成人礼通过，但只埋下潮纹和盐痕，不揭示身世。",
    objectives: ["进入旧鹿径", "找到盐痕青息花", "带回火塘献祭"],
    requiredInteractionIds: ["ravine-salt-flower", "ravine-old-deer-path"],
    conflict: "青岚偏离传统路线，带回带有盐痕的青息花。",
    reward: "通过成人礼，获得支属猎队资格。",
    completionLine: "灰芽接纳你，不等于所有人都会放心。你养父在猎场等你，小猎会看见你真正的选择。"
  },
  {
    id: "q4-rescue-in-fog",
    title: "雾中救援",
    sceneId: "branch-hunting-ground",
    npcId: "graybud-foster-father",
    npcName: "灰芽养父",
    summary: "把第一次小猎变成追猎与救人的选择。",
    objectives: ["查看猎队哨棚", "救下受伤猎手", "记录裂甲牛迁徙痕迹"],
    requiredInteractionIds: ["hunt-injured-hunter", "hunt-ox-track"],
    conflict: "青岚需要在追猎和救人之间做选择。",
    reward: "获得猎队认可，解锁草药急救。",
    completionLine: "你先救人，这很好。裂甲牛的蹄印不对，去共猎草场，那里会有人把压力说出口。"
  },
  {
    id: "q5-cracked-ox-joint-hunt",
    title: "裂甲牛共猎",
    sceneId: "joint-hunt-grassland",
    npcId: "deer-horn-envoy",
    npcName: "鹿角使者",
    summary: "展示支属协作和主部落资源压力，使者强硬但不是反派。",
    objectives: ["检查贡草车", "布置简易陷阱", "稳定伤员"],
    requiredInteractionIds: ["joint-herb-cart", "joint-hide-snare", "joint-wounded-runner"],
    conflict: "裂甲牛群迁徙方向异常，差点冲散贡草队。",
    reward: "获得裂甲碎片，解锁鹿角主支压力线。",
    completionLine: "你们做得够好，但还不够。溪水变苦不是传言，回溪谷问灰芽巫。"
  },
  {
    id: "q6-bitter-water-clue",
    title: "苦水线索",
    sceneId: "sprout-seeking-ravine",
    npcId: "graybud-shaman",
    npcName: "灰芽巫",
    summary: "把第一章收束到小而不安的西部沙漠线索。",
    objectives: ["调查变苦溪水", "记录动物避水行为", "向灰芽巫回报"],
    requiredInteractionIds: ["ravine-bitter-water", "ravine-avoid-water"],
    conflict: "水脉像被远方拖拽，青岚无法解释。",
    reward: "埋入云笈巫循箓雨登场线索。",
    completionLine: "不要急着解释它。只记住：水在躲开旧路，火也听见了。"
  }
];

export function getQuestIndex(questId: string) {
  return CHAPTER_QUESTLINE.findIndex((quest) => quest.id === questId);
}

export function getNextQuest(questId: string) {
  const index = getQuestIndex(questId);
  return index >= 0 ? CHAPTER_QUESTLINE[index + 1] ?? null : null;
}
