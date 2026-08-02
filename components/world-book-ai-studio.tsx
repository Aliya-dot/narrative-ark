"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { assistWorldBookEntry, generateWorldBookDraft } from "@/lib/ai-client";
import { db, uid } from "@/lib/db";
import { loadAIConfig } from "@/lib/ai-config-repository";
import type {
  AIConfig,
  WorldBook,
  WorldBookAiDraft,
  WorldBookAiOperation,
  WorldBookEntry,
  WorldBookEntryCategory,
} from "@/lib/types";
import type { GeneratedWorldBookDraft } from "@/lib/world-book-ai";
import {
  WORLD_BOOK_CATEGORIES,
  WORLD_BOOK_CATEGORY_LABELS,
} from "@/lib/world-book";

type StudioMode = "full" | "fill" | "category" | "entry";
export function WorldBookAiStudio({
  open,
  initialMode,
  book,
  entries,
  targetEntry,
  onClose,
  onApplyGenerated,
  onApplyEntry,
}: {
  open: boolean;
  initialMode: StudioMode;
  book: WorldBook;
  entries: WorldBookEntry[];
  targetEntry?: WorldBookEntry;
  onClose: () => void;
  onApplyGenerated: (
    draft: GeneratedWorldBookDraft,
    selectedIds: string[],
  ) => boolean;
  onApplyEntry: (draft: GeneratedWorldBookDraft) => boolean;
}) {
  const [mode, setMode] = useState<StudioMode>(initialMode);
  const [config, setConfig] = useState<AIConfig>();
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GeneratedWorldBookDraft>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [entryOperation, setEntryOperation] =
    useState<WorldBookAiOperation>("entry_generation");
  const [genre, setGenre] = useState("");
  const [idea, setIdea] = useState("");
  const [tone, setTone] = useState("");
  const [scale, setScale] = useState<"compact" | "standard" | "large">(
    "standard",
  );
  const [era, setEra] = useState("");
  const [include, setInclude] = useState("");
  const [exclude, setExclude] = useState("");
  const [conflict, setConflict] = useState("");
  const [creativity, setCreativity] = useState<"safe" | "unique" | "bold">(
    "unique",
  );
  const [category, setCategory] = useState<WorldBookEntryCategory>("character");
  const [count, setCount] = useState(3);
  const controller = useRef<AbortController | null>(null);
  const draftKey = `worldbook-ai:${book.id}`;
  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    void Promise.all([loadAIConfig(), db.drafts.get(draftKey)]).then(
      ([nextConfig, stored]) => {
        setConfig(nextConfig);
        const aiDraft = stored?.value as WorldBookAiDraft | undefined;
        if (aiDraft?.status === "ready") {
          const restored = aiDraft.result as GeneratedWorldBookDraft;
          setResult(restored);
          setSelectedIds(restored.entries.map((entry) => entry.temporaryId));
        }
      },
    );
    return () => controller.current?.abort();
  }, [open, initialMode, draftKey]);
  const counts = useMemo(
    () =>
      (result?.entries || []).reduce<Record<string, number>>((map, entry) => {
        map[entry.category] = (map[entry.category] || 0) + 1;
        return map;
      }, {}),
    [result],
  );
  async function rememberDraft(
    operation: WorldBookAiOperation,
    next: GeneratedWorldBookDraft,
  ) {
    const draft: WorldBookAiDraft = {
      id: uid("ai-draft"),
      worldBookId: book.id,
      operation,
      targetEntryIds: targetEntry ? [targetEntry.id] : undefined,
      beforeSnapshot: targetEntry
        ? structuredClone(targetEntry)
        : { book: structuredClone(book), entries: structuredClone(entries) },
      result: next,
      createdAt: new Date().toISOString(),
      status: "ready",
    };
    await db.drafts.put({
      id: draftKey,
      value: draft,
      updatedAt: draft.createdAt,
    });
  }
  async function generate() {
    if (!config) return;
    if (generating) return;
    if (mode === "full" && !idea.trim())
      return toast.error("请先写下一句话世界想法");
    if (mode === "entry" && !targetEntry) return toast.error("请先选择资料卡");
    if (
      targetEntry?.locked &&
      mode === "entry" &&
      !window.confirm(
        "这张资料卡已锁定。此次为你主动发起的单卡 AI 操作，是否仍生成候选？",
      )
    )
      return;
    setGenerating(true);
    controller.current = new AbortController();
    try {
      let next: GeneratedWorldBookDraft;
      let operation: WorldBookAiOperation;
      if (mode === "entry" && targetEntry) {
        operation = entryOperation;
        next = await assistWorldBookEntry(
          config,
          {
            operation: entryOperation,
            instruction,
            entry: {
              category: targetEntry.category,
              title: targetEntry.title,
              summary: targetEntry.summary,
              content: targetEntry.content,
              keywords: targetEntry.keywords,
              aliases: targetEntry.aliases,
            },
            context: {
              coreSummary: book.coreSummary,
              related: entries
                .filter((entry) =>
                  targetEntry.relatedEntryIds.includes(entry.id),
                )
                .slice(0, 12)
                .map((entry) => ({
                  title: entry.title,
                  summary: entry.summary,
                })),
            },
          },
          controller.current.signal,
        );
      } else {
        operation =
          mode === "full"
            ? "full_generation"
            : mode === "fill"
              ? "fill_missing"
              : "category_generation";
        next = await generateWorldBookDraft(
          config,
          {
            operation,
            brief: {
              genre,
              idea,
              tone,
              scale,
              era,
              include,
              exclude,
              conflict,
              reference: "",
              creativity,
              category: mode === "category" ? category : undefined,
              count: mode === "category" ? count : undefined,
              direction: instruction,
            },
            existing:
              mode === "full" && entries.length === 0
                ? undefined
                : {
                    name: book.name,
                    description: book.description,
                    coreSummary: book.coreSummary,
                    entries: entries.slice(0, 80).map((entry) => ({
                      category: entry.category,
                      title: entry.title,
                      summary: entry.summary,
                      locked: Boolean(entry.locked),
                    })),
                  },
          },
          controller.current.signal,
        );
      }
      setResult(next);
      setSelectedIds(next.entries.map((entry) => entry.temporaryId));
      await rememberDraft(operation, next);
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        toast.error(
          error instanceof Error ? error.message : "AI 生成失败，原内容未改变",
        );
    } finally {
      setGenerating(false);
    }
  }
  async function discard() {
    await db.drafts.delete(draftKey);
    setResult(undefined);
    setSelectedIds([]);
  }
  function updateCandidate(
    temporaryId: string,
    patch: Partial<GeneratedWorldBookDraft["entries"][number]>,
  ) {
    setResult((current) =>
      current
        ? {
            ...current,
            entries: current.entries.map((entry) =>
              entry.temporaryId === temporaryId
                ? { ...entry, ...patch }
                : entry,
            ),
          }
        : current,
    );
  }
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[95] overflow-y-auto bg-black/60 p-3 backdrop-blur-[2px] md:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="panel mx-auto min-h-[80vh] w-full max-w-6xl p-5 md:p-7">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="mono gold text-[10px]">AI WORLD STUDIO</p>
            <h2 className="display text-3xl">AI 创作草稿</h2>
            <p className="muted mt-1 text-sm">
              生成结果先进入预览，不会覆盖工作内容，也不会发布新版本。
            </p>
          </div>
          <button
            className="btn icon-btn"
            aria-label="关闭 AI 创作"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </header>
        {!config ? (
          <div className="mt-8 rounded-xl border hairline p-6 text-center">
            <h3 className="display text-xl">尚未配置可用的模型</h3>
            <p className="muted mt-2 text-sm">
              世界书 AI 创作使用你自己的 API 配置。
            </p>
            <Link className="btn btn-gold mt-4" href="/settings">
              前往 API 设置
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 flex flex-wrap gap-2">
              {(
                [
                  ["full", "一句话生成"],
                  ["fill", "补全缺失"],
                  ["category", "生成分类"],
                  ["entry", "单张资料卡"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  className={`btn ${mode === key ? "btn-gold" : ""}`}
                  onClick={() => {
                    setMode(key);
                    setResult(undefined);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {!result ? (
              <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
                <section className="space-y-4">
                  {mode === "full" ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="field">
                          <span className="label">世界题材</span>
                          <input
                            className="input"
                            value={genre}
                            onChange={(e) => setGenre(e.target.value)}
                            placeholder="西方奇幻、都市怪谈、太空歌剧…"
                          />
                        </label>
                        <label className="field">
                          <span className="label">整体风格</span>
                          <input
                            className="input"
                            value={tone}
                            onChange={(e) => setTone(e.target.value)}
                            placeholder="克制、浪漫、黑暗、史诗…"
                          />
                        </label>
                      </div>
                      <label className="field">
                        <span className="label">一句话世界想法 *</span>
                        <textarea
                          className="input textarea"
                          value={idea}
                          onChange={(e) => setIdea(e.target.value)}
                          placeholder="例如：所有人的影子都会在成年后离开主人，并建立自己的地下王国。"
                        />
                      </label>
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="field">
                          <span className="label">当前时代</span>
                          <input
                            className="input"
                            value={era}
                            onChange={(e) => setEra(e.target.value)}
                          />
                        </label>
                        <label className="field">
                          <span className="label">世界规模</span>
                          <select
                            className="input"
                            value={scale}
                            onChange={(e) =>
                              setScale(e.target.value as typeof scale)
                            }
                          >
                            <option value="compact">
                              精简世界 · 约 12～16 张
                            </option>
                            <option value="standard">
                              标准世界 · 约 16～24 张
                            </option>
                            <option value="large">
                              大型骨架 · 约 22～28 张
                            </option>
                          </select>
                        </label>
                      </div>
                      <label className="field">
                        <span className="label">希望出现的元素</span>
                        <input
                          className="input"
                          value={include}
                          onChange={(e) => setInclude(e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span className="label">不希望出现的元素</span>
                        <input
                          className="input"
                          value={exclude}
                          onChange={(e) => setExclude(e.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span className="label">主要冲突（可选）</span>
                        <textarea
                          className="input textarea"
                          value={conflict}
                          onChange={(e) => setConflict(e.target.value)}
                        />
                      </label>
                    </>
                  ) : null}
                  {mode === "category" ? (
                    <>
                      <label className="field">
                        <span className="label">生成分类</span>
                        <select
                          className="input"
                          value={category}
                          onChange={(e) =>
                            setCategory(
                              e.target.value as WorldBookEntryCategory,
                            )
                          }
                        >
                          {WORLD_BOOK_CATEGORIES.map((key) => (
                            <option key={key} value={key}>
                              {WORLD_BOOK_CATEGORY_LABELS[key]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span className="label">数量</span>
                        <input
                          className="input"
                          type="number"
                          min={1}
                          max={8}
                          value={count}
                          onChange={(e) =>
                            setCount(
                              Math.max(1, Math.min(8, Number(e.target.value))),
                            )
                          }
                        />
                      </label>
                      <label className="field">
                        <span className="label">生成方向</span>
                        <textarea
                          className="input textarea"
                          value={instruction}
                          onChange={(e) => setInstruction(e.target.value)}
                          placeholder="例如：生成与王都政治冲突有关的人物"
                        />
                      </label>
                    </>
                  ) : null}
                  {mode === "fill" ? (
                    <div className="rounded-xl border hairline bg-[var(--panel2)] p-5">
                      <b>只补全缺失内容</b>
                      <p className="muted mt-2 text-sm leading-6">
                        AI
                        会看到核心摘要以及资料卡的标题和简短说明；锁定资料卡只用于理解背景，不会被替换。已有完整资料卡不会静默覆盖。
                      </p>
                    </div>
                  ) : null}
                  {mode === "entry" ? (
                    <>
                      <div className="rounded-xl border hairline bg-[var(--panel2)] p-4">
                        <b>{targetEntry?.title || "尚未选择资料卡"}</b>
                        {targetEntry?.locked ? (
                          <span className="tag ml-2">已锁定</span>
                        ) : null}
                      </div>
                      <label className="field">
                        <span className="label">AI 操作</span>
                        <select
                          className="input"
                          value={entryOperation}
                          onChange={(e) =>
                            setEntryOperation(
                              e.target.value as WorldBookAiOperation,
                            )
                          }
                        >
                          <option value="entry_generation">
                            根据标题生成资料卡
                          </option>
                          <option value="entry_expand">扩写详细设定</option>
                          <option value="entry_summarize">生成简短说明</option>
                          <option value="keyword_generation">生成触发词</option>
                          <option value="alias_generation">生成其他叫法</option>
                          <option value="entry_rewrite">换一种设定</option>
                        </select>
                      </label>
                      <label className="field">
                        <span className="label">补充要求（可选）</span>
                        <textarea
                          className="input textarea"
                          value={instruction}
                          onChange={(e) => setInstruction(e.target.value)}
                        />
                      </label>
                    </>
                  ) : null}
                </section>
                <aside className="rounded-xl border hairline bg-[var(--panel2)] p-5">
                  <h3 className="display text-xl">本次请求</h3>
                  <p className="muted mt-3 text-sm leading-6">
                    {mode === "full"
                      ? "生成世界骨架、核心摘要和主要分类。一次请求，实际消耗取决于模型与生成规模。"
                      : mode === "category"
                        ? `生成 ${count} 张${WORLD_BOOK_CATEGORY_LABELS[category]}资料卡，只发送必要世界摘要。`
                        : mode === "fill"
                          ? "分析缺失类别并生成候选，不修改现有完整资料卡。"
                          : "只发送当前资料卡、核心摘要与少量关联摘要。"}
                  </p>
                  <label className="field mt-4">
                    <span className="label">创意程度</span>
                    <select
                      className="input"
                      value={creativity}
                      onChange={(e) =>
                        setCreativity(e.target.value as typeof creativity)
                      }
                    >
                      <option value="safe">稳妥</option>
                      <option value="unique">独特</option>
                      <option value="bold">大胆</option>
                    </select>
                  </label>
                  <button
                    className="btn btn-gold mt-5 w-full"
                    disabled={generating}
                    onClick={() => void generate()}
                  >
                    <Sparkles size={15} />
                    {generating ? "生成中，可关闭以取消…" : "生成 AI 草稿"}
                  </button>
                  <p className="muted mt-3 text-xs">
                    不会自动重试，不会输出或记录 API
                    Key。关闭页面会取消未完成请求。
                  </p>
                </aside>
              </div>
            ) : (
              <div className="mt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="display text-2xl">
                      AI 已生成 {result.entries.length} 张候选资料卡
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(counts).map(([key, value]) => (
                        <span className="tag" key={key}>
                          {
                            WORLD_BOOK_CATEGORY_LABELS[
                              key as WorldBookEntryCategory
                            ]
                          }{" "}
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn" onClick={() => void discard()}>
                      放弃草稿
                    </button>
                    <button
                      className="btn"
                      onClick={() => setResult(undefined)}
                    >
                      返回修改条件
                    </button>
                  </div>
                </div>
                {mode !== "entry" ? (
                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    {result.entries.map((entry, index) => (
                      <article
                        key={`${entry.temporaryId}:${index}`}
                        className={`rounded-xl border p-4 ${selectedIds.includes(entry.temporaryId) ? "border-[var(--gold)] bg-[var(--panel2)]" : "hairline opacity-60"}`}
                      >
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(entry.temporaryId)}
                            onChange={(e) =>
                              setSelectedIds((current) =>
                                e.target.checked
                                  ? [...current, entry.temporaryId]
                                  : current.filter(
                                      (id) => id !== entry.temporaryId,
                                    ),
                              )
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <span className="mono gold text-[10px]">
                              {WORLD_BOOK_CATEGORY_LABELS[entry.category]}
                            </span>
                            <input
                              className="input mt-2"
                              aria-label={`${entry.title}候选标题`}
                              value={entry.title}
                              onChange={(event) =>
                                updateCandidate(entry.temporaryId, {
                                  title: event.target.value,
                                })
                              }
                            />
                            <textarea
                              className="input textarea mt-2 min-h-20"
                              aria-label={`${entry.title}候选摘要`}
                              value={entry.summary}
                              onChange={(event) =>
                                updateCandidate(entry.temporaryId, {
                                  summary: event.target.value,
                                })
                              }
                            />
                            <details className="mt-2 text-xs">
                              <summary className="cursor-pointer muted">
                                编辑详细设定
                              </summary>
                              <textarea
                                className="input mt-2 min-h-40"
                                aria-label={`${entry.title}候选详细设定`}
                                value={entry.content}
                                onChange={(event) =>
                                  updateCandidate(entry.temporaryId, {
                                    content: event.target.value,
                                  })
                                }
                              />
                            </details>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <article className="mt-5 rounded-xl border hairline bg-[var(--panel2)] p-5">
                    {result.entries[0] ? (
                      <div className="space-y-3">
                        <label className="field">
                          <span className="label">标题</span>
                          <input
                            className="input"
                            value={result.entries[0].title}
                            onChange={(event) =>
                              updateCandidate(result.entries[0].temporaryId, {
                                title: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span className="label">简短说明</span>
                          <textarea
                            className="input textarea"
                            value={result.entries[0].summary}
                            onChange={(event) =>
                              updateCandidate(result.entries[0].temporaryId, {
                                summary: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          <span className="label">详细设定</span>
                          <textarea
                            className="input min-h-64"
                            value={result.entries[0].content}
                            onChange={(event) =>
                              updateCandidate(result.entries[0].temporaryId, {
                                content: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                    ) : null}
                  </article>
                )}
                <div className="mt-6 flex justify-end gap-2">
                  <button className="btn" onClick={onClose}>
                    稍后处理
                  </button>
                  <button
                    className="btn btn-gold"
                    disabled={mode !== "entry" && !selectedIds.length}
                    onClick={async () => {
                      const applied =
                        mode === "entry"
                          ? onApplyEntry(result)
                          : onApplyGenerated(result, selectedIds);
                      if (!applied) return;
                      await db.drafts.delete(draftKey);
                      onClose();
                    }}
                  >
                    <Sparkles size={15} />
                    应用到工作草稿
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
