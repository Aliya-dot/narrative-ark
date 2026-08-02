import assert from "node:assert/strict";
import { validateApiBaseUrl } from "./ai-config.ts";

assert.throws(
  () => validateApiBaseUrl("http://127.0.0.1:11434/v1"),
  /HTTPS/,
  "普通接口不能访问本机 HTTP 地址",
);
assert.equal(
  validateApiBaseUrl("http://127.0.0.1:11434/v1", {
    allowLoopback: true,
  }).toString(),
  "http://127.0.0.1:11434/v1",
);
assert.equal(
  validateApiBaseUrl("http://localhost:11434/v1", {
    allowLoopback: true,
  }).toString(),
  "http://localhost:11434/v1",
);
assert.throws(
  () =>
    validateApiBaseUrl("http://192.168.1.8:11434/v1", {
      allowLoopback: true,
    }),
  /内网/,
  "Ollama 预设也只能访问本机回环地址",
);
assert.throws(
  () =>
    validateApiBaseUrl("http://example.com/v1", {
      allowLoopback: true,
    }),
  /HTTPS/,
  "放行 Ollama 不能顺带放行公网 HTTP",
);

console.log("ai config tests passed");
