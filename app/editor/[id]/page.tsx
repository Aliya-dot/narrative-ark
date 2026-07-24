"use client";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Bot,
  Braces,
  Clipboard,
  CopyPlus,
  History,
  Library,
  LayoutList,
  Play,
  RotateCcw,
  Save,
  ShieldAlert,
  X,
} from "lucide-react";
import { db, uid } from "@/lib/db";
import type {
  AIConfig,
  GameProject,
  GameSave,
  ModuleKey,
  ProjectSettingsSnapshot,
  SettingsVersion,
} from "@/lib/types";
import { MODULE_KEYS } from "@/lib/types";
import { rewriteModule } from "@/lib/ai-client";
import { ExportMenu } from "@/components/export-menu";
import { LoadingState, ErrorState } from "@/components/common";
import { toast } from "sonner";
import { projectText } from "@/lib/export";
import { StructuredEditor } from "@/components/structured-editor";
import {
  classifySettingsChange,
  createSettingsVersion,
  ensureSettingsVersions,
  sameSettings,
  settingsSnapshot,
  type SettingsRisk,
} from "@/lib/settings-version";
import { saveEditorProject } from "@/lib/editor-project-save";
import { formatProjectIntegrityFailure } from "@/lib/project-integrity-summary";
import { listProjectSaves } from "@/lib/project-save-boundary";
import { projectSaveStorage } from "@/lib/project-save-storage";
const labels: Record<ModuleKey, string> = {
  projectInfo: "游戏总览",
  world: "世界观",
  player: "主角",
  characters: "NPC 与关系",
  gameSystem: "数值与规则",
  story: "剧情结构",
  prompts: "系统提示词",
  openingScene: "开场剧情",
};
export default function Editor() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<GameProject>();
  const [config, setConfig] = useState<AIConfig>();
  const [key, setKey] = useState<ModuleKey>("projectInfo");
  const [text, setText] = useState("");
  const [value, setValue] = useState<unknown>();
  const [jsonMode, setJsonMode] = useState(false);
  const [history, setHistory] = useState<Partial<Record<ModuleKey, unknown>>>(
    {},
  );
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saves, setSaves] = useState<GameSave[]>([]);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState<{
    key: ModuleKey;
    settings: ProjectSettingsSnapshot;
    risk: SettingsRisk;
  }>();
  const savingRef = useRef(false);
  useEffect(() => {
    Promise.all([
      db.projects.get(id),
      db.configs.get("active"),
      listProjectSaves({ projectId: id, storage: projectSaveStorage }),
    ]).then(([a, c, projectSaves]) => {
      setConfig(c);
      setSaves(projectSaves.ok ? projectSaves.value : []);
      if (a) {
        const withLength = a.projectInfo.gameLength
          ? a
          : {
              ...a,
              projectInfo: {
                ...a.projectInfo,
                gameLength: "standard" as const,
              },
            };
        const normalized = ensureSettingsVersions(withLength);
        setP(normalized);
        setValue(structuredClone(normalized.projectInfo));
        setText(JSON.stringify(normalized.projectInfo, null, 2));
      } else {
        setP(a);
      }
    });
  }, [id]);
  function select(k: ModuleKey) {
    if (!p) return;
    setKey(k);
    setValue(structuredClone(p[k]));
    setText(
      typeof p[k] === "string"
        ? (p[k] as string)
        : JSON.stringify(p[k], null, 2),
    );
  }
  const currentTurn = saves.reduce((max, save) => Math.max(max, save.turn), 0);
  const gameStarted = saves.some((save) => save.turn > 0);

  async function commitSettings(
    settings: ProjectSettingsSnapshot,
    changedKey: ModuleKey,
    note?: string,
  ) {
    if (!p || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const next = createSettingsVersion(
        p,
        settings,
        gameStarted ? currentTurn + 1 : 0,
        note || `更新${labels[changedKey]}`,
      );
      const result = await saveEditorProject({
        project: next,
        saveProject: (project) => db.projects.put(project),
      });
      if (!result.ok) {
        toast.error(formatProjectIntegrityFailure(result.issues));
        return false;
      }
      setP(next);
      const nextValue = structuredClone(next[changedKey]);
      if (changedKey === key) {
        setValue(nextValue);
        setText(
          typeof nextValue === "string"
            ? nextValue
            : JSON.stringify(nextValue, null, 2),
        );
      }
      setHistory((old) => ({ ...old, [changedKey]: undefined }));
      setPendingSave(undefined);
      toast.success(
        gameStarted
          ? `设定版本 ${next.settingsVersionNumber} 已保存，将从第 ${currentTurn + 1} 回合开始生效`
          : `设定版本 ${next.settingsVersionNumber} 已保存，将用于游戏开局`,
      );
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "设定保存失败");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function save() {
    if (!p || savingRef.current) return;
    try {
      const nextValue =
        key === "openingScene" ? text : jsonMode ? JSON.parse(text) : value;
      if (sameSettings(p[key], nextValue)) {
        toast.info("当前模块没有实际修改");
        return;
      }
      const settings = settingsSnapshot(p);
      (settings as unknown as Record<ModuleKey, unknown>)[key] =
        structuredClone(nextValue);
      const risk = classifySettingsChange(key, p[key], nextValue);
      if (gameStarted && risk.level !== "low") {
        setPendingSave({ key, settings, risk });
        return;
      }
      await commitSettings(settings, key);
    } catch {
      toast.error("JSON 格式不正确，请检查括号与引号");
    }
  }
  async function copy(all = false) {
    const current =
      key === "openingScene"
        ? text
        : jsonMode
          ? text
          : JSON.stringify(value, null, 2);
    await navigator.clipboard.writeText(all && p ? projectText(p) : current);
    toast.success(all ? "完整包体已复制" : "当前模块已复制");
  }
  async function ai(instruction: string) {
    if (!p) return;
    if (!config) {
      toast.error("请先配置 API");
      return;
    }
    setBusy(true);
    try {
      const currentDraft =
        key === "openingScene" ? text : jsonMode ? JSON.parse(text) : value;
      const draftProject = {
        ...p,
        [key]: structuredClone(currentDraft),
      };
      const v = await rewriteModule(config, draftProject, key, instruction);
      setHistory((h) => ({
        ...h,
        [key]: structuredClone(currentDraft),
      }));
      setValue(structuredClone(v));
      setText(typeof v === "string" ? v : JSON.stringify(v, null, 2));
      toast.success("AI 结果已放入编辑区，点击保存后才会生效");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI 修改失败");
    } finally {
      setBusy(false);
    }
  }
  async function restoreVersion(
    version: SettingsVersion,
    matchingSave?: GameSave,
  ) {
    if (!p) return;
    const saved = await commitSettings(
      structuredClone(version.settingsSnapshot),
      key,
      `恢复自设定版本 ${version.versionNumber}`,
    );
    if (!saved) return;
    setVersionsOpen(false);
    if (matchingSave) {
      window.location.href = `/play/${p.id}?save=${matchingSave.id}`;
    }
  }
  async function duplicateWithSettings(settings: ProjectSettingsSnapshot) {
    if (!p) return;
    const now = new Date().toISOString();
    const raw: GameProject = {
      ...p,
      ...structuredClone(settings),
      id: uid("project"),
      createdAt: now,
      updatedAt: now,
      version: 1,
      settingsVersions: undefined,
      currentSettingsVersionId: undefined,
      settingsVersionNumber: undefined,
      projectInfo: {
        ...structuredClone(settings.projectInfo),
        title: `${settings.projectInfo.title} · 新版本`,
      },
    };
    const duplicate = ensureSettingsVersions(raw);
    try {
      const result = await saveEditorProject({
        project: duplicate,
        saveProject: (project) => db.projects.put(project),
      });
      if (!result.ok) {
        toast.error(formatProjectIntegrityFailure(result.issues));
        return;
      }
      toast.success("已复制为新项目，原项目和存档保持不变");
      window.location.href = `/editor/${duplicate.id}`;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "项目复制失败");
    }
  }
  if (p === undefined)
    return (
      <section className="container py-12">
        <LoadingState />
      </section>
    );
  if (!p)
    return (
      <section className="container py-12">
        <ErrorState message="找不到这个项目，它可能已被删除。" />
      </section>
    );
  const draftComparable =
    key === "openingScene" ? text : jsonMode ? text : value;
  const hasDraftChange = jsonMode
    ? text !== JSON.stringify(p[key], null, 2)
    : !sameSettings(p[key], draftComparable);
  return (
    <section className="container py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge">
              设定版本 {p.settingsVersionNumber || 1}
            </span>
            <span className="badge">
              {gameStarted
                ? `已开始游玩 · 当前第 ${currentTurn} 回合`
                : "项目尚未开始"}
            </span>
          </div>
          <h1 className="display mt-2 text-3xl">{p.projectInfo.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => setVersionsOpen(true)}>
            <History size={15} />
            版本记录
          </button>
          <button className="btn" onClick={() => copy(true)}>
            <Clipboard size={15} />
            复制全部
          </button>
          <ExportMenu project={p} />
          <Link className="btn" href={`/worldbooks/extract?project=${p.id}`}>
            <Library size={15} />
            提取为世界书
          </Link>
          <Link className="btn btn-gold" href={`/play/${p.id}`}>
            <Play size={15} />
            {gameStarted ? "继续游玩" : "开始游玩"}
          </Link>
        </div>
      </div>
      <div className="mt-7 grid min-h-[70vh] gap-4 lg:grid-cols-[230px_1fr]">
        <aside className="panel h-fit p-2 lg:sticky lg:top-24">
          {MODULE_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => select(k)}
              className={`w-full rounded-lg px-4 py-3 text-left text-sm ${key === k ? "bg-[var(--panel2)] gold" : "muted hover:bg-[var(--panel2)]"}`}
            >
              {labels[k]}
            </button>
          ))}
        </aside>
        <div className="panel flex min-w-0 flex-col p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b hairline pb-4">
            <div>
              <p className="display text-xl">{labels[key]}</p>
              <p className="muted mt-1 text-xs">
                {key === "openingScene"
                  ? "纯文本编辑"
                  : jsonMode
                    ? "高级 JSON 编辑"
                    : "直观表单编辑"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={() => copy()}>
                <Clipboard size={14} />
                复制
              </button>
              <button
                className="btn"
                disabled={!hasDraftChange && history[key] === undefined}
                onClick={() => {
                  const previous = history[key] ?? p[key];
                  if (previous !== undefined) {
                    setValue(structuredClone(previous));
                    setText(
                      typeof previous === "string"
                        ? previous
                        : JSON.stringify(previous, null, 2),
                    );
                    setHistory((old) => ({ ...old, [key]: undefined }));
                  }
                }}
              >
                <RotateCcw size={14} />
                撤销未保存修改
              </button>
              <button
                className="btn btn-primary"
                disabled={saving || busy}
                onClick={save}
              >
                <Save size={14} />
                {saving ? "正在保存…" : "保存"}
              </button>
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--gold)_45%,var(--line))] bg-[color-mix(in_srgb,var(--gold)_8%,transparent)] px-3 py-2 text-xs leading-5">
            {gameStarted
              ? `修改默认从第 ${currentTurn + 1} 回合开始生效，不会改写已有剧情、玩家状态或世界记忆。`
              : "项目尚未开始，保存的设定将用于首次开局。"}
          </div>
          {key !== "openingScene" && (
            <div className="mt-5 flex w-fit rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-1">
              <button
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs transition ${!jsonMode ? "bg-[var(--panel)] text-[var(--paper)]" : "muted"}`}
                type="button"
                onClick={() => {
                  if (jsonMode) {
                    try {
                      const parsed = JSON.parse(text);
                      setValue(parsed);
                      setJsonMode(false);
                    } catch {
                      toast.error("JSON 格式不正确，修正后才能切换到表单");
                    }
                  }
                }}
              >
                <LayoutList size={14} />
                表单
              </button>
              <button
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs transition ${jsonMode ? "bg-[var(--panel)] text-[var(--paper)]" : "muted"}`}
                type="button"
                onClick={() => {
                  setText(JSON.stringify(value, null, 2));
                  setJsonMode(true);
                }}
              >
                <Braces size={14} />
                JSON
              </button>
            </div>
          )}
          <div className="scrollbar my-5 min-h-[480px] flex-1 overflow-auto rounded-xl border border-[var(--line)] bg-[var(--ink)] p-4 md:p-5">
            {key === "openingScene" || jsonMode ? (
              <textarea
                className={`min-h-[440px] w-full resize-y bg-transparent outline-none ${jsonMode ? "font-mono text-sm leading-6" : "text-base leading-8"}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={!jsonMode}
              />
            ) : (
              <StructuredEditor
                value={value}
                rootKey={key}
                onChange={(next) => setValue(next)}
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2 border-t hairline pt-4">
            <span className="mr-2 flex items-center gap-2 text-sm muted">
              <Bot size={16} />
              AI 辅助
            </span>
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                ai(
                  "在保持数据结构和核心事实的前提下重写，使内容更具体、更适合游玩",
                )
              }
            >
              重写
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                ai("扩写细节，但不要改变既有事实；保持相同 JSON 结构")
              }
            >
              扩写
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                ai("精简冗余表达，保留所有重要规则和事实；保持相同 JSON 结构")
              }
            >
              简化
            </button>
            {busy && (
              <span className="muted self-center text-sm">模型正在处理…</span>
            )}
          </div>
        </div>
      </div>
      <EditorModal
        open={versionsOpen}
        title="设定版本记录"
        description="恢复旧版会创建一个新的当前版本，不会删除历史版本、游戏回合或存档。"
        onClose={() => setVersionsOpen(false)}
      >
        <div className="space-y-3">
          {[...(p.settingsVersions || [])].reverse().map((version) => {
            const matchingSave = saves.find(
              (save) => save.settingsVersionId === version.id,
            );
            const current = version.id === p.currentSettingsVersionId;
            return (
              <article
                className={`rounded-xl border p-4 ${current ? "border-[var(--gold)]" : "hairline"}`}
                key={version.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <b className="text-sm">设定版本 {version.versionNumber}</b>
                    {current && <span className="badge ml-2">当前使用</span>}
                    <p className="muted mt-1 text-xs leading-5">
                      {version.note || "设定更新"} · 从
                      {version.effectiveFromTurn > 0
                        ? `第 ${version.effectiveFromTurn} 回合`
                        : "开局"}
                      生效
                    </p>
                    <p className="muted mt-1 text-[11px]">
                      {new Date(version.updatedAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                {!current && (
                  <div className="mt-3 flex flex-wrap gap-2 border-t hairline pt-3">
                    <button
                      className="btn"
                      onClick={() => restoreVersion(version)}
                    >
                      <RotateCcw size={14} />
                      仅恢复设定集
                    </button>
                    {matchingSave && (
                      <button
                        className="btn"
                        onClick={() => restoreVersion(version, matchingSave)}
                      >
                        <Play size={14} />
                        恢复并读取对应存档
                      </button>
                    )}
                    <button
                      className="btn"
                      onClick={() =>
                        duplicateWithSettings(version.settingsSnapshot)
                      }
                    >
                      <CopyPlus size={14} />
                      复制为新项目
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </EditorModal>
      <EditorModal
        open={!!pendingSave}
        title={
          pendingSave?.risk.level === "high"
            ? "检测到高风险结构修改"
            : "这项修改可能与已有剧情冲突"
        }
        description={
          pendingSave?.risk.level === "high"
            ? "修改可能影响当前存档引用的世界、角色或数值结构。不会静默覆盖已有剧情。"
            : `当前游戏已经进行到第 ${currentTurn} 回合，请选择修改的应用方式。`
        }
        onClose={() => setPendingSave(undefined)}
      >
        {pendingSave && (
          <>
            <div className="rounded-lg border border-[color-mix(in_srgb,var(--gold)_55%,var(--line))] bg-[color-mix(in_srgb,var(--gold)_10%,transparent)] p-3">
              <div className="flex items-center gap-2 text-sm font-medium gold">
                <ShieldAlert size={16} />
                {pendingSave.risk.level === "high"
                  ? "建议优先复制为新项目"
                  : "默认从下一回合生效"}
              </div>
              <ul className="mt-2 space-y-1 text-xs leading-5">
                {pendingSave.risk.reasons.map((reason) => (
                  <li key={reason}>· {reason}</li>
                ))}
              </ul>
            </div>
            <div className="mt-5 grid gap-2">
              {pendingSave.risk.level === "medium" && (
                <button
                  className="btn btn-gold justify-start"
                  disabled={saving}
                  onClick={() =>
                    commitSettings(
                      pendingSave.settings,
                      pendingSave.key,
                      `${labels[pendingSave.key]}：保存修改，从下一回合生效`,
                    )
                  }
                >
                  保存修改，从第 {currentTurn + 1} 回合生效
                </button>
              )}
              {pendingSave.risk.level === "high" && (
                <button
                  className="btn justify-start"
                  disabled={saving}
                  onClick={() =>
                    commitSettings(
                      pendingSave.settings,
                      pendingSave.key,
                      `${labels[pendingSave.key]}：高风险修改，从下一回合尝试生效`,
                    )
                  }
                >
                  创建新设定版本，从下一回合尝试生效
                </button>
              )}
              <button
                className={`btn justify-start ${pendingSave.risk.level === "high" ? "btn-gold" : ""}`}
                onClick={() => duplicateWithSettings(pendingSave.settings)}
              >
                <CopyPlus size={14} />
                复制为新项目并应用修改
              </button>
              <button
                className="btn justify-start muted"
                onClick={() => setPendingSave(undefined)}
              >
                暂不保存，保留编辑内容
              </button>
            </div>
          </>
        )}
      </EditorModal>
    </section>
  );
}

function EditorModal({
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
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/65 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section className="panel flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b hairline p-5">
          <div>
            <h2 className="display text-xl">{title}</h2>
            <p className="muted mt-2 text-xs leading-5">{description}</p>
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
