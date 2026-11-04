// Ready-to-paste MCP registration snippets for the aPix MCP server on this machine.

const quote = value => `"${String(value).replace(/"/g, '\\"')}"`;
// TOML literal strings keep Windows backslashes as typed.
const tomlString = value => `'${String(value)}'`;

export function buildMcpSnippets({ command, args = [], env = {}, platform = "darwin" } = {}) {
  if (!command || !args.length) return null;
  const envFlags = Object.entries(env).map(([key, value]) => `--env ${key}=${value}`).join(" ");
  const launch = [quote(command), ...args.map(quote)].join(" ");
  const withEnv = envFlags ? `${envFlags} ` : "";
  const tomlEnv = Object.keys(env).length
    ? `\nenv = { ${Object.entries(env).map(([key, value]) => `${key} = ${tomlString(value)}`).join(", ")} }`
    : "";
  const desktopConfig = {
    mcpServers: {
      apix: { command, args, ...(Object.keys(env).length ? { env } : {}) }
    }
  };
  return {
    claudeCode: `claude mcp add apix --scope user ${withEnv}-- ${launch}`,
    codex: `codex mcp add apix ${withEnv}-- ${launch}`,
    gemini: `gemini mcp add --scope user ${Object.entries(env).map(([key, value]) => `-e ${key}=${value} `).join("")}apix ${launch}`,
    codexToml: `[mcp_servers.apix]\ncommand = ${tomlString(command)}\nargs = [${args.map(tomlString).join(", ")}]${tomlEnv}`,
    claudeDesktop: JSON.stringify(desktopConfig, null, 2),
    claudeDesktopPath: platform === "win32"
      ? "%APPDATA%\\Claude\\claude_desktop_config.json"
      : "~/Library/Application Support/Claude/claude_desktop_config.json",
    codexConfigPath: platform === "win32" ? "%USERPROFILE%\\.codex\\config.toml" : "~/.codex/config.toml"
  };
}
