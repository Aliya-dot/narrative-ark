"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Info,
  PlugZap,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { getProviderPreset, PROVIDERS } from "@/lib/providers";
import { parseCustomHeaders, validateApiBaseUrl } from "@/lib/ai-config";
import { db } from "@/lib/db";
import type { AIConfig } from "@/lib/types";
import { testConnection } from "@/lib/ai-client";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common";

type StylePreset = "stable" | "balanced" | "creative" | "custom";
type ConnectionResult = {
  provider: string;
  model: string;
  latencyMs: number;
};

const defaultProvider = getProviderPreset("deepseek");
const defaults: AIConfig = {
  id: "active",
  provider: defaultProvider.id,
  apiKey: "",
  baseUrl: defaultProvider.baseUrl,
  model: defaultProvider.model,
  maxTokens: defaultProvider.parameters.maxTokens.defaultValue,
  temperature: defaultProvider.parameters.temperature.defaultValue,
  topP: defaultProvider.parameters.topP.defaultValue,
  timeout: defaultProvider.parameters.timeout,
  headers: {},
  parameterSupport: {
    temperature: defaultProvider.parameters.temperature.supported,
    topP: defaultProvider.parameters.topP.supported,
    maxTokens: defaultProvider.parameters.maxTokens.supported,
  },
  active: true,
  updatedAt: "",
};

function HelpButton({
  id,
  label,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <span className="relative inline-flex" data-help-root>
      <button
        type="button"
        className="muted rounded-full p-1 transition hover:bg-[var(--panel2)] hover:text-[var(--paper)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
        aria-label={`查看${label}说明`}
        aria-expanded={open}
        aria-controls={`${id}-help`}
        onClick={onToggle}
      >
        <Info size={14} />
      </button>
      {open && (
        <span
          id={`${id}-help`}
          role="tooltip"
          className="fixed inset-x-4 top-1/2 z-[90] -translate-y-1/2 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-left text-sm font-normal leading-6 tracking-normal text-[var(--paper)] shadow-2xl md:absolute md:inset-auto md:right-0 md:top-full md:mt-2 md:w-80 md:translate-y-0"
        >
          {children}
        </span>
      )}
    </span>
  );
}

