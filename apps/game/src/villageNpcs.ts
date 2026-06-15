import type { CharacterAnimator } from "./characterAnimation";
import { loadCharacterWithAnimations } from "./characterAnimation";
import type { loadModelById } from "./modelAssets";

export type NpcDialoguePayload = {
  id: string;
  name: string;
  title: string;
  fallbackLines: string[];
  persona: string;
  sceneContext: string;
  questIds: string[];
};

type ScenePlacement = {
  position: [number, number, number];
  rotationY: number;
};

export type VillageNpcDefinition = {
  id: string;
  modelId: string;
  name: string;
  title: string;
  sceneIds: string[];
  questIds: string[];
  position: [number, number, number];
  rotationY: number;
  placements?: Record<string, ScenePlacement>;
  targetHeight: number;
  interactRadius: number;
  animationPacks: string[];
  persona: string;
  sceneContext: string;
  dialogue: {
    lines: string[];
  };
};

export type VillageNpcInstance = {
  definition: VillageNpcDefinition;
  root: unknown;
  animator: CharacterAnimator;
};

export const HEARTH_VILLAGE_NPCS: VillageNpcDefinition[] = [
  {
    id: "graybud-shaman",
    modelId: "characters.npc.kaykit.mage",
    name: "灰芽巫",
    title: "支火守火人",
    sceneIds: ["gray-sprout-hearth", "sprout-seeking-ravine"],
    questIds: ["q1-hearth-morning-lesson", "q3-sprout-seeking-rite", "q6-bitter-water-clue"],
    position: [-6.4, 0, 3.8],
    rotationY: Math.PI * 0.38,
    placements: {
      "gray-sprout-hearth": { position: [-6.4, 0, 3.8], rotationY: Math.PI * 0.38 },
      "sprout-seeking-ravine": { position: [13.5, 0, -10.5], rotationY: Math.PI * 1.08 }
    },
    targetHeight: 1.62,
    interactRadius: 2.6,
    animationPacks: ["animations.kaykit.rigMedium.general"],
    persona: "你是灰芽部落的支火巫，知道青岚入火异常，但不会直接揭露他的身世。你说话慢，常把火、祖名和路放在一起讲。",
    sceneContext: "第一章前段。灰芽火塘、寻芽溪谷和苦水线索都围绕青岚的成人礼展开；此时不能解释西大陆真相。",
    dialogue: {
      lines: [
        "先看火色。火若只亮不暖，说明添柴的人心不在这里。",
        "灰芽接纳你，是火塘今日给出的回答。别把它误听成所有答案。",
        "盐痕青息花不是罪，也不是荣耀。你只要把它带回来，让火自己辨认。",
        "溪水变苦这件事，先别让主部落使者听见。我们要先知道它从哪里开始。"
      ]
    }
  },
  {
    id: "graybud-foster-mother",
    modelId: "characters.npc.kaykit.ranger",
    name: "灰芽养母",
    title: "药草照料者",
    sceneIds: ["gray-sprout-hearth", "gray-sprout-herb-field"],
    questIds: ["q2-herb-field-chores"],
    position: [-3.0, 0, 12.0],
    rotationY: Math.PI * 0.82,
    placements: {
      "gray-sprout-hearth": { position: [-3.0, 0, 12.0], rotationY: Math.PI * 0.82 },
      "gray-sprout-herb-field": { position: [-5.5, 0, 8.0], rotationY: Math.PI * 0.64 }
    },
    targetHeight: 1.58,
    interactRadius: 2.4,
    animationPacks: ["animations.kaykit.rigMedium.general"],
    persona: "你是青岚的灰芽养母，照料药草地。你温柔但务实，知道青岚不是本族血脉，却真心把他当孩子。",
    sceneContext: "灰芽药草地是部落生计来源，鹿角主部落正要求更多贡草，异常兽蹄正在破坏药草边缘。",
    dialogue: {
      lines: [
        "青息花摘靠近叶根的那一茎，别把新芽连根拔掉。",
        "主部落要的贡草又多了。使者不是恶人，可他的袋子总比我们的药架先满。",
        "你看这蹄印，裂甲牛不会这样绕水走。它像是在躲什么味道。",
        "把止血苔收好。寻芽礼之后，猎队会比你想的更需要它。"
      ]
    }
  },
  {
    id: "graybud-foster-father",
    modelId: "characters.npc.kaykit.barbarian",
    name: "灰芽养父",
    title: "支属猎手",
    sceneIds: ["gray-sprout-hearth", "branch-hunting-ground", "joint-hunt-grassland"],
    questIds: ["q4-rescue-in-fog", "q5-cracked-ox-joint-hunt"],
    position: [6.8, 0, 12.5],
    rotationY: Math.PI * 1.2,
    placements: {
      "gray-sprout-hearth": { position: [6.8, 0, 12.5], rotationY: Math.PI * 1.2 },
      "branch-hunting-ground": { position: [-7.5, 0, 11.0], rotationY: Math.PI * 0.95 },
      "joint-hunt-grassland": { position: [-14.0, 0, 8.5], rotationY: Math.PI * 0.72 }
    },
    targetHeight: 1.72,
    interactRadius: 2.8,
    animationPacks: ["animations.kaykit.rigMedium.general", "animations.kaykit.rigMedium.movementBasic"],
    persona: "你是青岚的灰芽养父，支属猎手。你话少、判断快，知道青岚来历危险但不懂全部真相。",
    sceneContext: "第一章小猎与共猎阶段。重点是追踪、救援、猎后分配，以及裂甲牛迁徙异常。",
    dialogue: {
      lines: [
        "猎队不看你喊得多响，只看你在雾里先伸手救谁。",
        "追猎能赢一顿肉，救人能赢一支队。你自己想清楚。",
        "这不是普通裂甲牛的蹄线。它们没往旧草场去，像被地底什么东西推了一把。",
        "共猎时别逞强。你护住贡草车，别人才能稳住伤员。"
      ]
    }
  },
  {
    id: "deer-horn-envoy",
    modelId: "characters.npc.kaykit.knight",
    name: "鹿角使者",
    title: "贡草与猎手征调使",
    sceneIds: ["gray-sprout-hearth", "joint-hunt-grassland"],
    questIds: ["q5-cracked-ox-joint-hunt"],
    position: [14.5, 0, 1.5],
    rotationY: Math.PI * 1.45,
    placements: {
      "gray-sprout-hearth": { position: [14.5, 0, 1.5], rotationY: Math.PI * 1.45 },
      "joint-hunt-grassland": { position: [12.0, 0, 8.8], rotationY: Math.PI * 1.1 }
    },
    targetHeight: 1.68,
    interactRadius: 2.6,
    animationPacks: ["animations.kaykit.rigMedium.general"],
    persona: "你是鹿角主部落使者，负责征调贡草和猎手。你强硬、有压力感，但不是反派；你相信集中资源能让更多人活下来。",
    sceneContext: "鹿角主部落正在备灾，所以对支属要求更多药草和猎手。使者不知赤牙猎王全貌。",
    dialogue: {
      lines: [
        "我知道灰芽觉得袋子太重。可若灾先到，空袋子救不了任何支火。",
        "贡草要交，猎手也要来。主火不是为了自己暖，它要扛住所有支火的风。",
        "裂甲牛乱迁不是小事。若你们能稳住共猎，我会把灰芽的损耗写进回报。",
        "别把强硬当作恶意。等真正的兽潮来时，犹豫会比命令更伤人。"
      ]
    }
  },
  {
    id: "li",
    modelId: "characters.npc.kaykit.rogue",
    name: "砾",
    title: "灰芽同龄少年",
    sceneIds: ["gray-sprout-hearth", "sprout-seeking-ravine", "branch-hunting-ground"],
    questIds: ["q3-sprout-seeking-rite", "q4-rescue-in-fog"],
    position: [3.5, 0, 18.0],
    rotationY: Math.PI * 1.05,
    placements: {
      "gray-sprout-hearth": { position: [3.5, 0, 18.0], rotationY: Math.PI * 1.05 },
      "sprout-seeking-ravine": { position: [-9.0, 0, 12.0], rotationY: Math.PI * 0.42 },
      "branch-hunting-ground": { position: [11.0, 0, 8.5], rotationY: Math.PI * 1.35 }
    },
    targetHeight: 1.55,
    interactRadius: 2.4,
    animationPacks: ["animations.kaykit.rigMedium.general"],
    persona: "你是砾，灰芽同龄少年，嘴硬、好胜，但在危险时会紧张。你不知道青岚身世，只想比他更早被猎队认可。",
    sceneContext: "砾参与寻芽礼前后的同龄竞争，并在小猎中见证青岚救人。",
    dialogue: {
      lines: [
        "别以为火塘偏疼你，你就能比我先进猎队。",
        "旧鹿径我走过两次。你要是迷路，我可不会承认自己担心。",
        "刚才那雾里……算了，你先救人这事，我会告诉别人。",
        "下次追猎我不会输给你。哪怕你已经被火塘点过名。"
      ]
    }
  }
];

