"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  BookOpen,
  Building2,
  Castle,
  CloudSun,
  Copy,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Ellipsis,
  Expand,
  Eye,
  EyeOff,
  Ghost,
  GraduationCap,
  Heart,
  Infinity,
  Landmark,
  LibraryBig,
  ListTodo,
  MapPinned,
  Minimize2,
  Orbit,
  PackageOpen,
  Radiation,
  RefreshCcw,
  RotateCcw,
  Save as SaveIcon,
  Search,
  ScrollText,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { db, uid } from "@/lib/db";
import { loadAIConfig } from "@/lib/ai-config-repository";
import type {
  AIConfig,
  GameProject,
  GameSave,
  WorldBookTurnContext,
} from "@/lib/types";
import { createSave } from "@/lib/project";
import { playTurn } from "@/lib/ai-client";
import {
  exportAiPlayPackage,
  exportCurrentGame,
  exportLog,
} from "@/lib/export";
import { SaveManager } from "@/components/save-manager";
import { ConfirmDialog, ErrorState, LoadingState } from "@/components/common";
import { toast } from "sonner";
import { readableParagraphs, summaryParagraphs } from "@/lib/text";
import { displayLocationName } from "@/lib/location-label";
import { ensureSettingsVersions } from "@/lib/settings-version";
import { chapterForTurn, storyPacing } from "@/lib/story-length";
import {
  buildWorldBookRetrievalContext,
  retrieveWorldBookContext,
} from "@/lib/world-book";
import {
  createProjectSave,
  formatProjectSaveFailure,
  loadLatestProjectSave,
  loadProjectSave,
  updateProjectSave,
} from "@/lib/project-save-boundary";
import { projectSaveStorage } from "@/lib/project-save-storage";
import {
  formatPlayProjectLoadFailure,
  loadProjectForPlay,
} from "@/lib/play-project-loader";
import { displayAttributeName } from "@/lib/attribute-label";
import { readPlayLayout, writePlayLayout } from "@/lib/play-layout-persistence";
import {
  completePlayTurn,
  latestPlayerAction,
  preparePlayTurn,
  restorePreviousTurn,
} from "@/lib/play-turn-state";
import {
  resolveAndroidBackAction,
  resolvePlayShortcut,
} from "@/lib/platform/play-interaction";
import {
  isAppFullscreen,
  setAppFullscreen,
  toggleAppFullscreen,
} from "@/lib/platform/window-controls";
import { getPlatformCapabilities } from "@/lib/platform/capabilities";

function storyScrollStorageKey(projectId: string, saveId: string) {
  return `narrative-ark:story-scroll:v2:${projectId}:${saveId}`;
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT")
  );
}

