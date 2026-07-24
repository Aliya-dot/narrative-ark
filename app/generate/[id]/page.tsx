"use client";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, LoaderCircle, RotateCcw, Square, XCircle } from "lucide-react";
import { db } from "@/lib/db";
import type { AIConfig, GameProject, GenerationDraft } from "@/lib/types";
import { emptyProject } from "@/lib/project";
import { generateStage } from "@/lib/ai-client";
import { toast } from "sonner";
import { LoadingState } from "@/components/common";
import { protectGeneratedProjectPatch } from "@/lib/creation-ai";
import { applyGenerationStageResult } from "@/lib/generation-stage";
import {
  GeneratedProjectDraftCleanupError,
  finalizeGeneratedProject,
  formatProjectIntegrityFailure,
} from "@/lib/generated-project-finalization";
import {
  classifyGenerationFailure,
  enterGeneratedProject,
  retainSavedProjectCleanupFailure,
  retryGeneratedProjectDraftCleanup,
  type GenerationFailure,
} from "@/lib/generated-project-draft-recovery";
const stages = [
  { id: "analysis", name: "正在理解你的创意" },
  { id: "world", name: "正在构建世界观" },
  { id: "characters", name: "正在设计主要角色" },
  { id: "system", name: "正在建立游戏规则" },
  { id: "story", name: "正在规划剧情结构" },
  { id: "prompts", name: "正在生成 AI 主持人提示词" },
  { id: "consistency", name: "正在检查设定一致性" },
  { id: "opening", name: "正在生成开场剧情" },
];
type Persisted = {
  draft: GenerationDraft;
  project: GameProject;
  current: number;
  completed: number[];
  error?: string;
};
export default function Generate() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [state, setState] = useState<Persisted>();
  const [config, setConfig] = useState<AIConfig>();
  const [failure, setFailure] = useState<GenerationFailure>();
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const started = useRef(false);
  useEffect(() => {
    void (async () => {
      const [r, c] = await Promise.all([
        db.drafts.get(id),
        db.configs.get("active"),
      ]);
      if (r) {
        const v = r.value as GenerationDraft | Persisted;
        if ("draft" in v) setState(v);
        else {
          const worldBookVersion = v.worldBinding
            ? await db.worldBookVersions.get(v.worldBinding.worldBookVersionId)
            : undefined;
          setState({
            draft: v,
            project: emptyProject(v, worldBookVersion),
            current: 0,
            completed: [],
          });
        }
      }
      setConfig(c);
    })();
  }, [id]);
  const run = useCallback(
    async (base: Persisted, cfg: AIConfig) => {
      setFailure(undefined);
      setRunning(true);
      controller.current = new AbortController();
      let s: Persisted = { ...base, error: undefined };
      const saveDraft = (value: Persisted) =>
        db.drafts.put({
          id,
          value,
          updatedAt: new Date().toISOString(),
        });
      for (let i = s.current; i < stages.length; i++) {
        s = { ...s, current: i, error: undefined };
        setState(s);
        await saveDraft(s);
        let lastError: unknown;
        try {
          let nextProject: GameProject;
          if (stages[i].id === "world" && s.draft.worldBinding) {
            nextProject = structuredClone(s.project);
          } else {
            const stageResult = await generateStage(
              cfg,
              stages[i].id,
              s.draft,
              s.project,
              controller.current.signal,
            );
            if (!stageResult || typeof stageResult !== "object")
              throw new Error("AI 返回了空结果");
            const protectedResult = protectGeneratedProjectPatch(
              stageResult,
              s.project,
              s.draft,
            );
            const applied = applyGenerationStageResult(
              s.project,
              stages[i].id,
              protectedResult,
            );
            if (!applied.success)
              throw new Error(`AI 返回的阶段数据无效（${applied.pathText}）`);
            nextProject = applied.project;
          }
          nextProject.updatedAt = new Date().toISOString();
          s = {
            ...s,
            project: nextProject,
            completed: [...new Set([...s.completed, i])],
          };
          lastError = undefined;
        } catch (error) {
          lastError = error;
        }
        if (lastError) {
          const msg = controller.current.signal.aborted
            ? "生成已取消"
            : lastError instanceof Error
              ? lastError.message
              : "生成失败";
          s = { ...s, error: msg };
          setState(s);
          await saveDraft(s);
          setRunning(false);
          return;
        }
      }
      try {
        const result = await finalizeGeneratedProject({
          project: s.project,
          saveLatestDraft: () => saveDraft(s),
          saveProject: (project) => db.projects.put(project),
          deleteDraft: () => db.drafts.delete(id),
        });
        if (!result.ok) {
          s = { ...s, error: formatProjectIntegrityFailure(result.issues) };
          setState(s);
          await saveDraft(s);
          setRunning(false);
          return;
        }
      } catch (error) {
        const nextFailure = classifyGenerationFailure(error, s.project.id);
        setFailure(nextFailure);
        if (error instanceof GeneratedProjectDraftCleanupError) {
          setRunning(false);
          return;
        }
        s = { ...s, error: nextFailure.message };
        setState(s);
        try {
          await saveDraft(s);
        } catch {
          // Preserve the original failure in React state when draft storage is unavailable.
        }
        setRunning(false);
        return;
      }
      toast.success("文游包体生成完成");
      router.replace(`/editor/${s.project.id}`);
    },
    [id, router],
  );
  const enterSavedProject = useCallback(() => {
    if (failure?.kind !== "draft_cleanup_failed") return;
    enterGeneratedProject(failure.projectId, router.replace);
  }, [failure, router]);
  const retryDraftCleanup = useCallback(async () => {
    if (failure?.kind !== "draft_cleanup_failed") return;
    setCleanupRunning(true);
    try {
      await retryGeneratedProjectDraftCleanup({
        draftId: id,
        deleteDraft: (draftId) => db.drafts.delete(draftId),
        enterSavedProject: () => {
          toast.success("生成草稿清理成功");
          enterGeneratedProject(failure.projectId, router.replace);
        },
      });
    } catch {
      setFailure(retainSavedProjectCleanupFailure(failure.projectId));
      setCleanupRunning(false);
    }
  }, [failure, id, router]);
  useEffect(() => {
    if (state && config && !started.current) {
      started.current = true;
      run(state, config);
    }
  }, [state, config, run]);
  if (!state)
    return (
      <section className="container py-16">
        <LoadingState />
      </section>
    );
  if (!config)
    return (
      <section className="container py-20">
        <div className="panel mx-auto max-w-xl p-8 text-center">
          <XCircle className="mx-auto text-[#d17670]" />
          <h1 className="display mt-4 text-2xl">还没有可用的 API 配置</h1>
          <p className="muted mt-3 leading-7">
            先配置模型并测试连接，创作草稿已经保存在本机，回来后可继续。
          </p>
          <Link className="btn btn-primary mt-6" href="/settings">
            前往 API 设置
          </Link>
        </div>
      </section>
    );
  const progress = Math.round((state.completed.length / stages.length) * 100);
  return (
    <section className="container py-14">
      <div className="mx-auto max-w-3xl">
        <p className="mono gold text-xs">WORLD ASSEMBLY</p>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <h1 className="display text-4xl">正在装配世界</h1>
            <p className="muted mt-2">{state.project.projectInfo.title}</p>
          </div>
          <span className="display text-4xl gold">{progress}%</span>
        </div>
        <div className="mt-8 h-1 overflow-hidden rounded bg-[var(--panel2)]">
          <div
            className="h-full bg-[#b89b62] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="panel mt-6 divide-y divide-[var(--line)]">
          {stages.map((s, i) => (
            <div className="flex items-center gap-4 p-4" key={s.id}>
              <span
                className={`grid h-8 w-8 place-items-center rounded-full border ${state.completed.includes(i) ? "border-[#6f9779] text-[#8eb497]" : state.current === i && running ? "border-[#b89b62] text-[#b89b62]" : "hairline muted"}`}
              >
                {state.completed.includes(i) ? (
                  <Check size={15} />
                ) : state.current === i && running ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <span className="mono text-xs">{i + 1}</span>
                )}
              </span>
              <div className="flex-1">
                <p>
                  {s.id === "world" && state.draft.worldBinding
                    ? "正在载入已绑定的世界书版本"
                    : s.name}
                </p>
                {state.current === i && state.error && (
                  <p className="mt-1 text-sm text-[#d17670]">{state.error}</p>
                )}
              </div>
              {state.completed.includes(i) && (
                <small className="muted">完成</small>
              )}
            </div>
          ))}
        </div>
        {failure?.kind === "draft_cleanup_failed" && (
          <div className="panel mt-5 p-5">
            <p className="font-medium text-[#d17670]">项目已经保存</p>
            <p className="muted mt-2 text-sm leading-6">{failure.message}</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="btn btn-primary"
                disabled={cleanupRunning}
                onClick={retryDraftCleanup}
              >
                {cleanupRunning ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <RotateCcw size={15} />
                )}
                重试清理草稿
              </button>
              <button
                className="btn"
                disabled={cleanupRunning}
                onClick={enterSavedProject}
              >
                进入已保存项目
              </button>
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-between">
          <button
            className="btn"
            disabled={!running}
            onClick={() => controller.current?.abort()}
          >
            <Square size={14} />
            取消生成
          </button>
          {state.error && failure?.kind !== "draft_cleanup_failed" && (
            <button
              className="btn btn-primary"
              onClick={() => run(state, config)}
            >
              <RotateCcw size={15} />
              从当前阶段重试
            </button>
          )}
        </div>
        <p className="muted mt-6 text-center text-xs">
          每个阶段均为独立请求；失败后由你决定是否重试，进度保存在 IndexedDB。
        </p>
      </div>
    </section>
  );
}
