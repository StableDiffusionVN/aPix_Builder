import { spawn } from "node:child_process";
import path from "node:path";

export function archiveTemplateDirectory(baseDir, folderName = path.basename(baseDir)) {
  const parentDir = path.dirname(baseDir);
  const archiveName = String(folderName || path.basename(baseDir)).trim() || "template";

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
