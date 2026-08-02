"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Copy,
  Download,
  FileUp,
  Library,
  Plus,
  WandSparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { db, uid } from "@/lib/db";
import type {
  GameProject,
  WorldBook,
  WorldBookEntry,
  WorldBookVersion,
} from "@/lib/types";
import {
  formatWorldBookMappingErrors,
  remapWorldBookEntries,
} from "@/lib/world-book-entry-mapping";
import {
  type WorldBookRecordStore,
  writeWorldBookRecords,
} from "@/lib/world-book-record-write";
import { createWorldBookBundle, parseWorldBookBundle } from "@/lib/world-book";
import { advanceWorldBookUpdatedAt } from "@/lib/world-book-publish-boundary";
import { savePortableText } from "@/lib/platform/portable-files";

async function downloadJson(name: string, value: unknown) {
  await savePortableText(name, JSON.stringify(value, null, 2), {
    title: "导出叙界世界书",
    extensions: ["nark-world", "json"],
  });
}

const worldBookRecordStore: WorldBookRecordStore = {
  runTransaction: async (operation) => {
    await db.transaction(
      "rw",
      db.worldBooks,
      db.worldBookEntries,
      db.worldBookVersions,
      operation,
    );
  },
  addWorldBook: (book) => db.worldBooks.add(book),
  addEntries: (entries) => db.worldBookEntries.bulkAdd(entries),
  addVersion: (version) => db.worldBookVersions.add(version),
};

