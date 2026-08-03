export default {
  schemaChange: {
    change_id: "chg-001-rename-order-total",
    dataset_urn: "urn:li:dataset:(urn:li:dataPlatform:snowflake,acme.orders,PROD)",
    operations: [
      {
        from: "order_total",
        from_type: "DECIMAL(12,2)",
        to: "gross_amount",
        to_type: "DECIMAL(12,2)",
        type: "rename",
      },
    ],
    requested_by: "data-platform",
  },
  catalogSnapshot: {
    entities: [
      {
        environment: "PROD",
        fields: ["customer_id", "gross_amount", "order_id"],
        type: "DATASET",
        urn: "urn:li:dataset:(urn:li:dataPlatform:snowflake,acme.orders,PROD)",
      },
      {
        environment: "PROD",
        fields: ["customer_id", "order_total"],
        type: "DATASET",
        urn: "urn:li:dataset:(urn:li:dataPlatform:dbt,acme.order_facts,PROD)",
      },
      {
        environment: "PROD",
        type: "DASHBOARD",
        urn: "urn:li:dashboard:(looker,revenue_dashboard)",
      },
    ],
    lineage: [
      {
        downstream: "urn:li:dataset:(urn:li:dataPlatform:dbt,acme.order_facts,PROD)",
        upstream: "urn:li:dataset:(urn:li:dataPlatform:snowflake,acme.orders,PROD)",
      },
      {
        downstream: "urn:li:dashboard:(looker,revenue_dashboard)",
        upstream: "urn:li:dataset:(urn:li:dataPlatform:dbt,acme.order_facts,PROD)",
      },
    ],
    owners: {
      "urn:li:dataset:(urn:li:dataPlatform:snowflake,acme.orders,PROD)": ["data-platform"],
    },
    queries: [
      {
        columns: ["order_total"],
        dataset_urn: "urn:li:dataset:(urn:li:dataPlatform:snowflake,acme.orders,PROD)",
        id: "q-001",
        sql: "SELECT SUM(order_total) FROM acme.orders",
      },
    ],
    source: {
      captured_at: "2026-08-03T00:00:00Z",
      fixture_id: "rename-order-total",
      kind: "synthetic_fixture",
      mode: "offline_snapshot",
    },
  },
  policy: { as_of: "2026-08-03T00:00:00Z", version: "1" },
};
