import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  analyzeOffline,
  canonicalJson,
  OFFLINE_LABEL,
  sha256,
} from "../core/index.mjs";
import addNullableNote from "../fixtures/add_nullable_note.mjs";
import lossyTypeChangeMl from "../fixtures/lossy_type_change_ml.mjs";
import renameOrderTotal from "../fixtures/rename_order_total.mjs";

const fixtures = [renameOrderTotal, addNullableNote, lossyTypeChangeMl];

test("A01-A03: output is byte-deterministic with canonical run id", () => {
  for (const fixture of fixtures) {
    const first = analyzeOffline(fixture);
    const second = analyzeOffline(fixture);
    assert.equal(canonicalJson(first), canonicalJson(second));
    assert.equal(
      first["impact_report.json"].run_id,
      sha256(
        canonicalJson(fixture.schemaChange) +
          canonicalJson(fixture.catalogSnapshot) +
          canonicalJson(fixture.policy),
      ),
    );
    assert.deepEqual(
      first["impact_report.json"].reasons,
      [...first["impact_report.json"].reasons].sort(),
    );
    assert.deepEqual(
      first["impact_report.json"].impacted_entities,
      [...first["impact_report.json"].impacted_entities].sort(),
    );
  }
});

function resolveEvidencePointer(snapshot, ref) {
  const pointer = ref.replace("catalog_snapshot.json#/", "");
  return pointer.split("/").reduce((value, part) => value?.[part], snapshot);
}

