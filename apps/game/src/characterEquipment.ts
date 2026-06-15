export type HandSlot = "left" | "right";

export type PropTransform = {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number;
};

const SLOT_CANDIDATES: Record<HandSlot, string[]> = {
  right: ["handslot.r", "handslotr", "hand.r", "handr", "wrist.r", "wristr", "Hand.R", "mixamorigRightHand"],
  left: ["handslot.l", "handslotl", "hand.l", "handl", "wrist.l", "wristl", "Hand.L", "mixamorigLeftHand"]
};

function normalizeBoneName(name: string) {
  return name.toLowerCase().replace(/[._-]/g, "");
}

const SHIELD_HAND_TRANSFORMS: Record<HandSlot, PropTransform> = {
  // 盾的几何中心在模型原点，需沿握点外推，让 handslot 落在盾背而非盾面
  left: {
    rotation: [0, 0, 0],
    position: [-0.05, 0.02, 0.17]
  },
  right: {
    rotation: [0, Math.PI, 0],
    position: [0.05, 0.02, 0.17]
  }
};

export const KAYKIT_WEAPON_PRESETS: Record<string, PropTransform> = {
  "props.weapons.kaykit.sword1Handed": {},
  "props.weapons.kaykit.dagger": {},
  "props.weapons.kaykit.axe1Handed": {},
  "props.weapons.kaykit.staff": { position: [0, 0, 0], rotation: [0, 0, 0] },
  "props.weapons.kaykit.wand": {},
  "props.weapons.kaykit.bowWithString": {
    rotation: [0, Math.PI / 2, 0],
    position: [0, 0, 0]
  },
  "props.weapons.kaykit.crossbow1Handed": {}
};

function isShieldModel(modelId: string) {
  return modelId.includes("shield");
}

function resolvePropTransform(modelId: string, hand: HandSlot, transform?: PropTransform) {
  if (transform) return transform;
  if (isShieldModel(modelId)) return SHIELD_HAND_TRANSFORMS[hand];
  return KAYKIT_WEAPON_PRESETS[modelId] ?? {};
}

export const KAYKIT_WEAPON_OPTIONS: Array<{ label: string; id: string | null }> = [
  { label: "无", id: null },
  { label: "单手剑", id: "props.weapons.kaykit.sword1Handed" },
  { label: "匕首", id: "props.weapons.kaykit.dagger" },
  { label: "单手斧", id: "props.weapons.kaykit.axe1Handed" },
  { label: "法杖", id: "props.weapons.kaykit.staff" },
  { label: "魔杖", id: "props.weapons.kaykit.wand" },
  { label: "弓", id: "props.weapons.kaykit.bowWithString" },
  { label: "单手弩", id: "props.weapons.kaykit.crossbow1Handed" },
  { label: "圆盾", id: "props.weapons.kaykit.shieldRound" },
  { label: "彩色圆盾", id: "props.weapons.kaykit.shieldRoundColor" }
];

function findHandSlot(root: unknown, hand: HandSlot) {
  const side = hand === "right" ? "r" : "l";
  const targetNames = [...SLOT_CANDIDATES[hand], `handslot.${side}`, `handslot_${side}`, `handslot${side}`];
  const wanted = new Set(targetNames.map((name) => normalizeBoneName(name)));

  let slot: any | undefined;
  (root as any).traverse((object: any) => {
    if (slot || !object.isSkinnedMesh || !object.skeleton?.bones) return;

    if (object.skeleton.getBoneByName) {
      for (const name of targetNames) {
        const bone = object.skeleton.getBoneByName(name);
        if (bone) {
          slot = bone;
          return;
        }
      }
    }

    for (const bone of object.skeleton.bones) {
      if (wanted.has(normalizeBoneName(bone.name || ""))) {
        slot = bone;
        return;
      }
    }
  });

  if (slot) return slot;

  (root as any).traverse((object: any) => {
    if (slot) return;
    if (wanted.has(normalizeBoneName(object.name || ""))) slot = object;
  });

  return slot;
}

function applyTransform(object: any, transform: PropTransform) {
  if (transform.position) object.position.set(...transform.position);
  if (transform.rotation) object.rotation.set(...transform.rotation);
  if (transform.scale !== undefined) object.scale.setScalar(transform.scale);
}

export class CharacterEquipment {
  private readonly attachments = new Map<HandSlot, any>();
  private readonly equippedIds = new Map<HandSlot, string | null>();

  constructor(private readonly characterRoot: unknown) {}

  findSlot(hand: HandSlot) {
    return findHandSlot(this.characterRoot, hand);
  }

  getEquippedId(hand: HandSlot) {
    return this.equippedIds.get(hand) ?? null;
  }

  async equip(
    THREE: unknown,
    loadModelById: (three: unknown, id: string) => Promise<{ scene: unknown }>,
    hand: HandSlot,
    modelId: string | null,
    transform?: PropTransform
  ) {
    this.unequip(hand);
    this.equippedIds.set(hand, modelId);
    if (!modelId) return undefined;

    const slot = this.findSlot(hand);
    if (!slot) {
      const boneNames: string[] = [];
      (this.characterRoot as any).traverse((object: any) => {
        if (object.isSkinnedMesh && object.skeleton?.bones) {
          boneNames.push(...object.skeleton.bones.map((bone: any) => bone.name).filter(Boolean));
        }
      });
      throw new Error(
        `未找到 ${hand} 手挂点（handslot${hand === "right" ? "r" : "l"} / handslot.${hand === "right" ? "r" : "l"}）。` +
          (boneNames.length ? ` 可用骨骼: ${[...new Set(boneNames)].join(", ")}` : " 模型中未发现 SkinnedMesh 骨骼。")
      );
    }

    const gltf = await loadModelById(THREE, modelId);
    const prop = (gltf.scene as any).clone(true);
    prop.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.frustumCulled = false;
      }
    });

    applyTransform(prop, resolvePropTransform(modelId, hand, transform));
    slot.add(prop);
    this.attachments.set(hand, prop);
    return prop;
  }

  unequip(hand: HandSlot) {
    const existing = this.attachments.get(hand);
    if (existing?.parent) {
      existing.parent.remove(existing);
    }
    this.attachments.delete(hand);
    this.equippedIds.set(hand, null);
  }

  dispose() {
    for (const hand of ["left", "right"] as HandSlot[]) {
      this.unequip(hand);
    }
  }
}

export function labelForWeaponId(id: string | null) {
  if (!id) return "无";
  return KAYKIT_WEAPON_OPTIONS.find((option) => option.id === id)?.label ?? id;
}

export function idForWeaponLabel(label: string) {
  return KAYKIT_WEAPON_OPTIONS.find((option) => option.label === label)?.id ?? null;
}