export default function Play() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<GameProject | null>();
  const [s, setS] = useState<GameSave | null>();
  const [loadError, setLoadError] = useState("");
  const [config, setConfig] = useState<AIConfig>();
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [submittingAction, setSubmittingAction] = useState("");
  const [tab, setTab] = useState<"status" | "story" | "world">("story");
  const [clear, setClear] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [choicesOpen, setChoicesOpen] = useState(true);
  const [immersive, setImmersive] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [worldTab, setWorldTab] = useState<
    "memory" | "people" | "tasks" | "book"
  >("memory");
  const [confirmAction, setConfirmAction] = useState<
    "undo" | "regenerate" | null
  >(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [shellActions, setShellActions] = useState<HTMLElement | null>(null);
  const storyScroll = useRef<HTMLDivElement>(null);
  const actionInput = useRef<HTMLTextAreaElement>(null);
  const shortcutHandler = useRef<(event: KeyboardEvent) => void>(() => {});
  const androidBackHandler = useRef<(canGoBack: boolean) => void>(() => {});
  const pendingScrollMessageId = useRef<string | null>(null);
  const scrollSaveFrame = useRef<number | null>(null);
  const lastStoryScrollTop = useRef(0);
  const sendingRef = useRef(false);
  const activeTurnStartedAt = useRef<number | null>(null);
  const activeTurnElapsedMs = useRef(0);
  useEffect(() => {
    setShellActions(document.getElementById("app-shell-actions"));
  }, []);
  useEffect(() => {
    document.body.classList.add("play-mode");
    return () => document.body.classList.remove("play-mode");
  }, []);
  useEffect(() => {
    void isAppFullscreen().then(setFullscreen);
    const syncFullscreen = () =>
      void isAppFullscreen()
        .then(setFullscreen)
        .catch(() => {});
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen);
  }, []);
  useEffect(() => {
    const viewport = window.visualViewport;
    const syncViewport = () => {
      const height = viewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty(
        "--play-viewport-height",
        `${Math.round(height)}px`,
      );
      document.body.classList.toggle(
        "play-keyboard-open",
        Boolean(viewport && window.innerHeight - viewport.height > 140),
      );
    };
    syncViewport();
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    return () => {
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      document.documentElement.style.removeProperty("--play-viewport-height");
      document.body.classList.remove("play-keyboard-open");
    };
  }, []);
  useEffect(() => {
    const saved = readPlayLayout(
      localStorage,
      `narrative-ark:play-layout:${id}`,
    );
    setLeftOpen(saved.leftOpen);
    setRightOpen(saved.rightOpen);
    setImmersive(saved.immersive);
  }, [id]);
  useEffect(() => {
    if (!s?.id) return;
    activeTurnElapsedMs.current = 0;
    activeTurnStartedAt.current =
      document.visibilityState === "visible" ? new Date().getTime() : null;
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (activeTurnStartedAt.current !== null) {
          activeTurnElapsedMs.current +=
            new Date().getTime() - activeTurnStartedAt.current;
          activeTurnStartedAt.current = null;
        }
      } else if (!sendingRef.current && activeTurnStartedAt.current === null) {
        activeTurnStartedAt.current = new Date().getTime();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [s?.id]);

  function consumeActiveTurnDuration(now: number) {
    let elapsed = activeTurnElapsedMs.current;
    if (activeTurnStartedAt.current !== null) {
      elapsed += now - activeTurnStartedAt.current;
    }
    activeTurnElapsedMs.current = 0;
    activeTurnStartedAt.current = null;
    return elapsed;
  }

  function resumeActiveTurnTimer(now: number) {
    if (document.visibilityState === "visible") {
      activeTurnStartedAt.current = now;
    }
  }
  useEffect(() => {
    (async () => {
      setLoadError("");
      try {
        const loadedProject = await loadProjectForPlay({
          routeProjectId: id,
          readProject: (projectId) => db.projects.get(projectId),
        });
        setConfig(await loadAIConfig());
        if (!loadedProject.ok) {
          setP(null);
          setS(null);
          setLoadError(formatPlayProjectLoadFailure(loadedProject.code));
          return;
        }
        const project = loadedProject.value;
        setP(project);

        const wanted = new URLSearchParams(location.search).get("save");
        let loaded;
        if (wanted) {
          loaded = await loadProjectSave({
            routeProjectId: id,
            project,
            saveId: wanted,
            storage: projectSaveStorage,
          });
        } else {
          loaded = await loadLatestProjectSave({
            routeProjectId: id,
            project,
            storage: projectSaveStorage,
          });
          if (!loaded.ok && loaded.code === "save_not_found") {
            const initial = createSave(project);
            // 稳定 ID 只用于处理开发模式重复挂载；add 保证不会覆盖同 ID 记录。
            initial.id = `initial_${project.id}`;
            loaded = await createProjectSave({
              project,
              save: initial,
              storage: projectSaveStorage,
            });
            if (!loaded.ok && loaded.code === "save_id_conflict") {
              loaded = await loadProjectSave({
                routeProjectId: id,
                project,
                saveId: initial.id,
                storage: projectSaveStorage,
              });
            }
          }
        }
        if (!loaded.ok) {
          setS(null);
          setLoadError(formatProjectSaveFailure(loaded.code));
          return;
        }

        setS(loaded.value);
      } catch {
        setP(null);
        setS(null);
        setLoadError("项目或存档加载失败。");
      }
    })();
  }, [id]);
  useEffect(() => {
    const messageId = pendingScrollMessageId.current;
    const container = storyScroll.current;
    if (!messageId || !container) return;

    const frame = requestAnimationFrame(() => {
      const message = container.querySelector<HTMLElement>(
        `[data-message-id="${messageId}"]`,
      );
      if (!message) return;

      const containerTop = container.getBoundingClientRect().top;
      const messageTop = message.getBoundingClientRect().top;
      container.scrollTo({
        top: container.scrollTop + messageTop - containerTop - 8,
        behavior: "smooth",
      });
      pendingScrollMessageId.current = null;
    });

    return () => cancelAnimationFrame(frame);
  }, [s?.recentMessages.length]);
  useLayoutEffect(() => {
    const container = storyScroll.current;
    if (!container || !s?.id) return;
    const storageKey = storyScrollStorageKey(id, s.id);
    lastStoryScrollTop.current = 0;

    const saveNow = () => {
      try {
        if (container.scrollTop > 0 || lastStoryScrollTop.current === 0) {
          lastStoryScrollTop.current = container.scrollTop;
        }
        localStorage.setItem(storageKey, String(lastStoryScrollTop.current));
      } catch {
        // 浏览器禁用本地存储时保留当前会话体验，不阻断游玩。
      }
    };

    try {
      const savedPosition = localStorage.getItem(storageKey);
      const targetPosition =
        savedPosition === null
          ? container.scrollHeight - container.clientHeight
          : Number(savedPosition) || 0;
      container.scrollTop = targetPosition;
      lastStoryScrollTop.current = container.scrollTop;
    } catch {
      // 无本地存储权限时从剧情开头显示。
    }
    window.addEventListener("pagehide", saveNow);

    return () => {
      window.removeEventListener("pagehide", saveNow);
      saveNow();
    };
  }, [id, s?.id]);

  function rememberScrollPosition() {
    if (!s?.id || !storyScroll.current) return;
    lastStoryScrollTop.current = storyScroll.current.scrollTop;
    if (scrollSaveFrame.current !== null) {
      cancelAnimationFrame(scrollSaveFrame.current);
    }
    scrollSaveFrame.current = requestAnimationFrame(() => {
      if (!storyScroll.current) return;
      try {
        localStorage.setItem(
          storyScrollStorageKey(id, s.id),
          String(lastStoryScrollTop.current),
        );
      } catch {
        // 浏览器禁用本地存储时跳过跨会话恢复。
      }
      scrollSaveFrame.current = null;
    });
  }
  function saveLayout(
    nextLeft: boolean,
    nextRight: boolean,
    nextImmersive: boolean,
  ) {
    writePlayLayout(localStorage, `narrative-ark:play-layout:${id}`, {
      leftOpen: nextLeft,
      rightOpen: nextRight,
      immersive: nextImmersive,
    });
  }
  function updateSidebars(nextLeft: boolean, nextRight: boolean) {
    setLeftOpen(nextLeft);
    setRightOpen(nextRight);
    saveLayout(nextLeft, nextRight, immersive);
  }
  function toggleImmersive() {
    const next = !immersive;
    setImmersive(next);
    setTab("story");
    saveLayout(leftOpen, rightOpen, next);
  }
  async function toggleFullscreenNow() {
    try {
      setFullscreen(await toggleAppFullscreen());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "全屏切换失败");
    }
  }
  function showPlaySection(next: "status" | "story" | "world") {
    if (immersive && next !== "story") {
      setImmersive(false);
      saveLayout(leftOpen, rightOpen, false);
    }
    setTab(next);
  }
  async function persist(next: GameSave) {
    if (!p || p.id !== id) {
      throw new Error("项目不存在或当前地址已失效。");
    }
    const candidate = structuredClone(next);
    const expectedUpdatedAt = next.updatedAt;
    candidate.updatedAt = new Date(
      Math.max(new Date().getTime(), Date.parse(expectedUpdatedAt) + 1),
    ).toISOString();
    const result = await updateProjectSave({
      project: p,
      save: candidate,
      expectedUpdatedAt,
      storage: projectSaveStorage,
    });
    if (!result.ok) throw new Error(formatProjectSaveFailure(result.code));
    setS(result.value);
  }
  async function send(
    action = input,
    regenerate = false,
    saveOverride?: GameSave,
  ) {
    const activeSave = saveOverride ?? s;
    if (!p || !activeSave || sendingRef.current || !action.trim()) return;
    if (!config) {
      toast.error("尚未配置 API，请先到设置页连接模型");
      return;
    }
    sendingRef.current = true;
    setSending(true);
    setChoicesOpen(false);
    setSubmittingAction(action.trim());
    const activeTurnDuration = regenerate
      ? null
      : consumeActiveTurnDuration(new Date().getTime());
    const playerMessageId = uid("msg");
    const pending = preparePlayTurn(
      activeSave,
      action,
      playerMessageId,
      new Date().toISOString(),
    );
    pendingScrollMessageId.current = playerMessageId;
    setInput("");
    try {
      const storedLatestProject = await db.projects.get(p.id);
      const latestProject = storedLatestProject
        ? ensureSettingsVersions(storedLatestProject)
        : p;
      if (latestProject !== p) setP(latestProject);
      let worldBookContext: WorldBookTurnContext | undefined;
      if (latestProject.worldBinding) {
        const [worldBook, worldBookVersion] = await Promise.all([
          db.worldBooks.get(latestProject.worldBinding.worldBookId),
          db.worldBookVersions.get(
            latestProject.worldBinding.worldBookVersionId,
          ),
        ]);
        if (!worldBook || !worldBookVersion) {
          toast.warning(
            "绑定的世界书版本已不可用，本回合将使用项目内嵌设定继续，不会清空游戏进度。",
          );
        } else {
          worldBookContext = retrieveWorldBookContext(
            worldBook,
            worldBookVersion,
            buildWorldBookRetrievalContext(latestProject, pending.next, action),
            latestProject.worldBinding.contextBudget,
          );
        }
      }
      const result = await playTurn(
        config,
        latestProject,
        pending.next,
        action,
        regenerate,
        worldBookContext,
      );
      const next = completePlayTurn({
        pendingSave: pending.next,
        action: pending.action,
        response: result,
        narratorMessageId: uid("msg"),
        createdAt: new Date().toISOString(),
        settingsVersionId: latestProject.currentSettingsVersionId,
        settingsVersionNumber: latestProject.settingsVersionNumber,
        activeTurnDurationMs: activeTurnDuration,
        worldBookContext: worldBookContext?.preview,
      });
      setChoicesOpen(true);
      await persist(next);
      toast.success("本回合已自动保存");
    } catch (e) {
      pendingScrollMessageId.current = null;
      setChoicesOpen(true);
      setS(pending.base);
      setInput(action);
      toast.error(e instanceof Error ? e.message : "回合生成失败");
    } finally {
      sendingRef.current = false;
      setSending(false);
      setSubmittingAction("");
      resumeActiveTurnTimer(new Date().getTime());
    }
  }
  async function undoNow() {
    if (!s) return;
    const restored = restorePreviousTurn(s);
    if (!restored) return;
    await persist(restored);
    toast.success("已回退上一回合");
  }
  async function regenerateNow() {
    if (!s) return;
    const lastAction = latestPlayerAction(s);
    if (!lastAction) return;
    const restored = restorePreviousTurn(s);
    if (!restored) return;
    await persist(restored);
    await send(lastAction, true, restored);
  }
  useEffect(() => {
    shortcutHandler.current = (event) => {
      const action = resolvePlayShortcut({
        key: event.key,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        editable: isEditableTarget(event.target),
      });
      if (!action) return;
      event.preventDefault();
      if (typeof action === "object") {
        const latest = [...(s?.recentMessages ?? [])]
          .reverse()
          .find((message) => message.role === "narrator");
        const option = (
          (latest?.meta?.choices || []) as { id: string; text: string }[]
        )[action.choiceIndex];
        if (option && !sending) void send(option.text);
        return;
      }
      if (action === "fullscreen") void toggleFullscreenNow();
      if (action === "save") setSaveOpen(true);
      if (action === "immersive") toggleImmersive();
      if (action === "status") showPlaySection("status");
      if (action === "story") showPlaySection("story");
      if (action === "world") showPlaySection("world");
      if (action === "escape") {
        if (saveOpen) setSaveOpen(false);
        else if (moreOpen) setMoreOpen(false);
        else if (clear) setClear(false);
        else if (confirmAction) setConfirmAction(null);
        else if (tab !== "story") setTab("story");
        else if (fullscreen) {
          void setAppFullscreen(false).then(setFullscreen);
        }
      }
    };
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => shortcutHandler.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    androidBackHandler.current = (canGoBack) => {
      const active = document.activeElement;
      const action = resolveAndroidBackAction({
        modalOpen: saveOpen,
        menuOpen: moreOpen,
        confirmationOpen: clear || confirmAction !== null,
        section: tab,
        editing: isEditableTarget(active),
        canGoBack,
      });
      if (action === "close-modal") setSaveOpen(false);
      if (action === "close-menu") setMoreOpen(false);
      if (action === "close-confirmation") {
        setClear(false);
        setConfirmAction(null);
      }
      if (action === "show-story") setTab("story");
      if (action === "dismiss-keyboard" && active instanceof HTMLElement) {
        active.blur();
      }
      if (action === "history-back") history.back();
      if (action === "home") location.hash = "#/";
    };
  });
  useEffect(() => {
    const runtime = getPlatformCapabilities().runtime;
    if (!runtime.native || runtime.platform !== "android") return;
    let active = true;
    let listener: { unregister(): Promise<void> } | undefined;
    void import("@tauri-apps/api/app")
      .then(({ onBackButtonPress }) =>
        onBackButtonPress(({ canGoBack }) => {
          if (active) androidBackHandler.current(canGoBack);
        }),
      )
      .then((value) => {
        if (active) listener = value;
        else void value.unregister();
      });
    return () => {
      active = false;
      if (listener) void listener.unregister();
    };
  }, []);
  if (p === undefined || s === undefined)
    return (
      <section className="container py-12">
        <LoadingState text="正在唤醒世界…" />
      </section>
    );
  if (!p || !s)
    return (
      <section className="container py-12">
        <ErrorState message={loadError || "项目或存档不存在。"} />
      </section>
    );
  const latestNarrator = [...s.recentMessages]
    .reverse()
    .find((message) => message.role === "narrator");
  const choices = (latestNarrator?.meta?.choices || []) as {
    id: string;
    text: string;
  }[];
  const currentLocation = displayLocationName(
    s.currentLocationId,
    p.world.locations,
  );
  const locationIdTitle =
    currentLocation === s.currentLocationId ? undefined : s.currentLocationId;
  const pacing = storyPacing(p.projectInfo.gameLength, s.turn);
  const currentChapter = chapterForTurn(p, s);
  const worldTheme = getWorldTheme(p.projectInfo.genre);
  const playerSections = [
    {
      title: "状态效果",
      items: s.playerState.statusEffects.map((item) => item.name),
    },
    {
      title: "装备",
      items: s.playerState.equipment.map((item) => item.name),
    },
    {
      title: "物品",
      items: s.playerState.inventory.map(
        (item) => `${item.name} ×${item.quantity}`,
      ),
    },
    { title: "技能", items: p.player.skills.map((item) => item.name) },
    { title: "当前任务", items: s.activeQuests.map((item) => item.title) },
  ].filter((section) => section.items.length > 0);
  const worldTabs = [
    ["memory", "本回合"],
    ["people", "人物"],
    ["tasks", "任务"],
    ...(p.worldBinding ? ([["book", "世界书"]] as const) : []),
  ] as const;
  const showLeft = leftOpen && !immersive;
  const showRight = rightOpen && !immersive;
  const playGridColumns =
    showLeft && showRight
      ? "xl:grid-cols-[250px_minmax(720px,1fr)_320px]"
      : showLeft
        ? "xl:grid-cols-[250px_minmax(720px,1fr)]"
        : showRight
          ? "xl:grid-cols-[minmax(720px,1fr)_320px]"
          : "xl:grid-cols-[minmax(0,1fr)]";
  const leftPanelVisibility =
    tab === "status"
      ? showLeft
        ? "xl:block"
        : "xl:hidden"
      : showLeft
        ? "hidden xl:block"
        : "hidden";
  const rightPanelVisibility =
    tab === "world"
      ? showRight
        ? "flex xl:flex"
        : "flex xl:hidden"
      : showRight
        ? "hidden xl:flex"
        : "hidden";
  return (
    <section className="play-container play-gamebook flex h-[calc(100dvh-65px)] min-h-0 flex-col py-2 md:py-3">
      {shellActions &&
        createPortal(
          <>
            <Link
              aria-label="打开设定集"
              className="btn border-transparent bg-transparent"
              href={`/editor/${p.id}`}
            >
              <BookOpen size={15} />
              <span className="desktop-only">设定集</span>
            </Link>
            <button
              className={`btn border-transparent bg-transparent ${immersive ? "gold" : ""}`}
              onClick={toggleImmersive}
              title={immersive ? "恢复侧栏布局" : "进入沉浸阅读模式"}
              aria-label={immersive ? "退出沉浸阅读模式" : "进入沉浸阅读模式"}
              aria-pressed={immersive}
            >
              {immersive ? <EyeOff size={15} /> : <Eye size={15} />}
              <span className="desktop-only">
                {immersive ? "恢复布局" : "沉浸阅读"}
              </span>
            </button>
            <button
              className="desktop-fullscreen-control btn border-transparent bg-transparent"
              onClick={toggleFullscreenNow}
              title="切换全屏（F11）"
              aria-label={fullscreen ? "退出全屏" : "进入全屏"}
              aria-pressed={fullscreen}
            >
              {fullscreen ? <Minimize2 size={15} /> : <Expand size={15} />}
              <span className="desktop-only">
                {fullscreen ? "退出全屏" : "全屏"}
              </span>
            </button>
            <button
              aria-label="打开存档管理"
              className="btn border-transparent bg-transparent"
              onClick={() => setSaveOpen(true)}
            >
              <SaveIcon size={15} />
              <span className="desktop-only">存档</span>
            </button>
            <div className="relative">
              <button
                aria-label="打开更多操作"
                aria-expanded={moreOpen}
                className="btn icon-btn border-transparent bg-transparent"
                onClick={() => setMoreOpen((value) => !value)}
              >
                <Ellipsis size={18} />
              </button>
              {moreOpen && (
                <MoreMenu
                  onClose={() => setMoreOpen(false)}
                  onClear={() => {
                    setMoreOpen(false);
                    setClear(true);
                  }}
                  project={p}
                  save={s}
                />
              )}
            </div>
          </>,
          shellActions,
        )}
      <div className="gamebook-heading mb-2 flex min-h-10 shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display truncate text-xl md:text-2xl">
            {p.projectInfo.title}
          </h1>
          <p className="muted mt-0.5 truncate text-xs md:text-sm">
            第 {s.turn} 回合 · {currentChapter.title} · {pacing.phase} ·{" "}
            <span title={locationIdTitle}>{currentLocation}</span> ·{" "}
            {s.currentTime}
            {pacing.exceeded ? " · 已超出建议范围，剧情将逐步收束" : ""}
          </p>
        </div>
        <div className="hidden items-center gap-1 xl:flex">
          {!immersive && (
            <>
              {!showLeft && (
                <button
                  className="btn icon-btn muted"
                  onClick={() => updateSidebars(true, rightOpen)}
                  title="展开玩家状态栏"
                  aria-label="展开左侧玩家状态栏"
                  aria-pressed={false}
                >
                  <ChevronRight size={18} />
                </button>
              )}
              {!showRight && (
                <button
                  className="btn icon-btn muted"
                  onClick={() => updateSidebars(leftOpen, true)}
                  title="展开世界信息栏"
                  aria-label="展开右侧世界信息栏"
                  aria-pressed={false}
                >
                  <ChevronLeft size={18} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <div
        className={`gamebook-grid grid min-h-0 flex-1 gap-2 ${playGridColumns}`}
        data-testid="play-grid"
      >
        {!immersive && tab !== "story" && (
          <button
            className="mobile-drawer-scrim xl:hidden"
            aria-label="关闭信息抽屉"
            onClick={() => setTab("story")}
          />
        )}
        <aside
          className={`panel gamebook-player-rail scrollbar relative min-h-0 overflow-y-auto p-4 ${leftPanelVisibility}`}
          data-testid="player-panel"
        >
          <button
            className="desktop-panel-toggle btn icon-btn absolute top-2 right-2 border-transparent bg-transparent"
            onClick={() => updateSidebars(false, rightOpen)}
            title="收起玩家状态栏"
            aria-label="收起左侧玩家状态栏"
            aria-pressed={leftOpen}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="mobile-drawer-close btn icon-btn absolute top-2 right-2 border-transparent bg-transparent"
            onClick={() => setTab("story")}
            aria-label="关闭角色抽屉"
          >
            <X size={18} />
          </button>
          <p className="gamebook-rail-title">角色档案</p>
          <div className="gamebook-player-seal" aria-hidden="true">
            {(p.player.name || "旅").slice(0, 1)}
          </div>
          <h2 className="display gamebook-player-name mt-2 pr-8 text-xl">
            {p.player.name || "无名旅者"}
          </h2>
          <p className="muted gamebook-player-identity mt-1 text-sm">
            {p.player.identity}
          </p>
          <dl className="gamebook-context mt-4 space-y-3 border-y hairline py-3">
            <PlayerContextStat
              label="当前位置"
              value={currentLocation}
              title={locationIdTitle}
            />
            <PlayerContextStat label="当前时间" value={s.currentTime} />
          </dl>
          {!!Object.keys(s.playerState.attributes).length && (
            <dl className="gamebook-attributes mt-3 grid gap-2">
              {Object.entries(s.playerState.attributes).map(([k, v]) => (
                <CompactStat
                  key={k}
                  label={displayAttributeName(k, p.gameSystem.attributes)}
                  value={String(v)}
                  sourceLabel={k}
                />
              ))}
            </dl>
          )}
          {playerSections.length ? (
            playerSections.map((section) => (
              <CompactBlock
                key={section.title}
                title={section.title}
                items={section.items}
                initiallyOpen={section.title === "当前任务"}
              />
            ))
          ) : (
            <p className="muted mt-7 rounded-md bg-[var(--panel2)] px-3 py-3 text-xs leading-5">
              装备、物品、技能和任务会随着冒险逐步出现。
            </p>
          )}
        </aside>
        <main
          className="panel gamebook-story-page relative flex min-w-0 flex-col overflow-hidden"
          data-testid="story-panel"
        >
          <div
            ref={storyScroll}
            className="story-scrollbar gamebook-story-scroll min-h-[60%] flex-1 overflow-y-auto p-5 md:px-8 md:py-6"
            data-testid="story-scroll"
            onScroll={rememberScrollPosition}
          >
            <header className="gamebook-chapter-masthead">
              <div className="gamebook-safehouse-lineart" aria-hidden="true" />
              <p className="gamebook-chapter-overline">
                第 {s.turn} 回合 · {currentChapter.title}
              </p>
              <h2 className="display">{s.currentTime}</h2>
              <div className="gamebook-chapter-location">
                <span />
                <b title={locationIdTitle}>{currentLocation}</b>
                <span />
              </div>
            </header>
            {s.recentMessages.map((m) => (
              <article
                key={m.id}
                data-message-id={m.id}
                className={`gamebook-message mb-7 ${m.role === "player" ? "gamebook-player-action ml-auto max-w-[78%] pl-4" : "mx-auto max-w-[780px]"}`}
              >
                <small className="mono muted">
                  {m.role === "player"
                    ? "你的行动"
                    : m.role === "system"
                      ? "系统"
                      : "叙事者"}{" "}
                  · {m.turn}
                  {typeof m.meta?.settingsVersionNumber === "number"
                    ? ` · 设定 v${m.meta.settingsVersionNumber}`
                    : ""}
                </small>
                {m.role === "narrator" ? (
                  <NarrativeText content={m.content} />
                ) : (
                  <div className="mt-2 whitespace-pre-wrap text-sm leading-8">
                    {m.content}
                  </div>
                )}
                {Array.isArray(m.meta?.dialogue) &&
                  (
                    m.meta.dialogue as {
                      characterName: string;
                      content: string;
                    }[]
                  ).map((d, i) => (
                    <blockquote
                      className="gamebook-dialogue mt-3 border-l pl-4"
                      key={i}
                    >
                      <b className="text-sm">{d.characterName}</b>
                      <p className="mt-1">“{d.content}”</p>
                    </blockquote>
                  ))}
              </article>
            ))}
            {sending && (
              <div className="muted flex items-center gap-2 py-5">
                <Sparkles size={16} className="animate-pulse" />
                世界正在回应你的行动…
              </div>
            )}
          </div>
          <div
            className="choice-dock gamebook-action-dock flex max-h-[42%] min-h-0 shrink-0 flex-col border-t hairline p-3 md:p-4"
            data-world-theme={worldTheme.key}
            data-testid="choice-dock"
          >
            <div className="flex shrink-0 items-center justify-between gap-3">
              <ChoiceAtmosphere
                theme={worldTheme}
                genre={p.projectInfo.genre}
                location={currentLocation}
                time={s.currentTime}
              />
              {!!choices.length && (
                <button
                  className="muted relative z-10 inline-flex shrink-0 items-center gap-1 text-xs hover:text-[var(--paper)]"
                  onClick={() => setChoicesOpen((value) => !value)}
                  aria-expanded={choicesOpen}
                  aria-label={choicesOpen ? "收起推荐行动" : "展开推荐行动"}
                  title={choicesOpen ? "收起推荐行动" : "展开推荐行动"}
                >
                  {choicesOpen ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronUp size={14} />
                  )}
                  {choicesOpen ? "收起选项" : `${choices.length} 个选项`}
                </button>
              )}
            </div>
            {!!choices.length && (
              <div
                className={`gamebook-choices-scroll story-scrollbar mb-3 min-h-0 overflow-y-auto ${choicesOpen ? "block" : "hidden"}`}
              >
                <div className="gamebook-choice-grid pr-1">
                  {choices.map((c, index) => (
                    <button
                      className="choice-option gamebook-choice text-left text-sm"
                      key={c.id}
                      disabled={sending}
                      onClick={() => send(c.text)}
                    >
                      {sending && submittingAction === c.text ? (
                        <>
                          <Sparkles size={14} className="animate-pulse" />
                          正在推进…
                        </>
                      ) : (
                        <>
                          <span className="gamebook-choice-index">
                            {index + 1}
                          </span>
                          <span>{c.text}</span>
                        </>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-auto flex shrink-0 gap-2">
              <textarea
                ref={actionInput}
                className="input gamebook-action-input min-h-[48px] flex-1 resize-none"
                value={input}
                disabled={sending}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                enterKeyHint="send"
                placeholder="描述你的行动…（Enter 发送，Shift + Enter 换行）"
              />
              <button
                className="btn btn-gold gamebook-send h-auto"
                disabled={sending || !input.trim()}
                onClick={() => send()}
                aria-label="发送"
              >
                <ArrowUp size={18} />
                <span className="hidden md:inline">发送</span>
              </button>
            </div>
            <div className="mt-2 flex shrink-0 flex-wrap gap-x-3 gap-y-1">
              <button
                className="muted flex items-center gap-1 text-xs disabled:opacity-40"
                disabled={!s.history.length || sending}
                onClick={() => setConfirmAction("undo")}
              >
                <RotateCcw size={12} />
                回退
              </button>
              <button
                className="muted flex items-center gap-1 text-xs disabled:opacity-40"
                disabled={!s.history.length || sending}
                onClick={() => setConfirmAction("regenerate")}
              >
                <RefreshCcw size={12} />
                重新生成
              </button>
              <button
                className="muted flex items-center gap-1 text-xs disabled:opacity-40"
                disabled={!latestNarrator?.content}
                onClick={async () => {
                  if (!latestNarrator?.content) return;
                  await navigator.clipboard.writeText(latestNarrator.content);
                  toast.success("本回合正文已复制");
                }}
              >
                <Copy size={12} />
                复制本回合
              </button>
            </div>
          </div>
        </main>
        <aside
          className={`panel gamebook-index-rail min-h-0 flex-col overflow-hidden ${rightPanelVisibility}`}
          data-testid="world-panel"
        >
          <div className="gamebook-index-tabs flex shrink-0 items-center gap-1 border-b hairline p-2">
            <button
              className="desktop-panel-toggle btn icon-btn shrink-0 border-transparent bg-transparent"
              onClick={() => updateSidebars(leftOpen, false)}
              title="收起世界信息栏"
              aria-label="收起右侧世界信息栏"
              aria-pressed={rightOpen}
            >
              <ChevronRight size={18} />
            </button>
            <button
              className="mobile-drawer-close btn icon-btn shrink-0 border-transparent bg-transparent"
              onClick={() => setTab("story")}
              aria-label="关闭世界信息抽屉"
            >
              <X size={18} />
            </button>
            <div
              className={`grid min-w-0 flex-1 gap-1 ${worldTabs.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}
            >
              {worldTabs.map(([key, label]) => (
                <button
                  key={key}
                  className={`min-w-0 whitespace-nowrap px-1 py-2 text-xs transition-colors ${worldTab === key ? "active" : "muted hover:text-[var(--paper)]"}`}
                  onClick={() => setWorldTab(key)}
                  aria-pressed={worldTab === key}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div
            className={`${worldTab === "memory" ? "gamebook-context-panel scrollbar min-h-0 flex-1 overflow-y-auto p-4" : "hidden"}`}
          >
            <p className="gamebook-rail-title">本回合摘要</p>
            <Block title="重要记忆" items={s.importantMemories} />
            <SummaryBlock text={s.rollingSummary} />
          </div>
          <div
            className={`${worldTab === "people" ? "gamebook-context-panel scrollbar min-h-0 flex-1 overflow-y-auto p-4" : "hidden"}`}
          >
            <p className="gamebook-rail-title">在场人物</p>
            <NpcRelations project={p} save={s} />
          </div>
          <div
            className={`${worldTab === "tasks" ? "gamebook-context-panel scrollbar min-h-0 flex-1 overflow-y-auto p-4" : "hidden"}`}
          >
            <p className="gamebook-rail-title">任务与事件</p>
            <TaskPanel save={s} />
          </div>
          <div
            className={`${worldTab === "book" ? "gamebook-context-panel scrollbar min-h-0 flex-1 overflow-y-auto p-4" : "hidden"}`}
          >
            <p className="gamebook-rail-title">世界资料</p>
            {p.worldBinding ? (
              <div className="mt-4 space-y-4 text-sm">
                <div className="rounded-lg bg-[var(--panel2)] p-3">
                  <b>
                    {s.lastWorldBookContext?.worldBookName || "已绑定世界书"}
                  </b>
                  <p className="muted mt-1 text-xs">
                    固定版本 {p.worldBinding.worldBookVersionNumber} ·{" "}
                    {p.worldBinding.contextBudget.mode === "compact"
                      ? "精简"
                      : p.worldBinding.contextBudget.mode === "detailed"
                        ? "详细"
                        : "平衡"}
                    预算
                  </p>
                </div>
                {s.lastWorldBookContext ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border hairline p-3">
                        <span className="muted block">世界书注入估算</span>
                        <b>{s.lastWorldBookContext.injectedTokens} Token</b>
                      </div>
                      <div className="rounded-lg border hairline p-3">
                        <span className="muted block">相对整本节省</span>
                        <b>{s.lastWorldBookContext.estimatedSavingsPercent}%</b>
                      </div>
                    </div>
                    <p className="muted rounded-lg border hairline p-3 text-xs leading-5">
                      这里只统计本回合使用的世界书文本，不是整次 API
                      调用或账单用量；实际请求还包含系统提示词、剧情状态、玩家输入和模型回复。
                    </p>
                    <div>
                      <p className="label mb-2">本回合使用的世界资料</p>
                      <div className="space-y-2">
                        {s.lastWorldBookContext.selected.map((item) => {
                          const visible =
                            item.visibility === "player_visible" ||
                            (item.visibility === "hidden_until_discovered" &&
                              (s.discoveredWorldBookEntryIds || []).includes(
                                item.entryId,
                              ));
                          return (
                            <div
                              key={item.entryId}
                              className="rounded-lg bg-[var(--panel2)] p-3"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <b>{visible ? item.title : "未公开资料"}</b>
                                <span className="mono muted text-[10px]">
                                  {item.estimatedTokens} T
                                </span>
                              </div>
                              <p className="muted mt-1 text-xs">
                                {visible
                                  ? item.reasons.join(" · ")
                                  : "仅供叙事引擎保持一致性"}{" "}
                                · {item.injection === "full" ? "全文" : "摘要"}
                              </p>
                            </div>
                          );
                        })}
                        {!s.lastWorldBookContext.selected.length && (
                          <p className="muted">本回合只使用核心摘要。</p>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="muted">
                    开始下一回合后，这里会显示本回合实际使用了哪些资料，以及大约消耗多少模型用量。
                  </p>
                )}
                <Link
                  className="btn w-full"
                  href={`/worldbooks/${p.worldBinding.worldBookId}`}
                >
                  查看世界书
                </Link>
              </div>
            ) : (
              <p className="muted mt-4">这个旧项目没有绑定世界书。</p>
            )}
          </div>
        </aside>
      </div>
      <nav
        className={`mobile-play-nav xl:hidden ${immersive ? "hidden" : ""}`}
        aria-label="游玩信息导航"
      >
        <button
          className={tab === "story" ? "active" : ""}
          onClick={() => showPlaySection("story")}
          aria-current={tab === "story" ? "page" : undefined}
        >
          <ScrollText size={19} />
          <span>剧情</span>
        </button>
        <button
          className={tab === "status" ? "active" : ""}
          onClick={() => showPlaySection("status")}
          aria-current={tab === "status" ? "page" : undefined}
        >
          <UserRound size={19} />
          <span>角色</span>
        </button>
        <button
          className={tab === "world" && worldTab === "tasks" ? "active" : ""}
          onClick={() => {
            setWorldTab("tasks");
            showPlaySection("world");
          }}
          aria-current={
            tab === "world" && worldTab === "tasks" ? "page" : undefined
          }
        >
          <ListTodo size={19} />
          <span>任务</span>
        </button>
        <button
          className={tab === "world" && worldTab !== "tasks" ? "active" : ""}
          onClick={() => {
            setWorldTab(p.worldBinding ? "book" : "memory");
            showPlaySection("world");
          }}
          aria-current={
            tab === "world" && worldTab !== "tasks" ? "page" : undefined
          }
        >
          <LibraryBig size={19} />
          <span>{p.worldBinding ? "世界书" : "世界"}</span>
        </button>
      </nav>
      <PlayModal
        open={saveOpen}
        title="存档管理"
        description="保存当前进度，或从已有节点继续这段冒险。"
        onClose={() => setSaveOpen(false)}
      >
        <button
          className="btn btn-gold mb-4 w-full"
          onClick={async () => {
            try {
              await persist(s);
              toast.success("当前进度已保存");
            } catch (e) {
              toast.error(
                e instanceof Error ? e.message : "保存失败，请稍后重试。",
              );
            }
          }}
        >
          <SaveIcon size={15} />
          快速保存当前进度
        </button>
        <SaveManager
          project={p}
          routeProjectId={id}
          current={s}
          onLoad={(next) => {
            setS(next);
            setSaveOpen(false);
            toast.success(`已载入 ${next.name}`);
          }}
        />
      </PlayModal>
      <ConfirmDialog
        open={clear}
        title="清空当前游戏？"
        description="只会清空当前打开存档的回合、角色状态和剧情记录，并恢复到开场。项目设定和其他存档不会被删除。"
        confirmLabel="清空当前存档"
        onCancel={() => setClear(false)}
        onConfirm={async () => {
          const fresh = createSave(p, s.name);
          fresh.id = s.id;
          fresh.createdAt = s.createdAt;
          await persist(fresh);
          setClear(false);
          toast.success("已回到开场");
        }}
      />
      <ConfirmDialog
        open={confirmAction !== null}
        title={
          confirmAction === "regenerate"
            ? "重新生成当前回合？"
            : "返回上一回合？"
        }
        description={
          confirmAction === "regenerate"
            ? "当前 AI 回复将被替换，并会再次产生 API 消耗。"
            : "当前回合的剧情和状态变化将从这个存档中移除。"
        }
        confirmLabel={confirmAction === "regenerate" ? "重新生成" : "确认回退"}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          const action = confirmAction;
          setConfirmAction(null);
          if (action === "regenerate") await regenerateNow();
          if (action === "undo") await undoNow();
        }}
      />
    </section>
  );
}
function PlayerContextStat({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="muted text-[11px]">{label}</dt>
      <dd
        className="mt-1 min-w-0 break-words text-sm leading-5 font-medium"
        title={title}
      >
        {value}
      </dd>
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
function CompactStat({
  label,
  value,
  sourceLabel,
}: {
  label: string;
  value: string;
  sourceLabel?: string;
}) {
  const numericValue = Number(value);
  const supportsProgress = /生命|体力|精神|血源|力量|理智|魔力|耐力/.test(
    label,
  );
  const progress =
    Number.isFinite(numericValue) && supportsProgress
      ? Math.max(0, Math.min(100, numericValue))
      : null;
  const tone = label.includes("生命")
    ? "health"
    : label.includes("精神")
      ? "spirit"
      : label.includes("血") || label.includes("力量")
        ? "blood"
        : "neutral";
  return (
    <div
      className="gamebook-attribute"
      data-tone={tone}
      title={sourceLabel && sourceLabel !== label ? sourceLabel : undefined}
    >
      <div className="flex items-center justify-between gap-3">
        <dt className="muted truncate text-[11px]">{label}</dt>
        <dd className="truncate text-xs font-medium">
          {value}
          {progress !== null ? " / 100" : ""}
        </dd>
      </div>
      {progress !== null ? (
        <span className="gamebook-stat-track" aria-hidden="true">
          <i style={{ width: `${progress}%` }} />
        </span>
      ) : null}
    </div>
  );
}

function CompactBlock({
  title,
  items,
  initiallyOpen = false,
}: {
  title: string;
  items: string[];
  initiallyOpen?: boolean;
}) {
  return (
    <details
      className="gamebook-fold group mt-3 border-t hairline pt-3"
      open={initiallyOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs">
        <span className="font-medium">{title}</span>
        <span className="flex items-center gap-1.5">
          <span className="badge border-0 bg-[var(--panel2)] px-1.5 py-0.5 text-[10px]">
            {items.length}
          </span>
          <ChevronDown
            className="muted transition-transform group-open:rotate-180"
            size={14}
          />
        </span>
      </summary>
      <ul className="gamebook-fold-items mt-2 space-y-1.5">
        {items.map((item, index) => (
          <li
            className="px-2.5 py-2 text-xs leading-5"
            key={`${item}-${index}`}
          >
            {item}
          </li>
        ))}
      </ul>
    </details>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="gamebook-ruled-section mt-6">
      <h3 className="label mb-2">{title}</h3>
      {items.length ? (
        <ul>
          {items.slice(0, 3).map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      ) : (
        <p className="muted text-xs">暂无</p>
      )}
    </section>
  );
}

function TaskPanel({ save }: { save: GameSave }) {
  return (
    <div className="mt-5 space-y-6">
      <section>
        <h3 className="label mb-2">当前任务</h3>
        {save.activeQuests.length ? (
          <div className="space-y-2">
            {save.activeQuests.map((quest) => (
              <details
                className="rounded-md bg-[var(--panel2)] px-3 py-2"
                key={quest.id}
              >
                <summary className="cursor-pointer text-xs font-medium">
                  {quest.title}
                </summary>
                <p className="muted mt-2 text-xs leading-5">
                  {quest.description || "任务目标仍在逐步显现。"}
                </p>
                {!!quest.progress.length && (
                  <ul className="mt-2 space-y-1 text-xs leading-5">
                    {quest.progress.map((item, index) => (
                      <li key={index}>· {item}</li>
                    ))}
                  </ul>
                )}
              </details>
            ))}
          </div>
        ) : (
          <p className="muted text-xs leading-5">当前没有进行中的任务。</p>
        )}
      </section>
      <section>
        <h3 className="label mb-2">重要事件</h3>
        {save.triggeredEvents.length ? (
          <ul className="space-y-2">
            {save.triggeredEvents.map((event, index) => (
              <li
                className="rounded-md bg-[var(--panel2)] px-3 py-2 text-xs leading-5"
                key={`${event}-${index}`}
              >
                {event}
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted text-xs leading-5">尚无需要追踪的世界事件。</p>
        )}
      </section>
    </div>
  );
}

function PlayModal({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end bg-black/60 p-3 backdrop-blur-[2px] md:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="panel flex h-full w-full max-w-md flex-col overflow-hidden shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b hairline p-5">
          <div>
            <h2 className="display text-xl">{title}</h2>
            <p className="muted mt-1 text-xs leading-5">{description}</p>
          </div>
          <button
            className="btn icon-btn shrink-0 border-transparent bg-transparent"
            onClick={onClose}
            aria-label={`关闭${title}`}
          >
            <X size={17} />
          </button>
        </header>
        <div className="scrollbar min-h-0 flex-1 overflow-y-auto p-5">
          {children}
        </div>
      </section>
    </div>
  );
}

function MoreMenu({
  project,
  save,
  onClose,
  onClear,
}: {
  project: GameProject;
  save: GameSave;
  onClose: () => void;
  onClear: () => void;
}) {
  async function run(action: () => Promise<void> | void, message?: string) {
    try {
      await action();
      if (message) toast.success(message);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    }
  }
  return (
    <div className="panel absolute top-[calc(100%+8px)] right-0 z-[70] w-64 p-2 shadow-2xl">
      <p className="label px-2 py-1.5">导出</p>
      <Link
        className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--panel2)]"
        href={`/worldbooks/extract?project=${project.id}&save=${save.id}`}
        onClick={onClose}
      >
        <BookOpen className="mr-2 inline" size={14} />
        从当前游戏创建世界书
      </Link>
      <button
        className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--panel2)]"
        onClick={() =>
          run(() => exportAiPlayPackage(project), "请选择“另存为 PDF”完成导出")
        }
      >
        <Bot className="mr-2 inline" size={14} />
        导出 AI 文游包
      </button>
      <button
        className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--panel2)]"
        onClick={() =>
          run(() => exportCurrentGame(project, save), "当前游戏已导出")
        }
      >
        <PackageOpen className="mr-2 inline" size={14} />
        导出当前游戏
      </button>
      <button
        className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--panel2)]"
        onClick={() => run(() => exportLog(project, save))}
      >
        <Download className="mr-2 inline" size={14} />
        导出游戏记录
      </button>
      <div className="my-2 hidden border-t hairline xl:block" />
      <div className="hidden px-2 py-1 xl:block">
        <p className="label mb-2">快捷键</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="mono muted">F11</dt>
          <dd>全屏</dd>
          <dt className="mono muted">Ctrl S</dt>
          <dd>存档</dd>
          <dt className="mono muted">Alt 1/2/3</dt>
          <dd>角色 / 剧情 / 世界</dd>
          <dt className="mono muted">1—9</dt>
          <dd>选择推荐行动</dd>
        </dl>
      </div>
      <div className="my-2 border-t hairline" />
      <p className="label px-2 py-1.5">危险操作</p>
      <button
        className="w-full rounded-md px-3 py-2 text-left text-sm text-[var(--danger)] hover:bg-[var(--panel2)]"
        onClick={onClear}
      >
        <ScrollText className="mr-2 inline" size={14} />
        清空当前存档
      </button>
    </div>
  );
}

function relationStage(value: number) {
  if (value <= -60) return "敌对";
  if (value < -20) return "戒备";
  if (value < 20) return "陌生";
  if (value < 50) return "普通";
  if (value < 75) return "友好";
  if (value < 90) return "信赖";
  return "亲密";
}

function NpcRelations({
  project,
  save,
}: {
  project: GameProject;
  save: GameSave;
}) {
  return (
    <section className="gamebook-relations mt-6">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="label">NPC 关系</h3>
        <span className="muted text-[10px]">态度参考：-100～100</span>
      </div>
      {project.characters.length ? (
        <div className="space-y-3">
          {project.characters.map((character) => {
            const state = save.characterStates[character.id];
            const attitude = state?.attitude ?? character.attitude;
            const delta = attitude - character.attitude;
            return (
              <details className="gamebook-relation group" key={character.id}>
                <summary className="flex cursor-pointer list-none items-center gap-3 text-xs">
                  <span className="gamebook-relation-seal" aria-hidden="true">
                    {character.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <b className="truncate">{character.name}</b>
                      <em>{relationStage(attitude)}</em>
                    </span>
                    <span className="muted mt-1 block truncate">
                      {character.identity}
                    </span>
                    <span className="gamebook-trust-track" aria-hidden="true">
                      <i
                        style={{
                          width: `${Math.max(0, Math.min(100, (attitude + 100) / 2))}%`,
                        }}
                      />
                    </span>
                  </span>
                </summary>
                <dl className="mt-3 space-y-2 border-t hairline pt-3 text-xs leading-5">
                  <Stat label="身份" value={character.identity} />
                  <Stat label="既有关系" value={character.relationship} />
                  <Stat label="当前状态" value={state?.status || "正常"} />
                  <Stat
                    label="相较初始"
                    value={
                      delta === 0 ? "无变化" : `${delta > 0 ? "+" : ""}${delta}`
                    }
                  />
                  <div>
                    <dt className="muted">个人目标</dt>
                    <dd className="mt-1">{character.goal || "未知"}</dd>
                  </div>
                  <div>
                    <dt className="muted">重要记忆</dt>
                    <dd className="mt-1">
                      {state?.memories?.length
                        ? state.memories.join("；")
                        : "暂无记录"}
                    </dd>
                  </div>
                </dl>
              </details>
            );
          })}
        </div>
      ) : (
        <p className="muted text-xs">尚未遇见重要角色。</p>
      )}
    </section>
  );
}

function SummaryBlock({ text }: { text: string }) {
  const paragraphs = summaryParagraphs(text);
  return (
    <section className="gamebook-summary mt-6">
      <h3 className="label mb-2">剧情摘要</h3>
      {paragraphs.length ? (
        <div className="space-y-2">
          {paragraphs.slice(0, 2).map((paragraph, index) => (
            <p className="text-xs leading-6" key={index}>
              {paragraph}
            </p>
          ))}
        </div>
      ) : (
        <p className="muted text-xs">暂无</p>
      )}
    </section>
  );
}

function NarrativeText({ content }: { content: string }) {
  const paragraphs = readableParagraphs(content);
  return (
    <div className="display gamebook-narrative mt-3 space-y-5 text-[18px] leading-9 tracking-[0.025em]">
      {paragraphs.map((paragraph, index) => (
        <p key={index} style={{ textIndent: "2em" }}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}

type WorldTheme = {
  key: string;
  label: string;
  Icon: LucideIcon;
};

function getWorldTheme(genre: string): WorldTheme {
  if (genre === "西方玄幻")
    return { key: "arcane", label: "魔法纪事", Icon: Castle };
  if (["东方玄幻", "修仙"].includes(genre))
    return { key: "oriental", label: "云海异闻", Icon: CloudSun };
  if (genre === "都市")
    return { key: "urban", label: "城市脉搏", Icon: Building2 };
  if (genre === "校园")
    return { key: "urban", label: "青春手记", Icon: GraduationCap };
  if (genre === "末日")
    return { key: "wasteland", label: "废土纪行", Icon: Radiation };
  if (genre === "科幻")
    return { key: "future", label: "星际档案", Icon: Orbit };
  if (genre === "悬疑")
    return { key: "shadow", label: "谜案记录", Icon: Search };
  if (genre === "恐怖")
    return { key: "shadow", label: "幽夜见闻", Icon: Ghost };
  if (genre === "恋爱")
    return { key: "romance", label: "心绪篇章", Icon: Heart };
  if (genre === "历史")
    return { key: "archive", label: "旧世纪闻", Icon: Landmark };
  if (genre === "无限流")
    return { key: "future", label: "界域编号", Icon: Infinity };
  return { key: "archive", label: "世界纪行", Icon: MapPinned };
}

function ChoiceAtmosphere({
  theme,
  genre,
  location,
  time,
}: {
  theme: WorldTheme;
  genre: string;
  location: string;
  time: string;
}) {
  const { Icon } = theme;
  return (
    <div className="choice-atmosphere" aria-label="当前世界环境">
      <Icon className="choice-world-watermark" aria-hidden="true" />
      <div className="choice-atmosphere-title">
        <Icon size={14} aria-hidden="true" />
        <span>{theme.label}</span>
        <span className="choice-atmosphere-genre">{genre}</span>
      </div>
      <div className="choice-atmosphere-context">
        <span>{location}</span>
        <i aria-hidden="true" />
        <span>{time}</span>
      </div>
    </div>
  );
}
