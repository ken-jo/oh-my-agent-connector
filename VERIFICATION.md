# Verification log — isolated-home installs, live hook bridge, exact parity

All evidence from real runs on this machine (2026-06-11). **Safety honored:** the OMAC
marketplace plugin is LIVE in the real `~/.claude`, so every install/probe/hook run below
executed in an isolated home (`mkdtemp` → `/tmp/oh-my-agent-connector-verify-IUMqih`, with `HOME`,
`USERPROFILE`, `AGENT_CONNECTOR_DATA_DIR` overridden into it and a fake
`~/.claude/settings.json {}` for detection) — the same pattern as
`agent-connector/tests/cli/doctor-targets.test.ts`. Post-run audit: the real
`~/.claude.json` `mcpServers` has **no** omac entries and the only `agent-connector`
strings in the real `settings.json` are the pre-existing `--connector context-mode`
hooks (mtime predates this run). Multi-platform was `--dry-run` only.

## 1. Isolated install — `install --targets claude-code`

```
summary: 136 created, 0 updated, 0 removed, 0 skipped, 0 warning(s)   (exit 0)
```

Breakdown of the 136: 1 settings backup (`.agent-connector/backups/…-settings.json`)
+ 1 `mcpServers.oh-my-agent-connector` (`~/.claude.json`) + 7 hook events
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
| Hook events | 11 keys / 13 groups / 24 command entries | **11 settings.json events** (SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, Stop + the E1 four: PermissionRequest matcher `Bash`, PostToolUseFailure, SubagentStart, SubagentStop), one home-bin entry each; SessionStart `init`/`maintenance` matcher groups routed inside the handler on `raw.source` | **24/24 command entries bridged** (13/13 groups, 11/11 keys) since agent-connector's E1 8→12-event extension — live round-trips in §7 |
| Hook command shape | `node $CLAUDE_PLUGIN_ROOT/scripts/run.cjs …` ×24 | `"$HOME/.agent-connector/bin/agent-connector" hook claude-code <Event> --connector oh-my-agent-connector` ×7 | scripts still spawn through upstream `run.cjs` inside the bridge (timeouts preserved) |
| MCP server | plugin `.mcp.json` server `t` | `mcpServers.oh-my-agent-connector` in `~/.claude.json`, telemetry-wrapped: `agent-connector serve --connector oh-my-agent-connector … -- node <upstream>/bridge/mcp-server.cjs` with `CLAUDE_PLUGIN_ROOT` env | 49/49 tools (probe below) |
| Agents | 19 | 19 (`.claude/agents/*.md`) | 19/19 |
| Skills | 40 SKILL.md + 40 resources | 40 + 40 (`.claude/skills/**`) | 80/80 |
| Commands | 28 | 28 (`.claude/commands/*.md`) | 28/28 |

## 3. Live MCP probe — `doctor --probe --targets claude-code`

```
[pass] oh-my-agent-connector: MCP initialize — serverInfo t@1.0.0, protocol 2025-11-25
[pass] oh-my-agent-connector: capabilities — tools
[pass] oh-my-agent-connector: ping — alive
[pass] oh-my-agent-connector: tools/list — 49 tool(s)
doctor: 94 pass, 0 fail, exit 0
```

The unchanged upstream `bridge/mcp-server.cjs` initialized **through the telemetry
wrapper** and listed all 49 tools. (An unscoped `doctor` after step 5 correctly
red-flagged the fake codex/opencode/gemini homes where nothing was installed —
dry-run hosts; expected, not a defect.)

## 4. Live hook bridge — Claude-shaped events through the installed home-bin runtime

All runs used the exact command installed in settings.json, with OMAC state pinned
into the sandbox (`OMAC_STATE_DIR=$SB/omac-state`, `CLAUDE_CONFIG_DIR=$SB/.claude`,
cwd `$SB/project`). Containment audit: every write landed under
`$SB/omac-state/**` or `$SB/project/.omac/**`; nothing outside the sandbox.

**4a. UserPromptSubmit** — stdin `{"hook_event_name":"UserPromptSubmit","prompt":"ralph please fix the build",…}`:

