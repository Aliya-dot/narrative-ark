import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "react-hooks/incompatible-library": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "dist-client/**",
    "node_modules/**",
    ".android-sdk/**",
    ".gradle-home/**",
    ".cargo-validation/**",
    ".tools/**",
    ".tmp-*/**",
    "release-artifacts/**",
    "src-tauri/gen/android/**/build/**",
    "src-tauri/target/**",
    "next-env.d.ts",
  ]),
]);
