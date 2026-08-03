import Image from "next/image";
import SchemaShieldDemo from "./SchemaShieldDemo";
import styles from "./schema-shield.module.css";

export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.wordmark} href="#top" aria-label="SchemaShield home">
          SCHEMA<span>SHIELD</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#proof">Live proof</a>
          <a href="#demo">Run replay</a>
          <span className={styles.headerStatus}>OFFLINE DEMO</span>
        </nav>
      </header>

      <section className={styles.hero} id="top" aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>EVIDENCE-FIRST SCHEMA CHANGE PREFLIGHT</p>
          <h1 id="hero-title">
            Know the blast radius <em>before</em> merge.
          </h1>
          <p className={styles.heroLead}>
            SchemaShield turns catalog context into a reproducible risk decision,
            compatibility artifacts, and an approval-gated writeback plan.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#demo">
              Run an offline replay <span aria-hidden="true">→</span>
            </a>
            <a className={styles.secondaryAction} href="#proof">
              Inspect verified evidence
            </a>
          </div>
          <p className={styles.heroBoundary}>
            This browser experience uses synthetic OFFLINE SNAPSHOT fixtures. It
            does not connect to, read from, or mutate a live DataHub instance.
          </p>
        </div>

        <figure className={styles.heroVisual}>
          <Image
            alt="A protected data catalog connected to schema, analytics, and lineage consumers"
            className={styles.heroImage}
            height={945}
            priority
            sizes="(max-width: 960px) 100vw, 48vw"
            src="/schema-shield-preview.png"
            width={1680}
          />
          <figcaption>
            <span>HOSTED MODE</span>
            <strong>OFFLINE SNAPSHOT</strong>
          </figcaption>
        </figure>
      </section>

      <section className={styles.problemStrip} aria-label="SchemaShield workflow">
        <span>01 / READ CONTEXT</span>
        <i aria-hidden="true">→</i>
        <span>02 / TRACE IMPACT</span>
        <i aria-hidden="true">→</i>
        <span>03 / GENERATE GUARDRAILS</span>
        <i aria-hidden="true">→</i>
        <span>04 / REQUIRE APPROVAL</span>
      </section>

      <section className={styles.proof} id="proof" aria-labelledby="proof-title">
        <div className={styles.proofHeading}>
          <p className={styles.eyebrow}>SEPARATELY VERIFIED LOCAL ROUNDTRIP</p>
          <h2 id="proof-title">The live integration was tested. The browser stays safe.</h2>
          <p>
            A controlled run against local DataHub OSS v1.6.0 seeded three
            synthetic DEV datasets, inspected schema and two-hop lineage, then
            applied and read back a risk tag and decision document.
          </p>
        </div>

        <dl className={styles.proofStats}>
          <div>
            <dt>Schema fields observed</dt>
            <dd>3</dd>
          </div>
          <div>
            <dt>Downstream hops verified</dt>
            <dd>2</dd>
          </div>
          <div>
            <dt>Risk tag</dt>
            <dd>VERIFIED</dd>
          </div>
          <div>
            <dt>Decision document</dt>
            <dd>VERIFIED</dd>
          </div>
        </dl>

        <div className={styles.proofGrid}>
          <article>
            <span>Agent Context Kit / read</span>
            <code>list_schema_fields</code>
            <p>Observed order_id, customer_id, and order_total.</p>
          </article>
          <article>
            <span>DataHub SDK / lineage</span>
            <code>lineage.get_lineage</code>
            <p>Verified one-hop and two-hop downstream dependencies.</p>
          </article>
          <article>
            <span>Agent Context Kit / writeback</span>
            <code>add_tags · save_document · get_entities</code>
            <p>Applied approved synthetic writebacks and read them back.</p>
          </article>
        </div>

        <aside className={styles.proofBoundary}>
          <strong>Claims boundary</strong>
          <p>
            Live evidence came from a separate, approved, local synthetic run.
            Every interaction below is a deterministic offline replay and applies
            zero writebacks.
          </p>
        </aside>
      </section>

      <SchemaShieldDemo />

      <footer className={styles.footer}>
        <span>SCHEMASHIELD / DATAHUB AGENT HACKATHON</span>
        <span>APACHE-2.0</span>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
