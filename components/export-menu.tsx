"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import type { GameProject } from "@/lib/types";
import { exportDocx, exportJson, exportPdf, exportTxt } from "@/lib/export";
import { toast } from "sonner";
export function ExportMenu({ project }: { project: GameProject }) {
  const [busy, setBusy] = useState("");
  async function run(type: string, fn: () => Promise<void>) {
    setBusy(type);
    try {
      await fn();
      toast.success(`${type.toUpperCase()} 已导出`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      {[
        ["txt", () => exportTxt(project)],
        ["docx", () => exportDocx(project)],
        ["pdf", () => exportPdf(project)],
        ["json", () => exportJson(project)],
      ].map(([t, fn]) => (
        <button
          className="btn"
          disabled={!!busy}
          key={t as string}
          onClick={() => run(t as string, fn as () => Promise<void>)}
        >
          <Download size={14} />
          {busy === t ? "生成中…" : String(t).toUpperCase()}
        </button>
      ))}
    </div>
  );
}
