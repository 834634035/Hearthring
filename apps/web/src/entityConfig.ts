import { continents, factionTypes, hearthStates, regions, shardGrades, totemOrigins, type CrudEntity } from "@tribal-epic/shared";
import type { FieldConfig } from "./types";

export const entityLabels: Record<CrudEntity, string> = {
  tribes: "部落",
  characters: "人物",
  regions: "地理区域",
  settlements: "聚落",
  resources: "资源",
  creatures: "动植物与王兽",
  factions: "势力",
  events: "事件"
};

export const fieldConfigs: Record<CrudEntity, FieldConfig[]> = {
  tribes: [
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
  ],
  characters: [
    { key: "name", label: "姓名", required: true },
    { key: "role", label: "身份/职位" },
    { key: "tribeName", label: "所属部落" },
    { key: "status", label: "状态" },
    { key: "secretLevel", label: "秘密等级", type: "number" },
    { key: "ability", label: "能力", type: "textarea" },
    { key: "knowledge", label: "认知边界", type: "textarea" },
    { key: "motivation", label: "动机", type: "textarea" },
    { key: "description", label: "描述", type: "textarea" }
  ],
  regions: [
    { key: "name", label: "区域名", required: true },
    { key: "continent", label: "大陆" },
    { key: "climate", label: "气候", type: "textarea" },
    { key: "terrain", label: "地形", type: "textarea" },
    { key: "dangerLevel", label: "危险等级", type: "number" },
    { key: "mapX", label: "地图 X", type: "number" },
    { key: "mapY", label: "地图 Y", type: "number" },
    { key: "mapZoom", label: "地图缩放", type: "number" },
    { key: "description", label: "描述", type: "textarea" }
  ],
  settlements: [
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
  ],
  resources: [
    { key: "name", label: "资源名", required: true },
    { key: "category", label: "类别" },
    { key: "grade", label: "等级", type: "select", options: [...shardGrades, "普通", "战略资源", "血铜器前期认知名"] },
    { key: "region", label: "产地/流通地" },
    { key: "rarity", label: "稀有度", type: "number" },
    { key: "useCase", label: "用途", type: "textarea" },
    { key: "risk", label: "风险", type: "textarea" },
    { key: "description", label: "描述", type: "textarea" }
  ],
  creatures: [
    { key: "name", label: "名称", required: true },
    { key: "creatureType", label: "类型" },
    { key: "region", label: "区域" },
    { key: "isKingBeast", label: "王兽", type: "boolean" },
    { key: "dangerLevel", label: "危险等级", type: "number" },
    { key: "ability", label: "特殊能力", type: "textarea" },
    { key: "materialUse", label: "材料作用", type: "textarea" },
    { key: "behavior", label: "行为", type: "textarea" },
    { key: "description", label: "描述", type: "textarea" }
  ],
  factions: [
    { key: "name", label: "势力名", required: true },
    { key: "factionType", label: "类型", type: "select", options: [...factionTypes] },
    { key: "origin", label: "起源", type: "textarea" },
    { key: "publicFace", label: "公开面貌", type: "textarea" },
    { key: "hiddenGoal", label: "隐藏目标", type: "textarea" },
    { key: "resources", label: "资源", type: "textarea" },
    { key: "weakness", label: "限制/弱点", type: "textarea" },
    { key: "description", label: "描述", type: "textarea" }
  ],
  events: [
    { key: "title", label: "事件名", required: true },
    { key: "act", label: "幕/阶段" },
    { key: "region", label: "区域" },
    { key: "eventType", label: "事件类型" },
    { key: "visibleTo", label: "谁知道", type: "textarea" },
    { key: "hiddenTruth", label: "隐藏真相", type: "textarea" },
    { key: "consequences", label: "后果", type: "textarea" },
    { key: "description", label: "描述", type: "textarea" }
  ]
};

export const tableColumns: Record<CrudEntity, string[]> = {
  tribes: ["name", "region", "totem", "hearthState", "strengthLevel", "preferences"],
  characters: ["name", "role", "tribeName", "status", "secretLevel"],
  regions: ["name", "continent", "terrain", "dangerLevel"],
  settlements: ["name", "region", "owner", "settlementType", "fireStatus"],
  resources: ["name", "category", "grade", "region", "rarity"],
  creatures: ["name", "creatureType", "region", "isKingBeast", "dangerLevel"],
  factions: ["name", "factionType", "publicFace", "hiddenGoal"],
  events: ["title", "act", "region", "eventType", "visibleTo"]
};
