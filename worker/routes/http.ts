import { ShoppingError } from "../domain/shopping";

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function json(
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
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

export function handleError(cause: unknown): Response {
  if (cause instanceof HttpError) return error(cause.message, cause.status);
  if (cause instanceof ShoppingError) {
    const statuses = { invalid: 400, conflict: 409, "not-found": 404 };
    return error(cause.message, statuses[cause.code]);
  }
  console.error("Error en la API:", cause);
  return error("Error del servidor. Inténtalo de nuevo.", 500);
}
