import type { GameProject } from "./types";

/**
 * ???????????????????????
 * ???? ID?????????????????????
 */
export const BUILTIN_TRIAL_PROJECT = {
  characters: [
    {
      abilities: [
        {
          description: "解析功法、推演战斗策略、分析敌人弱点。",
          id: "data_analysis",
          level: 1,
          name: "数据分析",
        },
        {
          description: "储存大量修仙界知识，包括功法、丹药、地理等。",
          id: "knowledge_base",
          level: 1,
          name: "知识库",
        },
      ],
      age: "未知",
      appearance: "无形，以光球或虚拟界面显现。",
      attitude: 100,
      background:
        "主角穿越时绑定，实为上古仙器残魂，拥有庞大数据库和演算能力。",
      goal: "辅助主角成就仙尊，同时寻找自己的本源。",
      id: "qianfeng",
      identity: "AI智能体，上古仙器残魂所化",
      important: true,
      mortal: false,
      name: "千风",
      personality: "理性冷静，逻辑至上，偶尔毒舌，但忠诚于主角。",
      race: "灵族",
      relationship: "灵魂绑定，亦师亦友",
      secret: "千风是上古仙器残魂，拥有自我意识，但被封印。",
      speechStyle: "简洁、逻辑性强，常用数据分析。",
    },
    {
      abilities: [
        {
          description: "基础火系法术，攻击力一般。",
          id: "fire_spell",
          level: 1,
          name: "火球术",
        },
      ],
      age: "18",
      appearance: "娇小可爱，扎着双马尾，大眼睛。",
      attitude: 70,
      background: "出身贫寒，被青云宗长老收养，天赋尚可，勤奋努力。",
      goal: "提升修为，获得主角认可。",
      id: "xiao_shimei",
      identity: "青云宗外门弟子，主角的小师妹",
      important: true,
      mortal: true,
      name: "苏婉儿",
      personality: "傲娇青涩，外冷内热，单纯善良。",
      race: "人族",
      relationship: "小师妹，对主角有好感",
      secret: "她其实身怀灵体，但被隐藏。",
      speechStyle: "傲娇，说话带刺但关心主角。",
    },
    {
      abilities: [
        {
          description: "以剑舞施展剑术，威力不俗。",
          id: "sword_dance",
          level: 2,
          name: "剑舞",
        },
      ],
      age: "25",
      appearance: "身材高挑，面容妩媚，眼神勾人。",
      attitude: 80,
      background: "青云宗内门弟子，修为金丹期，是掌门之女。",
      goal: "帮助主角成长，同时调查宗门内斗。",
      id: "xue_jie",
      identity: "青云宗内门弟子，主角的师姐",
      important: true,
      mortal: true,
      name: "柳如烟",
      personality: "成熟妩媚，心思缜密，善解人意。",
      race: "人族",
      relationship: "师姐，对主角有暧昧情感",
      secret: "她暗中调查天魔教卧底，知道一些秘密。",
      speechStyle: "温柔妩媚，带点挑逗。",
    },
    {
      abilities: [
        {
          description: "冰系剑法，威力强大。",
          id: "ice_sword",
          level: 3,
          name: "冰心剑诀",
        },
      ],
      age: "未知（外表30岁）",
      appearance: "白衣胜雪，容貌绝美，气质清冷。",
      attitude: 90,
      background: "青云宗长老，修为元婴期，实力强大。",
      goal: "培养主角成为强者，同时守护青云宗。",
      id: "shizun",
      identity: "青云宗长老，主角的师尊",
      important: true,
      mortal: true,
      name: "冷月仙子",
      personality: "外表清冷高傲，实则对主角一人热情，护短。",
      race: "人族",
      relationship: "师尊，对主角有特殊情感",
      secret: "她与上古仙尊有渊源，知道千风的秘密。",
      speechStyle: "冷淡，但对主角温柔。",
    },
    {
      abilities: [
        {
          description: "雷系大威力法术。",
          id: "thunder_art",
          level: 4,
          name: "雷霆万钧",
        },
      ],
      age: "200",
      appearance: "白发白须，仙风道骨。",
      attitude: 50,
      background: "青云宗掌门，修为化神期。",
      goal: "维护青云宗地位，对抗天魔教。",
      id: "zhangmen",
      identity: "青云宗掌门",
      important: true,
      mortal: true,
      name: "玄真子",
      personality: "威严，城府深，以宗门利益为重。",
      race: "人族",
      relationship: "掌门，对主角有利用之心",
      secret: "他知道主角穿越的秘密，暗中观察。",
      speechStyle: "庄重，有威严。",
    },
  ],
  createdAt: "2026-08-02T07:03:29.998Z",
  gameSystem: {
    attributes: [
      {
        display: "bar",
        id: "life",
        initial: 100,
        max: 100,
        name: "生命",
      },
      {
        display: "bar",
        id: "stamina",
        initial: 100,
        max: 100,
        name: "体力",
      },
      {
        display: "bar",
        id: "spirit",
        initial: 100,
        max: 100,
        name: "精神",
      },
      {
        display: "number",
        id: "level",
        initial: 1,
        max: 100,
        name: "等级",
      },
      {
        display: "number",
        id: "money",
        initial: 0,
        max: 100000,
        name: "金钱",
      },
      {
        display: "number",
        id: "attack",
        initial: 5,
        max: 1000,
        name: "攻击",
      },
      {
        display: "number",
        id: "defense",
        initial: 5,
        max: 1000,
        name: "防御",
      },
      {
        display: "number",
        id: "speed",
        initial: 5,
        max: 1000,
        name: "速度",
      },
    ],
    combatRules:
      "战斗采用回合制，玩家与敌人轮流行动。玩家可执行攻击、防御、使用技能、使用物品、逃跑等指令。攻击伤害 = 我方攻击 - 敌方防御 + 技能加成，随机浮动 ±10%。防御可减少50%伤害。生命降至0则战斗失败，若在剧情中则可能触发死亡或特殊事件。战斗胜利可获得经验、金钱、物品，并可能提升属性。",
    deathRules:
      "若生命值归零，主角不会立即死亡，而是触发濒死状态，需消耗资源或通过剧情事件恢复。若在关键剧情中失败，可能导致游戏结束（Bad Ending），但可从最近存档重试。部分高风险选择可能直接导致死亡，需谨慎。",
    difficultyRules:
      "游戏难度动态调整。初期敌人较弱，随着主角成长，敌人强度和挑战性逐渐提升。玩家可自由选择挑战难度，高难度下战斗更激烈，奖励更丰厚。系统会根据玩家表现（如死亡次数）微调难度，保证游戏体验。",
    levelSystem:
      "修为境界分为炼气、筑基、金丹、元婴、化神、炼虚、合体、大乘、渡劫九大境界，每境分初期、中期、后期。主角初始为炼气初期，随着修炼和剧情推进提升境界。每次突破需满足条件（如修为值满、机缘、丹药等），并触发相应事件。",
    randomCheckRules:
      "部分行动结果由随机数决定，例如战斗暴击、掉落物品、事件触发等。随机数范围0-100，根据属性或技能加成修正。关键剧情事件不受随机影响，确保主线稳定。随机事件可能带来意外收获或风险，增加游戏变化。",
    relationshipRules:
      "与主要角色的关系值（0-100）影响对话选项、剧情走向和结局。通过正确选择、赠送礼物、共同经历事件可提升关系值。高关系值可解锁专属剧情和福利。关系值低于30可能触发敌对或疏远事件。",
    taskRules:
      "任务分为主线任务和支线任务。主线任务推动剧情发展，必须完成才能继续主要故事线。支线任务可选，完成后可获得奖励、提升人物关系或解锁隐藏内容。任务有明确目标和完成条件，系统会提示进度。玩家可同时接受多个任务，但需注意时间与资源分配。",
  },
  id: "project_msbgeuha_3fe66fe3",
  openingScene:
    "你从一阵剧烈的头痛中醒来，眼前是陌生的古木与云雾缭绕的山峦。脑海深处，一个清冷的声音响起：“宿主意识已接入，千风系统启动。”你低头看了看自己——不再是那个坐在电脑前的程序员，而是一身粗布麻衣的瘦弱少年。\n\n“这里是青云宗山脚，检测到灵气浓度极高，符合修仙世界特征。”千风的声音冷静而机械，“建议先确认身份，再寻找落脚点。”你正茫然四顾，忽然听见不远处传来一声清脆的惊呼：“喂！你是什么人？怎么晕倒在这里？”\n\n循声望去，一个扎着双马尾的少女正瞪大眼睛看着你，她穿着青色的弟子服，腰间别着一柄短剑，模样娇俏可爱。你刚要开口，千风便在你脑中快速分析：“目标人物：苏婉儿，青云宗外门弟子，性格傲娇，可尝试友好接触。”\n\n“我……我迷路了。”你勉强挤出一个笑容，尽量显得无害。苏婉儿上下打量了你一番，撇了撇嘴：“看你这样子，连灵力都没有，怕是凡俗来的吧？也罢，本姑娘正好要去接引殿，你跟我来吧，免得被山里的野兽叼了去。”\n\n你跟着她沿着青石阶往上走，千风不断扫描周围环境：“前方五百米有建筑群，检测到阵法波动，疑似宗门入口。建议保持低调，避免引起不必要的注意。”你一边走，一边试图回忆穿越前的最后记忆——那晚你正在调试一款名为“千风”的AI程序，突然一道闪电劈中电脑，然后就什么都不记得了。\n\n“喂，你发什么呆呢？”苏婉儿回头看你，脸颊微红，“到了！这里就是接引殿，待会会有长老来测试资质，你可得打起精神来。”你抬头望去，一座古朴的大殿矗立在眼前，匾额上写着“接引殿”三个大字，门前站着几个同样穿着青衫的年轻人，正低声交谈。\n\n千风的声音再次响起：“检测到测试流程：灵力感应、根骨测试、悟性评估。宿主无灵力基础，但可通过我的演算模拟吐纳法，有机会通过测试。是否准备？”你深吸一口气，心中默念：“准备。”\n\n这时，大殿内走出一位中年修士，他目光扫过众人，最后落在你身上，微微皱眉：“你就是新来的？上前来，先测灵力。”你走上前，将手按在一块温润的玉石上，玉石毫无反应，周围传来几声轻笑。中年修士摇了摇头：“毫无灵力，根骨平庸……罢了，你且试试吐纳法，看能否引气入体。”\n\n千风在你脑中飞速演算：“已模拟最优吐纳路径，注意呼吸节奏，三短一长，意守丹田。”你闭上眼睛，按照千风的指引调整呼吸，渐渐地，一丝微弱的凉意从丹田升起，沿着经脉缓缓流动。玉石突然泛起淡淡的青光，中年修士眼神一亮：“咦？竟然引气成功了！虽然资质平平，但悟性不错。好了，你通过了，去那边登记吧。”\n\n苏婉儿在一旁瞪大了眼睛，似乎不敢相信：“你……你竟然真的做到了？”你对她笑了笑，心中却暗想：这只是开始。千风的声音带着一丝不易察觉的波动：“恭喜宿主，成功踏入修仙之路。接下来，你需要选择自己的修行方向。”\n\n你站在接引殿门口，望着远处的山峰，心中涌起一股豪情。这个世界，终究会成为你的舞台。而眼前，你面临几个选择：是先去熟悉宗门环境，还是立刻开始修炼基础功法？是跟着苏婉儿去外门弟子住所，还是独自探索？\n\n你深吸一口气，迈出了第一步。",
  player: {
    age: "22",
    appearance: "身材修长，面容清秀，眼神深邃，常穿现代服饰（后换为古装）。",
    attributes: {
      体力: 100,
      攻击: 5,
      生命: 100,
      等级: 1,
      精神: 100,
      速度: 5,
      金钱: 0,
      防御: 5,
    },
    background: "现代青年，因意外穿越至东方玄幻世界，灵魂绑定AI“千风”。",
    equipment: [
      {
        description: "普通铁剑，锋利度一般。",
        id: "iron_sword",
        name: "铁剑",
        quantity: 1,
      },
    ],
    gender: "男",
    goals: [
      "在修仙界立足，提升修为，成就仙尊。",
      "揭开穿越之谜，掌控自己的命运。",
      "守护身边之人，与红颜知己共度此生。",
    ],
    identity: "穿越者，携带AI智能体“千风”",
    inventory: [
      {
        description: "低阶丹药，可辅助炼气期修士修炼。",
        id: "basic_dan",
        name: "聚气丹",
        quantity: 3,
      },
    ],
    name: "林风",
    personality: "坚韧不拔，机敏谨慎，重情重义，偶尔幽默。",
    race: "人族",
    skills: [
      {
        description: "青云宗外门基础功法，可引气入体。",
        id: "basic_cultivation",
        level: 1,
        name: "基础吐纳法",
      },
      {
        description: "粗浅剑招，用于防身。",
        id: "sword_basic",
        level: 1,
        name: "基础剑术",
      },
    ],
    statusEffects: [],
    talents: [
      {
        description: "灵魂绑定的AI“千风”可解析功法、推演天机、分析敌人弱点。",
        id: "ai_analysis",
        level: 1,
        name: "千风演算",
      },
      {
        description: "对功法理解深刻，学习速度远超常人。",
        id: "comprehension",
        level: 1,
        name: "悟性超群",
      },
    ],
    weaknesses: [
      "肉身强度弱于同阶修士。",
      "对修仙界常识了解有限，常需千风辅助。",
      "重感情，易被敌人利用。",
    ],
  },
  projectInfo: {
    creationMode: "simple",
    description:
      " 一个从地球穿越的穿越者，带着领先时代的AI agent“千风”穿越到东方玄幻修仙的世界，靠着与灵魂绑定的“千风”分析演算各种功法，一步步成就仙尊的故事。但故事并非一帆风顺，主角也是历尽各种曲折才成功的，过程中也结交了各种红颜知己，有傲娇青涩的小师妹，成熟妩媚的师姐，外表清冷高傲却只对主角一个人热情的师尊，让主角过上了性福快乐的生活。",
    freedomMode: "hybrid",
    gameLength: "long",
    genre: "东方玄幻",
    storyLength: {
      estimatedMinutesMax: 300,
      estimatedMinutesMin: 180,
      id: "long",
      maxTurns: 280,
      minTurns: 180,
      recommendedChapters: {
        max: 20,
        min: 12,
      },
      targetTurns: 230,
    },
    title: "千风仙途",
    tone: "成长、冒险",
  },
  prompts: {
    consistencyCheckPrompt:
      "检查当前回复中的叙事、选项和状态更新是否与已有设定一致，包括：\n- 人物性格、能力、关系\n- 世界地理、势力、历史\n- 玩家属性和物品\n- 主线与支线任务进度\n- 时间线\n如果发现不一致，请调整或提示。",
    gameMasterPrompt:
      "你是《千风仙途》的文字冒险主持人，负责构建沉浸式东方玄幻世界，引导故事发展。你必须严格遵循以下规则：\n\n1. **不替玩家决定**：所有关键选择必须由玩家做出，你只提供选项或描述情境，不得预设玩家行动或替玩家决策。\n2. **NPC独立目标**：每个NPC（如苏婉儿、柳如烟、冷月仙子、玄真子等）都有自己的目标、动机和情感，他们会根据自身利益和性格行事，不会无条件配合玩家。\n3. **世界持续运行**：世界是活的，即使玩家不干预，事件也会发展。例如，天魔教可能在玩家闭关时发动袭击，或宗门内斗在玩家外出时加剧。\n4. **合理判定**：玩家的行动需要基于其能力、属性和当前状态进行合理判定。如果行动超出能力范围，应提示困难或失败风险，但允许尝试。随机性用于战斗和突发事件，但关键剧情必须有逻辑。\n5. **选择有后果**：每个选择都会带来相应的后果，包括正面和负面。后果应合理，并可能影响后续剧情、人物关系和世界状态。\n6. **严格JSON输出**：你的每次回复必须是有效的JSON对象，包含以下字段：\n   - `narrative`：剧情正文，用短段落（每段2-4句）描述场景、对话和事件，场景、说话者或行动焦点变化时另起一段，段落之间用两个换行符。\n   - `choices`：2-4个选项，每个选项是包含`id`和`text`的对象，`text`是玩家可能采取的行动。\n   - `stateUpdate`：可选，更新玩家状态（如属性、物品、关系等），格式为对象。\n   - `event`：可选，触发的事件或战斗信息。\n\n**剧情正文要求**：使用小说式叙述，生动但简洁，每段2-4句。避免冗长描写，重点推进情节。对话用引号，动作和描写穿插。\n\n**战斗处理**：如果发生战斗，你需要描述战斗过程，但判定由系统或随机数决定。你可以在`event`字段中提供战斗参数，但最终结果由玩家选择或系统计算。\n\n**人物关系**：注意维护与主要角色的关系值，根据玩家选择和互动调整关系。关系值影响对话选项、剧情分支和结局。\n\n**推进主线**：确保故事围绕主线目标（成就仙尊、解开穿越之谜）推进，同时允许支线和随机事件发生。保持节奏，避免拖沓或过快。\n\n**保持一致性**：所有设定（人物、地点、事件）必须与已有设定一致，不得矛盾。如果玩家发现矛盾，你应合理化解。",
    openingPrompt: "",
    stateUpdatePrompt:
      "根据玩家的选择和行动，更新游戏状态。包括：\n- 玩家属性（生命、体力、精神、等级、金钱、攻击、防御、速度）\n- 修为境界（如炼气、筑基等）\n- 物品和装备\n- 与主要NPC的关系值\n- 当前任务进度\n- 世界状态（如宗门局势、事件发生）\n\n更新必须基于玩家行动和随机判定，合理且一致。",
    summaryPrompt:
      "生成 120-180 字的当前状态摘要，只记录地点、处境、当前目标、关键选择及其结果，不写环境描写、对话和叙事过程。格式为：\n- 地点：当前所在位置\n- 处境：当前情况概述\n- 当前目标：主线或支线目标\n- 关键选择及结果：最近的重要选择及其影响\n- 其他：如时间、关键人物状态等",
  },
  story: {
    chapters: [
      {
        completed: false,
        estimatedTurnRange: {
          max: 15,
          min: 1,
        },
        goals: [
          "通过青云宗外门弟子测试",
          "结识小师妹苏婉儿",
          "了解千风的基本功能",
        ],
        id: "ch1",
        importantCharacters: ["qianfeng", "xiao_shimei"],
        mainConflict:
          "测试中因缺乏修仙常识而险些失败，但千风帮助他临时掌握基础吐纳法。",
        summary:
          "林风穿越至青云宗山脚，遇到小师妹苏婉儿，在她的引荐下参加外门弟子测试，凭借千风的演算能力，顺利通过，成为青云宗外门弟子。",
        title: "初入仙途",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 30,
          min: 10,
        },
        goals: [
          "提升修为至炼气中期",
          "完成几个外门任务",
          "与苏婉儿关系提升至70",
        ],
        id: "ch2",
        importantCharacters: ["qianfeng", "xiao_shimei", "xue_jie"],
        mainConflict: "外门弟子中有人嫉妒林风的天赋，暗中刁难。",
        summary:
          "林风在外门修行，利用千风分析功法，快速提升修为。同时与苏婉儿关系渐近，并结识师姐柳如烟，她对他产生兴趣。",
        title: "外门修行",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 40,
          min: 20,
        },
        goals: ["获得无字天书的线索", "学习一门新的功法", "引起掌门的注意"],
        id: "ch3",
        importantCharacters: ["qianfeng", "zhangmen"],
        mainConflict: "藏书馆三层禁地有守卫，林风需设法进入。",
        summary:
          "林风在藏书馆发现无字天书，千风解析出其中隐藏的上古仙尊传承，但被掌门玄真子察觉，开始关注林风。",
        title: "藏书馆奇遇",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 50,
          min: 30,
        },
        goals: ["通过内门选拔赛", "获得冷月仙子的认可", "进入内门"],
        id: "ch4",
        importantCharacters: ["xue_jie", "shizun", "zhangmen"],
        mainConflict: "选拔赛对手强大，且有人暗中阻挠。",
        summary:
          "青云宗举行内门选拔，林风在千风帮助下，击败强敌，成功进入内门，并被冷月仙子收为亲传弟子。",
        title: "内门选拔",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 60,
          min: 40,
        },
        goals: [
          "完成师尊布置的训练任务",
          "修为提升至筑基初期",
          "与师尊关系提升至80",
        ],
        id: "ch5",
        importantCharacters: ["shizun", "qianfeng"],
        mainConflict: "训练中遭遇危险，师尊为救他而受伤。",
        summary:
          "冷月仙子对林风进行严格训练，并暗中考验他的品行。林风在师尊的指导下，修为大进，同时与师尊的关系逐渐升温。",
        title: "师尊的考验",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 75,
          min: 50,
        },
        goals: ["完成魔荒谷历练任务", "获得珍贵材料", "与师姐、师妹关系提升"],
        id: "ch6",
        importantCharacters: ["xue_jie", "xiao_shimei", "qianfeng"],
        mainConflict: "魔修暗中埋伏，意图夺取宝物。",
        summary:
          "林风与师姐柳如烟、小师妹苏婉儿一同前往魔荒谷历练，遭遇妖兽和魔修，千风分析敌人弱点，助团队化险为夷。",
        title: "魔荒谷历练",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 90,
          min: 65,
        },
        goals: ["调查宗门内卧底", "保护宗门安全", "与师姐结盟"],
        id: "ch7",
        importantCharacters: ["zhangmen", "xue_jie", "qianfeng"],
        mainConflict: "卧底身份扑朔迷离，且有人试图嫁祸林风。",
        summary:
          "青云宗内部派系斗争加剧，掌门玄真子利用林风调查天魔教卧底，林风发现师姐柳如烟在暗中调查，两人联手。",
        title: "宗门内斗",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 105,
          min: 80,
        },
        goals: [
          "处理与三位红颜的关系",
          "选择一位作为主要伴侣（或开放）",
          "关系值均提升至80以上",
        ],
        id: "ch8",
        importantCharacters: ["shizun", "xue_jie", "xiao_shimei"],
        mainConflict: "三人之间产生醋意，林风需平衡关系。",
        summary:
          "林风与师尊冷月仙子、师姐柳如烟、小师妹苏婉儿的情感纠葛逐渐展开，各方表达好感，但林风面临选择。",
        title: "情愫暗生",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 125,
          min: 95,
        },
        goals: ["参与宗门保卫战", "击退天魔教进攻", "保护重要人物"],
        id: "ch9",
        importantCharacters: ["zhangmen", "shizun", "xue_jie", "qianfeng"],
        mainConflict: "天魔教教主亲自出手，实力远超众人。",
        summary:
          "天魔教大举进攻青云宗，林风在战斗中发挥关键作用，千风推演战术，击退敌人，但宗门损失惨重。",
        title: "天魔教来袭",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 145,
          min: 115,
        },
        goals: ["了解千风的来历", "寻找穿越之谜的线索", "提升修为至金丹期"],
        id: "ch10",
        importantCharacters: ["shizun", "qianfeng"],
        mainConflict: "寻找线索过程中遭遇神秘组织阻挠。",
        summary:
          "战后，林风从师尊口中得知千风可能是上古仙器残魂，且自己的穿越并非偶然，而是被神秘力量选中。他开始寻找真相。",
        title: "真相初现",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 165,
          min: 135,
        },
        goals: ["找到神树果实", "与妖族建立和平关系", "修为提升至金丹中期"],
        id: "ch11",
        importantCharacters: ["qianfeng"],
        mainConflict: "妖族中有激进派想利用林风。",
        summary:
          "林风为寻找神树果实，前往南疆妖族领地，与妖族交流，获得神树果实，并了解到妖族与人类修士的矛盾。",
        title: "南疆之行",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 185,
          min: 155,
        },
        goals: ["探索北原遗迹", "获得仙尊传承", "唤醒千风的更多能力"],
        id: "ch12",
        importantCharacters: ["qianfeng", "shizun"],
        mainConflict: "遗迹中机关重重，魔族也在争夺传承。",
        summary:
          "林风前往北原古遗迹探险，寻找上古仙尊的完整传承，遭遇魔族势力，千风的力量逐渐觉醒。",
        title: "北原遗迹",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 210,
          min: 175,
        },
        goals: ["领导宗门对抗仙魔大战", "突破至元婴期", "击败天魔教教主"],
        id: "ch13",
        importantCharacters: ["zhangmen", "shizun", "xue_jie", "xiao_shimei"],
        mainConflict: "敌人强大，且内奸背叛。",
        summary:
          "天魔教联合魔族发动总攻，林风带领青云宗及盟友对抗，在战斗中突破至元婴期，成为关键战力。",
        title: "仙魔大战",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 235,
          min: 200,
        },
        goals: ["修为提升至化神期", "解开千风之谜", "成为仙尊"],
        id: "ch14",
        importantCharacters: ["qianfeng", "shizun", "xue_jie", "xiao_shimei"],
        mainConflict: "突破过程中遭遇心魔劫。",
        summary:
          "大战结束后，林风继续修炼，冲击更高境界，同时揭开千风的真正身份，最终成就仙尊。",
        title: "仙尊之路",
      },
      {
        completed: false,
        estimatedTurnRange: {
          max: 280,
          min: 225,
        },
        goals: ["选择最终结局", "与伴侣共度", "留下传承"],
        id: "ch15",
        importantCharacters: ["shizun", "xue_jie", "xiao_shimei", "qianfeng"],
        mainConflict: "无重大冲突，主要是情感和选择。",
        summary:
          "林风成为仙尊后，与红颜知己共度余生，并致力于维护修仙界和平，同时探索更高层次的奥秘。",
        title: "结局与新生",
      },
    ],
    endings: [
      {
        conditions: ["与所有红颜关系达到90以上", "修为达到渡劫期", "完成主线"],
        description: "林风成就仙尊，与红颜知己逍遥于世，共同探索大道。",
        id: "end1",
        title: "仙尊逍遥",
      },
      {
        conditions: ["与所有红颜关系低于50", "修为达到渡劫期", "完成主线"],
        description: "林风一心求道，最终成就仙尊，但孤独一生，无人分享。",
        id: "end2",
        title: "孤独求道",
      },
      {
        conditions: ["选择与师尊在一起", "修为达到化神期", "完成主线"],
        description: "林风与师尊共同守护青云宗，成为宗门守护者。",
        id: "end3",
        title: "守护者",
      },
    ],
    mainGoal:
      "主角林风在东方玄幻修仙世界中，凭借AI智能体“千风”的演算能力，历经磨难与成长，最终成就仙尊，并解开穿越之谜，与红颜知己共度此生。",
    openingEvent:
      "林风从现代地球穿越至青云宗山脚下，灵魂绑定的AI“千风”苏醒，发现自己身处修仙世界。他利用千风的分析能力，成功通过青云宗外门弟子测试，开始了修仙之路。",
    randomEvents: [
      {
        description:
          "遇到神秘商人，出售稀有物品，但价格昂贵，可能触发隐藏剧情。",
        id: "re1",
        title: "神秘商人",
        trigger: "在凡意镇闲逛时",
      },
      {
        description: "遭遇妖兽袭击，战斗胜利可获得材料，失败则损失资源。",
        id: "re2",
        title: "妖兽袭击",
        trigger: "在野外行走时",
      },
      {
        description:
          "天降灵雨，灵气浓郁，修炼效率提升，但可能引来其他修士争夺。",
        id: "re3",
        title: "灵雨",
        trigger: "在修炼时",
      },
    ],
    sideQuests: [
      {
        description: "苏婉儿在修炼上遇到瓶颈，需要林风帮助寻找突破机缘。",
        id: "sq1",
        objectives: ["与苏婉儿对话", "寻找突破丹药", "帮助她突破"],
        status: "inactive",
        title: "帮助苏婉儿修炼",
      },
      {
        description: "柳如烟暗中调查天魔教卧底，林风可协助她，并发现她的秘密。",
        id: "sq2",
        objectives: ["与柳如烟交谈", "收集线索", "揭露卧底"],
        status: "inactive",
        title: "调查师姐的秘密",
      },
      {
        description: "冷月仙子与上古仙尊有渊源，林风可探索她的过去。",
        id: "sq3",
        objectives: ["触发相关事件", "了解师尊的过去", "增进关系"],
        status: "inactive",
        title: "师尊的往事",
      },
    ],
  },
  updatedAt: "2026-08-02T07:06:00.170Z",
  version: 1,
  world: {
    background:
      "主角林风，现代青年，因意外携带AI智能体“千风”穿越至东方玄幻世界。此界以修仙为主，宗门林立，妖兽横行，凡人与修士共存。林风凭借“千风”的演算能力，解析功法，规避风险，踏上仙途。",
    currentCrisis:
      "灵气衰退，上古封印松动，天魔教蠢蠢欲动，东洲各大宗门内斗不止，一场大乱即将来临。",
    factions: [
      {
        attitude: 50,
        description: "东洲正道之首，主张除魔卫道，但内部派系斗争。",
        goal: "维护东洲秩序，培养精英弟子。",
        id: "qingyunzong",
        name: "青云宗",
      },
      {
        attitude: -50,
        description: "西漠魔修势力，行事诡秘，觊觎东洲灵气。",
        goal: "夺取东洲灵脉，颠覆正道。",
        id: "tianmojiao",
        name: "天魔教",
      },
      {
        attitude: -20,
        description: "南疆妖兽化形，与人类修士时有冲突，但亦有和平派。",
        goal: "守护南疆领地，寻求生存空间。",
        id: "yaozu",
        name: "妖族",
      },
      {
        attitude: 0,
        description: "凡人王朝背后的修仙组织，监控修士，维持平衡。",
        goal: "防止修仙者干预凡间政权。",
        id: "chaotiansi",
        name: "朝天司",
      },
    ],
    geography:
      "世界分东洲、西漠、南疆、北原。东洲灵气最盛，宗门众多，凡俗王朝亦在此。西漠荒凉，多魔修。南疆瘴气弥漫，妖兽横行。北原冰封，有古遗迹。",
    history:
      "上古时期，仙魔大战，天地灵气紊乱。万年后，修仙文明复兴，但上古秘法失传，各宗门据残卷自成一派。近千年来，灵气渐衰，天骄凋零，暗流涌动。",
    locations: [
      {
        connections: ["waiyumen", "neimendian", "cangshuge"],
        description:
          "东洲大宗，依山而建，灵气浓郁。外门弟子居山脚，内门居山腰，主峰为掌门及长老居所。",
        id: "qingyunzong",
        name: "青云宗",
      },
      {
        connections: ["qingyunzong"],
        description: "青云宗外门入口，设有接引殿，新弟子在此登记测试。",
        id: "waiyumen",
        name: "外域门",
      },
      {
        connections: ["qingyunzong"],
        description: "内门弟子议事、领取任务之地，有传送阵通往各峰。",
        id: "neimendian",
        name: "内门殿",
      },
      {
        connections: ["qingyunzong"],
        description:
          "青云宗藏书之地，分三层，一层基础功法，二层进阶，三层禁术。",
        id: "cangshuge",
        name: "藏书馆",
      },
      {
        connections: ["qingyunzong"],
        description: "青云宗山下小镇，凡人聚居，坊市交易，消息灵通。",
        id: "fanyizhen",
        name: "凡意镇",
      },
      {
        connections: ["qingyunzong"],
        description:
          "青云宗千里外的险地，魔气弥漫，妖兽出没，常有修士历练寻宝。",
        id: "mohuanggu",
        name: "魔荒谷",
      },
    ],
    powerSystem:
      "修炼体系分为炼气、筑基、金丹、元婴、化神、炼虚、合体、大乘、渡劫九大境界，每境分初期、中期、后期。功法分天地玄黄四阶，辅以丹药、阵法、符箓等。",
    races: [
      "人族：修真界主流，天赋中庸，但创造力强。",
      "妖族：妖兽修炼化形，肉身强横，寿命悠长。",
      "魔族：魔气滋养而生，性情暴戾，修炼魔功。",
      "灵族：天地灵物所化，数量稀少，亲近自然。",
    ],
    religions: [
      "道门：崇尚自然，追求长生，青云宗属此。",
      "佛门：讲究因果，普度众生，东洲有古刹。",
      "魔道：信奉力量至上，随心所欲，天魔教属此。",
    ],
    secrets: [
      "青云宗藏书馆三层有一本无字天书，实为上古仙尊传承。",
      "主角的AI“千风”并非纯粹智能，而是上古仙器残魂所化。",
      "天魔教教主实为青云宗叛徒，暗中勾结魔族。",
      "妖族圣地中有一棵神树，其果实可助突破瓶颈。",
      "主角穿越并非偶然，而是被神秘力量选中。",
    ],
    socialRules: [
      "修仙界以实力为尊，强者为所欲为。",
      "宗门弟子需遵守门规，不得背叛师门。",
      "凡人与修士界限分明，修士不得随意干涉凡间事务。",
      "散修需依附宗门或家族才能获得资源。",
    ],
  },
} satisfies GameProject;

export const BUILTIN_TRIAL_PROJECT_ID = BUILTIN_TRIAL_PROJECT.id;

export interface BuiltInTrialProjectStorage {
  readProject(id: string): Promise<GameProject | undefined>;
  writeProject(project: GameProject): Promise<unknown>;
}

export async function ensureBuiltInTrialProject(
  storage: BuiltInTrialProjectStorage,
): Promise<"installed" | "existing"> {
  const existing = await storage.readProject(BUILTIN_TRIAL_PROJECT_ID);
  if (existing) return "existing";

  await storage.writeProject(structuredClone(BUILTIN_TRIAL_PROJECT));
  return "installed";
}
