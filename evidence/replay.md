# Replay guide

This guide keeps deterministic artifact generation separate from the qualifying DataHub OSS integration. Run commands from the SchemaShield repository root. A passing offline command does not substitute for a live DataHub run, and a historical trace does not prove that a new revision still works.

The documented platform is Windows PowerShell with a working Docker daemon. Do not claim another operating system has been verified unless it has been replayed there.

## 1. Preflight

```powershell
$root = Resolve-Path .
node --version
python --version
docker version
docker compose version
git status --short --untracked-files=all
Get-ChildItem -Force -LiteralPath $root
```

Record the versions and current Git state. A dirty tree does not automatically invalidate a replay, but the evidence must identify the exact source revision or file hashes used.

All included fixtures and DataHub entities are synthetic. Inspect them before execution and do not substitute private schemas, credentials, or production metadata.

## 2. Install the pinned DataHub dependencies

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r .\requirements.txt
.\.venv\Scripts\python.exe -m pip show acryl-datahub datahub-agent-context
```

The current lock surface is:

- `acryl-datahub==1.6.0.6`
- `datahub-agent-context==1.6.0.17`

Record the actual installed versions rather than copying this list into run evidence.

## 3. Inspect and test the offline core

```powershell
Get-ChildItem -File -Recurse -LiteralPath "$root\fixtures" |
  Sort-Object FullName |
  Select-Object FullName,Length

node --test "$root\tests\core.test.mjs"
$testExit = $LASTEXITCODE
"test_exit_code=$testExit"
if ($testExit -ne 0) { throw "Offline tests failed with exit code $testExit" }
```

The test runner output and exit code from the current revision are the evidence. Do not reuse a passing count from a previous run.

## 4. Generate and inspect the seven offline artifacts

Use a unique ignored output directory so a replay does not overwrite committed examples.

```powershell
$replayOut = Join-Path $root ("evidence\generated\rename-" + [guid]::NewGuid())
node "$root\cli.mjs" `
  --fixture "$root\fixtures\rename_order_total.mjs" `
  --out $replayOut
$cliExit = $LASTEXITCODE
"cli_exit_code=$cliExit"
if ($cliExit -ne 0) { throw "Offline CLI failed with exit code $cliExit" }

Get-ChildItem -File -LiteralPath $replayOut |
  Sort-Object Name |
  Select-Object Name,Length
```

The expected file names are:

1. `compat_view.sql`
2. `dbt_schema.yml`
3. `impact_report.json`
4. `pr_summary.md`
5. `provenance.json`
6. `submission_status.json`
7. `writeback_plan.json`

Inspect every file. Each output is an offline snapshot and is not evidence that DataHub accepted a writeback.

To verify overwrite protection, rerun the same CLI command against `$replayOut` without `--force`. It should refuse with a nonzero exit code and leave the existing files unchanged. Capture hashes before and after if making that claim.

## 5. Start and inspect DataHub OSS

Starting the stack can download images and change local Docker state. Do it only in an authorized environment.

```powershell
$env:PYTHONUTF8 = "1"
.\.venv\Scripts\datahub.exe docker quickstart

Invoke-WebRequest -UseBasicParsing http://localhost:8080/health |
  Select-Object StatusCode,Content
Invoke-RestMethod http://localhost:8080/config |
  ConvertTo-Json -Depth 8
```

Continue only when the DataHub GMS health request succeeds and `/config` identifies the server. The verified reference run used DataHub OSS quickstart `v1.6.0`, commit `059a36c0b035a6057de00114ccac0ea9003d6bc2`.

## 6. Verify the explicit mutation gate

The live adapter must refuse to mutate without `--approve-writeback`.

```powershell
$refusalTrace = Join-Path $root ("evidence\generated\refusal-" + [guid]::NewGuid() + ".jsonl")
.\.venv\Scripts\python.exe .\datahub\live_roundtrip.py `
  --server http://localhost:8080 `
  --trace $refusalTrace
