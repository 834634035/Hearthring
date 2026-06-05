export const continents = ["东大陆", "西大陆"] as const;

export const regions = ["中部", "西部沙漠", "北部密林山地", "南部水泽密林", "西大陆东岸", "断鳞海路"] as const;

export const totemOrigins = ["恐惧转敬畏", "救命之恩", "共同生活", "祖先契约", "禁忌赎罪"] as const;

export const hearthStates = ["强盛", "稳定", "衰弱", "火浊", "沉默", "归海"] as const;

export const shardGrades = ["低级曜石", "中级曜石", "高级曜石", "特级曜石", "王级曜石"] as const;

export const factionTypes = ["部落", "支属", "商会", "奴隶主集团", "部落联盟", "王权雏形"] as const;

export type CrudEntity =
  | "tribes"
  | "characters"
  | "regions"
  | "settlements"
  | "resources"
  | "creatures"
  | "factions"
  | "events";

export interface AdminEntityConfig {
  key: CrudEntity;
  title: string;
  description: string;
}

export const adminEntities: AdminEntityConfig[] = [
  { key: "tribes", title: "部落", description: "管理图腾、火塘、支属、擅长与禁忌。" },
  { key: "characters", title: "人物", description: "管理巫、首领、巫徒、战士和主线角色。" },
  { key: "regions", title: "地理区域", description: "管理东大陆、西大陆、沙漠、密林、水泽与海路。" },
  { key: "settlements", title: "聚落", description: "管理火塘所在地、环城、铜牙集、祭地与要塞。" },
  { key: "resources", title: "资源", description: "管理曜石、盐、水源、沙铜、药草和贸易物。" },
  { key: "creatures", title: "动植物与王兽", description: "管理异世界动植物、特殊作用和王兽威胁。" },
  { key: "factions", title: "势力", description: "管理铜影会、铜日诸部、火环盟等跨部落势力。" },
  { key: "events", title: "事件", description: "管理灭族、预言、成人礼、猎王和清缴环城等剧情节点。" }
];
