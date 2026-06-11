# Verification log — isolated-home installs, live hook bridge, exact parity

All evidence from real runs on this machine (2026-06-11). **Safety honored:** the OMC
marketplace plugin is LIVE in the real `~/.claude`, so every install/probe/hook run below
executed in an isolated home (`mkdtemp` → `/tmp/omc-ac-verify-IUMqih`, with `HOME`,
`USERPROFILE`, `AGENT_CONNECTOR_DATA_DIR` overridden into it and a fake
`~/.claude/settings.json {}` for detection) — the same pattern as
`agent-connector/tests/cli/doctor-targets.test.ts`. Post-run audit: the real
`~/.claude.json` `mcpServers` has **no** omc entries and the only `agent-connector`
strings in the real `settings.json` are the pre-existing `--connector context-mode`
hooks (mtime predates this run). Multi-platform was `--dry-run` only.

## 1. Isolated install — `install --targets claude-code`

```
summary: 136 created, 0 updated, 0 removed, 0 skipped, 0 warning(s)   (exit 0)
```

Breakdown of the 136: 1 settings backup (`.agent-connector/backups/…-settings.json`)
+ 1 `mcpServers.oh-my-claudecode` (`~/.claude.json`) + 7 hook events
(`~/.claude/settings.json`) + **127 content files** (19 agents + 28 commands +
40 SKILL.md + 40 skill resources).

Idempotent re-run: `1 created (new timestamped backup), 0 updated, 135 skipped,
0 warnings, exit 0` — every hook/mcp/content artifact reported
`skip: … already registered`.

## 2. Parity vs the real marketplace plugin — exact counts

Upstream `hooks/hooks.json` wires **11 event keys / 13 matcher groups / 24 command
entries** (BASELINE.md's "12-event" rounds this; precise counts per
`docs/surface-map.md` §0).

| Surface | Marketplace plugin | This install | Parity |
|---|---|---|---|
| Hook events | 11 keys / 13 groups / 24 command entries | **7 settings.json events** (SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, Stop), one home-bin entry each; SessionStart `init`/`maintenance` matcher groups routed inside the handler on `raw.source` | **19/24 command entries bridged** (9/13 groups, 8/11 keys). Residue (5 entries, no AC event): `permission-handler`, `post-tool-use-failure`, `subagent-tracker start/stop`, `verify-deliverables` |
| Hook command shape | `node $CLAUDE_PLUGIN_ROOT/scripts/run.cjs …` ×24 | `"$HOME/.agent-connector/bin/agent-connector" hook claude-code <Event> --connector oh-my-claudecode` ×7 | scripts still spawn through upstream `run.cjs` inside the bridge (timeouts preserved) |
| MCP server | plugin `.mcp.json` server `t` | `mcpServers.oh-my-claudecode` in `~/.claude.json`, telemetry-wrapped: `agent-connector serve --connector oh-my-claudecode … -- node <upstream>/bridge/mcp-server.cjs` with `CLAUDE_PLUGIN_ROOT` env | 49/49 tools (probe below) |
| Agents | 19 | 19 (`.claude/agents/*.md`) | 19/19 |
| Skills | 40 SKILL.md + 40 resources | 40 + 40 (`.claude/skills/**`) | 80/80 |
| Commands | 28 | 28 (`.claude/commands/*.md`) | 28/28 |

## 3. Live MCP probe — `doctor --probe --targets claude-code`

```
[pass] oh-my-claudecode: MCP initialize — serverInfo t@1.0.0, protocol 2025-11-25
[pass] oh-my-claudecode: capabilities — tools
[pass] oh-my-claudecode: ping — alive
[pass] oh-my-claudecode: tools/list — 49 tool(s)
doctor: 94 pass, 0 fail, exit 0
```

The unchanged upstream `bridge/mcp-server.cjs` initialized **through the telemetry
wrapper** and listed all 49 tools. (An unscoped `doctor` after step 5 correctly
red-flagged the fake codex/opencode/gemini homes where nothing was installed —
dry-run hosts; expected, not a defect.)

## 4. Live hook bridge — Claude-shaped events through the installed home-bin runtime

All runs used the exact command installed in settings.json, with OMC state pinned
into the sandbox (`OMC_STATE_DIR=$SB/omc-state`, `CLAUDE_CONFIG_DIR=$SB/.claude`,
cwd `$SB/project`). Containment audit: every write landed under
`$SB/omc-state/**` or `$SB/project/.omc/**`; nothing outside the sandbox.

**4a. UserPromptSubmit** — stdin `{"hook_event_name":"UserPromptSubmit","prompt":"ralph please fix the build",…}`:

```json
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":
 "[MAGIC KEYWORD: RALPH]\n\nSkill routing detected: ralph\nPreferred invocation:
  /oh-my-claudecode:ralph\n…IMPORTANT: Start the ralph workflow immediately.…"}}
```

Upstream `keyword-detector.mjs` + `skill-injector.mjs` ran unchanged; the keyword
detector even activated ralph/ultrawork mode state files — inside the sandbox
(`$SB/omc-state/project-…/state/sessions/verify-ups-1/{ralph,ultrawork}-state.json`).

