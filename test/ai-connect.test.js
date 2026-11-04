import { describe, expect, test } from "vitest";
import { buildMcpSnippets } from "../src/features/settings/aiConnect.js";

describe("AI connect snippets", () => {
  test("desktop app: Electron binary runs the MCP script as Node", () => {
    const snippets = buildMcpSnippets({
      command: "/Applications/aPix Builder.app/Contents/MacOS/aPix Builder",
      args: ["/Applications/aPix Builder.app/Contents/Resources/app.asar/mcp/apix-mcp.mjs"],
      env: { ELECTRON_RUN_AS_NODE: "1" },
      platform: "darwin"
    });
    expect(snippets.claudeCode).toBe('claude mcp add apix --scope user --env ELECTRON_RUN_AS_NODE=1 -- "/Applications/aPix Builder.app/Contents/MacOS/aPix Builder" "/Applications/aPix Builder.app/Contents/Resources/app.asar/mcp/apix-mcp.mjs"');
    expect(snippets.codex).toMatch(/^codex mcp add apix --env ELECTRON_RUN_AS_NODE=1 -- "/);
    expect(snippets.codexToml).toContain("env = { ELECTRON_RUN_AS_NODE = '1' }");
    expect(JSON.parse(snippets.claudeDesktop).mcpServers.apix.env).toEqual({ ELECTRON_RUN_AS_NODE: "1" });
  });

  test("Windows paths stay literal in TOML and JSON", () => {
    const snippets = buildMcpSnippets({
      command: "C:\\Program Files\\aPix Builder\\aPix Builder.exe",
      args: ["C:\\Program Files\\aPix Builder\\resources\\app.asar\\mcp\\apix-mcp.mjs"],
      env: { ELECTRON_RUN_AS_NODE: "1" },
      platform: "win32"
    });
    expect(snippets.codexToml).toContain("command = 'C:\\Program Files\\aPix Builder\\aPix Builder.exe'");
    expect(JSON.parse(snippets.claudeDesktop).mcpServers.apix.command).toBe("C:\\Program Files\\aPix Builder\\aPix Builder.exe");
    expect(snippets.claudeDesktopPath).toContain("%APPDATA%");
  });

  test("dev checkout: plain node, no env", () => {
    const snippets = buildMcpSnippets({ command: "node", args: ["/repo/mcp/apix-mcp.mjs"], env: {} });
    expect(snippets.claudeCode).toBe('claude mcp add apix --scope user -- "node" "/repo/mcp/apix-mcp.mjs"');
    expect(snippets.codexToml).not.toContain("env");
  });
});
