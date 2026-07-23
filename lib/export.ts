"use client";
import type { GameProject, GameSave } from "./types";
import { db, uid } from "./db";
import {
  getStoryLengthPreset,
  lengthPlanningInstruction,
  storyLengthMeta,
} from "./story-length";
const names: Record<string, string> = {
  projectInfo: "游戏总览",
  world: "世界观",
  player: "主角",
  characters: "NPC",
  gameSystem: "数值与游戏规则",
  story: "剧情结构",
  prompts: "系统提示词",
  openingScene: "开场剧情",
};
function pretty(v: unknown, indent = 0): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v))
    return v
      .map((x, i) => `${"  ".repeat(indent)}${i + 1}. ${pretty(x, indent + 1)}`)
      .join("\n");
  if (v && typeof v === "object")
    return Object.entries(v)
      .map(
        ([k, x]) =>
          `${"  ".repeat(indent)}${k}：${typeof x === "object" ? "\n" : ""}${pretty(x, indent + 1)}`,
      )
      .join("\n");
  return "";
}
export function projectText(p: GameProject) {
  const version = p.settingsVersionNumber || 1;
  const length = getStoryLengthPreset(p.projectInfo.gameLength);
  const meta = storyLengthMeta(length.id);
  return `设定版本：${version}\n更新时间：${new Date(p.updatedAt).toLocaleString()}\n游戏篇幅：${length.label}\n目标回合：${meta.turnRange}\n预计游玩时间：${meta.estimatedTime}\n建议章节：${meta.chapters}\n${Object.entries(
    names,
  )
    .map(
      ([k, n]) =>
        `\n${"═".repeat(20)}\n${n}\n${"═".repeat(20)}\n${pretty(p[k as keyof GameProject])}`,
    )
    .join("\n")}`;
}
function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function printHtmlPdf(content: string, name: string) {
  const frame = document.createElement("iframe");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none";
  frame.setAttribute("aria-hidden", "true");
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc) {
    frame.remove();
    throw new Error("无法创建 PDF 打印页面");
  }
  doc.open();
  doc.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(name)}</title><style>
    @page { size: A4; margin: 21mm 16mm 19mm; }
    html, body { margin: 0; color: #191919; background: #fff; }
    body { font: 10.5pt/1.75 "Microsoft YaHei", "Noto Sans SC", sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    * { box-sizing: border-box; }
    .cover { min-height: 245mm; display: flex; flex-direction: column; justify-content: center; page-break-after: always; }
    .cover-mark { color: #9a7a42; font-size: 11pt; letter-spacing: .28em; }
    .cover h1 { margin: 16px 0 4px; color: #8a6a34; font: 32pt/1.25 "Noto Serif SC", "Songti SC", serif; }
    .cover .subtitle { color: #777; font-size: 12pt; }
    .cover .rule { width: 62%; height: 1px; margin: 34px 0 20px; background: #b08b4f; }
    .cover .meta { color: #666; line-height: 2; }
    .section-title { margin: 26px 0 18px; padding-bottom: 8px; border-bottom: 1px solid #b08b4f; color: #8a6a34; font: 21pt/1.3 "Noto Serif SC", "Songti SC", serif; page-break-after: avoid; }
    h3 { margin: 22px 0 9px; color: #2c2924; font-size: 13pt; page-break-after: avoid; }
    p { margin: 5px 0 10px; }
    table { width: 100%; margin: 8px 0 18px; border-collapse: collapse; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { padding: 7px 9px; border: 1px solid #d8c39e; text-align: left; vertical-align: top; }
    th { background: #b08b4f; color: white; font-weight: 500; }
    td:first-child { width: 24%; color: #5f5038; }
    ul, ol { margin: 6px 0 16px; padding-left: 1.55em; }
    li { margin: 4px 0; }
    .callout { margin: 10px 0 18px; padding: 12px 15px; border-left: 3px solid #b08b4f; background: #f5f0e7; }
    .chapter { margin: 12px 0 16px; padding: 12px 15px; border: 1px solid #ddcfb7; background: #fbf9f5; break-inside: avoid; }
    .chapter strong { color: #8a6a34; }
    .character, .character table { break-inside: avoid; page-break-inside: avoid; }
    .muted { color: #777; }
  </style></head><body>${content}</body></html>`);
  doc.close();

  const cleanup = () => setTimeout(() => frame.remove(), 500);
  frame.contentWindow?.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
  }, 100);
  setTimeout(() => frame.isConnected && frame.remove(), 120000);
}
async function record(p: GameProject, format: string) {
  await db.exports.put({
    id: uid("export"),
    projectId: p.id,
    format,
    createdAt: new Date().toISOString(),
  });
}
export async function exportTxt(p: GameProject) {
  download(
    new Blob([projectText(p)], { type: "text/plain;charset=utf-8" }),
    `${p.projectInfo.title}.txt`,
  );
  await record(p, "txt");
}
export async function exportJson(p: GameProject) {
  download(
    new Blob([JSON.stringify(p, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    `${p.projectInfo.title}.json`,
  );
  await record(p, "json");
}
export async function exportCurrentGame(p: GameProject, s: GameSave) {
  const bundle = {
    format: "narrative-ark-game",
    version: 2,
    exportedAt: new Date().toISOString(),
    project: p,
    save: s,
  };
  download(
    new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json;charset=utf-8",
    }),
    `${p.projectInfo.title}-第${s.turn}回合-游戏包.json`,
  );
  await record(p, "game-bundle");
}
export async function exportAiPlayPackage(p: GameProject) {
  const e = (value: unknown) =>
    escapeHtml(String(value === undefined || value === "" ? "未设定" : value));
  const rows = (items: [string, unknown][]) =>
    `<table><tbody>${items
      .map(
        ([label, value]) => `<tr><td>${e(label)}</td><td>${e(value)}</td></tr>`,
      )
      .join("")}</tbody></table>`;
  const length = getStoryLengthPreset(p.projectInfo.gameLength);
  const lengthMeta = storyLengthMeta(length.id);
  const lengthRules = lengthPlanningInstruction(length.id);
  const freedomLabel = {
    linear: "强主线",
    hybrid: "主线 + 自由探索",
    open: "开放世界",
  }[p.projectInfo.freedomMode];

  const html = `
    <section class="cover">
      <div class="cover-mark">NARRATIVE ARK · AI GAME BOOK</div>
      <h1>${e(p.projectInfo.title)}</h1>
      <div class="subtitle">AI 文字冒险 · 完整主题与剧情大纲</div>
      <div class="rule"></div>
      <div class="meta">
        ${e(p.projectInfo.genre)} · ${e(p.projectInfo.tone)}<br>
        设定版本 ${e(p.settingsVersionNumber || 1)} · 更新于 ${e(new Date(p.updatedAt).toLocaleString())}<br>
        ${p.story.chapters.length} 个章节 · ${p.characters.length} 位主要角色 · ${p.story.endings.length} 个结局<br>
        本包体不含任何玩家存档与已游玩回合
      </div>
    </section>

    <h2 class="section-title">一、游戏概述</h2>
    ${rows([
      ["名称", p.projectInfo.title],
      ["题材", p.projectInfo.genre],
      ["整体风格", p.projectInfo.tone],
      ["核心主题", p.projectInfo.description],
      ["剧情自由度", freedomLabel],
      ["游戏篇幅", length.label],
      ["目标回合", lengthMeta.turnRange],
      ["预计游玩时间", lengthMeta.estimatedTime],
      ["建议章节", lengthMeta.chapters],
      ["主线目标", p.story.mainGoal],
      ["开场事件", p.story.openingEvent],
    ])}

    <h2 class="section-title">二、世界观设定</h2>
    <h3>2.1 世界背景</h3><p>${e(p.world.background)}</p>
    <h3>2.2 历史与地理</h3>${rows([
      ["历史", p.world.history],
      ["地理", p.world.geography],
      ["当前危机", p.world.currentCrisis],
      ["力量体系", p.world.powerSystem],
    ])}
    <h3>2.3 关键地点</h3>
    <table><thead><tr><th>地点</th><th>描述</th><th>连接</th></tr></thead><tbody>
      ${p.world.locations
        .map(
          (location) =>
            `<tr><td>${e(location.name)}</td><td>${e(location.description)}</td><td>${e(location.connections.join("、") || "无")}</td></tr>`,
        )
        .join("")}
    </tbody></table>
    <h3>2.4 阵营与社会</h3>
    <table><thead><tr><th>阵营</th><th>描述</th><th>目标</th></tr></thead><tbody>
      ${p.world.factions
        .map(
          (faction) =>
            `<tr><td>${e(faction.name)}</td><td>${e(faction.description)}</td><td>${e(faction.goal)}</td></tr>`,
        )
        .join("")}
    </tbody></table>
    ${rows([
      ["种族", p.world.races.join("、") || "暂无"],
      ["信仰", p.world.religions.join("、") || "暂无"],
      ["社会规则", p.world.socialRules.join("；") || "暂无"],
      ["隐藏秘密", p.world.secrets.join("；") || "暂无"],
    ])}

    <h2 class="section-title">三、角色设定</h2>
    <h3>3.1 主角 · ${e(p.player.name)}</h3>
    ${rows([
      [
        "身份",
        `${p.player.age || "年龄未定"} · ${p.player.gender || "性别未定"} · ${p.player.race || "种族未定"} · ${p.player.identity}`,
      ],
      ["外观", p.player.appearance],
      ["性格", p.player.personality],
      ["背景", p.player.background],
      ["目标", p.player.goals.join("；") || "未设定"],
      ["弱点", p.player.weaknesses.join("；") || "暂无"],
      [
        "初始属性",
        Object.entries(p.player.attributes)
          .map(([key, value]) => `${key} ${value}`)
          .join(" / ") || "暂无",
      ],
      [
        "特殊能力",
        [...p.player.talents, ...p.player.skills]
          .map((ability) => `${ability.name}：${ability.description}`)
          .join("；") || "暂无",
      ],
    ])}
    <h3>3.2 主要配角</h3>
    ${p.characters
      .map(
        (character) => `<div class="character">
          <h3>${e(character.name)} · ${e(character.identity)}</h3>
          ${rows([
            [
              "年龄/种族",
              `${character.age || "未定"} / ${character.race || "未定"}`,
            ],
            ["外观", character.appearance],
            ["性格", character.personality],
            ["背景", character.background],
            ["与主角关系", character.relationship],
            ["个人目标", character.goal],
            [
              "特殊能力",
              character.abilities
                .map((ability) => `${ability.name}：${ability.description}`)
                .join("；") || "暂无",
            ],
            ["秘密", character.secret],
            ["说话方式", character.speechStyle],
          ])}
        </div>`,
      )
      .join("")}

    <h2 class="section-title">四、游戏系统与规则</h2>
    <h3>4.1 属性系统</h3>
    <table><thead><tr><th>属性</th><th>初始值</th><th>上限</th><th>显示</th></tr></thead><tbody>
      ${p.gameSystem.attributes
        .map(
          (attribute) =>
            `<tr><td>${e(attribute.name)}</td><td>${e(attribute.initial)}</td><td>${e(attribute.max)}</td><td>${e(attribute.display === "bar" ? "进度条" : "数字")}</td></tr>`,
        )
        .join("")}
    </tbody></table>
    ${rows([
      ["等级系统", p.gameSystem.levelSystem],
      ["战斗规则", p.gameSystem.combatRules],
      ["任务规则", p.gameSystem.taskRules],
      ["关系规则", p.gameSystem.relationshipRules],
      ["死亡规则", p.gameSystem.deathRules],
      ["难度规则", p.gameSystem.difficultyRules],
      ["随机判定", p.gameSystem.randomCheckRules],
    ])}

    <h2 class="section-title">五、完整剧情大纲</h2>
    <div class="callout"><strong>主线目标：</strong>${e(p.story.mainGoal)}<br><strong>开场事件：</strong>${e(p.story.openingEvent)}</div>
    ${p.story.chapters
      .map(
        (chapter, index) => `<div class="chapter">
          <strong>第 ${index + 1} 章 · ${e(chapter.title)}</strong>
          <p>${e(chapter.summary)}</p>
          <div><strong>章节目标：</strong>${e(chapter.goals.join("；") || "未设定")}</div>
          <div><strong>核心冲突：</strong>${e(chapter.mainConflict || "未设定")}</div>
          <div><strong>重要角色：</strong>${e(chapter.importantCharacters?.join("、") || "未设定")}</div>
          <div><strong>预计回合：</strong>${e(chapter.estimatedTurnRange ? `${chapter.estimatedTurnRange.min}～${chapter.estimatedTurnRange.max}` : "动态调整")}</div>
        </div>`,
      )
      .join("")}
    <h3>5.1 支线任务</h3>
    ${
      p.story.sideQuests.length
        ? `<table><thead><tr><th>任务</th><th>内容</th><th>目标</th></tr></thead><tbody>${p.story.sideQuests
            .map(
              (quest) =>
                `<tr><td>${e(quest.title)}</td><td>${e(quest.description)}</td><td>${e(quest.objectives.join("；"))}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : '<p class="muted">暂无预设支线，由主持 AI 根据世界状态动态生成。</p>'
    }
    <h3>5.2 随机事件</h3>
    ${
      p.story.randomEvents.length
        ? `<table><thead><tr><th>事件</th><th>触发条件</th><th>内容</th></tr></thead><tbody>${p.story.randomEvents
            .map(
              (event) =>
                `<tr><td>${e(event.title)}</td><td>${e(event.trigger)}</td><td>${e(event.description)}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : '<p class="muted">暂无预设随机事件。</p>'
    }

    <h2 class="section-title">六、结局条件</h2>
    ${
      p.story.endings.length
        ? `<table><thead><tr><th>结局</th><th>达成条件</th><th>结局说明</th></tr></thead><tbody>${p.story.endings
            .map(
              (ending) =>
                `<tr><td>${e(ending.title)}</td><td>${e(ending.conditions.join("；"))}</td><td>${e(ending.description)}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : '<p class="muted">采用开放式结局，由玩家选择和世界状态共同决定。</p>'
    }

    <h2 class="section-title">七、AI 游戏主持人指令</h2>
    <ol>
      <li>你是本游戏的主持人、旁白和所有 NPC 的扮演者。玩家第一次输入“开始”时，从第 0 回合创建全新游戏，不得假设存在任何历史进度。</li>
      <li>严格遵守本包体中的世界、角色、能力、任务、大纲和结局条件；允许玩家改变通往目标的路径，但不能无理由跳过关键因果。</li>
      <li>不得替玩家决定行动或描述玩家未表达的心理。NPC 拥有独立目标、记忆和态度，世界随时间与行为持续变化。</li>
      <li>每回合输出 600～900 个中文字，分为 7～11 个短段。每段（包括独立对白段）首行缩进两个全角字符“　　”。</li>
      <li>使用中文弯引号“”书写对白，不在尚未闭合的引号中换段。场景、说话者或行动焦点改变时另起一段。</li>
      <li>每回合必须有实质推进，不能用重复环境描写凑字数；结尾提供 3～5 个差异明确的选项，同时接受玩家自由行动。</li>
      <li>根据游戏篇幅控制节奏，不提前揭晓核心秘密，不仓促进入结局。重要行动依据属性、环境、关系和难度进行合理判定。</li>
      <li>${e(lengthRules)} 回合范围只是节奏参考，不得到点强制结束，也不得为了凑回合重复内容。</li>
      <li>普通任务完成、离开地点、结束一天或完成章节不代表整个游戏结束。只有主要矛盾与关键关系得到合理结果、玩家明确要求结束，或不可继续的死亡规则触发时，才可进入完整结局。</li>
      <li>只输出自然可读的剧情、必要判定和选项，不输出 JSON，不复述本包体，不解释主持规则。</li>
      <li>玩家输入“存档”时，输出一份可复制的简洁存档，记录回合、地点、时间、属性、物品、任务、关系、关键选择和剧情摘要；输入“读档”并粘贴存档后恢复游戏。</li>
    </ol>
    <div class="callout"><strong>开场方式：</strong>等待玩家输入“开始”。随后根据“开场事件”生成第 0 回合，不直接照抄大纲，在结尾提供行动选项。</div>
  `;

  printHtmlPdf(html, `${p.projectInfo.title}-AI文游包体`);
  await record(p, "ai-play-package-pdf");
}
export async function exportDocx(p: GameProject) {
  const { Document, Packer, Paragraph, HeadingLevel, PageBreak } =
    await import("docx");
  const length = getStoryLengthPreset(p.projectInfo.gameLength);
  const lengthMeta = storyLengthMeta(length.id);
  const children = [
    new Paragraph({ text: p.projectInfo.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: p.projectInfo.description }),
    new Paragraph({
      text: `设定版本 ${p.settingsVersionNumber || 1} · ${new Date(p.updatedAt).toLocaleString()}`,
    }),
    new Paragraph({
      text: `游戏篇幅：${length.label} · ${lengthMeta.turnRange} · ${lengthMeta.estimatedTime} · ${lengthMeta.chapters}`,
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
  for (const [k, n] of Object.entries(names)) {
    children.push(new Paragraph({ text: n, heading: HeadingLevel.HEADING_1 }));
    for (const line of pretty(p[k as keyof GameProject]).split("\n"))
      children.push(new Paragraph({ text: line }));
  }
  download(
    await Packer.toBlob(new Document({ sections: [{ children }] })),
    `${p.projectInfo.title}.docx`,
  );
  await record(p, "docx");
}
export async function exportPdf(p: GameProject) {
  const html2canvas = (await import("html2canvas")).default;
  const { jsPDF } = await import("jspdf");
  const el = document.createElement("div");
  const length = getStoryLengthPreset(p.projectInfo.gameLength);
  const lengthMeta = storyLengthMeta(length.id);
  el.style.cssText =
    "position:fixed;left:-10000px;top:0;width:794px;padding:64px;background:white;color:#171717;font-family:'Microsoft YaHei',sans-serif;white-space:pre-wrap;line-height:1.75;font-size:13px";
  el.innerHTML = `<h1 style="font-size:32px;margin-bottom:8px">${escapeHtml(p.projectInfo.title)}</h1><p>${escapeHtml(p.projectInfo.description)}</p><p style="color:#777">设定版本 ${p.settingsVersionNumber || 1} · ${escapeHtml(new Date(p.updatedAt).toLocaleString())}</p><p style="color:#777">游戏篇幅：${escapeHtml(length.label)} · ${escapeHtml(lengthMeta.turnRange)} · ${escapeHtml(lengthMeta.estimatedTime)} · ${escapeHtml(lengthMeta.chapters)}</p><hr style="margin:30px 0">${Object.entries(
    names,
  )
    .map(
      ([k, n]) =>
        `<h2 style="font-size:22px;margin-top:30px">${n}</h2><div>${escapeHtml(pretty(p[k as keyof GameProject]))}</div>`,
    )
    .join("")}`;
  document.body.appendChild(el);
  const canvas = await html2canvas(el, {
    scale: 1.5,
    backgroundColor: "#ffffff",
  });
  el.remove();
  const pdf = new jsPDF("p", "mm", "a4");
  const pageH = 297,
    imgW = 190,
    imgH = (canvas.height * imgW) / canvas.width;
  const img = canvas.toDataURL("image/jpeg", 0.92);
  let y = 10;
  pdf.addImage(img, "JPEG", 10, y, imgW, imgH);
  let remain = imgH - (pageH - 20);
  while (remain > 0) {
    pdf.addPage();
    y = 10 - (imgH - remain);
    pdf.addImage(img, "JPEG", 10, y, imgW, imgH);
    remain -= pageH - 20;
  }
  pdf.save(`${p.projectInfo.title}.pdf`);
  await record(p, "pdf");
}
function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function exportLog(p: GameProject, s: GameSave) {
  const text =
    `${p.projectInfo.title} · ${s.name}\n\n` +
    s.recentMessages.map((m) => `[${m.role}] ${m.content}`).join("\n\n");
  download(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
    `${p.projectInfo.title}-游戏记录.txt`,
  );
}
