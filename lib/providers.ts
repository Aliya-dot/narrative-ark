export type ProviderParameterPreset = {
  temperature: {
    supported: boolean;
    min: number;
    max: number;
    step: number;
    defaultValue: number;
  };
  topP: {
    supported: boolean;
    min: number;
    max: number;
    step: number;
    defaultValue: number;
  };
  maxTokens: { supported: boolean; defaultValue: number };
  timeout: number;
};

const compatibleParameters: ProviderParameterPreset = {
  temperature: {
    supported: true,
    min: 0,
    max: 2,
    step: 0.05,
    defaultValue: 0.75,
  },
  topP: { supported: true, min: 0, max: 1, step: 0.05, defaultValue: 0.95 },
  maxTokens: { supported: true, defaultValue: 4096 },
  timeout: 60,
};

export type ProviderPreset = {
  id: string;
  name: string;
  baseUrl: string;
  model: string;
  description: string;
  modelHint: string;
  parameters: ProviderParameterPreset;
  requestBody?: {
    thinking?: { type: "enabled" | "disabled" };
  };
};

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    description: "使用 DeepSeek 官方兼容接口；默认采用更适合文游的非思考模式。",
    modelHint: "以 DeepSeek 开放平台当前列出的模型 ID 为准。",
    parameters: compatibleParameters,
    requestBody: { thinking: { type: "disabled" } },
  },
  {
    id: "siliconflow",
    name: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen3-8B",
    description: "使用硅基流动提供的 OpenAI 兼容接口。",
    modelHint: "模型 ID 通常包含组织名，例如 Qwen/Qwen3-8B。",
    parameters: compatibleParameters,
  },
  {
    id: "qwen",
    name: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    description: "使用阿里云百炼的 OpenAI 兼容接口。",
    modelHint: "请复制百炼控制台中显示的模型 ID。",
    parameters: compatibleParameters,
  },
  {
    id: "glm",
    name: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    description: "使用智谱开放平台的兼容接口。",
    modelHint: "请复制智谱开放平台中可调用的模型 ID。",
    parameters: compatibleParameters,
  },
  {
    id: "kimi",
    name: "月之暗面 Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    description: "使用月之暗面开放平台的兼容接口。",
    modelHint: "请以开放平台账户实际可用的模型 ID 为准。",
    parameters: compatibleParameters,
  },
  {
    id: "minimax",
    name: "MiniMax",
    baseUrl: "https://api.minimax.chat/v1",
    model: "MiniMax-Text-01",
    description: "使用 MiniMax 开放平台的兼容接口。",
    modelHint: "请以 MiniMax 控制台提供的模型 ID 为准。",
    parameters: compatibleParameters,
  },
  {
    id: "openai",
    name: "OpenAI 兼容接口",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    description: "使用 OpenAI 官方或采用相同格式的兼容接口。",
    modelHint: "第三方平台可能使用不同模型 ID，请查看该平台文档。",
    parameters: compatibleParameters,
  },
  {
    id: "custom",
    name: "自定义兼容接口",
    baseUrl: "",
    model: "",
    description: "适合第三方中转站或其他 OpenAI 兼容服务。",
    modelHint: "填写第三方服务商明确提供的模型 ID。",
    parameters: compatibleParameters,
  },
];

export function getProviderPreset(id: string) {
  return PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0];
}
