import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("standalone web package exposes the required Next.js App Router surface", () => {
  for (const path of [
    "../package.json",
    "../next.config.mjs",
    "../app/layout.tsx",
    "../app/page.tsx",
    "../app/SchemaShieldDemo.tsx",
    "../app/api/analyze/route.ts",
    "../public/schema-shield-preview.png",
  ]) {
    assert.equal(existsSync(new URL(path, import.meta.url)), true, `missing ${path}`);
  }

  const packageJson = JSON.parse(read("../package.json"));
  assert.equal(packageJson.dependencies.next, "16.2.6");
  assert.equal(packageJson.scripts.build, "next build");
  assert.ok(root.endsWith("schema-shield\\") || root.endsWith("schema-shield/"));
});

test("hosted claims clearly separate offline replay from verified local evidence", () => {
  const page = read("../app/page.tsx");
  const demo = read("../app/SchemaShieldDemo.tsx");

  assert.match(page, /DataHub OSS v1\.6\.0/);
  assert.match(page, /Agent Context Kit/);
  assert.match(page, /lineage\.get_lineage/);
  assert.match(page, /does not connect to, read from, or mutate a live DataHub instance/);
  assert.match(page, /Every interaction below is a deterministic offline replay/);
  assert.match(demo, /OFFLINE SNAPSHOT \/ ZERO LIVE WRITEBACKS/);
  assert.match(demo, /LIVE BROWSER CONNECTION/);
  assert.match(demo, /fetch\("\/api\/analyze"/);
});

test("analysis route reuses the deterministic core and all three fixtures", () => {
  const route = read("../app/api/analyze/route.ts");
  assert.match(route, /analyzeOffline/);
  assert.match(route, /add_nullable_note\.mjs/);
  assert.match(route, /rename_order_total\.mjs/);
  assert.match(route, /lossy_type_change_ml\.mjs/);
  assert.match(route, /NO LIVE DATAHUB WRITEBACK/);
  assert.match(route, /cache-control/);
});
