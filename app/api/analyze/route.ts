import { analyzeOffline } from "../../../core/index.mjs";
import addNullableNote from "../../../fixtures/add_nullable_note.mjs";
import lossyTypeChangeMl from "../../../fixtures/lossy_type_change_ml.mjs";
import renameOrderTotal from "../../../fixtures/rename_order_total.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cases = {
  "add-nullable-note": addNullableNote,
  "lossy-type-change-ml": lossyTypeChangeMl,
  "rename-order-total": renameOrderTotal,
} as const;

type CaseId = keyof typeof cases;

function isCaseId(value: unknown): value is CaseId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(cases, value);
}

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const caseId =
    payload && typeof payload === "object" && "caseId" in payload
      ? payload.caseId
      : undefined;

  if (!isCaseId(caseId)) {
    return Response.json(
      { error: "Unknown caseId.", validCaseIds: Object.keys(cases) },
      { status: 400 },
    );
  }

  try {
    return Response.json(
      {
        caseId,
        mode: "offline_snapshot",
        notice: "OFFLINE SNAPSHOT — NO LIVE DATAHUB WRITEBACK",
        output: analyzeOffline(cases[caseId]),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("SchemaShield offline analysis failed", error);
    return Response.json(
      { error: "The selected offline fixture could not be analyzed." },
      { status: 500 },
    );
  }
}
