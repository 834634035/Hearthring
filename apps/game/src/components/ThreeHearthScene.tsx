/**
 * Three.js 章节场景：第三人称村落探索、NPC 对话与任务互动。
 *
 * 架构：
 * - React 管理 HUD 状态（附近 NPC/互动点、对话浮层）。
 * - `mountGraybudVillage` 负责 WebGL 生命周期、输入与渲染循环。
 * - `SceneUiBridge` 将命令式循环与 React 连接，避免每帧触发重渲染。
 * - 程序化几何体与可选 GLB 资源由 `ChapterSceneDefinition` 驱动。
 */
import { animate, type JSAnimation } from "animejs";
// 注册 Anime.js 对 Three Object3D 属性（x/y/z、rotateY、scale 等）的映射。
import "animejs/adapters/three";
import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { getInteractionsForScene, type ChapterInteractionDefinition } from "../chapterInteractions";
import { CHAPTER_SCENES, type ChapterSceneDefinition } from "../chapterScenes";
import { loadCharacterWithAnimations, type CharacterAnimator } from "../characterAnimation";
import { CharacterEquipment } from "../characterEquipment";
import { loadModelById, clearModelCache, getModelEntry, isModelUrlAvailable } from "../modelAssets";
import {
  updateThirdPersonPlayer,
  triggerPlayerAttack,
  triggerPlayerJump,
  type CollisionCircle
} from "../thirdPersonPlayer";
import {
  findNearbyNpc,
  getNpcsForScene,
  npcDialoguePayload,
  spawnVillageNpc,
  type NpcDialoguePayload,
  type VillageNpcInstance
} from "../villageNpcs";
import { SceneDialogueOverlay } from "./SceneDialogueOverlay";
import type { ChapterQuestStep } from "../chapterQuestline";
type ThreeModule = typeof THREE;

/** 卸载或 HMR 时需 dispose 的几何体/材质条目。 */
type Disposable = {
  dispose?: () => void;
};

type KeyState = Record<string, boolean>;

/** 任务互动定义与其 3D 标记组的运行时配对。 */
type SceneInteractionInstance = {
  definition: ChapterInteractionDefinition;
  root: any;
};

type SceneCollisionCircle = CollisionCircle & {
  label?: string;
};

type CombatStatus = {
  playerHealth: number;
  maxPlayerHealth: number;
  enemiesAlive: number;
  enemiesTotal: number;
  lastEvent: string;
  isHealing: boolean;
};

type PatrolNpcState = {
  npc: VillageNpcInstance;
  waypoints: Array<[number, number]>;
  targetIndex: number;
  waitTimer: number;
  path: Array<[number, number]>;
  pathIndex: number;
  pathRefreshTimer: number;
};

type EnemyState = "patrol" | "alert" | "chase" | "attack" | "dead";

type EnemyInstance = {
  id: string;
  name: string;
  root: any;
  animator: CharacterAnimator;
  health: number;
  maxHealth: number;
  radius: number;
  state: EnemyState;
  alerted: boolean;
  alertTimer: number;
  alertIconTimer: number;
  alertJumpTimer: number;
  alertIcon: any;
  waypoints: Array<[number, number]>;
  targetIndex: number;
  path: Array<[number, number]>;
  pathIndex: number;
  pathRefreshTimer: number;
  spawnPosition: [number, number, number];
  attackCooldown: number;
  hurtTimer: number;
  bar: any;
  flashTimer: number;
  deathPlayed: boolean;
};

type EnemyHealthBar = {
  group: any;
  sprite: any;
  texture: any;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  lastHealth: number;
  lastMaxHealth: number;
};

type FloatingDamageText = {
  sprite: any;
  material: any;
  texture: any;
  age: number;
  duration: number;
  baseY: number;
  driftX: number;
  source: "player" | "enemy";
};

type PlayerHealingVfx = {
  group: any;
  geometry: any;
  material: any;
  positions: Float32Array;
  seeds: Float32Array;
};

/** 渲染循环回调 React UI 的桥接层，避免在热路径中直接传递 setState。 */
type SceneUiBridge = {
  setNearNpc: (npc: { id: string; name: string; title: string } | null) => void;
  setNearInteraction: (interaction: ChapterInteractionDefinition | null) => void;
  setCombatStatus: (status: CombatStatus) => void;
  openDialogue: (dialogue: NpcDialoguePayload, npc?: VillageNpcInstance) => void;
  closeDialogue: () => void;
  isDialogueOpen: () => boolean;
  completeInteraction: (interaction: ChapterInteractionDefinition) => void;
};

interface ThreeHearthSceneProps {
  /** 章节配置中的场景布局、光照、出生点与功能开关。 */
  sceneDefinition?: ChapterSceneDefinition;
  activeQuest?: ChapterQuestStep | null;
  /** 已完成的互动点挂载时隐藏，且不参与邻近检测。 */
  completedInteractionIds?: string[];
  onInteractionComplete?: (interaction: ChapterInteractionDefinition) => void;
  onQuestComplete?: (questId: string) => void;
  onDialogueOpenChange?: (open: boolean) => void;
}

/** React 外壳：挂载 WebGL 画布，并在其上叠加对话/任务 HUD。 */
export function ThreeHearthScene({
  sceneDefinition = CHAPTER_SCENES[0]!,
  activeQuest = null,
  completedInteractionIds = [],
  onInteractionComplete,
  onQuestComplete,
  onDialogueOpenChange
}: ThreeHearthSceneProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const fpsRef = useRef<HTMLSpanElement | null>(null);
  const controlsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [nearNpc, setNearNpc] = useState<{ id: string; name: string; title: string } | null>(null);
  const [nearInteraction, setNearInteraction] = useState<ChapterInteractionDefinition | null>(null);
  const [dialogue, setDialogue] = useState<NpcDialoguePayload | null>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [combatStatus, setCombatStatus] = useState<CombatStatus>({
    playerHealth: 100,
    maxPlayerHealth: 100,
    enemiesAlive: 0,
    enemiesTotal: 0,
    lastEvent: "村落周边暂时平静",
    isHealing: false
  });
  const dialogueOpenRef = useRef(false);
  const onInteractionCompleteRef = useRef(onInteractionComplete);

  // 保持 ref 同步，使 Three.js 循环始终读取最新 props 而无需重新挂载。
  dialogueOpenRef.current = dialogue !== null;
  onInteractionCompleteRef.current = onInteractionComplete;

  // 每个场景定义挂载一次 WebGL；卸载时释放 GPU 资源并清空模型缓存。
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let cleanup: (() => void) | undefined;
    const uiBridge: SceneUiBridge = {
      setNearNpc,
      setNearInteraction,
      setCombatStatus,
      openDialogue: setDialogue,
      closeDialogue: () => setDialogue(null),
      isDialogueOpen: () => dialogueOpenRef.current,
      completeInteraction: (interaction) => {
        setNearInteraction(null);
        onInteractionCompleteRef.current?.(interaction);
      }
    };

    cleanup = mountGraybudVillage(THREE, mount, uiBridge, fpsRef, sceneDefinition, completedInteractionIds);

    const teardown = () => {
      cleanup?.();
    };

    // Vite HMR：模块热更新前先销毁旧场景。
    import.meta.hot?.dispose(teardown);

    return teardown;
  }, [sceneDefinition]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "g" && !event.repeat) {
        event.preventDefault();
        setControlsOpen((open) => !open);
        return;
      }
      if (event.key === "Escape" && dialogue) {
        setDialogue(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogue]);

  useEffect(() => {
    onDialogueOpenChange?.(dialogue !== null);
  }, [dialogue, onDialogueOpenChange]);

  useEffect(() => {
    if (!controlsOpen) return;
    const canvas = controlsCanvasRef.current;
    if (!canvas) return;

    const draw = () => drawControlsCanvas(canvas);
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [controlsOpen]);

  const playerHealth = Math.max(0, Math.round(combatStatus.playerHealth));
  const maxPlayerHealth = Math.max(1, combatStatus.maxPlayerHealth);
  const playerDead = playerHealth <= 0;
  const playerHealthRatio = Math.max(0, Math.min(1, playerHealth / maxPlayerHealth));
  const playerHealthPercent = Math.round(playerHealthRatio * 100);
  const healthStateClass =
    `${combatStatus.isHealing ? " is-healing" : ""}${
      playerHealthRatio <= 0.25 ? " is-critical" : playerHealthRatio <= 0.48 ? " is-wounded" : ""
    }`;

  return (
    <div className={dialogue ? "three-scene-wrap three-scene-wrap-dialogue" : "three-scene-wrap"}>
      <div className="three-scene" ref={mountRef} />
      <SceneDialogueOverlay
        nearNpc={nearNpc}
        nearInteraction={nearInteraction}
        dialogue={dialogue}
        onInteraction={(interaction) => {
          setNearInteraction(null);
          onInteractionCompleteRef.current?.(interaction);
        }}
        onClose={() => setDialogue(null)}
      />
      <div className="scene-fps" aria-hidden="true">
        <span ref={fpsRef}>-- FPS</span>
      </div>
      {controlsOpen ? (
        <canvas
          aria-label="操作快捷键"
          className="scene-controls-canvas"
          onClick={() => setControlsOpen(false)}
          ref={controlsCanvasRef}
        />
      ) : null}
      <div className={`scene-combat-hud${healthStateClass}`} aria-label="主角血量">
        <div className="scene-health-avatar" aria-hidden="true">
          <span>青</span>
        </div>
        <div className="scene-health-main">
          <div className="scene-health-row">
            <span className="scene-health-name">青岚</span>
            <strong>
              {playerHealth}/{maxPlayerHealth}
            </strong>
          </div>
          <div
            className="scene-health-track"
            role="progressbar"
            aria-label="主角生命值"
            aria-valuemin={0}
            aria-valuemax={maxPlayerHealth}
            aria-valuenow={playerHealth}
          >
            <span
              className="scene-health-fill"
              style={{ "--health-percent": `${playerHealthPercent}%` } as React.CSSProperties}
            />
            <span className="scene-health-shine" />
          </div>
          <p>
            敌人 {combatStatus.enemiesAlive}/{combatStatus.enemiesTotal} · {combatStatus.lastEvent}
          </p>
        </div>
      </div>
      <div className={playerDead ? "scene-death-overlay active" : "scene-death-overlay"} aria-hidden={!playerDead}>
        <strong>死亡</strong>
        <span>按 R 重新开始</span>
      </div>
    </div>
  );
}

function drawControlsCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const width = rect.width;
  const height = rect.height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(0, 0, 0, 0.76)";
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(width / 2, height * 0.42, 0, width / 2, height * 0.42, Math.max(width, height) * 0.68);
  vignette.addColorStop(0, "rgba(83, 58, 32, 0.18)");
  vignette.addColorStop(0.52, "rgba(10, 8, 7, 0.32)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.72)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const panelPadding = Math.max(18, Math.min(34, width * 0.024));
  drawOrnateFrame(ctx, panelPadding, panelPadding, width - panelPadding * 2, height - panelPadding * 2);
  drawBackgroundCompass(ctx, centerX - Math.min(width * 0.18, 260), height * 0.3, Math.min(width, height) * 0.16);

  const compact = width < 760 || height < 560;
  const key = compact ? Math.max(34, Math.min(52, width * 0.07, height * 0.082)) : Math.max(48, Math.min(78, width * 0.052, height * 0.09));
  const gap = Math.max(8, key * 0.2);
  const smallKey = key * 1.74;
  const spaceWidth = key * (compact ? 2.8 : 4.2);
  const keyboardWidth = compact ? key * 5 + gap * 4 : key * 7.9 + gap * 6;
  const mouseGroupWidth = compact ? key * 2.3 : key * 2.25;
  const inputGroupWidth = compact ? keyboardWidth : keyboardWidth + mouseGroupWidth + gap * 4;
  const keyboardHeight = compact ? key * 4 + gap * 3 : key * 3 + gap * 2;
  const keyboardX = centerX - inputGroupWidth / 2;
  const keyboardY = compact ? Math.max(124, height * 0.16) : Math.max(142, height * 0.19);
  const mouseX = compact ? centerX - mouseGroupWidth / 2 : keyboardX + keyboardWidth + gap * 4;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(255, 239, 205, 0.5)";
  ctx.shadowBlur = 12;
  ctx.fillStyle = "#ffe0a8";
  ctx.font = "800 " + Math.max(22, Math.min(34, width * 0.026)) + "px Microsoft YaHei, PingFang SC, sans-serif";
  ctx.fillText("操作快捷键", centerX, compact ? 72 : 84);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255, 238, 205, 0.58)";
  ctx.font = "600 " + Math.max(12, Math.min(15, width * 0.011)) + "px Microsoft YaHei, PingFang SC, sans-serif";
  ctx.fillText("按 G 或点击任意位置关闭", centerX, compact ? 96 : 108);

  const placeKey = (_id: string, label: string, x: number, y: number, w = key, h = key) => {
    drawKeyCap(ctx, label, x, y, w, h, key);
  };

  if (compact) {
    placeKey("W", "W", keyboardX + key + gap, keyboardY);
    placeKey("A", "A", keyboardX, keyboardY + key + gap);
    placeKey("S", "S", keyboardX + key + gap, keyboardY + key + gap);
    placeKey("D", "D", keyboardX + (key + gap) * 2, keyboardY + key + gap);
    placeKey("Shift", "Shift", keyboardX, keyboardY + (key + gap) * 2, smallKey, key);
    placeKey("Space", "Space", keyboardX + smallKey + gap, keyboardY + (key + gap) * 2, spaceWidth, key);
    placeKey("E", "E", keyboardX + (key + gap) * 3.35, keyboardY, key, key);
    placeKey("F", "F", keyboardX + (key + gap) * 4.1, keyboardY + key + gap, key, key);
    placeKey("G", "G", keyboardX + (key + gap) * 4.1, keyboardY + (key + gap) * 2, key, key);
    drawMouseGlyph(ctx, mouseX, keyboardY + (key + gap) * 3.12, key * 0.9, key * 1.45);
    drawDPadGlyph(ctx, mouseX + key * 1.35, keyboardY + (key + gap) * 3.26, key * 0.86);
  } else {
    placeKey("W", "W", keyboardX + key + gap, keyboardY);
    placeKey("A", "A", keyboardX, keyboardY + key + gap);
    placeKey("S", "S", keyboardX + key + gap, keyboardY + key + gap);
    placeKey("D", "D", keyboardX + (key + gap) * 2, keyboardY + key + gap);
    placeKey("Shift", "Shift", keyboardX, keyboardY + (key + gap) * 2, smallKey, key);
    placeKey("Space", "Space", keyboardX + smallKey + gap, keyboardY + (key + gap) * 2, spaceWidth, key);
    placeKey("E", "E", keyboardX + (key + gap) * 4.55, keyboardY + key * 0.42, key, key);
    placeKey("F", "F", keyboardX + (key + gap) * 5.72, keyboardY + key * 0.42, key, key);
    placeKey("G", "G", keyboardX + (key + gap) * 6.89, keyboardY + key * 0.42, key, key);
    drawMouseGlyph(ctx, mouseX, keyboardY + key * 0.12, key * 1.1, key * 1.82);
    drawDPadGlyph(ctx, mouseX + key * 1.28, keyboardY + key * 0.52, key * 0.96);
  }

  const labels = [
    { key: "W", badge: "WASD", title: "移动", detail: "控制角色移动" },
    { key: "Shift", badge: "Shift", title: "冲刺", detail: "按住快速冲刺" },
    { key: "Space", badge: "Space", title: "跳跃", detail: "越过低矮障碍" },
    { key: "Mouse", badge: "左键", title: "普通攻击", detail: "进行近身攻击" },
    { key: "Drag", badge: "拖拽", title: "环视镜头", detail: "按住拖拽旋转视角" },
    { key: "E", badge: "E", title: "对话", detail: "与 NPC 对话" },
    { key: "F", badge: "F", title: "互动", detail: "与物体或角色互动" },
    { key: "G", badge: "G", title: "指南", detail: "打开或关闭本面板" }
  ];
  const columns = compact ? 2 : 4;
  const labelAreaTop = compact ? Math.max(keyboardY + keyboardHeight + 34, height * 0.55) : Math.max(keyboardY + keyboardHeight + 82, height * 0.58);
  const labelAreaWidth = Math.min(width * 0.86, compact ? 620 : 1180);
  const labelCellWidth = labelAreaWidth / columns;
  const labelStartX = centerX - labelAreaWidth / 2;
  const labelRowGap = compact ? Math.max(58, height * 0.105) : Math.max(92, height * 0.13);

  ctx.save();
  ctx.strokeStyle = "rgba(196, 134, 65, 0.38)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(labelStartX - 18, labelAreaTop - labelRowGap * 0.45);
  ctx.lineTo(labelStartX + labelAreaWidth + 18, labelAreaTop - labelRowGap * 0.45);
  ctx.moveTo(labelStartX - 18, labelAreaTop + labelRowGap * (compact ? 1.62 : 0.55));
  ctx.lineTo(labelStartX + labelAreaWidth + 18, labelAreaTop + labelRowGap * (compact ? 1.62 : 0.55));
  ctx.stroke();
  ctx.restore();

  for (const [index, item] of labels.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const textX = labelStartX + column * labelCellWidth + labelCellWidth * (compact ? 0.5 : 0.48);
    const textY = labelAreaTop + row * labelRowGap;
    drawControlInfo(ctx, item.badge, item.title, item.detail, textX, textY, labelCellWidth * 0.78, compact);
  }

  ctx.textAlign = "left";
}

