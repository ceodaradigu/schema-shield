import assert from "node:assert/strict";
import test from "node:test";

import { analyzeSchemaRisk } from "../lib/schema-risk.mjs";

const base = {
  root: "orders",
  dataset: "analytics.orders",
  operation: { type: "rename", from: "order_total", to: "gross_amount" },
  entities: [
    { id: "orders", type: "dataset", environment: "PROD" },
    { id: "order_facts", type: "dataset", environment: "PROD" },
    { id: "revenue_dashboard", type: "dashboard", environment: "PROD" },
  ],
  lineage: [
    { upstream: "orders", downstream: "order_facts" },
    { upstream: "order_facts", downstream: "revenue_dashboard" },
  ],
  queries: [{ id: "q-1", entity: "orders", fields: ["order_total"] }],
};

test("finds multi-hop impact and returns compatibility SQL for a rename", () => {
  const result = analyzeSchemaRisk(base);
  assert.equal(result.risk, "HIGH");
  assert.deepEqual(result.impacted_entities, ["order_facts", "revenue_dashboard"]);
  assert.deepEqual(result.affected_query_ids, ["q-1"]);
  assert.match(result.compatibility_sql, /gross_amount AS order_total/);
  assert.equal(result.mode, "user_supplied_snapshot");
});

test("marks a nullable addition as low risk", () => {
  const result = analyzeSchemaRisk({
    ...base,
    operation: { type: "add", field: "note", nullable: true },
    lineage: [],
    queries: [],
  });
  assert.equal(result.risk, "LOW");
  assert.equal(result.breaking, false);
  assert.equal(result.compatibility_sql, null);
});

test("marks a lossy type change with a production model dependency as critical", () => {
  const result = analyzeSchemaRisk({
    ...base,
    operation: { type: "type_change", field: "order_total", lossy: true },
    entities: [
      { id: "orders", type: "dataset", environment: "PROD" },
      { id: "churn_model", type: "ml_model", environment: "PROD" },
    ],
    lineage: [{ upstream: "orders", downstream: "churn_model" }],
  });
  assert.equal(result.risk, "CRITICAL");
  assert.equal(result.block_merge, true);
});

test("rejects unsafe SQL identifiers and undeclared lineage entities", () => {
  assert.throws(
    () => analyzeSchemaRisk({ ...base, dataset: "analytics.orders;DROP TABLE users" }),
    /safe dot-separated identifiers/,
  );
  assert.throws(
    () => analyzeSchemaRisk({ ...base, lineage: [{ upstream: "orders", downstream: "missing" }] }),
    /declared entities/,
  );
});

