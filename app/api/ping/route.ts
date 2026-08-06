export function GET() {
  return Response.json(
    { status: "ok", service: "schema-change-risk" },
    { headers: { "cache-control": "no-store" } },
  );
}