function drawBackgroundCompass(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "rgba(219, 166, 87, 0.38)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.arc(x, y, radius * 0.68, 0, Math.PI * 2);
  ctx.moveTo(x - radius * 1.15, y);
  ctx.lineTo(x + radius * 1.15, y);
  ctx.moveTo(x, y - radius * 1.15);
  ctx.lineTo(x, y + radius * 1.15);
  ctx.stroke();
  ctx.restore();
}

function drawKeyCap(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, width: number, height: number, baseKey: number) {
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, "rgba(54, 43, 31, 0.98)");
  gradient.addColorStop(1, "rgba(17, 14, 12, 0.98)");
  ctx.save();
  ctx.shadowColor = "rgba(235, 172, 82, 0.42)";
  ctx.shadowBlur = 13;
  roundRect(ctx, x, y, width, height, Math.max(7, baseKey * 0.12));
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(234, 177, 93, 0.78)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  roundRect(ctx, x + 5, y + 5, width - 10, height - 10, Math.max(5, baseKey * 0.09));
  ctx.strokeStyle = "rgba(255, 222, 166, 0.28)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.shadowColor = "rgba(255, 255, 255, 0.62)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(255, 246, 225, 0.92)";
  ctx.font = "800 " + Math.max(15, Math.min(baseKey * 0.38, width * 0.24)) + "px Georgia, Microsoft YaHei, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + width / 2, y + height / 2 + 1);
  ctx.restore();
}

function drawMouseGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.save();
  ctx.shadowColor = "rgba(235, 172, 82, 0.42)";
  ctx.shadowBlur = 13;
  roundRect(ctx, x, y, width, height, width * 0.42);
  ctx.fillStyle = "rgba(28, 24, 20, 0.66)";
  ctx.fill();
  ctx.strokeStyle = "rgba(239, 184, 99, 0.82)";
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + width / 2, y + height * 0.05);
  ctx.lineTo(x + width / 2, y + height * 0.38);
  ctx.moveTo(x + width * 0.18, y + height * 0.39);
  ctx.lineTo(x + width * 0.82, y + height * 0.39);
  ctx.strokeStyle = "rgba(255, 235, 196, 0.58)";
  ctx.stroke();
  roundRect(ctx, x + width * 0.43, y + height * 0.14, width * 0.14, height * 0.2, width * 0.08);
  ctx.fillStyle = "rgba(255, 236, 196, 0.72)";
  ctx.fill();
  ctx.restore();
}

