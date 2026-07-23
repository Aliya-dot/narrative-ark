"use client";

import Link from "next/link";
import {
  ChevronDown,
  Eraser,
  Lightbulb,
  LoaderCircle,
  Lock,
  RotateCcw,
  Sparkles,
  Square,
  Unlock,
  X,
} from "lucide-react";
import type { CreationAiOperation } from "@/lib/creation-ai";

export type CreationIdeaCandidate = {
  style: "稳妥" | "反转" | "大胆";
  title: string;
  description: string;
  fields: Record<string, string>;
  supportingCharacters?: unknown[];
};

export function FieldAiActions({
  value,
  available = true,
  locked,
  aiDraft,
  busy,
  canExpand = true,
  canSimplify = true,
  onRun,
  onIdeas,
  onToggleLock,
  onUndo,
  onClearAiDraft,
  onCancel,
}: {
  value: string;
  available?: boolean;
  locked: boolean;
  aiDraft: boolean;
  busy: boolean;
  canExpand?: boolean;
  canSimplify?: boolean;
  onRun: (operation: CreationAiOperation) => void;
  onIdeas: () => void;
  onToggleLock: () => void;
  onUndo?: () => void;
  onClearAiDraft?: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {aiDraft && (
        <span className="rounded-full bg-[color-mix(in_srgb,var(--gold)_12%,transparent)] px-2 py-1 text-[10px] text-[var(--gold)]">
          AI 草稿 · 尚未确认
        </span>
      )}
      {busy ? (
        <button
          className="btn h-8 px-2.5 text-xs"
          type="button"
          onClick={onCancel}
        >
          <LoaderCircle className="animate-spin" size={13} />
          正在生成
          <Square size={11} />
        </button>
      ) : !value.trim() ? (
        <button
          className="btn h-8 px-2.5 text-xs"
          type="button"
          disabled={locked || !available}
          onClick={() => onRun("generate")}
          title={
            !available
              ? "配置模型后即可使用 AI 补全"
              : locked
                ? "字段已锁定"
                : "本操作将调用一次模型 API"
          }
        >
          <Sparkles size={13} />
          AI 生成
        </button>
      ) : (
        <details
          className="creation-ai-menu group relative z-10"
          name="creation-ai-actions"
        >
          <summary className="btn h-8 cursor-pointer list-none whitespace-nowrap px-2.5 text-xs">
            <Sparkles size={13} />
            AI 辅助
            <ChevronDown size={12} />
          </summary>
          <div className="panel absolute top-[calc(100%+6px)] right-0 z-[90] w-52 overflow-hidden p-1.5 shadow-xl">
            <AiMenuButton
              disabled={locked || !available}
              onClick={() => onRun("rewrite")}
            >
              换一种写法
            </AiMenuButton>
            {canExpand && (
              <AiMenuButton
                disabled={locked || !available}
                onClick={() => onRun("expand")}
              >
                扩写当前内容
              </AiMenuButton>
            )}
            {canSimplify && (
              <AiMenuButton
                disabled={locked || !available}
                onClick={() => onRun("simplify")}
              >
                简化当前内容
              </AiMenuButton>
            )}
            <AiMenuButton disabled={locked || !available} onClick={onIdeas}>
              随机灵感候选
            </AiMenuButton>
            {aiDraft && onClearAiDraft && (
              <AiMenuButton onClick={onClearAiDraft}>
                <Eraser size={13} /> 清空 AI 草稿
              </AiMenuButton>
            )}
            {onUndo && (
              <AiMenuButton onClick={onUndo}>
                <RotateCcw size={13} /> 恢复生成前内容
              </AiMenuButton>
            )}
          </div>
        </details>
      )}
      <button
        className={`btn icon-btn h-8 w-8 ${locked ? "gold" : "muted"}`}
        type="button"
        onClick={onToggleLock}
        aria-label={locked ? "取消锁定字段" : "锁定字段"}
        aria-pressed={locked}
        title={
          locked
            ? "已锁定：AI 不会修改此字段，仍可手动编辑"
            : "锁定后，AI 补全、重新生成和随机灵感都不会修改此字段"
        }
      >
        {locked ? <Lock size={13} /> : <Unlock size={13} />}
      </button>
    </div>
  );
}

