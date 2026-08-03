"""Run a synthetic, evidence-producing SchemaShield round trip against DataHub OSS.

The script seeds only namespaced DEV synthetic entities in a local DataHub
quickstart. It reads schema and applies verified writeback through the official
DataHub Agent Context Kit; the DataHub Python SDK performs the multi-hop lineage
read because Agent Context Kit 1.6.0.17 does not return the indexed quickstart
lineage exposed by the matching DataHub server. No token is printed or written
to evidence.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.request import urlopen

warnings.filterwarnings("ignore", message="The new datahub SDK.*")

from datahub.errors import ExperimentalWarning
from datahub.sdk import DataHubClient, Dataset, Tag
from datahub_agent_context.context import DataHubContext
from datahub_agent_context.mcp_tools import (
    add_tags,
    get_entities,
    list_schema_fields,
    save_document,
)

warnings.filterwarnings("ignore", category=ExperimentalWarning)

CHANGE_ID = "SCHEMA-SHIELD-001"
OWNER_ID = "schema-shield-agent"
TAG_NAME = "SchemaShieldRiskHigh"
TAG_URN = f"urn:li:tag:{TAG_NAME}"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True, separators=(",", ":"), sort_keys=True)


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def record(trace: list[dict[str, Any]], event: str, data: dict[str, Any]) -> None:
    trace.append(
        {
            "data": data,
            "event": event,
            "observed_at": utc_now(),
            "ok": True,
        }
    )


def fetch_server_config(server: str) -> dict[str, Any]:
    with urlopen(f"{server.rstrip('/')}/config", timeout=10) as response:
        if response.status != 200:
            raise RuntimeError(f"DataHub config returned HTTP {response.status}")
        return json.loads(response.read().decode("utf-8"))


def build_entities() -> tuple[Dataset, Dataset, Dataset]:
    orders = Dataset(
        platform="postgres",
        name="schema_shield.acme.orders",
        env="DEV",
        display_name="SchemaShield synthetic orders",
        description="Synthetic local-only orders dataset for SchemaShield verification.",
        custom_properties={"schema_shield_synthetic": "true", "change_id": CHANGE_ID},
        owners=[OWNER_ID],
        schema=[
            ("order_id", "VARCHAR", "Synthetic order identifier."),
            ("customer_id", "VARCHAR", "Synthetic customer identifier."),
            ("order_total", "DECIMAL(12,2)", "Current field proposed for rename."),
        ],
    )
    order_facts = Dataset(
        platform="dbt",
        name="schema_shield.analytics.order_facts",
        env="DEV",
        display_name="SchemaShield synthetic order facts",
        description="Synthetic one-hop downstream model.",
        custom_properties={"schema_shield_synthetic": "true"},
        schema=[
            ("order_id", "VARCHAR"),
            ("order_total", "DECIMAL(12,2)"),
        ],
        upstreams=[str(orders.urn)],
    )
    revenue_summary = Dataset(
        platform="dbt",
        name="schema_shield.analytics.revenue_summary",
        env="DEV",
        display_name="SchemaShield synthetic revenue summary",
        description="Synthetic two-hop downstream model.",
        custom_properties={"schema_shield_synthetic": "true"},
        schema=[("order_total", "DECIMAL(12,2)")],
        upstreams=[str(order_facts.urn)],
    )
    return orders, order_facts, revenue_summary


def seed_synthetic_graph(
    client: DataHubClient, trace: list[dict[str, Any]]
) -> tuple[str, list[str]]:
    orders, order_facts, revenue_summary = build_entities()
    for entity in (orders, order_facts, revenue_summary):
        client.entities.upsert(entity)

    # Emit the two edges explicitly as patches as well. Dataset.upstreams is the
    # source-of-truth aspect; add_lineage also refreshes the lineage index used
    # by Agent Context Kit's multi-hop GraphQL query.
    client.lineage.add_lineage(
        upstream=str(orders.urn),
        downstream=str(order_facts.urn),
    )
    client.lineage.add_lineage(
        upstream=str(order_facts.urn),
        downstream=str(revenue_summary.urn),
    )

    root_urn = str(orders.urn)
    downstream_urns = sorted([str(order_facts.urn), str(revenue_summary.urn)])
    record(
        trace,
        "seed.synthetic_graph",
        {
            "entities_upserted": [root_urn, *downstream_urns],
            "mode": "local_synthetic_datahub",
        },
    )
    return root_urn, downstream_urns


def wait_for_catalog_reads(
    client: DataHubClient,
    root_urn: str,
    expected_downstreams: list[str],
    attempts: int,
    delay_seconds: float,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[str], list[str]]:
    last_state: dict[str, Any] = {}
    for _ in range(attempts):
        with DataHubContext(client):
            schema_result = list_schema_fields(root_urn, limit=100)

        lineage_results = client.lineage.get_lineage(
            source_urn=root_urn,
            direction="downstream",
            max_hops=2,
            count=30,
        )

        fields = sorted(
            field.get("fieldPath")
            for field in schema_result.get("fields", [])
            if field.get("fieldPath")
        )
        lineage_evidence = sorted(
            (
                {
                    "direction": result.direction,
                    "hops": result.hops,
                    "urn": str(result.urn),
                }
                for result in lineage_results
            ),
            key=lambda item: (item["hops"], item["urn"]),
        )
        downstreams = sorted({item["urn"] for item in lineage_evidence})
        last_state = {"fields": fields, "downstreams": downstreams}
        if "order_total" in fields and set(expected_downstreams).issubset(downstreams):
            return schema_result, lineage_evidence, fields, downstreams
        time.sleep(delay_seconds)

    raise RuntimeError(
        "Catalog reads did not observe the seeded schema and two-hop lineage: "
        + canonical_json(last_state)
    )


def apply_agent_context_writeback(
    client: DataHubClient,
    root_urn: str,
    fields: list[str],
    downstreams: list[str],
    trace: list[dict[str, Any]],
) -> str:
    tag = Tag(
        name=TAG_NAME,
        display_name="SchemaShield risk: high",
        description="Synthetic local verification tag written by SchemaShield.",
        color="#DC4C3E",
        owners=[OWNER_ID],
    )
    client.entities.upsert(tag)

    document_content = "\n".join(
        [
            f"# {CHANGE_ID}: rename order_total to gross_amount",
            "",
            "SchemaShield inspected the local synthetic DataHub catalog before generating code.",
            f"Observed fields: {', '.join(fields)}.",
            f"Observed downstream assets: {len(downstreams)}.",
            "Decision: require manual review and generate a compatibility alias before merge.",
            "Scope: synthetic local verification only; this is not production metadata.",
        ]
    )

    with DataHubContext(client):
        tag_result = add_tags(tag_urns=[TAG_URN], entity_urns=[root_urn])
        if not tag_result.get("success"):
            raise RuntimeError("Agent Context Kit add_tags failed: " + canonical_json(tag_result))

        document_result = save_document(
            document_type="Decision",
            title=f"SchemaShield decision {CHANGE_ID}",
            content=document_content,
            topics=["schema-change", "compatibility", "synthetic-verification"],
            related_assets=[root_urn],
        )
        if not document_result.get("success") or not document_result.get("urn"):
            raise RuntimeError(
                "Agent Context Kit save_document failed: " + canonical_json(document_result)
            )

        verified_entities = get_entities([root_urn, document_result["urn"]])

    if any(entity.get("error") for entity in verified_entities):
        raise RuntimeError(
            "Agent Context Kit post-writeback verification failed: "
            + canonical_json(verified_entities)
        )

    document_urn = str(document_result["urn"])
    record(
        trace,
        "agent_context.writeback_verified",
        {
            "document_urn": document_urn,
            "entity_urn": root_urn,
            "tag_urn": TAG_URN,
            "tools": ["add_tags", "save_document", "get_entities"],
        },
    )
    return document_urn


def write_trace(path: Path, trace: list[dict[str, Any]]) -> str:
    serialized = "\n".join(canonical_json(item) for item in trace) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(serialized, encoding="utf-8", newline="\n")
    return sha256_text(serialized)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify SchemaShield against a local synthetic DataHub graph."
    )
    parser.add_argument("--server", default="http://localhost:8080")
    parser.add_argument("--trace", type=Path, required=True)
    parser.add_argument(
        "--approve-writeback",
        action="store_true",
        help="Apply the synthetic tag and decision document through Agent Context Kit.",
    )
    parser.add_argument("--attempts", type=int, default=20)
    parser.add_argument("--delay-seconds", type=float, default=1.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    trace: list[dict[str, Any]] = []

    if not args.approve_writeback:
        print(
            "Refusing mutation: pass --approve-writeback to run the synthetic local writeback.",
            file=sys.stderr,
        )
        return 2

    client = DataHubClient(server=args.server)
    client.test_connection()
    server_config = fetch_server_config(args.server)
    version_info = server_config.get("versions", {}).get("acryldata/datahub", {})
    record(
        trace,
        "datahub.connection_verified",
        {
            "agent_context_package": "datahub-agent-context",
            "server": args.server,
            "server_commit": version_info.get("commit"),
            "server_type": server_config.get("datahub", {}).get("serverType"),
            "server_version": version_info.get("version"),
        },
    )

    root_urn, expected_downstreams = seed_synthetic_graph(client, trace)
    schema_result, lineage_evidence, fields, downstreams = wait_for_catalog_reads(
        client,
        root_urn,
        expected_downstreams,
        attempts=args.attempts,
        delay_seconds=args.delay_seconds,
    )
    record(
        trace,
        "catalog.reads_verified",
        {
            "downstream_total": len(lineage_evidence),
            "downstream_urns": downstreams,
            "field_names": fields,
            "lineage_evidence": lineage_evidence,
            "schema_total_fields": schema_result.get("totalFields"),
            "tools": [
                "agent_context.list_schema_fields",
                "datahub_sdk.lineage.get_lineage",
            ],
        },
    )

    document_urn = apply_agent_context_writeback(
        client,
        root_urn,
        fields,
        downstreams,
        trace,
    )
    trace_digest = write_trace(args.trace, trace)

    summary = {
        "datahub_live_verified": True,
        "document_urn": document_urn,
        "downstream_count": len(downstreams),
        "root_urn": root_urn,
        "schema_fields": fields,
        "submission_ready_for_live_gate": True,
        "tag_urn": TAG_URN,
        "trace_path": str(args.trace),
        "trace_sha256": trace_digest,
    }
    print(json.dumps(summary, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
