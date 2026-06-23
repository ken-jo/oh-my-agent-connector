---
name: setup
description: Use first for install/update routing — sends setup, doctor, or MCP requests to the correct OMAC setup flow
level: 2
---

# Setup

Use `/oh-my-agent-connector:setup` as the unified setup/configuration entrypoint.

## Usage

```bash
/oh-my-agent-connector:setup                # full setup wizard
/oh-my-agent-connector:setup doctor         # installation diagnostics
/oh-my-agent-connector:setup mcp            # MCP server configuration
/oh-my-agent-connector:setup wizard --local # explicit wizard path
```

## Routing

Process the request by the **first argument only** so install/setup questions land on the right flow immediately:

- No argument, `wizard`, `local`, `global`, or `--force` -> route to `/oh-my-agent-connector:omac-setup` with the same remaining args
- `doctor` -> route to `/oh-my-agent-connector:omac-doctor` with everything after the `doctor` token
- `mcp` -> route to `/oh-my-agent-connector:mcp-setup` with everything after the `mcp` token

Examples:

```bash
/oh-my-agent-connector:setup --local          # => /oh-my-agent-connector:omac-setup --local
/oh-my-agent-connector:setup doctor --json    # => /oh-my-agent-connector:omac-doctor --json
/oh-my-agent-connector:setup mcp github       # => /oh-my-agent-connector:mcp-setup github
```

## Notes

- `/oh-my-agent-connector:omac-setup`, `/oh-my-agent-connector:omac-doctor`, and `/oh-my-agent-connector:mcp-setup` remain valid compatibility entrypoints.
- Prefer `/oh-my-agent-connector:setup` in new documentation and user guidance.

Task: {{ARGUMENTS}}