function drawDPadGlyph(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  ctx.save();
  ctx.strokeStyle = "rgba(255, 239, 210, 0.76)";
  ctx.fillStyle = "rgba(255, 239, 210, 0.76)";
  ctx.lineWidth = Math.max(1.6, size * 0.035);
  ctx.shadowColor = "rgba(255, 255, 255, 0.48)";
  ctx.shadowBlur = 10;
  for (const [dx, dy, angle] of [
    [0, -1, -Math.PI / 2],
    [1, 0, 0],
    [0, 1, Math.PI / 2],
    [-1, 0, Math.PI]
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dx * size * 0.34, cy + dy * size * 0.34);
    ctx.stroke();
    ctx.save();
    ctx.translate(cx + dx * size * 0.42, cy + dy * size * 0.42);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(size * 0.1, 0);
    ctx.lineTo(-size * 0.06, -size * 0.07);
    ctx.lineTo(-size * 0.06, size * 0.07);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.08, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawControlInfo(
  ctx: CanvasRenderingContext2D,
  badge: string,
  title: string,
  detail: string,
  centerX: number,
  centerY: number,
  maxWidth: number,
  compact: boolean
) {
  const badgeSize = compact ? 36 : 48;
  const titleSize = compact ? 18 : 25;
  const detailSize = compact ? 12 : 15;
  const badgeX = centerX - maxWidth / 2 + badgeSize / 2;
  const textX = badgeX + badgeSize * 0.82;
  ctx.save();
  ctx.translate(badgeX, centerY);
  ctx.rotate(Math.PI / 4);
  roundRect(ctx, -badgeSize / 2, -badgeSize / 2, badgeSize, badgeSize, 5);
  ctx.fillStyle = "rgba(26, 21, 17, 0.86)";
  ctx.fill();
  ctx.strokeStyle = "rgba(232, 174, 87, 0.72)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.shadowColor = "rgba(255, 255, 255, 0.78)";
  ctx.shadowBlur = 10;
  ctx.fillStyle = "rgba(255, 245, 225, 0.9)";
  ctx.font = "800 " + (compact ? 13 : 16) + "px Microsoft YaHei, PingFang SC, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(badge, badgeX, centerY);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
  ctx.font = "800 " + titleSize + "px Microsoft YaHei, PingFang SC, sans-serif";
  ctx.fillText(title, textX, centerY - detailSize * 0.55);
  ctx.font = "600 " + detailSize + "px Microsoft YaHei, PingFang SC, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.54)";
  ctx.fillText(detail, textX, centerY + detailSize * 1.05);
  ctx.restore();
}

function drawOrnateFrame(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(195, 133, 61, 0.72)";
  ctx.lineWidth = 1.1;
  ctx.shadowColor = "rgba(219, 157, 74, 0.28)";
  ctx.shadowBlur = 8;
  ctx.strokeRect(x, y, width, height);
  ctx.strokeStyle = "rgba(246, 199, 123, 0.28)";
  ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);

  const corner = Math.min(58, width * 0.045, height * 0.075);
  const drawCorner = (sx: number, sy: number, flipX: number, flipY: number) => {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(flipX, flipY);
    ctx.beginPath();
    ctx.moveTo(0, corner);
    ctx.lineTo(0, 0);
    ctx.lineTo(corner, 0);
    ctx.moveTo(8, corner * 0.8);
    ctx.quadraticCurveTo(corner * 0.24, corner * 0.34, corner * 0.86, 8);
    ctx.moveTo(14, 14);
    ctx.lineTo(corner * 0.58, 14);
    ctx.moveTo(14, 14);
    ctx.lineTo(14, corner * 0.58);
    ctx.stroke();
    ctx.restore();
  };
  drawCorner(x + 10, y + 10, 1, 1);
  drawCorner(x + width - 10, y + 10, -1, 1);
  drawCorner(x + 10, y + height - 10, 1, -1);
  drawCorner(x + width - 10, y + height - 10, -1, -1);

  for (const [mx, my, rotation] of [
    [x + width / 2, y + 6, 0],
    [x + width / 2, y + height - 6, Math.PI]
  ] as const) {
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(9, 0);
    ctx.lineTo(0, 8);
    ctx.lineTo(-9, 0);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

/**
 * 初始化章节场景：渲染器、光照、程序化世界、角色、输入与 RAF 循环。
 * 返回必须在卸载/HMR 时调用的清理函数。
 */
function mountGraybudVillage(
  THREE: ThreeModule,
  mount: HTMLDivElement,
  ui: SceneUiBridge,
  fpsRef: RefObject<HTMLSpanElement | null>,
  sceneDefinition: ChapterSceneDefinition,
  completedInteractionIds: string[]
) {
  const disposables: Disposable[] = [];
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(sceneDefinition.skyColor);
  // 峡谷场景使用更浓雾效，营造狭窄封闭感。
  scene.fog = new THREE.FogExp2(sceneDefinition.fogColor, sceneDefinition.id === "sprout-seeking-ravine" ? 0.02 : 0.016);

  const camera = new THREE.PerspectiveCamera(62, mount.clientWidth / mount.clientHeight, 0.1, 180);
  camera.position.set(...sceneDefinition.camera.position);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(getScenePixelRatio());
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  // 可玩几何体挂在 `world` 下；天空/远山/星空直接挂在 `scene` 上。
  const world = new THREE.Group();
  scene.add(world);
  const aiDebugGroup = new THREE.Group();
  aiDebugGroup.name = "AI Debug Layer";
  aiDebugGroup.visible = false;
  world.add(aiDebugGroup);

  const ambient = new THREE.HemisphereLight(0xb8cfc6, 0x2a1b12, sceneDefinition.ambientIntensity);
  scene.add(ambient);

  const moon = new THREE.DirectionalLight(0x9db6c7, sceneDefinition.moonIntensity);
  moon.position.set(-9, 16, 8);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  scene.add(moon);

  const fireLight = new THREE.PointLight(0xff7a2a, sceneDefinition.fireIntensity, 24, 1.4);
  fireLight.position.set(0, 1.25, 0);
  fireLight.castShadow = false;
  scene.add(fireLight);
  exposeSceneDiagnostics(renderer, scene, world, sceneDefinition.id);

  const movement = { walkSpeed: 5.0, sprintSpeed: 9.5, mouseSensitivity: 0.004 };
  const thirdPerson = {
    cameraDistance: 3.2,
    cameraHeight: 1.05,
    lookAtHeight: 1.5,
    moveTurnSpeed: 4,
    idleTurnSpeed: 4,
    cameraFollowSpeed: 10,
    cameraSpringStiffness: 58,
    cameraSpringDamping: 14,
    lookAtFollowSpeed: 11,
    speedDistanceBoost: 1.25,
    lookAheadDistance: 1.45,
    playerCollisionRadius: 0.42
  };
  const lighting = { fireIntensity: fireLight.intensity, moonIntensity: moon.intensity, ambientIntensity: ambient.intensity };
  const fogSettings = { density: scene.fog.density };
  const aiDebug = {
    enabled: false,
    showPaths: true,
    showRanges: true,
    showColliders: false
  };
  const combatSettings = {
    playerMaxHealth: 100,
    playerAttackDamage: 34,
    playerAttackRadius: 2.15,
    playerAttackArc: 0.55,
    enemyDetectRadius: 9.5,
    enemyVisionDot: Math.cos((105 * Math.PI) / 180 / 2),
    enemyAlertDuration: 0.75,
    enemyAlertIconDuration: 2.4,
    enemyAlertJumpDuration: 0.55,
    enemyAttackRadius: 1.35,
    enemyAttackDamage: 12,
    enemySpeed: 2.15,
    npcPatrolSpeed: 0.75,
    hearthHealRadius: 4.4,
    hearthHealPerSecond: 7
  };
  const dialogueCamera = {
    distanceScale: 0.75,
    minDistance: 2.6,
    maxDistance: 5.55,
    heightOffset: 1.2,
    lookAtHeight: 0.4,
    smoothSpeed: 2.4,
    exitDuration: 1.2
  };

  let sceneDisposed = false;
  let playerCharacter: any | undefined;
  // 高度归一化后，用垂直偏移使模型脚底落在 y=0。
  let playerFootOffsetY = 0;
  let playerAnimator: CharacterAnimator | undefined;
  let playerHealingVfx: PlayerHealingVfx | undefined;
  // Anime.js 负责纯展示循环；导入角色的动画片段仍由 AnimationMixer 驱动。
  const animeAnimations: JSAnimation[] = [];
  const characterAnimators: CharacterAnimator[] = [];
  const characterEquipment: CharacterEquipment[] = [];
  let universalAnimator: CharacterAnimator | undefined;
  const villageNpcs: VillageNpcInstance[] = [];
  const patrolNpcs: PatrolNpcState[] = [];
  const enemies: EnemyInstance[] = [];
  const floatingDamageTexts: FloatingDamageText[] = [];
  const combatState = {
    playerHealth: combatSettings.playerMaxHealth,
    maxPlayerHealth: combatSettings.playerMaxHealth,
    playerInvulnerableTimer: 0,
    playerAttackTimer: 0,
    enemiesDefeated: 0,
    lastEvent: "村落周边暂时平静",
    isHealing: false,
    hearthHealMessageTimer: 0,
    playerDeathPlayed: false,
    deathOverlayTimer: 0,
    uiTimer: 0
  };
  const interactionMarkers: SceneInteractionInstance[] = [];
  let nearbyNpc: VillageNpcInstance | undefined;
  let nearbyNpcId: string | null = null;
  let dialogueNpc: VillageNpcInstance | null = null;
  let dialogueWasOpen = false;
  let dialogueExitTimer = 0;
  let dialogueExitStartPosition: any | null = null;
  let dialogueExitStartLookTarget: any | null = null;
  let nearbyInteraction: SceneInteractionInstance | undefined;
  let nearbyInteractionId: string | null = null;
  let sceneGui:
    | {
        registerCharacter: (
          animator: CharacterAnimator,
          equipment: CharacterEquipment,
          ctx: { THREE: unknown; loadModelById: typeof loadModelById }
        ) => void;
        setVisible: (visible: boolean) => void;
        syncFromScene?: () => void;
        destroy: () => void;
      }
    | undefined;
  let dialogueCameraGui:
    | {
        setVisible: (visible: boolean) => void;
        destroy: () => void;
      }
    | undefined;

  const registerCharacterToGui = (animator: CharacterAnimator, equipment: CharacterEquipment) => {
    sceneGui?.registerCharacter(animator, equipment, { THREE, loadModelById });
  };
  const sceneNpcs = getNpcsForScene(sceneDefinition.id);
  const sceneInteractions = getInteractionsForScene(sceneDefinition.id).filter(
    (interaction) => !completedInteractionIds.includes(interaction.id)
  );
  const staticCollisionCircles = createSceneCollisionCircles(sceneDefinition);

  // --- 程序化世界 + 章节资源（异步 GLB 加载受 sceneDisposed 守卫）---
  createGround(THREE, world, disposables, sceneDefinition);
  createSceneFeatures(THREE, world, disposables, sceneDefinition, animeAnimations);
  interactionMarkers.push(...createInteractionMarkers(THREE, world, disposables, sceneInteractions, animeAnimations));
  createForestRing(THREE, world, disposables);
  createDistantHills(THREE, scene, disposables);
  createStarfield(THREE, scene, disposables);
  void loadChapterSceneAssets(THREE, world, sceneDefinition, disposables, () => sceneDisposed);

  // --- 玩家角色（KayKit 野蛮人 + 默认单手剑）---
  void loadCharacterWithAnimations(
    THREE,
    loadModelById,
    "characters.npc.kaykit.barbarian",
    ["animations.kaykit.rigMedium.general", "animations.kaykit.rigMedium.movementBasic"]
  )
    .then(({ characterGltf, animator }) => {
      if (sceneDisposed) {
        animator.dispose();
        return;
      }

      const character = characterGltf.scene as any;
      character.name = "Player";
      character.traverse((child: any) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const bounds = new THREE.Box3().setFromObject(character);
      const size = bounds.getSize(new THREE.Vector3());
      const targetHeight = 1.65;
      if (size.y > 0) {
        character.scale.setScalar(targetHeight / size.y);
      }
      bounds.setFromObject(character);
      playerFootOffsetY = -bounds.min.y;
      character.position.set(sceneDefinition.spawn[0], playerFootOffsetY + sceneDefinition.spawn[1], sceneDefinition.spawn[2]);
      character.rotation.y = -1.208;
      playerHealingVfx = createPlayerHealingVfx(THREE, disposables);
      character.add(playerHealingVfx.group);
      world.add(character);

      playerCharacter = character;
      playerAnimator = animator;
      character.updateMatrixWorld(true);

      character.traverse((child: any) => {
        if (child.geometry) disposables.push(child.geometry);
        if (child.material) {
          if (Array.isArray(child.material)) disposables.push(...child.material);
          else disposables.push(child.material);
        }
      });

      const equipment = new CharacterEquipment(character);
      characterEquipment.push(equipment);

      void equipment
        .equip(THREE, loadModelById, "right", "props.weapons.kaykit.sword1Handed")
        .then(() => {
          if (sceneDisposed) return;
          registerCharacterToGui(animator, equipment);
        })
        .catch((error: unknown) => {
          console.error("Failed to equip default weapon:", error);
          registerCharacterToGui(animator, equipment);
        });

      const started = animator.play("Idle_A", { fade: 0 });
      if (!started) {
        animator.play("idle", { fade: 0 });
      }
      console.info("[hearth] character clips:", animator.clipNames.join(", "));
      characterAnimators.push(animator);
    })
    .catch((error: unknown) => {
      console.error("Failed to load test character:", error);
    });

  // --- 按章节 NPC 定义生成的场景 NPC ---
  void Promise.all(
    sceneNpcs.map((definition) => spawnVillageNpc(THREE, world, loadModelById, definition, disposables, sceneDefinition.id))
  )
    .then((npcs) => {
      if (sceneDisposed) {
        for (const npc of npcs) npc.animator.dispose();
        return;
      }
      villageNpcs.push(...npcs);
      for (const npc of npcs) {
        characterAnimators.push(npc.animator);
        patrolNpcs.push(createPatrolNpcState(npc));
      }
      console.info("[hearth] scene npcs:", npcs.map((npc) => npc.definition.name).join(", "));
    })
    .catch((error: unknown) => {
      console.error("Failed to load village npc:", error);
    });

  void spawnSceneEnemies(THREE, world, loadModelById, sceneDefinition, disposables)
    .then((spawnedEnemies) => {
      if (sceneDisposed) {
        for (const enemy of spawnedEnemies) enemy.animator.dispose();
        return;
      }
      enemies.push(...spawnedEnemies);
      for (const enemy of spawnedEnemies) {
        characterAnimators.push(enemy.animator);
      }
      pushCombatStatus(ui, combatState, enemies);
      console.info("[hearth] scene enemies:", spawnedEnemies.map((enemy) => enemy.name).join(", "));
    })
    .catch((error: unknown) => {
      console.error("Failed to load scene enemies:", error);
    });

  // 可选 UAL 原型角色 — 仅灰芽炉火场景，用于展示另一套动画库。
  if (sceneDefinition.id === "gray-sprout-hearth") void (async () => {
    try {
      const ualEntry = await getModelEntry("characters.prototype.ual.standard");
      const ualAvailable = await isModelUrlAvailable(ualEntry.path);
      if (!ualAvailable) {
        console.warn(
          "[hearth] UAL prototype skipped — copy UAL1_Standard.glb to apps/web/public/models/characters/prototype/ual1-standard.glb"
        );
        return;
      }

      const { characterGltf, animator } = await loadCharacterWithAnimations(
        THREE,
        loadModelById,
        "characters.prototype.ual.standard",
        []
      );
      if (sceneDisposed) {
        animator.dispose();
        return;
      }

      const character = characterGltf.scene as any;
      character.name = "Universal Animation Library Prototype";
      character.traverse((child: any) => {
        if (child.isMesh || child.isSkinnedMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      const bounds = new THREE.Box3().setFromObject(character);
      const size = bounds.getSize(new THREE.Vector3());
      const targetHeight = 1.72;
      if (size.y > 0) {
        character.scale.setScalar(targetHeight / size.y);
      }
      bounds.setFromObject(character);
      character.position.set(-2.65, -bounds.min.y, 2.35);
      character.rotation.y = Math.PI * 0.82;
      world.add(character);

      character.traverse((child: any) => {
        if (child.geometry) disposables.push(child.geometry);
        if (child.material) {
          if (Array.isArray(child.material)) disposables.push(...child.material);
          else disposables.push(child.material);
        }
      });

      const started = animator.play("Idle_Torch_Loop", { fade: 0 });
      if (!started) {
        animator.play("Idle_Loop", { fade: 0 });
      }
      universalAnimator = animator;
      characterAnimators.push(animator);
      console.info("[hearth] UAL clips:", animator.clipNames.join(", "));
    } catch (error: unknown) {
      console.error("Failed to load Universal Animation Library character:", error);
    }
  })();

  // --- 输入：键盘移动、指针环视 vs 点击攻击 ---
  const keys: KeyState = {};
  const pointer = {
    dragging: false,
    pressed: false,
    // 移动距离低于此像素阈值视为点击（攻击），而非拖拽镜头。
    dragThreshold: 5,
    x: 0,
    y: 0,
    pressX: 0,
    pressY: 0,
    yaw: 0,
    yawTarget: 0,
    pitch: 0.13
  };

  // lil-gui 调参面板 — 仅开发环境懒加载。
  if (import.meta.env.DEV) {
    void import("../villageSceneGui.ts").then(({ attachDialogueCameraGui, attachVillageSceneGui }) => {
      if (sceneDisposed) return;
      sceneGui = attachVillageSceneGui({
        camera,
        pointer,
        movement,
        thirdPerson,
        lighting,
        fog: fogSettings,
        fireLight,
        moon,
        ambient,
        scene: scene as any,
        aiDebug
      });      for (let i = 0; i < characterAnimators.length; i += 1) {
        const equipment = characterEquipment[i];
        if (equipment) {
          sceneGui.registerCharacter(characterAnimators[i]!, equipment, { THREE, loadModelById });
        }
      }
      dialogueCameraGui = attachDialogueCameraGui(dialogueCamera);
      dialogueCameraGui.setVisible(false);
    });
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "i") {
      event.preventDefault();
      aiDebug.enabled = !aiDebug.enabled;
      sceneGui?.syncFromScene?.();
      return;
    }

    if (ui.isDialogueOpen()) {
      if (event.key === "Escape") {
        dialogueNpc = null;
        ui.closeDialogue();
      }
      return;
    }

    keys[event.key.toLowerCase()] = true;
    if (
      !event.repeat &&
      event.key.toLowerCase() === "r" &&
      playerCharacter &&
      combatState.playerHealth <= 0 &&
      combatState.deathOverlayTimer >= 1.35
    ) {
      resetCombatEncounter(
        THREE,
        playerCharacter,
        playerAnimator,
        playerFootOffsetY,
        sceneDefinition,
        combatState,
        enemies,
        floatingDamageTexts,
        ui
      );
      return;
    }
    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat && playerAnimator) {
        triggerPlayerJump(playerAnimator);
      }
    }
    if (!event.repeat && event.key.toLowerCase() === "e" && nearbyNpc) {
      dialogueNpc = nearbyNpc;
      ui.openDialogue(npcDialoguePayload(nearbyNpc), nearbyNpc);
    }
    if (!event.repeat && event.key.toLowerCase() === "f" && nearbyInteraction) {
      const completed = nearbyInteraction;
      ui.completeInteraction(nearbyInteraction.definition);
      nearbyInteraction = undefined;
      nearbyInteractionId = null;
      ui.setNearInteraction(null);
      // 先播放完成动效，再隐藏标记。
      void playInteractionCompleteAnimation(completed.root, animeAnimations).then(() => {
        if (!sceneDisposed) completed.root.visible = false;
      });
    }
    if (universalAnimator) {
      const clipName = universalClipForKey(event.key);
      if (clipName) {
        universalAnimator.play(clipName, { fade: 0.18, restart: true, loop: !["Sword_Attack", "Spell_Simple_Shoot"].includes(clipName) });
      }
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    keys[event.key.toLowerCase()] = false;
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    pointer.pressed = true;
    pointer.dragging = false;
    pointer.pressX = event.clientX;
    pointer.pressY = event.clientY;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!pointer.pressed) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    if (!pointer.dragging) {
      const totalDx = event.clientX - pointer.pressX;
      const totalDy = event.clientY - pointer.pressY;
      if (totalDx * totalDx + totalDy * totalDy >= pointer.dragThreshold * pointer.dragThreshold) {
        pointer.dragging = true;
      }
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (!pointer.dragging) return;
    pointer.yawTarget -= dx * movement.mouseSensitivity;
    pointer.pitch -= dy * movement.mouseSensitivity;
    pointer.pitch = THREE.MathUtils.clamp(pointer.pitch, -0.25, 1.05);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (pointer.pressed && !pointer.dragging && playerAnimator) {
      if (triggerPlayerAttack(playerAnimator)) {
        combatState.playerAttackTimer = 0.2;
      }
    }
    pointer.pressed = false;
    pointer.dragging = false;
    if (renderer.domElement.hasPointerCapture(event.pointerId)) {
      renderer.domElement.releasePointerCapture(event.pointerId);
    }
  };
  const onResize = () => {
    camera.aspect = mount.clientWidth / mount.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(getScenePixelRatio());
    renderer.setSize(mount.clientWidth, mount.clientHeight);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onResize);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerup", onPointerUp);
  renderer.domElement.addEventListener("pointerleave", onPointerUp);

  const clock = new THREE.Clock();
  const animated = collectAnimatedObjects(world);
  let animationFrame = 0;
  let fpsSmooth = 60;
  let fpsHudAccum = 0;

  // --- 主渲染循环 ---
  const animate = () => {
    if (sceneDisposed) return;

    // 限制 delta，避免标签页后台切换后物理/镜头跳变。
    const delta = Math.min(clock.getDelta(), 0.045);
    const elapsed = clock.elapsedTime;

    if (delta > 0) {
      fpsSmooth = fpsSmooth * 0.88 + (1 / delta) * 0.12;
      fpsHudAccum += delta;
      if (fpsHudAccum >= 0.25 && fpsRef.current) {
        fpsHudAccum = 0;
        fpsRef.current.textContent = `${Math.round(fpsSmooth)} FPS`;
        writeSceneDiagnostics(renderer, scene, world, sceneDefinition.id);
      }
    }
    const dialogueOpen = ui.isDialogueOpen();
    if (dialogueOpen && !dialogueWasOpen) {
      camera.userData.dialogueLookTarget = getCurrentCameraLookTarget(THREE, camera, playerCharacter, dialogueNpc?.root);
      pauseBackgroundActorsForDialogue(patrolNpcs, enemies, dialogueNpc);
    }
    if (!dialogueOpen && dialogueWasOpen) {
      dialogueExitTimer = dialogueCamera.exitDuration;
      dialogueExitStartPosition = camera.position.clone();
      dialogueExitStartLookTarget = camera.userData.dialogueLookTarget?.clone?.() ?? playerCharacter?.position?.clone?.() ?? null;
      const spring = camera.userData.thirdPersonSpring as
        | {
            velocity?: { set: (x: number, y: number, z: number) => void };
            lookTarget?: { copy: (value: unknown) => void };
          }
        | undefined;
      if (spring?.lookTarget && camera.userData.dialogueLookTarget) {
        spring.lookTarget.copy(camera.userData.dialogueLookTarget);
      }
      spring?.velocity?.set(0, 0, 0);
    }
    dialogueWasOpen = dialogueOpen;
    sceneGui?.setVisible(!dialogueOpen);
    dialogueCameraGui?.setVisible(dialogueOpen);

    if (playerCharacter && playerAnimator) {
        if (dialogueOpen) {
          pauseBackgroundActorsForDialogue(patrolNpcs, enemies, dialogueNpc);
          updatePlayerHealingVfx(playerHealingVfx, false, elapsed, delta);
          if (dialogueNpc) {
          dialogueNpc.animator.setLocomotion("idle", 0.12);
          alignRootToGround(dialogueNpc.root);
          updateDialogueCamera(THREE, camera, playerCharacter, dialogueNpc.root, delta, dialogueCamera);
        }
      } else {
        dialogueNpc = null;
        const exitBlendActive = dialogueExitTimer > 0;
        const playerDefeated = combatState.playerHealth <= 0;
        if (playerDefeated) {
          combatState.isHealing = false;
          combatState.deathOverlayTimer += delta;
          if (!combatState.playerDeathPlayed) {
            combatState.playerDeathPlayed = true;
            playCharacterDeathAnimation(playerAnimator, playerCharacter);
          }
          combatState.lastEvent = "你受伤倒下了，按 R 重试";
          pushCombatStatus(ui, combatState, enemies);
        } else if (exitBlendActive) {
          dialogueExitTimer = Math.max(0, dialogueExitTimer - delta);
          updateDialogueExitCamera(
            THREE,
            camera,
            playerCharacter,
            pointer,
            thirdPerson,
            dialogueCamera,
            dialogueExitTimer,
            dialogueExitStartPosition,
            dialogueExitStartLookTarget
          );
        } else {
          dialogueExitStartPosition = null;
          dialogueExitStartLookTarget = null;
          updateThirdPersonPlayer(
            THREE,
            playerCharacter,
            playerAnimator,
            camera,
            pointer,
            keys,
            delta,
            {
              ...movement,
              ...thirdPerson,
              collisionCircles: getActiveCollisionCircles(staticCollisionCircles, villageNpcs, interactionMarkers, enemies)
            },
            playerFootOffsetY
          );
        }

        if (!playerDefeated) {
          updatePatrolNpcs(THREE, patrolNpcs, delta, combatSettings.npcPatrolSpeed, staticCollisionCircles);
          updateEnemies(
            THREE,
            world,
            enemies,
            floatingDamageTexts,
            playerCharacter,
            delta,
            combatSettings,
            combatState,
            staticCollisionCircles
          );
          updatePlayerCombat(THREE, world, enemies, floatingDamageTexts, playerCharacter, delta, combatSettings, combatState);
          updateHearthHealing(playerCharacter, delta, combatSettings, combatState, sceneDefinition);
        } else {
          combatState.isHealing = false;
        }
        updatePlayerHealingVfx(playerHealingVfx, combatState.isHealing && !playerDefeated, elapsed, delta);
        updateEnemyHealthBars(THREE, enemies, camera, delta);
        updateFloatingDamageTexts(floatingDamageTexts, camera, delta);
        combatState.uiTimer += delta;
        if (combatState.uiTimer >= 0.12) {
          combatState.uiTimer = 0;
          pushCombatStatus(ui, combatState, enemies);
        }

      nearbyNpc = findNearbyNpc(playerCharacter, villageNpcs);
      const nextNearId = nearbyNpc?.definition.id ?? null;
      // 仅当邻近目标变化时才推送到 React，避免多余 setState。
      if (nextNearId !== nearbyNpcId) {
        nearbyNpcId = nextNearId;
        ui.setNearNpc(
          nearbyNpc
            ? {
                id: nearbyNpc.definition.id,
                name: nearbyNpc.definition.name,
                title: nearbyNpc.definition.title
              }
            : null
        );
      }

      nearbyInteraction = findNearbyInteraction(playerCharacter, interactionMarkers);
      const nextInteractionId = nearbyInteraction?.definition.id ?? null;
      if (nextInteractionId !== nearbyInteractionId) {
        nearbyInteractionId = nextInteractionId;
        ui.setNearInteraction(nearbyInteraction?.definition ?? null);
      }
      }
    } else if (!playerCharacter || !playerAnimator) {
      // 玩家模型加载完成前，使用章节默认镜头。
      camera.position.set(...sceneDefinition.camera.position);
      camera.lookAt(...sceneDefinition.camera.lookAt);
    }

    // 环境动画：火光闪烁、火星、树木摇曳、旗帜（不由 Anime.js 驱动）。
    updateVillageAnimation(animated, fireLight, lighting, elapsed);
    for (const animator of characterAnimators) {
      animator.update(delta);
    }
    updateAiDebugLayer(
      THREE,
      aiDebugGroup,
      aiDebug,
      patrolNpcs,
      enemies,
      staticCollisionCircles,
      combatSettings
    );

    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  };
  animate();

  return () => {
    sceneDisposed = true;
    sceneGui?.destroy();
    dialogueCameraGui?.destroy();
    // 卸载/HMR 时回滚 Anime.js 变换，避免场景重挂载时残留状态。
    for (const animation of animeAnimations) {
      animation.revert();
    }
    for (const animator of characterAnimators) {
      animator.dispose();
    }
    for (const equipment of characterEquipment) {
      equipment.dispose();
    }
    cancelAnimationFrame(animationFrame);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("resize", onResize);
    renderer.domElement.removeEventListener("pointerdown", onPointerDown);
    renderer.domElement.removeEventListener("pointermove", onPointerMove);
    renderer.domElement.removeEventListener("pointerup", onPointerUp);
    renderer.domElement.removeEventListener("pointerleave", onPointerUp);

    sceneGui?.destroy();
    dialogueCameraGui?.destroy();
    clearModelCache();
    for (const item of disposables) item.dispose?.();
    renderer.dispose();
    clearSceneDiagnostics(renderer);
    if (renderer.domElement.parentElement === mount) {
      mount.removeChild(renderer.domElement);
    }
  };
}

/** 限制设备像素比，减轻高密度屏幕上的 fill-rate 压力。 */
function updateDialogueCamera(
  THREE: ThreeModule,
  camera: any,
  playerRoot: any,
  npcRoot: any,
  delta: number,
  settings: {
    distanceScale: number;
    minDistance: number;
    maxDistance: number;
    heightOffset: number;
    lookAtHeight: number;
    smoothSpeed: number;
  }
) {
  const playerPosition = playerRoot.position.clone();
  const npcPosition = npcRoot.position.clone();
  const between = npcPosition.clone().sub(playerPosition);
  if (between.lengthSq() < 1e-4) return;

  const flatBetween = new THREE.Vector3(between.x, 0, between.z).normalize();
  const side = new THREE.Vector3(-flatBetween.z, 0, flatBetween.x);
  const midpoint = playerPosition.clone().add(npcPosition).multiplyScalar(0.5);
  const lookTarget = midpoint.clone();
  lookTarget.y = Math.max(playerPosition.y, npcPosition.y) + settings.lookAtHeight;

  const distance = THREE.MathUtils.clamp(
    playerPosition.distanceTo(npcPosition) * settings.distanceScale,
    settings.minDistance,
    settings.maxDistance
  );
  const desiredPosition = lookTarget.clone().add(side.multiplyScalar(distance));
  desiredPosition.y = lookTarget.y + settings.heightOffset;
  const smooth = 1 - Math.exp(-settings.smoothSpeed * delta);

  camera.position.lerp(desiredPosition, smooth);
  const smoothLookTarget = camera.userData.dialogueLookTarget?.clone?.() ?? lookTarget.clone();
  smoothLookTarget.lerp(lookTarget, smooth);
  camera.lookAt(smoothLookTarget);
  camera.userData.dialogueLookTarget = smoothLookTarget.clone();
  playerRoot.rotation.y = Math.atan2(between.x, between.z);
  npcRoot.rotation.y = Math.atan2(-between.x, -between.z);
}

function getCurrentCameraLookTarget(THREE: ThreeModule, camera: any, playerRoot: any, npcRoot?: any) {
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);

  let focusDistance = 5;
  if (playerRoot && npcRoot) {
    const midpoint = playerRoot.position.clone().add(npcRoot.position).multiplyScalar(0.5);
    focusDistance = THREE.MathUtils.clamp(camera.position.distanceTo(midpoint), 2, 12);
  }

  return camera.position.clone().add(direction.multiplyScalar(focusDistance));
}

function updateDialogueExitCamera(
  THREE: ThreeModule,
  camera: any,
  playerRoot: any,
  pointer: { yaw: number; pitch: number },
  thirdPerson: {
    cameraDistance: number;
    cameraHeight: number;
    lookAtHeight: number;
  },
  dialogueCamera: { exitDuration: number },
  exitTimer: number,
  startPosition: any | null,
  startLookTarget: any | null
) {
  const frame = getThirdPersonCameraFrame(THREE, playerRoot, pointer, thirdPerson);
  const duration = Math.max(0.01, dialogueCamera.exitDuration);
  const progress = THREE.MathUtils.clamp(1 - exitTimer / duration, 0, 1);
  const eased = 1 - Math.pow(1 - progress, 3);

  if (startPosition) {
    camera.position.copy(startPosition).lerp(frame.position, eased);
  } else {
    camera.position.lerp(frame.position, eased);
  }

  const lookTarget = startLookTarget ? startLookTarget.clone().lerp(frame.lookTarget, eased) : frame.lookTarget;
  camera.lookAt(lookTarget);
  camera.userData.dialogueLookTarget = lookTarget.clone();

  if (progress >= 1) {
    camera.userData.thirdPersonSpring = {
      velocity: new THREE.Vector3(),
      lookTarget: frame.lookTarget.clone()
    };
  }
}

function getThirdPersonCameraFrame(
  THREE: ThreeModule,
  playerRoot: any,
  pointer: { yaw: number; pitch: number },
  thirdPerson: {
    cameraDistance: number;
    cameraHeight: number;
    lookAtHeight: number;
  }
) {
  const lookTarget = new THREE.Vector3(
    playerRoot.position.x,
    playerRoot.position.y + thirdPerson.lookAtHeight,
    playerRoot.position.z
  );
  const orbitYaw = playerRoot.rotation.y + Math.PI + pointer.yaw;
  const cosPitch = Math.cos(pointer.pitch);
  const sinPitch = Math.sin(pointer.pitch);
  const offset = new THREE.Vector3(
    Math.sin(orbitYaw) * cosPitch * thirdPerson.cameraDistance,
    sinPitch * thirdPerson.cameraDistance + thirdPerson.cameraHeight,
    Math.cos(orbitYaw) * cosPitch * thirdPerson.cameraDistance
  );

  return {
    lookTarget,
    position: lookTarget.clone().add(offset)
  };
}

function getSceneTerrainLift(x: number, z: number) {
  return Math.sin(x * 0.12 + z * 0.09) * 0.05;
}

function alignRootToGround(root: any) {
  const footOffsetY = root.userData?.footOffsetY ?? root.position.y;
  root.position.y = footOffsetY + getSceneTerrainLift(root.position.x, root.position.z);
}

function pauseBackgroundActorsForDialogue(
  patrolNpcs: PatrolNpcState[],
  enemies: EnemyInstance[],
  dialogueNpc: VillageNpcInstance | null
) {
  for (const patrol of patrolNpcs) {
    patrol.path = [];
    patrol.pathIndex = 0;
    patrol.pathRefreshTimer = 0;
    patrol.waitTimer = Math.max(patrol.waitTimer, 0.4);
    patrol.npc.animator.setLocomotion("idle", 0.12);
    alignRootToGround(patrol.npc.root);
  }

  for (const enemy of enemies) {
    if (enemy.state === "dead") continue;
    enemy.path = [];
    enemy.pathIndex = 0;
    enemy.pathRefreshTimer = 0;
    enemy.state = "patrol";
    enemy.animator.setLocomotion("idle", 0.12);
    alignRootToGround(enemy.root);
  }

  if (dialogueNpc) {
    dialogueNpc.animator.setLocomotion("idle", 0.12);
    alignRootToGround(dialogueNpc.root);
  }
}

function createPatrolNpcState(npc: VillageNpcInstance): PatrolNpcState {
  const root = npc.root as { position: { x: number; z: number } };
  const baseX = root.position.x;
  const baseZ = root.position.z;
  return {
    npc,
    waypoints: [
      [baseX, baseZ],
      [baseX + 1.8, baseZ + 0.9],
      [baseX - 1.2, baseZ + 1.8]
    ],
    targetIndex: 0,
    waitTimer: 0.8 + Math.random() * 1.4,
    path: [],
    pathIndex: 0,
    pathRefreshTimer: 0
  };
}

function updatePatrolNpcs(
  THREE: ThreeModule,
  patrolNpcs: PatrolNpcState[],
  delta: number,
  speed: number,
  obstacles: SceneCollisionCircle[]
) {
  for (const patrol of patrolNpcs) {
    const root = patrol.npc.root as any;
    if (!root?.position) continue;

    if (patrol.waitTimer > 0) {
      patrol.waitTimer -= delta;
      alignRootToGround(root);
      patrol.npc.animator.setLocomotion("idle", 0.2);
      continue;
    }

    const [targetX, targetZ] = patrol.waypoints[patrol.targetIndex]!;
    const dx = targetX - root.position.x;
    const dz = targetZ - root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.15) {
      patrol.targetIndex = (patrol.targetIndex + 1) % patrol.waypoints.length;
      patrol.waitTimer = 1.2 + Math.random() * 1.8;
      patrol.path = [];
      patrol.pathIndex = 0;
      patrol.npc.animator.setLocomotion("idle", 0.2);
      continue;
    }

    moveRootWithPathfinding(
      THREE,
      root,
      patrol,
      [targetX, targetZ],
      speed * delta,
      obstacles,
      0.58,
      delta
    );
    patrol.npc.animator.setLocomotion("walk", 0.18);
  }
}

type PathOwner = {
  path: Array<[number, number]>;
  pathIndex: number;
  pathRefreshTimer: number;
};

const NAV_WORLD_LIMIT = 56;
const NAV_CELL_SIZE = 2;
const NAV_GRID_SIZE = Math.floor((NAV_WORLD_LIMIT * 2) / NAV_CELL_SIZE) + 1;

function moveRootWithPathfinding(
  THREE: ThreeModule,
  root: any,
  owner: PathOwner,
  goal: [number, number],
  step: number,
  obstacles: SceneCollisionCircle[],
  clearance: number,
  delta: number,
  refreshInterval = 0.75
) {
  owner.pathRefreshTimer = Math.max(0, owner.pathRefreshTimer - delta);
  const start: [number, number] = [root.position.x, root.position.z];
  const directClear = !isSegmentBlocked(start, goal, obstacles, clearance);

  if (directClear) {
    owner.path = [goal];
    owner.pathIndex = 0;
    owner.pathRefreshTimer = refreshInterval;
  } else if (!owner.path.length || owner.pathRefreshTimer <= 0) {
    owner.path = findNavigationPath(start, goal, obstacles, clearance);
    owner.pathIndex = 0;
    owner.pathRefreshTimer = refreshInterval;
  }

  let target = owner.path[owner.pathIndex] ?? goal;
  let dx = target[0] - root.position.x;
  let dz = target[1] - root.position.z;
  let distance = Math.hypot(dx, dz);
  while (distance < 0.25 && owner.pathIndex < owner.path.length - 1) {
    owner.pathIndex += 1;
    target = owner.path[owner.pathIndex] ?? goal;
    dx = target[0] - root.position.x;
    dz = target[1] - root.position.z;
    distance = Math.hypot(dx, dz);
  }
  if (distance < 1e-5) return;

  const amount = Math.min(distance, step);
  root.position.x += (dx / distance) * amount;
  root.position.z += (dz / distance) * amount;
  alignRootToGround(root);
  root.rotation.y = THREE.MathUtils.lerp(root.rotation.y, Math.atan2(dx, dz), Math.min(1, delta * 6));
}

function findNavigationPath(
  start: [number, number],
  goal: [number, number],
  obstacles: SceneCollisionCircle[],
  clearance: number
) {
  const startCell = worldToNavCell(start);
  const goalCell = worldToNavCell(goal);
  const startKey = navKey(startCell.x, startCell.z);
  const goalKey = navKey(goalCell.x, goalCell.z);
  const open = new Set<string>([startKey]);
  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, navHeuristic(startCell, goalCell)]]);
  let iterations = 0;

  while (open.size && iterations < 2200) {
    iterations += 1;
    const currentKey = lowestScoreKey(open, fScore);
    if (currentKey === goalKey) {
      return smoothNavigationPath(reconstructNavPath(currentKey, cameFrom, goal), obstacles, clearance);
    }
    open.delete(currentKey);

    const current = parseNavKey(currentKey);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        if (dx === 0 && dz === 0) continue;
        const next = { x: current.x + dx, z: current.z + dz };
        if (next.x < 0 || next.z < 0 || next.x >= NAV_GRID_SIZE || next.z >= NAV_GRID_SIZE) continue;
        const nextKey = navKey(next.x, next.z);
        if (nextKey !== goalKey && nextKey !== startKey && isNavCellBlocked(next, obstacles, clearance)) continue;

        const cost = Math.hypot(dx, dz);
        const tentativeG = (gScore.get(currentKey) ?? Infinity) + cost;
        if (tentativeG >= (gScore.get(nextKey) ?? Infinity)) continue;

        cameFrom.set(nextKey, currentKey);
        gScore.set(nextKey, tentativeG);
        fScore.set(nextKey, tentativeG + navHeuristic(next, goalCell));
        open.add(nextKey);
      }
    }
  }

  return [goal];
}