```json
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":
 "[MAGIC KEYWORD: RALPH]\n\nSkill routing detected: ralph\nPreferred invocation:
  /oh-my-agent-connector:ralph\n…IMPORTANT: Start the ralph workflow immediately.…"}}
```

Upstream `keyword-detector.mjs` + `skill-injector.mjs` ran unchanged; the keyword
detector even activated ralph/ultrawork mode state files — inside the sandbox
(`$SB/omac-state/project-…/state/sessions/verify-ups-1/{ralph,ultrawork}-state.json`).

**4b. SessionStart** — first attempt returned allow with a faithful relay of
upstream's guard (`[OMAC] session-start: refusing to use cwd … as workspace anchor
(no .omac-workspace or .git marker)` on stderr). After `git init` in the sandbox
project (a real workspace, as upstream requires):

```json
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":
 "<system-reminder>\n[OMAC] HUD not configured (HUD script missing). Run /hud setup
  then restart Claude Code.\n</system-reminder>"}}
```

OMAC context injection bridged back (124 chars; the HUD notice is what a fresh
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
| codex | 134 | `mcp_servers.oh-my-agent-connector` → `~/.codex/config.toml` | 6 events → `~/.codex/hooks.json` (SessionStart, PreToolUse, PostToolUse, PreCompact, UserPromptSubmit, Stop) | 127 (28 → `prompts/`, agents, skills) |
| opencode | 129 | `mcp.oh-my-agent-connector` → `opencode.json` | 1 plugin module (SessionStart, PreToolUse, PostToolUse; module notes unsupported: SessionEnd, UserPromptSubmit, PreCompact, Stop) | 127 |
| gemini-cli | 134 (+1 warn) | `mcpServers.oh-my-agent-connector` → `~/.gemini/settings.json` | 6 events (SessionStart, SessionEnd, BeforeAgent, BeforeTool, AfterTool, PreCompress); `warn: Stop has no Gemini CLI hook equivalent — skipped` | 127 |

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
consequence: OMAC's ralph block crossed the bridge intact but the adapter emitted a
Stop reply Claude will ignore — the boulder would silently stop rolling. Fix sketch
(not applied): make the deny branch event-aware — for `Stop` emit
`{"decision":"block","reason":response.reason}`; keep `permissionDecision` for
`PreToolUse`. Needs an adapter unit test pinning both shapes.

No other agent-connector defects surfaced: empty-stdout SessionStart was upstream's
own workspace-anchor guard (faithful relay), the unscoped-doctor failures were
correct target accounting, and install's warn→exit-1 is documented behavior.

**R1 RESOLUTION (2026-06-11):** the adapter fix landed in agent-connector
(`fix(claude-code): event-aware deny — Stop/UserPromptSubmit/PostToolUse need
top-level block`, extended to SubagentStop by the E1 commit): denies on
Stop-class events now render as the top-level `{"decision":"block","reason"}`
Claude honors, with unit tests pinning both shapes
(`tests/adapters/claude-deny-shapes.test.ts`).

## 7. E1 re-verification — the last 4 hooks live (2026-06-11)

agent-connector's E1 extension normalized **PermissionRequest /
PostToolUseFailure / SubagentStart / SubagentStop** (8 → 12 canonical events),
and the connector now bridges all 24/24 upstream command entries. Fresh
isolated home (`mkdtemp` → `/tmp/oh-my-agent-connector-e1-YX9Za2`, same
HOME/USERPROFILE/AGENT_CONNECTOR_DATA_DIR/CLAUDE_CONFIG_DIR/OMAC_STATE_DIR
overrides, `git init`-ed project for the workspace anchor):

**Install:** `install --targets claude-code` → `140 created, 0 warnings`
(136 before + the 4 new hook events). `settings.json` now wires **11 event
keys** — asserted by parsing the file: `SessionStart, SessionEnd,
UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, Stop,
PermissionRequest (matcher "Bash"), PostToolUseFailure, SubagentStart,
SubagentStop`. Idempotent re-run: `1 created (new backup), 139 skipped,
0 warnings`.

**Live round-trips** (the exact installed home-bin command, stdin = Claude-shaped
JSON, cwd = sandbox project):

- **PermissionRequest, whitelisted-safe** — `tool_input.command = "git status"`:

  ```json
  {"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}
  ```

  upstream `permission-handler.mjs`'s active grant crossed the bridge in
  Claude's nested `decision{behavior}` envelope (exit 0).

- **PermissionRequest, non-whitelisted** — `"rm -rf build"`: exit 0 with **no
  stdout** — no decision emitted, so Claude falls through to the native
  permission dialog. The bridge's dedicated merge can never auto-grant: only an
  explicit `decision.behavior:"allow"` from the script produces a grant; every
  other outcome (including bridge errors) falls through.

- **PostToolUseFailure** — failed `Bash` with `error: "make: *** No targets…"`:

  ```json
  {"hookSpecificOutput":{"hookEventName":"PostToolUseFailure","additionalContext":"Tool \"Bash\" failed. Analyze the error, fix the issue, and continue working."}}
  ```

  upstream's recovery guidance injected beside the error (feedback-only shape).

- **SubagentStart** — `agent_id: "agent-e1-1", agent_type: "executor"`:

  ```json
  {"hookSpecificOutput":{"hookEventName":"SubagentStart","additionalContext":"Agent executor started (agent-e1-1)"}}
  ```

  `subagent-tracker.mjs start` ran and its context lands in the SUBAGENT's
  conversation.

- **SubagentStop, clean** — tracker stop + `verify-deliverables.mjs`: exit 0,
  no output (clean pass; both scripts returned
  `{continue:true, suppressOutput:true}`).

- **SubagentStop, with seeded deliverables state** — `deliverables.json`
  (`{"plan":{"files":["docs/plan.md"]}}`) + session `team-state.json`
  (`current_phase:"plan"`) seeded into the sandbox OMAC state root:

  ```json
  {"hookSpecificOutput":{"hookEventName":"SubagentStop","additionalContext":"[OMAC] Deliverable verification for stage \"plan\":\n1 issue(s) found:\n  - docs/plan.md: file not found\nThese deliverables may be expected by the next stage."}}
  ```

  the advisory deliverables nudge is back, end-to-end.

Telemetry recorded every new event in the sandbox NDJSON (`telemetry report`:
PermissionRequest ×2, PostToolUseFailure ×1, SubagentStart ×1, SubagentStop ×2).
Containment re-audited: real `~/.claude.json` has no omac `mcpServers` entries
and the only `oh-my-agent-connector` string in the real `settings.json` is the
pre-existing marketplace `enabledPlugins` entry (mtime predates the run).

## 8. New 0.3.x surfaces — memory + configPatch + marketplace (2026-06-14)

Re-verified at the current agent-connector baseline (**0.3.1**), closing surface-map
residues §4-4 (statusline HUD), §4-5 (CLAUDE.md block) and §4-6 (marketplace). Fresh
isolated home (`mkdtemp` → `/tmp/oh-my-agent-connector-surfaces-…`, same
HOME/USERPROFILE/CLAUDE_CONFIG_DIR/AGENT_CONNECTOR_DATA_DIR overrides, seeded empty
`~/.claude/settings.json {}`).

**Install** — `install --targets claude-code` → **`142 created, 0 warnings`** (the 140 of
§7 + the two new surfaces, each on its create path):

```
+ memory: created CLAUDE.md with block oh-my-agent-connector/orchestrator (hash 0651f16a2c92)
+ configPatch statusLine: <absent> → {"type":"command","command":"node $OMAC/dist/hud/index.js"}
```

- **memory** — `~/.claude/CLAUDE.md` written (3830 B), exactly one
  `agent-connector:begin oh-my-agent-connector/orchestrator` / `:end` marker pair, the upstream
  heading `# oh-my-agent-connector - Intelligent Multi-Agent Orchestration` inside it, and the
  upstream `OMAC:START` fence stripped (0 hits). Compiled at load from `$OMAC/docs/CLAUDE.md`.
  Per-host target verified by dry-run: `claude-code → CLAUDE.md`, `gemini-cli → GEMINI.md`,
  `codex/opencode → AGENTS.md`; `cursor` honestly skip-warns ("no user-scope memory file …
  app/UI-managed or undocumented").
- **configPatch** — `settings.json.statusLine` set to the HUD command; ownership ledger at
  `<dataRoot>/state/config-patches.json` records `prior.present:false` + the connector as
  owner + a value hash. Piping a Claude-shaped status payload to `node $OMAC/dist/hud/index.js`
  renders a real status line.

**Idempotent re-run:** `1 created (new backup), 141 skipped, 0 warnings` — both new surfaces
skip cleanly (memory block hash-matches; configPatch already-owned-and-unchanged).

**`doctor --probe --targets claude-code`:** all checks passed, including the two new health
checks:

```
[pass] Claude Code: memory block oh-my-agent-connector/orchestrator — intact in …/.claude/CLAUDE.md
[pass] Claude Code: configPatch statusLine — ok — statusLine = {"type":"command","command":"node $OMAC/dist/hud/index.js"}
[pass] oh-my-agent-connector: tools/list — 49 tool(s)
```

**Real-home safety (re-audited):** the real `~/.claude/CLAUDE.md` has **no** orchestrator
block, and the real `settings.json.statusLine` is **unchanged** (still the live OMAC plugin's
`node …/hud/omac-hud.mjs`). A dry-run against the real home proved the ownership contract in
the other direction: `configPatch statusLine skipped: already set … (not created by
agent-connector)` — AC refuses to clobber a key it does not own.

**Marketplace method** — `install --method marketplace --dry-run`:

- **OMAC:** `481 created` planned — bundle staged per drivable host under
  `~/.agent-connector/marketplace/<host>/oh-my-agent-connector/**` + the host-native registration
  command (e.g. `gemini extensions install … --consent`).
- **context-mode** (sibling port, already installed DIRECTLY on the real machine): `0 created,
  4 warn + 1 skip` — the driver **refuses the marketplace install on every host where a direct
  install exists** ("both at once duplicates hooks + the MCP server and corrupts telemetry")
  and skip-warns the not-yet-drivable cursor flow. The double-install guard works.

## Score card

| Check | Result |
|---|---|
| Isolated install (claude-code) | pass — 136 created (140 with the E1 four), idempotent re-runs clean |
| Parity | **24/24 hook entries bridged (11/11 keys)**; MCP 49/49; content 127/127 |
| doctor --probe | pass — 94/94, server `t@1.0.0`, 49 tools via telemetry wrapper |
| Live hook bridge | pass — UserPromptSubmit (ralph keyword), SessionStart (context), Stop (state 1→2), PermissionRequest (allow + fall-through), PostToolUseFailure (guidance), SubagentStart (context), SubagentStop (clean + deliverables nudge) |
| Multi-platform dry-run | 397 planned writes across codex/opencode/gemini-cli, 1 honest warn |
| New 0.3.x surfaces (§8) | pass — install 142/0; memory CLAUDE.md block intact, configPatch statusLine ok (+ownership ledger), HUD renders; idempotent; marketplace driver plan + double-install guard |
| Real home untouched | confirmed — no omac entries; no orchestrator block; statusLine still the live plugin's; only pre-existing context-mode hooks |


## OpenCode real-host proof — 2026-06-23

See [OPENCODE_PROOF.md](./OPENCODE_PROOF.md). Real OpenCode 1.17.0 user install passed: 113 created, 18 updated, 0 warnings; mcp.oh-my-agent-connector registered; plugin module present; commands/skills/subagents/memory present; MCP probe initialize/ping/tools-list passed with 49 tools. The explain matrix honestly reports OpenCode SessionStart as degraded and unsupported events as dropped.


### OpenCode CLI MCP-list smoke

`opencode mcp list` on the real OpenCode CLI reports `oh-my-agent-connector` as connected via the agent-connector serve command. This is a no-model headless smoke of OpenCode's installed MCP registry.