type Disposable = { dispose?: () => void };

export async function spawnVillageNpc(
  THREE: any,
  world: unknown,
  loadModel: typeof loadModelById,
  definition: VillageNpcDefinition,
  disposables: Disposable[],
  sceneId?: string
): Promise<VillageNpcInstance> {
  const { characterGltf, animator } = await loadCharacterWithAnimations(
    THREE,
    loadModel,
    definition.modelId,
    definition.animationPacks
  );

  const character = characterGltf.scene as any;
  character.name = definition.name;
  character.traverse((child: any) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const bounds = new THREE.Box3().setFromObject(character);
  const size = bounds.getSize(new THREE.Vector3());
  if (size.y > 0) {
    character.scale.setScalar(definition.targetHeight / size.y);
  }
  bounds.setFromObject(character);
  const placement = sceneId ? definition.placements?.[sceneId] : undefined;
  const position = placement?.position ?? definition.position;
  character.position.set(position[0], -bounds.min.y + position[1], position[2]);
  character.rotation.y = placement?.rotationY ?? definition.rotationY;
  (world as any).add(character);

  character.traverse((child: any) => {
    if (child.geometry) disposables.push(child.geometry);
    if (child.material) {
      if (Array.isArray(child.material)) disposables.push(...child.material);
      else disposables.push(child.material);
    }
  });

  if (!animator.play("Idle_A", { fade: 0 })) {
    animator.play("Idle_B", { fade: 0 });
  }

  return { definition, root: character, animator };
}

export function getNpcsForScene(sceneId: string) {
  return HEARTH_VILLAGE_NPCS.filter((definition) => definition.sceneIds.includes(sceneId));
}

export function findNearbyNpc(
  playerRoot: { position: { x: number; y: number; z: number } },
  npcs: VillageNpcInstance[]
) {
  let nearest: VillageNpcInstance | undefined;
  let nearestDistance = Infinity;

  for (const npc of npcs) {
    const npcRoot = npc.root as { position: { x: number; z: number } };
    const dx = playerRoot.position.x - npcRoot.position.x;
    const dz = playerRoot.position.z - npcRoot.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= npc.definition.interactRadius && distance < nearestDistance) {
      nearest = npc;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function npcDialoguePayload(npc: VillageNpcInstance): NpcDialoguePayload {
  return {
    id: npc.definition.id,
    name: npc.definition.name,
    title: npc.definition.title,
    fallbackLines: npc.definition.dialogue.lines,
    persona: npc.definition.persona,
    sceneContext: npc.definition.sceneContext,
    questIds: npc.definition.questIds
  };
}
