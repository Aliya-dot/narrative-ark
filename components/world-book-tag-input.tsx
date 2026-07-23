"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { splitWorldBookTags } from "@/lib/world-book";

export function WorldBookTagInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label?: string;
}) {
  const [draft, setDraft] = useState("");
  const commit = (raw = draft) => {
    const next = splitWorldBookTags([...value, raw]);
    if (next.length !== value.length || raw.trim()) onChange(next);
    setDraft("");
  };
  return (
    <div className="field">
      {label ? <span className="label">{label}</span> : null}
      <div className="input flex min-h-12 h-auto flex-wrap items-center gap-2 py-2">
        {value.map((tag, index) => (
          <span
            key={`${tag.toLocaleLowerCase("zh-CN")}:${index}`}
            className="tag inline-flex items-center gap-1"
          >
            {tag}
            <button
              type="button"
              aria-label={`删除 ${tag}`}
              title={`删除 ${tag}`}
              onClick={() => onChange(value.filter((item) => item !== tag))}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="min-w-28 flex-1 bg-transparent outline-none"
          value={draft}
          placeholder={value.length ? "继续输入…" : placeholder}
          onChange={(event) => {
            const next = event.target.value;
            if (/[，,、；;\n]/.test(next)) commit(next);
            else setDraft(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
            if (event.key === "Backspace" && !draft && value.length)
              onChange(value.slice(0, -1));
          }}
          onBlur={() => draft.trim() && commit()}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (/[，,、；;\n]/.test(text)) {
              event.preventDefault();
              commit(text);
            }
          }}
        />
      </div>
      <small className="muted">
        {value.length} 个；支持 Enter、逗号、分号或一次粘贴多个。
      </small>
    </div>
  );
}