function FieldTitle({
  id,
  title,
  help,
  openHelp,
  setOpenHelp,
}: {
  id: string;
  title: string;
  help: React.ReactNode;
  openHelp?: string;
  setOpenHelp: (id?: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <label htmlFor={id}>{title}</label>
      <HelpButton
        id={id}
        label={title}
        open={openHelp === id}
        onToggle={() => setOpenHelp(openHelp === id ? undefined : id)}
      >
        {help}
      </HelpButton>
    </div>
  );
}

function temperatureDescription(value: number) {
  if (value <= 0.45) return "稳定、保守";
  if (value < 0.9) return "平衡，适合普通文游";
  if (value < 1.35) return "自由、富有变化";
  return "变化很大，可能偏离设定";
}

function topPDescription(value: number) {
  if (value < 0.45) return "表达集中，可能重复";
  if (value < 0.8) return "较稳定";
  if (value < 0.98) return "表达丰富";
  return "基本不主动限制候选范围";
}

export default function Settings() {
  const [form, setForm] = useState(defaults);
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [headers, setHeaders] = useState("{}");
  const [stylePreset, setStylePreset] = useState<StylePreset>("balanced");
  const [openHelp, setOpenHelp] = useState<string>();
  const [connection, setConnection] = useState<ConnectionResult>();

  const selectedProvider = getProviderPreset(form.provider);
  const parameters = selectedProvider.parameters;
  const support = form.parameterSupport ?? {
    temperature: parameters.temperature.supported,
    topP: parameters.topP.supported,
    maxTokens: parameters.maxTokens.supported,
  };

  const headersError = useMemo(() => {
    try {
      parseCustomHeaders(headers);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "请求头格式错误";
    }
  }, [headers]);

  const baseUrlError = useMemo(() => {
    if (!form.baseUrl.trim()) return "";
    try {
      validateApiBaseUrl(form.baseUrl);
      return "";
    } catch (error) {
      return error instanceof Error ? error.message : "API 地址格式错误";
    }
  }, [form.baseUrl]);

  const samplingWarning =
    Math.abs(form.temperature - parameters.temperature.defaultValue) >= 0.35 &&
    Math.abs(form.topP - parameters.topP.defaultValue) >= 0.15;

  useEffect(() => {
    db.configs.get("active").then((value) => {
      if (!value) return;
      const preset = getProviderPreset(value.provider);
      setForm({
        ...defaults,
        ...value,
        parameterSupport: value.parameterSupport ?? {
          temperature: preset.parameters.temperature.supported,
          topP: preset.parameters.topP.supported,
          maxTokens: preset.parameters.maxTokens.supported,
        },
      });
      setHeaders(JSON.stringify(value.headers || {}, null, 2));
      setStylePreset("custom");
    });
  }, []);

  useEffect(() => {
    function closeHelp(event: PointerEvent) {
      if (!(event.target as HTMLElement).closest("[data-help-root]")) {
        setOpenHelp(undefined);
      }
    }
    function escapeHelp(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenHelp(undefined);
    }
    document.addEventListener("pointerdown", closeHelp);
    document.addEventListener("keydown", escapeHelp);
    return () => {
      document.removeEventListener("pointerdown", closeHelp);
      document.removeEventListener("keydown", escapeHelp);
    };
  }, []);

  function change<K extends keyof AIConfig>(key: K, value: AIConfig[K]) {
    setConnection(undefined);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectProvider(id: string) {
    const preset = getProviderPreset(id);
    setConnection(undefined);
    setStylePreset("balanced");
    setForm((current) => ({
      ...current,
      provider: id,
      baseUrl: preset.baseUrl,
      model: preset.model,
      parameterSupport: {
        temperature: preset.parameters.temperature.supported,
        topP: preset.parameters.topP.supported,
        maxTokens: preset.parameters.maxTokens.supported,
      },
    }));
  }

  function applyStyle(preset: Exclude<StylePreset, "custom">) {
    const temperature =
      preset === "stable"
        ? Math.max(parameters.temperature.min, 0.45)
        : preset === "creative"
          ? Math.min(parameters.temperature.max, 1.05)
          : parameters.temperature.defaultValue;
    setStylePreset(preset);
    setConnection(undefined);
    setForm((current) => ({
      ...current,
      temperature,
      topP: parameters.topP.defaultValue,
    }));
  }

  function restoreRecommended() {
    setForm((current) => ({
      ...current,
      maxTokens: parameters.maxTokens.defaultValue,
      timeout: parameters.timeout,
      temperature: parameters.temperature.defaultValue,
      topP: parameters.topP.defaultValue,
    }));
    setStylePreset("balanced");
    setConnection(undefined);
    toast.success("已恢复推荐参数，API Key、地址和模型未改变");
  }

  function currentConfig() {
    if (!form.apiKey.trim()) throw new Error("请输入 API Key");
    validateApiBaseUrl(form.baseUrl);
    if (!form.model.trim()) throw new Error("请输入模型名称");
    return { ...form, headers: parseCustomHeaders(headers) };
  }

  async function save() {
    try {
      const next = {
        ...currentConfig(),
        updatedAt: new Date().toISOString(),
        active: true,
      };
      await db.configs.put(next);
      setForm(next);
      toast.success("API 配置已保存在当前浏览器");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function test() {
    setTesting(true);
    setConnection(undefined);
    let attemptedConfig: AIConfig | undefined;
    try {
      attemptedConfig = currentConfig();
      const result = await testConnection(attemptedConfig);
      setConnection(result);
      const verified = {
        ...attemptedConfig,
        active: true,
        updatedAt: new Date().toISOString(),
        connectionVerifiedAt: new Date().toISOString(),
        connectionFailedAt: undefined,
      };
      await db.configs.put(verified);
      setForm(verified);
      toast.success("连接成功");
    } catch (error) {
      if (attemptedConfig) {
        const failed = {
          ...attemptedConfig,
          updatedAt: new Date().toISOString(),
          connectionVerifiedAt: undefined,
          connectionFailedAt: new Date().toISOString(),
        };
        await db.configs.put(failed);
        setForm(failed);
      }
      toast.error(error instanceof Error ? error.message : "连接失败");
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="container py-10 md:py-12">
      <div className="mx-auto max-w-4xl">
        <p className="mono gold text-xs">MODEL CONNECTION</p>
        <h1 className="display mt-3 text-4xl">API 设置</h1>
        <p className="muted mt-3 max-w-3xl leading-7">
          连接你自己的模型服务。普通用户只需填写服务商、模型和 API
          Key，其余参数可保持推荐值。
        </p>

        <div className="panel mt-8 p-5 md:p-8">
          <div className="mb-6 flex items-start gap-3 border-b border-[var(--line)] pb-5">
            <ShieldCheck className="gold mt-0.5 shrink-0" size={19} />
            <p className="muted text-sm leading-6">
              API Key 保存在当前浏览器的
              IndexedDB，不写入项目导出文件。调用模型时会临时发送到本站服务端代理，应用不会主动记录或输出密钥。
            </p>
          </div>

          <div className="grid gap-x-6 gap-y-5 md:grid-cols-2">
            <div className="field">
              <FieldTitle
                id="provider"
                title="服务商"
                openHelp={openHelp}
                setOpenHelp={setOpenHelp}
                help="选择 API 所属平台。不同平台的接口地址、模型 ID 和支持参数可能不同。"
              />
              <select
                id="provider"
                className="input"
                value={form.provider}
                onChange={(event) => selectProvider(event.target.value)}
              >
                {PROVIDERS.map((provider) => (
                  <option value={provider.id} key={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
              <p className="muted text-xs leading-5">
                {selectedProvider.description}
              </p>
            </div>

            <div className="field">
              <FieldTitle
                id="model"
                title="模型名称"
                openHelp={openHelp}
                setOpenHelp={setOpenHelp}
                help="填写服务商提供的准确模型 ID，不是模型的中文名称。第三方平台的模型 ID 可能与官方不同。"
              />
              <input
                id="model"
                className="input"
                value={form.model}
                onChange={(event) => change("model", event.target.value)}
                placeholder="服务商提供的模型 ID"
              />
              <p className="muted text-xs leading-5">
                {selectedProvider.modelHint}
              </p>
            </div>

            <div className="field md:col-span-2">
              <FieldTitle
                id="base-url"
                title="Base URL"
                openHelp={openHelp}
                setOpenHelp={setOpenHelp}
                help={
                  <>
                    必须包含
                    https://。不要填写聊天网页或控制台地址，也不要重复拼接完整聊天路径。当前公开代理禁止
                    HTTP、本机和内网地址。
                  </>
                }
              />
              <input
                id="base-url"
                className="input mono text-sm"
                value={form.baseUrl}
                onChange={(event) => change("baseUrl", event.target.value)}
                placeholder="https://api.example.com/v1"
                aria-invalid={Boolean(baseUrlError)}
              />
              <p
                className={`text-xs leading-5 ${baseUrlError ? "text-[var(--danger)]" : "muted"}`}
              >
                {baseUrlError ||
                  "模型 API 的基础地址；使用官方预设时通常不需要修改。"}
              </p>
            </div>

            <div className="field md:col-span-2">
              <FieldTitle
                id="api-key"
                title="API Key"
                openHelp={openHelp}
                setOpenHelp={setOpenHelp}
                help="使用模型服务商创建的 API Key，不是网站账号密码。不要把密钥放进截图、自定义请求头、分享链接或公开仓库。"
              />
              <div className="relative">
                <input
                  id="api-key"
                  className="input mono pr-12"
                  type={show ? "text" : "password"}
                  value={form.apiKey}
                  onChange={(event) => change("apiKey", event.target.value)}
                  autoComplete="off"
                  placeholder="sk-..."
                />
                <button
                  type="button"
                  className="muted absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 hover:bg-[var(--panel2)]"
                  onClick={() => setShow(!show)}
                  aria-label="显示或隐藏密钥"
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <p className="muted text-xs leading-5">
                密钥只保存在当前浏览器，测试和生成时才临时交给服务端代理。
              </p>
            </div>

            <div className="field">
              <FieldTitle
                id="max-tokens"
                title="最大输出 Token"
                openHelp={openHelp}
                setOpenHelp={setOpenHelp}
                help="这是单次请求允许生成的最大长度，不是整部文游长度。过低可能截断剧情；过高不代表模型一定会全部使用，并可能增加费用与等待时间。"
              />
              <input
                id="max-tokens"
                className="input"
                type="number"
                min={256}
                max={64000}
                disabled={!support.maxTokens}
                value={form.maxTokens}
                onChange={(event) => change("maxTokens", +event.target.value)}
              />
              <p className="muted text-xs leading-5">
                推荐 4096；2048 较短，8192 需要模型支持。
              </p>
            </div>

            <div className="field">
              <FieldTitle
                id="timeout"
                title="超时（秒）"
                openHelp={openHelp}
                setOpenHelp={setOpenHelp}
                help="等待模型响应的最长时间，不影响生成质量。网络较慢或生成长文本时可以提高；超过时间仍无响应会取消本次请求。"
              />
              <input
                id="timeout"
                className="input"
                type="number"
                min={5}
                max={300}
                value={form.timeout}
                onChange={(event) => change("timeout", +event.target.value)}
              />
              <p className="muted text-xs leading-5">
                普通模型推荐 60 秒，长文本可适当提高。
              </p>
            </div>

            <div className="md:col-span-2 mt-2 border-t border-[var(--line)] pt-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="label">生成风格预设</p>
                  <p className="muted mt-1 text-xs">
                    主要调整温度，Top P 保持推荐值。
                  </p>
                </div>
                <button
                  type="button"
                  className="btn text-sm"
                  onClick={restoreRecommended}
                >
                  <RotateCcw size={14} />
                  恢复推荐值
                </button>
              </div>
              <div
                className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"
                role="group"
                aria-label="生成风格预设"
              >
                {(
                  [
                    ["stable", "稳定"],
                    ["balanced", "平衡"],
                    ["creative", "创意"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={`btn text-sm ${stylePreset === value ? "btn-gold" : ""}`}
                    onClick={() => applyStyle(value)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className={`btn text-sm ${stylePreset === "custom" ? "btn-gold" : ""}`}
                  onClick={() => setStylePreset("custom")}
                >
                  自定义
                </button>
              </div>
            </div>

            <div className="field">
              <FieldTitle
                id="temperature"
                title={`温度 · ${form.temperature.toFixed(2)}`}
                openHelp={openHelp}
                setOpenHelp={setOpenHelp}
                help="控制 AI 输出的随机性与创造性。低值更稳定，高值更有变化，但也更容易偏离人物和世界设定。"
              />
              <input
                id="temperature"
                type="range"
                min={parameters.temperature.min}
                max={parameters.temperature.max}
                step={parameters.temperature.step}
                disabled={!support.temperature}
                value={form.temperature}
                onChange={(event) => {
                  change("temperature", +event.target.value);
                  setStylePreset("custom");
                }}
              />
              <p className="muted text-xs leading-5">
                当前：{temperatureDescription(form.temperature)}
              </p>
            </div>

            <div className="field">
              <FieldTitle
                id="top-p"
                title={`Top P · ${form.topP.toFixed(2)}`}
                openHelp={openHelp}
                setOpenHelp={setOpenHelp}
                help="控制 AI 从多大范围的候选表达中选择。普通用户建议保持推荐值，主要调整温度。实际支持范围以模型服务商为准。"
              />
              <input
                id="top-p"
                type="range"
                min={parameters.topP.min}
                max={parameters.topP.max}
                step={parameters.topP.step}
                disabled={!support.topP}
                value={form.topP}
                onChange={(event) => {
                  change("topP", +event.target.value);
                  setStylePreset("custom");
                }}
              />
              <p className="muted text-xs leading-5">
                当前：{topPDescription(form.topP)}
              </p>
            </div>

            <div className="md:col-span-2">
              <div className="rounded-lg border border-[var(--line)] bg-[color-mix(in_srgb,var(--gold)_5%,var(--panel))] px-4 py-3 text-xs leading-5">
                <span className="muted">
                  建议主要调整温度，Top P
                  保持服务商推荐值。实际支持范围以模型服务商为准。
                </span>
                {samplingWarning && (
                  <p className="mt-2 flex items-start gap-2 text-[var(--gold)]">
                    <AlertTriangle className="mt-0.5 shrink-0" size={14} />
                    你同时大幅修改了温度和 Top P，实际生成效果可能更难预测。
                  </p>
                )}
              </div>
            </div>
          </div>

          <details className="mt-6 border-t border-[var(--line)] pt-5">
            <summary className="flex cursor-pointer list-none items-center justify-between rounded-lg py-2 focus-visible:outline-2 focus-visible:outline-[var(--gold)] [&::-webkit-details-marker]:hidden">
              <span>
                <span className="text-sm font-semibold">高级设置</span>
                <span className="muted ml-2 text-xs">普通用户请保持默认</span>
              </span>
              <ChevronDown className="muted" size={17} />
            </summary>
            <div className="mt-4 grid gap-5">
              {form.provider === "custom" && (
                <fieldset className="rounded-lg border border-[var(--line)] p-4">
                  <legend className="label px-1">自定义接口参数能力</legend>
                  <div className="mt-2 flex flex-wrap gap-x-6 gap-y-3 text-sm">
                    {(
                      [
                        ["temperature", "发送温度"],
                        ["topP", "发送 Top P"],
                        ["maxTokens", "发送最大 Token"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={support[key]}
                          onChange={(event) =>
                            change("parameterSupport", {
                              ...support,
                              [key]: event.target.checked,
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                  <p className="muted mt-3 text-xs leading-5">
                    仅在第三方文档明确说明不支持某参数时关闭；关闭后后端不会继续发送该字段。
                  </p>
                </fieldset>
              )}

              <div className="field">
                <FieldTitle
                  id="custom-headers"
                  title="自定义请求头（JSON）"
                  openHelp={openHelp}
                  setOpenHelp={setOpenHelp}
                  help='用于第三方兼容接口要求的额外 HTTP 请求头。官方 API 通常保持 {}。示例：{"X-App-Name":"Narrative Ark"}'
                />
                <textarea
                  id="custom-headers"
                  className="input textarea mono text-sm"
                  value={headers}
                  onChange={(event) => setHeaders(event.target.value)}
                  spellCheck={false}
                  aria-invalid={Boolean(headersError)}
                />
                <p
                  className={`text-xs leading-5 ${headersError ? "text-[var(--danger)]" : "muted"}`}
                >
                  {headersError ||
                    "官方 API 通常保持 {}。不要填写 API Key、Authorization、Cookie 或其他敏感凭据。"}
                </p>
              </div>
            </div>
          </details>

          {connection && (
            <div className="mt-6 flex items-start gap-3 rounded-lg border border-[color-mix(in_srgb,#4f7d63_45%,var(--line))] bg-[color-mix(in_srgb,#4f7d63_8%,var(--panel))] p-4 text-sm">
              <CheckCircle2
                className="mt-0.5 shrink-0 text-[#4f7d63]"
                size={18}
              />
              <div>
                <p className="font-semibold">连接成功</p>
                <p className="muted mt-1 text-xs leading-5">
                  {selectedProvider.name} · {connection.model} · 响应约{" "}
                  {connection.latencyMs} 毫秒
                </p>
              </div>
            </div>
          )}

          <div className="mt-7 flex flex-wrap gap-2">
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={Boolean(headersError || baseUrlError)}
            >
              <Save size={16} />
              保存配置
            </button>
            <button
              className="btn"
              onClick={test}
              disabled={
                testing || !form.apiKey || Boolean(headersError || baseUrlError)
              }
            >
              <PlugZap size={16} />
              {testing ? "正在测试…" : "测试连接"}
            </button>
            <button
              className="btn btn-danger ml-auto"
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={16} />
              删除配置
            </button>
          </div>
        </div>

        <div className="gold mt-5 rounded-lg border border-[color-mix(in_srgb,var(--gold)_45%,var(--line))] bg-[color-mix(in_srgb,var(--gold)_8%,var(--panel))] p-4 text-sm leading-6">
          当前使用模型：{form.model || "尚未设置"}
          。共享设备和恶意浏览器脚本仍可能读取本地数据，请勿在不可信设备保存密钥。
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        title="删除 API 配置？"
        description="本机保存的服务商、模型和 API Key 都会被移除。"
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          await db.configs.delete("active");
          setForm(defaults);
          setHeaders("{}");
          setStylePreset("balanced");
          setConnection(undefined);
          setConfirm(false);
          toast.success("API 配置已删除");
        }}
      />
    </section>
  );
}
