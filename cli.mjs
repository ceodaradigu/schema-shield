#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { analyzeOffline, OFFLINE_LABEL } from "./core/index.mjs";

const ARTIFACT_NAMES = [
  "compat_view.sql",
  "dbt_schema.yml",
  "impact_report.json",
  "pr_summary.md",
  "provenance.json",
  "submission_status.json",
  "writeback_plan.json",
];

function usage() {
  return [
    "Usage: node cli.mjs --fixture <fixture.mjs> --out <directory> [--force]",
    "",
    OFFLINE_LABEL,
  ].join("\n");
}

function parseArgs(argv) {
  const parsed = { fixture: null, force: false, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--force") {
      parsed.force = true;
    } else if (arg === "--fixture" || arg === "--out") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}.`);
      parsed[arg.slice(2)] = value;
      index += 1;
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return parsed;
}

function serialize(name, value) {
  if (typeof value === "string") return value;
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (!args.fixture || !args.out) {
    process.stderr.write(`Both --fixture and --out are required.\n${usage()}\n`);
    process.exitCode = 2;
    return;
  }

  const fixturePath = resolve(args.fixture);
  const outputDirectory = resolve(args.out);
  const targets = ARTIFACT_NAMES.map((name) => ({
    name,
    path: resolve(outputDirectory, name),
  }));
  const existing = targets.filter((target) => existsSync(target.path));
  if (existing.length && !args.force) {
    process.stderr.write(
      `Refusing to overwrite existing artifacts without --force: ${existing
        .map((target) => target.name)
        .join(", ")}\n`,
    );
    process.exitCode = 1;
    return;
  }

  try {
    const fixtureModule = await import(pathToFileURL(fixturePath).href);
    const fixture = fixtureModule.default;
    if (!fixture) throw new Error("Fixture module must have a default export.");
    const artifacts = analyzeOffline(fixture);
    mkdirSync(outputDirectory, { recursive: true });
    for (const target of targets) {
      writeFileSync(target.path, serialize(target.name, artifacts[target.name]), {
        encoding: "utf8",
        flag: "w",
      });
    }
    process.stdout.write(
      `${JSON.stringify({
        artifact_count: targets.length,
        mode: "offline_snapshot",
        notice: OFFLINE_LABEL,
        output_directory: outputDirectory,
      })}\n`,
    );
  } catch (error) {
    process.stderr.write(`SchemaShield offline run failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

await main();