**4b. SessionStart** — first attempt returned allow with a faithful relay of
upstream's guard (`[OMC] session-start: refusing to use cwd … as workspace anchor
(no .omc-workspace or .git marker)` on stderr). After `git init` in the sandbox
project (a real workspace, as upstream requires):

```json
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":
 "<system-reminder>\n[OMC] HUD not configured (HUD script missing). Run /hud setup
  then restart Claude Code.\n</system-reminder>"}}
```

OMC context injection bridged back (124 chars; the HUD notice is what a fresh
HUD-less home legitimately injects).

**4c. Stop (bonus — the R1 live round trip)** — with an active
`ralph-state.json` (iteration 1/100) in the sandbox project, stdin
`{"hook_event_name":"Stop","stop_hook_active":false,…}`:

```json
{"hookSpecificOutput":{"hookEventName":"Stop","permissionDecision":"deny",
 "permissionDecisionReason":"[RALPH LOOP - ITERATION 2/100] Work is NOT done.
  Continue working.…Task: fix the build"}}
```

The bridge worked end-to-end: `persistent-mode.mjs` ran, **iterated the state file
1→2 on disk**, and its `{"decision":"block"}` surfaced as a deny. See §6/R1 for why
this *shape* is wrong for Stop.

Telemetry recorded every bridged event in the sandbox NDJSON
(`telemetry report`: SessionStart ×2, UserPromptSubmit ×1, Stop ×1 — 713 tokens est.).

## 5. Multi-platform plan — `install --dry-run --targets codex,opencode,gemini-cli`

Fake hosts added in the sandbox first (`~/.codex/`, `~/.config/opencode/opencode.json`,
`~/.gemini/settings.json`). Dry-run plan (nothing written):

```
summary: 397 created, 0 updated, 0 removed, 0 skipped, 1 warning(s)
```

| Host | Planned writes | MCP | Hooks | Content |
|---|---:|---|---|---|
| codex | 134 | `mcp_servers.oh-my-claudecode` → `~/.codex/config.toml` | 6 events → `~/.codex/hooks.json` (SessionStart, PreToolUse, PostToolUse, PreCompact, UserPromptSubmit, Stop) | 127 (28 → `prompts/`, agents, skills) |
| opencode | 129 | `mcp.oh-my-claudecode` → `opencode.json` | 1 plugin module (SessionStart, PreToolUse, PostToolUse; module notes unsupported: SessionEnd, UserPromptSubmit, PreCompact, Stop) | 127 |
| gemini-cli | 134 (+1 warn) | `mcpServers.oh-my-claudecode` → `~/.gemini/settings.json` | 6 events (SessionStart, SessionEnd, BeforeAgent, BeforeTool, AfterTool, PreCompress); `warn: Stop has no Gemini CLI hook equivalent — skipped` | 127 |

Exit code 1 is by design: `src/cli/commands/install.ts:54` returns 1 whenever any
plan entry is a `warn` — here exactly the one honest gemini Stop gap.

This is the "platforms gained" evidence: upstream's answer to one extra CLI was an
entire sibling project (oh-my-codex, oh-my-opencode); here three more hosts are one
`--targets` flag against the same `defineConnector()`.

## 6. agent-connector defects — diagnosed, NOT fixed (per phase mandate)

**R1 (confirmed live, blocking for ralph/ultrawork persistence on claude-code):**
`src/adapters/claude-code/index.ts:726-739` — `formatReply` renders **every**
`deny` as `hookSpecificOutput.permissionDecision:"deny"`. Claude Code only honors
`permissionDecision` on PreToolUse; for **Stop** (and SubagentStop/UserPromptSubmit)
it honors top-level `{"decision":"block","reason":…}`. §4c shows the live
consequence: OMC's ralph block crossed the bridge intact but the adapter emitted a
Stop reply Claude will ignore — the boulder would silently stop rolling. Fix sketch
(not applied): make the deny branch event-aware — for `Stop` emit
`{"decision":"block","reason":response.reason}`; keep `permissionDecision` for
`PreToolUse`. Needs an adapter unit test pinning both shapes.

No other agent-connector defects surfaced: empty-stdout SessionStart was upstream's
own workspace-anchor guard (faithful relay), the unscoped-doctor failures were
correct target accounting, and install's warn→exit-1 is documented behavior.

## Score card

| Check | Result |
|---|---|
| Isolated install (claude-code) | pass — 136 created, idempotent re-run clean |
| Parity | 19/24 hook entries bridged (5 residue, enumerated); MCP 49/49; content 127/127 |
| doctor --probe | pass — 94/94, server `t@1.0.0`, 49 tools via telemetry wrapper |
| Live hook bridge | pass — UserPromptSubmit (ralph keyword), SessionStart (context), Stop (state 1→2) |
| Multi-platform dry-run | 397 planned writes across codex/opencode/gemini-cli, 1 honest warn |
| Real home untouched | confirmed — no omc entries; only pre-existing context-mode hooks |
