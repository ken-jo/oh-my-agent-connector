// oh-my-claudecode (OMC, MIT, ★36k), redeployed through agent-connector.
//
// OMC functionality runs UNCHANGED — every hook script, the MCP server bundle,
// and all 128 content files execute/compile straight from the upstream checkout
// (a runtime dependency BY PATH; nothing is copied into this repo). Only the
// deployment plumbing is replaced by this one defineConnector():
//
//   - src/installer/**            8,543 LOC  (settings.json/marketplace writers)
//   - scripts/* hook entrypoints 12,174 LOC  (44 entrypoints + run.cjs runner)
//   - hooks/hooks.json              212 lines (12-event wiring manifest)
//   - .claude-plugin/plugin.json + .mcp.json  70 lines (manifests)
//
// Mapping evidence + the honest residue list (statusline HUD, CLAUDE.md
// block, systemMessage) live in docs/surface-map.md. This is the same P1a
// hook-bridge idiom proven by the context-mode migration
// (/home/ubuntu/workspace/github/context-mode-with-agent-connector).
//
// RESOLVED (surface-map R1): agent-connector's claude-code formatReply now has
// an event-aware deny path (Stop/SubagentStop/UserPromptSubmit/PostToolUse →
// top-level {"decision":"block"}), verified with a live isolated-home Stop
// round trip — see VERIFICATION.md.
//
// RESOLVED (surface-map §4 hook residue): agent-connector's E1 extension
// normalized PermissionRequest / PostToolUseFailure / SubagentStart /
// SubagentStop (8 → 12 canonical events), so ALL 11 of upstream's hooks.json
// event keys (24/24 command entries) now route through this connector.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { defineConnector } from "@ken-jo/agent-connector";

/** Root of the upstream OMC checkout (pinned, ships prebuilt dist/ — R7). */
const OMC = "/home/ubuntu/workspace/github/oh-my-claudecode-upstream";

/** OMC's own cross-platform hook runner — kept because going through it
 *  preserves upstream's per-script hooks.json timeout enforcement for free. */
const RUN_CJS = join(OMC, "scripts", "run.cjs");

// ───────────────────────────────────────────────────────────────────────────
// P1a hook bridge — one thin handler per agent-connector event that
// re-serializes the normalized event into the Claude-shaped stdin JSON the
// unchanged OMC scripts expect, spawns them in upstream hooks.json order, and
// folds their stdout JSON back into one normalized HookResponse. Fail-open
// everywhere (OMC's own catch-all is {"continue":true}; AC's runtime contract
// is fail-open too).
// ───────────────────────────────────────────────────────────────────────────

/**
 * Build the Claude-shaped stdin payload for the OMC scripts.
 * On claude-code, evt.raw IS the original Claude payload — pass it verbatim.
 * On other hosts, synthesize the minimal shape from normalized fields.
 */
function claudeStdin(evt, hookEventName) {
  if (
    evt.hostPlatform === "claude-code" &&
    evt.raw &&
    typeof evt.raw === "object"
  ) {
    return JSON.stringify(evt.raw);
  }
  const p = {
    session_id: evt.sessionId ?? "",
    cwd: evt.projectDir ?? process.cwd(),
    hook_event_name: hookEventName,
  };
  if (evt.prompt !== undefined) p.prompt = evt.prompt;
  if (evt.toolName !== undefined) {
    p.tool_name = evt.toolName;
    p.tool_input = evt.toolInput ?? {};
  }
  if (evt.toolOutput !== undefined) p.tool_response = evt.toolOutput;
  if (evt.source !== undefined) p.source = evt.source;
  if (evt.trigger !== undefined) p.trigger = evt.trigger;
  if (evt.stopHookActive !== undefined) p.stop_hook_active = evt.stopHookActive;
  // PermissionRequest (NOTE: the docs state this event has NO tool_use_id)
  if (evt.permissionSuggestions !== undefined) {
    p.permission_suggestions = evt.permissionSuggestions;
  }
  // PostToolUseFailure
  if (evt.error !== undefined) p.error = evt.error;
  if (evt.toolUseId !== undefined) p.tool_use_id = evt.toolUseId;
  if (evt.isInterrupt !== undefined) p.is_interrupt = evt.isInterrupt;
  if (evt.durationMs !== undefined) p.duration_ms = evt.durationMs;
  // SubagentStart / SubagentStop (agent_type may be absent on stop — the
  // tracker compensates from its own state, exactly as upstream)
  if (evt.agentId !== undefined) p.agent_id = evt.agentId;
  if (evt.agentType !== undefined) p.agent_type = evt.agentType;
  if (evt.agentTranscriptPath !== undefined) {
    p.agent_transcript_path = evt.agentTranscriptPath;
  }
  if (evt.lastAssistantMessage !== undefined) {
    p.last_assistant_message = evt.lastAssistantMessage;
  }
  return JSON.stringify(p);
}

