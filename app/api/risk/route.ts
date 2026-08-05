import { analyzeSchemaRisk } from "../../../lib/schema-risk.mjs";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requiredSecret = process.env.RAPIDAPI_PROXY_SECRET;
  if (requiredSecret && request.headers.get("x-rapidapi-proxy-secret") !== requiredSecret) {
    return Response.json({ error: "Request must be sent through the configured API marketplace." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    return Response.json(analyzeSchemaRisk(payload), {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The request could not be analyzed.";
    return Response.json({ error: message }, { status: 400 });
  }
}