$refusalExit = $LASTEXITCODE
"refusal_exit_code=$refusalExit"
"refusal_trace_created=$(Test-Path -LiteralPath $refusalTrace)"
if ($refusalExit -ne 2) { throw "Expected mutation refusal exit code 2" }
```

The refusal path should not create the trace or apply the tag/document. Record actual behavior; do not conceal a different result.

## 7. Replay the qualifying DataHub + Agent Context Kit path

Review the three synthetic dataset URNs in `datahub/live_roundtrip.py`, then explicitly approve the local writeback:

```powershell
.\.venv\Scripts\python.exe .\datahub\live_roundtrip.py `
  --server http://localhost:8080 `
  --trace .\evidence\live-tool-trace.jsonl `
  --approve-writeback
$liveExit = $LASTEXITCODE
"live_exit_code=$liveExit"
if ($liveExit -ne 0) { throw "Live DataHub replay failed with exit code $liveExit" }

Get-Content -Raw -Encoding utf8 .\evidence\live-tool-trace.jsonl
(Get-FileHash -Algorithm SHA256 .\evidence\live-tool-trace.jsonl).Hash.ToLowerInvariant()
```

The successful reference run recorded:

- Agent Context Kit `list_schema_fields`: `customer_id`, `order_id`, `order_total`;
- DataHub SDK lineage: `order_facts` at hop 1 and `revenue_summary` at hop 2;
- Agent Context Kit `add_tags`, `save_document`, and `get_entities`: success;
- tag `urn:li:tag:SchemaShieldRiskHigh`;
- document `urn:li:document:shared-f84db8b1-ee11-461c-9b9a-ff8e700b858b`;
- trace SHA-256 `53192245b9375b5debf20fe5d4f6084d371af600d1dd3df2923736808f0b7bf9`.

Those are observations from the recorded run, not hard-coded expected values for every future run. In particular, a newly saved document may receive a different URN. A new run supersedes the reference only after its output, exit code, trace, and hash have been reviewed.

### Tool boundary

- DataHub Python SDK seeds the three synthetic entities and lineage edges.
- Agent Context Kit `list_schema_fields` reads the schema.
- DataHub SDK `DataHubClient.lineage.get_lineage` reads two-hop lineage.
- Agent Context Kit `add_tags`, `save_document`, and `get_entities` applies and verifies the writeback.

Agent Context Kit `get_lineage` is not claimed: version `1.6.0.17` did not return the indexed lineage in this local DataHub `v1.6.0` pairing. Do not rewrite the SDK lineage result as an Agent Context Kit lineage result.

## 8. Evidence acceptance checklist

Before publishing evidence, confirm:

- commands ran against the files being submitted;
- source revision or file hashes and all exit codes were captured;
- outputs were not hand-edited into a passing state;
- the trace contains only synthetic URNs and no secret;
- the tool boundary above matches the source and trace;
- failures and skipped steps remain visible;
- every number and URL in the write-up is traceable to an observed result.

## 9. Submission gates

These gates must remain separate. Do not infer one from another.

| Gate | Current status | Required evidence |
| --- | --- | --- |
| `LIVE_DATAHUB_VERIFIED` | **VERIFIED** | `evidence/live-tool-trace.jsonl` plus SHA-256 above |
| `OFFLINE_REVISION_REPLAYED` | **REPLAY ON FINAL REVISION** | Fresh test/CLI output and exit codes |
| `PUBLIC_REPO_VERIFIED` | **VERIFIED** | https://github.com/ceodaradigu/schema-shield; public unauthenticated access and Apache-2.0 recorded in README/claims boundary |
| `HOSTED_DEMO_VERIFIED` | **VERIFIED** | https://schema-shield.vercel.app/; public HTTP 200 and deterministic rename replay recorded |
| `VIDEO_VERIFIED` | **VERIFIED** | https://youtu.be/b--jn9qD5tE opened publicly with the expected title; local encoded duration 156.379362 seconds (2:36.38), H.264/AAC, 1280x720 |
| `DEVPOST_SUBMITTED` | **PENDING** | Submission confirmation, not registration alone |

If a live replay fails, record `LIVE_INTEGRATION_FAILED` with the concrete error. Never relabel an offline result as a live fallback success.
