"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Copy,
  Lock,
  LockOpen,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { WorldBookAiStudio } from "@/components/world-book-ai-studio";
import { QuickWorldBookRetrievalTester } from "@/components/quick-world-book-retrieval-tester";
import { WorldBookQuickTriggerSettings } from "@/components/world-book-quick-trigger-settings";
import { WorldBookRepairPanel } from "@/components/world-book-repair-panel";
import { WorldBookRetrievalTester } from "@/components/world-book-retrieval-tester";
import { WorldBookTagInput } from "@/components/world-book-tag-input";
import { uid } from "@/lib/db";
import { ensureUniqueWorldBookEntryIds } from "@/lib/world-book-entry-identity";
import type {
  WorldBook,
  WorldBookEntry,
  WorldBookEntryActivationMode,
  WorldBookEntryCategory,
  WorldBookEditorMode,
} from "@/lib/types";
import type { GeneratedWorldBookDraft } from "@/lib/world-book-ai";
import { generatedDraftToEntries } from "@/lib/world-book-ai";
import {
  createWorldBookEntry,
  estimateWorldBookTokens,
  normalizeWorldBookEntry,
  resolveWorldBookActivationMode,
  withWorldBookActivationMode,
  WORLD_BOOK_ACTIVATION_LABELS,
  WORLD_BOOK_CATEGORIES,
  WORLD_BOOK_CATEGORY_LABELS,
} from "@/lib/world-book";
import {
  analyzeWorldBookCompletion,
  getWorldBookTokenReport,
  validateWorldBook,
} from "@/lib/world-book-validation";
import {
  applyWorldBookRepair,
  planWorldBookRepairs,
  type WorldBookRepairSuggestion,
} from "@/lib/world-book-repair";
import {
  applyWorldBookQuickDefaults,
  updateQuickEntryTitle,
} from "@/lib/world-book-quick-defaults";
import {
  refreshAutoWorldBookTriggers,
  setWorldBookTriggerLock,
  updateWorldBookTriggerValues,
  WORLD_BOOK_TRIGGER_SOURCE_LABELS,
} from "@/lib/world-book-triggers";
import {
  cleanupPublishedWorldBookDraft,
  formatWorldBookPublishFailure,
  publishWorldBook,
  type WorldBookRevision,
} from "@/lib/world-book-publish-boundary";
import { worldBookPublishStorage } from "@/lib/world-book-publish-storage";
import { worldBookEditorStorage } from "@/lib/world-book-editor-storage";
import {
  createSequentialWorldBookDraftSaver,
  loadWorldBookEditorWorkspace,
  readWorldBookEditorMode,
  worldBookEditorDraftRecord,
  writeWorldBookEditorMode,
} from "@/lib/world-book-editor-workspace";

type AiStudioMode = "full" | "fill" | "category" | "entry";
type UndoSnapshot = {
  book: WorldBook;
  entries: WorldBookEntry[];
  selectedId: string;
};
type RepairUndo = {
  entries: WorldBookEntry[];
  affectedEntryIds: string[];
};

type DraftStatus = "clean" | "dirty" | "saving" | "saved" | "error";

const IMPORTANCE = [
  { value: 10, label: "低" },
  { value: 30, label: "一般" },
  { value: 50, label: "重要" },
  { value: 70, label: "高" },
  { value: 90, label: "核心优先级" },
] as const;

function importanceValue(value: number) {
  return IMPORTANCE.reduce((best, item) =>
    Math.abs(item.value - value) < Math.abs(best.value - value) ? item : best,
  ).value;
}

