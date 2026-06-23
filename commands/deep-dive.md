---
description: ""
---

# OMAC deep-dive

This compatibility command keeps `/oh-my-agent-connector:deep-dive` available without loading the full `deep-dive` skill description in every agent CLI session.

## Dispatch

1. Read the full bundled skill instructions from the active Oh-My-AgentConnector install: `skills/deep-dive/SKILL.md`.
2. Follow that SKILL.md exactly, treating the user's arguments as:

```text
$ARGUMENTS
```

If the file is not directly readable from the current working directory, locate it under the active `CLAUDE_PLUGIN_ROOT`/`OMAC_PLUGIN_ROOT`, package root, or installed Oh-My-AgentConnector install directory, then continue.
