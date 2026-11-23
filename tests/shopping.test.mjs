import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createServer } from "vite";
import { getPlatformProxy } from "wrangler";

const password = "test-password";
const secret = "test-session-secret-with-more-than-32-characters";
let directory;
let proxy;
let vite;
let worker;
let env;
let cookie;

async function request(path, { method = "GET", body } = {}) {
  const headers = { cookie };
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await worker.fetch(
    new Request(`https://example.test${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
  return { status: response.status, body: await response.json() };
}

async function add(name) {
  return request("/api/items", { method: "POST", body: { name } });
}

async function purchase(id) {
  return request(`/api/items/${id}`, {
    method: "PATCH",
    body: { purchased: true },
  });
}

async function addPurchasedCopy(key) {
  const result = await env.DB.prepare(
    `INSERT INTO shopping_items (id, product_id, purchased, created_at, purchased_at)
     SELECT ?, id, 1, ?, ? FROM product_catalog WHERE name_key = ?`,
  )
    .bind(crypto.randomUUID(), "2020-01-01", "2020-01-02", key)
    .run();
  assert.equal(result.meta.changes, 1);
}

before(async () => {
  process.env.WRANGLER_SEND_METRICS = "false";
  process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";
  directory = await mkdtemp(join(tmpdir(), "lista-compra-test-"));
  const config = join(directory, "wrangler.json");
  await writeFile(
    config,
    JSON.stringify({
      name: "lista-compra-test",
      compatibility_date: "2026-11-22",
      d1_databases: [
        {
          binding: "DB",
          database_name: "test",
          database_id: "00000000-0000-4000-8000-000000000001",
        },
      ],
    }),
  );
  proxy = await getPlatformProxy({
    configPath: config,
    envFiles: [],
    persist: false,
    remoteBindings: false,
  });
  env = { DB: proxy.env.DB, APP_PASSWORD: password, SESSION_SECRET: secret };
  const schema = await readFile(
    new URL("../migrations/0001_initial.sql", import.meta.url),
    "utf8",
  );
  for (const statement of schema.split(";")) {
    if (statement.trim()) await env.DB.prepare(statement).run();
  }
  vite = await createServer({
    configFile: false,
    logLevel: "error",
    server: { middlewareMode: true },
    appType: "custom",
  });
  worker = (await vite.ssrLoadModule("/worker/index.ts")).default;
  const response = await worker.fetch(
    new Request("https://example.test/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }),
    env,
  );
  assert.equal(response.status, 200);
  cookie = response.headers.get("set-cookie").split(";")[0];
});

after(async () => {
  try {
    await vite?.close();
  } finally {
    try {
      await proxy?.dispose();
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  }
});

beforeEach(async () => {
  await env.DB.prepare("DROP TRIGGER IF EXISTS reject_test_item").run();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM shopping_items"),
    env.DB.prepare("DELETE FROM product_catalog"),
  ]);
});

test("al añadir un producto comprado elimina sus copias y conserva el histórico", async () => {
  const first = await add("Café Molido");
  assert.equal(first.status, 201);
  await purchase(first.body.items[0].id);
  await addPurchasedCopy("cafe molido");
  const other = await add("Pan");
  await purchase(other.body.items.find((item) => item.name === "Pan").id);

  const result = await add("  CAFE   MOLIDO ");
  assert.equal(result.status, 201);
  assert.deepEqual(
    result.body.items.map((item) => [item.name, item.purchased]),
    [["Café Molido", 0], ["Pan", 1]],
  );
  assert.equal(result.body.items[0].purchased_at, null);
  const catalog = await env.DB.prepare(
    "SELECT name, times_added FROM product_catalog WHERE name_key = ?",
  )
    .bind("cafe molido")
    .first();
  assert.deepEqual(catalog, { name: "Café Molido", times_added: 2 });
  const suggestions = await request("/api/suggestions?q=cafe");
  assert.deepEqual(
    suggestions.body.suggestions.map((item) => item.name),
    ["Café Molido"],
  );
});

test("un duplicado pendiente mantiene el error sin alterar los comprados", async () => {
  const first = await add("Leche");
  assert.equal(first.status, 201);
  await addPurchasedCopy("leche");
  const before = await request("/api/items");

  const result = await add("LECHE");
  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { error: "Ese producto ya está en pendientes." });
  assert.deepEqual((await request("/api/items")).body, before.body);
});

test("si falla la inserción se conservan las filas compradas", async () => {
  const first = await add("Arroz");
  await purchase(first.body.items[0].id);
  await env.DB.prepare(
    `CREATE TRIGGER reject_test_item BEFORE INSERT ON shopping_items
     WHEN (SELECT name_key FROM product_catalog WHERE id = NEW.product_id) = 'arroz'
     BEGIN SELECT RAISE(ABORT, 'inserción rechazada'); END`,
  ).run();
  const originalError = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  let result;
  try {
    result = await add("arroz");
  } finally {
    console.error = originalError;
  }
  assert.equal(result.status, 500);
  assert.ok(errors.length > 0);
  const items = await request("/api/items");
  assert.deepEqual(
    items.body.items.map((item) => [item.name, item.purchased]),
    [["Arroz", 1]],
  );
});