test("A04-A06: findings have real evidence paths and markdown mirrors machine truth", () => {
  for (const fixture of fixtures) {
    const output = analyzeOffline(fixture);
    const report = output["impact_report.json"];
    for (const finding of report.findings) {
      assert.ok(finding.evidence_refs.length > 0);
      for (const ref of finding.evidence_refs) {
        assert.match(ref, /^catalog_snapshot\.json#\//);
        assert.notEqual(resolveEvidencePointer(fixture.catalogSnapshot, ref), undefined);
      }
    }
    const markdown = output["impact_report.md"];
    assert.match(markdown, new RegExp(`Risk: ${report.risk}`));
    assert.match(markdown, new RegExp(`Breaking: ${report.breaking}`));
    for (const urn of report.impacted_entities) assert.ok(markdown.includes(urn));
    for (const query of report.affected_query_ids) assert.ok(markdown.includes(query));
    for (const reason of report.reasons) assert.ok(markdown.includes(reason));
  }
});

test("A08-A10: offline outputs are labeled, never applied, never submission-ready", () => {
  for (const fixture of fixtures) {
    const output = analyzeOffline(fixture);
    assert.equal(output["writeback_plan.json"].applied, false);
    assert.ok(output["impact_report.md"].startsWith(OFFLINE_LABEL));
    assert.ok(output["pr_summary.md"].startsWith(OFFLINE_LABEL));
    assert.equal(output["impact_report.json"].notice, OFFLINE_LABEL);
    assert.equal(output["provenance.json"].notice, OFFLINE_LABEL);
    assert.equal(output["submission_status.json"].notice, OFFLINE_LABEL);
    assert.equal(output["submission_status.json"].live_datahub_verified, false);
    assert.equal(output["submission_status.json"].submission_ready, false);
    for (const action of output["writeback_plan.json"].actions) {
      assert.equal(action.applied, false);
      assert.equal(action.status, "pending_approval");
    }
  }
});

test("F1: rename reports exact impact and generates compatibility artifacts", () => {
  const output = analyzeOffline(renameOrderTotal);
  const report = output["impact_report.json"];
  assert.equal(report.breaking, true);
  assert.equal(report.risk, "HIGH");
  assert.deepEqual(report.impacted_entities, [
    "urn:li:dashboard:(looker,revenue_dashboard)",
    "urn:li:dataset:(urn:li:dataPlatform:dbt,acme.order_facts,PROD)",
  ]);
  assert.deepEqual(report.affected_query_ids, ["q-001"]);
  assert.deepEqual(report.reasons, [
    "COLUMN_RENAME",
    "DOWNSTREAM_DATASET_LINEAGE",
    "QUERY_REFERENCE",
  ]);
  assert.ok(output["compat_view.sql"].startsWith(`-- ${OFFLINE_LABEL}\n`));
  assert.match(output["compat_view.sql"], /gross_amount AS order_total/);
  assert.match(
    output["compat_view.sql"],
    /^-- OFFLINE SNAPSHOT — NO LIVE DATAHUB WRITEBACK\nCREATE VIEW schema_shield_compat AS\nSELECT\n[\s\S]+\nFROM acme\.orders;\n$/,
  );
  assert.ok(
    renameOrderTotal.catalogSnapshot.entities[0].fields.includes("gross_amount"),
  );
  assert.ok(output["dbt_schema.yml"].startsWith(`# ${OFFLINE_LABEL}\n`));
  assert.match(output["dbt_schema.yml"], /- name: order_total\n\s+description:/);
  assert.doesNotMatch(output["dbt_schema.yml"], /not_null/);
  assert.deepEqual(
    output["writeback_plan.json"].actions.map((action) => action.action),
    ["add_tags", "save_document"],
  );
  assert.equal(report.block_merge, false);
  assert.equal(report.manual_review_required, true);
});

test("F2: nullable addition is low-risk and needs no compatibility action", () => {
  const output = analyzeOffline(addNullableNote);
  const report = output["impact_report.json"];
  assert.equal(report.breaking, false);
  assert.equal(report.risk, "LOW");
  assert.deepEqual(report.impacted_entities, []);
  assert.deepEqual(report.affected_query_ids, []);
  assert.deepEqual(report.reasons, ["BACKWARD_COMPATIBLE_ADDITION"]);
  assert.equal(
    output["compat_view.sql"],
    `-- ${OFFLINE_LABEL}\n-- No compatibility view required.\n`,
  );
  assert.deepEqual(output["writeback_plan.json"].actions, []);
  assert.equal(report.block_merge, false);
  assert.equal(report.manual_review_required, false);
});

test("F3: lossy type change with production ML dependency fails closed", () => {
  const output = analyzeOffline(lossyTypeChangeMl);
  const report = output["impact_report.json"];
  assert.equal(report.breaking, true);
  assert.equal(report.risk, "CRITICAL");
  assert.deepEqual(report.affected_query_ids, ["q-900"]);
  assert.deepEqual(report.impacted_entities, [
    "urn:li:mlModel:(urn:li:dataPlatform:mlflow,fare_predictor_v1,PROD)",
  ]);
  assert.deepEqual(report.reasons, [
    "DOWNSTREAM_DATASET_LINEAGE",
    "LOSSY_TYPE_CHANGE",
    "MISSING_OWNER",
    "PRODUCTION_ML_DEPENDENCY",
    "QUERY_REFERENCE",
  ]);
  assert.equal(
    output["compat_view.sql"],
    `-- ${OFFLINE_LABEL}\n-- Unsafe lossy type change; no automatic compatibility SQL generated.\n`,
  );
  assert.equal(report.block_merge, true);
  assert.equal(report.manual_review_required, true);
  assert.ok(output["writeback_plan.json"].actions.every((action) => !action.applied));
});

test("offline core rejects snapshots that are not explicitly offline", () => {
  const invalid = structuredClone(addNullableNote);
  invalid.catalogSnapshot.source.mode = "live_datahub";
  assert.throws(
    () => analyzeOffline(invalid),
    /only explicitly labeled offline snapshots/,
  );
});

test("A07: core rejects generated-column claims absent from snapshot evidence", () => {
  const invalid = structuredClone(renameOrderTotal);
  invalid.catalogSnapshot.entities[0].fields = ["customer_id", "order_id"];
  assert.throws(
    () => analyzeOffline(invalid),
    /Rename target is absent from post-change schema/,
  );
});

test("strict JSON-safe validation rejects ambiguous or non-JSON input", () => {
  const withNaN = structuredClone(addNullableNote);
  withNaN.policy.version = Number.NaN;
  assert.throws(() => analyzeOffline(withNaN), /finite JSON number/);

  const withUndefined = structuredClone(addNullableNote);
  withUndefined.policy.extra = undefined;
  assert.throws(() => analyzeOffline(withUndefined), /non-JSON value/);

  const withDate = structuredClone(addNullableNote);
  withDate.policy.extra = new Date("2026-08-03T00:00:00Z");
  assert.throws(() => analyzeOffline(withDate), /plain JSON object/);

  const circular = structuredClone(addNullableNote);
  circular.policy.self = circular.policy;
  assert.throws(() => analyzeOffline(circular), /circular reference/);
});

test("unsupported operation types and variants fail closed", () => {
  const drop = structuredClone(addNullableNote);
  drop.schemaChange.operations = [{ from: "note", type: "drop" }];
  assert.throws(() => analyzeOffline(drop), /Unsupported schema operation: drop/);

  const nonNullable = structuredClone(addNullableNote);
  nonNullable.schemaChange.operations[0].nullable = false;
  assert.throws(() => analyzeOffline(nonNullable), /only nullable additions/);

  const nonLossy = structuredClone(lossyTypeChangeMl);
  nonLossy.schemaChange.operations[0].lossy = false;
  assert.throws(() => analyzeOffline(nonLossy), /only explicit lossy changes/);
});

test("unsafe SQL identifiers fail closed", () => {
  const invalid = structuredClone(renameOrderTotal);
  invalid.schemaChange.operations[0].to = "gross_amount;DROP_TABLE";
  invalid.catalogSnapshot.entities[0].fields = [
    "customer_id",
    "gross_amount;DROP_TABLE",
    "order_id",
  ];
  assert.throws(() => analyzeOffline(invalid), /Unsafe target column identifier/);
});

test("cyclic lineage never reports the changed root as downstream impact", () => {
  const cyclic = structuredClone(renameOrderTotal);
  cyclic.catalogSnapshot.lineage.push({
    downstream: cyclic.schemaChange.dataset_urn,
    upstream: "urn:li:dashboard:(looker,revenue_dashboard)",
  });
  const report = analyzeOffline(cyclic)["impact_report.json"];
  assert.ok(!report.impacted_entities.includes(cyclic.schemaChange.dataset_urn));
  assert.deepEqual(report.impacted_entities, [
    "urn:li:dashboard:(looker,revenue_dashboard)",
    "urn:li:dataset:(urn:li:dataPlatform:dbt,acme.order_facts,PROD)",
  ]);
});

test("synthetic provenance contains a computed content hash and no fake version", () => {
  for (const fixture of fixtures) {
    const provenance = analyzeOffline(fixture)["provenance.json"];
    assert.equal(provenance.source.kind, "synthetic_fixture");
    assert.match(provenance.source.content_sha256, /^[a-f0-9]{64}$/);
    assert.equal(
      provenance.source.content_sha256,
      sha256(canonicalJson(fixture.catalogSnapshot)),
    );
    assert.equal("snapshot_sha256" in provenance.source, false);
    assert.equal("datahub_version" in provenance.source, false);
  }
});

test("synthetic timestamp must be the fixed policy as_of", () => {
  const invalid = structuredClone(addNullableNote);
  invalid.catalogSnapshot.source.captured_at = "2026-08-03T00:00:01Z";
  assert.throws(() => analyzeOffline(invalid), /must equal the fixed policy as_of/);
});

test("CLI writes exactly seven artifacts and refuses overwrite without --force", (t) => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "schema-shield-test-"));
  t.after(() => rmSync(temporaryRoot, { force: true, recursive: true }));
  const outputDirectory = join(temporaryRoot, "artifacts");
  const cliPath = fileURLToPath(new URL("../cli.mjs", import.meta.url));
  const fixturePath = fileURLToPath(
    new URL("../fixtures/rename_order_total.mjs", import.meta.url),
  );
  const args = [cliPath, "--fixture", fixturePath, "--out", outputDirectory];

  const first = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  assert.deepEqual(readdirSync(outputDirectory).sort(), [
    "compat_view.sql",
    "dbt_schema.yml",
    "impact_report.json",
    "pr_summary.md",
    "provenance.json",
    "submission_status.json",
    "writeback_plan.json",
  ]);
  assert.ok(readFileSync(join(outputDirectory, "compat_view.sql"), "utf8").includes(OFFLINE_LABEL));
  assert.equal(
    JSON.parse(readFileSync(join(outputDirectory, "submission_status.json"), "utf8"))
      .submission_ready,
    false,
  );

  const second = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(second.status, 1);
  assert.match(second.stderr, /Refusing to overwrite existing artifacts without --force/);

  writeFileSync(join(outputDirectory, "keep.txt"), "unrelated", "utf8");
  const forced = spawnSync(process.execPath, [...args, "--force"], { encoding: "utf8" });
  assert.equal(forced.status, 0, forced.stderr);
  assert.equal(readFileSync(join(outputDirectory, "keep.txt"), "utf8"), "unrelated");
});