function AiMenuButton({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-left text-xs hover:bg-[var(--panel2)] disabled:cursor-not-allowed disabled:opacity-40"
      type="button"
      disabled={disabled}
      onClick={(event) => {
        onClick();
        event.currentTarget.closest("details")?.removeAttribute("open");
      }}
    >
      {children}
    </button>
  );
}

export function CreationPageAiBar({
  hasConfig,
  optimizeExisting,
  busy,
  canUndo,
  status,
  onOptimizeChange,
  onComplete,
  onIdeas,
  onUndo,
  onCancel,
}: {
  hasConfig: boolean;
  optimizeExisting: boolean;
  busy: "page" | "ideas" | null;
  canUndo: boolean;
  status?: string;
  onOptimizeChange: (value: boolean) => void;
  onComplete: () => void;
  onIdeas: () => void;
  onUndo: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="mb-6 rounded-xl border border-[color-mix(in_srgb,var(--gold)_35%,var(--line))] bg-[color-mix(in_srgb,var(--gold)_5%,var(--panel2))] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">与 AI 一起完成本页</p>
          <p className="muted mt-1 text-xs">
            单次补全合并为一次请求；结果仍可编辑，不会自动进入下一步。
          </p>
        </div>
        {hasConfig ? (
          <div className="flex flex-wrap gap-2">
            {busy ? (
              <button className="btn text-xs" type="button" onClick={onCancel}>
                <LoaderCircle className="animate-spin" size={14} />
                正在生成
                <Square size={12} />
              </button>
            ) : (
              <>
                <button
                  className="btn btn-gold text-xs"
                  type="button"
                  onClick={onComplete}
                >
                  <Sparkles size={14} /> AI 补全本页
                </button>
                <button className="btn text-xs" type="button" onClick={onIdeas}>
                  <Lightbulb size={14} /> 随机灵感
                </button>
              </>
            )}
            {canUndo && !busy && (
              <button className="btn text-xs" type="button" onClick={onUndo}>
                <RotateCcw size={14} /> 撤销本次补全
              </button>
            )}
          </div>
        ) : (
          <Link className="btn text-xs" href="/settings">
            配置模型后使用 AI 补全
          </Link>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--line)] pt-3 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!optimizeExisting}
            onChange={(event) => onOptimizeChange(!event.target.checked)}
          />
          仅补全空白字段
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={optimizeExisting}
            onChange={(event) => onOptimizeChange(event.target.checked)}
          />
          允许优化未锁定内容
        </label>
        <span className="muted">本操作将调用一次模型 API。</span>
      </div>
      {optimizeExisting && (
        <p className="mt-2 text-xs text-[var(--gold)]">
          AI 可能调整本页已有内容，但不会修改已锁定字段；完成后可以整页撤销。
        </p>
      )}
      {status && <p className="mt-2 text-xs text-[var(--gold)]">{status}</p>}
    </section>
  );
}

export function CreationIdeasDialog({
  open,
  title,
  candidates,
  onApply,
  onClose,
}: {
  open: boolean;
  title: string;
  candidates: CreationIdeaCandidate[];
  onApply: (candidate: CreationIdeaCandidate) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-black/55 p-4 backdrop-blur-[2px]">
      <section
        className="panel max-h-[86dvh] w-full max-w-3xl overflow-y-auto p-5 shadow-2xl md:p-7"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="mono gold text-[10px]">THREE DIRECTIONS</p>
            <h2 className="display mt-2 text-2xl">{title}</h2>
            <p className="muted mt-2 text-sm">
              先比较方向，点击采用后才会写入当前草稿。
            </p>
          </div>
          <button
            className="btn icon-btn"
            type="button"
            onClick={onClose}
            aria-label="关闭灵感候选"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {candidates.map((candidate) => (
            <article
              className="rounded-xl border border-[var(--line)] bg-[var(--panel2)] p-4"
              key={candidate.style}
            >
              <span className="badge">{candidate.style}</span>
              <h3 className="display mt-4 text-lg">{candidate.title}</h3>
              <p className="muted mt-2 text-sm leading-6">
                {candidate.description}
              </p>
              <button
                className="btn mt-5 w-full text-xs"
                type="button"
                onClick={() => onApply(candidate)}
              >
                采用这个方向
              </button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
