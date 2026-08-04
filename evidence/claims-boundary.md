# Claims boundary

This document defines what SchemaShield may and may not claim. Runtime behavior is described only when an identified command produced observable evidence. External submission status is never inferred from local implementation.

## Status vocabulary

- **PENDING** — required work or external evidence does not yet exist.
- **IMPLEMENTED** — code exists, but the current submitted revision has not necessarily been replayed successfully.
- **ATTEMPTED** — a real command ran and its success or failure was recorded.
- **VERIFIED** — a reproducible command completed successfully against identified inputs, with reviewable evidence.

“Verified” is not a synonym for “code exists,” “registered,” “configured,” or “planned.” A new source revision requires a new replay before retaining a runtime claim.

## Verified local DataHub claims

The following statements are supported by [`live-tool-trace.jsonl`](live-tool-trace.jsonl), SHA-256 `53192245b9375b5debf20fe5d4f6084d371af600d1dd3df2923736808f0b7bf9`.

| Claim | Status | Evidence | Narrow scope |
| --- | --- | --- | --- |
| Connection to DataHub OSS quickstart `v1.6.0`, commit `059a36c0b035a6057de00114ccac0ea9003d6bc2` | **VERIFIED** | `datahub.connection_verified` | Local `http://localhost:8080`; no DataHub Cloud or authentication claim |
| Three namespaced DEV datasets were seeded | **VERIFIED** | `seed.synthetic_graph` | DataHub SDK; synthetic `schema_shield` entities only |
| Schema fields `customer_id`, `order_id`, and `order_total` were read | **VERIFIED** | `catalog.reads_verified` | Agent Context Kit `list_schema_fields`; one synthetic dataset |
| Exactly two downstream datasets were observed at one and two hops | **VERIFIED** | `catalog.reads_verified` and `lineage_evidence` | DataHub SDK `lineage.get_lineage`; this is not an Agent Context Kit lineage claim |
| Risk tag writeback returned success | **VERIFIED** | `agent_context.writeback_verified` | Agent Context Kit `add_tags`; tag `urn:li:tag:SchemaShieldRiskHigh` |
| Decision document was saved and its entity returned without error | **VERIFIED** | `agent_context.writeback_verified` | Agent Context Kit `save_document` and `get_entities`; document `urn:li:document:shared-f84db8b1-ee11-461c-9b9a-ff8e700b858b` |

The trace timestamps the successful round trip from `2026-08-03T19:05:50.202889Z` through `2026-08-03T19:05:52.466642Z`. These timestamps describe that run only; they are not a performance benchmark.

## Implemented but independently replayed surfaces

The JavaScript core and live DataHub adapter are separate execution surfaces:

- `cli.mjs` can generate seven offline review artifacts from committed synthetic fixtures.
- `datahub/live_roundtrip.py` exercises the live catalog read/write boundary and records a sanitized trace.

They share the same kind of schema-change scenario, but the current adapter does not automatically pass its live response into the JavaScript generator. Therefore SchemaShield must not claim a single-process, live-catalog-to-generated-PR pipeline until that connection is implemented and replayed.

Every generated offline artifact is labeled `OFFLINE SNAPSHOT — NO LIVE DATAHUB WRITEBACK`. The label must remain visible in screenshots, examples, and demonstrations.

Claims about the final offline revision require a fresh run of:

```powershell
node --test .\tests\core.test.mjs
node .\cli.mjs --fixture .\fixtures\rename_order_total.mjs --out <new-output-directory>
```

The command, fixture hash or source revision, output, and exit code must be retained before claiming a particular rule result, test count, deterministic hash, or artifact content.

## Agent Context Kit and SDK boundary

The verified division of work is:

- **DataHub SDK:** seed synthetic datasets and lineage; query two-hop lineage.
- **Agent Context Kit:** read schema fields; apply the risk tag; save the decision document; retrieve the dataset/document entities after writeback.

Agent Context Kit `get_lineage` is not part of the successful claim. In this local pairing, version `1.6.0.17` did not return lineage that DataHub OSS `v1.6.0` exposed through its SDK/CLI. The adapter therefore uses the SDK for that read. This is a scoped compatibility observation, not proof of a defect in every Agent Context Kit or DataHub version.

## External submission status

| External requirement | Status | What would verify it |
| --- | --- | --- |
| Public Apache-2.0 repository | **VERIFIED** | [github.com/ceodaradigu/schema-shield](https://github.com/ceodaradigu/schema-shield) is public; raw README/LICENSE returned HTTP 200 and GitHub reports SPDX `Apache-2.0` |
| Hosted/testable project | **VERIFIED** | [schema-shield.vercel.app](https://schema-shield.vercel.app/) returned HTTP 200 without credentials; its image returned 200 and its analysis API returned the expected offline `HIGH` result with two impacts and no writeback |
| Public video below three minutes | **PENDING** | YouTube, Vimeo, or Youku URL plus checked encoded duration |
| Final English Devpost description | **IMPLEMENTED** | Local reviewed source is `evidence/devpost-submission-copy.md`; saved Devpost fields still require external verification |
| Devpost project submitted | **PENDING** | Submission confirmation; account registration is insufficient |

No URL should replace `PENDING` until it has been opened and verified. Local DataHub success does not verify hosting, publication, or submission.

## Explicit non-claims

Unless separately implemented and proven, SchemaShield does not claim:

- use of production or private metadata;
- compatibility with DataHub Cloud or remote authenticated deployments;
- use of Agent Context Kit for lineage in the verified run;
- automatic generation of artifacts directly from the live DataHub response;
- automatic creation or update of a real pull request;
- creation of DataHub incidents, assertions, domains, ownership policies, or authorization rules;
- complete detection of breaking schema changes;
- support for every schema operation, schema language, database, or catalog;
- absence of false positives or false negatives;
- formal verification, security guarantees, production readiness, high availability, or scalability;
- correctness or merge-readiness of generated SQL without human review and execution in the target warehouse;
- replacement of migration tests, owners, reviewers, or DataHub governance controls;
- any adoption, accuracy, latency, savings, revenue, or business-impact number.

## Evidence acceptance rules

Accept evidence only when it is attributable to a real run, minimally sufficient, reproducible, and safe to share. Prefer command output, structured trace events, exit codes, source/fixture hashes, package versions, and a server-reported version.

Reject evidence when it is:

- manually rewritten to look successful;
- detached from its command or input;
- an offline mock labeled as live;
- a screenshot without replayable support;
- a historical result silently applied to changed source;
- a registration page presented as a completed submission;
- a local route presented as a public hosted URL;
- or a file containing tokens, private metadata, or personal data.

## Safe judging statement

The current live evidence supports this wording:

> On 2026-08-03, SchemaShield completed a synthetic round trip against a local DataHub OSS v1.6.0 quickstart. Agent Context Kit read three schema fields and returned successful tag/document operations; the DataHub SDK returned exactly two downstream datasets at one and two hops. The sanitized trace has SHA-256 `53192245b9375b5debf20fe5d4f6084d371af600d1dd3df2923736808f0b7bf9`. This verifies that scoped local scenario, not production readiness, DataHub Cloud compatibility, or a single-process live-to-PR pipeline.

For any later result, use this template and fill it only from new evidence:

> In `[identified environment]`, command `[exact command]` evaluated `[identified input]` and produced `[observed result]` with exit code `[code]`. Evidence is `[path/hash/URL]`. This verifies `[narrow claim]`; it does not verify `[adjacent untested claim]`.
