# oh-my-agent-connector

Apply **[`@ken-jo/agent-connector`](../agent-connector)** to the EXISTING
**oh-my-agent-connector** (OMAC, MIT, ★36k — this fork, with the upstream runtime files in-repo) and measure the efficiency: OMAC
functionality runs UNCHANGED; only its deployment plumbing (installer /
44-script hook entrypoint layer / hooks.json / plugin manifests) is replaced by
one `defineConnector()`. Same playbook as the proven
[context-mode migration](../context-mode-with-agent-connector) (20,322 → 76).

**Result: 20,999-LOC plumbing bucket → 394 code lines (−98.1%, 53×); strictly
eliminated subset 9,239 → 394 (−95.7%, 23×); hook coverage 11/11 event keys /
24/24 command entries since agent-connector's E1 8→12-event extension; honest
reused/dropped split in [`EFFICIENCY.md`](./EFFICIENCY.md).**

## Progress

| Phase | State | Commit |
|---|---|---|
| 1. Baseline measured (≈21k plumbing LOC, per-layer) | ✅ done | fc3177a |
| 2. Surface map — 11 hook keys/24 entries → 8 AC events, MCP, 128→87 content defs, residue + risks | ✅ done | fea3c63 |
| 3. The port — one `defineConnector()` (P1a bridge + load-time content compiler) + branded CLI | ✅ done | 8e0a013 |
| 4. Verify — isolated-home install (136 artifacts, idempotent), doctor --probe 94/94 (49 tools), live hook bridge (ralph keyword / SessionStart / Stop state 1→2), multi-platform dry-run (397 writes, 1 honest warn) | ✅ done | 230f2b6 |
| 5. Quantify efficiency (20,999 → 324 code lines; honest split) | ✅ done | 478be3a |
| 6. Fix AC defect R1 upstream (Stop deny shape — event-aware `decision:"block"`) | ✅ done | AC `2c506ab` |
| 6b. Bridge the last 4 hooks (AC E1: PermissionRequest/PostToolUseFailure/SubagentStart/SubagentStop, 8→12 events) — **11/11 keys, 24/24 entries**, live round-trips | ✅ done | this commit |
| 7. Live non-claude hook verification (codex/gemini/opencode, isolated homes) | ⬜ | |

## Key documents

- [`BASELINE.md`](./BASELINE.md) — what upstream OMAC spends on deployment plumbing.
- [`docs/surface-map.md`](./docs/surface-map.md) — exact per-event mapping + the honest residue list.
- [`VERIFICATION.md`](./VERIFICATION.md) — isolated-home evidence (install / parity / probe / live bridge / dry-run).
- [`EFFICIENCY.md`](./EFFICIENCY.md) — the quantified before/after with the reused-vs-replaced split.

## Safety

The OMAC marketplace plugin is **LIVE** in this machine's real `~/.claude`.
Never `install` into the real home (double-fired hooks would corrupt live
sessions): all verification runs in an isolated HOME (mkdtemp +
`HOME`/`USERPROFILE`/`AGENT_CONNECTOR_DATA_DIR` overrides); multi-platform
checks are `--dry-run` only. Post-run audits confirmed the real home untouched.

## Licensing

OMAC is MIT and reference-permitted; this repo imports/spawns its files
unchanged from the upstream checkout. agent-connector is ours.
