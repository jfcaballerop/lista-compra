import {
  createSession,
  hasValidSession,
  passwordEqual,
  SESSION_SECONDS,
} from "../infrastructure/security/session";
import { error, json, readJson } from "./http";

export async function login(
  req: Request,
  password: string,
  secret: string,
): Promise<Response> {
  const body = await readJson(req);
  const submitted = typeof body.password === "string" ? body.password : "";
  if (!passwordEqual(submitted, password))
    return error("Contraseña incorrecta.", 401);
  const token = await createSession(secret);
  return json({ authenticated: true }, 200, {
    "set-cookie": `compra_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_SECONDS}`,
  });
}

export async function session(req: Request, secret: string): Promise<Response> {
  return json({ authenticated: await hasValidSession(req, secret) });
}

export function logout(): Response {
  return json({ authenticated: false }, 200, {
    "set-cookie":
      "compra_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
  });
}
