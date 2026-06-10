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
};

export type VillageNpcDefinition = {
  id: string;
  modelId: string;
  name: string;
  title: string;
  position: [number, number, number];
  rotationY: number;
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
    name: "灰芽萨满",
    title: "火塘守话人",
    position: [-2.35, 0, 1.45],
    rotationY: Math.PI * 0.38,
    targetHeight: 1.62,
    interactRadius: 2.35,
    animationPacks: ["animations.kaykit.rigMedium.general"],
    persona:
      "你是灰芽部落的萨满与守火人，熟悉盟誓、夜路、图腾与火种规矩。对陌生人保持警觉，对守火人保持敬意。",
    sceneContext: "灰芽火塘地，中央有石环火塘，周围是鹿角屋、药草架与松木图腾，夏夜有雾、远林与兽眼微光。",
    dialogue: {
      lines: [
        "旅人，你踏着松针来了。火塘还暖，说明你还不算陌生。",
        "灰芽部落不散守地，我们守的是火种。只要火还在，族人就还能围坐。",
        "你若要往更远的地方去，先记住：别在夜里独自离开松灯照得见的范围。",
        "火塘边永远有位置。有话想说，随时回来。"
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
  disposables: Disposable[]
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
  character.position.set(definition.position[0], -bounds.min.y, definition.position[2]);
  character.rotation.y = definition.rotationY;
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
    sceneContext: npc.definition.sceneContext
  };
}
