import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { createServer } from "vite";
import { getPlatformProxy } from "wrangler";

const password = "test-password-123";
const invitation = "test-invitation-code";
const secret = "test-session-secret-with-more-than-32-characters";
let directory;
let proxy;
let vite;
let worker;
let env;
let cookie;
let userId;
let migrated;

async function request(path, { method = "GET", body, sessionCookie = cookie } = {}) {
  const headers = {};
  if (sessionCookie) headers.cookie = sessionCookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await worker.fetch(
    new Request(`https://example.test${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
  );
  return { status: response.status, body: await response.json(), cookie: response.headers.get("set-cookie")?.split(";")[0] };
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
    `INSERT INTO user_shopping_items (id, user_id, product_id, purchased, created_at, purchased_at)
     SELECT ?, user_id, id, 1, ?, ? FROM user_product_catalog WHERE user_id = ? AND name_key = ?`,
  )
    .bind(crypto.randomUUID(), "2020-01-01", "2020-01-02", userId, key)
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
  env = { DB: proxy.env.DB, INVITE_CODE: invitation, SESSION_SECRET: secret };
  for (const migration of ["0001_initial.sql", "0002_users.sql"]) {
    const schema = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
    for (const statement of schema.split(";")) {
      if (statement.trim()) await env.DB.prepare(statement).run();
    }
  }
  await env.DB.prepare("INSERT INTO product_catalog VALUES (?, ?, ?, 3, ?)")
    .bind("00000000-0000-4000-8000-000000000001", "Legado", "legado", "2020-01-01").run();
  await env.DB.prepare("INSERT INTO shopping_items VALUES (?, ?, 0, ?, NULL)")
    .bind("00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000001", "2020-01-01").run();
  vite = await createServer({
    configFile: false,
    logLevel: "error",
    server: { middlewareMode: true },
    appType: "custom",
  });
  worker = (await vite.ssrLoadModule("/worker/index.ts")).default;
  const { PasswordHasher } = await vite.ssrLoadModule("/worker/infrastructure/security/password.ts");
  env.PASSWORD_HASHER = {
    idFromName: () => "test",
    get: () => ({
      fetch: (url, options) => new PasswordHasher().fetch(new Request(url, options)),
    }),
  };
  const response = await worker.fetch(
    new Request("https://example.test/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "primero", password, invitation }),
    }),
    env,
  );
  assert.equal(response.status, 200);
  cookie = response.headers.get("set-cookie").split(";")[0];
  userId = (await env.DB.prepare("SELECT id FROM users WHERE username_key='primero'").first()).id;
  migrated = await request("/api/items");
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
    env.DB.prepare("DELETE FROM user_shopping_items"),
    env.DB.prepare("DELETE FROM user_product_catalog"),
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
    "SELECT name, times_added FROM user_product_catalog WHERE user_id = ? AND name_key = ?",
  )
    .bind(userId, "cafe molido")
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
    `CREATE TRIGGER reject_test_item BEFORE INSERT ON user_shopping_items
     WHEN (SELECT name_key FROM user_product_catalog WHERE id = NEW.product_id) = 'arroz'
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

test("la primera cuenta recibe los datos existentes y las siguientes no", async () => {
  assert.deepEqual(migrated.body.items.map((item) => item.name), ["Legado"]);
  const second = await request("/api/register", {
    method: "POST", sessionCookie: "", body: { username: "segundo", password, invitation },
  });
  assert.equal(second.status, 200);
  assert.deepEqual((await request("/api/items", { sessionCookie: second.cookie })).body.items, []);
  const legacy = await env.DB.prepare("SELECT name FROM product_catalog").first();
  assert.equal(legacy.name, "Legado");
});

test("las cuentas no pueden consultar, modificar ni eliminar datos ajenos", async () => {
  const second = await request("/api/register", {
    method: "POST", sessionCookie: "", body: { username: "otra", password, invitation },
  });
  assert.equal(second.status, 200);
  const firstItem = await add("Leche");
  const id = firstItem.body.items[0].id;
  assert.deepEqual((await request("/api/items", { sessionCookie: second.cookie })).body.items, []);
  assert.deepEqual((await request("/api/suggestions?q=lec", { sessionCookie: second.cookie })).body.suggestions, []);
  assert.equal((await request(`/api/items/${id}`, { method: "PATCH", body: { purchased: true }, sessionCookie: second.cookie })).status, 404);
  assert.equal((await request(`/api/items/${id}`, { method: "DELETE", sessionCookie: second.cookie })).status, 404);
  assert.equal((await request("/api/items", { method: "POST", body: { name: "Leche" }, sessionCookie: second.cookie })).status, 201);
  await purchase(id);
  await request("/api/items/purchased", { method: "DELETE", sessionCookie: second.cookie });
  assert.equal((await request("/api/items", { sessionCookie: cookie })).body.items[0].purchased, 1);
});

test("el registro exige invitación y el acceso exige contraseña individual", async () => {
  assert.equal((await request("/api/register", { method: "POST", sessionCookie: "", body: { username: "nuevo", password, invitation: "incorrecta" } })).status, 401);
  assert.equal((await request("/api/register", { method: "POST", sessionCookie: "", body: { username: "PRIMERO", password, invitation } })).status, 409);
  assert.equal((await request("/api/login", { method: "POST", sessionCookie: "", body: { username: "primero", password: "incorrecta" } })).status, 401);
  const login = await request("/api/login", { method: "POST", sessionCookie: "", body: { username: "PRIMERO", password } });
  assert.equal(login.status, 200);
  assert.equal((await request("/api/session", { sessionCookie: login.cookie })).body.username, "primero");
  assert.equal((await request("/api/items", { sessionCookie: "compra_session=v1.4102444800.fake" })).status, 401);
  const forged = login.cookie.replace(userId, "00000000-0000-4000-8000-000000000001");
  assert.equal((await request("/api/items", { sessionCookie: forged })).status, 401);
});

test("el traslado inicial y el registro se revierten juntos si ocurre un error", async () => {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM legacy_list_claim"),
    env.DB.prepare("DELETE FROM users"),
  ]);
  await env.DB.prepare(
    `CREATE TRIGGER reject_test_item BEFORE INSERT ON user_product_catalog
     BEGIN SELECT RAISE(ABORT, 'copia rechazada'); END`,
  ).run();
  const originalError = console.error;
  console.error = () => {};
  try {
    const result = await request("/api/register", {
      method: "POST", sessionCookie: "", body: { username: "fallido", password, invitation },
    });
    assert.equal(result.status, 500);
  } finally {
    console.error = originalError;
  }
  assert.equal(await env.DB.prepare("SELECT id FROM users WHERE username_key='fallido'").first(), null);
  assert.equal(await env.DB.prepare("SELECT id FROM legacy_list_claim").first(), null);
  assert.equal((await env.DB.prepare("SELECT name FROM product_catalog").first()).name, "Legado");
});

test("dos registros simultáneos entregan el histórico a una sola cuenta", async () => {
  const [first, second] = await Promise.all(["concurrente1", "concurrente2"].map((username) =>
    request("/api/register", { method: "POST", sessionCookie: "", body: { username, password, invitation } }),
  ));
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const lists = await Promise.all([first, second].map((user) =>
    request("/api/items", { sessionCookie: user.cookie }),
  ));
  assert.deepEqual(lists.map((result) => result.body.items.length).sort(), [0, 1]);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS count FROM legacy_list_claim").first()).count, 1);
});
