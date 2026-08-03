export default {
  schemaChange: {
    change_id: "chg-003-lossy-fare-amount",
    dataset_urn: "urn:li:dataset:(urn:li:dataPlatform:postgres,taxi.trips,PROD)",
    operations: [
      {
        from: "fare_amount",
        from_type: "DECIMAL(12,2)",
        lossy: true,
        to_type: "INTEGER",
        type: "type_change",
      },
    ],
    requested_by: "ml-platform",
  },
  catalogSnapshot: {
    entities: [
      {
        environment: "PROD",
        fields: ["fare_amount", "pickup_datetime", "trip_id"],
        type: "DATASET",
        urn: "urn:li:dataset:(urn:li:dataPlatform:postgres,taxi.trips,PROD)",
      },
      {
        environment: "PROD",
        type: "ML_MODEL",
        urn: "urn:li:mlModel:(urn:li:dataPlatform:mlflow,fare_predictor_v1,PROD)",
      },
    ],
    lineage: [
      {
        downstream: "urn:li:mlModel:(urn:li:dataPlatform:mlflow,fare_predictor_v1,PROD)",
        upstream: "urn:li:dataset:(urn:li:dataPlatform:postgres,taxi.trips,PROD)",
      },
    ],
    owners: {},
    queries: [
      {
        columns: ["fare_amount"],
        dataset_urn: "urn:li:dataset:(urn:li:dataPlatform:postgres,taxi.trips,PROD)",
        id: "q-900",
        sql: "SELECT AVG(fare_amount) FROM taxi.trips",
      },
    ],
    source: {
      captured_at: "2026-08-03T00:00:00Z",
      fixture_id: "lossy-type-change-ml",
      kind: "synthetic_fixture",
      mode: "offline_snapshot",
    },
  },
  policy: { as_of: "2026-08-03T00:00:00Z", version: "1" },
};