export default function WorldBooksPage() {
  const [books, setBooks] = useState<WorldBook[]>([]);
  const [projects, setProjects] = useState<GameProject[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function reload() {
    const [nextBooks, nextProjects] = await Promise.all([
      db.worldBooks.orderBy("updatedAt").reverse().toArray(),
      db.projects.toArray(),
    ]);
    setBooks(nextBooks);
    setProjects(nextProjects);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function copyBook(source: WorldBook) {
    const sourceEntries = await db.worldBookEntries
      .where("worldBookId")
      .equals(source.id)
      .toArray();
    const remapped = remapWorldBookEntries({
      entries: sourceEntries,
      createWorldBookId: () => uid("world"),
      createEntryId: () => uid("entry"),
    });
    if (!remapped.ok) {
      toast.error(formatWorldBookMappingErrors(remapped.errors));
      return;
    }
    const now = new Date().toISOString();
    const id = remapped.worldBookId;
    const entries: WorldBookEntry[] = remapped.entries.map((entry) => ({
      ...entry,
      createdAt: now,
      updatedAt: now,
    }));
    const versionId = `${id}:v1`;
    const book: WorldBook = {
      ...structuredClone(source),
      id,
      name: `${source.name}（副本）`,
      status: "draft",
      currentVersionId: versionId,
      versionNumber: 1,
      entryIds: entries.map((entry) => entry.id),
      createdAt: now,
      updatedAt: now,
    };
    const version: WorldBookVersion = {
      id: versionId,
      worldBookId: id,
      versionNumber: 1,
      note: "复制世界书",
      createdAt: now,
      snapshot: {
        coreSummary: book.coreSummary,
        entries: structuredClone(entries),
      },
    };
    await writeWorldBookRecords(worldBookRecordStore, {
      book,
      entries,
      version,
    });
    toast.success("已创建世界书副本");
    await reload();
  }

  async function exportBook(book: WorldBook) {
    const [entries, versions] = await Promise.all([
      db.worldBookEntries.where("worldBookId").equals(book.id).toArray(),
      db.worldBookVersions
        .where("worldBookId")
        .equals(book.id)
        .sortBy("versionNumber"),
    ]);
    await downloadJson(
      `${book.name}-世界书.nark-world`,
      createWorldBookBundle(book, entries, versions),
    );
  }

  async function removeBook(book: WorldBook) {
    const refs = projects.filter(
      (project) => project.worldBinding?.worldBookId === book.id,
    );
    const warning = refs.length
      ? `已有 ${refs.length} 个游戏引用这个世界书。删除只会移除世界书源数据，已有游戏保留内嵌设定，但无法再查看绑定版本。\n\n仍要删除吗？`
      : "将删除世界书、全部资料卡和版本记录。此操作不可撤销，仍要继续吗？";
    if (!window.confirm(warning)) return;
    await db.transaction(
      "rw",
      db.worldBooks,
      db.worldBookEntries,
      db.worldBookVersions,
      db.scenarios,
      async () => {
        await db.worldBookEntries.where("worldBookId").equals(book.id).delete();
        await db.worldBookVersions
          .where("worldBookId")
          .equals(book.id)
          .delete();
        await db.scenarios.where("worldBookId").equals(book.id).delete();
        await db.worldBooks.delete(book.id);
      },
    );
    toast.success("世界书已删除");
    await reload();
  }

  async function importFile(file: File) {
    try {
      const bundle = parseWorldBookBundle(JSON.parse(await file.text()));
      const remapped = remapWorldBookEntries({
        entries: bundle.entries,
        createWorldBookId: () => uid("world"),
        createEntryId: () => uid("entry"),
      });
      if (!remapped.ok) {
        toast.error(formatWorldBookMappingErrors(remapped.errors));
        return;
      }
      const now = new Date().toISOString();
      const id = remapped.worldBookId;
      const entries: WorldBookEntry[] = remapped.entries.map((entry) => ({
        ...entry,
        createdAt: now,
        updatedAt: now,
      }));
      const versionId = `${id}:v1`;
      const book: WorldBook = {
        ...bundle.worldBook,
        id,
        name: `${bundle.worldBook.name}（导入）`,
        status: "draft",
        currentVersionId: versionId,
        versionNumber: 1,
        entryIds: entries.map((entry) => entry.id),
        createdAt: now,
        updatedAt: now,
      };
      const version: WorldBookVersion = {
        id: versionId,
        worldBookId: id,
        versionNumber: 1,
        note: "导入 JSON",
        createdAt: now,
        snapshot: {
          coreSummary: book.coreSummary,
          entries: structuredClone(entries),
        },
      };
      await writeWorldBookRecords(worldBookRecordStore, {
        book,
        entries,
        version,
      });
      toast.success("世界书导入成功");
      await reload();
    } catch {
      toast.error("导入失败：文件格式或数据无效");
    }
  }

  const visibleBooks = books.filter(
    (book) => showArchived || book.status !== "archived",
  );
  return (
    <div className="container py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mono gold mb-2 text-xs tracking-[.18em]">
            WORLD LIBRARY
          </p>
          <h1 className="display text-4xl">世界书</h1>
          <p className="muted mt-3 max-w-2xl">
            把人物、地点、势力和规则保存成可重复使用的资料卡。游戏进行时只读取当前需要的资料，更省
            API 用量。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn" href="/worldbooks/extract">
            <WandSparkles size={16} />
            从已有项目创建
          </Link>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <FileUp size={16} />
            导入 JSON
          </button>
          <input
            ref={fileRef}
            className="hidden"
            type="file"
            accept=".nark-world,.json,application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importFile(file);
              event.currentTarget.value = "";
            }}
          />
          <Link className="btn btn-gold" href="/worldbooks/new">
            <Plus size={16} />
            新建世界书
          </Link>
        </div>
      </div>
      <label className="mb-5 flex items-center gap-2 text-sm muted">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        显示已归档
      </label>
      {visibleBooks.length === 0 ? (
        <div className="panel grid min-h-72 place-items-center p-8 text-center">
          <div>
            <Library className="gold mx-auto mb-4" size={34} />
            <h2 className="display text-2xl">还没有世界书</h2>
            <p className="muted mt-2">
              可以从空白开始，也可以从已有项目提取一份。
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleBooks.map((book) => {
            const refCount = projects.filter(
              (project) => project.worldBinding?.worldBookId === book.id,
            ).length;
            return (
              <article
                key={book.id}
                className="panel flex min-h-64 flex-col p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="mono gold text-[11px]">
                      V{book.versionNumber} ·{" "}
                      {book.status === "archived"
                        ? "已归档"
                        : book.status === "published"
                          ? "已发布"
                          : "草稿"}
                    </span>
                    <h2 className="display mt-2 text-2xl">{book.name}</h2>
                  </div>
                  <span className="tag">{book.entryIds.length} 张资料卡</span>
                </div>
                <p className="muted mt-3 line-clamp-3 text-sm">
                  {book.description || book.coreSummary || "尚未填写简介"}
                </p>
                <p className="muted mt-auto pt-5 text-xs">
                  {refCount} 个游戏引用 ·{" "}
                  {new Date(book.updatedAt).toLocaleString()}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    className="btn btn-gold"
                    href={`/worldbooks/${book.id}`}
                  >
                    编辑
                  </Link>
                  <Link className="btn" href={`/create?worldBook=${book.id}`}>
                    创建游戏
                  </Link>
                  <button
                    className="btn icon-btn"
                    title="导出 JSON"
                    aria-label="导出 JSON"
                    onClick={() => void exportBook(book)}
                  >
                    <Download size={15} />
                  </button>
                  <button
                    className="btn icon-btn"
                    title="复制"
                    aria-label="复制"
                    onClick={() => void copyBook(book)}
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    className="btn icon-btn"
                    title={book.status === "archived" ? "恢复" : "归档"}
                    aria-label={book.status === "archived" ? "恢复" : "归档"}
                    onClick={async () => {
                      await db.worldBooks.update(book.id, {
                        status:
                          book.status === "archived" ? "draft" : "archived",
                        updatedAt: advanceWorldBookUpdatedAt(book.updatedAt),
                      });
                      await reload();
                    }}
                  >
                    <Archive size={15} />
                  </button>
                  <button
                    className="btn icon-btn text-red-400"
                    title="删除"
                    aria-label="删除"
                    onClick={() => void removeBook(book)}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
