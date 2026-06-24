# Surface map — oh-my-agent-connector → agent-connector

Maps every deployment surface of upstream OMAC (`/home/ubuntu/workspace/github/oh-my-agent-connector`,
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
  `DISABLE_OMAC=1` / `OMAC_SKIP_HOOKS=<csv>` / `OMAC_TEAM_WORKER`, optional `CLAUDE_CONFIG_DIR`.
  Several scripts dynamically import `${CLAUDE_PLUGIN_ROOT}/dist/**` (prebuilt in upstream checkout).

## 1. Per-event mapping table

agent-connector normalized events (12 since the E1 extension): `SessionStart, SessionEnd,
UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, Stop, Notification, PermissionRequest,
PostToolUseFailure, SubagentStart, SubagentStop`. One `HookDefinition` per event per connector; the
claude-code adapter writes one settings-hook entry per event whose command is the universal
entrypoint `<home-bin> hook claude-code <Event> --connector <id>` (`buildHomeBinHookCommand`).

| # | OMAC event + matcher | OMAC script(s), in order (timeout s) | AC event (+matcher) | Bridge / fate |
|---|---|---|---|---|
| 1 | `UserPromptSubmit` `*` | `keyword-detector.mjs` (5), `skill-injector.mjs` (3) | `UserPromptSubmit` (no matcher) | **BRIDGED** — run both, concat `additionalContext` → `{decision:"context"}` |
| 2 | `SessionStart` `*` | `session-start.mjs` (5), `project-memory-session.mjs` (5), `wiki-session-start.mjs` (5) | `SessionStart` | **BRIDGED** — run all 3, concat `additionalContext`; `systemMessage` degraded (see residue 7) |
| 3 | `SessionStart` `init` | `setup-init.mjs` (30) | `SessionStart` (route on `evt.raw.source === "init"`) | **BRIDGED-DORMANT** — `init` is not a stock Claude source (`startup\|resume\|clear\|compact`); same dormancy as upstream |
| 4 | `SessionStart` `maintenance` | `setup-maintenance.mjs` (60) | `SessionStart` (route on `raw.source === "maintenance"`) | **BRIDGED-DORMANT** — ditto |
| 5 | `PreToolUse` `*` | `pre-tool-enforcer.mjs` (3) | `PreToolUse` (matcher omitted = all) | **BRIDGED** — script's `permissionDecision:"deny"` → `{decision:"deny",reason}`; adapter re-emits the identical Claude shape |
| 6 | `PermissionRequest` `Bash` | `permission-handler.mjs` (5) | `PermissionRequest` (matcher `Bash`) | **BRIDGED** — dedicated merge: `decision.behavior:"allow"` → `{decision:"allow"}` (active grant), `"deny"` → `{decision:"deny",reason}`, anything else → **no decision** (fall through to the native dialog; never an implied grant) — see residue 1 |
| 7 | `PostToolUse` `*` | `post-tool-verifier.mjs` (3), `project-memory-posttool.mjs` (3), `post-tool-rules-injector.mjs` (3) | `PostToolUse` | **BRIDGED** — run all 3, concat `additionalContext` |
| 8 | `PostToolUseFailure` `*` | `post-tool-use-failure.mjs` (3) | `PostToolUseFailure` | **BRIDGED** — recovery guidance `additionalContext` → `{decision:"context"}` (feedback-only; see residue 2) |
| 9 | `SubagentStart` `*` | `subagent-tracker.mjs start` (3) | `SubagentStart` | **BRIDGED** — tracker context → `{decision:"context"}` injected into the subagent's conversation (see residue 3) |
| 10 | `SubagentStop` `*` | `subagent-tracker.mjs stop` (5), `verify-deliverables.mjs` (5) | `SubagentStop` | **BRIDGED** — run both; advisory `additionalContext` concat; a `{"decision":"block"}` would map to `{decision:"deny"}` → top-level block (Stop semantics; see residue 3) |
| 11 | `PreCompact` `*` | `pre-compact.mjs` (10), `project-memory-precompact.mjs` (5), `wiki-pre-compact.mjs` (3) | `PreCompact` | **BRIDGED** — context concat |
| 12 | `Stop` `*` | `context-guard-stop.mjs` (5), `persistent-mode.mjs` (10), `code-simplifier.mjs` (5) | `Stop` | **BRIDGED** — `{"decision":"block","reason"}` → `{decision:"deny",reason}`; AC adapter fix landed (risk R1, resolved) |
| 13 | `SessionEnd` `*` | `session-end.mjs` (30), `wiki-session-end.mjs` (30) | `SessionEnd` | **BRIDGED** — fire-and-forget (host ignores SessionEnd output) |

Coverage: **11/11 OMAC event keys map** (13/13 matcher groups, **24/24 command entries**) since
agent-connector's E1 extension normalized `PermissionRequest` / `PostToolUseFailure` /
`SubagentStart` / `SubagentStop` (8 → 12 canonical events). The formerly-residual 5 command
entries (`permission-handler`, `post-tool-use-failure`, `subagent-tracker start/stop`,
`verify-deliverables`) are bridged; their history is kept in §4 (items 1–3, now resolved).

### The bridge mechanism (P1a idiom, one handler per AC event)

Each AC `HookDefinition.handler(evt)`:

1. **Re-serialize to Claude-shaped stdin JSON.** On `evt.hostPlatform === "claude-code"`, pass
   `evt.raw` through **verbatim** (it IS the original Claude payload — `parseEvent` keeps it).
   On other hosts, synthesize the minimal Claude shape from normalized fields:
   `{ session_id: evt.sessionId, cwd: evt.projectDir, hook_event_name, prompt, tool_name, tool_input, tool_response, source, trigger, stop_hook_active }`
   plus the E1-event fields where present: `permission_suggestions` (PermissionRequest), `error`,
   `tool_use_id`, `is_interrupt`, `duration_ms` (PostToolUseFailure), `agent_id`, `agent_type`,
   `agent_transcript_path`, `last_assistant_message` (SubagentStart/Stop).
2. **Spawn each OMAC script in upstream `hooks.json` order**, unchanged from the checkout:
   `node $OMAC/scripts/run.cjs $OMAC/scripts/<script>.mjs [args]`, env
   `{ ...process.env, CLAUDE_PLUGIN_ROOT: $OMAC }` where
   `$OMAC = /home/ubuntu/workspace/github/oh-my-agent-connector`. Going through `run.cjs`
   preserves the per-script `hooks.json` timeout enforcement for free; stdin pipes through
   (`stdio:'inherit'`), stdout is captured by the bridge.
3. **Parse each script's stdout JSON → merge into one `HookResponse`:**
   - any `{"decision":"block"}` or `permissionDecision:"deny"` → `{decision:"deny", reason}` (deny wins);
   - `permissionDecision:"ask"` → `{decision:"ask", reason}`;
   - `hookSpecificOutput.additionalContext` values concatenated with `\n\n` → `{decision:"context", additionalContext}`;
   - `{"continue":true}` / `suppressOutput` / empty / unparseable → contributes nothing (fail-open,
     mirroring both OMAC's own catch-all `{continue:true}` and AC's fail-open runtime contract).
   **Exception — PermissionRequest** uses a dedicated merge (`permissionBridge`): the scripts'
   `hookSpecificOutput.decision.behavior` maps `"deny"` → `{decision:"deny",reason}` /
   `"allow"` → `{decision:"allow"}` (+`updatedInput` passthrough), and EVERYTHING else (incl. the
   fail-open error path) returns **no decision**, so the bridge can never silently auto-grant a
   permission — falling through to the native dialog is the safe default here, not allow.
4. Kill switches honored for free: the scripts themselves check `DISABLE_OMAC` / `OMAC_SKIP_HOOKS`,
   which pass through the bridge env untouched.

This replaces: 24 settings-hook command lines, `run.cjs`'s reason for existing on the install side
(AC's home-bin shim is the cross-platform runner), the installer's settings.json writers, and the
`hooks.json` manifest — while every byte of hook *logic* still executes from the upstream checkout.

## 2. MCP server

Upstream registration (`.claude-plugin/plugin.json` → `.mcp.json`): server **`t`**, command
`node ${CLAUDE_PLUGIN_ROOT}/bridge/mcp-server.cjs`.

**Verified standalone launch** (run live in an isolated `HOME`, mkdtemp):

```sh
node /home/ubuntu/workspace/github/oh-my-agent-connector/bridge/mcp-server.cjs
```

- stdio MCP server; `serverInfo {"name":"t","version":"1.0.0"}`; **49 tools** in `tools/list`
  (lsp_*, ast_grep_*, notepad_*, project_memory_*, state_*, shared_memory_*, wiki_*, trace_*,
  python_repl, session_search, deepinit_manifest, list/load_omac_skills…).
- **Zero** references to `CLAUDE_PLUGIN_ROOT` inside the 28,786-line bundle — no env required.
  It self-bootstraps `NODE_PATH` from `npm root -g` (for optional native modules like
  `@ast-grep/napi`) and degrades gracefully when npm is absent.
- State tools resolve `.omac/` under cwd/HOME at call time, so isolated-home testing fully contains it.

`defineConnector` server block:

```js
server: {
  transport: "stdio",
  command: "node",
  args: [OMAC + "/bridge/mcp-server.cjs"],
  tools: { include: ["*"] },   // 49 tools
}
```

This replaces `.mcp.json` + the plugin manifest's `mcpServers` pointer and gains: native MCP
registration on every AC target platform, telemetry wrapping (`serve`), and the doctor/status checks.

## 3. Content compilation plan (config-load time, zero copies kept in-repo)

A small loader in `agent-connector.config.mjs` reads the upstream checkout at config load and
compiles **128 files → 87 defs** (frontmatter shapes verified on samples):

| OMAC source | Count | Frontmatter observed | → AC def | Mapping |
|---|---|---|---|---|
| `agents/*.md` | 19 | `name, description, model, level` | `SubagentDef` | `name`/`description`/`model` 1:1; body → `prompt`; `level` → `extra.level`. (Upstream plugin.json never lists agents — Claude auto-discovers `agents/`; AC writes `.claude/agents/<n>.md` and the native equivalent on 8 other platforms.) |
| `commands/*.md` | 28 | `description` (often `""`); `compact.md` adds more keys; body uses `$ARGUMENTS` | `CommandDef` | filename stem → `name`; body → `prompt`; extra fm keys → `argumentHint`/`tools`/`model`/`extra` |
| `skills/*/SKILL.md` | 40 | `name, description, argument-hint, level` | `SkillDef` | `name` (== dir, kebab ✓), `description` (≤1024 ✓), body; `argument-hint`+`level` → `extra` |
| skill resource files | 40 (omac-setup 4, project-session-manager 18, self-improve 12, writer-memory 6) | — | `SkillDef.resources` | relpath → file contents, written beside SKILL.md |
| `.claude-plugin/plugin.json` + `marketplace.json` | — | — | connector metadata | package identity/version in `package.json`; `defineConnector` only keeps explicit OMAC surfaces; manifests retired |

Loader sketch: `readdir` + a 15-line frontmatter splitter (`---` fences, `key: value` pairs) — no
YAML dependency needed for these flat shapes. Validation is then enforced by `defineConnector`
(kebab names, non-empty prompts/descriptions, description length, resource-path safety).

What this buys: the same 87 surfaces land natively on claude-code (`.claude/{agents,commands,skills}`)
**and** on gemini-cli/cursor/codex/opencode/copilot/… per the platform table in llms-full.txt §2.4,
from one declaration — without needing separate host-specific sibling projects for each agent CLI.

## 4. Residue — what does NOT map (honest list)

1. **RESOLVED — `PermissionRequest` (matcher `Bash`) → `permission-handler.mjs`.** Bridged since
   agent-connector's E1 extension added a normalized `PermissionRequest` event (cross-host, not
   Claude-only: codex/copilot-cli/qwen ship analogs). The bridge uses a DEDICATED merge because on
   this event an explicit `allow` is an ACTIVE grant that suppresses the dialog: whitelisted-safe
   commands surface as `decision{behavior:"allow"}`, everything else returns **no decision** and
   falls through to the native dialog. Verified live (isolated home): `git status` → allow grant;
   `rm -rf build` → fall-through.
2. **RESOLVED — `PostToolUseFailure` → `post-tool-use-failure.mjs`.** Bridged via the normalized
   `PostToolUseFailure` event (feedback-only: deny degrades to context). `[TOOL ERROR]`
   recovery-guidance injection restored — verified live (`additionalContext` beside the error).
3. **RESOLVED — `SubagentStart` / `SubagentStop` → `subagent-tracker.mjs`, `verify-deliverables.mjs`.**
   Bridged via the normalized subagent lifecycle events (matchers match agent type; `agent_type`
   treated as optional on stop — the tracker's own state compensates, exactly as upstream).
   Subagent lifecycle accounting + the deliverables-verification nudge restored — verified live
   (tracker context on start; advisory deliverables warning on stop with seeded team state).
4. **RESOLVED — Statusline HUD.** OMAC's `/hud` installs a `statusLine` command into settings.json.
   Bridged via agent-connector's 0.3.x **`configPatch`** surface (set-if-absent, ownership-tracked,
   claude-code v1): `platforms["claude-code"].configPatch` declares `statusLine =
   {type:"command", command:"node $OMAC/dist/hud/index.js"}`, pointing at the upstream checkout's
   PREBUILT HUD (same run-from-checkout idiom as the hooks/MCP — nothing copied). Verified live
   (isolated home): `<absent> → set` with a recorded ownership-ledger entry, the HUD renders a real
   status line, and `doctor` reports `configPatch statusLine — ok`. On the real machine — where the
   live OMAC plugin already owns a `statusLine` — the patch correctly **skip-warns** (never clobbers a
   key it doesn't own) and prints the manual-edit fallback. See VERIFICATION.md §8.
5. **RESOLVED — `CLAUDE.md` managed block.** OMAC's installer maintains a marker-fenced orchestrator
   block in `~/.claude/CLAUDE.md`. Bridged via agent-connector's 0.3.x **`memory`** surface: a
   `MemoryDef` compiled at load from upstream `docs/CLAUDE.md` (the OMAC:START/VERSION/END fence lines
   stripped — AC owns the boundary with its own hash-stamped markers). AC writes it to the file each
   host actually reads — **CLAUDE.md** (claude-code, which does NOT read AGENTS.md), **GEMINI.md**
   (gemini-cli), **AGENTS.md** (codex/opencode) — so this goes ONE BETTER than upstream, which
   could only ever write claude-code's CLAUDE.md. (cursor honestly **skip-warns**: "no user-scope
   memory file on cursor (user rules are app/UI-managed or undocumented)".) File-persistent now
   (not just per-session
   `additionalContext`). Verified live (isolated home): block created, content intact, `doctor`
   reports `memory block oh-my-agent-connector/orchestrator — intact`. See VERIFICATION.md §8.
6. **RESOLVED (driver) — Marketplace/plugin distribution UX.** Beyond the direct `install` path, the
   0.3.x **marketplace driver** (`install --method marketplace`) now redeploys the connector through
   the host's OWN plugin marketplace (claude-code/codex/gemini/antigravity), staging the bundle under
   `<dataRoot>/marketplace/<host>/` and running the host's native install command. Verified
   (dry-run): OMAC projects the full multi-host staging + registration plan; context-mode's run
   **refuses with a double-install guard** on every host where it is already installed DIRECTLY
   (duplicate hooks + MCP would corrupt telemetry) and skip-warns the not-yet-drivable cursor flow.
   The legacy plugin-cache healing concepts (`repair-plugin-cache.mjs`, `run.cjs` stale-root scan)
   remain Claude-plugin-system internals AC does not need.
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

- **R1 (RESOLVED): Stop-block reply shape.** AC's claude-code `formatReply` now has an event-aware
  deny path: `Stop` / `SubagentStop` / `UserPromptSubmit` / `PostToolUse` denies render as the
  top-level `{"decision":"block","reason":...}` Claude honors (PreToolUse keeps
  `permissionDecision`). Verified with a live isolated-home Stop round trip (VERIFICATION.md §4c)
  — ralph's persistence loop blocks correctly through the bridge.
- **R2: MCP tool-name prefix.** `mcp__t__*` (plugin install) becomes `mcp__<connector-id>__*`.
  Grep over agents/skills/commands found zero hard-coded `mcp__t__` references (they use bare names
  like `lsp_diagnostics`), so exposure is low; re-grep `src/hooks/**` during P2.
- **R3: cross-host hook fidelity.** OMAC scripts read Claude-specific config
  (`getClaudeConfigDir()`, settings.json) and write `.omac/` state; on non-Claude hosts these
  branches no-op behind try/catch (fail-open by construction), but behavior on codex/gemini/etc. is
  "best effort" until verified — claim parity only for claude-code initially.
- **R4: `$ARGUMENTS` portability.** All 28 commands use Claude's `$ARGUMENTS` token; non-Claude
  command surfaces use different tokens (e.g. gemini TOML `{{args}}`). Confirm what AC's command
  writers translate; otherwise scope commands to claude-code via `platforms` overrides.
- **R5: skill resource fidelity.** `SkillDef.resources` carries string contents — the executable
  bit on `project-session-manager/psm.sh` is lost; any non-UTF-8 resource would need special-casing.
- **R6: live-machine safety.** The OMAC marketplace plugin is LIVE in this machine's `~/.claude`.
  Installing the connector into the real home would double-fire every OMAC hook. ALL install
  verification must run in an isolated HOME (mkdtemp + `HOME`/`USERPROFILE`/
  `AGENT_CONNECTOR_DATA_DIR` overrides), as in `agent-connector/tests/cli/doctor-targets.test.ts`;
  multi-platform checks `--dry-run` only.
- **R7: dist dependency.** Several hook scripts import `${CLAUDE_PLUGIN_ROOT}/dist/**`; the upstream
  checkout ships `dist/` prebuilt — pin the checkout SHA and never point `CLAUDE_PLUGIN_ROOT` at a
  dist-less clone.
