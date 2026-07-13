export type TribeNodeKind = "tribe" | "branch" | "alliance" | "external" | "future";

export type TribeRelationKind = "belonging" | "secret" | "pressure" | "conflict" | "trade" | "alliance" | "omen";

export type TribeRelationNode = {
  id: string;
  name: string;
  kind: TribeNodeKind;
  region: string;
  totem: string;
  strength: number;
  x: number;
  y: number;
  summary: string;
};

export type TribeRelationEdge = {
  id: string;
  from: string;
  to: string;
  kind: TribeRelationKind;
  label: string;
  summary: string;
};

export const TRIBE_RELATION_NODES: TribeRelationNode[] = [
  {
    id: "graybud",
    name: "灰芽部落",
    kind: "branch",
    region: "东大陆北部",
    totem: "青蹄鹿",
    strength: 2,
    x: 31,
    y: 23,
    summary: "鹿角旁支，青岚成长之地，也是第一章的情感根系。"
  },
  {
    id: "deerhorn",
    name: "鹿角主部落",
    kind: "tribe",
    region: "东大陆中部",
    totem: "白角鹿",
    strength: 4,
    x: 42,
    y: 33,
    summary: "治疗、草药、种植和支属网络强，正集中资源备灾。"
  },
  {
    id: "redfang",
    name: "赤牙部落",
    kind: "tribe",
    region: "东大陆中部",
    totem: "焰牙虎",
    strength: 5,
    x: 45,
    y: 50,
    summary: "最激进的强部落，推动并火、强征和猎王路线。"
  },
  {
    id: "stonegather",
    name: "石集诸部",
    kind: "alliance",
    region: "东大陆中部",
    totem: "双面契骨",
    strength: 4,
    x: 58,
    y: 49,
    summary: "贸易、契约、曜石流通和弱部落抱团的关键中立方。"
  },
  {
    id: "cloudsieve",
    name: "云箕部落",
    kind: "tribe",
    region: "西部沙漠东缘",
    totem: "衔云鹿",
    strength: 3,
    x: 25,
    y: 58,
    summary: "求雨和水脉维护部落，被铜影会锁水暗线牵动。"
  },
  {
    id: "tidehearing",
    name: "听潮部落",
    kind: "tribe",
    region: "西大陆东岸",
    totem: "海潮",
    strength: 4,
    x: 8,
    y: 45,
    summary: "阿澜出生部落，灭族后旧火归海，余火藏入潮门青坠。"
  },
  {
    id: "sleepdream",
    name: "眠梦部落",
    kind: "tribe",
    region: "东大陆西北海岸",
    totem: "眠果与梦蛾",
    strength: 2,
    x: 24,
    y: 18,
    summary: "救起海上婴儿，预见西大陆奴役文明跨海而来的灾梦。"
  },
  {
    id: "thunderdrum",
    name: "雷鼓部落",
    kind: "tribe",
    region: "东大陆中部草原",
    totem: "雷鼓兽",
    strength: 4,
    x: 74,
    y: 54,
    summary: "草原重装、阵列和冲阵强大，容易被赤牙拉拢或激怒。"
  },
  {
    id: "longbow",
    name: "长弓部落",
    kind: "tribe",
    region: "东大陆山地",
    totem: "山鹰长弓",
    strength: 4,
    x: 76,
    y: 35,
    summary: "山地远射和通道控制强，可封锁环城山道和商路。"
  },
  {
    id: "bluepottery",
    name: "青陶部落",
    kind: "tribe",
    region: "东大陆中部",
    totem: "青陶窑火",
    strength: 4,
    x: 56,
    y: 66,
    summary: "储粮、陶器、建筑和防御工事强，未来联盟的重要后勤。"
  },
  {
    id: "hundredvine",
    name: "百藤部落",
    kind: "tribe",
    region: "南部水泽密林",
    totem: "百藤",
    strength: 3,
    x: 62,
    y: 80,
    summary: "密林防御与陷阱强，南部联盟阻力之一。"
  },
  {
    id: "frostbone",
    name: "霜骨部落",
    kind: "tribe",
    region: "北境寒岭",
    totem: "霜骨",
    strength: 4,
    x: 82,
    y: 12,
    summary: "北境寒地强部落，若南下就意味着大灾将至。"
  },
  {
    id: "blackfeather",
    name: "黑羽部落",
    kind: "tribe",
    region: "南部旧战场",
    totem: "黑羽鸦",
    strength: 2,
    x: 48,
    y: 78,
    summary: "预感灾兆和传递警讯，常被其他部落视为不祥。"
  },
  {
    id: "jade",
    name: "玉部落",
    kind: "tribe",
    region: "东大陆中部",
    totem: "玉石",
    strength: 3,
    x: 66,
    y: 39,
    summary: "礼器、盟誓信物和身份标记部落。"
  },
  {
    id: "grindstone",
    name: "砺石部落",
    kind: "tribe",
    region: "东大陆中部",
    totem: "磨石",
    strength: 3,
    x: 64,
    y: 44,
    summary: "石器、修刃和工具维护部落，工匠容易被强部落争夺。"
  },
  {
    id: "blackstone",
    name: "黑石部落",
    kind: "tribe",
    region: "东大陆北部边界",
    totem: "黑石界碑",
    strength: 3,
    x: 50,
    y: 14,
    summary: "守路、边界和盟约部落，夹在强部落之间时压力极大。"
  },
  {
    id: "deepcave",
    name: "深窟部落",
    kind: "tribe",
    region: "南部地下洞网",
    totem: "地下洞网",
    strength: 3,
    x: 43,
    y: 84,
    summary: "洞穴生存、地下水和矿脉路径部落。"
  },
  {
    id: "saltmarsh",
    name: "盐泽部落",
    kind: "tribe",
    region: "南部水泽",
    totem: "盐泽",
    strength: 3,
    x: 68,
    y: 75,
    summary: "盐、腌制、防腐和泽地通行部落，战争时期资源关键。"
  },
  {
    id: "marshfrog",
    name: "泽蛙部落",
    kind: "tribe",
    region: "南部水泽",
    totem: "泽蛙",
    strength: 2,
    x: 73,
    y: 80,
    summary: "沼地行动、毒液和两栖狩猎部落。"
  },
  {
    id: "snakebone",
    name: "蛇骨部落",
    kind: "tribe",
    region: "南部水泽",
    totem: "蛇骨",
    strength: 3,
    x: 80,
    y: 82,
    summary: "毒、骨饰和隐秘通道部落，异质感较强。"
  },
  {
    id: "coppershadow",
    name: "铜影会",
    kind: "external",
    region: "西部沙漠环城",
    totem: "压火铜",
    strength: 4,
    x: 18,
    y: 70,
    summary: "沙漠商队与债务奴役势力，控制绿洲、环城和信息差。"
  },
  {
    id: "coppersun",
    name: "铜日诸部",
    kind: "external",
    region: "西大陆",
    totem: "铜日",
    strength: 5,
    x: 6,
    y: 28,
    summary: "海那边的青铜器强部落联盟，是东大陆未来真正威胁。"
  },
  {
    id: "firering",
    name: "火环盟誓",
    kind: "future",
    region: "东大陆共同秩序",
    totem: "共火议会",
    strength: 5,
    x: 56,
    y: 25,
    summary: "未来替代并火成王的第三条路，各部保留图腾并共同议事。"
  }
];