function smoothNavigationPath(path: Array<[number, number]>, obstacles: SceneCollisionCircle[], clearance: number) {
  if (path.length <= 2) return path;
  const smoothed: Array<[number, number]> = [];
  let anchorIndex = 0;
  smoothed.push(path[0]!);

  while (anchorIndex < path.length - 1) {
    let nextIndex = path.length - 1;
    while (nextIndex > anchorIndex + 1) {
      if (!isSegmentBlocked(path[anchorIndex]!, path[nextIndex]!, obstacles, clearance)) break;
      nextIndex -= 1;
    }
    smoothed.push(path[nextIndex]!);
    anchorIndex = nextIndex;
  }

  return smoothed;
}

function reconstructNavPath(lastKey: string, cameFrom: Map<string, string>, exactGoal: [number, number]) {
  const cells = [parseNavKey(lastKey)];
  let currentKey = lastKey;
  while (cameFrom.has(currentKey)) {
    currentKey = cameFrom.get(currentKey)!;
    cells.push(parseNavKey(currentKey));
  }
  const path = cells.reverse().map((cell) => navCellToWorld(cell));
  path[path.length - 1] = exactGoal;
  return path;
}

function isSegmentBlocked(
  from: [number, number],
  to: [number, number],
  obstacles: SceneCollisionCircle[],
  clearance: number
) {
  const dx = to[0] - from[0];
  const dz = to[1] - from[1];
  const distance = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(distance / (NAV_CELL_SIZE * 0.45)));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (isPointBlocked(from[0] + dx * t, from[1] + dz * t, obstacles, clearance)) return true;
  }
  return false;
}

function isNavCellBlocked(cell: { x: number; z: number }, obstacles: SceneCollisionCircle[], clearance: number) {
  const [x, z] = navCellToWorld(cell);
  return isPointBlocked(x, z, obstacles, clearance);
}

function isPointBlocked(x: number, z: number, obstacles: SceneCollisionCircle[], clearance: number) {
  if (Math.abs(x) > NAV_WORLD_LIMIT || Math.abs(z) > NAV_WORLD_LIMIT) return true;
  return obstacles.some((obstacle) => {
    const radius = obstacle.radius + clearance;
    const dx = x - obstacle.x;
    const dz = z - obstacle.z;
    return dx * dx + dz * dz < radius * radius;
  });
}

function worldToNavCell(point: [number, number]) {
  return {
    x: clampNumber(Math.round((point[0] + NAV_WORLD_LIMIT) / NAV_CELL_SIZE), 0, NAV_GRID_SIZE - 1),
    z: clampNumber(Math.round((point[1] + NAV_WORLD_LIMIT) / NAV_CELL_SIZE), 0, NAV_GRID_SIZE - 1)
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function navCellToWorld(cell: { x: number; z: number }): [number, number] {
  return [cell.x * NAV_CELL_SIZE - NAV_WORLD_LIMIT, cell.z * NAV_CELL_SIZE - NAV_WORLD_LIMIT];
}

function navKey(x: number, z: number) {
  return `${x},${z}`;
}

function parseNavKey(key: string) {
  const [x, z] = key.split(",").map(Number);
  return { x: x ?? 0, z: z ?? 0 };
}

function navHeuristic(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function lowestScoreKey(keys: Set<string>, scores: Map<string, number>) {
  let bestKey = "";
  let bestScore = Infinity;
  for (const key of keys) {
    const score = scores.get(key) ?? Infinity;
    if (score < bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestKey;
}

function updateAiDebugLayer(
  THREE: ThreeModule,
  group: any,
  settings: {
    enabled: boolean;
    showPaths: boolean;
    showRanges: boolean;
    showColliders: boolean;
  },
  patrolNpcs: PatrolNpcState[],
  enemies: EnemyInstance[],
  obstacles: SceneCollisionCircle[],
  combatSettings: {
    enemyDetectRadius: number;
    enemyAttackRadius: number;
  }
) {
  group.visible = settings.enabled;
  if (!settings.enabled) {
    clearAiDebugLayer(group);
    group.userData.aiDebug = { enabled: false, drawables: 0 };
    return;
  }

  clearAiDebugLayer(group);

  if (settings.showPaths) {
    for (const patrol of patrolNpcs) {
      const root = patrol.npc.root as any;
      drawPolyline(
        THREE,
        group,
        [[root.position.x, root.position.z], ...patrol.path],
        0x45d2ff,
        0.08
      );
      for (const waypoint of patrol.waypoints) {
        drawDebugCircle(THREE, group, waypoint[0], waypoint[1], 0.22, 0x45d2ff, 0.1);
      }
    }

    for (const enemy of enemies) {
      if (enemy.state === "dead") continue;
      drawPolyline(
        THREE,
        group,
        [[enemy.root.position.x, enemy.root.position.z], ...enemy.path],
        enemy.state === "chase" ? 0xff4638 : 0xffb238,
        0.11
      );
      for (const waypoint of enemy.waypoints) {
        drawDebugCircle(THREE, group, waypoint[0], waypoint[1], 0.2, 0xffb238, 0.12);
      }
    }
  }

  if (settings.showRanges) {
    for (const enemy of enemies) {
      if (enemy.state === "dead") continue;
      drawDebugCircle(
        THREE,
        group,
        enemy.root.position.x,
        enemy.root.position.z,
        combatSettings.enemyDetectRadius,
        0xff6f3c,
        0.045
      );
      drawDebugCircle(
        THREE,
        group,
        enemy.root.position.x,
        enemy.root.position.z,
        combatSettings.enemyAttackRadius,
        0xff1f1f,
        0.065
      );
    }
  }

  if (settings.showColliders) {
    for (const obstacle of obstacles) {
      drawDebugCircle(THREE, group, obstacle.x, obstacle.z, obstacle.radius, 0x7dff8c, 0.055);
    }
  }

  group.userData.aiDebug = {
    enabled: true,
    drawables: group.children.length,
    patrolNpcCount: patrolNpcs.length,
    enemyCount: enemies.length,
    aliveEnemyCount: enemies.filter((enemy) => enemy.state !== "dead").length
  };
}

function clearAiDebugLayer(group: any) {
  while (group.children.length) {
    const child = group.children.pop();
    child?.geometry?.dispose?.();
    child?.material?.dispose?.();
  }
}

function drawPolyline(
  THREE: ThreeModule,
  group: any,
  points: Array<[number, number]>,
  color: number,
  y: number
) {
  if (points.length < 2) return;
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map(([x, z]) => new THREE.Vector3(x, y, z))
  );
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.92,
    depthTest: false
  });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 40;
  group.add(line);
}

function drawDebugCircle(
  THREE: ThreeModule,
  group: any,
  x: number,
  z: number,
  radius: number,
  color: number,
  y: number
) {
  const points: any[] = [];
  const segments = 48;
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(x + Math.cos(angle) * radius, y, z + Math.sin(angle) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.72,
    depthTest: false
  });
  const circle = new THREE.Line(geometry, material);
  circle.renderOrder = 39;
  group.add(circle);
}

function enemyDefinitionsForScene(sceneId: string) {
  const common = [
    { id: "mist-raider-a", name: "雾袭者", position: [17, 0, -14] as [number, number, number] },
    { id: "mist-raider-b", name: "雾袭者", position: [-18, 0, -13] as [number, number, number] }
  ];

  if (sceneId === "gray-sprout-hearth") return common;
  if (sceneId === "gray-sprout-herb-field") {
    return [
      { id: "field-raider-a", name: "药田扰袭者", position: [10, 0, -10] as [number, number, number] },
      { id: "field-raider-b", name: "药田扰袭者", position: [-13, 0, -8] as [number, number, number] }
    ];
  }
  if (sceneId === "sprout-seeking-ravine") {
    return [
      { id: "ravine-raider-a", name: "峡谷雾影", position: [6, 0, -16] as [number, number, number] },
      { id: "ravine-raider-b", name: "峡谷雾影", position: [-6, 0, 8] as [number, number, number] }
    ];
  }
  if (sceneId === "branch-hunting-ground" || sceneId === "joint-hunt-grassland") {
    return [
      { id: `${sceneId}-raider-a`, name: "裂甲兽影", position: [12, 0, -16] as [number, number, number] },
      { id: `${sceneId}-raider-b`, name: "裂甲兽影", position: [-14, 0, -10] as [number, number, number] },
      { id: `${sceneId}-raider-c`, name: "裂甲兽影", position: [0, 0, -22] as [number, number, number] }
    ];
  }

  return common;
}

async function spawnSceneEnemies(
  THREE: ThreeModule,
  world: any,
  loadModel: typeof loadModelById,
  sceneDefinition: ChapterSceneDefinition,
  disposables: Disposable[]
) {
  const definitions = enemyDefinitionsForScene(sceneDefinition.id);
  const enemies = await Promise.all(
    definitions.map(async (definition, index): Promise<EnemyInstance> => {
      const { characterGltf, animator } = await loadCharacterWithAnimations(
        THREE,
        loadModel,
        index % 2 === 0 ? "characters.npc.kaykit.rogue" : "characters.npc.kaykit.barbarian",
        ["animations.kaykit.rigMedium.general", "animations.kaykit.rigMedium.movementBasic"]
      );
      const root = characterGltf.scene as any;
      root.name = definition.name;
      tintEnemyModel(root);

      const bounds = new THREE.Box3().setFromObject(root);
      const size = bounds.getSize(new THREE.Vector3());
      if (size.y > 0) root.scale.setScalar(1.48 / size.y);
      bounds.setFromObject(root);
      root.userData.footOffsetY = -bounds.min.y;
      root.position.set(definition.position[0], -bounds.min.y + definition.position[1], definition.position[2]);
      alignRootToGround(root);
      root.rotation.y = Math.PI * (0.35 + index * 0.34);
      root.userData.kind = "enemy";
      world.add(root);

      root.traverse((child: any) => {
        if (child.isMesh || child.isSkinnedMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
        if (child.geometry) disposables.push(child.geometry);
        if (child.material) {
          if (Array.isArray(child.material)) disposables.push(...child.material);
          else disposables.push(child.material);
        }
      });

      const bar = createEnemyHealthBar(THREE, disposables);
      bar.group.visible = false;
      world.add(bar.group);
      const alertIcon = createEnemyAlertIcon(THREE, disposables);
      world.add(alertIcon.group);
      animator.setLocomotion("idle", 0);

      const x = definition.position[0];
      const z = definition.position[2];
      return {
        id: definition.id,
        name: definition.name,
        root,
        animator,
        health: 70,
        maxHealth: 70,
        radius: 0.5,
        state: "patrol",
        alerted: false,
        alertTimer: 0,
        alertIconTimer: 0,
        alertJumpTimer: 0,
        alertIcon,
        waypoints: [
          [x, z],
          [x + 2.8, z + 1.5],
          [x - 2.2, z + 2.6]
        ],
        targetIndex: 0,
        path: [],
        pathIndex: 0,
        pathRefreshTimer: 0,
        spawnPosition: [root.position.x, root.position.y, root.position.z],
        attackCooldown: 0.8,
        hurtTimer: 0,
        flashTimer: 0,
        deathPlayed: false,
        bar
      };
    })
  );
  return enemies;
}

function tintEnemyModel(root: any) {
  root.traverse((child: any) => {
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material.color?.lerp) material.color.lerp(new THREE.Color(0x6b2f32), 0.35);
      if ("emissive" in material && material.emissive?.setHex) {
        material.emissive.setHex(0x240708);
        material.emissiveIntensity = 0.12;
      }
    }
  });
}

