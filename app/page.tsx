"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  KeyRound,
  Layers3,
  Play,
  Sprout,
  Upload,
} from "lucide-react";
import { db } from "@/lib/db";
import { loadAIConfig } from "@/lib/ai-config-repository";
import type { AIConfig, GameProject, GameSave } from "@/lib/types";
import { ProjectCard } from "@/components/project-card";
import { ConfirmDialog, EmptyState, LoadingState } from "@/components/common";
import { toast } from "sonner";
import {
  executeProjectImport,
  formatProjectImportFailure,
} from "@/lib/project-import-workflow";
import { loadProjectList } from "@/lib/project-list-loader";
import { resolveSaveForProject } from "@/lib/project-save-boundary";
import { deleteProjectCascade } from "@/lib/project-deletion";
import {
  HeroBotanicalArtwork,
  JourneyArtwork,
} from "@/components/home-artwork";
import {
  BUILTIN_TRIAL_PROJECT_ID,
  ensureBuiltInTrialProject,
} from "@/lib/builtin-trial-project";
export default function Home() {
  const [projects, setProjects] = useState<GameProject[] | null>(null);
  const [config, setConfig] = useState<AIConfig>();
  const [last, setLast] = useState<GameSave>();
  const [latestByProject, setLatestByProject] = useState<
    Record<string, GameSave>
  >({});
  const [del, setDel] = useState<GameProject>();
  const input = useRef<HTMLInputElement>(null);
  async function load() {
    const result = await loadProjectList(() =>
      db.projects.orderBy("updatedAt").reverse().toArray(),
    );
    const ps = result.projects;
    setProjects(ps);
    if (result.failures.length > 0) {
      toast.error(
        `有 ${result.failures.length} 个项目数据不兼容，已跳过显示。`,
      );
    }
    setConfig(await loadAIConfig());
    const rawSaves = await db.saves.orderBy("updatedAt").reverse().toArray();
    const projectById = new Map(ps.map((project) => [project.id, project]));
    const saves = rawSaves.flatMap((save) => {
      const project = projectById.get(save.projectId);
      if (!project) return [];
      const result = resolveSaveForProject({
        projectId: project.id,
        save,
      });
      return result.ok ? [result.value] : [];
    });
    setLast(saves[0]);
    setLatestByProject(
      Object.fromEntries(
        saves
          .filter(
            (save, index) =>
              saves.findIndex((item) => item.projectId === save.projectId) ===
              index,
          )
          .map((save) => [save.projectId, save]),
      ),
    );
  }
  useEffect(() => {
    void (async () => {
      try {
        await ensureBuiltInTrialProject({
          readProject: (projectId) => db.projects.get(projectId),
          writeProject: (project) => db.projects.put(project),
        });
      } catch {
        toast.error("内置试玩故事载入失败，正在继续加载本机项目。");
      }
      await load();
    })();
  }, []);
  async function importJson(file?: File) {
    if (!file) return;
    try {
      const result = await executeProjectImport(file, async (success) => {
        await load();
        toast.success(
          success.kind === "game_bundle"
            ? `游戏已导入，可继续第 ${success.saveTurn} 回合`
            : "项目已导入",
        );
      });
      if (!result.ok) {
        toast.error(formatProjectImportFailure(result));
      }
    } catch {
      toast.error("导入失败，未显示成功。");
    }
  }
  return (
    <>
      <section className="home-hero">
        <div aria-hidden="true" className="home-hero-botanical">
          <HeroBotanicalArtwork />
        </div>
        <div className="home-hero-copy reveal">
          <p className="home-hero-kicker mono gold">AI NARRATIVE WORKSHOP</p>
          <h1 className="home-hero-title display">
            输入一个想法，
            <br />
            创造属于你的
            <br />
            <i className="font-normal gold">文字冒险世界</i>
          </h1>
          <p className="home-hero-description muted">
            从世界规则到角色记忆，从第一幕到长期存档。叙界把灵感整理成一套真正可以持续游玩的冒险。
          </p>
          <div className="home-hero-actions">
            <Link className="btn btn-primary home-hero-action" href="/create">
              <Sprout size={17} />
              创建文游
            </Link>
            {last ? (
              <Link
                className="btn home-hero-action"
                href={`/play/${last.projectId}?save=${last.id}`}
              >
                <Play size={16} />
                <span className="text-left leading-5">
                  <b className="block font-medium">
                    继续《
                    {projects?.find((project) => project.id === last.projectId)
                      ?.projectInfo.title || "上次冒险"}
                    》
                  </b>
                  <small className="muted">第 {last.turn} 回合</small>
                </span>
              </Link>
            ) : (
              <button className="btn home-hero-action" disabled>
                <Play size={16} />
                暂无存档
              </button>
            )}
            <button
              className="btn home-hero-action muted"
              onClick={() => input.current?.click()}
            >
              <Upload size={16} />
              导入项目 / 游戏包
            </button>
            <input
              ref={input}
              type="file"
              accept=".nark,.json,application/json"
              hidden
              onChange={(e) => importJson(e.target.files?.[0])}
            />
          </div>
        </div>
        <div className="home-journey" aria-label="叙界创作流程">
          <div aria-hidden="true" className="home-journey-line">
            <i />
            <i />
            <i />
          </div>
          <div className="home-journey-cards">
            <div className="home-journey-card panel">
              <div>
                <small className="mono muted">01 · DEFINE</small>
                <p className="display">定下世界的第一条规则</p>
              </div>
              <JourneyArtwork kind="define" />
            </div>
            <div className="home-journey-card panel">
              <div>
                <small className="mono muted">02 · REMEMBER</small>
                <p className="display">让角色记住每一次选择</p>
              </div>
              <JourneyArtwork kind="remember" />
            </div>
            <div className="home-journey-card panel">
              <div>
                <small className="mono muted">03 · CONTINUE</small>
                <p className="display">离开以后，世界仍在等待</p>
              </div>
              <JourneyArtwork kind="continue" />
            </div>
          </div>
        </div>
      </section>
      <section className="home-feature-strip">
        <div className="home-feature-grid">
          <div className="home-feature">
            <span className="home-feature-icon">
              <Sprout />
            </span>
            <div>
              <small className="muted">简单模式</small>
              <h2 className="display">几句话，完整世界</h2>
              <p className="muted">AI 自动补全世界观、角色、规则与剧情结构。</p>
            </div>
          </div>
          <div className="home-feature">
            <span className="home-feature-icon">
              <Layers3 />
            </span>
            <div>
              <small className="muted">专业模式</small>
              <h2 className="display">逐层掌控设定</h2>
              <p className="muted">
                七步创作流程，重要设定由你决定，空白交给 AI。
              </p>
            </div>
          </div>
          <div className="home-feature">
            <span className="home-feature-icon">
              <KeyRound />
            </span>
            <div>
              <small className="muted">
                {config ? "API 已就绪" : "尚未配置 API"}
              </small>
              <h2 className="display">密钥保存在系统安全存储</h2>
              <p className="muted">
                客户端通过原生网络层直连模型；应用数据库和迁移包都不会写入 API
                Key。
              </p>
              {!config ? (
                <Link href="/settings" className="home-feature-link gold">
                  配置模型 <ArrowRight size={13} />
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      <section className="home-archive">
        <div className="home-archive-heading">
          <h2 className="display">
            最近项目 <Sprout aria-hidden="true" />
          </h2>
          <Link href="/create">
            新建项目 <ArrowRight size={14} />
          </Link>
        </div>
        {projects === null ? (
          <LoadingState />
        ) : projects.length ? (
          <div className="home-project-grid">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                save={latestByProject[p.id]}
                onDelete={setDel}
                builtInTrial={p.id === BUILTIN_TRIAL_PROJECT_ID}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="档案馆还是空的"
            description="创建第一个世界，或导入已有项目。"
          />
        )}
      </section>
      <ConfirmDialog
        open={!!del}
        title={`删除“${del?.projectInfo.title}”？`}
        description="项目及其所有存档会从本机删除，此操作无法撤销。"
        onCancel={() => setDel(undefined)}
        onConfirm={async () => {
          if (!del) return;
          await db.transaction("rw", db.projects, db.saves, db.exports, () =>
            deleteProjectCascade(del.id, {
              deleteProject: async (projectId) => {
                await db.projects.delete(projectId);
              },
              deleteProjectSaves: async (projectId) => {
                await db.saves.where("projectId").equals(projectId).delete();
              },
              deleteProjectExports: async (projectId) => {
                await db.exports.where("projectId").equals(projectId).delete();
              },
            }),
          );
          setDel(undefined);
          await load();
          toast.success("项目已删除");
        }}
      />
    </>
  );
}
