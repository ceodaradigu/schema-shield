import { createHash } from "node:crypto";

export const OFFLINE_LABEL = "OFFLINE SNAPSHOT — NO LIVE DATAHUB WRITEBACK";

const SUPPORTED_OPERATIONS = new Set(["add", "rename", "type_change"]);
const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const SQL_RESERVED_WORDS = new Set([
  "ALTER",
  "CREATE",
  "DELETE",
  "DROP",
  "FROM",
  "GROUP",
  "INSERT",
  "ORDER",
  "SELECT",
  "TABLE",
  "UPDATE",
  "VIEW",
  "WHERE",
]);

export function assertJsonSafe(value, path = "$", seen = new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${path} must be a finite JSON number.`);
    return;
  }
  if (typeof value !== "object") {
    throw new TypeError(`${path} contains a non-JSON value (${typeof value}).`);
  }
  if (seen.has(value)) throw new TypeError(`${path} contains a circular reference.`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafe(item, `${path}[${index}]`, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must be a plain JSON object.`);
    }
    for (const [key, item] of Object.entries(value)) {
      assertJsonSafe(item, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(normalize(value));
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function datasetNameFromUrn(urn) {
  const match = urn.match(/urn:li:dataset:\(urn:li:dataPlatform:[^,]+,([^,]+),[^)]+\)/);
  if (!match) throw new Error(`Unsupported dataset URN: ${urn}`);
  for (const segment of match[1].split(".")) validateSqlIdentifier(segment, "dataset");
  return match[1];
}

function validateSqlIdentifier(identifier, label) {
  if (typeof identifier !== "string" || !SQL_IDENTIFIER.test(identifier)) {
    throw new Error(`Unsafe ${label} identifier: ${String(identifier)}`);
  }
  if (SQL_RESERVED_WORDS.has(identifier.toUpperCase())) {
    throw new Error(`Reserved ${label} identifier is not supported: ${identifier}`);
  }
  return identifier;
}

function downstreamEntities(snapshot, rootUrn) {
  const visited = new Set([rootUrn]);
  const result = new Set();
  const queue = [rootUrn];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of snapshot.lineage ?? []) {
      if (edge.upstream !== current || visited.has(edge.downstream)) continue;
      visited.add(edge.downstream);
      result.add(edge.downstream);
      queue.push(edge.downstream);
    }
  }
  return [...result].sort();
}

function affectedQueries(snapshot, datasetUrn, fieldName) {
  return sortedUnique(
    (snapshot.queries ?? [])
      .filter(
        (query) =>
          query.dataset_urn === datasetUrn &&
          (query.columns ?? []).includes(fieldName),
      )
      .map((query) => query.id),
  );
}

function evidenceRef(kind, index) {
  return index === undefined
    ? `catalog_snapshot.json#/${kind}`
    : `catalog_snapshot.json#/${kind}/${index}`;
}

function entityEvidence(snapshot, urn) {
  const index = (snapshot.entities ?? []).findIndex((entity) => entity.urn === urn);
  if (index < 0) throw new Error(`Missing entity evidence for ${urn}`);
  return evidenceRef("entities", index);
}

function lineageEvidence(snapshot, urn) {
  const index = (snapshot.lineage ?? []).findIndex((edge) => edge.downstream === urn);
  if (index < 0) throw new Error(`Missing lineage evidence for ${urn}`);
  return evidenceRef("lineage", index);
}

function queryEvidence(snapshot, id) {
  const index = (snapshot.queries ?? []).findIndex((query) => query.id === id);
  if (index < 0) throw new Error(`Missing query evidence for ${id}`);
  return evidenceRef("queries", index);
}

function validateOperationEvidence(change, snapshot, operation) {
  if (!SUPPORTED_OPERATIONS.has(operation.type)) {
    throw new Error(`Unsupported schema operation: ${String(operation.type)}`);
  }
  const entity = (snapshot.entities ?? []).find(
    (candidate) => candidate.urn === change.dataset_urn,
  );
  if (!entity) throw new Error(`Dataset is absent from snapshot: ${change.dataset_urn}`);
  datasetNameFromUrn(change.dataset_urn);
  const fields = new Set(entity.fields ?? []);
  if (operation.type === "rename") {
    validateSqlIdentifier(operation.from, "source column");
    validateSqlIdentifier(operation.to, "target column");
    if (operation.from === operation.to) throw new Error("Rename identifiers must differ.");
    if (!fields.has(operation.to)) {
      throw new Error(`Rename target is absent from post-change schema: ${operation.to}`);
    }
    if (fields.has(operation.from)) {
      throw new Error(`Rename source remains in post-change schema: ${operation.from}`);
    }
  }
  if (operation.type === "type_change") {
    validateSqlIdentifier(operation.from, "changed column");
    if (operation.lossy !== true) {
      throw new Error("Unsupported type_change variant: only explicit lossy changes are modeled.");
    }
    if (!fields.has(operation.from)) {
      throw new Error(`Changed field is absent from schema: ${operation.from}`);
    }
  }
  if (operation.type === "add") {
    validateSqlIdentifier(operation.name, "added column");
    if (operation.nullable !== true) {
      throw new Error("Unsupported add variant: only nullable additions are modeled.");
    }
    if (!fields.has(operation.name)) {
      throw new Error(`Added field is absent from post-change schema: ${operation.name}`);
    }
  }
}

