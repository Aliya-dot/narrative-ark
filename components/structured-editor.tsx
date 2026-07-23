"use client";

import { Plus, Trash2 } from "lucide-react";
import { STORY_LENGTH_PRESETS } from "@/lib/story-length";

type StructuredValue =
  | string
  | number
  | boolean
  | null
  | StructuredValue[]
  | { [key: string]: StructuredValue };

const fieldLabels: Record<string, string> = {
  title: "名称",
  description: "简介",
  genre: "题材",
  tone: "整体风格",
  creationMode: "创作模式",
  freedomMode: "剧情自由度",
  gameLength: "游戏篇幅",
  background: "背景",
  history: "历史",
  geography: "地理环境",
  locations: "地点",
  factions: "势力",
  races: "种族",
  religions: "信仰与宗教",
  socialRules: "社会规则",
  powerSystem: "能力体系",
  currentCrisis: "当前危机",
  secrets: "隐藏秘密",
  name: "姓名",
  gender: "性别",
  age: "年龄",
  race: "种族",
  identity: "身份",
  personality: "性格",
  appearance: "外观",
  goals: "目标",
  talents: "天赋能力",
  skills: "技能",
  weaknesses: "弱点",
  attributes: "属性",
  inventory: "物品",
  equipment: "装备",
  statusEffects: "状态效果",
  relationship: "与主角的关系",
  attitude: "初始态度",
  goal: "个人目标",
  secret: "秘密",
  speechStyle: "说话风格",
  important: "重要角色",
  mortal: "可能死亡",
  abilities: "能力",
  level: "等级",
  quantity: "数量",
  duration: "持续回合",
  connections: "相连地点",
  levelSystem: "等级系统",
  combatRules: "战斗规则",
  taskRules: "任务规则",
  relationshipRules: "关系规则",
  deathRules: "失败与死亡规则",
  difficultyRules: "难度规则",
  randomCheckRules: "随机判定规则",
  initial: "初始值",
  max: "最大值",
  display: "显示方式",
  mainGoal: "主线目标",
  openingEvent: "开场事件",
  chapters: "章节规划",
  sideQuests: "支线任务",
  randomEvents: "随机事件",
  endings: "结局",
  summary: "摘要",
  mainConflict: "核心冲突",
  importantCharacters: "重要角色",
  estimatedTurnRange: "预计回合范围",
  min: "起始回合",
  completed: "已完成",
  objectives: "任务目标",
  status: "状态",
  trigger: "触发条件",
  conditions: "达成条件",
  gameMasterPrompt: "主持人提示词",
  openingPrompt: "开场生成提示词",
  stateUpdatePrompt: "状态更新提示词",
  summaryPrompt: "剧情摘要提示词",
  consistencyCheckPrompt: "一致性检查提示词",
};

const longTextKeys = new Set([
  "description",
  "background",
  "history",
  "geography",
  "powerSystem",
  "currentCrisis",
  "personality",
  "appearance",
  "goal",
  "secret",
  "speechStyle",
  "levelSystem",
  "combatRules",
  "taskRules",
  "relationshipRules",
  "deathRules",
  "difficultyRules",
  "randomCheckRules",
  "mainGoal",
  "openingEvent",
  "summary",
  "trigger",
  "gameMasterPrompt",
  "openingPrompt",
  "stateUpdatePrompt",
  "summaryPrompt",
  "consistencyCheckPrompt",
]);

const selectOptions: Record<string, { value: string; label: string }[]> = {
  creationMode: [
    { value: "simple", label: "简单模式" },
    { value: "advanced", label: "专业模式" },
  ],
  freedomMode: [
    { value: "linear", label: "强主线" },
    { value: "hybrid", label: "主线 + 自由探索" },
    { value: "open", label: "开放世界" },
  ],
  gameLength: [
    ...Object.values(STORY_LENGTH_PRESETS).map((preset) => ({
      value: preset.id,
      label: preset.optionLabel,
    })),
  ],
  display: [
    { value: "number", label: "数字" },
    { value: "bar", label: "进度条" },
  ],
  status: [
    { value: "inactive", label: "未激活" },
    { value: "active", label: "进行中" },
    { value: "completed", label: "已完成" },
    { value: "failed", label: "已失败" },
  ],
};

const templates: Record<string, StructuredValue> = {
  "world.locations": {
    id: "",
    name: "",
    description: "",
    connections: [],
  },
  "world.factions": {
    id: "",
    name: "",
    description: "",
    attitude: 0,
    goal: "",
  },
  "player.talents": { id: "", name: "", description: "", level: 1 },
  "player.skills": { id: "", name: "", description: "", level: 1 },
  "player.inventory": { id: "", name: "", description: "", quantity: 1 },
  "player.equipment": { id: "", name: "", description: "", quantity: 1 },
  "player.statusEffects": { id: "", name: "", description: "" },
  characters: {
    id: "",
    name: "",
    identity: "",
    age: "",
    race: "",
    personality: "",
    appearance: "",
    background: "",
    abilities: [],
    relationship: "",
    attitude: 0,
    goal: "",
    secret: "",
    speechStyle: "",
    important: true,
    mortal: true,
  },
  "characters.abilities": {
    id: "",
    name: "",
    description: "",
    level: 1,
  },
  "gameSystem.attributes": {
    id: "",
    name: "",
    initial: 0,
    max: 100,
    display: "bar",
  },
  "story.chapters": {
    id: "",
    title: "",
    summary: "",
    goals: [],
    mainConflict: "",
    importantCharacters: [],
    estimatedTurnRange: { min: 1, max: 10 },
    completed: false,
  },
  "story.sideQuests": {
    id: "",
    title: "",
    description: "",
    status: "inactive",
    objectives: [],
  },
  "story.randomEvents": {
    id: "",
    title: "",
    trigger: "",
    description: "",
  },
  "story.endings": { id: "", title: "", conditions: [], description: "" },
};