export default function WorldBookEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [book, setBook] = useState<WorldBook>();
  const [rawEntries, setEntriesState] = useState<WorldBookEntry[]>([]);
  const entryIdentity = useMemo(
    () => ensureUniqueWorldBookEntryIds(rawEntries),
    [rawEntries],
  );
  const entries = entryIdentity.entries;
  const setEntries = useCallback(
    (
      update:
        WorldBookEntry[] | ((current: WorldBookEntry[]) => WorldBookEntry[]),
    ) => {
      setEntriesState((current) => {
        const next = typeof update === "function" ? update(current) : update;
        return ensureUniqueWorldBookEntryIds(next).entries;
      });
    },
    [],
  );
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<WorldBookEntryCategory | "all">(
    "all",
  );
  const [activationFilter, setActivationFilter] = useState<
    WorldBookEntryActivationMode | "all" | "incomplete"
  >("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [formalRevision, setFormalRevision] = useState<WorldBookRevision>();
  const [draftStatus, setDraftStatus] = useState<DraftStatus>("clean");
  const [dialogAction, setDialogAction] = useState<"save" | "create" | null>(
    null,
  );
  const [versionNote, setVersionNote] = useState("");
  const [editorMode, setEditorMode] =
    useState<WorldBookEditorMode>("professional");
  const [aiStudio, setAiStudio] = useState<AiStudioMode>();
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [lastAiUndo, setLastAiUndo] = useState<UndoSnapshot>();
  const [aiDraftEntryIds, setAiDraftEntryIds] = useState<string[]>([]);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairSuggestionId, setRepairSuggestionId] = useState<string>();
  const [lastRepairUndo, setLastRepairUndo] = useState<RepairUndo>();
  const hydrated = useRef(false);
  const skipNextAutosave = useRef(false);
  const draftSaveSequence = useRef(0);
  const draftKey = `worldbook:${id}`;
  const draftSaver = useMemo(
    () => createSequentialWorldBookDraftSaver(worldBookEditorStorage),
    [],
  );

  useEffect(() => {
    if (!entryIdentity.repairs.length) return;
    setEntriesState(entryIdentity.entries);
  }, [entryIdentity]);

  useEffect(() => {
    setEditorMode(readWorldBookEditorMode(window.localStorage, id));
  }, [id]);

  useEffect(() => {
    let active = true;
    hydrated.current = false;
    setLoading(true);
    setLoadError("");
    setBook(undefined);
    setFormalRevision(undefined);
    void loadWorldBookEditorWorkspace({
      worldBookId: id,
      projectId: new URLSearchParams(window.location.search).get("project"),
      storage: worldBookEditorStorage,
      createWorldBookId: () => uid("world"),
    })
      .then((workspace) => {
        if (!active) return;
        if (workspace.kind === "missing") {
          toast.error("没有找到这本世界书");
          router.replace("/worldbooks");
          return;
        }
        skipNextAutosave.current = true;
        setBook(workspace.book);
        setEntries(workspace.entries);
        setSelectedId(workspace.selectedId);
        setFormalRevision(workspace.revision);
        setDraftStatus(workspace.draftStatus);
        if (workspace.repairedEntryCount)
          toast.warning(
            `已修复 ${workspace.repairedEntryCount} 张重复 ID 的资料卡，内容没有被删除`,
          );
        hydrated.current = true;
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error("加载世界书工作区失败", error);
        setLoadError("世界书加载失败，请检查本地数据后重试。");
        toast.error("世界书加载失败");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      hydrated.current = false;
    };
  }, [id, loadAttempt, router, setEntries]);

  useEffect(() => {
    if (!hydrated.current || !book || loading) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    const sequence = ++draftSaveSequence.current;
    setDraftStatus("dirty");
    const timer = window.setTimeout(async () => {
      if (draftSaveSequence.current !== sequence) return;
      setDraftStatus("saving");
      const result = await draftSaver.save(
        worldBookEditorDraftRecord(
          draftKey,
          book,
          entries,
          selectedId,
          new Date().toISOString(),
        ),
      );
      if (draftSaveSequence.current !== sequence) return;
      setDraftStatus(result.ok ? "saved" : "error");
    }, 700);
    return () => {
      window.clearTimeout(timer);
      if (draftSaveSequence.current === sequence)
        draftSaveSequence.current += 1;
    };
  }, [book, entries, selectedId, draftKey, draftSaver, loading]);

  const selected = entries.find((entry) => entry.id === selectedId);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      const mode = resolveWorldBookActivationMode(entry);
      if (
        activationFilter !== "all" &&
        activationFilter !== "incomplete" &&
        mode !== activationFilter
      )
        return false;
      if (
        activationFilter === "incomplete" &&
        entry.title.trim() &&
        (entry.summary.trim() || entry.content.trim()) &&
        (mode !== "conditional" ||
          entry.keywords.length ||
          entry.aliases.length)
      )
        return false;
      return (
        !term ||
        [
          entry.title,
          entry.summary,
          entry.content,
          ...entry.keywords,
          ...entry.aliases,
        ]
          .join(" ")
          .toLowerCase()
          .includes(term)
      );
    });
  }, [entries, query, category, activationFilter]);
  const tokenReport = useMemo(
    () => (book ? getWorldBookTokenReport(book, entries) : undefined),
    [book, entries],
  );
  const issues = useMemo(
    () => (book ? validateWorldBook(book, entries) : []),
    [book, entries],
  );
  const repairSuggestions = useMemo(
    () => (book ? planWorldBookRepairs(book, entries, issues) : []),
    [book, entries, issues],
  );
  const completion = useMemo(
    () => (book ? analyzeWorldBookCompletion(book, entries) : undefined),
    [book, entries],
  );
  const hasErrors = issues.some((issue) => issue.severity === "error");

  function changeEditorMode(next: WorldBookEditorMode) {
    setEditorMode(next);
    if (next === "quick") {
      setActivationFilter("all");
      setEntries((items) => items.map(refreshAutoWorldBookTriggers));
    }
    const preferenceSaved = writeWorldBookEditorMode(
      window.localStorage,
      id,
      next,
    );
    toast.success(
      next === "quick"
        ? "已切换到快速模式，高级设置仍会保留"
        : "已切换到专业模式，可查看全部调用规则",
    );
    if (!preferenceSaved)
      toast.warning("模式已经切换，但浏览器没有保存这项偏好。");
  }

  function updateBook(patch: Partial<WorldBook>) {
    setBook((current) =>
      current
        ? { ...current, ...patch, updatedAt: new Date().toISOString() }
        : current,
    );
  }
  function markSummaryStale() {
    setBook((current) =>
      current && current.coreSummary
        ? {
            ...current,
            coreSummaryStatus: "stale",
            updatedAt: new Date().toISOString(),
          }
        : current,
    );
  }
  function updateEntry(patch: Partial<WorldBookEntry>) {
    const current = selected;
    if (!current) return;
    const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
    setEntries((items) =>
      items.map((entry) => (entry.id === selectedId ? next : entry)),
    );
    const wasCore = resolveWorldBookActivationMode(current) === "core_rule";
    const isCore = resolveWorldBookActivationMode(next) === "core_rule";
    if (
      (wasCore || isCore) &&
      ("content" in patch ||
        "summary" in patch ||
        "title" in patch ||
        "activationMode" in patch)
    )
      markSummaryStale();
  }
  function changeActivation(mode: WorldBookEntryActivationMode) {
    if (!selected) return;
    updateEntry(withWorldBookActivationMode(selected, mode));
  }
  function addEntry(
    nextCategory: WorldBookEntryCategory = category === "all"
      ? "custom"
      : category,
  ) {
    if (!book) return;
    const created = createWorldBookEntry(uid("entry"), book.id, nextCategory);
    const entry =
      editorMode === "quick" ? applyWorldBookQuickDefaults(created) : created;
    setEntries((items) => [entry, ...items]);
    setSelectedId(entry.id);
  }
  function duplicateEntry() {
    if (!selected) return;
    const copy = normalizeWorldBookEntry({
      ...structuredClone(selected),
      id: uid("entry"),
      title: `${selected.title}（副本）`,
      relations: [],
      relatedEntryIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setEntries((items) => [copy, ...items]);
    setSelectedId(copy.id);
  }
  function deleteEntry() {
    if (!selected) return;
    const references = entries.filter((entry) =>
      entry.relatedEntryIds.includes(selected.id),
    );
    const detail = references.length
      ? `\n另有 ${references.length} 张资料卡关联它，删除后会同时移除这些关联。`
      : "";
    if (
      !window.confirm(
        `删除资料卡“${selected.title}”？${detail}\n此操作会先保存在编辑草稿中，正式发布前不会影响游戏。`,
      )
    )
      return;
    const remaining = entries
      .filter((entry) => entry.id !== selected.id)
      .map((entry) => ({
        ...entry,
        relations: (entry.relations || []).filter(
          (relation) => relation.targetEntryId !== selected.id,
        ),
        relatedEntryIds: entry.relatedEntryIds.filter(
          (related) => related !== selected.id,
        ),
      }));
    setEntries(remaining);
    setSelectedId(remaining[0]?.id || "");
  }

  function openRepairSuggestion(issueId?: string) {
    const suggestion = issueId
      ? repairSuggestions.find((item) => item.issueId === issueId)
      : repairSuggestions[0];
    setRepairSuggestionId(suggestion?.id);
    setRepairOpen(true);
  }

  function applyRepairs(suggestions: WorldBookRepairSuggestion[]) {
    if (!book || !suggestions.length) return;
    const affectedEntryIds = Array.from(
      new Set(suggestions.flatMap((item) => item.affectedEntryIds)),
    );
    setLastRepairUndo({
      entries: structuredClone(
        entries.filter((entry) => affectedEntryIds.includes(entry.id)),
      ),
      affectedEntryIds,
    });
    const result = applyWorldBookRepair(book, entries, suggestions);
    setBook(result.book);
    setEntries(result.entries);
    setRepairOpen(false);
    toast.success(`已应用 ${suggestions.length} 项修复，可随时撤销`);
  }

  function undoLastRepair() {
    if (!lastRepairUndo) return;
    const snapshots = new Map(
      lastRepairUndo.entries.map((entry) => [entry.id, entry]),
    );
    setEntries((current) =>
      current.map((entry) => snapshots.get(entry.id) || entry),
    );
    setLastRepairUndo(undefined);
    toast.success("已撤销最近一次修复，其他编辑内容保持不变");
  }

  function openAiStudio(mode: AiStudioMode) {
    if (mode === "entry" && !selected) {
      toast.error("请先选择一张资料卡");
      return;
    }
    setAiMenuOpen(false);
    setAiStudio(mode);
  }

  function focusEntry(entryId: string) {
    const target = entries.find((entry) => entry.id === entryId);
    if (!target) {
      toast.error("没有找到相关资料卡，它可能已被删除");
      return;
    }
    setQuery("");
    setCategory("all");
    setActivationFilter("all");
    setSelectedId(entryId);
    setDialogAction(null);
    toast.success(`已打开资料卡“${target.title.trim() || "未命名资料卡"}”`);
    window.setTimeout(() => {
      const editor = document.getElementById("worldbook-card-content");
      editor?.scrollIntoView({ behavior: "smooth", block: "start" });
      editor?.focus({ preventScroll: true });
    }, 80);
  }

  function rememberAiUndo() {
    setLastAiUndo({
      book: structuredClone(book!),
      entries: structuredClone(entries),
      selectedId,
    });
  }

  function applyGeneratedWorldBook(
    draft: GeneratedWorldBookDraft,
    selectedTemporaryIds: string[],
  ) {
    if (!book) return false;
    if (
      aiStudio === "full" &&
      entries.length > 0 &&
      !window.confirm(
        "当前世界书已有资料卡。继续后只会合并新标题，不会覆盖同名资料卡或锁定内容。是否继续？",
      )
    )
      return false;
    const chosen = draft.entries.filter((entry) =>
      selectedTemporaryIds.includes(entry.temporaryId),
    );
    if (!chosen.length) return false;
    rememberAiUndo();
    const generated = generatedDraftToEntries(book.id, {
      ...draft,
      entries: chosen,
    });
    const existingTitles = new Set(
      entries.map((entry) => entry.title.trim().toLowerCase()),
    );
    const unique = generated.filter(
      (entry) => !existingTitles.has(entry.title.trim().toLowerCase()),
    );
    const nextBookPatch: Partial<WorldBook> = {};
    if (!book.name.trim() || book.name === "未命名世界书")
      nextBookPatch.name = draft.suggestedNames[0] || book.name;
    if (!book.description.trim()) nextBookPatch.description = draft.description;
    if (!book.coreSummary.trim()) {
      nextBookPatch.coreSummary = draft.coreSummary;
      nextBookPatch.coreSummaryStatus = "manual";
    }
    nextBookPatch.tags = Array.from(
      new Set([...book.tags, ...draft.tags]),
    ).slice(0, 16);
    updateBook(nextBookPatch);
    setEntries((current) => {
      const merged = ensureUniqueWorldBookEntryIds([...current, ...unique]);
      const preserved = merged.entries.slice(0, current.length);
      const incoming = merged.entries.slice(current.length);
      return [...incoming, ...preserved];
    });
    setAiDraftEntryIds(unique.map((entry) => entry.id));
    if (unique[0]) setSelectedId(unique[0].id);
    toast.success(
      `已加入 ${unique.length} 张 AI 草稿${generated.length !== unique.length ? "，重复标题已跳过" : ""}`,
    );
    return true;
  }

  function applyGeneratedEntry(draft: GeneratedWorldBookDraft) {
    const candidate = draft.entries[0];
    if (!selected || !candidate) return false;
    rememberAiUndo();
    updateEntry({
      title: candidate.title,
      summary: candidate.summary,
      content: candidate.content,
      keywords: candidate.keywords,
      aliases: candidate.aliases,
    });
    setAiDraftEntryIds((current) =>
      Array.from(new Set([...current, selected.id])),
    );
    toast.success("AI 候选已应用到工作草稿，调用规则保持不变");
    return true;
  }

  function undoLastAiApply() {
    if (!lastAiUndo) return;
    setBook(lastAiUndo.book);
    setEntries(lastAiUndo.entries);
    setSelectedId(lastAiUndo.selectedId);
    setAiDraftEntryIds([]);
    setLastAiUndo(undefined);
    toast.success("已撤销上一次 AI 应用");
  }

  async function publish() {
    if (!book || !formalRevision || hasErrors) return;
    setPublishing(true);
    try {
      const now = new Date().toISOString();
      const cleanEntries = entries.map((entry) =>
        normalizeWorldBookEntry({
          ...entry,
          updatedAt: entry.updatedAt || now,
        }),
      );
      const result = await publishWorldBook({
        worldBookId: book.id,
        expectedRevision: formalRevision,
        candidateBook: book,
        candidateEntries: cleanEntries,
        note: versionNote,
        storage: worldBookPublishStorage,
      });
      if (!result.ok) {
        toast.error(formatWorldBookPublishFailure(result));
        return;
      }
      hydrated.current = false;
      setBook(result.book);
      setEntries(result.entries);
      setFormalRevision(result.revision);
      const cleanup = await cleanupPublishedWorldBookDraft(() =>
        worldBookEditorStorage.deleteDraft(draftKey),
      );
      setDraftStatus(cleanup === "clean" ? "clean" : "saved");
      window.setTimeout(() => {
        hydrated.current = true;
      }, 0);
      if (cleanup === "failed") {
        toast.warning("世界书已发布，但本地编辑草稿清理失败。");
      } else {
        toast.success(
          `已发布版本 V${result.version.versionNumber}，已有游戏不会自动升级`,
        );
      }
      setDialogAction(null);
      setVersionNote("");
      if (id === "new") router.replace(`/worldbooks/${result.book.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setPublishing(false);
    }
  }

  if (loading)
    return <div className="container py-16 muted">正在加载世界书…</div>;
  if (loadError || !book)
    return (
      <div className="container py-16">
        <div className="panel mx-auto max-w-xl p-6 text-center">
          <h1 className="mb-2 text-xl font-semibold">世界书加载失败</h1>
          <p className="muted mb-5">{loadError || "没有找到这本世界书。"}</p>
          <div className="flex justify-center gap-3">
            <button
              className="btn primary"
              type="button"
              onClick={() => setLoadAttempt((current) => current + 1)}
            >
              重新加载
            </button>
            <Link className="btn" href="/worldbooks">
              返回列表
            </Link>
          </div>
        </div>
      </div>
    );
  const statusText = {
    clean: "正式版本已保存",
    dirty: "有未保存草稿",
    saving: "正在自动保存草稿…",
    saved: "草稿已自动保存",
    error: "草稿保存失败",
  }[draftStatus];
  return (
    <div className="mx-auto w-[calc(100vw-32px)] max-w-[1500px] py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            className="btn icon-btn"
            href="/worldbooks"
            aria-label="返回世界书列表"
          >
            <ArrowLeft size={17} />
          </Link>
          <div className="min-w-0">
            <p className="mono gold text-[11px]">
              WORLD BOOK · V{book.versionNumber}
            </p>
            <h1 className="display truncate text-3xl">{book.name}</h1>
            <p
              className={`text-xs ${draftStatus === "error" ? "text-red-500" : "muted"}`}
            >
              {statusText}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-lg border hairline bg-[var(--panel2)] p-1"
            aria-label="编辑模式"
          >
            <button
              className={`rounded-md px-3 py-2 text-sm ${editorMode === "quick" ? "bg-[var(--panel)] font-medium shadow-sm" : "muted"}`}
              onClick={() => changeEditorMode("quick")}
            >
              快速
            </button>
            <button
              className={`rounded-md px-3 py-2 text-sm ${editorMode === "professional" ? "bg-[var(--panel)] font-medium shadow-sm" : "muted"}`}
              onClick={() => changeEditorMode("professional")}
            >
              专业
            </button>
          </div>
          {lastAiUndo ? (
            <button className="btn" onClick={undoLastAiApply}>
              <RotateCcw size={15} />
              撤销 AI 应用
            </button>
          ) : null}
          <div className="relative">
            <button
              className="btn btn-gold"
              aria-expanded={aiMenuOpen}
              onClick={() => setAiMenuOpen((current) => !current)}
            >
              <Sparkles size={15} />
              AI 创作
            </button>
            {aiMenuOpen ? (
              <div className="panel absolute right-0 z-40 mt-2 w-60 p-2 shadow-xl">
                <button
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--panel2)]"
                  onClick={() => openAiStudio("full")}
                >
                  从一句话生成世界书
                </button>
                <button
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--panel2)]"
                  onClick={() => openAiStudio("fill")}
                >
                  补全缺失内容
                </button>
                <button
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--panel2)]"
                  onClick={() => openAiStudio("category")}
                >
                  按分类生成资料卡
                </button>
                <button
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--panel2)]"
                  onClick={() => openAiStudio("entry")}
                >
                  辅助当前资料卡
                </button>
                <button
                  className="w-full rounded-md border-t hairline px-3 py-2 text-left text-sm hover:bg-[var(--panel2)]"
                  onClick={() => {
                    setAiMenuOpen(false);
                    toast.info(
                      `当前完整度 ${completion?.score ?? 0} 分：${completion?.required.length ?? 0} 项必须补充，${completion?.recommended.length ?? 0} 项建议完善`,
                    );
                  }}
                >
                  查看完整度
                </button>
              </div>
            ) : null}
          </div>
          <button
            className="btn"
            onClick={() =>
              id === "new"
                ? toast.info("请先保存世界书草稿")
                : setDialogAction("create")
            }
          >
            <BookOpen size={15} />
            用它创建游戏
          </button>
          <button
            className="btn btn-gold"
            disabled={publishing}
            onClick={() => setDialogAction("save")}
          >
            <Save size={15} />
            {id === "new" ? "保存世界书" : "发布新版本"}
          </button>
        </div>
      </header>

      <div className="mb-4 grid gap-3 rounded-xl border hairline bg-[var(--panel2)] px-5 py-4 text-sm leading-6 md:grid-cols-[1fr_auto] md:items-center">
        <p>
          <b>{editorMode === "quick" ? "快速模式：" : "专业模式："}</b>
          {editorMode === "quick"
            ? "只展示日常创作需要的内容。触发、排序等高级规则仍完整保留，切换模式不会丢失数据。"
            : "可精确控制资料卡何时进入上下文、优先级、可见性和关联关系。"}
        </p>
        {completion ? (
          <div className="min-w-52">
            <div className="flex items-center justify-between text-xs">
              <span className="muted">世界完整度</span>
              <b>{completion.score}/100</b>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--panel)]">
              <div
                className="h-full bg-[var(--gold)]"
                style={{ width: `${completion.score}%` }}
              />
            </div>
          </div>
        ) : null}
      </div>

      {tokenReport && editorMode === "professional" ? (
        <section className="panel mb-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <small className="muted">世界书每回合固定</small>
              <b className="block">约 {tokenReport.fixedTokens} Token</b>
            </div>
            <div>
              <small className="muted">核心摘要</small>
              <b className="block">{tokenReport.coreSummaryTokens} Token</b>
            </div>
            <div>
              <small className="muted">始终／核心</small>
              <b className="block">{tokenReport.fixedCount} 张</b>
            </div>
            <div>
              <small className="muted">按需资料</small>
              <b className="block">{tokenReport.conditionalCount} 张</b>
            </div>
            <div>
              <small className="muted">世界书整本详细发送</small>
              <b className="block">约 {tokenReport.allEntriesTokens} Token</b>
            </div>
          </div>
          <p className="muted mt-4 border-t hairline pt-3 text-xs leading-5">
            以上是按字符粗略计算的世界书文本占用，仅用于比较资料卡和预算，不是
            API
            账单。一次回合的实际总量还会包含系统提示词、项目与游戏状态、最近剧情、玩家输入，以及模型生成的回复；最终以服务商返回的
            usage 数据为准。
          </p>
        </section>
      ) : null}

      <details className="panel mb-4 p-5" open={id === "new"}>
        <summary className="cursor-pointer display text-xl">
          世界书基础信息
        </summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="field">
            <span className="label">世界书名称</span>
            <input
              className="input"
              value={book.name}
              onChange={(e) => updateBook({ name: e.target.value })}
            />
          </label>
          <WorldBookTagInput
            label="标签"
            value={book.tags}
            onChange={(tags) => updateBook({ tags })}
            placeholder="西方奇幻，魔法，中世纪"
          />
          <label className="field lg:col-span-2">
            <span className="label">简介</span>
            <textarea
              className="input textarea"
              value={book.description}
              onChange={(e) => updateBook({ description: e.target.value })}
            />
          </label>
          <label className="field lg:col-span-2">
            <span className="label">
              核心摘要{" "}
              <span className="tag ml-2">
                {
                  {
                    current: "最新",
                    stale: "可能过期",
                    manual: "手动修改",
                    empty: "尚未生成",
                  }[
                    book.coreSummaryStatus ||
                      (book.coreSummary ? "manual" : "empty")
                  ]
                }
              </span>
            </span>
            <textarea
              className="input textarea"
              value={book.coreSummary}
              onChange={(e) =>
                updateBook({
                  coreSummary: e.target.value,
                  coreSummaryStatus: e.target.value.trim() ? "manual" : "empty",
                })
              }
            />
            <small className="muted">
              每回合都会发送，约 {estimateWorldBookTokens(book.coreSummary)}{" "}
              Token。只写世界前提、时代、基调和最重要规则。
            </small>
            {book.coreSummaryStatus === "stale" ? (
              <button
                className="btn mt-2 w-fit"
                onClick={() => updateBook({ coreSummaryStatus: "manual" })}
              >
                保留当前手写摘要
              </button>
            ) : null}
          </label>
        </div>
      </details>

      {editorMode === "professional" ? (
        <WorldBookRetrievalTester book={book} entries={entries} />
      ) : completion ? (
        <section className="panel mb-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="display text-xl">完善建议</h2>
              <p className="muted mt-1 text-sm">
                这些提示不会阻止保存，可以逐步补充。
              </p>
            </div>
            <span className="tag">完整度 {completion.score}/100</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {completion.items
              .filter((item) => item.level !== "optional")
              .map((item) =>
                item.entryIds?.[0] ? (
                  <button
                    className="rounded-full border hairline px-3 py-1 text-left text-xs transition-colors hover:border-[var(--gold)] hover:bg-[var(--panel2)]"
                    key={item.id}
                    title={item.detail || "打开相关资料卡"}
                    onClick={() => focusEntry(item.entryIds![0])}
                  >
                    {item.label} <span className="gold">→</span>
                  </button>
                ) : (
                  <span
                    className="rounded-full border hairline px-3 py-1 text-xs"
                    key={item.id}
                  >
                    {item.label}
                  </span>
                ),
              )}
            {!completion.required.length && !completion.recommended.length ? (
              <span className="text-sm">基础结构已经完整。</span>
            ) : null}
          </div>
        </section>
      ) : null}

      {editorMode === "quick" ? (
        <QuickWorldBookRetrievalTester book={book} entries={entries} />
      ) : null}

      <div
        id="worldbook-card-editor"
        className="grid min-h-[680px] scroll-mt-20 gap-4 lg:grid-cols-[250px_minmax(500px,1fr)_300px]"
      >
        <aside className="panel flex min-h-0 flex-col overflow-hidden lg:sticky lg:top-20 lg:h-[calc(100vh-100px)]">
          <div className="border-b hairline p-3">
            <div className="relative">
              <Search
                className="muted pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                size={14}
              />
              <input
                className="input worldbook-search-input"
                placeholder="搜索资料卡"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              className="input mt-2"
              value={category}
              onChange={(e) => setCategory(e.target.value as typeof category)}
            >
              <option value="all">全部分类</option>
              {WORLD_BOOK_CATEGORIES.map((key) => (
                <option key={key} value={key}>
                  {WORLD_BOOK_CATEGORY_LABELS[key]}
                </option>
              ))}
            </select>
            {editorMode === "professional" ? (
              <select
                className="input mt-2"
                value={activationFilter}
                onChange={(e) =>
                  setActivationFilter(e.target.value as typeof activationFilter)
                }
              >
                <option value="all">全部调用方式</option>
                <option value="conditional">按需调用</option>
                <option value="always">始终加载</option>
                <option value="core_rule">核心规则</option>
                <option value="disabled">暂不使用</option>
                <option value="incomplete">需要补充</option>
              </select>
            ) : null}
          </div>
          <div className="scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {filtered.map((entry) => (
              <button
                key={entry.id}
                className={`mb-1 w-full rounded-md p-3 text-left text-sm ${selectedId === entry.id ? "bg-[var(--panel2)] gold" : "hover:bg-[var(--panel2)]"}`}
                onClick={() => setSelectedId(entry.id)}
              >
                <span className="block truncate font-medium">
                  {entry.title}
                </span>
                <small className="muted">
                  {WORLD_BOOK_CATEGORY_LABELS[entry.category]} ·{" "}
                  {editorMode === "quick"
                    ? resolveWorldBookActivationMode(entry) === "conditional"
                      ? `${entry.keywords.length + entry.aliases.length} 个识别词`
                      : WORLD_BOOK_ACTIVATION_LABELS[
                          resolveWorldBookActivationMode(entry)
                        ]
                    : WORLD_BOOK_ACTIVATION_LABELS[
                        resolveWorldBookActivationMode(entry)
                      ]}
                </small>
              </button>
            ))}
            {!filtered.length ? (
              <p className="muted p-4 text-center text-sm">没有匹配的资料卡</p>
            ) : null}
          </div>
          <button className="btn m-3" onClick={() => addEntry()}>
            <Plus size={15} />
            添加资料卡
          </button>
        </aside>

        <main
          id="worldbook-card-content"
          className="panel min-w-0 scroll-mt-20 p-5 outline-none"
          tabIndex={-1}
        >
          {!selected ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <h2 className="display text-2xl">选择或添加一张资料卡</h2>
                <p className="muted mt-2">
                  一张卡只写一个人物、地点、势力、物品或规则。
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="mono gold text-[10px]">CURRENT CARD</p>
                  <h2 className="display text-2xl">
                    {selected.title}
                    {selected.locked ? (
                      <Lock className="gold ml-2 inline" size={15} />
                    ) : null}
                    {aiDraftEntryIds.includes(selected.id) ? (
                      <span className="tag ml-2 align-middle text-[10px]">
                        AI 草稿
                      </span>
                    ) : null}
                  </h2>
                </div>
                <div className="flex gap-1">
                  <button
                    className="btn"
                    title="用 AI 辅助当前资料卡"
                    onClick={() => openAiStudio("entry")}
                  >
                    <Sparkles size={15} />
                    AI 辅助
                  </button>
                  <button
                    className="btn icon-btn"
                    title={
                      selected.locked ? "解除锁定" : "锁定，避免批量 AI 修改"
                    }
                    aria-label={
                      selected.locked ? "解除资料卡锁定" : "锁定资料卡"
                    }
                    onClick={() => updateEntry({ locked: !selected.locked })}
                  >
                    {selected.locked ? (
                      <Lock size={15} />
                    ) : (
                      <LockOpen size={15} />
                    )}
                  </button>
                  <button
                    className="btn icon-btn"
                    title="复制为新资料卡"
                    aria-label="复制为新资料卡"
                    onClick={duplicateEntry}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    className="btn icon-btn text-red-400"
                    title="删除资料卡"
                    aria-label="删除资料卡"
                    onClick={deleteEntry}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <label className="field">
                <span className="label">标题</span>
                <input
                  className="input"
                  value={selected.title}
                  onChange={(e) => {
                    if (editorMode === "quick") {
                      const next = updateQuickEntryTitle(
                        selected,
                        e.target.value,
                      );
                      updateEntry(next);
                    } else updateEntry({ title: e.target.value });
                  }}
                />
              </label>
              <label className="field">
                <span className="label">简短说明</span>
                <textarea
                  className="input textarea"
                  value={selected.summary}
                  placeholder="用 1～3 句话写最重要的信息；中等相关时只发送这段。"
                  onChange={(e) => updateEntry({ summary: e.target.value })}
                />
                <small className="muted">
                  约 {estimateWorldBookTokens(selected.summary)} Token
                </small>
              </label>
              <label className="field">
                <span className="label">详细设定</span>
                <textarea
                  className="input min-h-[330px] resize-y"
                  value={selected.content}
                  placeholder="写清外观、来历、规则、目的等细节；高度相关时发送。"
                  onChange={(e) => updateEntry({ content: e.target.value })}
                />
                <small className="muted">
                  约 {estimateWorldBookTokens(selected.content)} Token
                </small>
              </label>
            </div>
          )}
        </main>

        <aside className="panel min-h-0 p-5 lg:sticky lg:top-20 lg:h-[calc(100vh-100px)] lg:overflow-y-auto scrollbar">
          {!selected ? (
            <p className="muted text-sm">资料卡的调用规则会显示在这里。</p>
          ) : editorMode === "quick" ? (
            <div className="space-y-5">
              <div>
                <p className="mono gold text-[10px]">QUICK SETTINGS</p>
                <h2 className="display text-xl">这是什么资料？</h2>
                <p className="muted mt-2 text-xs leading-5">
                  快速模式会使用稳妥的默认调用规则；专业模式里已有的高级设置不会被覆盖。
                </p>
              </div>
              <label className="field">
                <span className="label">资料类型</span>
                <select
                  className="input"
                  value={selected.category}
                  onChange={(e) =>
                    updateEntry(
                      refreshAutoWorldBookTriggers({
                        ...selected,
                        category: e.target.value as WorldBookEntryCategory,
                      }),
                    )
                  }
                >
                  {WORLD_BOOK_CATEGORIES.map((key) => (
                    <option key={key} value={key}>
                      {WORLD_BOOK_CATEGORY_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-start gap-2 rounded-lg border hairline bg-[var(--panel2)] p-3 text-sm">
                <input
                  type="checkbox"
                  checked={
                    resolveWorldBookActivationMode(selected) === "core_rule"
                  }
                  onChange={(e) =>
                    changeActivation(
                      e.target.checked ? "core_rule" : "conditional",
                    )
                  }
                />
                <span>
                  这是必须遵守的核心规则
                  <small className="muted mt-1 block">
                    开启后每回合都会优先提供给 AI；普通人物、地点通常无需开启。
                  </small>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.visibility === "player_visible"}
                  onChange={(e) =>
                    updateEntry({
                      visibility: e.target.checked
                        ? "player_visible"
                        : "ai_only",
                    })
                  }
                />
                <span>允许玩家在资料中查看</span>
              </label>
              <WorldBookQuickTriggerSettings
                entry={selected}
                onChange={(next) => updateEntry(next)}
                onSwitchProfessional={() => changeEditorMode("professional")}
              />
              <button
                className="btn w-full"
                onClick={() => openAiStudio("entry")}
              >
                <Sparkles size={15} />用 AI 完善这张资料卡
              </button>
              <div className="rounded-lg border hairline p-3 text-xs leading-5">
                <b>{selected.locked ? "已锁定" : "未锁定"}</b>
                <p className="muted mt-1">
                  {selected.locked
                    ? "批量 AI 补全会跳过这张卡。你仍可主动对它使用单卡 AI。"
                    : "锁定后可保护已经定稿的重要设定。"}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="display text-xl">什么时候使用？</h2>
                <p className="muted mt-2 text-xs leading-5">
                  调用方式决定是否参加检索；重要程度只影响多张卡同时命中时的排序，不会单独触发资料卡。
                </p>
              </div>
              <label className="field">
                <span className="label">调用方式</span>
                <select
                  className="input"
                  value={resolveWorldBookActivationMode(selected)}
                  onChange={(e) =>
                    changeActivation(
                      e.target.value as WorldBookEntryActivationMode,
                    )
                  }
                >
                  {Object.entries(WORLD_BOOK_ACTIVATION_LABELS).map(
                    ([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
                <small className="muted">
                  {
                    {
                      conditional: "命中人物、地点、任务或触发词时才加载。",
                      always: "每回合加载，适合少量重要背景。",
                      core_rule: "每回合最高优先级加载，AI 必须遵守。",
                      disabled: "保留资料，但完全不参与检索。",
                    }[resolveWorldBookActivationMode(selected)]
                  }
                </small>
              </label>
              <label className="field">
                <span className="label">资料类型</span>
                <select
                  className="input"
                  value={selected.category}
                  onChange={(e) =>
                    updateEntry({
                      category: e.target.value as WorldBookEntryCategory,
                    })
                  }
                >
                  {WORLD_BOOK_CATEGORIES.map((key) => (
                    <option key={key} value={key}>
                      {WORLD_BOOK_CATEGORY_LABELS[key]}
                    </option>
                  ))}
                </select>
              </label>
              <WorldBookTagInput
                label="触发词"
                value={selected.keywords}
                onChange={(keywords) =>
                  updateEntry(
                    updateWorldBookTriggerValues(
                      selected,
                      "keywords",
                      keywords,
                      "manual",
                    ),
                  )
                }
                placeholder="伊莱娜，导师，银发法师"
              />
              <WorldBookTagInput
                label="其他叫法"
                value={selected.aliases}
                onChange={(aliases) =>
                  updateEntry(
                    updateWorldBookTriggerValues(
                      selected,
                      "aliases",
                      aliases,
                      "manual",
                    ),
                  )
                }
                placeholder="莱娜老师，银月导师"
              />
              <details className="rounded-lg border hairline bg-[var(--panel2)] p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  查看识别词来源与锁定状态
                </summary>
                <div className="mt-3 space-y-2">
                  {[
                    ...(selected.triggers || []),
                    ...(selected.aliasTriggers || []),
                  ].map((trigger) => (
                    <div
                      className="flex items-center justify-between gap-2 rounded-lg border hairline p-2 text-xs"
                      key={trigger.id}
                    >
                      <span className="min-w-0 truncate">
                        {trigger.value}{" "}
                        <span className="muted">
                          · {WORLD_BOOK_TRIGGER_SOURCE_LABELS[trigger.source]}
                        </span>
                      </span>
                      <button
                        className="btn icon-btn !h-8 !w-8"
                        title={
                          trigger.locked ? "解除锁定" : "锁定，避免自动更新"
                        }
                        aria-label={
                          trigger.locked ? "解除识别词锁定" : "锁定识别词"
                        }
                        onClick={() =>
                          updateEntry(
                            setWorldBookTriggerLock(
                              selected,
                              trigger.id,
                              !trigger.locked,
                            ),
                          )
                        }
                      >
                        {trigger.locked ? (
                          <Lock size={13} />
                        ) : (
                          <LockOpen size={13} />
                        )}
                      </button>
                    </div>
                  ))}
                  {!selected.triggers?.length &&
                  !selected.aliasTriggers?.length ? (
                    <p className="muted text-xs">
                      旧版识别词会在保存或再次编辑时自动标记为“旧版/导入”。
                    </p>
                  ) : null}
                </div>
              </details>
              <details
                className="rounded-lg border hairline bg-[var(--panel2)] p-3"
                open
              >
                <summary className="cursor-pointer font-medium">
                  生效条件
                </summary>
                <div className="mt-4 space-y-4">
                  <WorldBookTagInput
                    label="只在这些地点使用（留空代表全部地点）"
                    value={selected.activeRegions || []}
                    onChange={(activeRegions) => updateEntry({ activeRegions })}
                    placeholder="洛维拉小镇，北境"
                  />
                  <WorldBookTagInput
                    label="只在这些时期使用（留空代表全部时期）"
                    value={selected.activePeriods || []}
                    onChange={(activePeriods) => updateEntry({ activePeriods })}
                    placeholder="帝国历 320 年，战争时期"
                  />
                </div>
              </details>
              <details className="rounded-lg border hairline bg-[var(--panel2)] p-3">
                <summary className="cursor-pointer font-medium">
                  排序、可见性与关联
                </summary>
                <div className="mt-4 space-y-4">
                  <label className="field">
                    <span className="label">重要程度</span>
                    <select
                      className="input"
                      value={importanceValue(selected.priority)}
                      onChange={(e) =>
                        updateEntry({ priority: Number(e.target.value) })
                      }
                    >
                      {IMPORTANCE.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <small className="muted">
                      只影响已命中资料卡的排序和预算分配；“核心优先级”不等于每回合加载。
                    </small>
                  </label>
                  <label className="field">
                    <span className="label">谁能看到？</span>
                    <select
                      className="input"
                      value={selected.visibility}
                      onChange={(e) =>
                        updateEntry({
                          visibility: e.target
                            .value as WorldBookEntry["visibility"],
                        })
                      }
                    >
                      <option value="player_visible">玩家可以查看</option>
                      <option value="ai_only">只给 AI 使用</option>
                      <option value="hidden_until_discovered">
                        剧情发现后玩家可见
                      </option>
                    </select>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.allowAiExpansion}
                      onChange={(e) =>
                        updateEntry({ allowAiExpansion: e.target.checked })
                      }
                    />
                    <span>
                      允许 AI 临时补充小细节
                      <small className="muted block">
                        只属于当前游戏，不会自动写回世界书。
                      </small>
                    </span>
                  </label>
                  <div>
                    <p className="label">相关资料卡</p>
                    <p className="muted text-xs">
                      普通关联只记录关系；“命中时一并调用”才会占用检索预算。旧版关联会按原行为保留为一并调用。
                    </p>
                    <div className="scrollbar mt-2 max-h-44 space-y-2 overflow-y-auto">
                      {entries
                        .filter((entry) => entry.id !== selected.id)
                        .map((entry) => (
                          <label
                            key={entry.id}
                            className="grid grid-cols-[minmax(0,1fr)_126px] items-center gap-2 text-xs"
                          >
                            <span className="min-w-0 truncate">
                              {entry.title}
                              <small className="muted ml-1">
                                {WORLD_BOOK_CATEGORY_LABELS[entry.category]}
                              </small>
                            </span>
                            <select
                              className="input !min-h-8 !px-2 !py-1 text-xs"
                              value={
                                selected.relations?.find(
                                  (relation) =>
                                    relation.targetEntryId === entry.id,
                                )?.relationType ||
                                (selected.relatedEntryIds.includes(entry.id)
                                  ? "load_with"
                                  : "none")
                              }
                              onChange={(e) =>
                                updateEntry(
                                  (() => {
                                    const relationType = e.target.value;
                                    const remaining = (
                                      selected.relations || []
                                    ).filter(
                                      (relation) =>
                                        relation.targetEntryId !== entry.id,
                                    );
                                    return {
                                      relations:
                                        relationType === "none"
                                          ? remaining
                                          : [
                                              ...remaining,
                                              {
                                                targetEntryId: entry.id,
                                                relationType: relationType as
                                                  "reference" | "load_with",
                                              },
                                            ],
                                      relatedEntryIds:
                                        relationType === "load_with"
                                          ? Array.from(
                                              new Set([
                                                ...selected.relatedEntryIds,
                                                entry.id,
                                              ]),
                                            )
                                          : selected.relatedEntryIds.filter(
                                              (id) => id !== entry.id,
                                            ),
                                    };
                                  })(),
                                )
                              }
                            >
                              <option value="none">不关联</option>
                              <option value="reference">普通关联</option>
                              <option value="load_with">命中时一并调用</option>
                            </select>
                          </label>
                        ))}
                    </div>
                  </div>
                </div>
              </details>
            </div>
          )}
        </aside>
      </div>

      {aiStudio ? (
        <WorldBookAiStudio
          open
          initialMode={aiStudio}
          book={book}
          entries={entries}
          targetEntry={selected}
          onClose={() => setAiStudio(undefined)}
          onApplyGenerated={applyGeneratedWorldBook}
          onApplyEntry={applyGeneratedEntry}
        />
      ) : null}

      {dialogAction ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="panel scrollbar max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="display text-2xl">
                  {dialogAction === "create"
                    ? "创建游戏前检查"
                    : id === "new"
                      ? "保存世界书草稿"
                      : "发布新版本"}
                </h2>
                <p className="muted mt-1 text-sm">
                  发现 {issues.length}{" "}
                  项提示；结构错误必须先修复，普通提醒可以确认后继续。
                </p>
              </div>
              <button
                className="btn icon-btn"
                aria-label="关闭"
                onClick={() => setDialogAction(null)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {issues.map((issue) => (
                <article
                  key={issue.id}
                  className={`rounded-lg border p-3 ${issue.severity === "error" ? "border-red-400/50" : "hairline"}`}
                >
                  <b>
                    {issue.severity === "error"
                      ? "必须修复："
                      : issue.severity === "warning"
                        ? "建议检查："
                        : "提示："}
                    {issue.title}
                  </b>
                  <p className="muted mt-1 text-xs">{issue.detail}</p>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {issue.entryIds?.[0] ? (
                      <button
                        className="gold text-xs"
                        onClick={() => focusEntry(issue.entryIds![0])}
                      >
                        打开相关资料卡
                      </button>
                    ) : null}
                    {repairSuggestions.some(
                      (suggestion) => suggestion.issueId === issue.id,
                    ) ? (
                      <button
                        className="gold text-xs"
                        onClick={() => openRepairSuggestion(issue.id)}
                      >
                        查看修复建议 →
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {!issues.length ? (
                <p className="rounded-lg border hairline p-4">
                  检查通过，没有发现明显问题。
                </p>
              ) : null}
            </div>
            {repairSuggestions.length ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border hairline bg-[var(--panel2)] p-3">
                <span className="text-sm">
                  已生成 {repairSuggestions.length} 项本地修复建议，其中{" "}
                  {repairSuggestions.filter((item) => item.safeToApply).length}{" "}
                  项可安全应用。
                </span>
                <div className="flex flex-wrap gap-2">
                  {lastRepairUndo ? (
                    <button className="btn" onClick={undoLastRepair}>
                      <RotateCcw size={14} /> 撤销最近修复
                    </button>
                  ) : null}
                  <button
                    className="btn"
                    onClick={() => openRepairSuggestion()}
                  >
                    查看全部建议
                  </button>
                </div>
              </div>
            ) : null}
            {dialogAction === "save" && id !== "new" ? (
              <label className="field mt-4">
                <span className="label">版本说明</span>
                <textarea
                  className="input textarea"
                  value={versionNote}
                  onChange={(e) => setVersionNote(e.target.value)}
                  placeholder="例如：补充北境地点，修正魔法规则。"
                />
              </label>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn" onClick={() => setDialogAction(null)}>
                返回检查
              </button>
              {dialogAction === "create" ? (
                <button
                  className="btn btn-gold"
                  disabled={hasErrors}
                  onClick={() => router.push(`/create?worldBook=${book.id}`)}
                >
                  确认并创建游戏
                </button>
              ) : (
                <button
                  className="btn btn-gold"
                  disabled={hasErrors || publishing}
                  onClick={() => void publish()}
                >
                  {publishing
                    ? "处理中…"
                    : id === "new"
                      ? "保存 V1 草稿"
                      : "发布新版本"}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <WorldBookRepairPanel
        open={repairOpen}
        suggestions={repairSuggestions}
        entries={entries}
        initialSuggestionId={repairSuggestionId}
        canUndo={Boolean(lastRepairUndo)}
        onClose={() => setRepairOpen(false)}
        onApply={applyRepairs}
        onFocusEntry={(entryId) => {
          setRepairOpen(false);
          focusEntry(entryId);
        }}
        onUndo={undoLastRepair}
      />
    </div>
  );
}
