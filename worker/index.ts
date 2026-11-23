/** API privada para una lista personal de compra. Se ejecuta en Cloudflare Workers. */
import { ShoppingService } from "./application/shopping";
import { D1ShoppingRepository } from "./infrastructure/repositories/d1-shopping-repository";
import { hasValidSession } from "./infrastructure/security/session";
import { login, logout, session } from "./routes/auth";
import { error, handleError } from "./routes/http";
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
  APP_PASSWORD: string;
  SESSION_SECRET: string;
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

  if (path === "/api/login" && method === "POST")
    return login(req, env.APP_PASSWORD, env.SESSION_SECRET);
  if (path === "/api/session" && method === "GET")
    return session(req, env.SESSION_SECRET);
  if (path === "/api/logout" && method === "POST") return logout();

  if (!(await hasValidSession(req, env.SESSION_SECRET)))
    return error("Sesión caducada.", 401);

  const shopping = new ShoppingService(new D1ShoppingRepository(env.DB));

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