function renderCompatibilitySql(change, operation) {
  if (operation.type === "add" && operation.nullable === true) {
    return `-- ${OFFLINE_LABEL}\n-- No compatibility view required.\n`;
  }
  if (operation.type === "type_change" && operation.lossy === true) {
    return `-- ${OFFLINE_LABEL}\n-- Unsafe lossy type change; no automatic compatibility SQL generated.\n`;
  }
  if (operation.type === "rename") {
    const source = datasetNameFromUrn(change.dataset_urn);
    return [
      `-- ${OFFLINE_LABEL}`,
      "CREATE VIEW schema_shield_compat AS",
      "SELECT",
      "  *,",
      `  ${operation.to} AS ${operation.from}`,
      `FROM ${source};`,
      "",
    ].join("\n");
  }
  throw new Error(`No compatibility renderer for operation: ${operation.type}`);
}

function renderDbtSchema(change, operation) {
  const dataset = datasetNameFromUrn(change.dataset_urn).split(".").at(-1);
  if (operation.type === "rename") {
    return [
      `# ${OFFLINE_LABEL}`,
      "version: 2",
      "models:",
      `  - name: ${dataset}_compat`,
      "    columns:",
      `      - name: ${operation.from}`,
      `        description: "Compatibility alias for ${operation.to}."`,
      "",
    ].join("\n");
  }
  return [`# ${OFFLINE_LABEL}`, "version: 2", "models: []", ""].join("\n");
}

function makeFinding(reason, refs) {
  return { reason, evidence_refs: sortedUnique(refs) };
}

function derive(change, snapshot) {
  if (!Array.isArray(change.operations) || change.operations.length !== 1) {
    throw new Error("Offline core currently requires exactly one schema operation.");
  }
  const operation = change.operations[0];
  validateOperationEvidence(change, snapshot, operation);
  const impacted = downstreamEntities(snapshot, change.dataset_urn);
  const field = operation.from ?? operation.name;
  const queries = affectedQueries(snapshot, change.dataset_urn, field);
  const owners = snapshot.owners?.[change.dataset_urn] ?? [];
  const mlEntities = new Set(
    (snapshot.entities ?? [])
      .filter((entity) => entity.type === "ML_MODEL" && entity.environment === "PROD")
      .map((entity) => entity.urn),
  );
  const hasProductionMlDependency = impacted.some((urn) => mlEntities.has(urn));

  const findings = [];
  if (operation.type === "add" && operation.nullable === true) {
    findings.push(
      makeFinding("BACKWARD_COMPATIBLE_ADDITION", [
        entityEvidence(snapshot, change.dataset_urn),
      ]),
    );
  } else if (operation.type === "rename") {
    findings.push(
      makeFinding("COLUMN_RENAME", [entityEvidence(snapshot, change.dataset_urn)]),
    );
  } else if (operation.type === "type_change" && operation.lossy === true) {
    findings.push(
      makeFinding("LOSSY_TYPE_CHANGE", [entityEvidence(snapshot, change.dataset_urn)]),
    );
  }
  if (impacted.length) {
    findings.push(
      makeFinding(
        "DOWNSTREAM_DATASET_LINEAGE",
        impacted.map((urn) => lineageEvidence(snapshot, urn)),
      ),
    );
  }
  if (queries.length) {
    findings.push(
      makeFinding(
        "QUERY_REFERENCE",
        queries.map((id) => queryEvidence(snapshot, id)),
      ),
    );
  }
  if (hasProductionMlDependency) {
    findings.push(
      makeFinding(
        "PRODUCTION_ML_DEPENDENCY",
        impacted.filter((urn) => mlEntities.has(urn)).map((urn) => entityEvidence(snapshot, urn)),
      ),
    );
  }
  if (owners.length === 0 && operation.type === "type_change") {
    findings.push(
      makeFinding("MISSING_OWNER", [evidenceRef("owners")]),
    );
  }

  const reasons = sortedUnique(findings.map((finding) => finding.reason));
  const breaking = !(operation.type === "add" && operation.nullable === true);
  const risk =
    operation.lossy && hasProductionMlDependency
      ? "CRITICAL"
      : breaking && (impacted.length || queries.length)
        ? "HIGH"
        : breaking
          ? "MEDIUM"
          : "LOW";

  return {
    operation,
    impacted,
    queries,
    findings: findings.sort((a, b) => a.reason.localeCompare(b.reason)),
    reasons,
    breaking,
    risk,
    blockMerge: risk === "CRITICAL",
    manualReview: breaking,
  };
}

