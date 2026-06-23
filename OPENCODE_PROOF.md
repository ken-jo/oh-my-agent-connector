# OpenCode Empirical Proof — oh-my-agent-connector

Date: 2026-06-23 UTC
Host: OpenCode 1.17.0 at /home/ubuntu/.nvm/versions/node/v24.14.0/bin/opencode
Repo: /home/ubuntu/workspace/github/oh-my-agent-connector
Connector id: oh-my-agent-connector

## Real-host install

Command:

```sh
node bin.mjs install --targets opencode --scope user --force
```

Result: pass. The installer wrote the real user OpenCode config, not an isolated home.

- Config backup: /home/ubuntu/.agent-connector/backups/opencode-2026-06-23T14-19-38-110Z-opencode.json
- Created/updated summary: 113 created, 18 updated, 0 removed, 0 skipped, 0 warnings
- Registered MCP key: mcp.oh-my-agent-connector in /home/ubuntu/.config/opencode/opencode.json
- Plugin module: /home/ubuntu/.config/opencode/plugin/oh-my-agent-connector.js
- Memory block: oh-my-agent-connector/orchestrator in /home/ubuntu/.config/opencode/AGENTS.md

## Config proof after install

Parsed /home/ubuntu/.config/opencode/opencode.json:

```json
{
  "mcpKeys": ["context-mode", "oh-my-agent-connector"],
  "hasOldOmg": false,
  "command": [
    "/home/ubuntu/.agent-connector/bin/agent-connector",
    "serve",
    "--connector",
    "oh-my-agent-connector",
    "--scope",
    "user",
    "--host",
    "opencode",
    "--",
    "node",
    "/home/ubuntu/workspace/github/oh-my-agent-connector/bridge/mcp-server.cjs"
  ],
  "CLAUDE_PLUGIN_ROOT": "/home/ubuntu/workspace/github/oh-my-agent-connector",
  "pluginExists": true,
  "pluginBytes": 4842,
  "commandCount": 31,
  "skillCount": 41,
  "agentCount": 21,
  "memoryHasBlock": true
}
```

## Doctor/probe proof

Command:

```sh
node bin.mjs doctor --targets opencode --scope user --probe
```

Result: pass.

- OpenCode config present
- mcp.oh-my-agent-connector registered
- plugin module present
- commands present
- skills present
- subagents present
- memory block intact
- MCP initialize: serverInfo t@1.0.0, protocol 2025-11-25
- MCP capabilities: tools
- MCP ping: alive
- MCP tools/list: 49 tools
- Final line: doctor: all checks passed.

## OMC runtime doctor proof

These checks exercise the ported OMC runtime doctor commands, not only the
agent-connector host doctor.

Command:

```sh
node bin/oh-my-claudecode.js doctor team-routing --plugin-dir /home/ubuntu/workspace/github/oh-my-agent-connector
```

Result: pass.

- claude provider CLI found: /home/ubuntu/.local/bin/claude
- Version reported: 2.1.186 (Claude Code)
- Final line: All configured providers are available.

Command:

```sh
node bin/oh-my-claudecode.js doctor conflicts --plugin-dir /home/ubuntu/workspace/github/oh-my-agent-connector
```

Result: warning/non-zero. The conflicts doctor intentionally reported existing
Claude Code home conflicts, separate from the OpenCode install:

- existing context-mode hooks in /home/ubuntu/.claude/settings.json
- legacy Claude skills shadowing plugin skill names: autopilot, cancel,
  deep-interview, ralph, ultrawork
- unknown field lastUpdated in .omc-config.json
- no unified MCP registry at /home/ubuntu/.config/omc/mcp-registry.json

This does not invalidate the OpenCode proof above; it documents that the local
Claude Code home has pre-existing OMC/context-mode state while the OpenCode
target-specific doctor passes.

## Hook honor matrix

Command:

```sh
node bin.mjs doctor --targets opencode --scope user --probe --explain
```

Result: intentionally non-zero because OpenCode degrades one declared event.

Honored by OpenCode:

- PermissionRequest
- PostToolUse
- PreToolUse

Degraded by OpenCode:

- SessionStart: OpenCode fires it but drops returned context because it has no stdout path.

Dropped/unsupported by OpenCode, honestly reported by agent-connector:

- PostToolUseFailure
- PreCompact
- SessionEnd
- Stop
- SubagentStart
- SubagentStop
- UserPromptSubmit

This proves the install on the real OpenCode host and records the exact host limitations instead of claiming false parity.


## OpenCode CLI MCP-list smoke

Command:

```sh
opencode mcp list
```

Result: pass. This used the actual OpenCode CLI and the real user config without invoking a model.

- context-mode: connected
- oh-my-agent-connector: connected
- oh-my-agent-connector command: /home/ubuntu/.agent-connector/bin/agent-connector serve --connector oh-my-agent-connector --scope user --host opencode -- node /home/ubuntu/workspace/github/oh-my-agent-connector/bridge/mcp-server.cjs
- Total: 2 server(s)
