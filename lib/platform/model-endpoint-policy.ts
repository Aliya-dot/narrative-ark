import { validateApiBaseUrl } from "../ai-config";
import type { RuntimeCapabilities } from "./capabilities";

export function resolveModelEndpoint(
  baseUrl: string,
  provider: string,
  runtime: RuntimeCapabilities,
) {
  const clean = baseUrl.trim().replace(/\/$/, "");
  const target = clean.endsWith("/chat/completions")
    ? clean
    : `${clean}/chat/completions`;
  return validateApiBaseUrl(target, {
    allowLoopback: provider === "ollama" && runtime.supportsLoopbackOllama,
    allowPrivateNetwork: provider === "ollama" && runtime.supportsLanOllama,
  }).toString();
}