/**
 * Spawn ONE unchanged OMC hook script through upstream run.cjs:
 *   node $OMC/scripts/run.cjs $OMC/scripts/<script> [args]
 * stdin = the Claude-shaped JSON; stdout = the script's one JSON reply.
 * run.cjs re-reads hooks.json and enforces the per-entry timeout itself; the
 * outer timeout here (+5 s) is belt-and-braces so the bridge can never wedge.
 * Kill switches (DISABLE_OMC / OMC_SKIP_HOOKS / OMC_TEAM_WORKER) pass through
 * env untouched — the scripts check them, exactly as upstream.
 */
function runOmcScript(script, args, stdinJson, timeoutSec) {
  const r = spawnSync(
    process.execPath,
    [RUN_CJS, join(OMC, "scripts", script), ...args],
    {
      input: stdinJson,
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: OMC },
      timeout: (timeoutSec + 5) * 1000,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (r.error || typeof r.stdout !== "string") return null;
  const out = r.stdout.trim();
  if (out === "") return null;
  try {
    return JSON.parse(out);
  } catch {
    // Tolerate stray log lines before the JSON object: try the last line.
    const last = out.split("\n").filter((l) => l.trim() !== "").pop();
    try {
      return JSON.parse(last ?? "");
    } catch {
      return null; // unparseable → contributes nothing (fail-open)
    }
  }
}

/**
 * Merge the per-script Claude-shaped replies into ONE normalized HookResponse.
 *   deny wins:  top-level {"decision":"block"} (Stop/persistent-mode) or
 *               hookSpecificOutput.permissionDecision:"deny" (PreToolUse)
 *   then ask:   permissionDecision:"ask"
 *   then ctx:   hookSpecificOutput.additionalContext values, "\n\n"-joined
 *               (top-level systemMessage folded in — surface-map residue 7)
 *   else allow: {"continue":true} / suppressOutput / empty / unparseable
 */
function mergeOmcOutputs(outs) {
  let deny = null;
  let ask = null;
  const ctx = [];
  for (const o of outs) {
    if (!o || typeof o !== "object") continue;
    if (o.decision === "block") {
      deny ??= {
        reason:
          typeof o.reason === "string" && o.reason !== ""
            ? o.reason
            : "Blocked by oh-my-claudecode hook",
      };
    }
    const hso = o.hookSpecificOutput;
    if (hso && typeof hso === "object") {
      if (hso.permissionDecision === "deny") {
        deny ??= {
          reason:
            typeof hso.permissionDecisionReason === "string" &&
            hso.permissionDecisionReason !== ""
              ? hso.permissionDecisionReason
              : "Blocked by oh-my-claudecode hook",
        };
      } else if (hso.permissionDecision === "ask") {
        ask ??= {
          reason:
            typeof hso.permissionDecisionReason === "string" &&
            hso.permissionDecisionReason !== ""
              ? hso.permissionDecisionReason
              : "Confirmation required by oh-my-claudecode hook",
        };
      }
      if (
        typeof hso.additionalContext === "string" &&
        hso.additionalContext !== ""
      ) {
        ctx.push(hso.additionalContext);
      }
    }
    if (typeof o.systemMessage === "string" && o.systemMessage !== "") {
      ctx.push(o.systemMessage);
    }
  }
  if (deny) return { decision: "deny", reason: deny.reason };
  if (ask) return { decision: "ask", reason: ask.reason };
  if (ctx.length > 0)
    return { decision: "context", additionalContext: ctx.join("\n\n") };
  return { decision: "allow" };
}

/**
 * One HookDefinition that runs a fixed chain of OMC scripts (in upstream
 * hooks.json order, sequentially) and merges their replies.
 * Each chain entry: [scriptFile, hooksJsonTimeoutSec, extraArgs?].
 */
function bridge(hookEventName, chain) {
  return {
    handler(evt) {
      try {
        const stdin = claudeStdin(evt, hookEventName);
        const outs = chain.map(([script, timeoutSec, args]) =>
          runOmcScript(script, args ?? [], stdin, timeoutSec),
        );
        return mergeOmcOutputs(outs);
      } catch {
        return { decision: "allow" }; // fail-open, never wedge the host
      }
    },
  };
}

/**
 * PermissionRequest needs its OWN merge — the generic mergeOmcOutputs defaults
 * to {decision:"allow"}, but on PermissionRequest an explicit "allow" is an
 * ACTIVE GRANT that suppresses the host's permission dialog. The scripts'
 * vocabulary is hookSpecificOutput.decision.behavior:
 *   behavior "deny"   → {decision:"deny", reason: message}   (deny wins)
 *   behavior "allow"  → {decision:"allow"} (+updatedInput passthrough) — what
 *                       permission-handler.mjs emits for whitelisted-safe Bash
 *                       commands; the host still enforces its own deny rules.
 *   anything else     → return void (NO decision) so the bridge falls through
 *                       to the native dialog — permission-handler.mjs's
 *                       {continue:true[, suppressOutput:true]} default, and
 *                       the fail-open path too (never auto-grant on error).
 */
function permissionBridge(matcher, chain) {
  return {
    matcher,
    handler(evt) {
      try {
        const stdin = claudeStdin(evt, "PermissionRequest");
        let allow = null;
        for (const [script, timeoutSec, args] of chain) {
          const o = runOmcScript(script, args ?? [], stdin, timeoutSec);
          const d =
            o && typeof o === "object" && o.hookSpecificOutput &&
            typeof o.hookSpecificOutput === "object"
              ? o.hookSpecificOutput.decision
              : undefined;
          if (!d || typeof d !== "object") continue;
          if (d.behavior === "deny") {
            return {
              decision: "deny",
              reason:
                typeof d.message === "string" && d.message !== ""
                  ? d.message
                  : "Blocked by oh-my-claudecode permission handler",
            };
          }
          if (d.behavior === "allow") {
            allow ??= {
              decision: "allow",
              ...(d.updatedInput && typeof d.updatedInput === "object"
                ? { updatedInput: d.updatedInput }
                : {}),
            };
          }
        }
        return allow ?? undefined; // undefined → fall through to the dialog
      } catch {
        return undefined; // fail SAFE here: never grant on a bridge error
      }
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Content compilation — 128 upstream files → 87 defs at config-load time.
// A dependency-free frontmatter splitter is enough: every OMC frontmatter key
// is a flat `key: value` scalar or a flow list like `[a, b]` (verified across
// all 87 files — see surface-map §3). Validation (kebab names, non-empty
// prompts/descriptions, ≤1024 descriptions, resource-path safety) is then
// enforced by defineConnector itself.
// ───────────────────────────────────────────────────────────────────────────

function parseScalar(raw) {
  if (raw === "") return "";
  if (
    (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) ||
    (raw.startsWith("'") && raw.endsWith("'") && raw.length >= 2)
  ) {
    return raw.slice(1, -1);
  }
  if (raw.startsWith("[") && raw.endsWith("]")) {
    const inner = raw.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((s) => parseScalar(s.trim()));
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

/** Split `---`-fenced frontmatter (flat key: value pairs) from the body. */
function parseFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") return { fm: {}, body: text.trim() };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end === -1) return { fm: {}, body: text.trim() };
  const fm = {};
  for (let i = 1; i < end; i++) {
    const m = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(lines[i]);
    if (m) fm[m[1]] = parseScalar(m[2].trim());
  }
  return { fm, body: lines.slice(end + 1).join("\n").trim() };
}

/** agents/*.md (19) → SubagentDef[]. */
function loadSubagents() {
  const dir = join(OMC, "agents");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const { fm, body } = parseFrontmatter(readFileSync(join(dir, f), "utf8"));
      const def = {
        name: typeof fm.name === "string" && fm.name !== "" ? fm.name : f.slice(0, -3),
        description: String(fm.description ?? ""),
        prompt: body,
      };
      if (typeof fm.model === "string" && fm.model !== "") def.model = fm.model;
      const extra = {};
      for (const [k, v] of Object.entries(fm)) {
        if (!["name", "description", "model", "disallowedTools"].includes(k)) {
          extra[k] = v; // e.g. level
        }
      }
      if (typeof fm.disallowedTools === "string" && fm.disallowedTools !== "") {
        // Normalized form for platforms with a native deny surface…
        def.tools = {
          deny: fm.disallowedTools.split(",").map((s) => s.trim()).filter(Boolean),
        };
        // …AND verbatim for claude-code, whose subagent renderer emits only the
        // allow list — extra round-trips upstream's `disallowedTools:` exactly.
        extra.disallowedTools = fm.disallowedTools;
      }
      if (Object.keys(extra).length > 0) def.extra = extra;
      return def;
    });
}

/** commands/*.md (28) → CommandDef[]; filename stem is the slash name. */
function loadCommands() {
  const dir = join(OMC, "commands");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const { fm, body } = parseFrontmatter(readFileSync(join(dir, f), "utf8"));
      const def = { name: f.slice(0, -3), prompt: body };
      if (typeof fm.description === "string" && fm.description !== "") {
        def.description = fm.description;
      }
      if (typeof fm["argument-hint"] === "string" && fm["argument-hint"] !== "") {
        def.argumentHint = fm["argument-hint"];
      }
      if (typeof fm.model === "string" && fm.model !== "") def.model = fm.model;
      const extra = {};
      for (const [k, v] of Object.entries(fm)) {
        if (!["name", "description", "argument-hint", "model"].includes(k)) {
          extra[k] = v;
        }
      }
      if (Object.keys(extra).length > 0) def.extra = extra;
      return def;
    });
}

/** Recursively gather every file beside SKILL.md as a resource (relpath → contents). */
function collectResources(dir, prefix, out) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === "" ? e.name : `${prefix}/${e.name}`;
    if (e.isDirectory()) collectResources(join(dir, e.name), rel, out);
    else if (e.isFile() && rel !== "SKILL.md") {
      out[rel] = readFileSync(join(dir, e.name), "utf8");
    }
  }
}

