export const FORBIDDEN_REQUEST_HEADERS = new Set([
  "authorization",
  "content-type",
  "content-length",
  "host",
  "connection",
  "cookie",
  "proxy-authorization",
  "transfer-encoding",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
]);

export function validateCustomHeaders(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("自定义请求头必须是 JSON 键值对象，不能是数组");
  }
  const result: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(input)) {
    const key = rawKey.trim();
    if (!key) throw new Error("自定义请求头不能包含空名称");
    if (FORBIDDEN_REQUEST_HEADERS.has(key.toLowerCase())) {
      throw new Error(`请求头“${key}”涉及身份或代理安全，不能在这里设置`);
    }
    if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(key)) {
      throw new Error(`请求头“${key}”的名称格式不正确`);
    }
    if (!["string", "number", "boolean"].includes(typeof rawValue)) {
      throw new Error(`请求头“${key}”的值必须是文字、数字或布尔值`);
    }
    result[key] = String(rawValue);
  }
  return result;
}

export function parseCustomHeaders(text: string): Record<string, string> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("自定义请求头不是有效 JSON，请检查引号、逗号和括号");
  }
  return validateCustomHeaders(parsed);
}

export function validateApiBaseUrl(
  base: string,
  options: {
    allowLoopback?: boolean;
    allowPrivateNetwork?: boolean;
  } = {},
) {
  let url: URL;
  try {
    url = new URL(base.trim());
  } catch {
    throw new Error("请输入完整的 API 地址，例如 https://api.example.com/v1");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const loopback =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1";
  const rfc1918Ipv4 =
    /^(10\.|192\.168\.)/.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  const privateIpv4 = loopback || rfc1918Ipv4 || /^(169\.254\.|0\.)/.test(host);
  const localHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1" ||
    host === "metadata.google.internal";
  if (url.username || url.password)
    throw new Error("API 地址不能包含账号或密码");
  if (loopback && options.allowLoopback) {
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error("Ollama 本地地址只支持 HTTP 或 HTTPS");
    return url;
  }
  if (rfc1918Ipv4 && options.allowPrivateNetwork) {
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error("Ollama 局域网地址只支持 HTTP 或 HTTPS");
    return url;
  }
  if (options.allowLoopback && (privateIpv4 || localHost))
    throw new Error(
      "Ollama 本地接口只允许 localhost 或 127.0.0.1，不允许其他内网地址",
    );
  if (url.protocol !== "https:")
    throw new Error("当前代理只允许 HTTPS API 地址");
  if (privateIpv4 || localHost) {
    throw new Error("当前代理不允许访问本机或内网地址");
  }
  return url;
}
