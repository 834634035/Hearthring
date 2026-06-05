import { createRow, initSchema, pool, truncateTables, type EntityName } from "./db.ts";

const data: Record<EntityName, Record<string, unknown>[]> = {
  regions: [
    {
      name: "东大陆中部",
      continent: "东大陆",
      climate: "温和、河流密布、四季分明",
      terrain: "草场、林地、河谷、曜石浅脉",
      dangerLevel: 3,
      mapX: 58,
      mapY: 48,
      mapZoom: 1.2,
      description: "强部落最集中的区域，赤牙、石集、鹿角、青陶、雷鼓与长弓都围绕这里争夺秩序。"
    },
    {
      name: "西部沙漠",
      continent: "东大陆",
      climate: "干旱、沙暴、昼夜温差极大",
      terrain: "沙丘、荒原、绿洲、古海盆地",
      dangerLevel: 5,
      mapX: 18,
      mapY: 54,
      mapZoom: 1.6,
      description: "东大陆与跨海口最近的地带，也是铜影会扎根之地。"
    },
    {
      name: "北部密林山地",
      continent: "东大陆",
      climate: "湿冷、雾多、寒岭风强",
      terrain: "密林、山谷、寒岭、溪流",
      dangerLevel: 4,
      mapX: 52,
      mapY: 23,
      mapZoom: 1.5,
      description: "灰芽部落所在区域，部落分散，适合隐藏海上来的孩子。"
    },
    {
      name: "西大陆东岸",
      continent: "西大陆",
      climate: "海风强烈、潮汐异常",
      terrain: "断崖、礁湾、听潮旧岸",
      dangerLevel: 5,
      mapX: -26,
      mapY: 50,
      mapZoom: 1.3,
      description: "听潮部落曾扼守两大陆最可能联通的海岸。"
    }
  ],
  tribes: [
    {
      name: "灰芽部落",
      continent: "东大陆",
      region: "北部密林山地",
      factionType: "支属",
      totem: "青蹄鹿",
      totemOrigin: "救命之恩",
      hearthName: "灰芽支火",
      hearthState: "稳定",
      strengthLevel: 2,
      population: 180,
      specialties: "草药、山林小猎、辨毒、安抚小兽",
      preferences: "温和盟约、稳定水源、药草地、鹿角主火承认",
      taboos: "不可焚毁新芽，不可在无祭祀时猎杀幼鹿",
      abilities: "弱治疗、辨草、雾中不易迷路",
      weakness: "武力不足，受鹿角主部落资源集中政策影响大",
      stance: "保护青岚，前期回避大部落政治",
      coordinatesX: 50,
      coordinatesY: 22,
      description: "鹿角旁支小部落，主角青岚成长之地。普通族人不知道他的海上来历。"
    },
    {
      name: "赤牙部落",
      continent: "东大陆",
      region: "东大陆中部",
      factionType: "部落",
      totem: "焰牙虎",
      totemOrigin: "恐惧转敬畏",
      hearthName: "焰牙主火",
      hearthState: "强盛",
      strengthLevel: 5,
      population: 2600,
      specialties: "近战、狩猎、战争动员、并火",
      preferences: "高级曜石、战士、盐、药草、猎王情报",
      taboos: "不可怯战，不可背弃战誓",
      abilities: "激发战士狂性、强化筋骨、短暂免痛",
      weakness: "好战导致火浊风险，猎王路线会破坏地脉平衡",
      stance: "明面压力，试图猎杀黑脊地龙王以整合东大陆",
      coordinatesX: 55,
      coordinatesY: 48,
      description: "第一部明面强敌之一。不是单纯反派，而是把恐惧导向强行统一的部落。"
    },
    {
      name: "鹿角主部落",
      continent: "东大陆",
      region: "东大陆中部",
      factionType: "部落",
      totem: "白角鹿",
      totemOrigin: "救命之恩",
      hearthName: "白角主火",
      hearthState: "稳定",
      strengthLevel: 4,
      population: 1700,
      specialties: "治疗、草药、驯养、支属协调",
      preferences: "药草地、稳定支火、盟约、避战",
      taboos: "不可强行抹除支图腾，不可污染药泉",
      abilities: "治疗、植物感知、安抚野兽",
      weakness: "武力不如赤牙，支属压力容易引发内部裂痕",
      stance: "在赤牙压力下集中资源，前期容易被青岚误解",
      coordinatesX: 51,
      coordinatesY: 36,
      description: "灰芽的主部落，主火和支火共同维持鹿角体系。"
    },
    {
      name: "云箕部落",
      continent: "东大陆",
      region: "西部沙漠",
      factionType: "部落",
      totem: "衔云鹤",
      totemOrigin: "共同生活",
      hearthName: "云箕雨火",
      hearthState: "衰弱",
      strengthLevel: 3,
      population: 760,
      specialties: "求雨、季风山口、水渠维护、雨季预测",
      preferences: "净水、云纹骨、季风、巫徒安全",
      taboos: "不可锁水为私产，不可在旱季欺骗求雨",
      abilities: "引云、辨雨、雾气感知",
      weakness: "求雨概率下降，被铜影会盯上",
      stance: "派巫徒外出寻找水脉异常原因",
      coordinatesX: 28,
      coordinatesY: 50,
      description: "沙漠东缘部落，求雨能力正在失灵，引出青岚中期沙漠线。"
    },
    {
      name: "石集部落",
      continent: "东大陆",
      region: "东大陆中部",
      factionType: "部落",
      totem: "双面蛇",
      totemOrigin: "祖先契约",
      hearthName: "契骨火塘",
      hearthState: "稳定",
      strengthLevel: 4,
      population: 2100,
      specialties: "贸易、契约、辨伪、曜石流通",
      preferences: "稳定秩序、货路安全、灵纹骨、低冲突",
      taboos: "不可破坏火塘契约，不可伪造巫印",
      abilities: "契约辨伪、语言沟通、记忆交换",
      weakness: "军事力量一般，必须平衡强部落",
      stance: "关键中立贸易方，后期可切断铜影会债务网络",
      coordinatesX: 61,
      coordinatesY: 44,
      description: "东大陆最大的商品集散与契约部落之一。"
    },
    {
      name: "听潮部落",
      continent: "西大陆",
      region: "西大陆东岸",
      factionType: "部落",
      totem: "海",
      totemOrigin: "祖先契约",
      hearthName: "听潮火塘",
      hearthState: "归海",
      strengthLevel: 4,
      population: 0,
      specialties: "听海风、辨海路、守海峡、潮纹礼器",
      preferences: "尊海、守岸、不征服海",
      taboos: "不可主动跨海征服，不可为铜日诸部导航",
      abilities: "从海风捕捉信息、潮声预兆、守门血誓",
      weakness: "宁折不弯，被铜日诸部灭族",
      stance: "旧火归海，余火藏入阿澜与潮门青坠",
      coordinatesX: -24,
      coordinatesY: 49,
      description: "主角阿澜的出生部落。灭族后火种不是被水浇灭，而是归海。"
    }
  ],
  characters: [
    {
      name: "青岚 / 阿澜",
      role: "主角、听潮首领之子、灰芽入火养子",
      tribeName: "灰芽部落 / 听潮部落",
      status: "成长中",
      secretLevel: 5,
      ability: "听界：感知火塘、人、奴役、图腾、王兽和两大陆之间的边界",
      knowledge: "前期不知道身世，后期由潮门青坠、归海余火和旧祝词唤回阿澜之名",
      motivation: "从寻找自己是谁，走向阻止奴役成为文明基石",
      description: "他不是巫，不能替代祭祀；他的力量在于听见边界裂缝并推动选择。"
    },
    {
      name: "赤牙主巫",
      role: "巫",
      tribeName: "赤牙部落",
      status: "掌握核心秘密",
      secretLevel: 5,
      ability: "战巫、火塘灰辨兆、压火铜感知",
      knowledge: "知道潮门青坠、海上婴儿、眠梦预言和沙漠商队部分真相",
      motivation: "用猎王换取东大陆抵抗奴役文明的机会",
      description: "复杂角色，清楚自己在纵容恶，却认为这是争取活路。"
    },
    {
      name: "箕雨",
      role: "云箕巫徒",
      tribeName: "云箕部落",
      status: "外出寻因",
      secretLevel: 2,
      ability: "辨雨、感知苦水、云纹骨读兆",
      knowledge: "知道云箕求雨失败率异常升高，听过环城传闻",
      motivation: "找回季风断脉原因，保护云箕火塘",
      description: "中期与游历的青岚相遇，把沙漠大型聚集点第一次带入主角视野。"
    }
  ],
  settlements: [
    {
      name: "灰芽火塘地",
      region: "北部密林山地",
      owner: "灰芽部落",
      settlementType: "支火聚落",
      population: 180,
      fireStatus: "稳定",
      tradeGoods: "草药、兽皮、山菌、鹿角片",
      mapX: 50,
      mapY: 22,
      description: "青岚成长地，位于北部山林边缘。"
    },
    {
      name: "环城",
      region: "西部沙漠",
      owner: "铜影会",
      settlementType: "沙漠聚集点",
      population: 4800,
      fireStatus: "无火",
      tradeGoods: "粮食、盐、奴仆、沙铜饰物、战争债务",
      mapX: 18,
      mapY: 55,
      description: "铜影会扎根的庞大聚集点，表面是集市，地下是奴役与债务网络。"
    }
  ],
  resources: [
    {
      name: "曜石",
      category: "通用灵息结晶",
      grade: "低级至王级",
      region: "全大陆地脉、王兽活动区、古兽遗骸",
      rarity: 4,
      useCase: "交易、祭祀、巫术材料、图腾战士强化",
      risk: "无巫和火塘稳定时吸收过量会反噬",
      description: "只按纯度和稳定度分级，不按颜色或属性区分。"
    },
    {
      name: "压火铜",
      category: "奴役器物",
      grade: "血铜器前期认知名",
      region: "环城、铜影会控制地",
      rarity: 5,
      useCase: "奴印、锁火环、井口锁水器、债务仪式",
      risk: "压低火塘回应，长期导致图腾战士断火",
      description: "巫对带奴役气息、会压低火塘回应的铜器称呼。"
    }
  ],
  creatures: [
    {
      name: "黑脊地龙王",
      creatureType: "王兽",
      region: "东大陆中部地脉节点",
      isKingBeast: true,
      dangerLevel: 5,
      ability: "沉睡时加速曜石析出，苏醒时改变河道、震裂山谷、驱散兽群",
      materialUse: "王级曜石矿脉、王兽遗骸、鳞骨",
      behavior: "地脉型王兽，周期将醒，正被过度开采与锁水污染扰动",
      description: "赤牙想猎杀的王兽。它不是曜石唯一来源，而是这一代人够得着的最大富矿。"
    },
    {
      name: "梦蛾",
      creatureType: "异虫",
      region: "眠梦部落林地",
      isKingBeast: false,
      dangerLevel: 2,
      ability: "翅粉诱发梦境",
      materialUse: "眠梦巫辅助预言",
      behavior: "夜间聚集在火塘灰气附近，过量会损伤记忆",
      description: "可用于梦境预言，也能呼应记忆被洗去与找回的主题。"
    }
  ],
  factions: [
    {
      name: "铜影会",
      factionType: "奴隶主集团",
      origin: "听潮灭族后，西大陆逃亡奴隶主、炉巫残党和带血铜器者在东大陆沙漠结成",
      publicFace: "沙漠商队、环城集市、戴环商人、雇佣武装",
      hiddenGoal: "控制信息、贩卖战争、积累奴隶和曜石，同时阻止铜日诸部真正跨海",
      resources: "压火铜、沙铜知识、债务网络、绿洲、奴仆",
      weakness: "无东大陆火塘承认，血铜器有限且不能稳定重铸，曜石吸收易反噬",
      description: "中期暗线势力。威胁像阴影和毒水，而不是无敌军团。"
    },
    {
      name: "铜日诸部",
      factionType: "部落联盟 / 王权雏形",
      origin: "西大陆强部落掌握青铜器并猎杀日鬃狮王后形成",
      publicFace: "铜王、炉巫、铜甲战士、祭炉城",
      hiddenGoal: "跨海征服、寻找曜石与新奴隶、建立奴隶社会秩序",
      resources: "青铜器、血铜器、血铜冠、奴兵、早期文字与船只",
      weakness: "旧图腾沉默、火浊、王兽残念侵蚀血铜冠",
      description: "第一部结尾之后真正逼近的时代洪水。"
    }
  ],
  events: [
    {
      title: "听潮灭族",
      act: "前史",
      region: "西大陆东岸",
      eventType: "灭族 / 火种归海",
      visibleTo: "主角前期完全失忆，眠梦主巫与赤牙主巫只知碎片",
      hiddenTruth: "听潮火塘没有被水浇灭，而是化为无焰盐火归海，余火藏入阿澜与潮门青坠",
      consequences: "阿澜被北回潮送到东大陆北部，铜影会形成条件成熟",
      description: "铜日诸部放弃听潮，决定灭族，因听潮拒绝为远航征服导航。"
    },
    {
      title: "灰芽寻芽礼",
      act: "第二幕",
      region: "北部密林山地",
      eventType: "成人礼",
      visibleTo: "灰芽族人",
      hiddenTruth: "青岚身上鹿角纹与潮纹交叠，说明灰芽火塘和归海余火都在回应他",
      consequences: "青岚获得支属狩猎资格，开始真正进入部落生存压力",
      description: "主角第一次表现出灰芽之感与听潮残响。"
    }
  ]
};

await initSchema();
await truncateTables();

for (const [entity, rows] of Object.entries(data) as Array<[EntityName, Record<string, unknown>[]]>) {
  for (const row of rows) {
    await createRow(entity, row);
  }
}

await pool.end();

console.log("Seeded MySQL database from apps/api/src/seed.ts");
