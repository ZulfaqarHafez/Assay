#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const TARGETS = {
  api: {
    paths: ["apps/api/", "scripts/vercel-ignore.mjs"],
  },
  web: {
    paths: ["apps/web/", "package.json", "package-lock.json", "scripts/vercel-ignore.mjs"],
  },
};

const ZERO_SHA = /^0+$/;

function usage() {
  console.error(
    "Usage: node scripts/vercel-ignore.mjs <api|web> [--base <sha>] [--head <sha>]"
  );
}

function parseArgs(argv) {
  const [target, ...rest] = argv;
  const options = { target, base: "", head: "" };

  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (flag === "--base" && value) {
      options.base = value;
      index += 1;
    } else if (flag === "--head" && value) {
      options.head = value;
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete option: ${flag}`);
    }
  }

  return options;
}

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim();
    throw new Error(`git ${args.join(" ")} failed${detail ? `: ${detail}` : ""}`);
  }
  return result.stdout.trim();
}

function commitExists(ref) {
  if (!ref || ZERO_SHA.test(ref)) {
    return false;
  }
  const result = spawnSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
    encoding: "utf8",
  });
  return result.status === 0;
}

function resolveHead(explicitHead) {
  const head = explicitHead || process.env.VERCEL_GIT_COMMIT_SHA || "HEAD";
  return commitExists(head) ? head : "HEAD";
}

function resolveBase(explicitBase, head) {
  const candidates = [
    explicitBase,
    process.env.VERCEL_GIT_PREVIOUS_SHA,
    process.env.VERCEL_GIT_PULL_REQUEST_TARGET_BRANCH
      ? `origin/${process.env.VERCEL_GIT_PULL_REQUEST_TARGET_BRANCH}`
      : "",
    `${head}^`,
  ].filter(Boolean);

  return candidates.find(commitExists) || "";
}

function changedPaths(base, head) {
  const output = git(["diff", "--name-only", base, head, "--"]);
  return output
    .split(/\r?\n/)
    .map((path) => path.trim().replaceAll("\\", "/"))
    .filter(Boolean);
}

function affectsTarget(path, targetConfig) {
  return targetConfig.paths.some((affectedPath) => {
    if (affectedPath.endsWith("/")) {
      return path.startsWith(affectedPath);
    }
    return path === affectedPath;
  });
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    usage();
    process.exit(1);
  }

  const targetConfig = TARGETS[options.target];
  if (!targetConfig) {
    usage();
    process.exit(1);
  }

  const head = resolveHead(options.head);
  const base = resolveBase(options.base, head);
  if (!base) {
    console.error(`[vercel-ignore] ${options.target}: no comparable base commit; building.`);
    process.exit(1);
  }

  // Vercel sets VERCEL_GIT_PREVIOUS_SHA to the last successful deployment of
  // the same branch. A redeploy or a production build of a commit that already
  // has a preview therefore compares the commit with itself and finds no
  // changes. Nothing new to diff means someone asked for this build on purpose.
  let sameCommit = false;
  try {
    sameCommit = git(["rev-parse", `${base}^{commit}`]) === git(["rev-parse", `${head}^{commit}`]);
  } catch {
    sameCommit = false;
  }
  if (sameCommit) {
    console.error(`[vercel-ignore] ${options.target}: base equals head (redeploy); building.`);
    process.exit(1);
  }

  let paths;
  try {
    paths = changedPaths(base, head);
  } catch (error) {
    console.error(`[vercel-ignore] ${options.target}: ${error.message}; building.`);
    process.exit(1);
  }

  const affected = paths.filter((path) => affectsTarget(path, targetConfig));
  if (affected.length > 0) {
    console.error(
      `[vercel-ignore] ${options.target}: build required by ${affected.slice(0, 12).join(", ")}${
        affected.length > 12 ? ", ..." : ""
      }`
    );
    process.exit(1);
  }

  console.error(
    `[vercel-ignore] ${options.target}: ignoring build; ${paths.length || "no"} changed path${
      paths.length === 1 ? "" : "s"
    } outside target.`
  );
  process.exit(0);
}

main();
