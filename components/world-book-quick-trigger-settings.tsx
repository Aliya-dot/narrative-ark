"use client";

import { useState } from "react";
import { Lock, RefreshCw } from "lucide-react";
import type {
  WorldBookEntry,
  WorldBookEntryActivationMode,
} from "@/lib/types";
import {
  addWorldBookAlias,
  normalizeWorldBookEntryTriggers,
  refreshAutoWorldBookTriggers,
} from "@/lib/world-book-triggers";
import {
  resolveWorldBookActivationMode,
  withWorldBookActivationMode,
  WORLD_BOOK_ACTIVATION_LABELS,
} from "@/lib/world-book";

export function WorldBookQuickTriggerSettings({
  entry,
  onChange,
  onSwitchProfessional,
}: {
  entry: WorldBookEntry;
  onChange: (entry: WorldBookEntry) => void;
  onSwitchProfessional: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [alias, setAlias] = useState("");
  const normalized = normalizeWorldBookEntryTriggers(entry);
  const terms = [...(normalized.triggers || []), ...(normalized.aliasTriggers || [])];
  const mode = resolveWorldBookActivationMode(normalized);

  return (
    <div className="rounded-lg border hairline bg-[var(--panel2)] p-3">
      <button
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>
          <b>自动调用已配置</b>
          <small className="muted mt-1 block">
            {mode === "disabled"
              ? "这张资料卡目前不会被调用"
              : mode === "always" || mode === "core_rule"
                ? "每回合提供给 AI"
                : `${terms.length} 个识别词，提到相关内容时调用`}
          </small>
        </span>
        <span className="tag">{open ? "收起" : "查看"}</span>
      </button>
      {open ? (
        <div className="mt-4 space-y-4 border-t hairline pt-4">
          <label className="field">
            <span className="label">什么时候调用？</span>
            <select
              className="input"
              value={mode}
              onChange={(event) =>
                onChange(
                  withWorldBookActivationMode(
                    normalized,
                    event.target.value as WorldBookEntryActivationMode,
                  ),
                )
              }
            >
              {Object.entries(WORLD_BOOK_ACTIVATION_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="label">AI 用这些名称识别它</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {terms.map((trigger) => (
                <span className="tag" key={trigger.id}>
                  {trigger.value}
                  {trigger.locked ? <Lock size={11} /> : null}
                </span>
              ))}
              {!terms.length ? <span className="muted text-xs">尚无识别词</span> : null}
            </div>
          </div>

          <div className="flex gap-2">
            <input
              className="input min-w-0 flex-1"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="添加玩家可能使用的别名"
              onKeyDown={(event) => {
                if (event.key !== "Enter" || !alias.trim()) return;
                event.preventDefault();
                onChange(addWorldBookAlias(normalized, alias));
                setAlias("");
              }}
            />
            <button
              className="btn"
              disabled={!alias.trim()}
              onClick={() => {
                onChange(addWorldBookAlias(normalized, alias));
                setAlias("");
              }}
            >
              添加
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn"
              onClick={() => onChange(refreshAutoWorldBookTriggers(normalized))}
            >
              <RefreshCw size={14} /> 根据标题重新生成
            </button>
            <button className="btn" onClick={onSwitchProfessional}>
              进入专业模式细调
            </button>
          </div>
          <p className="muted text-xs leading-5">
            自动生成只会更新未锁定的自动识别词；你手动添加、AI 生成或从旧版导入的内容都会保留。
          </p>
        </div>
      ) : null}
    </div>
  );
}
