import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const runnerPath = join(repositoryRoot, "action", "run.mjs");
const sourceFixture = join(repositoryRoot, "fixtures", "rename_order_total.mjs");

function runAction(t, overrides = {}) {
  const workspace = mkdtempSync(join(tmpdir(), "schema-shield-action-"));
  t.after(() => rmSync(workspace, { force: true, recursive: true }));
  copyFileSync(sourceFixture, join(workspace, "fixture.mjs"));
  const outputFile = join(workspace, "outputs.txt");
  const summaryFile = join(workspace, "summary.md");
  const result = spawnSync(process.execPath, [runnerPath], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_OUTPUT: outputFile,
      GITHUB_STEP_SUMMARY: summaryFile,
      GITHUB_WORKSPACE: workspace,
      SCHEMA_SHIELD_FAIL_ON: "critical",
      SCHEMA_SHIELD_FIXTURE: "fixture.mjs",
      SCHEMA_SHIELD_FORCE: "false",
      SCHEMA_SHIELD_OUTPUT_DIRECTORY: "artifacts",
      ...overrides,
    },
  });
  return { outputFile, result, summaryFile, workspace };
}

test("action writes outputs and a truthful summary for a passing threshold", (t) => {
  const { outputFile, result, summaryFile, workspace } = runAction(t);
  assert.equal(result.status, 0, result.stderr);
  const outputs = readFileSync(outputFile, "utf8");
  assert.match(outputs, /^risk=HIGH$/m);
  assert.match(outputs, /^breaking=true$/m);
  assert.match(outputs, /^block-merge=false$/m);
  assert.match(outputs, /^run-id=[a-f0-9]{64}$/m);
  assert.match(outputs, new RegExp(`^artifact-directory=${workspace.replaceAll("\\", "\\\\")}[/\\\\]artifacts$`, "m"));
  const summary = readFileSync(summaryFile, "utf8");
  assert.match(summary, /OFFLINE SNAPSHOT — NO LIVE DATAHUB WRITEBACK/);
  assert.match(summary, /Risk: \*\*HIGH\*\*/);
  assert.match(summary, /Policy result: \*\*passed\*\*/);
});

test("action fails when risk reaches the configured threshold", (t) => {
  const { result, summaryFile } = runAction(t, { SCHEMA_SHIELD_FAIL_ON: "high" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /risk=HIGH, breaking=true, fail-on=high/);
  assert.match(readFileSync(summaryFile, "utf8"), /Policy result: \*\*failed\*\*/);
});

test("action rejects fixture traversal outside the workspace", (t) => {
  const { result } = runAction(t, { SCHEMA_SHIELD_FIXTURE: "../fixture.mjs" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /fixture must stay inside GITHUB_WORKSPACE/);
});
