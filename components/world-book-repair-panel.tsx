"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ShieldCheck, Undo2, X } from "lucide-react";
import type { WorldBookEntry } from "@/lib/types";
import {
  formatRepairValue,
  repairTokenEstimate,
  type WorldBookRepairSuggestion,
} from "@/lib/world-book-repair";

type Props = {
  open: boolean;
  suggestions: WorldBookRepairSuggestion[];
  entries: WorldBookEntry[];
  initialSuggestionId?: string;
  canUndo: boolean;
  onClose: () => void;
  onApply: (suggestions: WorldBookRepairSuggestion[]) => void;
  onFocusEntry: (entryId: string) => void;
  onUndo: () => void;
};

const CONFIDENCE = { high: "高", medium: "中", low: "低" } as const;

export function WorldBookRepairPanel({
  open,
  suggestions,
  entries,
  initialSuggestionId,
  canUndo,
  onClose,
  onApply,
  onFocusEntry,
  onUndo,
}: Props) {
  const [selectedId, setSelectedId] = useState("");
  const [ignored, setIgnored] = useState<string[]>([]);
  const visible = suggestions.filter((item) => !ignored.includes(item.id));
  const selected = visible.find((item) => item.id === selectedId) || visible[0];
  const byId = useMemo(
    () => new Map(entries.map((entry) => [entry.id, entry])),
    [entries],
  );
  const safe = visible.filter((item) => item.safeToApply && item.canApply);

  useEffect(() => {
    if (!open) return;
    setSelectedId(
      suggestions.some((item) => item.id === initialSuggestionId)
        ? initialSuggestionId || ""
        : suggestions[0]?.id || "",
    );
  }, [open, initialSuggestionId, suggestions]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/60 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="世界书修复建议"
    >
      <div className="panel mx-auto flex h-full max-h-[900px] w-full max-w-6xl flex-col overflow-hidden">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b hairline p-5">
          <div>
            <p className="eyebrow">REPAIR REVIEW</p>
            <h2 className="display text-2xl">世界书修复建议</h2>
            <p className="muted mt-1 text-sm">
              先查看修改前后差异，再决定是否应用。任何建议都不会自动发布世界书。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canUndo ? (
              <button className="btn" onClick={onUndo}>
                <Undo2 size={15} /> 撤销最近修复
              </button>
            ) : null}
            {safe.length ? (
              <button
                className="btn btn-gold"
                onClick={() => {
                  if (
                    window.confirm(
                      `将应用 ${safe.length} 项高置信度安全修复。是否继续？`,
                    )
                  )
                    onApply(safe);
                }}
              >
                <ShieldCheck size={15} /> 应用全部安全修复
              </button>
            ) : null}
            <button
              className="btn icon-btn"
              aria-label="关闭"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="scrollbar min-h-0 overflow-y-auto border-r hairline p-3">
            {visible.map((item) => (
              <button
                key={item.id}
                className={`mb-2 w-full rounded-lg border p-3 text-left transition-colors ${selected?.id === item.id ? "border-[var(--gold)] bg-[var(--panel2)]" : "hairline hover:bg-[var(--panel2)]"}`}
                onClick={() => setSelectedId(item.id)}
              >
                <span className="flex items-center justify-between gap-2">
                  <b className="text-sm">{item.title}</b>
                  {item.safeToApply ? (
                    <span className="tag whitespace-nowrap">安全修复</span>
                  ) : null}
                </span>
                <small className="muted mt-2 block">
                  {item.source === "local_rule" ? "本地规则" : "AI 建议"} ·
                  置信度{CONFIDENCE[item.confidence]}
                </small>
              </button>
            ))}
            {!visible.length ? (
              <p className="muted p-4 text-sm">目前没有待处理的修复建议。</p>
            ) : null}
          </aside>

          <main className="scrollbar min-h-0 overflow-y-auto p-5 lg:p-7">
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="display text-2xl">{selected.title}</h3>
                    <p className="mt-2 max-w-3xl text-sm leading-7">
                      {selected.explanation}
                    </p>
                  </div>
                  <span className="tag">
                    {selected.source === "local_rule"
                      ? "本地确定性规则"
                      : "AI 草案"}
                  </span>
                </div>

                {selected.affectedEntryIds.length ? (
                  <section className="mt-5">
                    <p className="label">受影响资料卡</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Array.from(new Set(selected.affectedEntryIds)).map(
                        (entryId) => (
                          <button
                            key={entryId}
                            className="tag hover:border-[var(--gold)]"
                            onClick={() => onFocusEntry(entryId)}
                          >
                            {byId.get(entryId)?.title || "已失效资料卡"}{" "}
                            <ArrowRight size={12} />
                          </button>
                        ),
                      )}
                    </div>
                  </section>
                ) : null}

                <section className="mt-6 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="label">修改前后对比</p>
                    <small className="muted">
                      估算 Token：{repairTokenEstimate(selected).before} →{" "}
                      {repairTokenEstimate(selected).after}
                    </small>
                  </div>
                  {(selected.changes.length
                    ? selected.changes
                    : [
                        {
                          label: "建议方案",
                          before: selected.before,
                          after: selected.after,
                        },
                      ]
                  ).map((item, index) => (
                    <article
                      key={`${item.label}:${index}`}
                      className="rounded-xl border hairline p-4"
                    >
                      <b className="text-sm">{item.label}</b>
                      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_1fr]">
                        <div>
                          <small className="muted">修改前</small>
                          <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-[var(--panel2)] p-3 text-xs leading-6">
                            {formatRepairValue(item.before)}
                          </pre>
                        </div>
                        <ArrowRight className="muted self-center" size={17} />
                        <div>
                          <small className="muted">修改后</small>
                          <pre className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-[var(--panel2)] p-3 text-xs leading-6">
                            {formatRepairValue(item.after)}
                          </pre>
                        </div>
                      </div>
                    </article>
                  ))}
                </section>

                <footer className="mt-6 flex flex-wrap justify-end gap-2 border-t hairline pt-5">
                  <button
                    className="btn"
                    onClick={() =>
                      setIgnored((items) => [...items, selected.id])
                    }
                  >
                    本次忽略
                  </button>
                  {selected.affectedEntryIds[0] ? (
                    <button
                      className="btn"
                      onClick={() => onFocusEntry(selected.affectedEntryIds[0])}
                    >
                      打开资料卡手动处理
                    </button>
                  ) : null}
                  {selected.canApply ? (
                    <button
                      className="btn btn-gold"
                      onClick={() => onApply([selected])}
                    >
                      <Check size={16} />
                      {selected.safeToApply ? "应用安全修复" : "确认并应用"}
                    </button>
                  ) : null}
                </footer>
              </>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
