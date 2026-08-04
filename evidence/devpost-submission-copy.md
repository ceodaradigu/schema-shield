# SchemaShield — Devpost submission copy

This file is the reviewed English source copy for the active Devpost draft. Saving it here does not prove that Devpost has received or published it.

## Project name

SchemaShield

## Tagline

An evidence-first DataHub preflight for risky schema changes before they reach production.

## One-line description

SchemaShield turns catalog context into a reviewable risk decision, compatibility artifacts, and an approval-gated DataHub writeback plan before merge.

## Inspiration

A column rename can look harmless in a pull request while breaking models and dashboards one or two hops downstream. Reviewers often have the code diff but not the catalog context, owner-facing explanation, or compatibility plan needed to make a safe decision. SchemaShield explores what that missing pre-merge evidence package can look like.

## What it does

SchemaShield evaluates a proposed schema change against synthetic catalog context and produces a clear risk result plus seven review artifacts: compatibility SQL, a dbt schema patch, an impact report, a pull-request summary, provenance, submission status, and a writeback plan.

The submitted scenario renames `order_total` to `gross_amount`. The public deterministic replay classifies it as `HIGH`, identifies two impacted downstream datasets and one affected query reference, generates compatibility SQL, and keeps writeback disabled.

A separate verified local integration run connects to DataHub OSS v1.6.0. It seeds three namespaced synthetic DEV datasets, reads schema fields through DataHub Agent Context Kit, reads one-hop and two-hop lineage through the DataHub Python SDK, and—only with an explicit approval flag—writes a risk tag and decision document back through Agent Context Kit.

## How we built it

- Next.js and TypeScript power the public interactive replay.
- A deterministic Node.js core evaluates versioned fixtures and generates the seven review artifacts.
- Python connects the qualifying integration path to DataHub OSS.
- DataHub Agent Context Kit performs the schema read and approved tag/document writebacks.
- The DataHub Python SDK seeds the synthetic graph and reads two-hop lineage in the verified local environment.
- Automated Node tests cover the core evaluator and web route.
- Vercel hosts the free public replay; GitHub hosts the Apache-2.0 source and evidence.

The live DataHub adapter and deterministic artifact generator are deliberately documented as separate execution surfaces. We do not claim a single-process live-catalog-to-generated-PR pipeline.

## Challenges

The main technical challenge was preserving an honest evidence boundary. Agent Context Kit v1.6.0.17 successfully handled schema reads and writebacks in the local DataHub OSS v1.6.0 quickstart, while the indexed lineage was available through the DataHub SDK rather than the Agent Context Kit lineage operation in that specific pairing. We recorded that compatibility boundary instead of hiding it or relabeling an offline result as live.

The second challenge was making every outward claim reproducible. Generated offline artifacts carry an `OFFLINE SNAPSHOT — NO LIVE DATAHUB WRITEBACK` label, mutations require `--approve-writeback`, and the successful synthetic round trip is represented by a sanitized, hashed trace.

## Accomplishments

- Completed a synthetic round trip against DataHub OSS v1.6.0.
- Read the three source schema fields through Agent Context Kit.
- Observed exactly two downstream datasets across one and two hops through the DataHub SDK.
- Verified approved Agent Context Kit tag and document writebacks.
- Shipped a free public replay with three deterministic change scenarios.
- Generated seven review artifacts per fixture and refused accidental overwrite unless explicitly forced.
- Published the source under Apache-2.0 with replay instructions and explicit non-claims.

## What we learned

Catalog-aware automation is most useful when it shows its evidence chain and makes mutation an explicit human decision. We also learned that integration boundaries matter as much as the happy path: identifying which operation came from Agent Context Kit and which came from the SDK made the result more trustworthy and easier to reproduce.

## What's next

The next engineering step is to connect the live catalog response directly to the artifact generator, then replay and document that end-to-end path. After that, SchemaShield could add owner routing, warehouse-specific validation of generated SQL, and a pull-request integration while retaining the same approval and evidence gates.

## Built with

DataHub OSS, DataHub Agent Context Kit, DataHub Python SDK, Python, Node.js, TypeScript, React, Next.js, Vercel, and GitHub.

## Links

- Live demo: https://schema-shield.vercel.app/
- Source: https://github.com/ceodaradigu/schema-shield
- Public video: **PENDING**

## Demonstration and AI disclosure

The demonstration uses only synthetic, namespaced data. The hosted replay is deterministic and performs zero live DataHub writebacks. A separate verified local run provides the qualifying DataHub evidence described above.

Video production used AI-assisted visuals and synthetic narration. Product claims were checked against the public source and recorded evidence.