function createEnemyHealthBar(THREE: ThreeModule, disposables: Disposable[]): EnemyHealthBar {
  const group = new THREE.Group();
  group.name = "Enemy Head Health Bar";
  group.visible = true;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Enemy health bar canvas context unavailable");

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: true
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = "Enemy Health Sprite";
  sprite.scale.set(1.35, 0.38, 1);
  sprite.renderOrder = 95;
  group.renderOrder = 95;
  group.add(sprite);

  disposables.push(texture, material);
  const bar = { group, sprite, texture, canvas, context, lastHealth: -1, lastMaxHealth: -1 };
  drawEnemyHealthBarTexture(bar, 70, 70);
  return bar;
}

function createEnemyAlertIcon(THREE: ThreeModule, disposables: Disposable[]) {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Enemy alert icon canvas context unavailable");

  ctx.clearRect(0, 0, 96, 96);
  ctx.save();
  ctx.shadowColor = "rgba(255, 36, 28, 0.9)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "rgba(89, 8, 8, 0.9)";
  ctx.beginPath();
  ctx.arc(48, 48, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 210, 172, 0.95)";
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = "#ffefe2";
  ctx.font = "900 58px Georgia, Microsoft YaHei, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("!", 48, 49);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.42, 0.42, 1);
  sprite.renderOrder = 120;

  const group = new THREE.Group();
  group.name = "Enemy Alert Icon";
  group.visible = false;
  group.renderOrder = 120;
  group.add(sprite);
  disposables.push(texture, material);

  return { group, sprite, material, texture };
}

function updateEnemies(
  THREE: ThreeModule,
  world: any,
  enemies: EnemyInstance[],
  floatingTexts: FloatingDamageText[],
  playerRoot: any,
  delta: number,
  settings: {
    enemyDetectRadius: number;
    enemyVisionDot: number;
    enemyAlertDuration: number;
    enemyAlertIconDuration: number;
    enemyAlertJumpDuration: number;
    enemyAttackRadius: number;
    enemyAttackDamage: number;
    enemySpeed: number;
  },
  combatState: {
    playerHealth: number;
    playerInvulnerableTimer: number;
    lastEvent: string;
  },
  obstacles: SceneCollisionCircle[]
) {
  combatState.playerInvulnerableTimer = Math.max(0, combatState.playerInvulnerableTimer - delta);

  for (const enemy of enemies) {
    if (enemy.state === "dead") continue;
    enemy.attackCooldown = Math.max(0, enemy.attackCooldown - delta);
    enemy.hurtTimer = Math.max(0, enemy.hurtTimer - delta);
    enemy.flashTimer = Math.max(0, enemy.flashTimer - delta);
    if (enemy.flashTimer <= 0) restoreEnemyMaterial(enemy);

    const dxToPlayer = playerRoot.position.x - enemy.root.position.x;
    const dzToPlayer = playerRoot.position.z - enemy.root.position.z;
    const distanceToPlayer = Math.hypot(dxToPlayer, dzToPlayer);
    const canSeePlayer =
      distanceToPlayer <= settings.enemyDetectRadius &&
      enemyCanSeePlayer(enemy, dxToPlayer, dzToPlayer, distanceToPlayer, settings.enemyVisionDot, obstacles);

    if (!enemy.alerted && canSeePlayer) {
      triggerEnemyAlert(enemy, settings);
    }

    if (enemy.state === "alert") {
      enemy.alertTimer = Math.max(0, enemy.alertTimer - delta);
      enemy.animator.setLocomotion("idle", 0.12);
      enemy.root.rotation.y = Math.atan2(dxToPlayer, dzToPlayer);
      if (enemy.alertTimer > 0) continue;
      enemy.state = "chase";
    }

    if (enemy.alerted && distanceToPlayer <= settings.enemyAttackRadius) {
      enemy.state = "attack";
      enemy.animator.setLocomotion("idle", 0.15);
      enemy.root.rotation.y = Math.atan2(dxToPlayer, dzToPlayer);
      if (enemy.attackCooldown <= 0 && combatState.playerInvulnerableTimer <= 0) {
        playEnemyAttackAnimation(enemy.animator);
        combatState.playerHealth = Math.max(0, combatState.playerHealth - settings.enemyAttackDamage);
        combatState.playerInvulnerableTimer = 0.75;
        combatState.lastEvent = `${enemy.name} 命中了你`;
        flashPlayer(playerRoot);
        spawnFloatingDamageText(THREE, world, floatingTexts, playerRoot, settings.enemyAttackDamage, "enemy");
        enemy.attackCooldown = 1.15;
      }
      continue;
    }

    if (enemy.alerted) {
      enemy.state = "chase";
      moveEnemyWithPathfinding(
        THREE,
        enemy,
        [playerRoot.position.x, playerRoot.position.z],
        settings.enemySpeed * delta,
        obstacles,
        0.72,
        delta,
        0.28
      );
      enemy.animator.setLocomotion("run", 0.18);
      continue;
    }

    enemy.state = "patrol";
    const [targetX, targetZ] = enemy.waypoints[enemy.targetIndex]!;
    const dx = targetX - enemy.root.position.x;
    const dz = targetZ - enemy.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.2) {
      enemy.targetIndex = (enemy.targetIndex + 1) % enemy.waypoints.length;
      enemy.path = [];
      enemy.pathIndex = 0;
      enemy.animator.setLocomotion("idle", 0.18);
    } else {
      moveEnemyWithPathfinding(
        THREE,
        enemy,
        [targetX, targetZ],
        settings.enemySpeed * 0.42 * delta,
        obstacles,
        0.68,
        delta,
        0.8
      );
      enemy.animator.setLocomotion("walk", 0.18);
    }
  }
}

function enemyCanSeePlayer(
  enemy: EnemyInstance,
  dxToPlayer: number,
  dzToPlayer: number,
  distanceToPlayer: number,
  visionDot: number,
  obstacles: SceneCollisionCircle[]
) {
  if (distanceToPlayer <= 0.001) return true;
  const forwardX = Math.sin(enemy.root.rotation.y);
  const forwardZ = Math.cos(enemy.root.rotation.y);
  const directionX = dxToPlayer / distanceToPlayer;
  const directionZ = dzToPlayer / distanceToPlayer;
  const inViewCone = forwardX * directionX + forwardZ * directionZ >= visionDot;
  if (!inViewCone) return false;

  return !obstacles.some((circle) => {
    if (circle.label === "hearth") return false;
    return segmentIntersectsCircle(
      enemy.root.position.x,
      enemy.root.position.z,
      enemy.root.position.x + dxToPlayer,
      enemy.root.position.z + dzToPlayer,
      circle.x,
      circle.z,
      circle.radius + 0.15
    );
  });
}

function triggerEnemyAlert(
  enemy: EnemyInstance,
  settings: {
    enemyAlertDuration: number;
    enemyAlertIconDuration: number;
    enemyAlertJumpDuration: number;
  }
) {
  enemy.alerted = true;
  enemy.state = "alert";
  enemy.alertTimer = settings.enemyAlertDuration;
  enemy.alertIconTimer = settings.enemyAlertIconDuration;
  enemy.alertJumpTimer = settings.enemyAlertJumpDuration;
  enemy.path = [];
  enemy.pathIndex = 0;
  enemy.bar.group.visible = true;
  updateEnemyHealthBar(enemy);
}

function playEnemyAttackAnimation(animator: CharacterAnimator) {
  const attackClip = findFirstClip(animator, [
    "Attack",
    "Attack_A",
    "Attack_B",
    "Slash",
    "Slash_A",
    "Melee",
    "Punch",
    "Throw"
  ]);
  if (attackClip) {
    animator.playOneShot(attackClip, 0.08);
    return true;
  }
  animator.setLocomotion("idle", 0.08);
  return false;
}

function segmentIntersectsCircle(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
  cx: number,
  cz: number,
  radius: number
) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq <= 0.0001) return Math.hypot(cx - x1, cz - z1) <= radius;
  const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cz - z1) * dz) / lengthSq));
  const closestX = x1 + dx * t;
  const closestZ = z1 + dz * t;
  return Math.hypot(cx - closestX, cz - closestZ) <= radius;
}

function moveEnemyWithPathfinding(
  THREE: ThreeModule,
  enemy: EnemyInstance,
  goal: [number, number],
  step: number,
  obstacles: SceneCollisionCircle[],
  clearance: number,
  delta: number,
  refreshInterval: number
) {
  moveRootWithPathfinding(THREE, enemy.root, enemy, goal, step, obstacles, clearance, delta, refreshInterval);
}

function updateEnemyHealthBars(THREE: ThreeModule, enemies: EnemyInstance[], camera: any, delta: number) {
  const worldPosition = new THREE.Vector3();
  for (const enemy of enemies) {
    updateEnemyAlertPresentation(enemy, camera, delta);

    const barGroup = enemy.bar?.group;
    if (!barGroup) continue;
    barGroup.visible = enemy.alerted && enemy.state !== "dead" && enemy.health > 0;
    if (!barGroup.visible) continue;
    enemy.root.getWorldPosition(worldPosition);
    barGroup.position.set(worldPosition.x, worldPosition.y + 2.18, worldPosition.z);
    barGroup.quaternion.copy(camera.quaternion);
    updateEnemyHealthBar(enemy);
  }
}

function updateEnemyAlertPresentation(enemy: EnemyInstance, camera: any, delta: number) {
  const icon = enemy.alertIcon;
  if (!icon?.group) return;

  enemy.alertIconTimer = Math.max(0, enemy.alertIconTimer - delta);
  enemy.alertJumpTimer = Math.max(0, enemy.alertJumpTimer - delta);
  const baseY = enemy.root.userData.footOffsetY ?? enemy.spawnPosition[1];
  if (enemy.alertJumpTimer > 0) {
    const progress = 1 - enemy.alertJumpTimer / 0.55;
    enemy.root.position.y = baseY + Math.sin(progress * Math.PI) * 0.46;
  } else if (enemy.state !== "dead") {
    enemy.root.position.y = baseY;
  }

  const visible = enemy.alertIconTimer > 0 && enemy.state !== "dead";
  icon.group.visible = visible;
  if (!visible) {
    icon.material.opacity = 0;
    return;
  }

  const worldPosition = new THREE.Vector3();
  enemy.root.getWorldPosition(worldPosition);
  icon.group.position.set(worldPosition.x, worldPosition.y + 2.72 + Math.sin(enemy.alertIconTimer * 7.5) * 0.04, worldPosition.z);
  icon.group.quaternion.copy(camera.quaternion);
  icon.material.opacity = Math.min(1, enemy.alertIconTimer / 0.25);
}

function updatePlayerCombat(
  THREE: ThreeModule,
  world: any,
  enemies: EnemyInstance[],
  floatingTexts: FloatingDamageText[],
  playerRoot: any,
  delta: number,
  settings: {
    playerAttackDamage: number;
    playerAttackRadius: number;
    playerAttackArc: number;
  },
  combatState: {
    playerAttackTimer: number;
    enemiesDefeated: number;
    lastEvent: string;
  }
) {
  if (combatState.playerAttackTimer <= 0) return;
  const wasFreshAttack = combatState.playerAttackTimer > 0.16;
  combatState.playerAttackTimer = Math.max(0, combatState.playerAttackTimer - delta);
  if (!wasFreshAttack) return;

  const forwardX = Math.sin(playerRoot.rotation.y);
  const forwardZ = Math.cos(playerRoot.rotation.y);
  for (const enemy of enemies) {
    if (enemy.state === "dead" || enemy.hurtTimer > 0) continue;
    const dx = enemy.root.position.x - playerRoot.position.x;
    const dz = enemy.root.position.z - playerRoot.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > settings.playerAttackRadius) continue;

    const dot = distance > 1e-5 ? (dx / distance) * forwardX + (dz / distance) * forwardZ : 1;
    if (dot < settings.playerAttackArc) continue;

    if (!enemy.alerted) {
      enemy.alerted = true;
      enemy.alertIconTimer = 1.2;
      enemy.bar.group.visible = true;
    }
    enemy.health = Math.max(0, enemy.health - settings.playerAttackDamage);
    enemy.hurtTimer = 0.3;
    enemy.root.position.x += (dx / Math.max(distance, 0.001)) * 0.42;
    enemy.root.position.z += (dz / Math.max(distance, 0.001)) * 0.42;
    updateEnemyHealthBar(enemy);
    spawnFloatingDamageText(THREE, world, floatingTexts, enemy.root, settings.playerAttackDamage, "player");

    if (enemy.health <= 0) {
      defeatEnemy(enemy);
      combatState.enemiesDefeated += 1;
      combatState.lastEvent = `击退了 ${enemy.name}`;
    } else {
      combatState.lastEvent = `击中了 ${enemy.name}`;
      flashEnemy(THREE, enemy);
    }
    break;
  }
}

