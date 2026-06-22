import { chmod, copyFile, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function backupPathFor(filePath) {
  return `${filePath}.bak`;
}

export async function atomicWriteFile(filePath, data, {
  encoding = "utf8",
  mode = 0o600,
  backup = true
} = {}) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  await mkdir(directory, { recursive: true });

  let handle;
  try {
    handle = await open(tempPath, "wx", mode);
    await handle.writeFile(data, encoding);
    await handle.sync();
    await handle.close();
    handle = null;
    await chmod(tempPath, mode);
    await rename(tempPath, filePath);
    if (backup) await copyFile(filePath, backupPathFor(filePath));
    try {
      const directoryHandle = await open(directory, "r");
      await directoryHandle.sync();
      await directoryHandle.close();
    } catch {
      // Directory fsync is unsupported on some platforms; the file is durable.
    }
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(tempPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function readJsonFileWithBackup(filePath) {
  let primaryError;
  try {
    return { value: JSON.parse(await readFile(filePath, "utf8")), source: "primary" };
  } catch (error) {
    primaryError = error;
  }

  try {
    return { value: JSON.parse(await readFile(backupPathFor(filePath), "utf8")), source: "backup" };
  } catch (backupError) {
    if (primaryError?.code === "ENOENT" && backupError?.code === "ENOENT") {
      return { value: null, source: "missing" };
    }
    const error = new Error(`Không đọc được dữ liệu JSON: ${path.basename(filePath)}`);
    error.cause = primaryError;
    throw error;
  }
}
