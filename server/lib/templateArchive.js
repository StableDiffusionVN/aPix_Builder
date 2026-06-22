import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const ASAR_SEGMENT = `${path.sep}app.asar${path.sep}`;

export function isInsideAsar(filePath) {
  const normalized = path.normalize(String(filePath || ""));
  return normalized.includes(ASAR_SEGMENT) || normalized.endsWith(`${path.sep}app.asar`);
}

function runTar(parentDir, archiveName) {
  return new Promise((resolve, reject) => {
    const child = spawn("tar", ["-czf", "-", "-C", parentDir, archiveName], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    const chunks = [];
    let stderr = "";

    child.stdout.on("data", chunk => chunks.push(chunk));
    child.stderr.on("data", chunk => { stderr += String(chunk); });
    child.on("error", reject);
    child.on("close", code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `tar exited with code ${code}`));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

async function copyDirectoryRecursive(srcDir, destDir) {
  await mkdir(destDir, { recursive: true });
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(srcPath, destPath);
    } else {
      await writeFile(destPath, await readFile(srcPath));
    }
  }
}

async function prepareArchiveSource(baseDir, folderName) {
  const archiveName = String(folderName || path.basename(baseDir)).trim() || "template";
  if (!isInsideAsar(baseDir)) {
    return {
      parentDir: path.dirname(baseDir),
      archiveName,
      cleanup: null
    };
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "apix-template-export-"));
  const stagedDir = path.join(tempRoot, archiveName);
  // Electron asar: readFile/readdir work, but fs.cp cannot copy virtual directories.
  await copyDirectoryRecursive(baseDir, stagedDir);
  return {
    parentDir: tempRoot,
    archiveName,
    cleanup: () => rm(tempRoot, { recursive: true, force: true })
  };
}

export async function archiveTemplateDirectory(baseDir, folderName = path.basename(baseDir)) {
  const source = await prepareArchiveSource(baseDir, folderName);
  try {
    return await runTar(source.parentDir, source.archiveName);
  } finally {
    if (source.cleanup) {
      await source.cleanup().catch(() => {});
    }
  }
}