function labelFor(key: string) {
  if (key === "id") return "内部 ID";
  return fieldLabels[key] ?? key;
}

function normalizedPath(path: string[]) {
  return path.filter((part) => !/^\d+$/.test(part)).join(".");
}

function createId() {
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function newItem(path: string[], current: StructuredValue[]) {
  const normalized = normalizedPath(path);
  const source = templates[normalized] ?? current[0] ?? "";
  return blankClone(source);
}

function blankClone(value: StructuredValue): StructuredValue {
  if (Array.isArray(value)) return [];
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        key === "id" ? createId() : blankClone(child),
      ]),
    );
  if (typeof value === "number") return value === 1 ? 1 : 0;
  if (typeof value === "boolean") return value;
  return "";
}

function itemTitle(value: StructuredValue, index: number) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const named = value.name || value.title;
    if (typeof named === "string" && named.trim()) return named;
  }
  return `第 ${index + 1} 项`;
}

export function StructuredEditor({
  value,
  rootKey,
  onChange,
}: {
  value: unknown;
  rootKey: string;
  onChange: (value: unknown) => void;
}) {
  return (
    <div className="space-y-5">
      <ValueEditor
        value={value as StructuredValue}
        path={[rootKey]}
        fieldKey={rootKey}
        onChange={onChange}
        root
      />
    </div>
  );
}

function ValueEditor({
  value,
  path,
  fieldKey,
  onChange,
  root = false,
}: {
  value: StructuredValue;
  path: string[];
  fieldKey: string;
  onChange: (value: StructuredValue) => void;
  root?: boolean;
}) {
  if (Array.isArray(value)) {
    const objectItems = value.some(
      (item) => item !== null && typeof item === "object",
    );
    return (
      <section className={root ? "" : "md:col-span-2"}>
        {!root && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <label className="label">{labelFor(fieldKey)}</label>
            <span className="mono muted text-[10px]">{value.length} 项</span>
          </div>
        )}
        <div className="space-y-3">
          {value.map((item, index) => (
            <div
              className={
                objectItems
                  ? "rounded-xl bg-[var(--panel2)] p-4 md:p-5"
                  : "flex items-center gap-2"
              }
              key={`${path.join(".")}-${index}`}
            >
              {objectItems && (
                <div className="mb-4 flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3">
                  <p className="display text-base">{itemTitle(item, index)}</p>
                  <button
                    className="btn btn-danger icon-btn"
                    type="button"
                    aria-label={`删除${labelFor(fieldKey)} ${index + 1}`}
                    onClick={() =>
                      onChange(value.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
              <div className={objectItems ? "" : "min-w-0 flex-1"}>
                <ValueEditor
                  value={item}
                  path={[...path, String(index)]}
                  fieldKey={fieldKey}
                  onChange={(next) =>
                    onChange(value.map((old, i) => (i === index ? next : old)))
                  }
                  root={objectItems}
                />
              </div>
              {!objectItems && (
                <button
                  className="btn btn-danger icon-btn shrink-0"
                  type="button"
                  aria-label={`删除${labelFor(fieldKey)} ${index + 1}`}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
          {value.length === 0 && (
            <div className="rounded-lg border border-dashed border-[var(--line)] px-4 py-5 text-center text-sm muted">
              暂无{labelFor(fieldKey)}，需要时可以添加
            </div>
          )}
          <button
            className="btn w-full border-dashed bg-transparent text-sm"
            type="button"
            onClick={() => onChange([...value, newItem(path, value)])}
          >
            <Plus size={15} />
            添加{labelFor(fieldKey)}
          </button>
        </div>
      </section>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    return (
      <div
        className={
          root ? "grid gap-5 md:grid-cols-2" : "grid gap-4 md:grid-cols-2"
        }
      >
        {entries.map(([key, child]) => {
          if (key === "id" || key === "storyLength") return null;
          const structural = child !== null && typeof child === "object";
          return (
            <div
              className={structural ? "md:col-span-2" : ""}
              key={`${path.join(".")}.${key}`}
            >
              <ValueEditor
                value={child}
                path={[...path, key]}
                fieldKey={key}
                onChange={(next) => onChange({ ...value, [key]: next })}
              />
            </div>
          );
        })}
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <label className="flex min-h-12 items-center justify-between gap-4 rounded-lg border border-[var(--line)] px-4 py-3 text-sm">
        <span>{labelFor(fieldKey)}</span>
        <input
          type="checkbox"
          checked={value}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    );
  }

  if (typeof value === "number") {
    return (
      <div className="field">
        <label>{labelFor(fieldKey)}</label>
        <input
          className="input"
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
    );
  }

  const options = selectOptions[fieldKey];
  const longText =
    longTextKeys.has(fieldKey) || String(value ?? "").length > 90;
  return (
    <div className="field">
      <label>{labelFor(fieldKey)}</label>
      {options ? (
        <select
          className="input"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : longText ? (
        <textarea
          className="input min-h-28 resize-y leading-7"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          className="input"
          value={String(value ?? "")}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
