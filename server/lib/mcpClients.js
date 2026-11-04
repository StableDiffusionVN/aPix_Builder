// MCP clients aPix can register itself with: where each keeps its config and in
// which shape. Install merges an "apix" entry into that file (keeping a one-time
// backup of the original); everything else in the file is left as is.
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SERVER_NAME = "apix";

function appData(home, platform) {
  if (platform === "win32") return process.env.APPDATA || path.join(home, "AppData", "Roaming");
  if (platform === "darwin") return path.join(home, "Library", "Application Support");
  return process.env.XDG_CONFIG_HOME || path.join(home, ".config");
}

/**
 * kind: "json" — `{ [key]: { apix: entry } }` in a JSON file; "toml" — Codex `[mcp_servers.apix]`.
 * detect: folders whose existence means the client is installed.
 */
export function mcpClientTable({ home = os.homedir(), platform = process.platform } = {}) {
  const support = appData(home, platform);
  const vscodeUser = path.join(support, "Code", "User");
  return [
    { id: "claude-desktop", name: "Claude Desktop", kind: "json", key: "mcpServers", file: path.join(support, "Claude", "claude_desktop_config.json"), detect: [path.join(support, "Claude")], restart: true },
    { id: "cursor", name: "Cursor", kind: "json", key: "mcpServers", file: path.join(home, ".cursor", "mcp.json"), detect: [path.join(home, ".cursor")] },
    { id: "windsurf", name: "Windsurf", kind: "json", key: "mcpServers", file: path.join(home, ".codeium", "windsurf", "mcp_config.json"), detect: [path.join(home, ".codeium", "windsurf")] },
    { id: "antigravity", name: "Google Antigravity", kind: "json", key: "mcpServers", file: path.join(home, ".gemini", "antigravity", "mcp_config.json"), detect: [path.join(home, ".gemini", "antigravity")] },
    { id: "gemini-cli", name: "Gemini CLI", kind: "json", key: "mcpServers", file: path.join(home, ".gemini", "settings.json"), detect: [path.join(home, ".gemini")] },
    { id: "vscode", name: "VS Code (Copilot agent)", kind: "json", key: "servers", entryType: "stdio", file: path.join(vscodeUser, "mcp.json"), detect: [vscodeUser] },
    { id: "codex", name: "Codex CLI", kind: "toml", file: path.join(home, ".codex", "config.toml"), detect: [path.join(home, ".codex")] },
    { id: "lm-studio", name: "LM Studio", kind: "json", key: "mcpServers", file: path.join(home, ".lmstudio", "mcp.json"), detect: [path.join(home, ".lmstudio")] }
  ];
}

export function mcpEntry(launch, client) {
  return {
    ...(client?.entryType ? { type: client.entryType } : {}),
    command: launch.command,
    args: launch.args,
    ...(Object.keys(launch.env || {}).length ? { env: launch.env } : {})
  };
}

const tomlString = value => `'${String(value)}'`;

export function codexTomlBlock(launch) {
  const env = Object.entries(launch.env || {});
  return [
    `[mcp_servers.${SERVER_NAME}]`,
    `command = ${tomlString(launch.command)}`,
    `args = [${launch.args.map(tomlString).join(", ")}]`,
    ...(env.length ? [`env = { ${env.map(([key, value]) => `${key} = ${tomlString(value)}`).join(", ")} }`] : [])
  ].join("\n");
}

// Codex section boundaries: from our header to the next top-level table header.
const CODEX_SECTION = /^\[mcp_servers\.apix\][^\n]*\n(?:(?!\[)[^\n]*\n?)*/m;

export function upsertCodexToml(text, launch) {
  const block = `${codexTomlBlock(launch)}\n`;
  if (CODEX_SECTION.test(text)) return text.replace(CODEX_SECTION, block);
  const base = text && !text.endsWith("\n") ? `${text}\n` : text;
  return `${base}${base ? "\n" : ""}${block}`;
}

export function removeCodexToml(text) {
  return text.replace(CODEX_SECTION, "").replace(/\n{3,}/g, "\n\n");
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function readText(file) {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function parseJson(text, file) {
  if (text === null || !text.trim()) return {};
  try {
    const value = JSON.parse(text);
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {
    // fall through
  }
  throw new Error(`File cấu hình không phải JSON hợp lệ (có thể chứa comment): ${file}. Hãy sửa tay theo mẫu.`);
}

function sameEntry(current, expected) {
  return Boolean(current)
    && current.command === expected.command
    && JSON.stringify(current.args || []) === JSON.stringify(expected.args || [])
    && JSON.stringify(current.env || {}) === JSON.stringify(expected.env || {});
}

async function clientState(client, launch) {
  const detected = (await Promise.all(client.detect.map(exists))).some(Boolean) || await exists(client.file);
  const text = await readText(client.file).catch(() => null);
  let status = "missing";
  let error = "";
  if (text !== null) {
    if (client.kind === "toml") {
      const section = text.match(CODEX_SECTION)?.[0] || "";
      if (section) status = section.trim() === codexTomlBlock(launch).trim() ? "connected" : "outdated";
    } else {
      try {
        const entry = parseJson(text, client.file)?.[client.key]?.[SERVER_NAME];
        if (entry) status = sameEntry(entry, mcpEntry(launch, client)) ? "connected" : "outdated";
      } catch (parseError) {
        error = parseError.message;
      }
    }
  }
  return { id: client.id, name: client.name, file: client.file, kind: client.kind, detected, status, error, restart: Boolean(client.restart) };
}

export async function listMcpClients(launch, options) {
  return Promise.all(mcpClientTable(options).map(client => clientState(client, launch)));
}

async function backupOnce(file) {
  const backup = `${file}.apix-backup`;
  if (await exists(file) && !await exists(backup)) await copyFile(file, backup);
}

export async function installMcpClient(clientId, launch, options) {
  const client = mcpClientTable(options).find(item => item.id === clientId);
  if (!client) throw new Error(`Không hỗ trợ client "${clientId}"`);
  const text = await readText(client.file);
  let next;
  if (client.kind === "toml") {
    next = upsertCodexToml(text || "", launch);
  } else {
    const config = parseJson(text, client.file);
    config[client.key] = { ...(config[client.key] || {}), [SERVER_NAME]: mcpEntry(launch, client) };
    next = `${JSON.stringify(config, null, 2)}\n`;
  }
  await mkdir(path.dirname(client.file), { recursive: true });
  await backupOnce(client.file);
  await writeFile(client.file, next, "utf8");
  return clientState(client, launch);
}

export async function uninstallMcpClient(clientId, launch, options) {
  const client = mcpClientTable(options).find(item => item.id === clientId);
  if (!client) throw new Error(`Không hỗ trợ client "${clientId}"`);
  const text = await readText(client.file);
  if (text === null) return clientState(client, launch);
  let next;
  if (client.kind === "toml") {
    next = removeCodexToml(text);
  } else {
    const config = parseJson(text, client.file);
    if (config[client.key]) delete config[client.key][SERVER_NAME];
    next = `${JSON.stringify(config, null, 2)}\n`;
  }
  await backupOnce(client.file);
  await writeFile(client.file, next, "utf8");
  return clientState(client, launch);
}
