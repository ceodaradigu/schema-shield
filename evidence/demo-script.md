# Demo script

This is a recording and rehearsal guide, not evidence by itself. The final public video must be **less than three minutes** and show the project functioning. Target 2:40–2:45 so titles, transitions, or upload processing cannot push the video over the limit.

Prepare the local DataHub quickstart before recording. Do not spend video time downloading images or starting Docker. Show only synthetic SchemaShield entities and sanitized output.

## Target duration: 2:45

### 0:00–0:20 — Problem

Show the proposed `order_total` to `gross_amount` rename.

> A column rename can look harmless in a pull request while breaking models and dashboards two hops away. SchemaShield turns DataHub context into a reviewable risk decision and compatibility artifacts before merge.

State that the scenario is synthetic and namespaced under `schema_shield`.

### 0:20–0:40 — Architecture and trust boundary

Show one compact architecture view or the relevant README section.

> The live path uses DataHub OSS. Agent Context Kit reads the schema and writes the decision back. The DataHub SDK reads two-hop lineage because Agent Context Kit 1.6.0.17 did not expose the indexed lineage in this local 1.6.0 pairing. The offline generator is separately labeled and cannot impersonate a live result.

Do not claim that the current adapter feeds the live response directly into the JavaScript artifact generator; the two replay surfaces currently share a synthetic scenario but run separately.

### 0:40–1:20 — Live DataHub round trip

With DataHub already running, execute the approved synthetic round trip from the SchemaShield repository root:

```powershell
.\.venv\Scripts\python.exe .\datahub\live_roundtrip.py `
  --server http://localhost:8080 `
  --trace .\evidence\live-tool-trace.jsonl `
  --approve-writeback
```

Narrate only the observed output:

- DataHub OSS `v1.6.0`, commit `059a36c0b035a6057de00114ccac0ea9003d6bc2`;
- schema fields `customer_id`, `order_id`, and `order_total` from Agent Context Kit `list_schema_fields`;
- `order_facts` at hop 1 and `revenue_summary` at hop 2 from the DataHub SDK lineage read;
- successful Agent Context Kit tag/document writeback and verification.

If this rehearsal does not reproduce those observations, stop calling the run verified and show the actual failure.

### 1:20–1:55 — Generate merge-review artifacts

Run the deterministic fixture through the CLI:

```powershell
node .\cli.mjs `
  --fixture .\fixtures\rename_order_total.mjs `
  --out .\examples\rename_order_total `
  --force
```

Open only the most legible outputs:

- `impact_report.json` for risk and downstream impact;
- `compat_view.sql` for the compatibility alias;
- `dbt_schema.yml` or `pr_summary.md` for the proposed review artifact.

Keep the `OFFLINE SNAPSHOT — NO LIVE DATAHUB WRITEBACK` label visible and call this a deterministic artifact-generation replay, not a second live catalog read.

### 1:55–2:25 — Verify graph writeback

Show the synthetic `orders` dataset in DataHub and the recorded result. Point out:

- tag `SchemaShieldRiskHigh`;
- decision document `urn:li:document:shared-f84db8b1-ee11-461c-9b9a-ff8e700b858b`;
- trace SHA-256 `53192245b9375b5debf20fe5d4f6084d371af600d1dd3df2923736808f0b7bf9`.

The trace records `add_tags`, `save_document`, and `get_entities`. Do not claim an incident, assertion, domain, or production writeback.

### 2:25–2:40 — Limits and replay

> This verifies one synthetic local DataHub scenario. It does not prove complete schema coverage, production readiness, or DataHub Cloud compatibility. The public repository contains the replay steps and evidence boundary.

Only say “public repository” or show a hosted URL after those URLs have been verified. Until then, their status is `PENDING`.

### 2:40–2:45 — Close

> SchemaShield gives reviewers the context, compatibility plan, and catalog decision they need before a risky rename is merged.

## Recording checklist

- Keep final encoded duration below `00:03:00`; target no more than `00:02:45`.
- Include real terminal or application footage, not slides alone.
- Do not show tokens, personal data, private repositories, browser credentials, or unrelated containers.
- Use no third-party trademarks, music, or copyrighted material without permission.
- Upload publicly to YouTube, Vimeo, or Youku only after the final video has been reviewed.

## Rehearsal record

Fill every field from a real rehearsal. Leave unverified external items as `PENDING`.

- Rehearsal date/time: 2026-08-04 (Europe/Madrid)
- Encoded duration: 156.379362 seconds (2:36.38)
- Commit or source-file hashes: final MP4 SHA-256 `B9604B715244BA220591BF2917E6E8D7941E0CEE22A0683B9A8322061DE07954`
- Node and Python versions:
- Docker version:
- DataHub server version and commit:
- `acryl-datahub` and `datahub-agent-context` versions:
- Test command and exit code:
- CLI command and exit code:
- Live adapter command and exit code:
- Fixture shown: `rename_order_total` / public replay label `Revenue field rename`
- Observed findings: `HIGH`; breaking `Yes`; two impacted assets; one affected query reference; zero writebacks applied; compatibility SQL displayed
- Trace path and SHA-256:
- Public repository URL: **VERIFIED** — https://github.com/ceodaradigu/schema-shield
- Hosted/test URL: **VERIFIED** — https://schema-shield.vercel.app/
- Public video URL: **PENDING**
- Devpost submission status: **DRAFT** — 3/5 steps recorded; no final submission claim
- Known limitations: public replay is an offline deterministic demo; the live DataHub adapter and artifact generator are separate execution surfaces; no production-readiness or DataHub Cloud claim; publication URL remains pending
