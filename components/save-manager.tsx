"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { db, uid } from "@/lib/db";
import type { GameSave } from "@/lib/types";
import { toast } from "sonner";
import { ConfirmDialog } from "./common";
export function SaveManager({
  projectId,
  current,
  onLoad,
  onChanged,
}: {
  projectId: string;
  current: GameSave;
  onLoad: (s: GameSave) => void;
  onChanged?: () => void;
}) {
  const [saves, setSaves] = useState<GameSave[]>([]);
  const [name, setName] = useState("");
  const [del, setDel] = useState<GameSave>();
  const load = useCallback(async () => {
    setSaves(
      await db.saves
        .where("projectId")
        .equals(projectId)
        .reverse()
        .sortBy("updatedAt"),
    );
  }, [projectId]);
  useEffect(() => {
    void load();
  }, [load, current.updatedAt]);
  async function create() {
    const now = new Date().toISOString(),
      copy = structuredClone(current);
    copy.id = uid("save");
    copy.name = name.trim() || `存档 ${saves.length + 1}`;
    copy.createdAt = now;
    copy.updatedAt = now;
    await db.saves.put(copy);
    setName("");
    await load();
    onChanged?.();
    toast.success("新存档已创建");
  }
  async function duplicate(s: GameSave) {
    const c = structuredClone(s);
    c.id = uid("save");
    c.name = `${s.name} · 副本`;
    c.createdAt = c.updatedAt = new Date().toISOString();
    await db.saves.put(c);
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
                onClick={() => onLoad(s)}
              >
                <b className="block truncate text-sm">{s.name}</b>
                <small className="muted">
                  第 {s.turn} 回合 · {new Date(s.updatedAt).toLocaleString()}
                </small>
              </button>
              <button
                className="p-1 muted hover:text-white"
                onClick={() => duplicate(s)}
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
          await db.saves.delete(del.id);
          setDel(undefined);
          await load();
          toast.success("存档已删除");
        }}
      />
    </div>
  );
}
