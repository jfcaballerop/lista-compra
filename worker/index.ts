/** API privada para una lista personal de compra. Se ejecuta en Cloudflare Workers. */
import { ShoppingService } from "./application/shopping";
import { D1ShoppingRepository } from "./infrastructure/repositories/d1-shopping-repository";
import { D1UserRepository } from "./infrastructure/repositories/d1-user-repository";
import { sessionUserId } from "./infrastructure/security/session";
import { login, logout, register } from "./routes/auth";
import { error, handleError, json } from "./routes/http";
export { PasswordHasher } from "./infrastructure/security/password";
import {
  addItem,
  clearPurchased,
  deleteItem,
  listItems,
  suggestions,
  updatePurchased,
} from "./routes/shopping";

interface Env {
  DB: D1Database;
  INVITE_CODE?: string;
  SESSION_SECRET: string;
  PASSWORD_HASHER: DurableObjectNamespace;
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method.toUpperCase();

  if (!path.startsWith("/api/")) return error("Ruta desconocida.", 404);
  if (
    !env.SESSION_SECRET ||
    env.SESSION_SECRET.length < 32
  ) {
    return error(
      "Servidor sin configurar. Define SESSION_SECRET.",
      503,
    );
  }
  if (["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    const origin = req.headers.get("origin");
    if (origin && origin !== url.origin)
      return error("Origen no autorizado.", 403);
  }

  if (path === "/api/login" && method === "POST")
    return login(req, env.DB, env.SESSION_SECRET, env.PASSWORD_HASHER);
  if (path === "/api/register" && method === "POST")
    return register(req, env.DB, env.INVITE_CODE, env.SESSION_SECRET, env.PASSWORD_HASHER);
  if (path === "/api/logout" && method === "POST") return logout();

  const userId = await sessionUserId(req, env.SESSION_SECRET);
  const user = userId ? await new D1UserRepository(env.DB).findById(userId) : null;
  if (path === "/api/session" && method === "GET")
    return user ? json({ authenticated: true, username: user.username }) : json({ authenticated: false });
  if (!user)
    return error("Sesión caducada.", 401);

  const shopping = new ShoppingService(new D1ShoppingRepository(env.DB, user.id));

  if (path === "/api/items" && method === "GET") return listItems(shopping);
  if (path === "/api/suggestions" && method === "GET")
    return suggestions(url, shopping);
  if (path === "/api/items" && method === "POST") return addItem(req, shopping);
  if (path === "/api/items/purchased" && method === "DELETE")
    return clearPurchased(shopping);

  const match = path.match(/^\/api\/items\/([0-9a-f-]{36})$/i);
  if (match && method === "PATCH")
    return updatePurchased(req, match[1], shopping);
  if (match && method === "DELETE") return deleteItem(match[1], shopping);

  return error("Ruta o método no permitido.", 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    try {
      return await route(req, env);
    } catch (cause) {
      return handleError(cause);
    }
  },
} satisfies ExportedHandler<Env>;
