export default {
  schemaChange: {
    change_id: "chg-002-add-nullable-note",
    dataset_urn: "urn:li:dataset:(urn:li:dataPlatform:snowflake,acme.orders,PROD)",
    operations: [
      { name: "note", nullable: true, to_type: "STRING", type: "add" },
    ],
    requested_by: "data-platform",
  },
  catalogSnapshot: {
    entities: [
      {
        environment: "PROD",
        fields: ["customer_id", "note", "order_id", "order_total"],
        type: "DATASET",
        urn: "urn:li:dataset:(urn:li:dataPlatform:snowflake,acme.orders,PROD)",
      },
    ],
    lineage: [],
    owners: {
      "urn:li:dataset:(urn:li:dataPlatform:snowflake,acme.orders,PROD)": ["data-platform"],
    },
    queries: [],
    source: {
      captured_at: "2026-08-03T00:00:00Z",
      fixture_id: "add-nullable-note",
      kind: "synthetic_fixture",
      mode: "offline_snapshot",
    },
  },
  policy: { as_of: "2026-08-03T00:00:00Z", version: "1" },
};
