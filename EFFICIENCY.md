# Efficiency — quantified

Comparison between oh-my-agent-connector's deployment plumbing
(`Yeachan-Heo/oh-my-agent-connector` @ v4.14.6 / deee3a4, ★36k) and this repo's
agent-connector port. Methodology mirrors the context-mode migration
(`/home/ubuntu/workspace/github/context-mode-with-agent-connector/EFFICIENCY.md`,
20,322 → 76): `wc -l` over the exact file sets; "code lines" excludes comments
and blanks. Every baseline figure below was re-measured against the upstream
checkout before writing this file (commands inline). OMAC functionality runs
UNCHANGED — only the deployment plumbing is replaced.

## Headline

| Metric | OMAC upstream (before) | this repo (after) | Δ |
|---|---:|---:|---|
| **Deployment-plumbing bucket (BASELINE.md)** | **20,999** | **442 code** (614 with comments) | **−97.9% (48×)** |
| Strictly eliminated layer only (honest subset, below) | 9,239 | 442 | −95.2% (21×) |
| Platforms for the mapped surfaces | **1** (claude-code only; one extra CLI = a whole sibling repo) | **5 targeted / 4 evidenced** (1 live isolated install + 3 dry-run planned; 29 in AC registry) | +3 evidenced, +28 addressable |
| Hook events wired | 11 keys / 13 groups / 24 command entries (BASELINE's "12" rounds this) | **11/11 keys, 13/13 groups, 24/24 entries bridged** (since AC's E1 8→12-event extension) | full hook coverage |
| Files to touch to add a platform | new host-specific sibling project | **0** (`--targets` flag) | — |
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
| 19 originally-bridged hook scripts (`keyword-detector`, `session-start`, `pre-tool-enforcer`, `persistent-mode`, `post-tool-verifier`, …) + `run.cjs` (kept for its per-script hooks.json timeout enforcement; its *install-side* role — being the settings.json command — is replaced by AC's home-bin shim) | 8,445 |
| The 4 formerly-DROPPED residue scripts, bridged since AC's E1 extension (8→12 events): `permission-handler.mjs` 21 (PermissionRequest/Bash) + `post-tool-use-failure.mjs` 489 + `subagent-tracker.mjs` 53 (SubagentStart/Stop) + `verify-deliverables.mjs` 238 (SubagentStop) | 801 |
| `src/hooks/**` shared logic (78,336) · `bridge/mcp-server.cjs` (28,786-line bundle, 49 tools) · 128 content files → 87 defs | never the target |

DROPPED (residue — capability honestly lost, not counted as savings): **none of
the 24 hook command entries any more** — the previous 801-LOC / 5-entry hook
residue moved to REUSED above. The remaining non-hook residue (statusline HUD,
`CLAUDE.md` managed block, `systemMessage` channel) is enumerated under Scope
honesty and docs/surface-map.md §4.

OUT OF SCOPE (lived in `scripts/` and inflated the baseline bucket, but are
dev/build/demo utilities never installed anywhere — neither replaced nor
reused): build-*/eval-*/smoke-/audit-/demo-/status/risk-assess/… = **2,514**.

Check: 9,239 + (8,445 + 801) + 2,514 = 20,999. ✓

REPLACEMENT (this repo, total):
| File | Lines | Code lines |
|---|---:|---:|
| `agent-connector.config.mjs` (defineConnector: server + 11 hook bridges + 87-def content compiler) | 552 | 394 |
| `bin.mjs` (branded CLI via createConnectorCli) | 62 | 48 |
| **Total** | **614** | **442** |

The port is ~5× larger than context-mode's 76 lines because OMAC's surface is
~5× bigger: 11 event chains × 23 scripts with per-script timeouts, deny/ask/
context merge semantics (plus the PermissionRequest never-auto-grant merge),
and a load-time compiler for 128 content files — still 21–48× smaller than
what it replaces.

## What the 442 lines bought (verified, not claimed — VERIFICATION.md)

- **Isolated install (claude-code): 140 artifacts** — MCP registration in
  `~/.claude.json`, **11 settings.json hook events (11/11 upstream keys)**,
  127 content files (19 agents + 28 commands + 40 SKILL.md + 40 resources),
  settings backup. Full `uninstall` inverse for free.
- **`doctor --probe`: 94 pass / 0 fail** — upstream's unchanged
  `bridge/mcp-server.cjs` initialized through the telemetry wrapper, 49/49 tools.
- **Live hook bridge, end-to-end:** `ralph` keyword → `[MAGIC KEYWORD: RALPH]`
  injection (UserPromptSubmit); SessionStart context relay; Stop with an active
  ralph state — `persistent-mode.mjs` iterated 1→2 on disk through the bridge.
- **The last 4 hooks live (E1):** PermissionRequest `git status` →
  `decision{behavior:"allow"}` grant / `rm -rf build` → fall-through (no
  decision); PostToolUseFailure → recovery `additionalContext`; SubagentStart →
  tracker context; SubagentStop → clean pass + advisory deliverables warning
  with seeded team state.
- **3 more platforms from a flag:** `install --dry-run --targets
  codex,opencode,gemini-cli` planned 397 writes — codex TOML MCP + 6-event
  hooks.json, opencode JSON MCP + plugin module, gemini settings MCP + 6 native
  events — with exactly one honest warn (gemini has no Stop equivalent).
  Upstream's answer to each extra CLI was an entire sibling repo.
- **Per-tool token telemetry** (sandbox NDJSON recorded every bridged event) —
  something upstream OMAC never had.

## Scope honesty

- **Hook coverage is 24/24 (11/11 event keys)** since agent-connector's E1
  extension normalized PermissionRequest / PostToolUseFailure / SubagentStart /
  SubagentStop (8 → 12 canonical events); docs/surface-map.md §4 items 1–3
  record the former residue as resolved. Statusline HUD and the
  `~/.claude/CLAUDE.md` managed block are still not AC surfaces (HUD stays
  manually installable; the block's text can be session-injected instead).
  `systemMessage` notices fold into `additionalContext` (cosmetic).
- **R1 is RESOLVED:** AC's claude-code adapter now has an event-aware deny path
  (Stop/SubagentStop/UserPromptSubmit/PostToolUse → top-level
  `{"decision":"block"}`), verified with a live isolated-home Stop round trip —
  ralph/ultrawork persistence parity holds on claude-code.
- **Sequential chains:** AC registers one entry per event; the bridge runs each
  chain sequentially (upstream Claude ran the 24 entries independently).
  Per-script timeouts are preserved via `run.cjs`; worst case adds wall-time on
  Stop (5+10+5 s serial).
- **Non-claude hosts are "planned", not "proven":** content + MCP land natively
  everywhere; hook *behavior* on codex/gemini/opencode is best-effort until
  live-verified (surface-map R3). The platform claim here is deployment, which
  is what the dry-run evidences.
- The eliminated layer is deployment plumbing only. OMAC's product logic
  (78k LOC `src/hooks/**`, 49-tool MCP bundle, 128 content files) was never the
  target and runs unchanged from the upstream checkout.