function writebackActions(derived, change) {
  if (!derived.breaking) return [];
  const suffix = derived.risk.toLowerCase();
  return [
    {
      action: "add_tags",
      applied: false,
      status: "pending_approval",
      tag: `schema-change-risk-${suffix}`,
      urn: change.dataset_urn,
    },
    {
      action: "save_document",
      applied: false,
      status: "pending_approval",
      urn: change.dataset_urn,
    },
  ].sort((a, b) => a.action.localeCompare(b.action));
}

function renderImpactMarkdown(report) {
  const impacted = report.impacted_entities.length
    ? report.impacted_entities.map((urn) => `- ${urn}`).join("\n")
    : "- None";
  return [
    OFFLINE_LABEL,
    "",
    `# Schema impact: ${report.change_id}`,
    "",
    `Risk: ${report.risk}`,
    `Breaking: ${report.breaking}`,
    `Block merge: ${report.block_merge}`,
    "",
    "## Impacted entities",
    impacted,
    "",
    `Affected queries: ${report.affected_query_ids.join(", ") || "None"}`,
    `Reasons: ${report.reasons.join(", ")}`,
    "",
  ].join("\n");
}

export function analyzeOffline({ schemaChange, catalogSnapshot, policy }) {
  assertJsonSafe(schemaChange, "$.schemaChange");
  assertJsonSafe(catalogSnapshot, "$.catalogSnapshot");
  assertJsonSafe(policy, "$.policy");
  if (catalogSnapshot.source?.mode !== "offline_snapshot") {
    throw new Error("This core accepts only explicitly labeled offline snapshots.");
  }
  if (catalogSnapshot.source?.kind !== "synthetic_fixture") {
    throw new Error("Offline snapshots must explicitly declare source.kind=synthetic_fixture.");
  }
  if (typeof policy.as_of !== "string" || catalogSnapshot.source.captured_at !== policy.as_of) {
    throw new Error("Synthetic snapshot captured_at must equal the fixed policy as_of timestamp.");
  }
  const runId = sha256(
    canonicalJson(schemaChange) + canonicalJson(catalogSnapshot) + canonicalJson(policy),
  );
  const derived = derive(schemaChange, catalogSnapshot);
  const impactReport = {
    affected_query_ids: derived.queries,
    block_merge: derived.blockMerge,
    breaking: derived.breaking,
    change_id: schemaChange.change_id,
    dataset_urn: schemaChange.dataset_urn,
    findings: derived.findings,
    impacted_entities: derived.impacted,
    manual_review_required: derived.manualReview,
    mode: "offline_snapshot",
    notice: OFFLINE_LABEL,
    reasons: derived.reasons,
    risk: derived.risk,
    run_id: runId,
  };
  const actions = writebackActions(derived, schemaChange);
  const writebackPlan = {
    actions,
    applied: false,
    mode: "offline_snapshot",
    notice: OFFLINE_LABEL,
  };
  const submissionStatus = {
    live_datahub_verified: false,
    notice: OFFLINE_LABEL,
    submission_ready: false,
    truthful_status: "Core engine verified offline; live DataHub integration not yet verified",
  };
  const provenance = {
    as_of: policy.as_of,
    input_hashes: {
      catalog_snapshot: sha256(canonicalJson(catalogSnapshot)),
      policy: sha256(canonicalJson(policy)),
      schema_change: sha256(canonicalJson(schemaChange)),
    },
    mode: "offline_snapshot",
    notice: OFFLINE_LABEL,
    run_id: runId,
    source: normalize({
      ...catalogSnapshot.source,
      content_sha256: sha256(canonicalJson(catalogSnapshot)),
    }),
  };
  const compatSql = renderCompatibilitySql(schemaChange, derived.operation);
  const dbtSchema = renderDbtSchema(schemaChange, derived.operation);
  const impactMarkdown = renderImpactMarkdown(impactReport);
  const prSummary = [
    OFFLINE_LABEL,
    "",
    `SchemaShield result: ${derived.risk}`,
    `Breaking change: ${derived.breaking}`,
    `Impacted assets: ${derived.impacted.length}`,
    `Manual review required: ${derived.manualReview}`,
    "",
  ].join("\n");

  return normalize({
    "compat_view.sql": compatSql,
    "dbt_schema.yml": dbtSchema,
    "impact_report.json": impactReport,
    "impact_report.md": impactMarkdown,
    "pr_summary.md": prSummary,
    "provenance.json": provenance,
    "submission_status.json": submissionStatus,
    "writeback_plan.json": writebackPlan,
  });
}
