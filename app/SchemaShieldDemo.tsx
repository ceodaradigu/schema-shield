"use client";

import { useState } from "react";
import styles from "./schema-shield.module.css";

const CASES = [
  {
    change: "ADD note STRING NULLABLE",
    context: "Orders dataset / no known consumers",
    expectedRisk: "LOW",
    id: "add-nullable-note",
    number: "01",
    title: "Nullable field addition",
  },
  {
    change: "RENAME order_total TO gross_amount",
    context: "Orders dataset / dbt model + dashboard",
    expectedRisk: "HIGH",
    id: "rename-order-total",
    number: "02",
    title: "Revenue field rename",
  },
  {
    change: "CAST fare_amount DECIMAL TO INTEGER",
    context: "Trips dataset / production ML model",
    expectedRisk: "CRITICAL",
    id: "lossy-type-change-ml",
    number: "03",
    title: "Lossy ML feature change",
  },
] as const;

type CaseId = (typeof CASES)[number]["id"];

type Finding = {
  evidence_refs: string[];
  reason: string;
};

type AnalysisResult = {
  caseId: CaseId;
  mode: "offline_snapshot";
  notice: string;
  output: {
    "compat_view.sql": string;
    "impact_report.json": {
      affected_query_ids: string[];
      block_merge: boolean;
      breaking: boolean;
      change_id: string;
      dataset_urn: string;
      findings: Finding[];
      impacted_entities: string[];
      manual_review_required: boolean;
      reasons: string[];
      risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
      run_id: string;
    };
    "writeback_plan.json": {
      actions: Array<{ action: string; applied: false; status: string }>;
      applied: false;
    };
  };
};

function shortUrn(urn: string) {
  const parts = urn.split(",");
  if (parts.length > 1) return parts[1];
  return urn.split(":").at(-1)?.replace(/\)$/, "") ?? urn;
}

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

function decisionLabel(result: AnalysisResult) {
  const report = result.output["impact_report.json"];
  if (report.block_merge) return "BLOCK MERGE";
  if (report.manual_review_required) return "REVIEW REQUIRED";
  return "SAFE TO CONTINUE";
}

