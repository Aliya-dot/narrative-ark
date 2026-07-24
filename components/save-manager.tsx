"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { uid } from "@/lib/db";
import type { GameProject, GameSave } from "@/lib/types";
import { toast } from "sonner";
import { ConfirmDialog } from "./common";
import {
  createProjectSave,
  deleteProjectSave,
  formatProjectSaveFailure,
  listProjectSaves,
  loadProjectSave,
} from "@/lib/project-save-boundary";
import { projectSaveStorage } from "@/lib/project-save-storage";
export function SaveManager({
  project,
  routeProjectId,
  current,
  onLoad,
  onChanged,
}: {
  project: GameProject;
  routeProjectId: string;
  current: GameSave;
  onLoad: (s: GameSave) => void;
  onChanged?: () => void;
}) {
  const [saves, setSaves] = useState<GameSave[]>([]);
  const [name, setName] = useState("");
  const [del, setDel] = useState<GameSave>();
  const load = useCallback(async () => {
    const result = await listProjectSaves({
      projectId: project.id,
      storage: projectSaveStorage,
    });
    if (result.ok) setSaves(result.value);
    else toast.error(formatProjectSaveFailure(result.code));
  }, [project.id]);
  useEffect(() => {
    void load();
  }, [load, current.updatedAt]);
  async function create() {
    if (project.id !== routeProjectId) {
      toast.error("项目不存在或当前地址已失效。");
      return;
    }
    const now = new Date().toISOString(),
      copy = structuredClone(current);
    copy.id = uid("save");
    copy.name = name.trim() || `存档 ${saves.length + 1}`;
    copy.createdAt = now;
    copy.updatedAt = now;
    const result = await createProjectSave({
      project,
      save: copy,
      storage: projectSaveStorage,
    });
    if (!result.ok) {
      toast.error(formatProjectSaveFailure(result.code));
      return;
    }
    setName("");
    await load();
    onChanged?.();
    toast.success("新存档已创建");
  }
  async function duplicate(saveId: string) {
    const source = await loadProjectSave({
      routeProjectId,
      project,
      saveId,
      storage: projectSaveStorage,
    });
    if (!source.ok) {
      toast.error(formatProjectSaveFailure(source.code));
      return;
    }
    const c = structuredClone(source.value);
    c.id = uid("save");
    c.name = `${source.value.name} · 副本`;
    c.createdAt = c.updatedAt = new Date().toISOString();
    const result = await createProjectSave({
      project,
      save: c,
      storage: projectSaveStorage,
    });
    if (!result.ok) {
      toast.error(formatProjectSaveFailure(result.code));
      return;
    }
    await load();
    toast.success("存档已复制");
  }
  return (
    <div>
      <div className="flex gap-2">
        <input
          className="input min-w-0"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="新存档名称"
        />
        <button className="btn icon-btn" onClick={create} title="创建存档">
          <Plus size={16} />
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {saves.map((s) => (
          <div
            key={s.id}
            className={`rounded-lg border p-3 ${s.id === current.id ? "border-[#b89b62]" : "hairline"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <button
                className="min-w-0 flex-1 text-left"
                onClick={async () => {
                  const result = await loadProjectSave({
                    routeProjectId,
                    project,
                    saveId: s.id,
                    storage: projectSaveStorage,
                  });
                  if (!result.ok) {
                    toast.error(formatProjectSaveFailure(result.code));
                    return;
                  }
                  onLoad(result.value);
                }}
              >
                <b className="block truncate text-sm">{s.name}</b>
                <small className="muted">
                  第 {s.turn} 回合 · {new Date(s.updatedAt).toLocaleString()}
                </small>
              </button>
              <button
                className="p-1 muted hover:text-white"
                onClick={() => duplicate(s.id)}
                title="复制"
              >
                <Copy size={14} />
              </button>
              <button
                className="p-1 text-[#b9736e]"
                onClick={() => setDel(s)}
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!del}
        title={`删除“${del?.name}”？`}
        description="这个存档会从本机永久删除。"
        confirmLabel="确认删除"
        onCancel={() => setDel(undefined)}
        onConfirm={async () => {
          if (!del) return;
          if (project.id !== routeProjectId) {
            toast.error("项目不存在或当前地址已失效。");
            setDel(undefined);
            return;
          }
          const result = await deleteProjectSave({
            projectId: project.id,
            saveId: del.id,
            storage: projectSaveStorage,
          });
          if (!result.ok) {
            toast.error(formatProjectSaveFailure(result.code));
            setDel(undefined);
            return;
          }
          setDel(undefined);
          await load();
          toast.success("存档已删除");
        }}
      />
    </div>
  );
}
