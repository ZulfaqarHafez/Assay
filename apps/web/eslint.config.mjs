import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// eslint-config-next 16 ships native flat configs, so no FlatCompat shim.
const eslintConfig = defineConfig([
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      // React Compiler rules new in eslint-config-next 16. The existing code
      // predates them (setState in effects, a hoisted helper used by an earlier
      // effect); they stay visible as warnings until those spots are refactored.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn"
    }
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "src/e2e/**",
    "next-env.d.ts",
    "*.config.ts",
    "*.config.mjs"
  ])
]);

export default eslintConfig;
