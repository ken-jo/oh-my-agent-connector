# Baseline — oh-my-agent-connector's deployment plumbing

Measured from `Yeachan-Heo/oh-my-agent-connector` @ v4.14.6 (deee3a4), 2026-06-10.

**Purpose (the owner's actual question): apply agent-connector to the EXISTING
OMAC and measure the efficiency gain** — exactly the context-mode playbook
(20,322 LOC → 76, −99.6%), now on a ★36k real-world harness.

## Replacement target (deployment plumbing)

| Layer | LOC | Notes |
|---|---:|---|
| `src/installer/**` | **8,543** | settings.json/statusline/CLAUDE.md-block writers, marketplace install, heal |
| `scripts/*.mjs` + `run.cjs` | **12,174** | 44 hook entrypoints + cross-platform runner + plugin-root self-heal |
| `hooks/hooks.json` | 212 lines | 12-event wiring |
| `.claude-plugin/plugin.json` + `.mcp.json` | 70 lines | manifest + MCP registration |
| **Total** | **≈ 21,000** | for ONE platform (Claude Code) |

## Preserved (functionality — NOT the target)

- `src/hooks/**` logic: 77,776 LOC · `src/tools+mcp`: 19,852 LOC (bridge/mcp-server.cjs)
- content: 19 agents / 40 skills / 28 commands (128 files)

## The counterfactual

Supporting ONE additional CLI by hand = an entire second project
(`oh-my-codex`, a from-scratch Codex re-implementation; `oh-my-opencode`
likewise for OpenCode). agent-connector's claim: the mappable surfaces
(MCP server + 8 normalized hook events + commands/skills/subagents) deploy to
29 platforms from one `defineConnector()` — with an honest residue list for
what only a native plugin can do (PermissionRequest, SubagentStart/Stop,
PostToolUseFailure, statusline HUD).

## Metrics to produce

1. plumbing LOC replaced vs kept (claude-code parity)
2. surface mapping coverage: which of OMAC's 12 hook events map onto
   agent-connector's 8 normalized events; residue enumerated
3. platforms gained beyond claude-code for the mapped surfaces
4. files-to-touch to add a platform: N → 0
