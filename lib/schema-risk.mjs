const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const DATASET = /^[A-Za-z_][A-Za-z0-9_$]*(\.[A-Za-z_][A-Za-z0-9_$]*)*$/;
const OPERATION_TYPES = new Set(["add", "rename", "type_change"]);
const ENTITY_TYPES = new Set(["dataset", "dashboard", "ml_model", "report", "pipeline"]);
const MAX_ENTITIES = 200;
const MAX_EDGES = 500;
const MAX_QUERIES = 200;

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function requireString(value, label, max = 160) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new TypeError(`${label} must be a non-empty string of at most ${max} characters.`);
  }
  return value;
}

function requireIdentifier(value, label) {
  const result = requireString(value, label, 64);
  if (!IDENTIFIER.test(result)) throw new TypeError(`${label} must be a safe SQL identifier.`);
  return result;
}

function requireArray(value, label, max) {
  if (!Array.isArray(value) || value.length > max) {
    throw new TypeError(`${label} must be an array with at most ${max} items.`);
  }
  return value;
}

function unique(values) {
  return [...new Set(values)].sort();
}

function normalizeInput(payload) {
  const input = requireObject(payload, "request body");
  const root = requireString(input.root, "root");
  const dataset = requireString(input.dataset, "dataset", 160);
  if (!DATASET.test(dataset)) throw new TypeError("dataset must contain safe dot-separated identifiers.");

  const rawOperation = requireObject(input.operation, "operation");
  const type = requireString(rawOperation.type, "operation.type", 32);
  if (!OPERATION_TYPES.has(type)) {
    throw new TypeError("operation.type must be add, rename, or type_change.");
  }

  let operation;
  if (type === "rename") {
    const from = requireIdentifier(rawOperation.from, "operation.from");
    const to = requireIdentifier(rawOperation.to, "operation.to");
    if (from === to) throw new TypeError("operation.from and operation.to must differ.");
    operation = { type, from, to };
  } else if (type === "type_change") {
    operation = {
      type,
      field: requireIdentifier(rawOperation.field, "operation.field"),
      lossy: rawOperation.lossy === true,
    };
  } else {
    operation = {
      type,
      field: requireIdentifier(rawOperation.field, "operation.field"),
      nullable: rawOperation.nullable === true,
    };
  }

  const entities = requireArray(input.entities ?? [], "entities", MAX_ENTITIES).map((item, index) => {
    const entity = requireObject(item, `entities[${index}]`);
    const entityType = requireString(entity.type, `entities[${index}].type`, 32).toLowerCase();
    if (!ENTITY_TYPES.has(entityType)) {
      throw new TypeError(`entities[${index}].type is not supported.`);
    }
    return {
      id: requireString(entity.id, `entities[${index}].id`),
      type: entityType,
      environment: typeof entity.environment === "string" ? entity.environment.slice(0, 32) : "UNKNOWN",
    };
  });

  const entityIds = new Set(entities.map((entity) => entity.id));
  if (!entityIds.has(root)) throw new TypeError("entities must include the root entity.");

  const lineage = requireArray(input.lineage ?? [], "lineage", MAX_EDGES).map((item, index) => {
    const edge = requireObject(item, `lineage[${index}]`);
    const upstream = requireString(edge.upstream, `lineage[${index}].upstream`);
    const downstream = requireString(edge.downstream, `lineage[${index}].downstream`);
    if (!entityIds.has(upstream) || !entityIds.has(downstream)) {
      throw new TypeError(`lineage[${index}] must reference declared entities.`);
    }
    return { upstream, downstream };
  });

  const queries = requireArray(input.queries ?? [], "queries", MAX_QUERIES).map((item, index) => {
    const query = requireObject(item, `queries[${index}]`);
    return {
      id: requireString(query.id, `queries[${index}].id`),
      entity: requireString(query.entity, `queries[${index}].entity`),
      fields: requireArray(query.fields ?? [], `queries[${index}].fields`, 100).map((field, fieldIndex) =>
        requireIdentifier(field, `queries[${index}].fields[${fieldIndex}]`),
      ),
    };
  });

  return { root, dataset, operation, entities, lineage, queries };
}

function downstreamOf(root, lineage) {
  const queue = [root];
  const visited = new Set([root]);
  const result = [];
  while (queue.length) {
    const current = queue.shift();
    for (const edge of lineage) {
      if (edge.upstream !== current || visited.has(edge.downstream)) continue;
      visited.add(edge.downstream);
      result.push(edge.downstream);
      queue.push(edge.downstream);
    }
  }
  return result.sort();
}

export function analyzeSchemaRisk(payload) {
  const input = normalizeInput(payload);
  const impactedEntities = downstreamOf(input.root, input.lineage);
  const changedField = input.operation.from ?? input.operation.field;
  const affectedQueries = unique(
    input.queries
      .filter((query) => query.entity === input.root && query.fields.includes(changedField))
      .map((query) => query.id),
  );
  const entityById = new Map(input.entities.map((entity) => [entity.id, entity]));
  const hasProductionMlDependency = impactedEntities.some((id) => {
    const entity = entityById.get(id);
    return entity?.type === "ml_model" && entity.environment.toUpperCase() === "PROD";
  });

  const breaking =
    input.operation.type === "rename" ||
    (input.operation.type === "type_change" && input.operation.lossy) ||
    (input.operation.type === "add" && !input.operation.nullable);
  const reasons = [];
  if (input.operation.type === "rename") reasons.push("COLUMN_RENAME");
  if (input.operation.type === "type_change" && input.operation.lossy) reasons.push("LOSSY_TYPE_CHANGE");
  if (input.operation.type === "add" && input.operation.nullable) reasons.push("BACKWARD_COMPATIBLE_ADDITION");
  if (impactedEntities.length) reasons.push("DOWNSTREAM_LINEAGE");
  if (affectedQueries.length) reasons.push("QUERY_REFERENCE");
  if (hasProductionMlDependency) reasons.push("PRODUCTION_ML_DEPENDENCY");

  const risk =
    input.operation.type === "type_change" && input.operation.lossy && hasProductionMlDependency
      ? "CRITICAL"
      : breaking && (impactedEntities.length > 0 || affectedQueries.length > 0)
        ? "HIGH"
        : breaking
          ? "MEDIUM"
          : "LOW";

  const compatibilitySql =
    input.operation.type === "rename"
      ? `CREATE VIEW schema_change_compat AS\nSELECT *, ${input.operation.to} AS ${input.operation.from}\nFROM ${input.dataset};`
      : null;

  return {
    risk,
    breaking,
    block_merge: risk === "CRITICAL",
    manual_review_required: breaking,
    impacted_entities: impactedEntities,
    affected_query_ids: affectedQueries,
    reasons: unique(reasons),
    compatibility_sql: compatibilitySql,
    mode: "user_supplied_snapshot",
    notice: "Deterministic analysis of the submitted snapshot only. No database or catalog was accessed or modified.",
    limits: { entities: MAX_ENTITIES, lineage_edges: MAX_EDGES, queries: MAX_QUERIES },
  };
}

