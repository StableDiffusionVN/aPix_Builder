import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { installMcpClient, listMcpClients, removeCodexToml, uninstallMcpClient, upsertCodexToml } from "../server/lib/mcpClients.js";

const launch = { command: "/Apps/aPix Builder", args: ["/Apps/app.asar/mcp/apix-mcp.mjs"], env: { ELECTRON_RUN_AS_NODE: "1" } };
let home;
afterAll(() => home && rm(home, { recursive: true, force: true }));

describe("MCP client registration", () => {
  test("merges into an existing JSON config, keeps other servers, backs up once", async () => {
    home = await mkdtemp(path.join(os.tmpdir(), "apix-home-"));
    const options = { home, platform: "darwin" };
    const file = path.join(home, ".cursor", "mcp.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ mcpServers: { other: { command: "x" } }, theme: "dark" }));

    let clients = await listMcpClients(launch, options);
    expect(clients.find(c => c.id === "cursor")).toMatchObject({ detected: true, status: "missing" });
    expect(clients.find(c => c.id === "windsurf").detected).toBe(false);

    const state = await installMcpClient("cursor", launch, options);
    expect(state.status).toBe("connected");
    const written = JSON.parse(await readFile(file, "utf8"));
    expect(written.mcpServers.other).toEqual({ command: "x" });
    expect(written.theme).toBe("dark");
    expect(written.mcpServers.apix).toEqual({ command: launch.command, args: launch.args, env: launch.env });
    expect(JSON.parse(await readFile(`${file}.apix-backup`, "utf8")).mcpServers.apix).toBeUndefined();

    clients = await listMcpClients({ ...launch, args: ["/moved/apix-mcp.mjs"] }, options);
    expect(clients.find(c => c.id === "cursor").status).toBe("outdated");

    await uninstallMcpClient("cursor", launch, options);
    expect(JSON.parse(await readFile(file, "utf8")).mcpServers).toEqual({ other: { command: "x" } });
  });

  test("VS Code uses the servers key with type stdio; creates missing files", async () => {
    const options = { home, platform: "linux" };
    await installMcpClient("vscode", launch, options);
    const file = path.join(process.env.XDG_CONFIG_HOME || path.join(home, ".config"), "Code", "User", "mcp.json");
    if (!process.env.XDG_CONFIG_HOME) {
      expect(JSON.parse(await readFile(file, "utf8")).servers.apix.type).toBe("stdio");
    }
  });

  test("refuses to rewrite JSON it cannot parse", async () => {
    const options = { home, platform: "darwin" };
    const file = path.join(home, ".codeium", "windsurf", "mcp_config.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{ // comment\n }");
    await expect(installMcpClient("windsurf", launch, options)).rejects.toThrow(/JSON/);
  });

  test("Codex TOML section is added, replaced and removed without touching the rest", () => {
    const base = "model = 'gpt-5'\n\n[mcp_servers.other]\ncommand = 'x'\n";
    const added = upsertCodexToml(base, launch);
    expect(added).toContain("[mcp_servers.other]");
    expect(added).toContain("[mcp_servers.apix]\ncommand = '/Apps/aPix Builder'");
    const replaced = upsertCodexToml(added, { ...launch, args: ["/new.mjs"] });
    expect(replaced.match(/\[mcp_servers\.apix\]/g)).toHaveLength(1);
    expect(replaced).toContain("args = ['/new.mjs']");
    expect(removeCodexToml(replaced)).not.toContain("apix");
    expect(removeCodexToml(replaced)).toContain("[mcp_servers.other]");
  });
});