function updateEnemyHealthBar(enemy: EnemyInstance) {
  const ratio = Math.max(0, enemy.health / enemy.maxHealth);
  enemy.bar.group.visible = enemy.alerted && enemy.state !== "dead" && ratio > 0;
  if (enemy.bar.lastHealth !== enemy.health || enemy.bar.lastMaxHealth !== enemy.maxHealth) {
    drawEnemyHealthBarTexture(enemy.bar, enemy.health, enemy.maxHealth);
  }
}

function drawEnemyHealthBarTexture(bar: EnemyHealthBar, health: number, maxHealth: number) {
  const ctx = bar.context;
  const width = bar.canvas.width;
  const height = bar.canvas.height;
  const hp = Math.max(0, Math.round(health));
  const maxHp = Math.max(1, Math.round(maxHealth));
  const ratio = Math.max(0, Math.min(1, hp / maxHp));

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 8;
  ctx.fillStyle = "rgba(18, 10, 8, 0.84)";
  roundRect(ctx, 13, 14, 230, 42, 8);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(255, 207, 134, 0.82)";
  ctx.lineWidth = 3;
  roundRect(ctx, 13, 14, 230, 42, 8);
  ctx.stroke();

  ctx.fillStyle = "rgba(53, 12, 12, 0.95)";
  roundRect(ctx, 24, 25, 208, 19, 5);
  ctx.fill();

  if (ratio > 0) {
    const fillWidth = Math.max(6, 208 * ratio);
    const gradient = ctx.createLinearGradient(24, 25, 24, 44);
    gradient.addColorStop(0, "#ff9c74");
    gradient.addColorStop(0.45, "#e3383a");
    gradient.addColorStop(1, "#8d131c");
    ctx.fillStyle = gradient;
    roundRect(ctx, 24, 25, fillWidth, 19, 5);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255, 246, 220, 0.96)";
  ctx.font = "800 18px Microsoft YaHei, PingFang SC, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "rgba(0,0,0,0.7)";
  ctx.lineWidth = 4;
  const label = `${hp}/${maxHp}`;
  ctx.strokeText(label, width / 2, 35);
  ctx.fillText(label, width / 2, 35);
  ctx.restore();

  bar.lastHealth = health;
  bar.lastMaxHealth = maxHealth;
  bar.texture.needsUpdate = true;
}

function defeatEnemy(enemy: EnemyInstance) {
  enemy.state = "dead";
  enemy.bar.group.visible = false;
  enemy.alertIconTimer = 0;
  enemy.alertIcon.group.visible = false;
  if (!enemy.deathPlayed) {
    enemy.deathPlayed = true;
    playCharacterDeathAnimation(enemy.animator, enemy.root);
  }
}

function spawnFloatingDamageText(
  THREE: ThreeModule,
  world: any,
  floatingTexts: FloatingDamageText[],
  targetRoot: any,
  damage: number,
  source: "player" | "enemy"
) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const label = `-${Math.round(damage)}`;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "900 42px Microsoft YaHei, PingFang SC, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 7;
  ctx.strokeStyle = source === "enemy" ? "rgba(24, 0, 0, 0.9)" : "rgba(42, 8, 6, 0.88)";
  ctx.strokeText(label, 64, 40);
  const gradient = ctx.createLinearGradient(0, 14, 0, 66);
  if (source === "enemy") {
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.42, "#ff4b57");
    gradient.addColorStop(1, "#8e0014");
  } else {
    gradient.addColorStop(0, "#fff0b7");
    gradient.addColorStop(0.45, "#ff6b45");
    gradient.addColorStop(1, "#d9202a");
  }
  ctx.fillStyle = gradient;
  ctx.fillText(label, 64, 40);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(material);
  const position = new THREE.Vector3();
  targetRoot.getWorldPosition(position);
  sprite.position.set(position.x, position.y + (source === "enemy" ? 1.62 : 1.35), position.z);
  sprite.scale.set(source === "enemy" ? 0.82 : 0.72, source === "enemy" ? 0.52 : 0.45, 1);
  sprite.renderOrder = 110;
  world.add(sprite);

  floatingTexts.push({
    sprite,
    material,
    texture,
    age: 0,
    duration: 0.82,
    baseY: sprite.position.y,
    driftX: (Math.random() - 0.5) * 0.35,
    source
  });
}

function updateFloatingDamageTexts(floatingTexts: FloatingDamageText[], camera: any, delta: number) {
  for (let i = floatingTexts.length - 1; i >= 0; i -= 1) {
    const text = floatingTexts[i]!;
    text.age += delta;
    const progress = Math.min(1, text.age / text.duration);
    text.sprite.quaternion.copy(camera.quaternion);
    text.sprite.position.y = text.baseY + progress * 0.85;
    text.sprite.position.x += text.driftX * delta;
    const popScale = 1 + Math.sin(progress * Math.PI) * 0.18;
    const baseWidth = text.source === "enemy" ? 0.82 : 0.72;
    const baseHeight = text.source === "enemy" ? 0.52 : 0.45;
    text.sprite.scale.set(baseWidth * popScale, baseHeight * popScale, 1);
    text.material.opacity = 1 - Math.max(0, (progress - 0.62) / 0.38);

    if (progress >= 1) {
      text.sprite.parent?.remove(text.sprite);
      text.texture.dispose?.();
      text.material.dispose?.();
      floatingTexts.splice(i, 1);
    }
  }
}

function playCharacterDeathAnimation(animator: CharacterAnimator, root: any) {
  const deathClip = findFirstClip(animator, [
    "Death_A",
    "Death_B",
    "Death",
    "Die",
    "Dying",
    "Dead",
    "Fall_Death",
    "Knockdown",
    "Knock_down",
    "Hit_React_Back"
  ]);

  if (deathClip) {
    animator.playManual(deathClip, { loop: false });
    return true;
  }

  animator.clearManualMode();
  root.rotation.x = -Math.PI / 2;
  root.position.y = Math.max(0.04, root.position.y + 0.03);
  return false;
}

function findFirstClip(animator: CharacterAnimator, candidates: string[]) {
  for (const candidate of candidates) {
    const exact = animator.clipNames.find((name) => name.toLowerCase() === candidate.toLowerCase());
    if (exact) return exact;
  }
  for (const candidate of candidates) {
    const partial = animator.clipNames.find((name) => name.toLowerCase().includes(candidate.toLowerCase()));
    if (partial) return partial;
  }
  return undefined;
}

function flashEnemy(THREE: ThreeModule, enemy: EnemyInstance) {
  enemy.flashTimer = 0.16;
  enemy.root.traverse((child: any) => {
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if ("emissive" in material && material.emissive?.setHex) {
        if (material.userData.enemyBaseEmissive === undefined) {
          material.userData.enemyBaseEmissive = material.emissive.getHex();
          material.userData.enemyBaseEmissiveIntensity = material.emissiveIntensity ?? 0;
        }
        material.emissive.setHex(0x5a130e);
        material.emissiveIntensity = 0.35;
      }
    }
  });
}

function restoreEnemyMaterial(enemy: EnemyInstance) {
  enemy.root.traverse((child: any) => {
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if ("emissive" in material && material.emissive?.setHex && material.userData.enemyBaseEmissive !== undefined) {
        material.emissive.setHex(material.userData.enemyBaseEmissive);
        material.emissiveIntensity = material.userData.enemyBaseEmissiveIntensity ?? 0;
      }
    }
  });
}

function flashPlayer(playerRoot: any) {
  playerRoot.traverse((child: any) => {
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if ("emissive" in material && material.emissive?.setHex) {
        if (material.userData.playerBaseEmissive === undefined) {
          material.userData.playerBaseEmissive = material.emissive.getHex();
          material.userData.playerBaseEmissiveIntensity = material.emissiveIntensity ?? 0;
        }
        material.emissive.setHex(0x4c0f0a);
        material.emissiveIntensity = 0.18;
      }
    }
  });
  window.setTimeout(() => {
    playerRoot.traverse((child: any) => {
      if (!child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if ("emissive" in material && material.emissive?.setHex && material.userData.playerBaseEmissive !== undefined) {
          material.emissive.setHex(material.userData.playerBaseEmissive);
          material.emissiveIntensity = material.userData.playerBaseEmissiveIntensity ?? 0;
        }
      }
    });
  }, 140);
}

function createPlayerHealingVfx(THREE: ThreeModule, disposables: Disposable[]): PlayerHealingVfx {
  const particleCount = 44;
  const positions = new Float32Array(particleCount * 3);
  const seeds = new Float32Array(particleCount * 4);

  for (let i = 0; i < particleCount; i += 1) {
    const offset = i * 3;
    const seedOffset = i * 4;
    const angle = (i / particleCount) * Math.PI * 2;
    const radius = 0.18 + ((i * 37) % 100) / 100 * 0.42;
    const height = ((i * 19) % 100) / 100;
    seeds[seedOffset] = angle;
    seeds[seedOffset + 1] = radius;
    seeds[seedOffset + 2] = height;
    seeds[seedOffset + 3] = 0.75 + ((i * 13) % 100) / 100 * 0.75;
    positions[offset] = Math.cos(angle) * radius;
    positions[offset + 1] = 0.15 + height * 1.45;
    positions[offset + 2] = Math.sin(angle) * radius;
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);

  const material = new THREE.PointsMaterial({
    color: 0x8dff76,
    size: 0.075,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const group = new THREE.Group();
  group.name = "Player Healing VFX";
  group.visible = false;
  group.renderOrder = 45;

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x7dff7a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.018, 8, 46), ringMaterial);
  ring.name = "Healing VFX Ring";
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.08;
  group.add(ring);
  group.userData.ringMaterial = ringMaterial;
  group.userData.ring = ring;

  disposables.push(geometry, material, ring.geometry, ringMaterial);
  return { group, geometry, material, positions, seeds };
}

function updatePlayerHealingVfx(vfx: PlayerHealingVfx | undefined, active: boolean, elapsed: number, delta: number) {
  if (!vfx) return;

  const targetOpacity = active ? 0.82 : 0;
  vfx.material.opacity += (targetOpacity - vfx.material.opacity) * Math.min(1, delta * 7.5);
  const visible = vfx.material.opacity > 0.02;
  vfx.group.visible = visible;
  if (!visible) return;

  const ring = vfx.group.userData.ring as any;
  const ringMaterial = vfx.group.userData.ringMaterial as any;
  if (ringMaterial) ringMaterial.opacity = vfx.material.opacity * 0.42;
  if (ring) {
    ring.rotation.z = elapsed * 0.9;
    ring.scale.setScalar(1 + Math.sin(elapsed * 2.6) * 0.06);
  }

  const positions = vfx.positions;
  const seeds = vfx.seeds;
  for (let i = 0; i < seeds.length / 4; i += 1) {
    const seedOffset = i * 4;
    const positionOffset = i * 3;
    const angleSeed = seeds[seedOffset];
    const radius = seeds[seedOffset + 1];
    const heightSeed = seeds[seedOffset + 2];
    const speed = seeds[seedOffset + 3];
    const lift = (heightSeed + elapsed * 0.24 * speed) % 1;
    const angle = angleSeed + elapsed * (0.55 + speed * 0.18);
    const pulse = 0.82 + Math.sin(elapsed * 3.2 + angleSeed) * 0.18;

    positions[positionOffset] = Math.cos(angle) * radius * pulse;
    positions[positionOffset + 1] = 0.12 + lift * 1.55;
    positions[positionOffset + 2] = Math.sin(angle) * radius * pulse;
  }
  vfx.geometry.attributes.position.needsUpdate = true;
}

function updateHearthHealing(
  playerRoot: any,
  delta: number,
  settings: {
    hearthHealRadius: number;
    hearthHealPerSecond: number;
  },
  combatState: {
    playerHealth: number;
    maxPlayerHealth: number;
    lastEvent: string;
    isHealing: boolean;
    hearthHealMessageTimer: number;
  },
  sceneDefinition: ChapterSceneDefinition
) {
  combatState.hearthHealMessageTimer = Math.max(0, combatState.hearthHealMessageTimer - delta);

  if (!sceneDefinition.features.includes("hearth") || combatState.playerHealth >= combatState.maxPlayerHealth) {
    combatState.isHealing = false;
    return;
  }

  const distanceToHearth = Math.hypot(playerRoot.position.x, playerRoot.position.z);
  const canHeal = distanceToHearth <= settings.hearthHealRadius;
  combatState.isHealing = canHeal;
  if (!canHeal) return;

  combatState.playerHealth = Math.min(
    combatState.maxPlayerHealth,
    combatState.playerHealth + settings.hearthHealPerSecond * delta
  );

  if (combatState.hearthHealMessageTimer <= 0) {
    combatState.lastEvent = "火塘的余温正在恢复你";
    combatState.hearthHealMessageTimer = 1.1;
  }
}

function pushCombatStatus(
  ui: SceneUiBridge,
  combatState: {
    playerHealth: number;
    maxPlayerHealth: number;
    lastEvent: string;
    isHealing?: boolean;
  },
  enemies: EnemyInstance[]
) {
  ui.setCombatStatus({
    playerHealth: combatState.playerHealth,
    maxPlayerHealth: combatState.maxPlayerHealth,
    enemiesAlive: enemies.filter((enemy) => enemy.state !== "dead").length,
    enemiesTotal: enemies.length,
    lastEvent: combatState.playerHealth <= 0 ? "你受伤倒下了，按 R 重试" : combatState.lastEvent,
    isHealing: Boolean(combatState.isHealing)
  });
}

function resetCombatEncounter(
  THREE: ThreeModule,
  playerRoot: any,
  playerAnimator: CharacterAnimator | undefined,
  playerFootOffsetY: number,
  sceneDefinition: ChapterSceneDefinition,
  combatState: {
    playerHealth: number;
    maxPlayerHealth: number;
    playerInvulnerableTimer: number;
    playerAttackTimer: number;
    enemiesDefeated: number;
    lastEvent: string;
    isHealing?: boolean;
    hearthHealMessageTimer?: number;
    playerDeathPlayed?: boolean;
    deathOverlayTimer?: number;
  },
  enemies: EnemyInstance[],
  floatingDamageTexts: FloatingDamageText[],
  ui: SceneUiBridge
) {
  playerRoot.position.set(
    sceneDefinition.spawn[0],
    playerFootOffsetY + sceneDefinition.spawn[1],
    sceneDefinition.spawn[2]
  );
  playerRoot.rotation.y = -1.208;

  combatState.playerHealth = combatState.maxPlayerHealth;
  combatState.playerInvulnerableTimer = 1.0;
  combatState.playerAttackTimer = 0;
  combatState.enemiesDefeated = 0;
  combatState.isHealing = false;
  combatState.hearthHealMessageTimer = 0;
  combatState.playerDeathPlayed = false;
  combatState.deathOverlayTimer = 0;
  combatState.lastEvent = "重新站稳了";
  playerRoot.rotation.x = 0;
  playerRoot.rotation.z = 0;
  playerAnimator?.clearManualMode();
  playerAnimator?.setLocomotion("idle", 0.1);
  clearFloatingDamageTexts(floatingDamageTexts);

  for (const enemy of enemies) {
    enemy.health = enemy.maxHealth;
    enemy.state = "patrol";
    enemy.alerted = false;
    enemy.alertTimer = 0;
    enemy.alertIconTimer = 0;
    enemy.alertJumpTimer = 0;
    enemy.deathPlayed = false;
    enemy.targetIndex = 0;
    enemy.path = [];
    enemy.pathIndex = 0;
    enemy.pathRefreshTimer = 0;
    enemy.attackCooldown = 0.8;
    enemy.hurtTimer = 0;
    enemy.flashTimer = 0;
    enemy.root.visible = true;
    enemy.root.position.set(
      enemy.spawnPosition[0],
      enemy.spawnPosition[1],
      enemy.spawnPosition[2]
    );
    alignRootToGround(enemy.root);
    enemy.root.rotation.x = 0;
    enemy.root.rotation.z = 0;
    enemy.root.rotation.y = Math.PI * 0.35;
    enemy.bar.group.visible = false;
    enemy.alertIcon.group.visible = false;
    enemy.alertIcon.material.opacity = 0;
    enemy.animator.clearManualMode();
    enemy.animator.setLocomotion("idle", 0.1);
    updateEnemyHealthBar(enemy);
    restoreEnemyMaterial(enemy);
  }

  pushCombatStatus(ui, combatState, enemies);
  const spring = playerRoot.userData?.thirdPersonSpring;
  if (spring?.velocity) {
    spring.velocity = new THREE.Vector3();
  }
}

function clearFloatingDamageTexts(floatingTexts: FloatingDamageText[]) {
  for (const text of floatingTexts) {
    text.sprite.parent?.remove(text.sprite);
    text.texture.dispose?.();
    text.material.dispose?.();
  }
  floatingTexts.length = 0;
}

