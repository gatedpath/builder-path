Claude Code (one command; add `--scope project` to share it through `.mcp.json`):

```
claude mcp add --transport stdio redbelly -- node /path/to/redbelly-mcp/dist/main.js
```

Cursor (`.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` for everywhere):

```json
{ "mcpServers": { "redbelly": { "type": "stdio", "command": "node", "args": ["/path/to/redbelly-mcp/dist/main.js"] } } }
```

Codex CLI (one command; or the same in `~/.codex/config.toml` / `.codex/config.toml`):

```
codex mcp add redbelly -- node /path/to/redbelly-mcp/dist/main.js
```

```toml
[mcp_servers.redbelly]
command = "node"
args = ["/path/to/redbelly-mcp/dist/main.js"]
```

Windsurf (`~/.codeium/windsurf/mcp_config.json`):

```json
{ "mcpServers": { "redbelly": { "command": "node", "args": ["/path/to/redbelly-mcp/dist/main.js"] } } }
```

GitHub Copilot in VS Code (`.vscode/mcp.json` in the repository; the `servers` key, not `mcpServers`):

```json
{ "servers": { "redbelly": { "type": "stdio", "command": "node", "args": ["/path/to/redbelly-mcp/dist/main.js"] } } }
```

Gemini CLI (one command; or `mcpServers` in `settings.json`):

```
gemini mcp add redbelly node /path/to/redbelly-mcp/dist/main.js
```
