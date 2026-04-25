import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function sh(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
}

function fail(message) {
  console.error(`\n[GUARDRAIL BLOCKED]\n${message}\n`);
  process.exit(1);
}

function main() {
  const inside = sh("git rev-parse --is-inside-work-tree || true");
  if (inside !== "true") fail("Not inside a git repository.");

  const repoRoot = sh("git rev-parse --show-toplevel");
  const workdir = process.cwd();
  if (!workdir.startsWith(repoRoot)) {
    fail(`Working directory is outside repo root.\n- cwd: ${workdir}\n- root: ${repoRoot}`);
  }

  sh("git fetch origin --prune");

  const baselinePath = path.join(repoRoot, "scripts", "guardrails", "baseline.json");
  if (!fs.existsSync(baselinePath)) {
    fail(`Missing baseline file: ${baselinePath}\nFix: create it from the trusted live baseline commit.`);
  }
  const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  const baselineCommit = String(baseline?.baseline_commit ?? "").trim();
  if (!baselineCommit) fail(`Invalid baseline file: ${baselinePath}`);

  const status = sh("git status --porcelain=v1");
  if (status) {
    fail(
      "Workspace has uncommitted changes. Commit or stash them before deploy/preview.\n\n" +
        "Tip: use /Users/nataleletteriotornatora/Documents/bndo-live-aligned-2026-04-25 as the only working folder."
    );
  }

  const head = sh("git rev-parse HEAD");
  try {
    execSync(`git merge-base --is-ancestor ${baselineCommit} ${head}`, {
      stdio: ["ignore", "ignore", "ignore"],
    });
  } catch {
    fail(
      "Current HEAD is not based on the trusted baseline.\n\n" +
        `- baseline: ${baselineCommit}\n` +
        `- HEAD:     ${head}\n\n` +
        "Fix: reset your branch/worktree to the trusted baseline before working or deploying."
    );
  }

  const originUrl = sh("git remote get-url origin");
  if (!originUrl.includes("github.com") || !originUrl.includes("bndo-webapp")) {
    fail(
      "Origin remote does not look like the BNDO GitHub repo.\n\n" +
        `- origin: ${originUrl}\n` +
        "Fix: ensure this worktree points to the correct repository before deploying."
    );
  }

  console.log(
    `[GUARDRAIL OK] clean workspace + HEAD (${head.slice(0, 7)}) is based on baseline (${baselineCommit.slice(0, 7)})`
  );
}

main();
