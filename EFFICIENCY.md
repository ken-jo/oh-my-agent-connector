# Efficiency — quantified

Comparison between oh-my-claudecode's deployment plumbing
(`Yeachan-Heo/oh-my-claudecode` @ v4.14.6 / deee3a4, ★36k) and this repo's
agent-connector port. Methodology mirrors the context-mode migration
(`/home/ubuntu/workspace/github/context-mode-with-agent-connector/EFFICIENCY.md`,
20,322 → 76): `wc -l` over the exact file sets; "code lines" excludes comments
and blanks. Every baseline figure below was re-measured against the upstream
checkout before writing this file (commands inline). OMC functionality runs
UNCHANGED — only the deployment plumbing is replaced.

## Headline

| Metric | OMC upstream (before) | this repo (after) | Δ |
|---|---:|---:|---|
| **Deployment-plumbing bucket (BASELINE.md)** | **20,999** | **324 code** (480 with comments) | **−98.5% (65×)** |
| Strictly eliminated layer only (honest subset, below) | 9,239 | 324 | −96.5% (29×) |
| Platforms for the mapped surfaces | **1** (claude-code only; one extra CLI = a whole sibling repo) | **5 targeted / 4 evidenced** (1 live isolated install + 3 dry-run planned; 29 in AC registry) | +3 evidenced, +28 addressable |
| Hook events wired | 11 keys / 13 groups / 24 command entries (BASELINE's "12" rounds this) | **8/11 keys, 9/13 groups, 19/24 entries bridged** | 5 entries residue (enumerated) |
| Files to touch to add a platform | new sibling project (oh-my-codex, oh-my-opencode) | **0** (`--targets` flag) | — |
| MCP / agents / skills / commands parity (claude-code) | plugin install | 49/49 tools · 19/19 · 80/80 · 28/28 | exact |

## Strict accounting (eliminated vs reused vs dropped — the honest split)

The ≈21k BASELINE bucket (`src/installer/**` 8,543 + `scripts/*.mjs + run.cjs`
12,174 + `hooks/hooks.json` 212 + `plugin.json`/`.mcp.json` 70 = **20,999**) is
NOT all "replaced": a large part of the scripts layer is hook *logic* that the
bridge deliberately keeps running unchanged. Splitting it honestly:

ELIMINATED (replaced by one `defineConnector()` + the SDK):
| Layer | LOC |
|---|---:|
| `src/installer/**` — settings.json/statusline/CLAUDE.md-block writers, marketplace install, heal | 8,543 |
| `hooks/hooks.json` — 12-event wiring manifest | 212 |
| `.claude-plugin/plugin.json` + `.mcp.json` — manifests + MCP registration | 70 |
| `scripts/plugin-setup.mjs` + `scripts/repair-plugin-cache.mjs` — plugin-cache lifecycle/heal | 414 |
| **Total eliminated** | **9,239** |

REUSED unchanged (functionality, not plumbing — spawned by the bridge straight
from the upstream checkout, a runtime dependency by path; nothing copied):
| Layer | LOC |
|---|---:|
| 19 bridged hook scripts (`keyword-detector`, `session-start`, `pre-tool-enforcer`, `persistent-mode`, `post-tool-verifier`, …) + `run.cjs` (kept for its per-script hooks.json timeout enforcement; its *install-side* role — being the settings.json command — is replaced by AC's home-bin shim) | 8,445 |
| `src/hooks/**` shared logic (78,336) · `bridge/mcp-server.cjs` (28,786-line bundle, 49 tools) · 128 content files → 87 defs | never the target |

DROPPED (residue — capability honestly lost, not counted as savings):
| Script | LOC | Why |
|---|---:|---|
| `permission-handler.mjs` (PermissionRequest/Bash) | 21 | Claude-only event; no AC equivalent |
| `post-tool-use-failure.mjs` (PostToolUseFailure) | 489 | no AC event; `[TOOL ERROR]` recovery guidance lost |
| `subagent-tracker.mjs` (SubagentStart/Stop) | 53 | no AC events; lifecycle accounting lost |
| `verify-deliverables.mjs` (SubagentStop) | 238 | deliverables nudge on subagent exit lost |
| **Total residue** | **801** | 5/24 command entries across 3/11 event keys |

OUT OF SCOPE (lived in `scripts/` and inflated the baseline bucket, but are
dev/build/demo utilities never installed anywhere — neither replaced nor
reused): build-*/eval-*/smoke-/audit-/demo-/status/risk-assess/… = **2,514**.

Check: 9,239 + 8,445 + 801 + 2,514 = 20,999. ✓

REPLACEMENT (this repo, total):
| File | Lines | Code lines |
|---|---:|---:|
| `agent-connector.config.mjs` (defineConnector: server + 7 hook bridges + 87-def content compiler) | 449 | 309 |
| `bin.mjs` (branded CLI via createConnectorCli) | 31 | 15 |
| **Total** | **480** | **324** |

The port is ~4× larger than context-mode's 76 lines because OMC's surface is
~4× bigger: 7 event chains × 19 scripts with per-script timeouts, deny/ask/
context merge semantics, and a load-time compiler for 128 content files —
still 29–65× smaller than what it replaces.

## What the 324 lines bought (verified, not claimed — VERIFICATION.md)

- **Isolated install (claude-code): 136 artifacts** — MCP registration in
  `~/.claude.json`, 7 settings.json hook events, 127 content files (19 agents +
  28 commands + 40 SKILL.md + 40 resources), settings backup. Idempotent re-run:
  135 skipped, 0 warnings. Full `uninstall` inverse for free.
- **`doctor --probe`: 94 pass / 0 fail** — upstream's unchanged
  `bridge/mcp-server.cjs` initialized through the telemetry wrapper, 49/49 tools.
- **Live hook bridge, end-to-end:** `ralph` keyword → `[MAGIC KEYWORD: RALPH]`
  injection (UserPromptSubmit); SessionStart context relay; Stop with an active
  ralph state — `persistent-mode.mjs` iterated 1→2 on disk through the bridge.
- **3 more platforms from a flag:** `install --dry-run --targets
  codex,opencode,gemini-cli` planned 397 writes — codex TOML MCP + 6-event
  hooks.json, opencode JSON MCP + plugin module, gemini settings MCP + 6 native
  events — with exactly one honest warn (gemini has no Stop equivalent).
  Upstream's answer to each extra CLI was an entire sibling repo.
- **Per-tool token telemetry** (sandbox NDJSON recorded every bridged event) —
  something upstream OMC never had.

## Scope honesty

- **Hook coverage is 19/24, not 24/24.** The 5 residual command entries
  (PermissionRequest, PostToolUseFailure, SubagentStart/Stop ×2 + verify-
  deliverables) need events agent-connector's 8-event union does not have;
  docs/surface-map.md §4 enumerates each loss. Statusline HUD and the
  `~/.claude/CLAUDE.md` managed block are likewise not AC surfaces (HUD stays
  manually installable; the block's text can be session-injected instead).
  `systemMessage` notices fold into `additionalContext` (cosmetic).
- **R1 is real and blocks ralph/ultrawork persistence parity on claude-code:**
  AC's claude-code adapter renders every deny as PreToolUse-shaped
  `permissionDecision`, which Claude ignores on Stop. Diagnosed live
  (VERIFICATION.md §6) with a fix sketch; per phase mandate it is *not* fixed
  here — parity claim for the Stop loop is contingent on that adapter fix.
- **Sequential chains:** AC registers one entry per event; the bridge runs each
  chain sequentially (upstream Claude ran the 24 entries independently).
  Per-script timeouts are preserved via `run.cjs`; worst case adds wall-time on
  Stop (5+10+5 s serial).
- **Non-claude hosts are "planned", not "proven":** content + MCP land natively
  everywhere; hook *behavior* on codex/gemini/opencode is best-effort until
  live-verified (surface-map R3). The platform claim here is deployment, which
  is what the dry-run evidences.
- The eliminated layer is deployment plumbing only. OMC's product logic
  (78k LOC `src/hooks/**`, 49-tool MCP bundle, 128 content files) was never the
  target and runs unchanged from the upstream checkout.