function createSceneCollisionCircles(sceneDefinition: ChapterSceneDefinition): SceneCollisionCircle[] {
  const circles: SceneCollisionCircle[] = [];

  if (sceneDefinition.features.includes("hearth")) {
    circles.push({ x: 0, z: 0, radius: 2.05, label: "hearth" });
  }

  if (sceneDefinition.features.includes("houses")) {
    const houses = [
      { x: -15.5, z: -9.0, scale: 1.3 },
      { x: 15.8, z: -9.6, scale: 1.24 },
      { x: -21.0, z: 8.6, scale: 1.12 },
      { x: 21.4, z: 7.8, scale: 1.1 },
      { x: -9.0, z: -22.0, scale: 1.0 },
      { x: 9.4, z: -22.6, scale: 1.0 },
      { x: -4.2, z: 25.0, scale: 0.95 },
      { x: 12.0, z: 23.5, scale: 0.92 }
    ];
    circles.push(
      ...houses.map((house) => ({
        x: house.x,
        z: house.z,
        radius: 1.65 * house.scale,
        label: "house"
      }))
    );
  }

  if (sceneDefinition.features.includes("ancestorPoles")) {
    circles.push(
      { x: -2.7, z: -2.1, radius: 0.5, label: "totem" },
      { x: 2.8, z: -2.0, radius: 0.5, label: "totem" }
    );
  }

  if (sceneDefinition.features.includes("herbRacks")) {
    const racks = [
      { x: -12.5, z: 13.5 },
      { x: 13.0, z: 12.8 },
      { x: -7.8, z: 24.0 },
      { x: 8.5, z: -12.0 },
      { x: 20.0, z: -18.0 }
    ];
    circles.push(...racks.map((rack) => ({ x: rack.x, z: rack.z, radius: 0.82, label: "herbRack" })));
  }

  if (sceneDefinition.features.includes("huntingBlind")) {
    circles.push({ x: -11.0, z: 10.5, radius: 1.1, label: "huntingBlind" });
  }

  if (sceneDefinition.features.includes("cart")) {
    circles.push({ x: -9.0, z: 10.5, radius: 1.15, label: "cart" });
  }

  if (sceneDefinition.features.includes("ravine")) {
    for (let i = 0; i < 26; i += 1) {
      const z = -30 + i * 2.35;
      circles.push(
        { x: -9.4, z, radius: 1.2, label: "ravineRock" },
        { x: 9.4, z, radius: 1.2, label: "ravineRock" }
      );
    }
  }

  return circles;
}

function getActiveCollisionCircles(
  staticCircles: SceneCollisionCircle[],
  npcs: VillageNpcInstance[],
  interactions: SceneInteractionInstance[],
  enemies: EnemyInstance[] = []
) {
  return [
    ...staticCircles,
    ...npcs.map((npc) => {
      const root = npc.root as { position: { x: number; z: number } };
      return {
        x: root.position.x,
        z: root.position.z,
        radius: 0.48,
        label: `NPC:${npc.definition.id}`
      };
    }),
    ...interactions
      .filter((interaction) => interaction.root.visible)
      .map((interaction) => ({
        x: interaction.root.position.x,
        z: interaction.root.position.z,
        radius: 0.34,
        label: `Interaction:${interaction.definition.id}`
      })),
    ...enemies
      .filter((enemy) => enemy.state !== "dead")
      .map((enemy) => ({
        x: enemy.root.position.x,
        z: enemy.root.position.z,
        radius: enemy.radius,
        label: `Enemy:${enemy.id}`
      }))
  ];
}

function getScenePixelRatio() {
  return Math.min(window.devicePixelRatio || 1, 1.5);
}

/** 在 `window.__THREE_HEARTH_SCENE__` 暴露渲染统计，供调试与自动化 QA 使用。 */
function exposeSceneDiagnostics(renderer: any, scene: any, world: any, sceneId: string) {
  const global = window as typeof window & {
    __THREE_HEARTH_SCENE__?: {
      renderer: unknown;
      get state(): Record<string, unknown>;
    };
  };

  global.__THREE_HEARTH_SCENE__ = {
    renderer: renderer.info,
    get state() {
      return getSceneDiagnostics(renderer, scene, world, sceneId);
    }
  };
  writeSceneDiagnostics(renderer, scene, world, sceneId);
}

function getSceneDiagnostics(renderer: any, scene: any, world: any, sceneId: string) {
  let meshes = 0;
  let instancedMeshes = 0;
  let points = 0;
  let lights = 0;
  let aiDebug: Record<string, unknown> | null = null;
  world.traverse((object: any) => {
    if (object.isInstancedMesh) instancedMeshes += 1;
    if (object.isMesh) meshes += 1;
    if (object.isPoints) points += 1;
    if (object.isLight) lights += 1;
    if (object.name === "AI Debug Layer") aiDebug = object.userData.aiDebug ?? null;
  });
  scene.traverse((object: any) => {
    if (object.isLight) lights += 1;
  });
  return {
    sceneId,
    meshes,
    instancedMeshes,
    points,
    lights,
    aiDebug,
    pixelRatio: renderer.getPixelRatio(),
    render: renderer.info.render,
    memory: renderer.info.memory
  };
}

function writeSceneDiagnostics(renderer: any, scene: any, world: any, sceneId: string) {
  renderer.domElement.dataset.sceneDiagnostics = JSON.stringify(getSceneDiagnostics(renderer, scene, world, sceneId));
}

function clearSceneDiagnostics(renderer: any) {
  const global = window as typeof window & { __THREE_HEARTH_SCENE__?: { renderer?: unknown } };
  if (global.__THREE_HEARTH_SCENE__?.renderer === renderer.info) {
    delete global.__THREE_HEARTH_SCENE__;
  }
}

/** UAL 原型角色的数字键快捷键（仅炉火场景）。 */
function universalClipForKey(key: string) {
  const clips: Record<string, string> = {
    "1": "Idle_Torch_Loop",
    "2": "Walk_Loop",
    "3": "Jog_Fwd_Loop",
    "4": "Sword_Attack",
    "5": "Spell_Simple_Shoot"
  };
  return clips[key];
}

/** 发光任务互动标记；待机动画由 Anime.js 驱动，完成时播放一次性反馈。 */
function createInteractionMarkers(
  THREE: ThreeModule,
  parent: any,
  disposables: Disposable[],
  interactions: ChapterInteractionDefinition[],
  animeAnimations: JSAnimation[]
) {
  const markers: SceneInteractionInstance[] = [];

  for (const [index, interaction] of interactions.entries()) {
    const group = new THREE.Group();
    group.name = `Interaction:${interaction.id}`;
    group.position.set(...interaction.position);
    group.userData.kind = "interactionMarker";

    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b2a1b,
      emissive: interaction.color,
      emissiveIntensity: 0.12,
      roughness: 0.82
    });
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: interaction.color,
      emissive: interaction.color,
      emissiveIntensity: 0.8,
      roughness: 0.45,
      transparent: true,
      opacity: 0.72
    });
    disposables.push(baseMaterial, glowMaterial);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.1, 10), baseMaterial);
    base.position.y = 0.05;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);
    disposables.push(base.geometry);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.018, 8, 30), glowMaterial);
    ring.position.y = 0.08;
    ring.rotation.x = Math.PI / 2;
    ring.userData.kind = "interactionMarker";
    group.add(ring);
    disposables.push(ring.geometry);

    const signal = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glowMaterial);
    signal.position.y = 0.48;
    signal.userData.kind = "interactionMarker";
    group.add(signal);
    disposables.push(signal.geometry);

    // 标记待机动画走时间轴，不与渲染循环争抢每帧更新。
    animeAnimations.push(
      animate(ring, {
        scale: [0.92, 1.18],
        rotateZ: [0, 360],
        duration: 1800,
        delay: index * 120,
        ease: "inOutSine",
        loop: true,
        alternate: true
      }),
      animate(signal, {
        y: [0.42, 0.64],
        scale: [0.85, 1.16],
        rotateY: [0, 360],
        duration: 1400,
        delay: index * 90,
        ease: "inOutSine",
        loop: true,
        alternate: true
      })
    );

    parent.add(group);
    markers.push({ definition: interaction, root: group });
  }

  return markers;
}

// 世界互动完成后的短促一次性反馈动画。
async function playInteractionCompleteAnimation(root: any, animeAnimations: JSAnimation[]) {
  const animation = animate(root, {
    y: root.position.y + 0.34,
    scale: [root.scale.x || 1, 1.55, 0.02],
    duration: 520,
    ease: "outCubic"
  });
  animeAnimations.push(animation);
  await animation.then();
}

/** 在 XZ 平面约 1.65m 内选取最近的可见互动点。 */
function findNearbyInteraction(
  playerRoot: { position: { x: number; z: number } },
  interactions: SceneInteractionInstance[]
) {
  let nearest: SceneInteractionInstance | undefined;
  let nearestDistance = Infinity;

  for (const interaction of interactions) {
    if (!interaction.root.visible) continue;
    const dx = playerRoot.position.x - interaction.root.position.x;
    const dz = playerRoot.position.z - interaction.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 1.65 && distance < nearestDistance) {
      nearest = interaction;
      nearestDistance = distance;
    }
  }

  return nearest;
}

/** 收集 `userData.kind` 标记的对象，供每帧环境动画更新。 */
function collectAnimatedObjects(world: any) {
  // 这里只放手写环境动效；角色动画交给 AnimationMixer，展示循环交给 Anime.js。
  const flames: any[] = [];
  const embers: any[] = [];
  const trees: any[] = [];
  const banners: any[] = [];

  world.traverse((object: any) => {
    if (object.userData.kind === "flame") flames.push(object);
    if (object.userData.kind === "ember") embers.push(object);
    if (object.userData.kind === "tree") trees.push(object);
    if (object.userData.kind === "banner") banners.push(object);
  });

  return { flames, embers, trees, banners };
}

function updateVillageAnimation(
  animated: ReturnType<typeof collectAnimatedObjects>,
  fireLight: any,
  lighting: { fireIntensity: number },
  elapsed: number
) {
  // 火光强度叠加两组正弦波，模拟不规则闪烁。
  const base = lighting.fireIntensity;
  fireLight.intensity = base + Math.sin(elapsed * 8) * (base * 0.1) + Math.sin(elapsed * 17) * (base * 0.06);

  animated.flames.forEach((flame, index) => {
    const pulse = 1 + Math.sin(elapsed * (4.5 + index * 0.3) + index) * 0.1;
    flame.scale.set(1 + Math.sin(elapsed * 3 + index) * 0.05, pulse, 1 + Math.cos(elapsed * 2.8 + index) * 0.05);
    flame.rotation.y += 0.012 + index * 0.002;
  });

  animated.embers.forEach((points) => {
    const attr = points.geometry.getAttribute("position");
    for (let i = 0; i < attr.count; i += 1) {
      const y = attr.getY(i) + 0.018 + Math.sin(elapsed + i) * 0.003;
      attr.setY(i, y > 4.5 ? 0.25 : y);
      attr.setX(i, attr.getX(i) + Math.sin(elapsed * 1.6 + i) * 0.002);
      attr.setZ(i, attr.getZ(i) + Math.cos(elapsed * 1.3 + i) * 0.002);
    }
    attr.needsUpdate = true;
  });

  animated.trees.forEach((tree, index) => {
    tree.rotation.z = Math.sin(elapsed * 0.55 + index) * 0.018;
  });

  animated.banners.forEach((banner, index) => {
    banner.rotation.z = Math.sin(elapsed * 1.4 + index) * 0.08;
  });

}

function createGround(
  THREE: ThreeModule,
  parent: any,
  disposables: Disposable[],
  sceneDefinition: ChapterSceneDefinition
) {
  const groundMat = new THREE.MeshStandardMaterial({ color: sceneDefinition.groundColor, roughness: 0.96 });
  const pathMat = new THREE.MeshStandardMaterial({ color: sceneDefinition.pathColor, roughness: 1 });
  disposables.push(groundMat, pathMat);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(72, 128), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  parent.add(ground);
  disposables.push(ground.geometry);

  const paths = [
    { x: 0, z: 14, w: 4.2, d: 38, ry: 0 },
    { x: -16, z: 4, w: 3.1, d: 28, ry: -0.9 },
    { x: 17, z: 2, w: 3, d: 30, ry: 0.85 },
    { x: 0, z: -16, w: 2.7, d: 30, ry: Math.PI / 2 }
  ];

  for (const path of paths) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(path.w, 0.025, path.d), pathMat);
    mesh.position.set(path.x, 0.016, path.z);
    mesh.rotation.y = path.ry;
    mesh.receiveShadow = true;
    parent.add(mesh);
    disposables.push(mesh.geometry);
  }
}

/** 按 `sceneDefinition.features` 开关生成程序化地标（炉火、溪流、峡谷等）。 */
// 根据章节 features 组合场景模块，让不同地图共享同一套生成函数。
function createSceneFeatures(
  THREE: ThreeModule,
  parent: any,
  disposables: Disposable[],
  sceneDefinition: ChapterSceneDefinition,
  animeAnimations: JSAnimation[]
) {
  if (sceneDefinition.features.includes("hearth")) createHearth(THREE, parent, disposables, animeAnimations);
  if (sceneDefinition.features.includes("houses")) createHouses(THREE, parent, disposables);
  if (sceneDefinition.features.includes("ancestorPoles")) {
    createTotemPole(THREE, parent, disposables, -2.7, -2.1);
    createTotemPole(THREE, parent, disposables, 2.8, -2.0);
  }
  if (sceneDefinition.features.includes("herbRacks")) createHerbRacks(THREE, parent, disposables);
  if (sceneDefinition.features.includes("creek")) createCreek(THREE, parent, disposables);
  if (sceneDefinition.features.includes("ravine")) createRavine(THREE, parent, disposables);
  if (sceneDefinition.features.includes("huntingBlind")) createHuntingBlind(THREE, parent, disposables);
  if (sceneDefinition.features.includes("cart")) createHerbCart(THREE, parent, disposables);
  if (sceneDefinition.features.includes("oxTracks")) createOxTracks(THREE, parent, disposables);
}