export default function SchemaShieldDemo() {
  const [selectedCase, setSelectedCase] = useState<CaseId>("rename-order-total");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  async function analyze() {
    setStatus("loading");
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/analyze", {
        body: JSON.stringify({ caseId: selectedCase }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const payload = (await response.json()) as AnalysisResult | { error?: string };

      if (!response.ok || !("output" in payload)) {
        throw new Error("error" in payload && payload.error ? payload.error : "Analysis failed.");
      }

      setResult(payload);
      setStatus("idle");
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "The offline analysis could not be completed.",
      );
      setStatus("error");
    }
  }

  const report = result?.output["impact_report.json"];

  return (
    <>
      <section className={styles.workspace} id="demo" aria-labelledby="preset-title">
        <div className={styles.sectionHeading}>
          <div>
            <span>01 / OFFLINE INPUT</span>
            <h2 id="preset-title">Choose a replay case.</h2>
          </div>
          <p>
            Each case is a committed synthetic catalog snapshot. The same
            deterministic core used by the command-line replay evaluates it here.
          </p>
        </div>

        <div className={styles.caseGrid}>
          {CASES.map((item) => (
            <button
              aria-pressed={selectedCase === item.id}
              className={`${styles.caseCard} ${selectedCase === item.id ? styles.selected : ""}`}
              key={item.id}
              onClick={() => {
                setSelectedCase(item.id);
                setResult(null);
                setError("");
                setStatus("idle");
              }}
              type="button"
            >
              <span className={styles.caseNumber}>{item.number}</span>
              <span className={styles.caseRisk}>{item.expectedRisk}</span>
              <strong>{item.title}</strong>
              <code>{item.change}</code>
              <small>{item.context}</small>
            </button>
          ))}
        </div>

        <div className={styles.runBar}>
          <div>
            <span className={styles.offlineDot} aria-hidden="true" />
            OFFLINE SNAPSHOT / ZERO LIVE WRITEBACKS
          </div>
          <button
            className={styles.runButton}
            disabled={status === "loading"}
            onClick={analyze}
            type="button"
          >
            {status === "loading" ? "ANALYZING…" : "RUN PREFLIGHT"}
            <span aria-hidden="true">→</span>
          </button>
        </div>

        {status === "error" && (
          <div className={styles.error} role="alert">
            <strong>Analysis stopped.</strong> {error}
          </div>
        )}
      </section>

      <section className={styles.results} aria-labelledby="result-title" aria-live="polite">
        <div className={styles.sectionHeadingDark}>
          <div>
            <span>02 / EVIDENCE-BACKED DECISION</span>
            <h2 id="result-title">Inspect the proof, not a promise.</h2>
          </div>
          <p>
            Risk, evidence references, and generated SQL come from the offline
            core. Nothing shown in this section was read from or written to DataHub.
          </p>
        </div>

        {!report || !result ? (
          <div className={styles.emptyResult}>
            <span>AWAITING OFFLINE REPLAY</span>
            <p>Select a case and run the preflight to reveal its decision and evidence chain.</p>
          </div>
        ) : (
          <div className={styles.resultStack}>
            <article className={styles.verdict}>
              <div className={`${styles.riskBadge} ${styles[`risk${report.risk}`]}`}>
                <span>RISK</span>
                <strong>{report.risk}</strong>
              </div>
              <div className={styles.verdictCopy}>
                <span>{decisionLabel(result)}</span>
                <h3>{report.reasons.map(humanize).join(" / ")}</h3>
                <dl>
                  <div>
                    <dt>Breaking</dt>
                    <dd>{report.breaking ? "Yes" : "No"}</dd>
                  </div>
                  <div>
                    <dt>Impacted assets</dt>
                    <dd>{report.impacted_entities.length}</dd>
                  </div>
                  <div>
                    <dt>Affected queries</dt>
                    <dd>{report.affected_query_ids.length}</dd>
                  </div>
                  <div>
                    <dt>Writebacks applied</dt>
                    <dd>0</dd>
                  </div>
                </dl>
              </div>
            </article>

            <div className={styles.twoColumn}>
              <article className={styles.panel}>
                <div className={styles.panelHeading}>
                  <span>EVIDENCE CHAIN</span>
                  <strong>{report.findings.length} FINDINGS</strong>
                </div>
                <div className={styles.findingList}>
                  {report.findings.map((finding) => (
                    <div key={finding.reason}>
                      <strong>{humanize(finding.reason)}</strong>
                      {finding.evidence_refs.map((reference) => (
                        <code key={reference}>{reference}</code>
                      ))}
                    </div>
                  ))}
                </div>
              </article>

              <article className={styles.panel}>
                <div className={styles.panelHeading}>
                  <span>BLAST RADIUS</span>
                  <strong>{report.impacted_entities.length} ASSETS</strong>
                </div>
                {report.impacted_entities.length ? (
                  <ul className={styles.assetList}>
                    {report.impacted_entities.map((urn) => (
                      <li key={urn}>
                        <strong>{shortUrn(urn)}</strong>
                        <code>{urn}</code>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.noneFound}>No downstream entities in this snapshot.</p>
                )}
                <div className={styles.queryRow}>
                  <span>QUERY REFERENCES</span>
                  <strong>{report.affected_query_ids.join(", ") || "NONE"}</strong>
                </div>
              </article>
            </div>

            <article className={styles.codePanel}>
              <div className={styles.panelHeading}>
                <span>GENERATED COMPATIBILITY SQL</span>
                <strong>compat_view.sql</strong>
              </div>
              <pre>
                <code>{result.output["compat_view.sql"]}</code>
              </pre>
            </article>

            <article className={styles.auditStrip}>
              <div>
                <span>RUN ID</span>
                <code>{report.run_id}</code>
              </div>
              <div>
                <span>MODE</span>
                <strong>OFFLINE SNAPSHOT</strong>
              </div>
              <div>
                <span>LIVE BROWSER CONNECTION</span>
                <strong>NONE</strong>
              </div>
            </article>
          </div>
        )}
      </section>
    </>
  );
}
