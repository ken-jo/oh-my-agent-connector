# Surface map — oh-my-claudecode → agent-connector

Maps every deployment surface of upstream OMC (`/home/ubuntu/workspace/github/oh-my-claudecode-upstream`,
v4.14.6, MIT, runtime dependency **by path** — nothing copied) onto agent-connector's
`defineConnector()` model (`/home/ubuntu/workspace/github/agent-connector`), following the proven
context-mode playbook (`/home/ubuntu/workspace/github/context-mode-with-agent-connector`, P1a hook-bridge).

Evidence basis (read, not assumed): `hooks/hooks.json`; `scripts/run.cjs`, `keyword-detector.mjs`,
`session-start.mjs`, `persistent-mode.mjs`, `pre-tool-enforcer.mjs`, `setup-init.mjs`, `lib/stdin.mjs`;
`.mcp.json` + `bridge/mcp-server.cjs` (run live in an isolated HOME); `.claude-plugin/plugin.json`;
frontmatter of `agents/executor.md`, `commands/ask.md`, `skills/autopilot/SKILL.md`;
agent-connector `src/core/types.ts`, `src/adapters/claude-code/index.ts`, `src/core/spawn.ts`,
`llms-full.txt` §2.3–2.4.

## 0. Inventory of what hooks.json actually wires

