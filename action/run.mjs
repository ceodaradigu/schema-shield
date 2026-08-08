#!/usr/bin/env node

import { appendFileSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ALLOWED_THRESHOLDS = new Set([
  "never",
  "breaking",
  "medium",
  "high",
  "critical",
]);
const RISK_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`${name} is required.`);
  if (/\0|\r|\n/.test(value)) throw new Error(`${name} contains an unsafe character.`);
  return value.trim();
}

function workspacePath(workspace, value, label, allowRoot = false) {
  const candidate = resolve(workspace, value);
  const pathFromWorkspace = relative(workspace, candidate);
  if (isAbsolute(pathFromWorkspace) || pathFromWorkspace.startsWith("..")) {
    throw new Error(`${label} must stay inside GITHUB_WORKSPACE.`);
  }
  if (!allowRoot && pathFromWorkspace === "") {
    throw new Error(`${label} cannot be the workspace root.`);
  }
  return candidate;
}

function writeOutput(name, value) {
  const destination = process.env.GITHUB_OUTPUT;
  if (!destination) return;
  const serialized = String(value);
  if (/\r|\n/.test(serialized)) throw new Error(`Unsafe multiline output: ${name}.`);
  appendFileSync(destination, `${name}=${serialized}\n`, "utf8");
}

function writeSummary(report, outputDirectory, failed) {
  const destination = process.env.GITHUB_STEP_SUMMARY;
  if (!destination) return;
  const lines = [
    "## SchemaShield offline preflight",
    "",
    "> OFFLINE SNAPSHOT — NO LIVE DATAHUB WRITEBACK",
    "",
    `- Risk: **${report.risk}**`,
    `- Breaking change: **${report.breaking}**`,
    `- Impacted assets: **${report.impacted_entities.length}**`,
    `- Affected queries: **${report.affected_query_ids.length}**`,
    `- Policy result: **${failed ? "failed" : "passed"}**`,
    `- Artifacts: \`${outputDirectory}\``,
    `- Run ID: \`${report.run_id}\``,
    "",
  ];
  appendFileSync(destination, lines.join("\n"), "utf8");
}

function shouldFail(report, threshold) {
  if (threshold === "never") return false;
  if (threshold === "breaking") return report.breaking === true;
  return RISK_RANK[report.risk] >= RISK_RANK[threshold.toUpperCase()];
}

function main() {
  const workspace = resolve(process.env.GITHUB_WORKSPACE || process.cwd());
  const fixture = workspacePath(
    workspace,
    requiredEnvironment("SCHEMA_SHIELD_FIXTURE"),
    "fixture",
  );
  const outputDirectory = workspacePath(
    workspace,
    requiredEnvironment("SCHEMA_SHIELD_OUTPUT_DIRECTORY"),
    "output-directory",
  );
  const threshold = requiredEnvironment("SCHEMA_SHIELD_FAIL_ON").toLowerCase();
  if (!ALLOWED_THRESHOLDS.has(threshold)) {
    throw new Error(`Unsupported fail-on threshold: ${threshold}.`);
  }
  const force = requiredEnvironment("SCHEMA_SHIELD_FORCE").toLowerCase();
  if (force !== "true" && force !== "false") {
    throw new Error("SCHEMA_SHIELD_FORCE must be true or false.");
  }

  const actionRoot = dirname(dirname(fileURLToPath(import.meta.url)));
  const cliPath = resolve(actionRoot, "cli.mjs");
  const args = [cliPath, "--fixture", fixture, "--out", outputDirectory];
  if (force === "true") args.push("--force");
  const result = spawnSync(process.execPath, args, { encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    return;
  }

  const report = JSON.parse(
    readFileSync(resolve(outputDirectory, "impact_report.json"), "utf8"),
  );
  const failed = shouldFail(report, threshold);
  writeOutput("risk", report.risk);
  writeOutput("breaking", report.breaking);
  writeOutput("block-merge", report.block_merge);
  writeOutput("run-id", report.run_id);
  writeOutput("artifact-directory", outputDirectory);
  writeSummary(report, outputDirectory, failed);
  if (failed) {
    process.stderr.write(
      `SchemaShield policy failed: risk=${report.risk}, breaking=${report.breaking}, fail-on=${threshold}.\n`,
    );
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`SchemaShield action failed: ${error.message}\n`);
  process.exitCode = 1;
}
