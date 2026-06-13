import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const root = fileURLToPath(new URL("../", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : "pipe"
  });
}

function git(args, options) {
  return run("git", args, options);
}

function value(result) {
  return result.status === 0 ? result.stdout.trim() : "";
}

function restoreStash() {
  console.log("\nRestoring local changes...");
  const restore = git(["stash", "pop"], { inherit: true });
  if (restore.status !== 0) {
    console.error("Local changes could not be restored automatically.");
    console.error("Resolve the conflicts above. Your changes remain available in Git stash.");
    return false;
  }
  return true;
}

async function askToUpdate(commitCount, branch) {
  if (!input.isTTY || !output.isTTY) return false;

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(
      `\nFound ${commitCount} new commit(s) on origin/${branch}. Update now? [Y/n]: `
    );
    return answer.trim() === "" || /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

async function main() {
  if (git(["--version"]).status !== 0) {
    console.warn("Update check skipped: Git was not found.");
    return;
  }

  if (git(["rev-parse", "--is-inside-work-tree"]).status !== 0) {
    console.warn("Update check skipped: this folder is not a Git repository.");
    return;
  }

  const branch = value(git(["branch", "--show-current"]));
  if (!branch) {
    console.warn("Update check skipped: Git is in detached HEAD mode.");
    return;
  }

  if (git(["remote", "get-url", "origin"]).status !== 0) {
    console.warn('Update check skipped: Git remote "origin" is not configured.');
    return;
  }

  console.log(`Checking for updates on origin/${branch}...`);
  const fetch = git(["fetch", "--quiet", "--prune", "origin"]);
  if (fetch.status !== 0) {
    console.warn("Could not check for updates. Starting the installed version.");
    return;
  }

  const remoteRef = `origin/${branch}`;
  if (git(["show-ref", "--verify", "--quiet", `refs/remotes/${remoteRef}`]).status !== 0) {
    console.warn(`Update check skipped: ${remoteRef} does not exist.`);
    return;
  }

  const commitCount = Number(value(git(["rev-list", "--count", `HEAD..${remoteRef}`])));
  if (!Number.isFinite(commitCount) || commitCount < 1) {
    console.log("aPix Builder is up to date.");
    return;
  }

  const recentCommits = value(
    git(["log", "--oneline", "--max-count=5", `HEAD..${remoteRef}`])
  );
  if (recentCommits) {
    console.log("\nNew commits:");
    console.log(recentCommits);
    if (commitCount > 5) {
      console.log(`...and ${commitCount - 5} more commit(s).`);
    }
  }

  const shouldUpdate = await askToUpdate(commitCount, branch);
  if (!shouldUpdate) {
    console.log("Update skipped. Starting the installed version.");
    return;
  }

  const oldCommit = value(git(["rev-parse", "HEAD"]));
  const hasChanges = value(git(["status", "--porcelain", "--untracked-files=all"])) !== "";
  let stashed = false;

  if (hasChanges) {
    console.log("Saving local changes temporarily...");
    const stash = git(
      ["stash", "push", "--include-untracked", "--message", "aPix Builder automatic update"],
      { inherit: true }
    );
    if (stash.status !== 0) {
      throw new Error("Could not save local changes.");
    }
    stashed = true;
  }

  console.log(`Updating from ${remoteRef}...`);
  const merge = git(["merge", "--ff-only", remoteRef], { inherit: true });
  if (merge.status !== 0) {
    if (stashed) restoreStash();
    throw new Error("The branch could not be updated with fast-forward. No commit was overwritten.");
  }

  const newCommit = value(git(["rev-parse", "HEAD"]));
  const dependencyFilesChanged =
    oldCommit &&
    newCommit &&
    value(git(["diff", "--name-only", oldCommit, newCommit]))
      .split(/\r?\n/)
      .some(file => file === "package.json" || file === "package-lock.json");

  if (dependencyFilesChanged) {
    console.log("\nUpdating dependencies...");
    const install = run(npm, ["install"], { inherit: true });
    if (install.status !== 0) {
      if (stashed) restoreStash();
      throw new Error("Git was updated, but npm install failed.");
    }
  }

  if (stashed && !restoreStash()) {
    process.exitCode = 1;
    return;
  }

  console.log("\naPix Builder was updated successfully.");
}

main().catch(error => {
  console.error(`\nUpdate error: ${error.message}`);
  process.exitCode = 1;
});
