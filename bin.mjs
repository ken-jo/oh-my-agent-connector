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

const runtimeDoctorArgs = new Set(["team-routing", "conflicts", "--team-routing"]);

const cli = createConnectorCli({
  packageJson: new URL("./package.json", import.meta.url),
  connector: new URL("./agent-connector.config.mjs", import.meta.url),
  passthrough: [
    {
      when(argv) {
        return argv[0] === "doctor" && runtimeDoctorArgs.has(argv[1] ?? "");
      },
      run(argv, context) {
        const runtimeCli = fileURLToPath(
          new URL("./bin/oh-my-agent-connector-runtime.js", import.meta.url),
        );
        const child = spawnSync(
          process.execPath,
          [runtimeCli, "doctor", ...argv.slice(1)],
          { stdio: "inherit" },
        );
        if (child.error) {
          process.stderr.write(
            `${context.programName}: fatal: ${child.error.stack ?? child.error}\n`,
          );
          return 1;
        }
        return child.status ?? 1;
      },
    },
  ],
});

cli
  .run()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    process.stderr.write(`${cli.name}: fatal: ${err?.stack ?? err}\n`);
    process.exitCode = 1;
  });
