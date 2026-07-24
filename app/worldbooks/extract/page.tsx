"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, BookOpen, WandSparkles } from "lucide-react";
import { toast } from "sonner";
import { db, uid } from "@/lib/db";
import type {
  GameProject,
  GameSave,
  WorldBookEntryCategory,
  WorldBookVersion,
} from "@/lib/types";
import {
  estimateWorldBookTokens,
  WORLD_BOOK_CATEGORIES,
  WORLD_BOOK_CATEGORY_LABELS,
} from "@/lib/world-book";
import {
  candidatesToEntries,
  extractWorldBookCandidates,
  type ExtractedWorldBookCandidate,
  type WorldBookExtractionMode,
  type WorldBookExtractionResult,
} from "@/lib/world-book-extraction";
import { resolveSaveForProject } from "@/lib/project-save-boundary";

export default function ExtractWorldBookPage() {
  return (
    <Suspense
      fallback={<div className="container py-16 muted">正在准备提取工具…</div>}
    >
      <ExtractWorldBookContent />
    </Suspense>
  );
}

function ExtractWorldBookContent() {
  const router = useRouter();
  const search = useSearchParams();
  const [projects, setProjects] = useState<GameProject[]>([]);
  const [saves, setSaves] = useState<GameSave[]>([]);
  const [projectId, setProjectId] = useState(search.get("project") || "");
  const [saveId, setSaveId] = useState(search.get("save") || "");
  const [mode, setMode] = useState<WorldBookExtractionMode>(
    search.get("save") ? "derived" : "original",
  );
  const [includeProtagonist, setIncludeProtagonist] = useState(false);
  const [includeWorldChanges, setIncludeWorldChanges] = useState(true);
  const [result, setResult] = useState<WorldBookExtractionResult>();
  const [selectedId, setSelectedId] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    void Promise.all([
      db.projects.orderBy("updatedAt").reverse().toArray(),
      db.saves.orderBy("updatedAt").reverse().toArray(),
    ]).then(([p, s]) => {
      setProjects(p);
      setSaves(s);
      setProjectId((current) => current || p[0]?.id || "");
    });
  }, []);
  const project = projects.find((item) => item.id === projectId);
  const projectSaves = saves.flatMap((item) => {
    const resolved = resolveSaveForProject({ projectId, save: item });
    return resolved.ok ? [resolved.value] : [];
  });
  const save =
    projectSaves.find((item) => item.id === saveId) || projectSaves[0];
  const selected = result?.candidates.find((item) => item.id === selectedId);
  const selectedCandidates = useMemo(
    () => result?.candidates.filter((item) => item.selected) || [],
    [result],
  );
  const categoryCounts = useMemo(
    () =>
      selectedCandidates.reduce<Record<string, number>>((map, item) => {
        map[item.category] = (map[item.category] || 0) + 1;
        return map;
      }, {}),
    [selectedCandidates],
  );
  function analyze() {
    if (!project) return toast.error("请选择来源项目");
    if (mode === "derived" && !save)
      return toast.error("这个项目还没有可提取的游戏存档");
    const next = extractWorldBookCandidates(
      project,
      mode === "derived" ? save : undefined,
      uid("world"),
      {
        mode,
        includeProtagonist,
        includeGeneratedCharacters: false,
        includeWorldChanges,
        includeDiscoveredSecrets: false,
        includeAiOnlyContent: true,
        preserveVisibility: true,
      },
    );
    setResult(next);
    setSelectedId(next.candidates[0]?.id || "");
  }
  function updateCandidate(
    id: string,
    patch: Partial<ExtractedWorldBookCandidate>,
  ) {
    setResult((current) =>
      current
        ? {
            ...current,
            candidates: current.candidates.map((item) =>
              item.id === id
                ? { ...item, ...patch, updatedAt: new Date().toISOString() }
                : item,
            ),
          }
        : current,
    );
  }
  async function createDraft() {
    if (!result || !selectedCandidates.length)
      return toast.error("至少保留一张候选资料卡");
    setCreating(true);
    try {
      const entries = candidatesToEntries(result.candidates);
      const now = new Date().toISOString();
      const book = {
        ...result.book,
        entryIds: entries.map((entry) => entry.id),
        updatedAt: now,
        coreSummaryStatus: result.book.coreSummary
          ? ("current" as const)
          : ("empty" as const),
      };
      const version: WorldBookVersion = {
        id: book.currentVersionId,
        worldBookId: book.id,
        versionNumber: 1,
        note: `从项目《${project?.projectInfo.title}》${mode === "derived" ? "的当前游戏" : "设定集"}提取`,
        createdAt: now,
        snapshot: {
          coreSummary: book.coreSummary,
          entries: structuredClone(entries),
        },
      };
      await db.transaction(
        "rw",
        db.worldBooks,
        db.worldBookEntries,
        db.worldBookVersions,
        async () => {
          await db.worldBooks.put(book);
          if (entries.length) await db.worldBookEntries.bulkPut(entries);
          await db.worldBookVersions.put(version);
        },
      );
      toast.success("已创建世界书草稿，原项目和存档没有被修改");
      router.push(`/worldbooks/${book.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }
  return (
    <div className="mx-auto w-[calc(100vw-32px)] max-w-[1440px] py-8">
      <header className="mb-6 flex items-center gap-3">
        <Link
          className="btn icon-btn"
          href="/worldbooks"
          aria-label="返回世界书"
        >
          <ArrowLeft size={17} />
        </Link>
        <div>
          <p className="mono gold text-[11px]">WORLD BOOK EXTRACTION</p>
          <h1 className="display text-3xl">从已有内容创建世界书</h1>
          <p className="muted mt-1 text-sm">
            只生成可编辑候选，不修改原项目、游戏、存档或已绑定世界书。
          </p>
        </div>
      </header>
      <section className="panel mb-4 p-5">
        <h2 className="display text-xl">1. 选择来源与提取方式</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="field">
            <span className="label">来源项目</span>
            <select
              className="input"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setSaveId("");
                setResult(undefined);
              }}
            >
              {projects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.projectInfo.title}
                </option>
              ))}
            </select>
          </label>
          {mode === "derived" ? (
            <label className="field">
              <span className="label">来源游戏／存档</span>
              <select
                className="input"
                value={save?.id || ""}
                onChange={(e) => {
                  setSaveId(e.target.value);
                  setResult(undefined);
                }}
              >
                {projectSaves.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · 第 {item.turn} 回合 ·{" "}
                    {new Date(item.updatedAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {(
            [
              {
                id: "original",
                title: "原始世界设定",
                text: "只提取可跨游戏复用的基础设定，适合换主角重新开局。",
              },
              {
                id: "derived",
                title: "本局衍生世界",
                text: "加入已经发生的长期世界变化，适合续作或后日谈。",
              },
              {
                id: "custom",
                title: "自定义提取",
                text: "先按原始设定提取，再在候选预览中逐张取舍。",
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={`rounded-xl border p-4 text-left ${mode === item.id ? "border-[var(--gold)] bg-[var(--panel2)]" : "hairline"}`}
              onClick={() => {
                setMode(item.id);
                setResult(undefined);
              }}
            >
              <b>{item.title}</b>
              <p className="muted mt-2 text-xs leading-5">{item.text}</p>
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeProtagonist}
              onChange={(e) => setIncludeProtagonist(e.target.checked)}
            />
            将当前主角作为世界历史人物提取
          </label>
          {mode === "derived" ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={includeWorldChanges}
                onChange={(e) => setIncludeWorldChanges(e.target.checked)}
              />
              提取具有长期影响的世界变化
            </label>
          ) : null}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border hairline bg-[var(--panel2)] p-3">
          <p className="muted text-xs">
            当前使用<b className="text-[var(--ink)]">快速提取</b>
            ：复用结构化设定，不调用 API，也不发送完整回合历史。
          </p>
          <button className="btn btn-gold" onClick={analyze}>
            <WandSparkles size={15} />
            生成候选资料卡
          </button>
        </div>
      </section>
      {result ? (
        <>
          <section className="panel mb-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="display text-xl">2. 检查候选资料卡</h2>
                <p className="muted mt-1 text-sm">
                  预计创建 {selectedCandidates.length}{" "}
                  张；未勾选内容不会写入世界书。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(categoryCounts).map(([key, count]) => (
                  <span className="tag" key={key}>
                    {WORLD_BOOK_CATEGORY_LABELS[key as WorldBookEntryCategory]}{" "}
                    {count}
                  </span>
                ))}
              </div>
            </div>
            <details className="mt-4 rounded-lg border hairline p-3">
              <summary className="cursor-pointer text-sm">
                默认排除的本局数据（{result.excluded.length} 类）
              </summary>
              <ul className="muted mt-2 list-disc pl-5 text-xs">
                {result.excluded.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </section>
          <div className="grid min-h-[600px] gap-4 lg:grid-cols-[330px_1fr]">
            <aside className="panel scrollbar max-h-[75vh] overflow-y-auto p-2">
              {result.candidates.map((item) => (
                <div
                  key={item.id}
                  className={`mb-2 rounded-lg border p-3 ${selectedId === item.id ? "border-[var(--gold)] bg-[var(--panel2)]" : "hairline"}`}
                >
                  <label className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(e) =>
                        updateCandidate(item.id, { selected: e.target.checked })
                      }
                    />
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setSelectedId(item.id)}
                    >
                      <b className="block truncate">{item.title}</b>
                      <small className="muted">
                        {WORLD_BOOK_CATEGORY_LABELS[item.category]} ·{" "}
                        {item.sourceLabel}
                      </small>
                    </button>
                  </label>
                </div>
              ))}
            </aside>
            <main className="panel p-5">
              {selected ? (
                <div className="space-y-4">
                  <div>
                    <p className="mono gold text-[10px]">CANDIDATE</p>
                    <h2 className="display text-2xl">{selected.title}</h2>
                    <p className="muted text-xs">
                      {selected.sourceLabel} · 置信度{" "}
                      {Math.round(selected.confidence * 100)}%
                    </p>
                  </div>
                  {selected.warnings.map((warning) => (
                    <p
                      key={warning}
                      className="rounded-lg border hairline bg-[var(--panel2)] p-3 text-xs"
                    >
                      请检查：{warning}
                    </p>
                  ))}
                  <label className="field">
                    <span className="label">标题</span>
                    <input
                      className="input"
                      value={selected.title}
                      onChange={(e) =>
                        updateCandidate(selected.id, { title: e.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="label">资料类型</span>
                    <select
                      className="input"
                      value={selected.category}
                      onChange={(e) =>
                        updateCandidate(selected.id, {
                          category: e.target.value as WorldBookEntryCategory,
                        })
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
                    <span className="label">简短说明</span>
                    <textarea
                      className="input textarea"
                      value={selected.summary}
                      onChange={(e) =>
                        updateCandidate(selected.id, {
                          summary: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span className="label">详细设定</span>
                    <textarea
                      className="input min-h-64 resize-y"
                      value={selected.content}
                      onChange={(e) =>
                        updateCandidate(selected.id, {
                          content: e.target.value,
                        })
                      }
                    />
                  </label>
                  <p className="muted text-xs">
                    当前资料卡约{" "}
                    {estimateWorldBookTokens(
                      selected.content || selected.summary,
                    )}{" "}
                    Token
                  </p>
                </div>
              ) : (
                <p className="muted">选择一张候选资料卡进行检查。</p>
              )}
            </main>
          </div>
          <section className="panel mt-4 flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <h2 className="display text-xl">3. 创建世界书草稿</h2>
              <p className="muted mt-1 text-sm">
                将创建独立的新 ID 和 V1 草稿，默认不会绑定当前项目。
              </p>
            </div>
            <button
              className="btn btn-gold"
              disabled={creating || !selectedCandidates.length}
              onClick={() => void createDraft()}
            >
              <BookOpen size={15} />
              {creating
                ? "创建中…"
                : `创建世界书草稿（${selectedCandidates.length} 张）`}
            </button>
          </section>
        </>
      ) : null}
    </div>
  );
}
