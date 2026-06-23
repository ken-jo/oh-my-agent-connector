---
name: oh-my-agent-connector-doctor
description: Diagnose an Oh-My-AgentConnector installation across supported agent CLI hosts
level: 3
---

# Oh-My-AgentConnector Doctor

Run host-neutral diagnostics for the connector install and bundled runtime.

## Inputs

Treat the user's arguments as optional filters:

```text
$ARGUMENTS
```

If no host is specified, prefer the current host when obvious. Otherwise use
`opencode` for this port's empirical smoke path.

Supported host names follow agent-connector target names, for example:
`opencode`, `codex`, `claude-code`, `cursor`, `gemini-cli`.

## Checks

1. Run the agent-connector host doctor for the chosen host:

```bash
node bin.mjs doctor --targets <host> --scope user --probe
```

2. Run the Oh-My-AgentConnector runtime doctor routing check:

```bash
node bin.mjs doctor team-routing --plugin-dir "$(pwd)"
```

3. If the user asks for conflict analysis, or if the host is `claude-code`, run:

```bash
node bin.mjs doctor conflicts --plugin-dir "$(pwd)"
```

Conflict findings against a Claude-compatible home are warnings about local
legacy state unless the requested host is `claude-code`.

4. For OpenCode, add a no-model CLI smoke:

```bash
opencode mcp list
```

This checks actual MCP connectivity without invoking a model.

## Report Format

Return:

- chosen host
- host doctor result
- runtime doctor result
- OpenCode MCP smoke result when applicable
- any conflict warnings, clearly separated from host install failures
- exact command names a user can rerun
