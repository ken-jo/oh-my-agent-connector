---
description: "Prepare OMAC context for a manual host /compact handoff."
argument-hint: "[optional compaction note]"
---

# OMAC Manual Context Compaction Helper

This command intentionally uses the plugin-scoped name `/oh-my-agent-connector:compact` instead of the bare `/compact` command. Bare `/compact` is reserved for the host CLI native compaction command and must not be shadowed by OMAC.

OMAC cannot invoke a host CLI's built-in `/compact` from a plugin command: `/compact` is a native slash command, not a prompt skill, and a prompt-skill call for `compact` is not a supported handoff. This helper is instruction-only and must not claim that OMAC triggers compaction itself.

## Dispatch

1. Treat this as a request to prepare for manual host conversation compaction. Do not create a separate OMAC summarizer and do not replace existing auto-compress behavior.
2. Preserve any user note for the compaction request:

```text
$ARGUMENTS
```

3. Tell the user to run the host CLI's built-in bare `/compact` command directly. If the note above is non-empty, tell them to include it with `/compact`.
4. Before handing off, remind the user that the host's normal `PreCompact` lifecycle should run OMAC's existing pre-compact hooks (`pre-compact`, project memory, and wiki preservation) when the native compaction occurs.
5. Do not invoke a `compact` skill, do not attempt to call `/compact` on the user's behalf, and do not manually summarize the session.

## User-facing handoff

Use this wording, adapting only the note text:

```text
OMAC prepared the compaction context, but plugin commands cannot trigger the host CLI's native /compact directly. Run this as a bare host command now:

/compact $ARGUMENTS

Bare /compact remains the host CLI's native command; OMAC does not shadow or invoke it.
```
