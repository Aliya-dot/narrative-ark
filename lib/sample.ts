import type { GameProject } from "./types";
const now = new Date().toISOString();
export const SAMPLE_PROJECT: GameProject = {
  id: "sample-blood-castle",
  version: 1,
  createdAt: now,
  updatedAt: now,
  projectInfo: {
    title: "血月牢城",
    description:
      "现代青年在吸血鬼城堡醒来，必须在女王复苏前找回身份并逃出生天。",
    genre: "西方玄幻",
    tone: "黑暗 · 成长 · 冒险",
    creationMode: "simple",
    freedomMode: "hybrid",
  },
  world: {
    background: "诺克图恩大陆的北境被永夜笼罩，血族以古老契约统治人类城镇。",
    history: "三百年前猎魔人与血族签订停战契约；如今封印正在松动。",
    geography: "黑杉林环绕的瓦尔德城堡坐落于断崖，地下水道通向旧城。",
    locations: [
      {
        id: "dungeon",
        name: "地下牢房",
        description: "潮湿石墙上刻着褪色的封印，铁门外传来巡逻声。",
        connections: ["gallery"],
      },
      {
        id: "gallery",
        name: "刑讯回廊",
        description: "连接牢区与城堡内庭的狭长回廊。",
        connections: ["dungeon"],
      },
    ],
    factions: [
      {
        id: "court",
        name: "猩红宫廷",
        description: "侍奉沉睡女王的血族贵族。",
        attitude: -40,
        goal: "完成复苏仪式",
      },
    ],
    races: ["人类", "血族", "半血者"],
    religions: ["黎明教会"],
    socialRules: ["血契高于世俗法律"],
    powerSystem: "血印、圣痕与炼金术构成三条力量路径。",
    currentCrisis: "吸血鬼女王即将复苏，城堡正在收集特殊血脉者。",
    secrets: ["女王的心脏并不在棺椁中"],
  },
  player: {
    name: "林默",
    gender: "男",
    age: "22",
    race: "人类",
    identity: "来历不明的囚徒",
    background: "从现代世界穿越而来，记忆在坠落时出现断层。",
    personality: "警觉、克制",
    appearance: "黑发，左眼浮现银色细纹",
    goals: ["逃出地牢", "查明身份"],
    talents: [
      {
        id: "eye",
        name: "解析之眼",
        description: "解析物品、能力、印记和部分生物信息",
      },
    ],
    skills: [],
    weaknesses: ["对这个世界缺乏常识"],
    attributes: { 生命: 100, 体力: 80, 精神: 70, 等级: 1, 金钱: 0 },
    inventory: [],
    equipment: [],
    statusEffects: [],
  },
  characters: [
    {
      id: "rowan",
      name: "罗文",
      identity: "濒死的少年囚犯",
      age: "16",
      race: "人类",
      personality: "戒备但重承诺",
      appearance: "灰发，右臂缠着渗血绷带",
      background: "来自被宫廷清洗的猎魔人村庄",
      abilities: [],
      relationship: "同囚",
      attitude: 5,
      goal: "救出被带走的妹妹",
      secret: "体内藏有猎魔人圣痕",
      speechStyle: "短句、谨慎",
      important: true,
      mortal: true,
    },
  ],
  gameSystem: {
    levelSystem: "行动与关键抉择累积经验，等级影响判定上限。",
    attributes: [
      { id: "hp", name: "生命", initial: 100, max: 100, display: "bar" },
      { id: "stamina", name: "体力", initial: 80, max: 100, display: "bar" },
      { id: "mind", name: "精神", initial: 70, max: 100, display: "bar" },
    ],
    combatRules: "危险行动依据属性、环境和装备进行隐藏判定。",
    taskRules: "目标可并行推进，失败可能打开新分支。",
    relationshipRules: "态度由行为累积变化，不因主角身份自动提升。",
    deathRules: "允许受伤、失去物品与死亡；死亡前必须有清晰风险信号。",
    difficultyRules: "中等难度，信息与资源有限。",
    randomCheckRules: "以 1-100 隐藏判定，属性与情境提供修正。",
  },
  story: {
    mainGoal: "逃出地牢并弄清穿越与血脉的真相",
    openingEvent: "主角在地下牢房醒来，巡逻队即将带走同伴。",
    chapters: [
      {
        id: "c1",
        title: "铁门之后",
        summary: "逃离牢区，第一次选择信任谁。",
        goals: ["找到钥匙或替代路线"],
      },
    ],
    sideQuests: [
      {
        id: "q1",
        title: "少年的请求",
        description: "帮助罗文找到妹妹的线索",
        status: "inactive",
        objectives: ["取得巡逻名单"],
      },
    ],
    randomEvents: [
      {
        id: "e1",
        title: "血月脉动",
        trigger: "夜半",
        description: "带有特殊血脉的人会短暂听见女王低语。",
      },
    ],
    endings: [
      {
        id: "end1",
        title: "黎明之外",
        conditions: ["阻止复苏", "逃离城堡"],
        description: "带着真相迎来久违的晨光。",
      },
    ],
  },
  prompts: {
    gameMasterPrompt:
      "你是文字冒险游戏主持人、旁白和 NPC 扮演者。不得替玩家决定行动或描述未表达的心理；NPC 有独立目标与记忆；世界持续运行；重要行为依据状态、环境与难度判定；选择必须产生后果；每回合给出行动空间，并严格返回指定 JSON。",
    openingPrompt: "从地下牢房苏醒开始，呈现迫近的巡逻与受伤的罗文。",
    stateUpdatePrompt: "仅返回状态差异，不凭空增加能力、物品或关系。",
    summaryPrompt: "压缩剧情但保留选择、任务、关系、物品和世界变化。",
    consistencyCheckPrompt: "核对人名、地点连接、能力规则和角色目标。",
  },
  openingScene:
    "冰冷的水滴落在你的眉骨。你睁眼时，首先看见铁栏外一盏正在远去的油灯，以及自己左眼边缘浮起的一行银色细字：\n\n【未知血印：解析中……】\n\n对面墙角，一个灰发少年用绑着血布的手捂住你的嘴。\n\n“别出声，”他看向门外，“他们下一轮，会带走一个人。”",
};