/**
 * skills/<dir>/SKILL.md (40) → SkillDef[] (+40 resource files across
 * omc-setup / project-session-manager / self-improve / writer-memory).
 * The frontmatter `name` is the source of truth (what the model invokes);
 * upstream has exactly one dir/name mismatch (dir `plan` → name `omc-plan`)
 * which we preserve as-declared. Note R5: resources are utf-8 strings, so
 * psm.sh's executable bit is not carried.
 */
function loadSkills() {
  const root = join(OMC, "skills");
  return readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((dirName) => {
      const skillDir = join(root, dirName);
      const { fm, body } = parseFrontmatter(
        readFileSync(join(skillDir, "SKILL.md"), "utf8"),
      );
      const def = {
        name: typeof fm.name === "string" && fm.name !== "" ? fm.name : dirName,
        description: String(fm.description ?? ""),
        body,
      };
      const extra = {};
      for (const [k, v] of Object.entries(fm)) {
        if (k !== "name" && k !== "description") extra[k] = v; // argument-hint, level, aliases, pipeline, …
      }
      if (Object.keys(extra).length > 0) def.extra = extra;
      const resources = {};
      collectResources(skillDir, "", resources);
      if (Object.keys(resources).length > 0) def.resources = resources;
      return def;
    });
}

// ───────────────────────────────────────────────────────────────────────────
// The connector — replaces hooks.json + plugin.json + .mcp.json + installer.
// ───────────────────────────────────────────────────────────────────────────

