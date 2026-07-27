"use client";
import Link from "next/link";
import { Pencil, Play, Trash2 } from "lucide-react";
import type { GameProject, GameSave } from "@/lib/types";
import { getStoryLengthPreset } from "@/lib/story-length";
import { ProjectArtwork } from "@/components/home-artwork";
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
  const artworkVariant =
    [...project.id].reduce(
      (sum, character) => sum + character.charCodeAt(0),
      0,
    ) % 3;

  return (
    <article className="home-project-card panel">
      <div className="home-project-card-body">
        <ProjectArtwork variant={artworkVariant} />
        <button
          aria-label="删除项目"
          className="home-project-delete"
          title="删除项目"
          onClick={() => onDelete(project)}
        >
          <Trash2 size={14} />
        </button>
        <h3 className="display">{project.projectInfo.title}</h3>
        <div className="home-project-tags">
          <span>{project.projectInfo.genre || "未定题材"}</span>
          <span>
            {project.projectInfo.creationMode === "advanced"
              ? "专业模式"
              : "简单模式"}
          </span>
          <span>{length.label}篇</span>
        </div>
        <p className="home-project-description muted">
          {project.projectInfo.description}
        </p>
        <div className="home-project-meta muted">
          <span>{save ? `最新回合：第 ${save.turn} 回合` : "尚未开始"}</span>
          <time
            dateTime={new Date(
              save?.updatedAt || project.updatedAt,
            ).toISOString()}
          >
            {new Date(
              save?.updatedAt || project.updatedAt,
            ).toLocaleDateString()}
          </time>
        </div>
      </div>
      <div className="home-project-actions">
        <Link href={`/editor/${project.id}`}>
          <Pencil size={14} />
          编辑
        </Link>
        <Link
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
