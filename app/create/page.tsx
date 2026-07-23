"use client";
import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Library,
  Lock,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  UserRound,
  UsersRound,
  Unlock,
} from "lucide-react";
import { db, uid } from "@/lib/db";
import type { GenerationDraft, WorldBook } from "@/lib/types";
import type {
  AIConfig,
  CreationDraftMeta,
  SupportingCharacterDraft,
} from "@/lib/types";
import { toast } from "sonner";
import {
  getStoryLengthPreset,
  STORY_LENGTH_PRESETS,
  storyLengthMeta,
} from "@/lib/story-length";
import {
  buildCreationAiContext,
  countCreationFields,
  detectCreationConflicts,
  emptyCreationMeta,
  fieldsForStep,
  findCreationField,
  normalizeCreationWorkspace,
  readDraftField,
  resolveIdeaCandidateFields,
  sanitizePageFields,
  snapshotCreationStep,
} from "@/lib/creation-ai";
import {
  generateCreationField,
  generateCreationIdeas,
  generateCreationPage,
} from "@/lib/ai-client";
import {
  CreationIdeasDialog,
  CreationPageAiBar,
  FieldAiActions,
  type CreationIdeaCandidate,
} from "@/components/creation-ai-tools";
import { bindingForWorldBook, WORLD_BOOK_BUDGETS } from "@/lib/world-book";
const schema = z.object({
  title: z.string(),
  idea: z.string().min(8, "至少写 8 个字，让 AI 理解你的想法"),
  genre: z.string(),
  protagonist: z.string().min(2, "请描述主角"),
  tone: z.string(),
  freedomMode: z.enum(["linear", "hybrid", "open"]),
  gameLength: z.enum(["short", "standard", "long", "endless"]),
  numericSystem: z.boolean(),
  creationMode: z.enum(["simple", "advanced"]),
  advanced: z.record(z.string(), z.string()).optional(),
  supportingCharacters: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        identity: z.string(),
        relationship: z.string(),
        appearance: z.string(),
        personality: z.string(),
        goal: z.string(),
        specialAbility: z.string(),
        secret: z.string(),
      }),
    )
    .optional(),
  worldBinding: z
    .object({
      worldBookId: z.string(),
      worldBookVersionId: z.string(),
      worldBookVersionNumber: z.number(),
      scenarioId: z.string().optional(),
      contextBudget: z.object({
        mode: z.enum(["compact", "balanced", "detailed", "custom"]),
        maxTokens: z.number(),
        maxEntries: z.number().optional(),
      }),
    })
    .optional(),
  worldBookPreview: z
    .object({ name: z.string(), coreSummary: z.string() })
    .optional(),
});
const steps = [
  "基础信息",
  "世界观",
  "主角",
  "角色与势力",
  "数值能力",
  "剧情结构",
  "游玩规则",
];
const stepDescriptions = [
  "确定作品定位、题材和整体游玩方向",
  "定义世界背景、历史、环境与正在发生的危机",
  "建立可被 AI 严格遵循的完整主角档案",
  "添加重要配角，并定义世界中的主要势力",
  "设计属性、成长方式与力量运行规则",
  "规划主线目标、开场、转折和结局条件",
  "调整叙事长度、难度以及失败与死亡规则",
];
export default function Create() {
  const router = useRouter();
  const [mode, setMode] = useState<"simple" | "advanced" | null>(null);
  const [step, setStep] = useState(0);
  const [config, setConfig] = useState<AIConfig>();
  const [worldBooks, setWorldBooks] = useState<WorldBook[]>([]);
  const [meta, setMeta] = useState<CreationDraftMeta>(emptyCreationMeta);
  const metaRef = useRef(meta);
  const loaded = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const [busyField, setBusyField] = useState<string>();
  const [pageBusy, setPageBusy] = useState<"page" | "ideas" | null>(null);
  const [pageStatus, setPageStatus] = useState("");
  const [ideas, setIdeas] = useState<CreationIdeaCandidate[]>([]);
  const [ideasTarget, setIdeasTarget] = useState<string>();
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [generateConfirm, setGenerateConfirm] = useState<GenerationDraft>();
  const [characterRole, setCharacterRole] = useState("随机");
  const [characterRelation, setCharacterRelation] = useState("随机");
  const [characterPlotLink, setCharacterPlotLink] = useState("强");
  const [characterAbility, setCharacterAbility] = useState(true);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    reset,
    control,
    formState: { errors },
  } = useForm<GenerationDraft>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      idea: "",
      genre: "西方玄幻",
      protagonist: "现代青年",
      tone: "成长、冒险",
      freedomMode: "hybrid",
      gameLength: "standard",
      numericSystem: true,
      creationMode: "simple",
      advanced: {},
      supportingCharacters: [],
    },
  });
  const {
    fields: supportingCharacters,
    append: appendSupportingCharacter,
    remove: removeSupportingCharacter,
    replace: replaceSupportingCharacters,
  } = useFieldArray({
    control,
    name: "supportingCharacters",
    keyName: "_key",
  });
  const liveDraft = watch();
  const selectedLength = getStoryLengthPreset(liveDraft.gameLength);
  const selectedLengthMeta = storyLengthMeta(selectedLength.id);
  const selectedWorldBook = worldBooks.find(
    (book) => book.id === liveDraft.worldBinding?.worldBookId,
  );
  useEffect(() => {
    Promise.all([
      db.drafts.get("creation"),
      db.configs.get("active"),
      db.worldBooks.orderBy("updatedAt").reverse().toArray(),
    ]).then(([draftRecord, activeConfig, storedWorldBooks]) => {
      setConfig(activeConfig);
      setWorldBooks(
        storedWorldBooks.filter((book) => book.status !== "archived"),
      );
      const workspace = normalizeCreationWorkspace(draftRecord?.value);
      if (workspace) {
        reset(workspace.form);
        setMode(workspace.form.creationMode);
        setStep(workspace.meta.step || 0);
        setMeta(workspace.meta);
        metaRef.current = workspace.meta;
        toast.success("已恢复上次未完成的创建草稿");
      }
      const requestedWorldBookId = new URLSearchParams(
        window.location.search,
      ).get("worldBook");
      const requestedWorldBook = storedWorldBooks.find(
        (book) =>
          book.id === requestedWorldBookId && book.status !== "archived",
      );
      if (requestedWorldBook) {
        const requestedMode = workspace?.form.creationMode || "simple";
        setMode(requestedMode);
        setValue("creationMode", requestedMode);
        setValue("worldBinding", bindingForWorldBook(requestedWorldBook));
        setValue("worldBookPreview", {
          name: requestedWorldBook.name,
          coreSummary: requestedWorldBook.coreSummary,
        });
      }
      loaded.current = true;
    });
  }, [reset, setValue]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sub = watch((value) => {
      if (!loaded.current) return;
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          db.drafts.put({
            id: "creation",
            value: {
              kind: "creation-workspace-v1",
              form: value,
              meta: metaRef.current,
            },
            updatedAt: new Date().toISOString(),
          }),
        250,
      );
    });
    return () => {
      clearTimeout(timer);
      sub.unsubscribe();
    };
  }, [watch]);

  function updateMeta(
    updater: (current: CreationDraftMeta) => CreationDraftMeta,
  ) {
    setMeta((current) => {
      const next = updater(current);
      metaRef.current = next;
      if (loaded.current) {
        void db.drafts.put({
          id: "creation",
          value: {
            kind: "creation-workspace-v1",
            form: getValues(),
            meta: next,
          },
          updatedAt: new Date().toISOString(),
        });
      }
      return next;
    });
  }
  function choose(m: "simple" | "advanced", worldBook?: WorldBook) {
    setMode(m);
    setValue("creationMode", m);
    setValue(
      "worldBinding",
      worldBook ? bindingForWorldBook(worldBook) : undefined,
    );
    setValue(
      "worldBookPreview",
      worldBook
        ? { name: worldBook.name, coreSummary: worldBook.coreSummary }
        : undefined,
    );
  }
  function setDraftField(path: string, value: string) {
    setValue(path as never, value as never, { shouldDirty: true });
  }
  function toggleFieldLock(path: string) {
    updateMeta((current) => ({
      ...current,
      lockedFields: current.lockedFields.includes(path)
        ? current.lockedFields.filter((field) => field !== path)
        : [...current.lockedFields, path],
    }));
  }
  function markAiDraft(path: string, before: string) {
    updateMeta((current) => ({
      ...current,
      aiDraftFields: [...new Set([...current.aiDraftFields, path])],
      fieldUndo: { ...current.fieldUndo, [path]: before },
    }));
  }
  function undoField(path: string) {
    if (!(path in meta.fieldUndo)) return;
    setDraftField(path, meta.fieldUndo[path]);
    updateMeta((current) => {
      const fieldUndo = { ...current.fieldUndo };
      delete fieldUndo[path];
      return {
        ...current,
        fieldUndo,
        aiDraftFields: current.aiDraftFields.filter((field) => field !== path),
      };
    });
  }
  function cancelAiRequest() {
    requestController.current?.abort();
  }
  async function runFieldAi(
    path: string,
    operation: "generate" | "expand" | "simplify" | "rewrite",
  ) {
    const definition = findCreationField(path);
    if (
      !definition ||
      !config ||
      config.connectionFailedAt ||
      busyField ||
      meta.lockedFields.includes(path)
    )
      return;
    if (definition.candidateOnly || operation === "rewrite") {
      if (definition.candidateOnly) {
        await requestIdeas(path);
        return;
      }
    }
    const before = readDraftField(getValues(), path);
    requestController.current = new AbortController();
    setBusyField(path);
    try {
      const result = await generateCreationField(
        config,
        {
          fieldKey: path,
          operation,
          currentValue: before,
          context: buildCreationAiContext(getValues(), step, path),
          lockedFields: meta.lockedFields,
        },
        requestController.current.signal,
      );
      if (!result.value) throw new Error("模型没有返回可用内容");
      markAiDraft(path, before);
      setDraftField(path, result.value);
      toast.success("AI 草稿已写入，可继续修改或恢复");
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        toast.error(
          error instanceof Error ? error.message : "生成失败，原内容未修改",
        );
    } finally {
      setBusyField(undefined);
      requestController.current = null;
    }
  }
  async function completeCurrentPage() {
    if (!config || config.connectionFailedAt || pageBusy) return;
    const draft = getValues();
    const definitions = fieldsForStep(step, draft.numericSystem).filter(
      (definition) =>
        mode === "advanced" || !definition.fieldKey.startsWith("advanced."),
    );
    const currentFields = Object.fromEntries(
      definitions.map((definition) => [
        definition.fieldKey,
        readDraftField(draft, definition.fieldKey),
      ]),
    );
    const before = snapshotCreationStep(draft, step);
    requestController.current = new AbortController();
    setPageBusy("page");
    setPageStatus("");
    try {
      const result = await generateCreationPage(
        config,
        {
          step,
          context: buildCreationAiContext(draft, step),
          currentFields,
          lockedFields: meta.lockedFields,
          optimizeExisting: meta.optimizeExisting,
        },
        requestController.current.signal,
      );
      const visibleKeys = new Set(
        definitions.map((definition) => definition.fieldKey),
      );
      const safeFields = Object.fromEntries(
        Object.entries(
          sanitizePageFields(step, draft.numericSystem, result.fields),
        ).filter(([path]) => visibleKeys.has(path)),
      );
      let completed = 0;
      let optimized = 0;
      const appliedPaths: string[] = [];
      for (const [path, value] of Object.entries(safeFields)) {
        if (meta.lockedFields.includes(path)) continue;
        const existing = readDraftField(draft, path);
        if (existing.trim() && !meta.optimizeExisting) continue;
        setDraftField(path, value);
        appliedPaths.push(path);
        if (existing.trim()) optimized++;
        else completed++;
      }
      if (step === 3 && result.supportingCharacters?.length) {
        const generated = result.supportingCharacters.map((character) => ({
          ...character,
          id: character.id || uid("character"),
        }));
        replaceSupportingCharacters([
          ...(draft.supportingCharacters || []),
          ...generated,
        ]);
      }
      updateMeta((current) => ({
        ...current,
        stepUndo: before,
        aiDraftFields: [
          ...new Set([...current.aiDraftFields, ...appliedPaths]),
        ],
      }));
      const skipped = meta.lockedFields.filter((path) =>
        definitions.some((definition) => definition.fieldKey === path),
      ).length;
      setPageStatus(
        `已补全 ${completed} 个空白字段，优化 ${optimized} 个未锁定字段，跳过 ${skipped} 个锁定字段。`,
      );
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        toast.error(
          error instanceof Error ? error.message : "本页补全失败，表单未修改",
        );
    } finally {
      setPageBusy(null);
      requestController.current = null;
    }
  }
  function undoPageCompletion() {
    if (!meta.stepUndo) return;
    for (const [path, value] of Object.entries(meta.stepUndo.fields)) {
      setDraftField(path, value);
    }
    if (meta.stepUndo.supportingCharacters)
      replaceSupportingCharacters(meta.stepUndo.supportingCharacters);
    updateMeta((current) => ({ ...current, stepUndo: undefined }));
    setPageStatus("已恢复到本次补全前的内容。");
  }
  async function requestIdeas(fieldKey?: string) {
    if (!config || config.connectionFailedAt || pageBusy || busyField) return;
    requestController.current = new AbortController();
    if (fieldKey) setBusyField(fieldKey);
    else setPageBusy("ideas");
    try {
      const result = await generateCreationIdeas(
        config,
        {
          step,
          fieldKey,
          context: buildCreationAiContext(getValues(), step, fieldKey),
          lockedFields: meta.lockedFields,
        },
        requestController.current.signal,
      );
      setIdeas(result.candidates as CreationIdeaCandidate[]);
      setIdeasTarget(fieldKey);
      setIdeasOpen(true);
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        toast.error(error instanceof Error ? error.message : "灵感生成失败");
    } finally {
      setBusyField(undefined);
      setPageBusy(null);
      requestController.current = null;
    }
  }
  async function generateCharacter(index?: number) {
    if (!config || config.connectionFailedAt || busyField || pageBusy) return;
    const draft = getValues();
    const cardPath =
      index === undefined
        ? "supportingCharacters.new"
        : `supportingCharacters.${draft.supportingCharacters?.[index]?.id || index}`;
    if (meta.lockedFields.includes(cardPath)) return;
    const before = snapshotCreationStep(draft, 3);
    requestController.current = new AbortController();
    setBusyField(cardPath);
    try {
      const result = await generateCreationPage(
        config,
        {
          step: 3,
          context: {
            ...buildCreationAiContext(draft, 3),
            characterRequest: {
              role: characterRole,
              relationship: characterRelation,
              plotLink: characterPlotLink,
              specialAbility: characterAbility,
              currentCharacter:
                index === undefined
                  ? undefined
                  : draft.supportingCharacters?.[index],
              requestOneCharacterOnly: true,
            },
          },
          currentFields: {},
          lockedFields: meta.lockedFields,
          optimizeExisting: true,
        },
        requestController.current.signal,
      );
      const generated = result.supportingCharacters?.[0];
      if (!generated) throw new Error("模型没有返回完整角色卡");
      const nextCharacter = {
        ...generated,
        id:
          index === undefined
            ? generated.id || uid("character")
            : draft.supportingCharacters?.[index]?.id ||
              generated.id ||
              uid("character"),
      };
      const nextCharacters = [...(draft.supportingCharacters || [])];
      if (index === undefined) nextCharacters.push(nextCharacter);
      else nextCharacters[index] = nextCharacter;
      replaceSupportingCharacters(nextCharacters);
      updateMeta((current) => ({ ...current, stepUndo: before }));
      setPageStatus(
        index === undefined
          ? "已生成一张可编辑的主要配角草稿。"
          : "角色卡已重新生成，可撤销本次修改。",
      );
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        toast.error(error instanceof Error ? error.message : "角色生成失败");
    } finally {
      setBusyField(undefined);
      requestController.current = null;
    }
  }
  function applyIdea(candidate: CreationIdeaCandidate) {
    const draft = getValues();
    const before = snapshotCreationStep(draft, step);
    const visibleKeys = new Set(
      fieldsForStep(step, draft.numericSystem)
        .filter(
          (definition) =>
            mode === "advanced" || !definition.fieldKey.startsWith("advanced."),
        )
        .map((definition) => definition.fieldKey),
    );
    const fields = Object.fromEntries(
      Object.entries(
        sanitizePageFields(
          step,
          draft.numericSystem,
          resolveIdeaCandidateFields(candidate, ideasTarget),
        ),
      ).filter(([path]) => visibleKeys.has(path)),
    );
    for (const [path, value] of Object.entries(fields)) {
      if (meta.lockedFields.includes(path)) continue;
      markAiDraft(path, readDraftField(draft, path));
      setDraftField(path, value);
    }
    if (step === 3 && candidate.supportingCharacters?.length) {
      const characters =
        candidate.supportingCharacters as SupportingCharacterDraft[];
      replaceSupportingCharacters([
        ...(draft.supportingCharacters || []),
        ...characters.map((character) => ({
          ...character,
          id: character.id || uid("character"),
        })),
      ]);
    }
    updateMeta((current) => ({ ...current, stepUndo: before }));
    setIdeasOpen(false);
    setPageStatus(`已采用“${candidate.style}”方向，内容仍可编辑或撤销。`);
  }
  function changeStep(nextStep: number) {
    const confirmed = new Set(
      fieldsForStep(step, getValues().numericSystem).map(
        (field) => field.fieldKey,
      ),
    );
    updateMeta((current) => ({
      ...current,
      step: nextStep,
      aiDraftFields: current.aiDraftFields.filter(
        (path) => !confirmed.has(path),
      ),
      fieldUndo: Object.fromEntries(
        Object.entries(current.fieldUndo).filter(
          ([path]) => !confirmed.has(path),
        ),
      ),
      stepUndo: undefined,
    }));
    setPageStatus("");
    setStep(nextStep);
  }
  async function discardCreationDraft() {
    cancelAiRequest();
    await db.drafts.delete("creation");
    reset({
      title: "",
      idea: "",
      genre: "西方玄幻",
      protagonist: "现代青年",
      tone: "成长、冒险",
      freedomMode: "hybrid",
      gameLength: "standard",
      numericSystem: true,
      creationMode: mode ?? "advanced",
      advanced: {},
      supportingCharacters: [],
    });
    const nextMeta = emptyCreationMeta();
    setMeta(nextMeta);
    metaRef.current = nextMeta;
    setStep(0);
    toast.success("已放弃旧草稿，可以重新开始");
  }
  function submit(data: GenerationDraft) {
    if (mode === "advanced") {
      setGenerateConfirm(data);
      return;
    }
    void startGeneration(data);
  }
  async function startGeneration(data: GenerationDraft) {
    if (
      data.worldBinding &&
      !(await db.worldBookVersions.get(data.worldBinding.worldBookVersionId))
    ) {
      toast.error("绑定的世界书版本已不存在，请重新选择世界书");
      return;
    }
    const id = uid("generation");
    const generationDraft = {
      ...data,
      creationMeta: { lockedFields: meta.lockedFields },
    };
    await db.drafts.put({
      id,
      value: generationDraft,
      updatedAt: new Date().toISOString(),
    });
    await db.drafts.delete("creation");
    toast.success("创作设定已保存");
    router.push(`/generate/${id}`);
  }
  if (!mode)
    return (
      <section className="container py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mono gold text-xs">NEW ADVENTURE</p>
            <h1 className="display mt-3 text-4xl">你想如何创建？</h1>
            <p className="muted mt-3 max-w-2xl leading-7">
              从零构筑新世界，或选择已有世界书，只为本次冒险补充主角、危机和剧情。
            </p>
          </div>
          <Link className="btn" href="/worldbooks">
            <Library size={16} /> 管理世界书
          </Link>
        </div>
        <h2 className="display mt-10 text-2xl">从零创建世界和游戏</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <button
            className="panel p-8 text-left transition hover:border-[#b89b62]"
            onClick={() => choose("simple")}
          >
            <span className="badge">轻量创作</span>
            <h2 className="display mt-7 text-3xl">简单模式</h2>
            <p className="muted mt-3 leading-7">
              写下一个故事念头。AI 会补全世界、角色、规则、剧情与开场。
            </p>
            <p className="gold mt-8">大约 2 分钟 →</p>
          </button>
          <button
            className="panel p-8 text-left transition hover:border-[#b89b62]"
            onClick={() => choose("advanced")}
          >
            <span className="badge">深度创作</span>
            <h2 className="display mt-7 text-3xl">专业模式</h2>
            <p className="muted mt-3 leading-7">
              沿七个阶段精确定义设定。每项都可留空，交给 AI 补全。
            </p>
            <p className="gold mt-8">完整控制 →</p>
          </button>
        </div>
        <div className="mt-12 flex items-end justify-between gap-4">
          <div>
            <p className="mono muted text-xs">REUSABLE CANON</p>
            <h2 className="display mt-2 text-2xl">选择我的世界书</h2>
          </div>
          <Link className="gold text-sm" href="/worldbooks/new">
            新建世界书 →
          </Link>
        </div>
        {worldBooks.length ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {worldBooks.map((book) => (
              <article className="panel flex flex-col p-5" key={book.id}>
                <div className="flex items-center justify-between gap-3">
                  <span className="badge">世界书 v{book.versionNumber}</span>
                  <span className="mono muted text-[10px]">
                    {book.entryIds.length} 条目
                  </span>
                </div>
                <h3 className="display mt-5 text-xl">{book.name}</h3>
                <p className="muted mt-2 line-clamp-3 flex-1 text-sm leading-6">
                  {book.description || book.coreSummary || "尚未填写世界简介"}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    className="btn text-xs"
                    type="button"
                    onClick={() => choose("simple", book)}
                  >
                    简单模式
                  </button>
                  <button
                    className="btn btn-gold text-xs"
                    type="button"
                    onClick={() => choose("advanced", book)}
                  >
                    专业模式
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel mt-4 p-7 text-center">
            <Library className="gold mx-auto" size={22} />
            <p className="mt-3 text-sm">还没有世界书</p>
            <p className="muted mt-1 text-xs">
              可以新建空白世界书，或从已有项目提取稳定世界设定。
            </p>
            <Link className="btn mt-5" href="/worldbooks/new">
              创建第一本世界书
            </Link>
          </div>
        )}
      </section>
    );
  const advFields: Record<number, [string, string][]> = {
    0: [["experience", "核心体验"]],
    1: [
      ["era", "故事时代"],
      ["tech", "科技水平"],
      ["background", "世界背景"],
      ["history", "世界历史"],
      ["geography", "地理环境"],
      ["crisis", "当前危机"],
      ["secret", "隐藏秘密"],
      ["civilizations", "国家、种族、宗教或特殊文明"],
    ],
    2: [
      ["playerName", "主角姓名"],
      ["playerGender", "性别 / 性别认同"],
      ["playerAge", "年龄"],
      ["playerRace", "种族 / 物种"],
      ["playerIdentity", "身份 / 职业"],
      ["playerOrigin", "主角出身"],
      ["playerAppearance", "外观特征"],
      ["playerPersonality", "性格特质"],
      ["playerGoal", "主角目标"],
      ["specialAbility", "特殊能力"],
      ["weakness", "弱点"],
      ["playerSecret", "隐藏秘密"],
    ],
    3: [["factions", "主要势力（每行一个，可补充立场与目标）"]],
    4: [
      ["attributes", "自定义属性"],
      ["powerSystem", "能力体系"],
      ["levelSystem", "等级体系"],
      ["growthRules", "成长方式"],
      ["resourceRules", "资源消耗"],
      ["checkRules", "判定规则"],
    ],
    5: [
      ["mainGoal", "主线目标"],
      ["opening", "开场事件"],
      ["turns", "重要转折"],
      ["endings", "结局条件"],
      ["conflict", "主要冲突"],
      ["foreshadowing", "核心伏笔"],
      ["chapters", "章节规划"],
    ],
    6: [
      ["replyLength", "回复长度"],
      ["difficulty", "游戏难度"],
      ["failureRules", "失败规则"],
      ["deathRules", "死亡规则"],
      ["allowRollback", "是否允许回档"],
      ["aiAgency", "AI 是否可以替玩家决定行动"],
      ["checkPrinciples", "数值判定原则"],
      ["pacingRules", "剧情节奏要求"],
    ],
  };
  function fieldAiActions(path: string) {
    const definition = findCreationField(path);
    if (!definition) return null;
    const value = readDraftField(liveDraft, path);
    return (
      <FieldAiActions
        value={value}
        available={
          Boolean(config && !config.connectionFailedAt) &&
          !pageBusy &&
          (!busyField || busyField === path)
        }
        locked={meta.lockedFields.includes(path)}
        aiDraft={meta.aiDraftFields.includes(path)}
        busy={busyField === path}
        canExpand={definition.supportsExpand}
        canSimplify={definition.supportsSimplify}
        onRun={(operation) => void runFieldAi(path, operation)}
        onIdeas={() => void requestIdeas(path)}
        onToggleLock={() => toggleFieldLock(path)}
        onUndo={path in meta.fieldUndo ? () => undoField(path) : undefined}
        onClearAiDraft={
          meta.aiDraftFields.includes(path)
            ? () => {
                setDraftField(path, "");
                updateMeta((current) => ({
                  ...current,
                  aiDraftFields: current.aiDraftFields.filter(
                    (field) => field !== path,
                  ),
                }));
              }
            : undefined
        }
        onCancel={cancelAiRequest}
      />
    );
  }
  return (
    <section className="container py-10">
      <div className="mx-auto max-w-4xl">
        <button
          className="btn border-transparent bg-transparent"
          onClick={() => setMode(null)}
        >
          <ChevronLeft size={16} />
          重选模式
        </button>
        <div className="mt-4 flex items-center justify-between">
          <div>
            <span className="badge">
              {mode === "simple" ? "简单模式" : "专业模式"}
            </span>
            <h1 className="display mt-3 text-3xl">构筑你的冒险</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn border-transparent bg-transparent text-xs"
              type="button"
              onClick={() => void discardCreationDraft()}
            >
              <RotateCcw size={14} />
              放弃草稿
            </button>
            {mode === "advanced" ? (
              <span className="mono muted text-sm">{step + 1} / 7</span>
            ) : (
              <span className="mono muted text-xs">BASIC</span>
            )}
          </div>
        </div>
        {mode === "advanced" && (
          <div className="mt-8 grid grid-cols-2 gap-2 md:grid-cols-7">
            {steps.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => changeStep(i)}
                className={`rounded-lg border px-2 py-3 text-left transition ${i === step ? "border-[var(--gold)] bg-[var(--panel2)] text-[var(--paper)]" : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--gold)]"}`}
                aria-current={i === step ? "step" : undefined}
              >
                <span className="mono block text-[10px] opacity-70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="mt-1 block text-xs">{s}</span>
              </button>
            ))}
          </div>
        )}
        <form className="panel mt-7 p-6 md:p-8" onSubmit={handleSubmit(submit)}>
          {liveDraft.worldBinding && (
            <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-xl border border-[color-mix(in_srgb,var(--gold)_40%,var(--line))] bg-[color-mix(in_srgb,var(--gold)_5%,var(--panel2))] p-4">
              <div>
                <p className="mono gold text-[10px]">BOUND WORLD BOOK</p>
                <p className="display mt-1 text-lg">
                  {selectedWorldBook?.name || liveDraft.worldBookPreview?.name}
                </p>
                <p className="muted mt-1 text-xs">
                  已固定使用版本 {liveDraft.worldBinding.worldBookVersionNumber}
                  。世界正史不会被本次游戏自动修改。
                </p>
                <label className="muted mt-3 flex items-center gap-2 text-xs">
                  每回合世界书预算
                  <select
                    className="input !w-auto !py-1 text-xs"
                    value={liveDraft.worldBinding.contextBudget.mode}
                    onChange={(event) => {
                      const mode = event.target.value as
                        "compact" | "balanced" | "detailed";
                      setValue(
                        "worldBinding.contextBudget",
                        WORLD_BOOK_BUDGETS[mode],
                      );
                    }}
                  >
                    <option value="compact">精简 · 约 650 Token</option>
                    <option value="balanced">平衡 · 约 1200 Token</option>
                    <option value="detailed">详细 · 约 2200 Token</option>
                  </select>
                </label>
              </div>
              <button
                className="btn text-xs"
                type="button"
                onClick={() => {
                  setValue("worldBinding", undefined);
                  setValue("worldBookPreview", undefined);
                }}
              >
                改为从零创建
              </button>
            </div>
          )}
          {mode === "advanced" && (
            <div className="mb-7 border-b border-[var(--line)] pb-5">
              <div className="flex items-center gap-3">
                <span className="mono gold text-xs">
                  STEP {String(step + 1).padStart(2, "0")}
                </span>
                <span className="h-px flex-1 bg-[var(--line)]" />
              </div>
              <h2 className="display mt-3 text-2xl">{steps[step]}</h2>
              <p className="muted mt-2 text-sm">{stepDescriptions[step]}</p>
            </div>
          )}
          {!(liveDraft.worldBinding && mode === "advanced" && step === 1) &&
            (mode === "simple" ||
              (mode === "advanced" &&
                (step !== 4 || liveDraft.numericSystem))) && (
              <CreationPageAiBar
                hasConfig={Boolean(config && !config.connectionFailedAt)}
                optimizeExisting={meta.optimizeExisting}
                busy={pageBusy}
                canUndo={Boolean(meta.stepUndo)}
                status={pageStatus}
                onOptimizeChange={(value) =>
                  updateMeta((current) => ({
                    ...current,
                    optimizeExisting: value,
                  }))
                }
                onComplete={() => void completeCurrentPage()}
                onIdeas={() => void requestIdeas()}
                onUndo={undoPageCompletion}
                onCancel={cancelAiRequest}
              />
            )}
          <div className="grid gap-5 md:grid-cols-2">
            {(mode === "simple" || step === 0) && (
              <>
                <div className="field">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label>文游名称（可留空）</label>
                    {fieldAiActions("title")}
                  </div>
                  <input
                    className="input"
                    {...register("title")}
                    placeholder="例如：雾港失语者"
                  />
                </div>
                <div className="field">
                  <label>游戏题材</label>
                  <select className="input" {...register("genre")}>
                    {[
                      "西方玄幻",
                      "东方玄幻",
                      "修仙",
                      "都市",
                      "校园",
                      "末日",
                      "科幻",
                      "悬疑",
                      "恐怖",
                      "恋爱",
                      "历史",
                      "无限流",
                      "自定义",
                    ].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <div className="field md:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label>一句话故事想法 *</label>
                    {fieldAiActions("idea")}
                  </div>
                  <textarea
                    className="input textarea"
                    {...register("idea")}
                    placeholder="一个只能在雨中看见亡魂的邮差，收到来自十年后自己的信。"
                  />
                  <span className="text-xs text-[#d17670]">
                    {errors.idea?.message}
                  </span>
                </div>
                <div className="field">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label>主角类型 *</label>
                    {fieldAiActions("protagonist")}
                  </div>
                  <input
                    className="input"
                    {...register("protagonist")}
                    placeholder="失忆的边境调查员"
                  />
                </div>
                <div className="field">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label>整体风格</label>
                    {fieldAiActions("tone")}
                  </div>
                  <input
                    className="input"
                    {...register("tone")}
                    placeholder="克制、悬疑、带一点治愈"
                  />
                </div>
                <div className="field">
                  <label>剧情自由度</label>
                  <select className="input" {...register("freedomMode")}>
                    <option value="linear">强主线</option>
                    <option value="hybrid">主线 + 自由探索</option>
                    <option value="open">开放世界</option>
                  </select>
                </div>
                <div className="field">
                  <div className="flex items-center justify-between gap-3">
                    <label>游戏篇幅</label>
                    {selectedLength.id === "standard" && (
                      <span className="badge">推荐</span>
                    )}
                  </div>
                  <select className="input" {...register("gameLength")}>
                    {Object.values(STORY_LENGTH_PRESETS).map((preset) => (
                      <option key={preset.id} value={preset.id}>
                        {preset.optionLabel}
                      </option>
                    ))}
                  </select>
                  <p className="muted text-xs leading-5">
                    {selectedLength.description} {selectedLengthMeta.chapters}。
                  </p>
                  <details className="text-xs text-[var(--muted)]">
                    <summary className="cursor-pointer select-none text-[var(--text)]">
                      篇幅如何影响剧情？
                    </summary>
                    <p className="mt-2 leading-5">
                      它会调整章节数、人物与支线规模和推进速度；回合数是节奏目标，不会到点强制结局。探索较多可能延长，快速推进也可能提前完成。
                    </p>
                  </details>
                </div>
                <label className="panel flex items-center gap-3 p-4 text-sm">
                  <input type="checkbox" {...register("numericSystem")} />
                  启用数值系统
                </label>
              </>
            )}
            {mode === "advanced" && step === 2 && (
              <div className="md:col-span-2 rounded-xl border border-[var(--line)] bg-[var(--panel2)] p-5 md:p-6">
                <div className="mb-5 flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--gold)]">
                    <UserRound size={17} />
                  </span>
                  <div>
                    <h2 className="display text-lg">主角档案</h2>
                    <p className="muted mt-1 text-sm">
                      所有字段均可留空；AI
                      只会补全空缺，不会覆盖你确定的核心设定。
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {advFields[2].map(([key, label]) => {
                    const longField = [
                      "playerOrigin",
                      "playerAppearance",
                      "playerPersonality",
                      "playerGoal",
                      "specialAbility",
                      "weakness",
                    ].includes(key);
                    return (
                      <div
                        className={`field ${longField ? "md:col-span-2" : ""}`}
                        key={key}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label>{label}（可选）</label>
                          {fieldAiActions(`advanced.${key}`)}
                        </div>
                        {longField ? (
                          <textarea
                            className="input min-h-20"
                            {...register(`advanced.${key}`)}
                            placeholder={protagonistPlaceholder(key)}
                          />
                        ) : (
                          <input
                            className="input"
                            {...register(`advanced.${key}`)}
                            placeholder={protagonistPlaceholder(key)}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {mode === "advanced" && step === 3 && (
              <div className="md:col-span-2 space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--gold)]">
                      <UsersRound size={17} />
                    </span>
                    <div>
                      <h2 className="display text-lg">主要配角</h2>
                      <p className="muted mt-1 text-sm">
                        添加会长期参与剧情、拥有独立目标的重要角色。
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn"
                      disabled={
                        !config ||
                        Boolean(config.connectionFailedAt) ||
                        busyField === "supportingCharacters.new"
                      }
                      onClick={() => void generateCharacter()}
                    >
                      <Sparkles size={15} />
                      {busyField === "supportingCharacters.new"
                        ? "正在生成"
                        : "AI 生成主要配角"}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        appendSupportingCharacter({
                          id: uid("character"),
                          name: "",
                          identity: "",
                          relationship: "",
                          appearance: "",
                          personality: "",
                          goal: "",
                          specialAbility: "",
                          secret: "",
                        })
                      }
                    >
                      <Plus size={16} />
                      手动添加
                    </button>
                  </div>
                </div>
                <details className="rounded-lg border border-[var(--line)] px-4 py-3 text-xs">
                  <summary className="cursor-pointer select-none font-medium">
                    配角生成偏好
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <MiniSelect
                      label="角色定位"
                      value={characterRole}
                      onChange={setCharacterRole}
                      options={[
                        "导师",
                        "同伴",
                        "宿敌",
                        "反派",
                        "恋爱对象",
                        "中立者",
                        "随机",
                      ]}
                    />
                    <MiniSelect
                      label="与主角关系"
                      value={characterRelation}
                      onChange={setCharacterRelation}
                      options={["友好", "中立", "敌对", "随机"]}
                    />
                    <MiniSelect
                      label="主线关联"
                      value={characterPlotLink}
                      onChange={setCharacterPlotLink}
                      options={["强", "中", "弱"]}
                    />
                    <label className="flex items-end gap-2 pb-2">
                      <input
                        type="checkbox"
                        checked={characterAbility}
                        onChange={(event) =>
                          setCharacterAbility(event.target.checked)
                        }
                      />
                      拥有特殊能力
                    </label>
                  </div>
                </details>
                {supportingCharacters.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--line)] px-5 py-9 text-center">
                    <UsersRound className="muted mx-auto" size={23} />
                    <p className="mt-3 text-sm">尚未添加主要配角</p>
                    <p className="muted mt-1 text-xs">
                      可以留空让 AI 自行创造，也可以亲自定义关键人物。
                    </p>
                  </div>
                ) : (
                  supportingCharacters.map((character, index) => (
                    <div
                      className="rounded-xl border border-[var(--line)] bg-[var(--panel2)] p-5"
                      key={character._key}
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <span className="mono gold text-xs">
                            CHARACTER {String(index + 1).padStart(2, "0")}
                          </span>
                          <h3 className="display mt-1 text-lg">
                            主要配角 {index + 1}
                          </h3>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            className="btn h-8 px-2.5 text-xs"
                            disabled={
                              !config ||
                              Boolean(config.connectionFailedAt) ||
                              meta.lockedFields.includes(
                                `supportingCharacters.${character.id}`,
                              ) ||
                              busyField ===
                                `supportingCharacters.${character.id}`
                            }
                            onClick={() => void generateCharacter(index)}
                          >
                            <Sparkles size={13} />
                            重新生成
                          </button>
                          <button
                            type="button"
                            className={`btn icon-btn h-8 w-8 ${meta.lockedFields.includes(`supportingCharacters.${character.id}`) ? "gold" : "muted"}`}
                            aria-label={`锁定主要配角 ${index + 1}`}
                            onClick={() =>
                              toggleFieldLock(
                                `supportingCharacters.${character.id}`,
                              )
                            }
                          >
                            {meta.lockedFields.includes(
                              `supportingCharacters.${character.id}`,
                            ) ? (
                              <Lock size={13} />
                            ) : (
                              <Unlock size={13} />
                            )}
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger icon-btn"
                            aria-label={`删除主要配角 ${index + 1}`}
                            onClick={() => {
                              const characterPath = `supportingCharacters.${character.id}`;
                              removeSupportingCharacter(index);
                              updateMeta((current) => ({
                                ...current,
                                lockedFields: current.lockedFields.filter(
                                  (path) => path !== characterPath,
                                ),
                                aiDraftFields: current.aiDraftFields.filter(
                                  (path) => path !== characterPath,
                                ),
                              }));
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <input
                        type="hidden"
                        {...register(`supportingCharacters.${index}.id`)}
                      />
                      <div className="grid gap-4 md:grid-cols-2">
                        <CharacterField label="姓名">
                          <input
                            className="input"
                            {...register(`supportingCharacters.${index}.name`)}
                            placeholder="例如：伊莱娜"
                          />
                        </CharacterField>
                        <CharacterField label="身份 / 职业">
                          <input
                            className="input"
                            {...register(
                              `supportingCharacters.${index}.identity`,
                            )}
                            placeholder="流亡骑士、情报商人……"
                          />
                        </CharacterField>
                        <CharacterField label="与主角的关系">
                          <input
                            className="input"
                            {...register(
                              `supportingCharacters.${index}.relationship`,
                            )}
                            placeholder="旧友、竞争者、陌生向导……"
                          />
                        </CharacterField>
                        <CharacterField label="性格">
                          <input
                            className="input"
                            {...register(
                              `supportingCharacters.${index}.personality`,
                            )}
                            placeholder="冷静克制，但极度厌恶谎言"
                          />
                        </CharacterField>
                        <CharacterField label="外观" wide>
                          <textarea
                            className="input min-h-20"
                            {...register(
                              `supportingCharacters.${index}.appearance`,
                            )}
                            placeholder="最鲜明的体态、服饰、面容或标志物"
                          />
                        </CharacterField>
                        <CharacterField label="个人目标" wide>
                          <textarea
                            className="input min-h-20"
                            {...register(`supportingCharacters.${index}.goal`)}
                            placeholder="这个角色主动追求什么？愿意付出什么代价？"
                          />
                        </CharacterField>
                        <CharacterField label="特殊能力（可选）" wide>
                          <textarea
                            className="input min-h-20"
                            {...register(
                              `supportingCharacters.${index}.specialAbility`,
                            )}
                            placeholder="能力名称、效果、限制与代价"
                          />
                        </CharacterField>
                        <CharacterField label="秘密（可选）" wide>
                          <textarea
                            className="input min-h-20"
                            {...register(
                              `supportingCharacters.${index}.secret`,
                            )}
                            placeholder="只有主持人知道、可在剧情中揭露的秘密"
                          />
                        </CharacterField>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
            {mode === "advanced" && step === 4 && !liveDraft.numericSystem && (
              <div className="md:col-span-2 rounded-xl border border-dashed border-[var(--line)] px-5 py-9 text-center">
                <p className="text-sm">数值系统当前未启用</p>
                <p className="muted mt-2 text-xs">
                  返回基础信息开启后，才能生成可由游戏状态追踪的属性与能力规则。
                </p>
              </div>
            )}
            {mode === "advanced" && liveDraft.worldBinding && step === 1 && (
              <div className="md:col-span-2 rounded-xl border hairline bg-[var(--panel2)] p-6">
                <p className="display text-xl">世界基础资料已由世界书提供</p>
                <p className="muted mt-2 max-w-2xl text-sm leading-7">
                  历史、地理、势力、文明和力量体系读取绑定版本，不会再次调用 AI
                  重建。后续步骤只需定义本次主角、核心危机、剧情与游玩规则。
                </p>
                <Link
                  className="gold mt-4 inline-block text-sm"
                  href={`/worldbooks/${liveDraft.worldBinding.worldBookId}`}
                >
                  查看绑定的世界书 →
                </Link>
              </div>
            )}
            {mode === "advanced" &&
              step !== 2 &&
              (step !== 4 || liveDraft.numericSystem) &&
              advFields[step]
                .filter(
                  ([key]) =>
                    !liveDraft.worldBinding ||
                    step !== 1 ||
                    ["era", "geography", "crisis"].includes(key),
                )
                .map(([key, label]) => (
                  <div className="field md:col-span-2" key={key}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label>
                        {liveDraft.worldBinding && key === "geography"
                          ? "本局起始地点"
                          : label}
                        （可留空由 AI 补全）
                      </label>
                      {fieldAiActions(`advanced.${key}`)}
                    </div>
                    {advancedSelectOptions[key] ? (
                      <select
                        className="input"
                        {...register(`advanced.${key}`)}
                      >
                        <option value="">由 AI 建议或稍后选择</option>
                        {advancedSelectOptions[key].map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        className="input min-h-20"
                        {...register(`advanced.${key}`)}
                      />
                    )}
                  </div>
                ))}
          </div>
          <div className="mt-8 flex justify-between">
            <button
              type="button"
              className="btn"
              disabled={mode === "simple" || step === 0}
              onClick={() => changeStep(step - 1)}
            >
              <ChevronLeft size={16} />
              上一步
            </button>
            {mode === "advanced" && step < 6 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => changeStep(step + 1)}
              >
                下一步
                <ChevronRight size={16} />
              </button>
            ) : (
              <button className="btn btn-gold" type="submit">
                <Sparkles size={16} />
                开始分阶段生成
              </button>
            )}
          </div>
        </form>
        <CreationIdeasDialog
          open={ideasOpen}
          title={
            ideasTarget
              ? `${findCreationField(ideasTarget)?.label || "字段"}的灵感候选`
              : `${steps[step]}的灵感候选`
          }
          candidates={ideas}
          onApply={applyIdea}
          onClose={() => setIdeasOpen(false)}
        />
        {generateConfirm && (
          <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4 backdrop-blur-[2px]">
            <section
              className="panel w-full max-w-lg p-6"
              role="dialog"
              aria-modal="true"
              aria-label="确认开始分阶段生成"
            >
              <p className="mono gold text-[10px]">FINAL ASSEMBLY</p>
              <h2 className="display mt-2 text-2xl">确认交给 AI 完成项目</h2>
              {(() => {
                const counts = countCreationFields(
                  generateConfirm,
                  meta.lockedFields,
                );
                return (
                  <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                    <SummaryCount label="已填写" value={counts.filled} />
                    <SummaryCount label="仍为空" value={counts.empty} />
                    <SummaryCount label="已锁定" value={counts.locked} />
                  </div>
                );
              })()}
              <div className="mt-5 rounded-lg bg-[var(--panel2)] p-4 text-sm leading-6">
                <p className="font-medium">接下来 AI 只负责：</p>
                <p className="muted mt-1">
                  检查完整性、补全仍为空的字段、生成章节规划、系统提示词和开场剧情。已填写内容会优先保留，锁定内容绝不修改。
                </p>
              </div>
              {detectCreationConflicts(generateConfirm).length > 0 && (
                <div className="mt-3 rounded-lg border border-[#b86f68]/35 bg-[#b86f68]/5 p-4 text-sm">
                  <p className="font-medium text-[#b86f68]">
                    建议先检查这些设定
                  </p>
                  <ul className="muted mt-2 list-disc space-y-1 pl-5 text-xs leading-5">
                    {detectCreationConflicts(generateConfirm).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-6 flex justify-end gap-2">
                <button
                  className="btn"
                  type="button"
                  onClick={() => setGenerateConfirm(undefined)}
                >
                  返回检查
                </button>
                <button
                  className="btn btn-gold"
                  type="button"
                  onClick={() => void startGeneration(generateConfirm)}
                >
                  <Sparkles size={15} /> 开始分阶段生成
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    </section>
  );
}

const advancedSelectOptions: Record<string, string[] | undefined> = {
  replyLength: ["简短", "标准", "详细", "自定义"],
  difficulty: ["休闲", "标准", "困难", "残酷"],
  allowRollback: ["允许随时回档", "仅允许读取手动存档", "不允许回档"],
  aiAgency: ["绝不替玩家决定核心行动", "仅补全无关紧要的自然动作"],
};

function MiniSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        className="input mt-1"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function SummaryCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-[var(--panel2)] px-3 py-3">
      <strong className="display text-xl text-[var(--gold)]">{value}</strong>
      <span className="muted mt-1 block text-[10px]">{label}</span>
    </div>
  );
}

function protagonistPlaceholder(key: string) {
  const placeholders: Record<string, string> = {
    playerName: "例如：埃文",
    playerGender: "例如：男、女、非二元或不详",
    playerAge: "例如：23 岁",
    playerRace: "例如：人类、精灵、仿生人",
    playerIdentity: "例如：来自异世界的落魄学者",
    playerOrigin: "家庭、故乡、重要经历与当前处境",
    playerAppearance: "体态、面容、服饰、标志物与第一印象",
    playerPersonality: "核心性格、行为倾向、价值观与内在矛盾",
    playerGoal: "近期目标、长期愿望以及行动动机",
    specialAbility: "能力名称、具体效果、限制条件与使用代价",
    weakness: "身体、心理、关系或能力上的弱点",
  };
  return placeholders[key] ?? "";
}

function CharacterField({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`field ${wide ? "md:col-span-2" : ""}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}
