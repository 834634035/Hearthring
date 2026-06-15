import {
  continents,
  factionTypes,
  hearthStates,
  regions,
  shardGrades,
  totemOrigins
} from "../constants.ts";
import type { CrudEntity, EntityDefinition } from "./types.ts";

export const entityDefinitions: Record<CrudEntity, EntityDefinition> = {
  tribes: {
    label: "部落",
    description: "管理图腾、火塘、支属、擅长与禁忌。",
    tableName: "tribes",
    tableColumns: ["name", "region", "totem", "hearthState", "strengthLevel", "preferences"],
    fields: [
      { key: "name", label: "部落名", required: true },
      { key: "continent", label: "大陆", type: "select", options: [...continents] },
      { key: "region", label: "区域", type: "select", options: [...regions] },
      { key: "factionType", label: "类型", type: "select", options: [...factionTypes] },
      { key: "totem", label: "图腾" },
      { key: "totemOrigin", label: "图腾来源", type: "select", options: [...totemOrigins] },
      { key: "hearthName", label: "火塘名" },
      { key: "hearthState", label: "火塘状态", type: "select", options: [...hearthStates] },
      { key: "strengthLevel", label: "强度", type: "number" },
      { key: "population", label: "人口", type: "number" },
      { key: "specialties", label: "擅长", type: "textarea" },
      { key: "preferences", label: "喜好/需求", type: "textarea" },
      { key: "taboos", label: "禁忌", type: "textarea" },
      { key: "abilities", label: "图腾能力", type: "textarea" },
      { key: "weakness", label: "弱点", type: "textarea" },
      { key: "stance", label: "剧情立场", type: "textarea" },
      { key: "coordinatesX", label: "地图 X", type: "number" },
      { key: "coordinatesY", label: "地图 Y", type: "number" },
      { key: "description", label: "描述", type: "textarea" }
    ]
  },
  characters: {
    label: "人物",
    description: "管理巫、首领、巫徒、战士和主线角色。",
    tableName: "characters",
    tableColumns: ["name", "role", "tribeName", "status", "secretLevel"],
    fields: [
      { key: "name", label: "姓名", required: true },
      { key: "role", label: "身份/职位" },
      { key: "tribeName", label: "所属部落" },
      { key: "status", label: "状态" },
      { key: "secretLevel", label: "秘密等级", type: "number" },
      { key: "ability", label: "能力", type: "textarea" },
      { key: "knowledge", label: "认知边界", type: "textarea" },
      { key: "motivation", label: "动机", type: "textarea" },
      { key: "description", label: "描述", type: "textarea" }
    ]
  },
  regions: {
    label: "地理区域",
    description: "管理东大陆、西大陆、沙漠、密林、水泽与海路。",
    tableName: "regions",
    tableColumns: ["name", "continent", "terrain", "dangerLevel"],
    fields: [
      { key: "name", label: "区域名", required: true },
      { key: "continent", label: "大陆" },
      { key: "climate", label: "气候", type: "textarea" },
      { key: "terrain", label: "地形", type: "textarea" },
      { key: "dangerLevel", label: "危险等级", type: "number" },
      { key: "mapX", label: "地图 X", type: "number" },
      { key: "mapY", label: "地图 Y", type: "number" },
      { key: "mapZoom", label: "地图缩放", type: "number" },
      { key: "description", label: "描述", type: "textarea" }
    ]
  },
  settlements: {
    label: "聚落",
    description: "管理火塘所在地、环城、铜牙集、祭地与要塞。",
    tableName: "settlements",
    tableColumns: ["name", "region", "owner", "settlementType", "fireStatus"],
    fields: [
      { key: "name", label: "聚落名", required: true },
      { key: "region", label: "区域" },
      { key: "owner", label: "控制者" },
      { key: "settlementType", label: "类型" },
      { key: "population", label: "人口", type: "number" },
      { key: "fireStatus", label: "火塘状态" },
      { key: "tradeGoods", label: "交易物", type: "textarea" },
      { key: "mapX", label: "地图 X", type: "number" },
      { key: "mapY", label: "地图 Y", type: "number" },
      { key: "description", label: "描述", type: "textarea" }
    ]
  },
  resources: {
    label: "资源",
    description: "管理曜石、盐、水源、沙铜、药草和贸易物。",
    tableName: "resources",
    tableColumns: ["name", "category", "grade", "region", "rarity"],
    fields: [
      { key: "name", label: "资源名", required: true },
      { key: "category", label: "类别" },
      { key: "grade", label: "等级", type: "select", options: [...shardGrades, "低级至王级", "普通", "普通至特异", "战略资源", "禁器", "特级信物", "贵重器物", "不可交易", "血铜器前期认知名"] },
      { key: "region", label: "产地/流通地" },
      { key: "rarity", label: "稀有度", type: "number" },
      { key: "useCase", label: "用途", type: "textarea" },
      { key: "risk", label: "风险", type: "textarea" },
      { key: "description", label: "描述", type: "textarea" }
    ]
  },
  creatures: {
    label: "动植物与王兽",
    description: "管理异世界动植物、特殊作用和王兽威胁。",
    tableName: "creatures",
    tableColumns: ["name", "creatureType", "region", "isKingBeast", "dangerLevel"],
    fields: [
      { key: "name", label: "名称", required: true },
      { key: "creatureType", label: "类型" },
      { key: "region", label: "区域" },
      { key: "isKingBeast", label: "王兽", type: "boolean" },
      { key: "dangerLevel", label: "危险等级", type: "number" },
      { key: "ability", label: "特殊能力", type: "textarea" },
      { key: "materialUse", label: "材料作用", type: "textarea" },
      { key: "behavior", label: "行为", type: "textarea" },
      { key: "description", label: "描述", type: "textarea" }
    ]
  },
  factions: {
    label: "势力",
    description: "管理铜影会、铜日诸部、火环盟等跨部落势力。",
    tableName: "factions",
    tableColumns: ["name", "factionType", "publicFace", "hiddenGoal"],
    fields: [
      { key: "name", label: "势力名", required: true },
      { key: "factionType", label: "类型", type: "select", options: [...factionTypes] },
      { key: "origin", label: "起源", type: "textarea" },
      { key: "publicFace", label: "公开面貌", type: "textarea" },
      { key: "hiddenGoal", label: "隐藏目标", type: "textarea" },
      { key: "resources", label: "资源", type: "textarea" },
      { key: "weakness", label: "限制/弱点", type: "textarea" },
      { key: "description", label: "描述", type: "textarea" }
    ]
  },
  events: {
    label: "事件",
    description: "管理灭族、预言、成人礼、猎王和清缴环城等剧情节点。",
    tableName: "story_events",
    tableColumns: ["title", "act", "region", "eventType", "visibleTo"],
    fields: [
      { key: "title", label: "事件名", required: true },
      { key: "act", label: "幕/阶段" },
      { key: "region", label: "区域" },
      { key: "eventType", label: "事件类型" },
      { key: "visibleTo", label: "谁知道", type: "textarea" },
      { key: "hiddenTruth", label: "隐藏真相", type: "textarea" },
      { key: "consequences", label: "后果", type: "textarea" },
      { key: "description", label: "描述", type: "textarea" }
    ]
  },
  artifacts: {
    label: "神器",
    description: "管理图腾遗物、曜石法器、王兽遗蜕与剧情关键器物。",
    tableName: "artifacts",
    tableColumns: ["name", "artifactType", "grade", "boundTribe", "status"],
    fields: [
      { key: "name", label: "神器名", required: true },
      { key: "artifactType", label: "类型", type: "select", options: ["武器", "图腾遗物", "曜石法器", "祭器", "王兽遗蜕"] },
      { key: "grade", label: "品阶", type: "select", options: ["凡品", "灵品", "王品", "传说"] },
      { key: "origin", label: "来历" },
      { key: "boundTribe", label: "归属部落" },
      { key: "status", label: "状态", type: "select", options: ["完好", "碎片", "封印", "失落"] },
      { key: "powerLevel", label: "威能等级", type: "number" },
      { key: "ability", label: "能力", type: "textarea" },
      { key: "restrictions", label: "使用限制", type: "textarea" },
      { key: "lore", label: "传说", type: "textarea" },
      { key: "description", label: "描述", type: "textarea" }
    ]
  }
};
