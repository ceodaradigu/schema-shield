# SchemaShield

SchemaShield is a schema-change PR guard for data teams. It inspects catalog context before a risky change is merged, explains the blast radius, generates reviewable compatibility artifacts, and can write the decision back to DataHub.

## Use the hosted API

The deterministic schema-risk endpoint is available through [RapidAPI](https://rapidapi.com/kaiasistentedavid/api/schema-change-risk). Start with the free BASIC tier for evaluation, then use a paid plan for higher request volumes. The [OpenAPI definition](https://schema-shield.vercel.app/schema-change-risk.openapi.json) documents the request and response contract.

The submitted scenario is deliberately synthetic: renaming `order_total` to `gross_amount` on a DEV dataset with one-hop and two-hop downstream dependencies. No production catalog data, private metadata, or credentials are included.

## What is implemented

SchemaShield currently has two explicit replay surfaces:

1. **Qualifying DataHub path.** `datahub/live_roundtrip.py` connects to DataHub OSS, seeds three namespaced synthetic DEV datasets, reads schema fields through the official Agent Context Kit, reads two-hop lineage through the DataHub Python SDK, and writes a risk tag plus a decision document back through Agent Context Kit.
2. **Deterministic artifact generator.** `cli.mjs` evaluates versioned offline fixtures and writes exactly seven review artifacts: `compat_view.sql`, `dbt_schema.yml`, `impact_report.json`, `pr_summary.md`, `provenance.json`, `submission_status.json`, and `writeback_plan.json`.

These surfaces exercise the same synthetic change scenario, but they are not yet a single live-catalog-to-artifact process. Offline artifacts are always labeled `OFFLINE SNAPSHOT — NO LIVE DATAHUB WRITEBACK`; they must never be presented as proof of a live DataHub result.

## Verified DataHub integration

A live local round trip completed successfully on 2026-08-03. The sanitized trace is [`evidence/live-tool-trace.jsonl`](evidence/live-tool-trace.jsonl).

| Observation | Verified value |
| --- | --- |
| DataHub server | OSS quickstart `v1.6.0` |
| Server commit | `059a36c0b035a6057de00114ccac0ea9003d6bc2` |
| Schema read | Agent Context Kit `list_schema_fields` returned `customer_id`, `order_id`, and `order_total` |
| Lineage read | DataHub SDK returned `order_facts` at hop 1 and `revenue_summary` at hop 2 |
| Writeback | Agent Context Kit `add_tags`, `save_document`, and `get_entities` completed successfully |
| Risk tag | `urn:li:tag:SchemaShieldRiskHigh` |
| Decision document | `urn:li:document:shared-f84db8b1-ee11-461c-9b9a-ff8e700b858b` |
| Trace SHA-256 | `53192245b9375b5debf20fe5d4f6084d371af600d1dd3df2923736808f0b7bf9` |

The adapter uses Agent Context Kit for the schema read and graph writeback. It uses `DataHubClient.lineage.get_lineage` for lineage because Agent Context Kit `1.6.0.17` did not return the indexed quickstart lineage in this local DataHub `v1.6.0` pairing. This is a scoped compatibility note, not a general claim about other versions or deployments.

## Repository layout

```text
schema-shield/
├── app/                   # standalone Next.js demo and API route
├── core/                  # deterministic offline analysis
├── datahub/               # live synthetic DataHub round-trip adapter
├── evidence/              # trace, replay guide, demo script, claim boundary
├── examples/              # seven generated artifacts for each fixture
├── fixtures/              # versioned synthetic change scenarios
├── public/                # project preview image
├── tests/                 # core and web automated checks
├── cli.mjs                # seven-artifact command-line generator
├── requirements.txt       # pinned DataHub Python dependencies
├── LICENSE                # Apache License 2.0
└── README.md
```

Local environments, downloaded containers, credentials, caches, and ad-hoc outputs are not source evidence and should remain untracked.

## Quick replay

Run these commands from the SchemaShield repository root in PowerShell.

### Offline checks and artifact generation

```powershell
$root = Resolve-Path .
node --version
node --test "$root\tests\core.test.mjs"
node "$root\cli.mjs" `
  --fixture "$root\fixtures\rename_order_total.mjs" `
  --out "$root\examples\rename_order_total"
```

The CLI refuses to overwrite an existing artifact set unless `--force` is passed.

### DataHub OSS + Agent Context Kit round trip

Prerequisites are Python, a working Docker daemon, and a local DataHub OSS quickstart.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r .\requirements.txt
.\.venv\Scripts\datahub.exe docker quickstart
.\.venv\Scripts\python.exe .\datahub\live_roundtrip.py `
  --server http://localhost:8080 `
  --trace .\evidence\live-tool-trace.jsonl `
  --approve-writeback
```

`--approve-writeback` is an explicit mutation gate. The adapter refuses to run the synthetic tag/document writeback without it. The adapter only targets the namespaced entities declared in its source; review them before execution.

See [`evidence/replay.md`](evidence/replay.md) for the complete evidence procedure and [`evidence/claims-boundary.md`](evidence/claims-boundary.md) for allowed and disallowed claims.

## Submission readiness

`PENDING` means that no public URL or completed submission artifact has been verified in this repository.

| Requirement | Status | Evidence or next gate |
| --- | --- | --- |
| Working DataHub OSS + Agent Context Kit integration | **VERIFIED** | Sanitized trace and hash above |
| Public Apache-2.0 repository | **VERIFIED** | [github.com/ceodaradigu/schema-shield](https://github.com/ceodaradigu/schema-shield) is public; unauthenticated checks returned the README and license, and GitHub reports `Apache-2.0` |
| Free, testable project URL | **VERIFIED** | [schema-shield.vercel.app](https://schema-shield.vercel.app/) returned HTTP 200 in an unauthenticated check; its analysis API returned `HIGH`, 2 impacted assets, and `writeback_plan.applied=false` for the rename fixture |
| Public demonstration video under 3 minutes | **PENDING** | Local final `video/schemashield-demo-v1.mp4` is validated at 156.379362 seconds (2:36.38), H.264/AAC, 1280x720; a public YouTube, Vimeo, or Youku URL is still required |
| English project description | **IMPLEMENTED** | Reviewed source copy is in `evidence/devpost-submission-copy.md`; it is not externally verified until saved and reviewed in Devpost |
| Sample generated outputs in `examples/` | **VERIFIED** | Three fixture directories, each containing the seven expected artifacts; overwrite refusal also verified |
| Devpost submission | **PENDING** | Registration is not proof of a submitted project |

Before submission, the public repository must contain all source, assets, and setup instructions; Apache-2.0 must be visible at the top of the repository page; the test surface must remain free and accessible through the judging period; and any starter or pre-existing code used must be disclosed. All submission materials must be in English or include an English translation.

## Official judging map

The five scored criteria are equally weighted. The open-source contribution consideration is a separate bonus.

| Official criterion | SchemaShield evidence to show | Claim boundary |
| --- | --- | --- |
| Use of DataHub | Schema read, two-hop lineage, and verified tag/document writeback | Identify the exact Agent Context Kit and SDK operations; do not imply production data or DataHub Cloud |
| Technical Execution | Reproducible tests, fail-closed CLI behavior, live trace, and explicit mutation approval | Report only observed runs and supported fixture operations |
| Originality | A PR-oriented compatibility decision and generated merge artifacts grounded in catalog context | Do not describe built-in DataHub behavior as original SchemaShield functionality |
| Real-World Usefulness | A concrete column rename with visible downstream blast radius and an owner-facing decision | Do not invent adoption, savings, accuracy, or production-readiness metrics |
| Submission Quality | Concise video, English README, public source, sample outputs, and clear replay steps | Keep every URL and status verifiable |
| Bonus: open-source contribution | A real accepted or reviewable DataHub contribution, if one is made | **PENDING**; do not claim a contribution from project source alone |

Official requirements and criteria are published at [datahub.devpost.com](https://datahub.devpost.com/) and in the [official rules](https://datahub.devpost.com/rules).

## Evidence policy

- Keep planned, attempted, and verified states visibly distinct.
- Record commands, versions, exit codes, and hashes from real runs.
- Commit only synthetic, sanitized evidence.
- Never fabricate latency, coverage, detection counts, DataHub responses, URLs, screenshots, or judge outcomes.
- Treat screenshots as supporting material, not a substitute for replayable checks.

## License

Apache License 2.0. See [`LICENSE`](LICENSE).
