"use client";

import { useMemo, useState } from "react";
import { SearchCheck } from "lucide-react";
import type {
  WorldBook,
  WorldBookEntry,
  WorldBookTurnContext,
  WorldBookVersion,
} from "@/lib/types";
import { retrieveWorldBookContext, WORLD_BOOK_BUDGETS } from "@/lib/world-book";
import { WorldBookTagInput } from "./world-book-tag-input";

export function QuickWorldBookRetrievalTester({
  book,
  entries,
}: {
  book: WorldBook;
  entries: WorldBookEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [location, setLocation] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [tasks, setTasks] = useState<string[]>([]);
  const [result, setResult] = useState<WorldBookTurnContext>();
  const version = useMemo<WorldBookVersion>(
    () => ({
      id: `${book.id}:quick-preview`,
      worldBookId: book.id,
      versionNumber: book.versionNumber,
      createdAt: new Date().toISOString(),
      snapshot: { coreSummary: book.coreSummary, entries },
    }),
    [book, entries],
  );

  function run() {
    setResult(
      retrieveWorldBookContext(
        book,
        version,
        {
          userInput,
          recentNarrative: "",
          currentLocation: location,
          currentPeriod: "",
          activeNpcIds: [],
          activeNpcNames: people,
          activeFactionIds: [],
          activeTaskIds: [],
          activeTaskText: tasks,
          activeItemIds: [],
          activeItemNames: [],
        },
        WORLD_BOOK_BUDGETS.balanced,
      ),
    );
  }

  return (
    <section className="panel mb-4 overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>
          <b>试试哪些资料会被调用</b>
          <span className="muted ml-2 text-xs">使用游戏中的真实检索规则</span>
        </span>
        <span className="tag">{open ? "收起" : "开始测试"}</span>
      </button>
      {open ? (
        <div className="border-t hairline p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="field md:col-span-2">
              <span className="label">模拟玩家输入</span>
              <textarea
                className="input textarea"
                value={userInput}
                onChange={(event) => setUserInput(event.target.value)}
                placeholder="例如：向伊莱娜询问火元素魔法。"
              />
            </label>
            <label className="field">
              <span className="label">当前地点（可留空）</span>
              <input
                className="input"
                value={location}
                onChange={(event) => setLocation(event.target.value)}
              />
            </label>
            <WorldBookTagInput
              label="当前出场人物（可留空）"
              value={people}
              onChange={setPeople}
              placeholder="伊莱娜"
            />
            <WorldBookTagInput
              label="当前任务（可留空）"
              value={tasks}
              onChange={setTasks}
              placeholder="学习火球术"
            />
          </div>
          <button className="btn btn-gold mt-4" onClick={run}>
            <SearchCheck size={15} /> 查看调用结果
          </button>
          {result ? (
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="display text-xl">
                  会调用 {result.preview.selected.length} 张资料卡
                </h3>
                <span className="tag">
                  约 {result.preview.injectedTokens} Token
                </span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {result.preview.selected.map((item) => (
                  <article key={item.entryId} className="rounded-lg border hairline bg-[var(--panel2)] p-3">
                    <b>{item.title}</b>
                    <p className="muted mt-1 text-xs leading-5">
                      {item.reasons.join("；") || "核心资料"}
                    </p>
                  </article>
                ))}
              </div>
              {!result.preview.selected.length ? (
                <p className="muted mt-3 text-sm">
                  没有资料卡被命中。可以检查资料卡标题、别名和调用方式。
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
