"use client";
import Link from "next/link";
import { BookOpen, Play, Trash2 } from "lucide-react";
import type { GameProject, GameSave } from "@/lib/types";
import { getStoryLengthPreset, storyLengthMeta } from "@/lib/story-length";
export function ProjectCard({
  project,
  save,
  onDelete,
}: {
  project: GameProject;
  save?: GameSave;
  onDelete: (p: GameProject) => void;
}) {
  const length = getStoryLengthPreset(project.projectInfo.gameLength);
  const lengthMeta = storyLengthMeta(length.id);
  return (
    <article className="panel group p-5 transition hover:border-[#4b5663]">
      <div className="flex items-start justify-between">
        <span className="badge">{project.projectInfo.genre || "未定题材"}</span>
        <button
          className="btn icon-btn border-transparent bg-transparent opacity-50 hover:opacity-100"
          title="删除项目"
          onClick={() => onDelete(project)}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <h3 className="display mt-5 text-2xl">{project.projectInfo.title}</h3>
      <p className="muted mt-2 line-clamp-2 min-h-11 text-sm leading-6">
        {project.projectInfo.description}
      </p>
      <div className="muted mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span>
          {project.projectInfo.creationMode === "advanced"
            ? "专业模式"
            : "简单模式"}
        </span>
        <span>
          {length.label}篇 · {lengthMeta.estimatedTime}
        </span>
        <span>{save ? `第 ${save.turn} 回合` : "尚未开始"}</span>
        <span>
          {new Date(save?.updatedAt || project.updatedAt).toLocaleDateString()}
        </span>
      </div>
      <div className="mt-5 flex gap-2">
        <Link className="btn flex-1" href={`/editor/${project.id}`}>
          <BookOpen size={15} />
          编辑
        </Link>
        <Link
          className="btn btn-primary flex-1"
          href={
            save ? `/play/${project.id}?save=${save.id}` : `/play/${project.id}`
          }
        >
          <Play size={15} />
          游玩
        </Link>
      </div>
    </article>
  );
}
