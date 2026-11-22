/** API privada para una lista personal de compra. Se ejecuta en Cloudflare Workers. */
interface Env {
  DB: D1Database;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
}

type Item = {
  id: string;
  name: string;
  purchased: number;
  created_at: string;
  purchased_at: string | null;
};
type Suggestion = { id: string; name: string };

const SESSION_SECONDS = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function normalise(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

function passwordEqual(candidate: string, actual: string): boolean {
  // Compara hashes de longitud fija en lugar de cortar en la primera diferencia.
  // Para un uso personal; para control avanzado de acceso, usar Cloudflare Access.
  if (!candidate || !actual) return false;
  const a = encoder.encode(candidate);
  const b = encoder.encode(actual);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return mismatch === 0;
}

function toB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function createSession(secret: string): Promise<string> {
  const expiration = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `v1.${expiration}`;
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    encoder.encode(payload),
  );
  return `${payload}.${toB64Url(new Uint8Array(signature))}`;
}

async function hasValidSession(req: Request, secret: string): Promise<boolean> {
  const value = req.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("compra_session="))
    ?.slice("compra_session=".length);
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "v1" || !/^\d{10,12}$/.test(parts[1]))
    return false;
  const expiration = Number(parts[1]);
  if (!Number.isSafeInteger(expiration) || expiration <= Date.now() / 1000)
    return false;
  try {
    const signature = new Uint8Array(fromB64Url(parts[2])).buffer;
    return await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      signature,
      encoder.encode(`v1.${parts[1]}`),
    );
  } catch {
    return false;
  }
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (
    !req.headers.get("content-type")?.toLowerCase().includes("application/json")
  ) {
    throw new HttpError("Se esperaba JSON.", 415);
  }
  if (Number(req.headers.get("content-length") || 0) > 2048)
    throw new HttpError("Solicitud demasiado grande.", 413);
  const raw = await req.text();
  if (raw.length > 2048)
    throw new HttpError("Solicitud demasiado grande.", 413);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      throw new Error("body");
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError("JSON inválido.", 400);
  }
}

class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getItems(db: D1Database): Promise<Item[]> {
  const { results } = await db
    .prepare(
      `
    SELECT i.id, p.name, i.purchased, i.created_at, i.purchased_at
    FROM shopping_items i JOIN product_catalog p ON p.id = i.product_id
    ORDER BY i.purchased ASC, i.created_at DESC
    LIMIT 1000
  `,
    )
    .all<Item>();
  return results;
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method.toUpperCase();

