---
description: ""
---

# OMAC project-session-manager

This compatibility command keeps `/oh-my-agent-connector:project-session-manager` available without loading the full `project-session-manager` skill description in every agent CLI session.

## Dispatch

1. Read the full bundled skill instructions from the active Oh-My-AgentConnector install: `skills/project-session-manager/SKILL.md`.
2. Follow that SKILL.md exactly, treating the user's arguments as:

```text
$ARGUMENTS
```

If the file is not directly readable from the current working directory, locate it under the active `CLAUDE_PLUGIN_ROOT`/`OMAC_PLUGIN_ROOT`, package root, or installed Oh-My-AgentConnector install directory, then continue.