`hooks/hooks.json` declares **11 event keys**, **13 matcher groups**, **24 command entries**
(BASELINE.md's "12-event wiring" rounds this; the precise counts are these). Every command entry is
`node "$CLAUDE_PLUGIN_ROOT"/scripts/run.cjs "$CLAUDE_PLUGIN_ROOT"/scripts/<script>.mjs [args]` with a
per-entry `timeout` (3–60 s). `run.cjs` re-spawns the target `.mjs` with `process.execPath`,
`stdio: 'inherit'` (so stdin JSON flows through and stdout JSON flows back), re-reads `hooks.json` to
enforce the per-entry timeout, and heals stale `CLAUDE_PLUGIN_ROOT` plugin-cache paths.

Script stdin/stdout contract (verified in the four representative scripts):

- **stdin**: one JSON object — `{ session_id, cwd, prompt? | tool_name + tool_input | source? | trigger? | stop_hook_active? ... }`
  read via `lib/stdin.mjs` `readStdin()` (5 s timeout, returns `""` on hang — fail-open).
- **stdout**: one JSON object —
  - pass: `{"continue":true}` / `{"continue":true,"suppressOutput":true}`
  - inject: `{"continue":true,"hookSpecificOutput":{"hookEventName":"<Event>","additionalContext":"..."}}`
    (keyword-detector, session-start; session-start may also add top-level `systemMessage`)
  - deny (PreToolUse): `{"continue":..,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`
  - block (Stop): `{"decision":"block","reason":"..."}` (persistent-mode ralph/ultrawork loop)
- **env**: `CLAUDE_PLUGIN_ROOT` (root for `skills/`, `dist/`, `state` resolution), kill switches
  `DISABLE_OMC=1` / `OMC_SKIP_HOOKS=<csv>` / `OMC_TEAM_WORKER`, optional `CLAUDE_CONFIG_DIR`.
  Several scripts dynamically import `${CLAUDE_PLUGIN_ROOT}/dist/**` (prebuilt in upstream checkout).

## 1. Per-event mapping table

agent-connector normalized events (8): `SessionStart, SessionEnd, UserPromptSubmit, PreToolUse,
PostToolUse, PreCompact, Stop, Notification`. One `HookDefinition` per event per connector; the
claude-code adapter writes one settings-hook entry per event whose command is the universal
entrypoint `<home-bin> hook claude-code <Event> --connector <id>` (`buildHomeBinHookCommand`).

| # | OMC event + matcher | OMC script(s), in order (timeout s) | AC event (+matcher) | Bridge / fate |
|---|---|---|---|---|
| 1 | `UserPromptSubmit` `*` | `keyword-detector.mjs` (5), `skill-injector.mjs` (3) | `UserPromptSubmit` (no matcher) | **BRIDGED** — run both, concat `additionalContext` → `{decision:"context"}` |
| 2 | `SessionStart` `*` | `session-start.mjs` (5), `project-memory-session.mjs` (5), `wiki-session-start.mjs` (5) | `SessionStart` | **BRIDGED** — run all 3, concat `additionalContext`; `systemMessage` degraded (see residue 7) |
| 3 | `SessionStart` `init` | `setup-init.mjs` (30) | `SessionStart` (route on `evt.raw.source === "init"`) | **BRIDGED-DORMANT** — `init` is not a stock Claude source (`startup\|resume\|clear\|compact`); same dormancy as upstream |
| 4 | `SessionStart` `maintenance` | `setup-maintenance.mjs` (60) | `SessionStart` (route on `raw.source === "maintenance"`) | **BRIDGED-DORMANT** — ditto |
| 5 | `PreToolUse` `*` | `pre-tool-enforcer.mjs` (3) | `PreToolUse` (matcher omitted = all) | **BRIDGED** — script's `permissionDecision:"deny"` → `{decision:"deny",reason}`; adapter re-emits the identical Claude shape |
| 6 | `PermissionRequest` `Bash` | `permission-handler.mjs` (5) | — | **RESIDUE** — no AC event (see residue 1) |
| 7 | `PostToolUse` `*` | `post-tool-verifier.mjs` (3), `project-memory-posttool.mjs` (3), `post-tool-rules-injector.mjs` (3) | `PostToolUse` | **BRIDGED** — run all 3, concat `additionalContext` |
| 8 | `PostToolUseFailure` `*` | `post-tool-use-failure.mjs` (3) | — | **RESIDUE** — no AC event (see residue 2) |
| 9 | `SubagentStart` `*` | `subagent-tracker.mjs start` (3) | — | **RESIDUE** — no AC event (see residue 3) |
| 10 | `SubagentStop` `*` | `subagent-tracker.mjs stop` (5), `verify-deliverables.mjs` (5) | — | **RESIDUE** — no AC event (see residue 3) |
| 11 | `PreCompact` `*` | `pre-compact.mjs` (10), `project-memory-precompact.mjs` (5), `wiki-pre-compact.mjs` (3) | `PreCompact` | **BRIDGED** — context concat |
| 12 | `Stop` `*` | `context-guard-stop.mjs` (5), `persistent-mode.mjs` (10), `code-simplifier.mjs` (5) | `Stop` | **BRIDGED** — `{"decision":"block","reason"}` → `{decision:"deny",reason}`; **requires AC adapter fix** (risk R1) |
| 13 | `SessionEnd` `*` | `session-end.mjs` (30), `wiki-session-end.mjs` (30) | `SessionEnd` | **BRIDGED** — fire-and-forget (host ignores SessionEnd output) |

Coverage: **8/11 OMC event keys map** (9/13 matcher groups, 19/24 command entries). The 5 residual
command entries (`permission-handler`, `post-tool-use-failure`, `subagent-tracker start/stop`,
`verify-deliverables`) are enumerated in §4.

### The bridge mechanism (P1a idiom, one handler per AC event)

Each AC `HookDefinition.handler(evt)`:

1. **Re-serialize to Claude-shaped stdin JSON.** On `evt.hostPlatform === "claude-code"`, pass
   `evt.raw` through **verbatim** (it IS the original Claude payload — `parseEvent` keeps it).
   On other hosts, synthesize the minimal Claude shape from normalized fields:
   `{ session_id: evt.sessionId, cwd: evt.projectDir, hook_event_name, prompt, tool_name, tool_input, tool_response, source, trigger, stop_hook_active }`.
2. **Spawn each OMC script in upstream `hooks.json` order**, unchanged from the checkout:
   `node $OMC/scripts/run.cjs $OMC/scripts/<script>.mjs [args]`, env
   `{ ...process.env, CLAUDE_PLUGIN_ROOT: $OMC }` where
   `$OMC = /home/ubuntu/workspace/github/oh-my-claudecode-upstream`. Going through `run.cjs`
   preserves the per-script `hooks.json` timeout enforcement for free; stdin pipes through
   (`stdio:'inherit'`), stdout is captured by the bridge.
3. **Parse each script's stdout JSON → merge into one `HookResponse`:**
   - any `{"decision":"block"}` or `permissionDecision:"deny"` → `{decision:"deny", reason}` (deny wins);
   - `permissionDecision:"ask"` → `{decision:"ask", reason}`;
   - `hookSpecificOutput.additionalContext` values concatenated with `\n\n` → `{decision:"context", additionalContext}`;
   - `{"continue":true}` / `suppressOutput` / empty / unparseable → contributes nothing (fail-open,
     mirroring both OMC's own catch-all `{continue:true}` and AC's fail-open runtime contract).
4. Kill switches honored for free: the scripts themselves check `DISABLE_OMC` / `OMC_SKIP_HOOKS`,
   which pass through the bridge env untouched.

This replaces: 24 settings-hook command lines, `run.cjs`'s reason for existing on the install side
(AC's home-bin shim is the cross-platform runner), the installer's settings.json writers, and the
`hooks.json` manifest — while every byte of hook *logic* still executes from the upstream checkout.

## 2. MCP server

Upstream registration (`.claude-plugin/plugin.json` → `.mcp.json`): server **`t`**, command
`node ${CLAUDE_PLUGIN_ROOT}/bridge/mcp-server.cjs`.

**Verified standalone launch** (run live in an isolated `HOME`, mkdtemp):

```sh
node /home/ubuntu/workspace/github/oh-my-claudecode-upstream/bridge/mcp-server.cjs
```

- stdio MCP server; `serverInfo {"name":"t","version":"1.0.0"}`; **49 tools** in `tools/list`
  (lsp_*, ast_grep_*, notepad_*, project_memory_*, state_*, shared_memory_*, wiki_*, trace_*,
  python_repl, session_search, deepinit_manifest, list/load_omc_skills…).
- **Zero** references to `CLAUDE_PLUGIN_ROOT` inside the 28,786-line bundle — no env required.
  It self-bootstraps `NODE_PATH` from `npm root -g` (for optional native modules like
  `@ast-grep/napi`) and degrades gracefully when npm is absent.
- State tools resolve `.omc/` under cwd/HOME at call time, so isolated-home testing fully contains it.

`defineConnector` server block:

```js
server: {
  transport: "stdio",
  command: "node",
  args: [OMC + "/bridge/mcp-server.cjs"],
  tools: { include: ["*"] },   // 49 tools
}
```

This replaces `.mcp.json` + the plugin manifest's `mcpServers` pointer and gains: native MCP
registration on every AC target platform, telemetry wrapping (`serve`), and the doctor/status checks.

## 3. Content compilation plan (config-load time, zero copies kept in-repo)

A small loader in `agent-connector.config.mjs` reads the upstream checkout at config load and
compiles **128 files → 87 defs** (frontmatter shapes verified on samples):

| OMC source | Count | Frontmatter observed | → AC def | Mapping |
|---|---|---|---|---|
| `agents/*.md` | 19 | `name, description, model, level` | `SubagentDef` | `name`/`description`/`model` 1:1; body → `prompt`; `level` → `extra.level`. (Upstream plugin.json never lists agents — Claude auto-discovers `agents/`; AC writes `.claude/agents/<n>.md` and the native equivalent on 8 other platforms.) |
| `commands/*.md` | 28 | `description` (often `""`); `compact.md` adds more keys; body uses `$ARGUMENTS` | `CommandDef` | filename stem → `name`; body → `prompt`; extra fm keys → `argumentHint`/`tools`/`model`/`extra` |
| `skills/*/SKILL.md` | 40 | `name, description, argument-hint, level` | `SkillDef` | `name` (== dir, kebab ✓), `description` (≤1024 ✓), body; `argument-hint`+`level` → `extra` |
| skill resource files | 40 (omc-setup 4, project-session-manager 18, self-improve 12, writer-memory 6) | — | `SkillDef.resources` | relpath → file contents, written beside SKILL.md |
| `.claude-plugin/plugin.json` + `marketplace.json` | — | — | connector metadata | `id`/`displayName`/`version` in `defineConnector`; manifests retired |

Loader sketch: `readdir` + a 15-line frontmatter splitter (`---` fences, `key: value` pairs) — no
YAML dependency needed for these flat shapes. Validation is then enforced by `defineConnector`
(kebab names, non-empty prompts/descriptions, description length, resource-path safety).

What this buys: the same 87 surfaces land natively on claude-code (`.claude/{agents,commands,skills}`)
**and** on gemini-cli/cursor/codex/opencode/copilot/… per the platform table in llms-full.txt §2.4,
from one declaration — upstream's answer to this was entire sibling projects (oh-my-codex, oh-my-opencode).

## 4. Residue — what does NOT map (honest list)

1. **`PermissionRequest` (matcher `Bash`) → `permission-handler.mjs`.** Claude-only event fired when
   a permission prompt is about to show; AC's 8-event model has no equivalent. AC's PreToolUse
   `"ask"` decision is adjacent but fires at a different point and cannot auto-resolve an existing
   prompt. **Lost**: OMC's automatic allow/deny of permission dialogs.
2. **`PostToolUseFailure` → `post-tool-use-failure.mjs`.** No AC event. AC's `PostToolUseEvent` has
   an `isError?` field, but the claude-code adapter registers only `PostToolUse`, and Claude emits
   failures on a *separate* event AC never subscribes to. **Lost**: `[TOOL ERROR]` recovery-guidance
   injection.
3. **`SubagentStart` / `SubagentStop` → `subagent-tracker.mjs`, `verify-deliverables.mjs`.** No AC
   events. **Lost**: subagent lifecycle accounting and the deliverables-verification nudge on
   subagent exit. (Stop-event handlers still cover the main-agent loop, which is the load-bearing
   ralph/ultrawork path.)
4. **Statusline HUD.** OMC's `/hud` installs a `statusLine` command into settings.json
   (~8.5k-LOC installer territory). AC has no statusline surface on any platform. The HUD remains
   usable by running OMC's own setup manually; AC will not install/manage it.
5. **`CLAUDE.md` managed block.** OMC's installer maintains a marker-fenced orchestrator block in
   `~/.claude/CLAUDE.md`. AC has no memory-file surface. Partial substitute: the same text injected
   per-session via the SessionStart handler's `additionalContext` (model-visible, not file-persistent).
6. **Marketplace/plugin distribution UX.** `/plugin marketplace`, `enabledPlugins`, plugin-cache
   healing (`repair-plugin-cache.mjs`, `run.cjs` stale-root scan) are Claude-plugin-system concepts;
   AC replaces distribution with `install`/`upgrade`/`uninstall`/`doctor`. Not a behavior loss —
   a different (and host-agnostic) lifecycle.
7. **`systemMessage` (user-visible notices).** `session-start.mjs` emits top-level `systemMessage`
   (update notices). `HookResponse` has no user-channel field; folded into `additionalContext` or
   dropped. Cosmetic degradation.
8. **SessionStart `init`/`maintenance` matchers** are wired but reference sources stock Claude never
   emits; bridged behind `raw.source` routing they stay exactly as dormant as upstream — listed here
   for honesty, not as a loss.
9. **Per-entry parallelism/timeouts.** Upstream Claude runs each of the 24 hook commands as an
   independent entry; AC registers one entry per event and the bridge runs the scripts sequentially
   (per-script timeouts still enforced via `run.cjs`). Worst-case added wall-time: Stop chain
   5+10+5 s sequential vs parallel upstream.

## 5. Risks

- **R1 (must fix before P1 sign-off): Stop-block reply shape.** AC's claude-code
  `formatReply` renders every `deny` as `hookSpecificOutput.permissionDecision:"deny"`. For the
  `Stop` event Claude honors **top-level** `{"decision":"block","reason":...}` — i.e. ralph's
  persistence loop would silently stop blocking. agent-connector is ours; the adapter needs an
  event-aware deny path (Stop/UserPromptSubmit → top-level `decision:"block"`). Verify with a live
  isolated-home Stop-hook round trip.
- **R2: MCP tool-name prefix.** `mcp__t__*` (plugin install) becomes `mcp__<connector-id>__*`.
  Grep over agents/skills/commands found zero hard-coded `mcp__t__` references (they use bare names
  like `lsp_diagnostics`), so exposure is low; re-grep `src/hooks/**` during P2.
- **R3: cross-host hook fidelity.** OMC scripts read Claude-specific config
  (`getClaudeConfigDir()`, settings.json) and write `.omc/` state; on non-Claude hosts these
  branches no-op behind try/catch (fail-open by construction), but behavior on codex/gemini/etc. is
  "best effort" until verified — claim parity only for claude-code initially.
- **R4: `$ARGUMENTS` portability.** All 28 commands use Claude's `$ARGUMENTS` token; non-Claude
  command surfaces use different tokens (e.g. gemini TOML `{{args}}`). Confirm what AC's command
  writers translate; otherwise scope commands to claude-code via `platforms` overrides.
- **R5: skill resource fidelity.** `SkillDef.resources` carries string contents — the executable
  bit on `project-session-manager/psm.sh` is lost; any non-UTF-8 resource would need special-casing.
- **R6: live-machine safety.** The OMC marketplace plugin is LIVE in this machine's `~/.claude`.
  Installing the connector into the real home would double-fire every OMC hook. ALL install
  verification must run in an isolated HOME (mkdtemp + `HOME`/`USERPROFILE`/
  `AGENT_CONNECTOR_DATA_DIR` overrides), as in `agent-connector/tests/cli/doctor-targets.test.ts`;
  multi-platform checks `--dry-run` only.
- **R7: dist dependency.** Several hook scripts import `${CLAUDE_PLUGIN_ROOT}/dist/**`; the upstream
  checkout ships `dist/` prebuilt — pin the checkout SHA and never point `CLAUDE_PLUGIN_ROOT` at a
  dist-less clone.
