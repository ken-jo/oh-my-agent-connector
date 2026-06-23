---
description: ""
---

# Oh-My-AgentConnector Doctor

This branded command dispatches to the bundled `oh-my-agent-connector-doctor` skill so users can run an Oh-My-AgentConnector doctor flow without using the legacy OMAC name.

## Dispatch

1. Read the full bundled skill instructions from the active Oh-My-AgentConnector install: `skills/oh-my-agent-connector-doctor/SKILL.md`.
2. Follow that SKILL.md exactly, treating the user's arguments as:

```text
$ARGUMENTS
```

If the file is not directly readable from the current working directory, locate it under the active `CLAUDE_PLUGIN_ROOT`/`OMAC_PLUGIN_ROOT`, package root, or installed Oh-My-AgentConnector plugin directory, then continue.