export default defineConnector({
  id: "oh-my-claudecode",
  displayName: "oh-my-claudecode",
  version: "4.14.6", // upstream .claude-plugin/plugin.json

  // OMC's MCP server `t`: a self-contained 28,786-line CJS bundle, verified to
  // launch standalone (49 tools) with zero CLAUDE_PLUGIN_ROOT references — env
  // set anyway for defensive parity with the plugin launch context.
  server: {
    transport: "stdio",
    command: "node",
    args: [join(OMC, "bridge", "mcp-server.cjs")],
    env: { CLAUDE_PLUGIN_ROOT: OMC },
    tools: { include: ["*"] },
    timeoutMs: 30_000,
  },

  // ALL 11 of OMC's hooks.json event keys map onto agent-connector's
  // normalized events (24 of 24 command entries) since AC's E1 extension
  // added PermissionRequest / PostToolUseFailure / SubagentStart /
  // SubagentStop (8 → 12 canonical events). Chains run in upstream order with
  // upstream timeouts.
  hooks: {
    UserPromptSubmit: bridge("UserPromptSubmit", [
      ["keyword-detector.mjs", 5],
      ["skill-injector.mjs", 3],
    ]),

    // The `*` chain always runs; upstream's `init`/`maintenance` matcher groups
    // are appended behind raw.source routing (dormant on stock Claude, exactly
    // as upstream — surface-map residue 8).
    SessionStart: {
      handler(evt) {
        try {
          const chain = [
            ["session-start.mjs", 5],
            ["project-memory-session.mjs", 5],
            ["wiki-session-start.mjs", 5],
          ];
          const src =
            evt.raw && typeof evt.raw === "object" ? evt.raw.source : undefined;
          if (src === "init") chain.push(["setup-init.mjs", 30]);
          if (src === "maintenance") chain.push(["setup-maintenance.mjs", 60]);
          const stdin = claudeStdin(evt, "SessionStart");
          return mergeOmcOutputs(
            chain.map(([s, t, a]) => runOmcScript(s, a ?? [], stdin, t)),
          );
        } catch {
          return { decision: "allow" };
        }
      },
    },

    // Upstream matcher `*` → no matcher (match every tool).
    PreToolUse: bridge("PreToolUse", [["pre-tool-enforcer.mjs", 3]]),

    // Upstream matcher "Bash" (the only matched event in hooks.json) carries
    // over verbatim. permission-handler.mjs auto-allows whitelisted-safe Bash
    // commands (decision.behavior:"allow") and emits {continue:true} for
    // everything else — which the bridge maps to NO decision, falling through
    // to Claude's native permission dialog (never an implied grant).
    PermissionRequest: permissionBridge("Bash", [["permission-handler.mjs", 5]]),

    PostToolUse: bridge("PostToolUse", [
      ["post-tool-verifier.mjs", 3],
      ["project-memory-posttool.mjs", 3],
      ["post-tool-rules-injector.mjs", 3],
    ]),

    // Feedback-only: post-tool-use-failure.mjs persists recovery state and may
    // emit continuation guidance (hookSpecificOutput.additionalContext), which
    // the merge maps to {decision:"context"} → injected beside the error.
    PostToolUseFailure: bridge("PostToolUseFailure", [
      ["post-tool-use-failure.mjs", 3],
    ]),

    // subagent-tracker start/stop maintain OMC's own subagent state (the
    // upstream workaround for hosts not populating agent_type on stop);
    // verify-deliverables is ADVISORY on SubagentStop — additionalContext
    // warnings only, {continue:true, suppressOutput:true} when clean.
    SubagentStart: bridge("SubagentStart", [
      ["subagent-tracker.mjs", 3, ["start"]],
    ]),

    SubagentStop: bridge("SubagentStop", [
      ["subagent-tracker.mjs", 5, ["stop"]],
      ["verify-deliverables.mjs", 5],
    ]),

    PreCompact: bridge("PreCompact", [
      ["pre-compact.mjs", 10],
      ["project-memory-precompact.mjs", 5],
      ["wiki-pre-compact.mjs", 3],
    ]),

    // persistent-mode's {"decision":"block"} → deny (the ralph/ultrawork loop).
    // See the R1 note in the header about the claude-code reply shape.
    Stop: bridge("Stop", [
      ["context-guard-stop.mjs", 5],
      ["persistent-mode.mjs", 10],
      ["code-simplifier.mjs", 5],
    ]),

    // Fire-and-forget upstream (host ignores SessionEnd output); side effects
    // (state flush, wiki save) are the point.
    SessionEnd: bridge("SessionEnd", [
      ["session-end.mjs", 30],
      ["wiki-session-end.mjs", 30],
    ]),
  },

  // Compiled AT LOAD from the upstream checkout: 19 + 40 (+40 resources) + 28.
  subagents: loadSubagents(),
  skills: loadSkills(),
  commands: loadCommands(),

  telemetry: { enabled: true, modelFamilyHint: "auto" },

  // First-wave targets = the agent CLIs present in this environment (same set
  // the proven context-mode port shipped with). Claim hook parity for
  // claude-code first (surface-map R3); content + server land natively on all.
  targets: ["claude-code", "codex", "cursor", "opencode", "gemini-cli"],
});