export const TRIBE_RELATION_EDGES: TribeRelationEdge[] = [
  {
    id: "graybud-deerhorn",
    from: "graybud",
    to: "deerhorn",
    kind: "belonging",
    label: "支火 / 主火",
    summary: "灰芽是鹿角旁支，接受鹿角主火承认，也承受主部落资源集中压力。"
  },
  {
    id: "sleepdream-graybud",
    from: "sleepdream",
    to: "graybud",
    kind: "secret",
    label: "秘密托孤",
    summary: "眠梦救起海上婴儿后，把青岚秘密托付给灰芽养育。"
  },
  {
    id: "tide-sleepdream",
    from: "tidehearing",
    to: "sleepdream",
    kind: "secret",
    label: "北回潮 / 灾梦",
    summary: "听潮余火与海上婴儿抵达东大陆，眠梦主巫从灾梦中看见西大陆威胁。"
  },
  {
    id: "coppersun-tide",
    from: "coppersun",
    to: "tidehearing",
    kind: "conflict",
    label: "灭族",
    summary: "铜日诸部因听潮拒绝为远航征服导航而灭听潮。"
  },
  {
    id: "coppersun-coppershadow",
    from: "coppersun",
    to: "coppershadow",
    kind: "secret",
    label: "逃亡残党",
    summary: "铜影会由西大陆逃亡奴隶主、炉巫残党和血铜器持有者在东大陆沙漠结成。"
  },
  {
    id: "sleepdream-redfang",
    from: "sleepdream",
    to: "redfang",
    kind: "secret",
    label: "潮门青坠",
    summary: "眠梦主巫将潮门青坠带给赤牙主巫，间接推动赤牙确认跨海威胁。"
  },
  {
    id: "redfang-deerhorn",
    from: "redfang",
    to: "deerhorn",
    kind: "pressure",
    label: "药草 / 治疗压力",
    summary: "赤牙动员迫使鹿角集中药草、治疗巫徒和支属资源。"
  },
  {
    id: "redfang-graybud",
    from: "redfang",
    to: "graybud",
    kind: "pressure",
    label: "间接压迫",
    summary: "赤牙压力传导到鹿角支属，灰芽因此承担更多贡草和猎手名额。"
  },
  {
    id: "redfang-thunderdrum",
    from: "redfang",
    to: "thunderdrum",
    kind: "pressure",
    label: "拉拢 / 激怒",
    summary: "赤牙试图把雷鼓的正面战力纳入猎王路线。"
  },
  {
    id: "redfang-longbow",
    from: "redfang",
    to: "longbow",
    kind: "pressure",
    label: "拉拢 / 压服",
    summary: "赤牙需要长弓控制山道和通道，也可能以武力压服。"
  },
  {
    id: "redfang-stonegather",
    from: "redfang",
    to: "stonegather",
    kind: "trade",
    label: "曜石 / 粮盐",
    summary: "赤牙用曜石、威望和压力换取战争资源，石集维持危险中立。"
  },
  {
    id: "coppershadow-cloudsieve",
    from: "coppershadow",
    to: "cloudsieve",
    kind: "conflict",
    label: "锁水暗线",
    summary: "铜影会控制沙漠水源，让云箕求雨失败与水脉异常加剧。"
  },
  {
    id: "coppershadow-stonegather",
    from: "coppershadow",
    to: "stonegather",
    kind: "trade",
    label: "债务 / 商路污染",
    summary: "铜影会以商旅和债务网络渗入贸易秩序，石集后期可切断其契约链。"
  },
  {
    id: "coppershadow-redfang",
    from: "coppershadow",
    to: "redfang",
    kind: "trade",
    label: "沙铜 / 情报",
    summary: "赤牙暂时需要沙漠背后的情报与沙铜知识，铜影会也借战争牟利。"
  },
  {
    id: "deerhorn-cloudsieve",
    from: "deerhorn",
    to: "cloudsieve",
    kind: "alliance",
    label: "草药 / 水源线索",
    summary: "青岚与云箕巫徒线把鹿角草药、水源危机和沙漠传闻连在一起。"
  },
  {
    id: "blackfeather-redfang",
    from: "blackfeather",
    to: "redfang",
    kind: "omen",
    label: "不祥预兆",
    summary: "赤牙异常阶段，黑羽传出灾兆，给强部落博弈蒙上阴影。"
  },
  {
    id: "frostbone-deerhorn",
    from: "frostbone",
    to: "deerhorn",
    kind: "omen",
    label: "南下预警",
    summary: "霜骨若南下，鹿角和中部强部落都会意识到大灾临近。"
  },
  {
    id: "stonegather-jade",
    from: "stonegather",
    to: "jade",
    kind: "trade",
    label: "礼器 / 盟誓",
    summary: "玉部落的礼器和信物支撑石集的盟约与身份秩序。"
  },
  {
    id: "stonegather-grindstone",
    from: "stonegather",
    to: "grindstone",
    kind: "trade",
    label: "工具 / 工匠",
    summary: "砺石工匠进入石集贸易网，也容易被强部落争夺。"
  },
  {
    id: "stonegather-blackstone",
    from: "stonegather",
    to: "blackstone",
    kind: "alliance",
    label: "边界 / 契约",
    summary: "黑石守路和辨界能力让石集商路更稳定。"
  },
  {
    id: "stonegather-saltmarsh",
    from: "stonegather",
    to: "saltmarsh",
    kind: "trade",
    label: "盐路",
    summary: "盐泽是战争时期的关键资源节点，石集需要维持盐路安全。"
  },
  {
    id: "hundredvine-marshfrog",
    from: "hundredvine",
    to: "marshfrog",
    kind: "alliance",
    label: "湿林邻盟",
    summary: "百藤和泽蛙同处南部水泽，防御、隐蔽和水路行动互补。"
  },
  {
    id: "hundredvine-snakebone",
    from: "hundredvine",
    to: "snakebone",
    kind: "pressure",
    label: "禁忌边界",
    summary: "蛇骨异质感强，和百藤等南部部落之间更依赖边界与禁忌维持和平。"
  },
  {
    id: "deepcave-saltmarsh",
    from: "deepcave",
    to: "saltmarsh",
    kind: "trade",
    label: "地下水 / 盐",
    summary: "深窟提供地下水脉和矿脉路径，盐泽提供盐与保存能力。"
  },
  {
    id: "firering-deerhorn",
    from: "firering",
    to: "deerhorn",
    kind: "alliance",
    label: "治疗救援",
    summary: "火环盟中鹿角负责治疗、草药和支属救援。"
  },
  {
    id: "firering-cloudsieve",
    from: "firering",
    to: "cloudsieve",
    kind: "alliance",
    label: "夺回水源",
    summary: "云箕在清缴环城时负责夺回水源、切断锁水。"
  },
  {
    id: "firering-longbow",
    from: "firering",
    to: "longbow",
    kind: "alliance",
    label: "封锁商路",
    summary: "长弓封锁山道和商路，阻断环城逃逸。"
  },
  {
    id: "firering-thunderdrum",
    from: "firering",
    to: "thunderdrum",
    kind: "alliance",
    label: "正面压阵",
    summary: "雷鼓负责清缴环城的正面压阵。"
  },
  {
    id: "firering-stonegather",
    from: "firering",
    to: "stonegather",
    kind: "alliance",
    label: "切断债务",
    summary: "石集负责切断契约、债务和曜石交易网络。"
  },
  {
    id: "firering-bluepottery",
    from: "firering",
    to: "bluepottery",
    kind: "alliance",
    label: "储粮 / 防御",
    summary: "青陶提供储粮、封井陶器和临时防御工事。"
  },
  {
    id: "firering-redfang",
    from: "firering",
    to: "redfang",
    kind: "alliance",
    label: "限制并火",
    summary: "赤牙可以提供战力，但必须被新盟约限制并火路线。"
  }
];

