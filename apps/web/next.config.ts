import path from "node:path";
import type { NextConfig } from "next";

// The container image (apps/web/Dockerfile) builds a self-contained server with
// NEXT_OUTPUT_STANDALONE=1. Vercel builds leave it unset and are unchanged.
const standalone = process.env.NEXT_OUTPUT_STANDALONE === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(standalone
    ? {
        output: "standalone" as const,
        // npm workspaces hoist dependencies to the repo root; trace from there.
        outputFileTracingRoot: path.join(__dirname, "../..")
      }
    : {})
};

export default nextConfig;
