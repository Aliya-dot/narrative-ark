"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  KeyRound,
  Play,
  Plus,
  Upload,
  Waypoints,
} from "lucide-react";
import { db } from "@/lib/db";
import { SAMPLE_PROJECT } from "@/lib/sample";
import type { AIConfig, GameProject, GameSave } from "@/lib/types";
import { ProjectCard } from "@/components/project-card";
import { ConfirmDialog, EmptyState, LoadingState } from "@/components/common";
import { toast } from "sonner";
import { ensureSettingsVersions } from "@/lib/settings-version";
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
    let ps = await db.projects.orderBy("updatedAt").reverse().toArray();
    if (!ps.length) {
      await db.projects.put(SAMPLE_PROJECT);
      ps = [SAMPLE_PROJECT];
    }
    const normalizedProjects = ps.map(ensureSettingsVersions);
    if (normalizedProjects.some((project, index) => project !== ps[index])) {
      await db.projects.bulkPut(normalizedProjects);
    }
    ps = normalizedProjects;
    setProjects(ps);
    setConfig(await db.configs.get("active"));
    const saves = await db.saves.orderBy("updatedAt").reverse().toArray();
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
    load();
  }, []);
  async function importJson(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const bundle = parsed as {
        format?: string;
        project?: GameProject;
        save?: GameSave;
      };
      const isGameBundle =
        typeof parsed === "object" &&
        parsed !== null &&
        bundle.format === "narrative-ark-game";
      const imported = (isGameBundle ? bundle.project : parsed) as
        GameProject | undefined;
      if (
        !imported?.id ||
        !imported.projectInfo?.title ||
        !imported.world ||
        !imported.story
      )
        throw new Error("缺少必要的项目字段");
      imported.version = imported.version || 1;
      imported.updatedAt = new Date().toISOString();
      const p = ensureSettingsVersions(imported);
      await db.projects.put(p);
      if (isGameBundle && bundle.save) {
        bundle.save.projectId = p.id;
        bundle.save.updatedAt = new Date().toISOString();
        bundle.save.settingsVersionId ??= p.currentSettingsVersionId;
        bundle.save.settingsVersionNumber ??= p.settingsVersionNumber;
        await db.saves.put(bundle.save);
      }
      await load();
      toast.success(
        isGameBundle && bundle.save
          ? `游戏已导入，可继续第 ${bundle.save.turn} 回合`
          : "项目已导入",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    }
  }
  return (
    <>
      <section className="container grid min-h-[68vh] items-center gap-12 py-16 lg:grid-cols-[1.1fr_.9fr]">
        <div className="reveal">
          <p className="mono gold text-xs tracking-[.25em]">
            AI NARRATIVE WORKSHOP
          </p>
          <h1 className="display mt-6 max-w-3xl text-5xl leading-[1.15] md:text-7xl">
            输入一个想法，
            <br />
            创造属于你的
            <br />
            <i className="font-normal gold">文字冒险世界</i>
          </h1>
          <p className="muted mt-7 max-w-xl text-base leading-8">
            从世界规则到角色记忆，从第一幕到长期存档。叙界把灵感整理成一套真正可以持续游玩的冒险。
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link className="btn btn-primary px-6" href="/create">
              <Plus size={17} />
              创建文游
            </Link>
            {last ? (
              <Link
                className="btn px-6"
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
              <button className="btn" disabled>
                <Play size={16} />
                暂无存档
              </button>
            )}
            <button
              className="btn muted"
              onClick={() => input.current?.click()}
            >
              <Upload size={16} />
              导入 JSON
            </button>
            <input
              ref={input}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => importJson(e.target.files?.[0])}
            />
          </div>
        </div>
        <div className="relative hidden min-h-96 lg:block">
          <div className="absolute left-10 top-8 h-[320px] w-px bg-[var(--line)]" />
          <div className="absolute left-[35px] top-7 h-3 w-3 rounded-full border border-[#b89b62] bg-[var(--ink)]" />
          <div className="absolute left-[35px] top-[165px] h-3 w-3 rounded-full border border-[#8ca9b8] bg-[var(--ink)]" />
          <div className="absolute left-[35px] bottom-9 h-3 w-3 rounded-full bg-[#b89b62]" />
          <div className="ml-20 space-y-9">
            <div className="panel p-5">
              <small className="mono muted">01 · DEFINE</small>
              <p className="display mt-2 text-xl">定下世界的第一条规则</p>
            </div>
            <div className="panel ml-10 p-5">
              <small className="mono muted">02 · REMEMBER</small>
              <p className="display mt-2 text-xl">让角色记住每一次选择</p>
            </div>
            <div className="panel p-5">
              <small className="mono muted">03 · CONTINUE</small>
              <p className="display mt-2 text-xl">离开以后，世界仍在等待</p>
            </div>
          </div>
        </div>
      </section>
      <section className="border-y hairline bg-[var(--panel)]">
        <div className="container grid gap-px py-7 md:grid-cols-3">
          <div className="p-5">
            <span className="badge">
              <Waypoints size={13} />
              简单模式
            </span>
            <h2 className="display mt-4 text-xl">几句话，完整世界</h2>
            <p className="muted mt-2 text-sm leading-6">
              AI 自动补全世界观、角色、规则与剧情结构。
            </p>
          </div>
          <div className="p-5 md:border-x hairline">
            <span className="badge">专业模式</span>
            <h2 className="display mt-4 text-xl">逐层掌控设定</h2>
            <p className="muted mt-2 text-sm leading-6">
              七步创作流程，重要设定由你决定，空白交给 AI。
            </p>
          </div>
          <div className="p-5">
            <span className="badge">
              <KeyRound size={13} />
              {config ? "API 已就绪" : "尚未配置 API"}
            </span>
            <h2 className="display mt-4 text-xl">密钥保存在浏览器</h2>
            <p className="muted mt-2 text-sm leading-6">
              调用模型时临时发送至本站代理；应用代码不会主动记录或持久化密钥。
            </p>
            <Link
              href="/settings"
              className="gold mt-2 inline-flex items-center gap-1 text-sm"
            >
              配置模型 <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
      <section className="container py-16">
        <div className="mb-7 flex items-end justify-between">
          <div>
            <p className="mono muted text-xs">YOUR ARCHIVE</p>
            <h2 className="display mt-2 text-3xl">最近项目</h2>
          </div>
          <Link href="/create" className="btn">
            新建项目
          </Link>
        </div>
        {projects === null ? (
          <LoadingState />
        ) : projects.length ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <ProjectCard
                key={p.id}
                project={p}
                save={latestByProject[p.id]}
                onDelete={setDel}
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
          await db.transaction("rw", db.projects, db.saves, async () => {
            await db.projects.delete(del.id);
            await db.saves.where("projectId").equals(del.id).delete();
          });
          setDel(undefined);
          await load();
          toast.success("项目已删除");
        }}
      />
    </>
  );
}
