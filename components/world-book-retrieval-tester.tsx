"use client";

import { useMemo, useState } from "react";
import { SearchCheck } from "lucide-react";
import type {
  WorldBook,
  WorldBookContextBudget,
  WorldBookEntry,
  WorldBookTurnContext,
  WorldBookVersion,
} from "@/lib/types";
import { retrieveWorldBookContext, WORLD_BOOK_BUDGETS } from "@/lib/world-book";
import { WorldBookTagInput } from "./world-book-tag-input";

export function WorldBookRetrievalTester({
  book,
  entries,
}: {
  book: WorldBook;
  entries: WorldBookEntry[];
}) {
  const [open, setOpen] = useState(false);
  const [userInput, setUserInput] = useState("");
  const [recentNarrative, setRecentNarrative] = useState("");
  const [currentLocation, setCurrentLocation] = useState("");
  const [currentPeriod, setCurrentPeriod] = useState("");
  const [people, setPeople] = useState<string[]>([]);
  const [tasks, setTasks] = useState<string[]>([]);
  const [factions, setFactions] = useState<string[]>([]);
  const [items, setItems] = useState<string[]>([]);
  const [budgetMode, setBudgetMode] = useState<
    "compact" | "balanced" | "detailed"
  >("balanced");
  const [result, setResult] = useState<WorldBookTurnContext>();
  const [skipQuery, setSkipQuery] = useState("");
  const version = useMemo<WorldBookVersion>(
    () => ({
      id: `${book.id}:draft-preview`,
      worldBookId: book.id,
      versionNumber: book.versionNumber,
      createdAt: new Date().toISOString(),
      snapshot: { coreSummary: book.coreSummary, entries },
    }),
    [book, entries],
  );
  const run = () => {
    const budget: WorldBookContextBudget = WORLD_BOOK_BUDGETS[budgetMode];
    setResult(
      retrieveWorldBookContext(
        book,
        version,
        {
          userInput,
          recentNarrative,
          currentLocation,
          currentPeriod,
          activeNpcIds: [],
          activeNpcNames: people,
          activeFactionIds: factions,
          activeTaskIds: [],
          activeTaskText: tasks,
          activeItemIds: [],
          activeItemNames: items,
        },
        budget,
      ),
    );
  };
  const preview = result?.preview;
  const skipped =
    preview?.skipped.filter(
      (item) =>
        !skipQuery.trim() ||
        item.title.toLowerCase().includes(skipQuery.trim().toLowerCase()),
    ) || [];
  return (
    <section className="panel mb-4 overflow-hidden">
      <button
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span>
          <b>测试资料卡调用</b>
          <span className="muted ml-2 text-xs">使用游戏实际检索规则</span>
        </span>
        <span className="tag">{open ? "收起" : "打开测试"}</span>
      </button>
      {open ? (
        <div className="border-t hairline p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <label className="field">
              <span className="label">玩家当前输入</span>
              <textarea
                className="input textarea"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="例如：向伊莱娜询问火元素魔法。"
              />
            </label>
            <label className="field">
              <span className="label">最近剧情</span>
              <textarea
                className="input textarea"
                value={recentNarrative}
                onChange={(e) => setRecentNarrative(e.target.value)}
                placeholder="可留空；填写最近发生的关键情节。"
              />
            </label>
            <label className="field">
              <span className="label">当前地点</span>
              <input
                className="input"
                value={currentLocation}
                onChange={(e) => setCurrentLocation(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="label">当前时间／时代</span>
              <input
                className="input"
                value={currentPeriod}
                onChange={(e) => setCurrentPeriod(e.target.value)}
              />
            </label>
            <WorldBookTagInput
              label="当前出场人物"
              value={people}
              onChange={setPeople}
              placeholder="伊莱娜，巴雷特"
            />
            <WorldBookTagInput
              label="当前任务"
              value={tasks}
              onChange={setTasks}
              placeholder="学习火球术"
            />
            <WorldBookTagInput
              label="当前势力"
              value={factions}
              onChange={setFactions}
              placeholder="银月议会"
            />
            <WorldBookTagInput
              label="当前物品或能力"
              value={items}
              onChange={setItems}
              placeholder="法杖，火元素感应"
            />
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="field min-w-48">
              <span className="label">Token 预算</span>
              <select
                className="input"
                value={budgetMode}
                onChange={(e) =>
                  setBudgetMode(e.target.value as typeof budgetMode)
                }
              >
                <option value="compact">节省</option>
                <option value="balanced">平衡</option>
                <option value="detailed">详细</option>
              </select>
            </label>
            <button className="btn btn-gold" onClick={run}>
              <SearchCheck size={15} />
              开始测试
            </button>
          </div>
          {preview ? (
            <div className="mt-5 space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border hairline p-3">
                  <small className="muted">本次加载</small>
                  <b className="mt-1 block">{preview.selected.length} 张</b>
                </div>
                <div className="rounded-lg border hairline p-3">
                  <small className="muted">世界书预计占用</small>
                  <b className="mt-1 block">{preview.injectedTokens} Token</b>
                </div>
                <p className="muted rounded-lg border hairline p-3 text-xs leading-5">
                  此处只估算本次注入的世界书文本，不包含系统提示词、项目与游戏状态、最近剧情、玩家输入和模型输出，因此不等于整次
                  API 请求或最终费用。实际计费以模型服务商返回的 usage
                  数据为准。
                </p>
                <div className="rounded-lg border hairline p-3">
                  <small className="muted">整本发送</small>
                  <b className="mt-1 block">{preview.fullBookTokens} Token</b>
                </div>
                <div className="rounded-lg border hairline p-3">
                  <small className="muted">预计节省</small>
                  <b className="mt-1 block">
                    {preview.estimatedSavingsPercent}%
                  </b>
                </div>
              </div>
              <div>
                <h3 className="display text-xl">会加载的资料卡</h3>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {preview.selected.map((item) => (
                    <article
                      key={item.entryId}
                      className="rounded-lg border hairline bg-[var(--panel2)] p-3"
                    >
                      <div className="flex justify-between gap-2">
                        <b>{item.title}</b>
                        <span className="tag">
                          {item.injection === "full" ? "详细设定" : "简短说明"}
                        </span>
                      </div>
                      <p className="muted mt-2 text-xs">
                        匹配分 {item.score} · 约 {item.estimatedTokens} Token
                      </p>
                      <ul className="mt-2 list-disc pl-5 text-xs">
                        {item.reasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                    </article>
                  ))}
                </div>
                {!preview.selected.length ? (
                  <p className="muted mt-2 text-sm">
                    当前条件没有命中任何资料卡。
                  </p>
                ) : null}
              </div>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="display text-xl">为什么没有调用？</h3>
                  <input
                    className="input max-w-64"
                    value={skipQuery}
                    onChange={(e) => setSkipQuery(e.target.value)}
                    placeholder="搜索未命中的资料卡"
                  />
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {skipped.map((item) => (
                    <article
                      key={item.entryId}
                      className="rounded-lg border hairline p-3"
                    >
                      <b>{item.title}</b>
                      <p className="muted mt-1 text-xs">
                        {item.reason}
                        {typeof item.score === "number"
                          ? ` · 匹配分 ${item.score}`
                          : ""}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
