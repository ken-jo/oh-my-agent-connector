#!/usr/bin/env node
// Branded CLI for Oh My Agent Connector.
// createConnectorCli wraps every agent-connector subcommand (detect / install /
// uninstall / upgrade / doctor / status / serve / hook / telemetry / leaderboard
// / package) under this one bin, auto-scoped to the connector declared beside it.
// All cross-CLI deployment is owned by agent-connector — this repo replaces
// OMAC's ~21k LOC of deployment plumbing (src/installer/** 8,543 LOC,
// scripts/*.mjs + run.cjs 12,174 LOC of hook entrypoints, hooks.json,
// .claude-plugin/plugin.json + .mcp.json) with one defineConnector().
//
// SAFETY: the OMAC marketplace plugin is LIVE in this machine's real ~/.claude.
// Never run a real `install` against the real home here — verification is
// `--dry-run` or an isolated HOME (mkdtemp + HOME/USERPROFILE/
// AGENT_CONNECTOR_DATA_DIR overrides) only; double-firing OMAC hooks would
// corrupt live sessions.
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createConnectorCli } from "@ken-jo/agent-connector/cli";

const connector = fileURLToPath(
  new URL("./agent-connector.config.mjs", import.meta.url),
);

const args = process.argv.slice(2);
const runtimeDoctorArgs = new Set(["team-routing", "conflicts", "--team-routing"]);

if (args[0] === "doctor" && runtimeDoctorArgs.has(args[1] ?? "")) {
  const runtimeCli = fileURLToPath(
    new URL("./bin/oh-my-agent-connector-runtime.js", import.meta.url),
  );
  const child = spawnSync(
    process.execPath,
    [runtimeCli, "doctor", ...args.slice(1)],
    { stdio: "inherit" },
  );
  if (child.error) {
    process.stderr.write(`oh-my-agent-connector: fatal: ${child.error.stack ?? child.error}\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = child.status ?? 1;
  }
} else {
createConnectorCli({ name: "oh-my-agent-connector", connector })
  .run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`oh-my-agent-connector: fatal: ${err?.stack ?? err}\n`);
    process.exitCode = 1;
  });
}