  if (!path.startsWith("/api/")) return error("Ruta desconocida.", 404);
  if (
    !env.APP_PASSWORD ||
    !env.SESSION_SECRET ||
    env.SESSION_SECRET.length < 32
  ) {
    return error(
      "Servidor sin configurar. Define APP_PASSWORD y SESSION_SECRET.",
      503,
    );
  }
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin)
      return error("Origen no autorizado.", 403);
  }

  if (path === "/api/login" && method === "POST") {
    const body = await readJson(req);
    const submitted = typeof body.password === "string" ? body.password : "";
    if (!passwordEqual(submitted, env.APP_PASSWORD))
      return error("Contraseña incorrecta.", 401);
    const token = await createSession(env.SESSION_SECRET);
    return json({ authenticated: true }, 200, {
      "set-cookie": `compra_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`,
    });
  }
  if (path === "/api/session" && method === "GET") {
    return json({
      authenticated: await hasValidSession(req, env.SESSION_SECRET),
    });
  }
  if (path === "/api/logout" && method === "POST") {
    return json({ authenticated: false }, 200, {
      "set-cookie":
        "compra_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
    });
  }

  if (!(await hasValidSession(req, env.SESSION_SECRET)))
    return error("Sesión caducada.", 401);

  if (path === "/api/items" && method === "GET")
    return json({ items: await getItems(env.DB) });

  if (path === "/api/suggestions" && method === "GET") {
    const original = url.searchParams.get("q") || "";
    const prefix = normalise(original);
    if (prefix.length < 3) return json({ suggestions: [] });
    if (prefix.length > 80) return error("Búsqueda demasiado larga.");
    const escaped = prefix.replace(/[!%_]/g, "!$&") + "%";
    const { results } = await env.DB.prepare(
      `
      SELECT id, name FROM product_catalog
      WHERE name_key LIKE ? ESCAPE '!'
      ORDER BY times_added DESC, last_added_at DESC
      LIMIT 8
    `,
    )
      .bind(escaped)
      .all<Suggestion>();
    return json({ suggestions: results });
  }

  if (path === "/api/items" && method === "POST") {
    const body = await readJson(req);
    if (typeof body.name !== "string")
      return error("Introduce el nombre del producto.");
    const name = body.name.trim().replace(/\s+/g, " ");
    const key = normalise(name);
    if (name.length < 1 || name.length > 80 || key.length === 0)
      return error("El nombre debe tener de 1 a 80 caracteres.");

    // Un mismo producto no puede estar dos veces entre los pendientes.
    const duplicate = await env.DB.prepare(
      `
      SELECT i.id FROM shopping_items i
      JOIN product_catalog p ON p.id=i.product_id
      WHERE p.name_key=? AND i.purchased=0 LIMIT 1
    `,
    )
      .bind(key)
      .first<{ id: string }>();
    if (duplicate) return error("Ese producto ya está en pendientes.", 409);

    const timestamp = new Date().toISOString();
    const product = await env.DB.prepare(
      `
      INSERT INTO product_catalog (id,name,name_key,times_added,last_added_at)
      VALUES (?,?,?,1,?)
      ON CONFLICT(name_key) DO UPDATE SET
        times_added=times_added+1, last_added_at=excluded.last_added_at
      RETURNING id
    `,
    )
      .bind(crypto.randomUUID(), name, key, timestamp)
      .first<{ id: string }>();
    if (!product) throw new Error("No se pudo recuperar el producto.");
    await env.DB.prepare(
      `
      INSERT INTO shopping_items(id,product_id,purchased,created_at,purchased_at)
      VALUES (?,?,0,?,NULL)
    `,
    )
      .bind(crypto.randomUUID(), product.id, timestamp)
      .run();
    return json({ items: await getItems(env.DB) }, 201);
  }

  if (path === "/api/items/purchased" && method === "DELETE") {
    await env.DB.prepare("DELETE FROM shopping_items WHERE purchased=1").run();
    return json({ items: await getItems(env.DB) });
  }

  const match = path.match(/^\/api\/items\/([0-9a-f-]{36})$/i);
  if (match && method === "PATCH") {
    const body = await readJson(req);
    if (typeof body.purchased !== "boolean")
      return error("Debes indicar purchased: true o false.");
    const timestamp = body.purchased ? new Date().toISOString() : null;
    const result = await env.DB.prepare(
      `
      UPDATE shopping_items SET purchased=?, purchased_at=? WHERE id=?
    `,
    )
      .bind(body.purchased ? 1 : 0, timestamp, match[1])
      .run();
    if (!result.meta.changes) return error("Producto no encontrado.", 404);
    return json({ items: await getItems(env.DB) });
  }
  if (match && method === "DELETE") {
    const result = await env.DB.prepare("DELETE FROM shopping_items WHERE id=?")
      .bind(match[1])
      .run();
    if (!result.meta.changes) return error("Producto no encontrado.", 404);
    return json({ items: await getItems(env.DB) });
  }
  return error("Ruta o método no permitido.", 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (e) {
      if (e instanceof HttpError) return error(e.message, e.status);
      console.error("Error en la API:", e);
      return error("Error del servidor. Inténtalo de nuevo.", 500);
    }
  },
} satisfies ExportedHandler<Env>;
