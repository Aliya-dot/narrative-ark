import assert from "node:assert/strict";
import {
  decryptSecretValue,
  encryptSecretValue,
} from "./platform/encrypted-secret-fallback.ts";

const encrypted = await encryptSecretValue("fixture-api-key");
assert.equal(await decryptSecretValue(encrypted), "fixture-api-key");
await assert.rejects(
  decryptSecretValue({ ...encrypted, iv: crypto.getRandomValues(new Uint8Array(12)) }),
);
assert.equal(encrypted.cryptoKey.extractable, false);

console.log("Encrypted secret fallback regression tests passed");
