import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const matrixPath = resolve(root, "test-matrix.json");
const matrix = JSON.parse(await readFile(matrixPath, "utf8"));

const requiredDimensions = {
  platforms: ["windows-10", "windows-11", "android-9", "android-current"],
  viewports: [
    "desktop-1366-100",
    "desktop-1920-125",
    "desktop-3840-200",
    "phone-compact",
    "tablet-landscape",
  ],
  providers: ["deepseek", "qwen", "ollama-loopback", "ollama-lan"],
  journeys: ["create", "edit", "play", "save", "reopen", "export"],
  faults: [
    "offline",
    "offline-mid-request",
    "timeout",
    "auth-error",
    "rate-limit",
    "model-5xx",
    "malformed-response",
    "database-restore",
  ],
  compatibility: [
    "upgrade-install",
    "project-migration",
    "save-migration",
    "export-import",
  ],
};

function fail(message) {
  throw new Error(`Test matrix validation failed: ${message}`);
}

if (matrix.schemaVersion !== 1) fail("schemaVersion must be 1");
if (!matrix.firstDeliveryGoal?.includes("不依赖自有服务器")) {
  fail(
    "first delivery goal must keep the local-first server independence gate",
  );
}

const allDimensionIds = new Set();
for (const [dimension, requiredIds] of Object.entries(requiredDimensions)) {
  const entries = matrix.dimensions?.[dimension];
  if (!Array.isArray(entries)) fail(`missing dimension: ${dimension}`);
  const ids = new Set(entries.map((entry) => entry.id));
  for (const id of requiredIds) {
    if (!ids.has(id)) fail(`${dimension} is missing ${id}`);
  }
  for (const id of ids) {
    if (allDimensionIds.has(id)) fail(`duplicate dimension id: ${id}`);
    allDimensionIds.add(id);
  }
}

const cases = Array.isArray(matrix.cases) ? matrix.cases : [];
const caseIds = new Set();
const covered = new Set();
for (const testCase of cases) {
  if (!/^((AUTO|MANUAL)-[A-Z]+-\d{3})$/.test(testCase.id ?? "")) {
    fail(`invalid case id: ${testCase.id}`);
  }
  if (caseIds.has(testCase.id)) fail(`duplicate case id: ${testCase.id}`);
  caseIds.add(testCase.id);
  if (!Array.isArray(testCase.covers) || testCase.covers.length === 0) {
    fail(`${testCase.id} has no coverage`);
  }
  for (const id of testCase.covers) {
    if (!allDimensionIds.has(id))
      fail(`${testCase.id} references unknown ${id}`);
    covered.add(id);
  }
  for (const path of testCase.evidence ?? []) {
    if (!existsSync(resolve(root, path))) {
      fail(`${testCase.id} evidence does not exist: ${path}`);
    }
  }
}

for (const requiredIds of Object.values(requiredDimensions)) {
  for (const id of requiredIds) {
    if (!covered.has(id)) fail(`required dimension is not covered: ${id}`);
  }
}

const gates = Array.isArray(matrix.firstDeliveryGates)
  ? matrix.firstDeliveryGates
  : [];
const requiredGates = [
  "GATE-INSTALL-WINDOWS",
  "GATE-INSTALL-ANDROID",
  "GATE-CORE-JOURNEY",
  "GATE-LOCAL-FIRST",
  "GATE-RECOVERY",
];
const gateIds = new Set(gates.map((gate) => gate.id));
for (const id of requiredGates) {
  if (!gateIds.has(id)) fail(`missing first delivery gate: ${id}`);
}
for (const gate of gates) {
  if (!Array.isArray(gate.evidenceCases) || gate.evidenceCases.length === 0) {
    fail(`${gate.id} has no evidence cases`);
  }
  for (const caseId of gate.evidenceCases) {
    if (!caseIds.has(caseId)) fail(`${gate.id} references unknown ${caseId}`);
  }
}

console.log(
  `Test matrix valid: ${cases.length} cases, ${covered.size} covered dimensions, ${gates.length} delivery gates.`,
);