/** 放置章节配置中的 GLB 模型；加载失败仅记录日志并跳过。 */
async function loadChapterSceneAssets(
  THREE: ThreeModule,
  parent: any,
  sceneDefinition: ChapterSceneDefinition,
  disposables: Disposable[],
  isDisposed: () => boolean
) {
  const loaded = await Promise.allSettled(
    sceneDefinition.assets.map(async (placement) => {
      const gltf = await loadModelById(THREE, placement.modelId);
      return { placement, object: (gltf.scene as any).clone(true) };
    })
  );

  for (const result of loaded) {
    if (isDisposed()) return;
    if (result.status === "rejected") {
      console.warn("[chapter-scene] asset skipped:", result.reason);
      continue;
    }

    const { placement, object } = result.value;
    object.position.set(...placement.position);
    if (placement.rotation) object.rotation.set(...placement.rotation);
    object.scale.setScalar(placement.scale ?? 1);
    object.traverse((child: any) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    parent.add(object);
  }
}

/** 中央篝火：实例化石块/木柴、分层火焰、火星粒子、动画火种。 */
// 火塘是场景视觉中心：石环/木柴使用 InstancedMesh，火焰和余烬负责动态氛围。
function createHearth(THREE: ThreeModule, parent: any, disposables: Disposable[], animeAnimations: JSAnimation[]) {
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x77705f, roughness: 0.9 });
  const ashMat = new THREE.MeshStandardMaterial({ color: 0x20201b, emissive: 0x2a1106, emissiveIntensity: 0.2, roughness: 1 });
  const seedMat = new THREE.MeshStandardMaterial({ color: 0xffdf8a, emissive: 0xff6c24, emissiveIntensity: 1.6, roughness: 0.35 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x392417, roughness: 0.9 });
  disposables.push(ringMat, ashMat, seedMat, woodMat);

  const hearth = new THREE.Group();
  parent.add(hearth);

  const ash = new THREE.Mesh(new THREE.CircleGeometry(1.45, 48), ashMat);
  ash.rotation.x = -Math.PI / 2;
  ash.position.y = 0.025;
  hearth.add(ash);
  disposables.push(ash.geometry);

  const instanceDummy = new THREE.Object3D();
  const stoneGeometry = new THREE.BoxGeometry(0.42, 0.18, 0.32);
  const stones = new THREE.InstancedMesh(stoneGeometry, ringMat, 28);
  stones.castShadow = true;
  stones.receiveShadow = true;
  hearth.add(stones);
  disposables.push(stoneGeometry);
  for (let i = 0; i < 28; i += 1) {
    const angle = (i / 28) * Math.PI * 2;
    instanceDummy.position.set(Math.cos(angle) * 1.65, 0.11, Math.sin(angle) * 1.65);
    instanceDummy.rotation.set(0, -angle + Math.sin(i) * 0.16, 0);
    instanceDummy.scale.setScalar(1);
    instanceDummy.updateMatrix();
    stones.setMatrixAt(i, instanceDummy.matrix);
  }
  stones.instanceMatrix.needsUpdate = true;

  const logGeometry = new THREE.CylinderGeometry(0.08, 0.1, 1.15, 8);
  const logs = new THREE.InstancedMesh(logGeometry, woodMat, 7);
  logs.castShadow = true;
  hearth.add(logs);
  disposables.push(logGeometry);
  for (let i = 0; i < 7; i += 1) {
    instanceDummy.position.set(Math.sin(i) * 0.22, 0.14, Math.cos(i * 1.8) * 0.22);
    instanceDummy.rotation.set(Math.PI / 2, i * 0.48, i * 0.7);
    instanceDummy.scale.setScalar(1);
    instanceDummy.updateMatrix();
    logs.setMatrixAt(i, instanceDummy.matrix);
  }
  logs.instanceMatrix.needsUpdate = true;

  const flameColors = [
    [0xff531d, 0xff2d12],
    [0xffa83f, 0xff5b1e],
    [0xfff1b5, 0xffa43a]
  ];
  flameColors.forEach(([color, emissive], index) => {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.74 - index * 0.18, 2.2 - index * 0.48, 9, 1, true),
      new THREE.MeshStandardMaterial({
        color,
        emissive,
        emissiveIntensity: 1.8,
        transparent: true,
        opacity: 0.76,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    );
    flame.position.y = 0.2;
    flame.userData.kind = "flame";
    hearth.add(flame);
    disposables.push(flame.geometry, flame.material);
  });

  const fireSeed = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), seedMat);
  fireSeed.position.set(0, 0.7, 0);
  fireSeed.castShadow = true;
  hearth.add(fireSeed);
  disposables.push(fireSeed.geometry);
  // 火种为纯展示循环，由 Anime.js 在手动 tick 之外驱动。
  animeAnimations.push(
    animate(fireSeed, {
      scale: [0.88, 1.18],
      rotateY: [0, 360],
      duration: 2200,
      ease: "inOutSine",
      loop: true,
      alternate: true
    })
  );

  const emberCount = 90;
  const positions = new Float32Array(emberCount * 3);
  for (let i = 0; i < emberCount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = Math.random() * 0.8;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 0.2 + Math.random() * 4;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const emberMat = new THREE.PointsMaterial({
    color: 0xffcc78,
    size: 0.08,
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  embers.userData.kind = "ember";
  hearth.add(embers);
  disposables.push(emberGeo, emberMat);
}

function createHouses(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const houses = [
    { x: -15.5, z: -9.0, ry: 0.5, scale: 1.3 },
    { x: 15.8, z: -9.6, ry: -0.55, scale: 1.24 },
    { x: -21.0, z: 8.6, ry: 1.15, scale: 1.12 },
    { x: 21.4, z: 7.8, ry: -1.1, scale: 1.1 },
    { x: -9.0, z: -22.0, ry: 0.05, scale: 1.0 },
    { x: 9.4, z: -22.6, ry: -0.1, scale: 1.0 },
    { x: -4.2, z: 25.0, ry: 2.85, scale: 0.95 },
    { x: 12.0, z: 23.5, ry: -2.7, scale: 0.92 }
  ];

  houses.forEach((house) => {
    const group = createGraybudHouse(THREE, house.scale, disposables);
    group.position.set(house.x, 0, house.z);
    group.rotation.y = house.ry;
    parent.add(group);
  });
}

function createGraybudHouse(THREE: ThreeModule, scale: number, disposables: Disposable[]) {
  const group = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x7a6246, roughness: 0.88 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x483522, roughness: 0.98 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 1 });
  const antlerMat = new THREE.MeshStandardMaterial({ color: 0xcab896, roughness: 0.72 });
  disposables.push(wallMat, roofMat, darkMat, antlerMat);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.35 * scale, 1.55 * scale, 1.65 * scale, 12), wallMat);
  body.position.y = 0.82 * scale;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  disposables.push(body.geometry);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.85 * scale, 1.35 * scale, 12), roofMat);
  roof.position.y = 2.15 * scale;
  roof.castShadow = true;
  group.add(roof);
  disposables.push(roof.geometry);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.62 * scale, 0.9 * scale, 0.08 * scale), darkMat);
  door.position.set(0, 0.48 * scale, 1.43 * scale);
  group.add(door);
  disposables.push(door.geometry);

  for (const side of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * scale, 0.035 * scale, 0.62 * scale, 6), antlerMat);
    horn.position.set(side * 0.32 * scale, 2.72 * scale, 0.06 * scale);
    horn.rotation.z = side * 0.62;
    horn.castShadow = true;
    group.add(horn);
    disposables.push(horn.geometry);
  }

  return group;
}

function createHerbRacks(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3c2819, roughness: 0.94 });
  const herbMat = new THREE.MeshStandardMaterial({ color: 0x7fa45a, roughness: 0.88 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x92744d, roughness: 0.92 });
  disposables.push(woodMat, herbMat, clothMat);

  const racks = [
    { x: -12.5, z: 13.5, ry: 0.4 },
    { x: 13.0, z: 12.8, ry: -0.35 },
    { x: -7.8, z: 24.0, ry: 0 },
    { x: 8.5, z: -12.0, ry: 0.2 },
    { x: 20.0, z: -18.0, ry: -0.55 }
  ];

  for (const rack of racks) {
    const group = new THREE.Group();
    group.position.set(rack.x, 0, rack.z);
    group.rotation.y = rack.ry;
    parent.add(group);

    for (const x of [-0.6, 0.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.45, 6), woodMat);
      post.position.set(x, 0.72, 0);
      post.castShadow = true;
      group.add(post);
      disposables.push(post.geometry);
    }

    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.45, 6), woodMat);
    beam.position.y = 1.3;
    beam.rotation.z = Math.PI / 2;
    beam.castShadow = true;
    group.add(beam);
    disposables.push(beam.geometry);

    for (let i = 0; i < 6; i += 1) {
      const herb = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 5), herbMat);
      herb.position.set(-0.45 + i * 0.18, 0.95, 0.02);
      herb.rotation.x = Math.PI;
      herb.castShadow = true;
      group.add(herb);
      disposables.push(herb.geometry);
    }

    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.025, 0.55), clothMat);
    mat.position.set(0, 0.06, -0.34);
    mat.receiveShadow = true;
    group.add(mat);
    disposables.push(mat.geometry);
  }
}

function createCreek(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x365b67,
    emissive: 0x102c34,
    emissiveIntensity: 0.28,
    roughness: 0.42,
    transparent: true,
    opacity: 0.78
  });
  const saltMat = new THREE.MeshStandardMaterial({ color: 0xd9d1b7, roughness: 0.7 });
  disposables.push(waterMat, saltMat);

  const creek = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.035, 54), waterMat);
  creek.position.set(2.2, 0.04, -8.0);
  creek.rotation.y = -0.18;
  creek.receiveShadow = true;
  parent.add(creek);
  disposables.push(creek.geometry);

  for (let i = 0; i < 22; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const salt = new THREE.Mesh(new THREE.BoxGeometry(0.65 + (i % 3) * 0.18, 0.018, 0.08), saltMat);
    salt.position.set(2.2 + side * (1.4 + Math.sin(i) * 0.25), 0.065, -30 + i * 2.2);
    salt.rotation.y = Math.sin(i * 1.3) * 0.7;
    parent.add(salt);
    disposables.push(salt.geometry);
  }
}

function createRavine(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2b3029, roughness: 1 });
  disposables.push(rockMat);

  for (let i = 0; i < 26; i += 1) {
    for (const side of [-1, 1]) {
      const rock = new THREE.Mesh(new THREE.ConeGeometry(1.5 + Math.random() * 1.0, 2.2 + Math.random() * 2.0, 5), rockMat);
      rock.position.set(side * (8.5 + Math.random() * 2.6), 0.9, -30 + i * 2.35);
      rock.rotation.set(Math.random() * 0.18, Math.random() * Math.PI, side * 0.24);
      rock.castShadow = true;
      rock.receiveShadow = true;
      parent.add(rock);
      disposables.push(rock.geometry);
    }
  }
}

function createHuntingBlind(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2e2117, roughness: 0.96 });
  const hideMat = new THREE.MeshStandardMaterial({ color: 0x8d6848, roughness: 0.94 });
  disposables.push(woodMat, hideMat);

  const blind = new THREE.Group();
  blind.position.set(-11.0, 0, 10.5);
  blind.rotation.y = 0.32;
  parent.add(blind);

  for (const x of [-0.7, 0.7]) {
    for (const z of [-0.35, 0.35]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 1.6, 6), woodMat);
      post.position.set(x, 0.8, z);
      post.castShadow = true;
      blind.add(post);
      disposables.push(post.geometry);
    }
  }

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.95), woodMat);
  deck.position.y = 0.82;
  deck.castShadow = true;
  deck.receiveShadow = true;
  blind.add(deck);
  disposables.push(deck.geometry);

  const screen = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.72, 0.06), hideMat);
  screen.position.set(0, 1.26, -0.44);
  screen.castShadow = true;
  blind.add(screen);
  disposables.push(screen.geometry);
}

function createHerbCart(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1d, roughness: 0.94 });
  const herbMat = new THREE.MeshStandardMaterial({ color: 0x8da75e, roughness: 0.85 });
  disposables.push(woodMat, herbMat);

  const cart = new THREE.Group();
  cart.position.set(-9.0, 0, 10.5);
  cart.rotation.y = -0.24;
  parent.add(cart);

  const bed = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.35, 1.1), woodMat);
  bed.position.y = 0.48;
  bed.castShadow = true;
  cart.add(bed);
  disposables.push(bed.geometry);

  for (const x of [-0.9, 0.9]) {
    for (const z of [-0.62, 0.62]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 12), woodMat);
      wheel.position.set(x, 0.28, z);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      cart.add(wheel);
      disposables.push(wheel.geometry);
    }
  }

  for (let i = 0; i < 11; i += 1) {
    const bundle = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.72, 6), herbMat);
    bundle.position.set(-0.85 + i * 0.17, 0.88, Math.sin(i) * 0.2);
    bundle.rotation.x = Math.PI / 2 + Math.sin(i) * 0.28;
    bundle.castShadow = true;
    cart.add(bundle);
    disposables.push(bundle.geometry);
  }
}

function createOxTracks(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x1d1a14, roughness: 1 });
  disposables.push(trackMat);

  for (let i = 0; i < 34; i += 1) {
    const z = 22 - i * 1.45;
    for (const x of [-0.42, 0.42]) {
      const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.018, 0.48), trackMat);
      hoof.position.set(x + Math.sin(i * 0.8) * 0.28, 0.055, z);
      hoof.rotation.y = Math.sin(i * 0.4) * 0.4;
      parent.add(hoof);
      disposables.push(hoof.geometry);
    }
  }
}

function createVillageDetails(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3c2819, roughness: 0.94 });
  const herbMat = new THREE.MeshStandardMaterial({ color: 0x7fa45a, roughness: 0.88 });
  const hideMat = new THREE.MeshStandardMaterial({ color: 0x9b7553, roughness: 0.95 });
  const bannerMat = new THREE.MeshStandardMaterial({ color: 0x8c3f2c, roughness: 0.82 });
  disposables.push(woodMat, herbMat, hideMat, bannerMat);

  createTotemPole(THREE, parent, disposables, -2.7, -2.1);
  createTotemPole(THREE, parent, disposables, 2.8, -2.0);

  const racks = [
    { x: -4.2, z: 3.3, ry: 0.4 },
    { x: 4.4, z: 3.2, ry: -0.35 },
    { x: -1.8, z: 6.3, ry: 0 }
  ];

  for (const rack of racks) {
    const group = new THREE.Group();
    group.position.set(rack.x, 0, rack.z);
    group.rotation.y = rack.ry;
    parent.add(group);

    for (const x of [-0.6, 0.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 1.45, 6), woodMat);
      post.position.set(x, 0.72, 0);
      post.castShadow = true;
      group.add(post);
      disposables.push(post.geometry);
    }

    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.45, 6), woodMat);
    beam.position.y = 1.3;
    beam.rotation.z = Math.PI / 2;
    beam.castShadow = true;
    group.add(beam);
    disposables.push(beam.geometry);

    for (let i = 0; i < 6; i += 1) {
      const herb = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 5), herbMat);
      herb.position.set(-0.45 + i * 0.18, 0.95, 0.02);
      herb.rotation.x = Math.PI;
      herb.castShadow = true;
      group.add(herb);
      disposables.push(herb.geometry);
    }
  }

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2;
    const radius = 13.2 + Math.sin(i * 1.7) * 0.6;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.25, 6), woodMat);
    post.position.set(Math.cos(angle) * radius, 0.62, Math.sin(angle) * radius);
    post.rotation.z = Math.sin(i) * 0.08;
    post.castShadow = true;
    parent.add(post);
    disposables.push(post.geometry);
  }

  for (let i = 0; i < 5; i += 1) {
    const mat = i % 2 === 0 ? hideMat : bannerMat;
    const banner = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.035), mat);
    banner.position.set(-6 + i * 3, 1.65, 7.1 + Math.sin(i) * 0.4);
    banner.rotation.y = 0.2 - i * 0.08;
    banner.userData.kind = "banner";
    parent.add(banner);
    disposables.push(banner.geometry);
  }
}

function createTotemPole(
  THREE: ThreeModule,
  parent: any,
  disposables: Disposable[],
  x: number,
  z: number
) {
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x50321f, roughness: 0.88 });
  const markMat = new THREE.MeshStandardMaterial({ color: 0xd0c097, emissive: 0x49351d, emissiveIntensity: 0.25, roughness: 0.65 });
  disposables.push(woodMat, markMat);

  const pole = new THREE.Group();
  pole.position.set(x, 0, z);
  parent.add(pole);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.6, 8), woodMat);
  trunk.position.y = 1.3;
  trunk.castShadow = true;
  pole.add(trunk);
  disposables.push(trunk.geometry);

  for (const side of [-1, 1]) {
    const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.2, 6), markMat);
    antler.position.set(side * 0.35, 2.45, 0);
    antler.rotation.z = side * 0.75;
    antler.castShadow = true;
    pole.add(antler);
    disposables.push(antler.geometry);
  }

  for (let i = 0; i < 4; i += 1) {
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.035), markMat);
    mark.position.set(0, 0.7 + i * 0.34, 0.17);
    mark.rotation.z = i * 0.32;
    pole.add(mark);
    disposables.push(mark.geometry);
  }
}

/** 可玩区域外围的实例化松林环 — 低成本背景填充。 */
// 远处森林使用 InstancedMesh 批量绘制，减少 draw call。
function createForestRing(THREE: ThreeModule, parent: any, disposables: Disposable[]) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x251a12, roughness: 0.98 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x162c1d, roughness: 0.92 });
  disposables.push(trunkMat, leafMat);

  const treeCount = 112;
  const dummy = new THREE.Object3D();
  const trunkGeometry = new THREE.CylinderGeometry(0.12, 0.18, 2.3, 7);
  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMat, treeCount);
  trunks.castShadow = true;
  parent.add(trunks);
  disposables.push(trunkGeometry);

  const crownGeometries = [0, 1, 2].map((layer) => new THREE.ConeGeometry(0.9 - layer * 0.16, 1.5, 7));
  const crowns = crownGeometries.map((geometry) => {
    const mesh = new THREE.InstancedMesh(geometry, leafMat, treeCount);
    mesh.castShadow = true;
    parent.add(mesh);
    disposables.push(geometry);
    return mesh;
  });

  for (let i = 0; i < treeCount; i += 1) {
    const angle = (i / 112) * Math.PI * 2;
    const radius = 62 + Math.sin(i * 2.1) * 6 + Math.random() * 6;
    const scale = 1.0 + Math.random() * 1.1;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    dummy.position.set(x, 1.15 * scale, z);
    dummy.rotation.set(0, -angle, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    for (let layer = 0; layer < 3; layer += 1) {
      dummy.position.set(x, (2 + layer * 0.58) * scale, z);
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      crowns[layer]!.setMatrixAt(i, dummy.matrix);
    }
  }

  trunks.instanceMatrix.needsUpdate = true;
  for (const crown of crowns) {
    crown.instanceMatrix.needsUpdate = true;
  }
}

/** 地平线雾色剪影（挂在 scene 根节点，非 world）。 */
function createDistantHills(THREE: ThreeModule, scene: any, disposables: Disposable[]) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x16251f, fog: true });
  disposables.push(mat);

  for (let i = 0; i < 18; i += 1) {
    const hill = new THREE.Mesh(new THREE.ConeGeometry(10 + Math.random() * 8, 9 + Math.random() * 9, 5), mat);
    hill.position.set(-88 + i * 10.5, -0.4, -82 - Math.random() * 18);
    hill.rotation.y = Math.random() * Math.PI;
    scene.add(hill);
    disposables.push(hill.geometry);
  }
}

/** 村落上方的夜空点云。 */
// 星场使用 Points + BufferGeometry，一次提交大量点位，比逐个 Mesh 更轻。
function createStarfield(THREE: ThreeModule, scene: any, disposables: Disposable[]) {
  const count = 260;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const radius = 90 + Math.random() * 90;
    positions[i * 3] = Math.cos(theta) * radius;
    positions[i * 3 + 1] = 15 + Math.random() * 28;
    positions[i * 3 + 2] = Math.sin(theta) * radius;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xe8f2ff, size: 0.11, transparent: true, opacity: 0.72 });
  scene.add(new THREE.Points(geometry, material));
  disposables.push(geometry, material);
}
